#!/usr/bin/env python3
import base64
import cgi
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import urllib.parse
import urllib.request
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "reporter.sqlite3"
SESSION_TTL = 60 * 60 * 12
DEFAULT_STATUSES = ["open", "fixed", "closed but not fixed", "not doing"]
DEFAULT_REPORTERS = ["Habib"]
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"


def load_env():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
DEFAULT_PASSWORD = os.environ.get("REPORTER_ADMIN_PASSWORD", "admin")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS issues (
              id INTEGER PRIMARY KEY,
              title TEXT NOT NULL,
              reporter TEXT,
              status TEXT NOT NULL,
              description TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS statuses (
              name TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS reporters (
              name TEXT PRIMARY KEY
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash TEXT PRIMARY KEY,
              expires_at INTEGER NOT NULL
            );
            """
        )
        for status in DEFAULT_STATUSES:
            conn.execute("INSERT OR IGNORE INTO statuses(name) VALUES (?)", (status,))
        for reporter in DEFAULT_REPORTERS:
            conn.execute("INSERT OR IGNORE INTO reporters(name) VALUES (?)", (reporter,))
        if not get_setting(conn, "password_hash"):
            set_password(conn, DEFAULT_PASSWORD)
        if not get_setting(conn, "session_secret"):
            put_setting(conn, "session_secret", secrets.token_urlsafe(32))
        if not get_setting(conn, "cloud_storage"):
            put_setting(
                conn,
                "cloud_storage",
                json.dumps(
                    {
                        "provider": "local",
                        "megaEmail": "",
                        "megaFolder": "/Reporter Assets",
                        "driveClientId": "",
                        "driveFolderId": "",
                    }
                ),
            )


def get_setting(conn, key):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else ""


def put_setting(conn, key, value):
    conn.execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def password_hash(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 250_000)
    return base64.b64encode(salt).decode() + ":" + base64.b64encode(digest).decode()


def set_password(conn, password):
    put_setting(conn, "password_hash", password_hash(password))


def check_password(conn, password):
    stored = get_setting(conn, "password_hash")
    if ":" not in stored:
        return False
    salt_b64, digest_b64 = stored.split(":", 1)
    salt = base64.b64decode(salt_b64)
    expected = base64.b64decode(digest_b64)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 250_000)
    return hmac.compare_digest(expected, actual)


def issue_from_row(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "reporter": row["reporter"] or "",
        "status": row["status"],
        "description": row["description"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def upsert_issue(conn, issue):
    conn.execute(
        """
        INSERT INTO issues(id, title, reporter, status, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          reporter = excluded.reporter,
          status = excluded.status,
          description = excluded.description,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
        """,
        (
            int(issue["id"]),
            issue["title"],
            issue.get("reporter", ""),
            issue.get("status", "open"),
            issue.get("description", ""),
            issue.get("createdAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
            issue.get("updatedAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        ),
    )


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
    }

    def translate_path(self, path):
        path = urllib.parse.urlparse(path).path
        if path == "/":
            return str(ROOT / "index.html")
        return str(ROOT / path.lstrip("/"))

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api("GET")
            return
        if self.path.startswith("/auth/google/start"):
            self.google_start()
            return
        if self.path.startswith("/auth/google/callback"):
            self.google_callback()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.handle_api("POST")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.handle_api("PUT")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.handle_api("DELETE")
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode())

    def json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, method):
        path = urllib.parse.urlparse(self.path).path
        try:
            if path == "/api/bootstrap" and method == "GET":
                return self.api_bootstrap()
            if path == "/api/issues" and method == "GET":
                return self.api_issues()
            if path == "/api/issues/bulk" and method == "POST":
                return self.api_bulk_issues()
            if path == "/api/statuses" and method == "POST":
                return self.api_named_list("statuses")
            if path == "/api/reporters" and method == "POST":
                return self.api_named_list("reporters")
            if path == "/api/settings/login" and method == "POST":
                return self.api_login()
            if path == "/api/settings/cloud-storage" and method == "POST":
                self.require_session()
                return self.api_cloud_storage()
            if path == "/api/settings/password" and method == "POST":
                self.require_session()
                return self.api_password()
            if path == "/api/drive/upload" and method == "POST":
                return self.api_drive_upload()
            if path == "/api/drive/status" and method == "GET":
                return self.api_drive_status()
            self.send_error(HTTPStatus.NOT_FOUND)
        except PermissionError:
            self.json({"error": "Unauthorized"}, 401)
        except Exception as exc:
            self.json({"error": str(exc)}, 500)

    def api_bootstrap(self):
        with db() as conn:
            issues = [issue_from_row(row) for row in conn.execute("SELECT * FROM issues ORDER BY id DESC")]
            statuses = [row["name"] for row in conn.execute("SELECT name FROM statuses ORDER BY name")]
            reporters = [row["name"] for row in conn.execute("SELECT name FROM reporters ORDER BY name")]
            cloud = json.loads(get_setting(conn, "cloud_storage") or "{}")
        self.json({"issues": issues, "statuses": statuses, "reporters": reporters, "cloudStorage": public_cloud(cloud)})

    def api_issues(self):
        with db() as conn:
            issues = [issue_from_row(row) for row in conn.execute("SELECT * FROM issues ORDER BY id DESC")]
        self.json({"issues": issues})

    def api_bulk_issues(self):
        payload = self.read_json()
        with db() as conn:
            for issue in payload.get("issues", []):
                upsert_issue(conn, issue)
        self.json({"ok": True})

    def api_named_list(self, table):
        payload = self.read_json()
        names = payload.get("items", [])
        with db() as conn:
            conn.execute(f"DELETE FROM {table}")
            for name in names:
                conn.execute(f"INSERT OR IGNORE INTO {table}(name) VALUES (?)", (str(name),))
        self.json({"ok": True})

    def api_login(self):
        payload = self.read_json()
        with db() as conn:
            if not check_password(conn, payload.get("password", "")):
                return self.json({"error": "Invalid password"}, 401)
            raw = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw.encode()).hexdigest()
            expires = int(time.time() + SESSION_TTL)
            conn.execute("INSERT INTO sessions(token_hash, expires_at) VALUES (?, ?)", (token_hash, expires))
            secret = get_setting(conn, "session_secret")
        signed = sign_token(raw, secret)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Set-Cookie", f"reporter_session={signed}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL}")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def api_cloud_storage(self):
        payload = self.read_json()
        with db() as conn:
            put_setting(conn, "cloud_storage", json.dumps(payload))
        self.json({"ok": True, "cloudStorage": public_cloud(payload)})

    def api_password(self):
        payload = self.read_json()
        with db() as conn:
            if not check_password(conn, payload.get("currentPassword", "")):
                return self.json({"error": "Invalid current password"}, 401)
            set_password(conn, payload["newPassword"])
        self.json({"ok": True})

    def require_session(self):
        cookies = self.headers.get("Cookie", "")
        token = ""
        for part in cookies.split(";"):
            part = part.strip()
            if part.startswith("reporter_session="):
                token = urllib.parse.unquote(part.split("=", 1)[1])
        with db() as conn:
            secret = get_setting(conn, "session_secret")
            raw = unsign_token(token, secret)
            if not raw:
                raise PermissionError()
            token_hash = hashlib.sha256(raw.encode()).hexdigest()
            row = conn.execute("SELECT expires_at FROM sessions WHERE token_hash = ?", (token_hash,)).fetchone()
            if not row or row["expires_at"] < int(time.time()):
                raise PermissionError()

    def google_start(self):
        with db() as conn:
            cloud = json.loads(get_setting(conn, "cloud_storage") or "{}")
        client_id = cloud.get("driveClientId") or os.environ.get("GOOGLE_CLIENT_ID", "")
        redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback")
        if not client_id:
            self.send_error(400, "Missing Google client ID")
            return
        params = urllib.parse.urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": DRIVE_SCOPE,
                "access_type": "offline",
                "prompt": "consent",
            }
        )
        self.send_response(302)
        self.send_header("Location", f"https://accounts.google.com/o/oauth2/v2/auth?{params}")
        self.end_headers()

    def google_callback(self):
        parsed = urllib.parse.urlparse(self.path)
        code = urllib.parse.parse_qs(parsed.query).get("code", [""])[0]
        if not code:
            self.send_error(400, "Missing code")
            return
        with db() as conn:
            cloud = json.loads(get_setting(conn, "cloud_storage") or "{}")
            client_id = cloud.get("driveClientId") or os.environ.get("GOOGLE_CLIENT_ID", "")
            client_secret = cloud.get("driveClientSecret") or os.environ.get("GOOGLE_CLIENT_SECRET", "")
        redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://127.0.0.1:8000/auth/google/callback")
        if not client_id or not client_secret:
            self.send_error(400, "Missing Google client ID/secret")
            return
        data = urllib.parse.urlencode(
            {
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            }
        ).encode()
        req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req) as response:
            token = json.loads(response.read().decode())
        token["expires_at"] = int(time.time() + token.get("expires_in", 3600) - 60)
        with db() as conn:
            put_setting(conn, "google_drive_token", json.dumps(token))
        body = b"<h1>Google Drive connected</h1><p>You can close this tab and return to Reporter.</p>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api_drive_status(self):
        with db() as conn:
            token = json.loads(get_setting(conn, "google_drive_token") or "{}")
        self.json({"connected": bool(token.get("refresh_token") or token.get("access_token"))})

    def api_drive_upload(self):
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        file_item = form["file"]
        content = file_item.file.read()
        name = form.getfirst("name", file_item.filename or "asset")
        mime_type = form.getfirst("type", "application/octet-stream")
        issue_id = int(form.getfirst("issueId", "0") or "0")
        title = form.getfirst("title", "")
        with db() as conn:
            access_token = google_access_token(conn)
            folder_id = ensure_drive_issue_folder(conn, access_token, issue_id, title)
            result = drive_upload(access_token, name, mime_type, content, folder_id)
        self.json({"provider": "gdrive", **result})


def public_cloud(cloud):
    cleaned = dict(cloud)
    for key in ("megaPassword", "driveClientSecret", "refresh_token", "access_token"):
        cleaned.pop(key, None)
    return cleaned


def sign_token(raw, secret):
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return raw + "." + sig


def unsign_token(signed, secret):
    if "." not in signed:
        return ""
    raw, sig = signed.rsplit(".", 1)
    expected = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return raw if hmac.compare_digest(sig, expected) else ""


def google_access_token(conn):
    token = json.loads(get_setting(conn, "google_drive_token") or "{}")
    if token.get("access_token") and token.get("expires_at", 0) > int(time.time()) + 60:
        return token["access_token"]
    refresh_token = token.get("refresh_token")
    cloud = json.loads(get_setting(conn, "cloud_storage") or "{}")
    client_id = cloud.get("driveClientId") or os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = cloud.get("driveClientSecret") or os.environ.get("GOOGLE_CLIENT_SECRET", "")
    if not refresh_token:
        raise RuntimeError("Google Drive is not connected on the server. Open /auth/google/start once.")
    if not client_id or not client_secret:
        raise RuntimeError("Missing Google Client ID or Client Secret.")
    data = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    ).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req) as response:
        fresh = json.loads(response.read().decode())
    token.update(fresh)
    token["refresh_token"] = refresh_token
    token["expires_at"] = int(time.time() + token.get("expires_in", 3600) - 60)
    put_setting(conn, "google_drive_token", json.dumps(token))
    return token["access_token"]


def ensure_drive_issue_folder(conn, access_token, issue_id, title):
    cloud = json.loads(get_setting(conn, "cloud_storage") or "{}")
    parent = cloud.get("driveFolderId", "")
    key = f"drive_issue_folder:{parent or 'root'}:{issue_id}"
    existing = get_setting(conn, key)
    if existing:
        return existing
    folder_name = f"Issue {issue_id}"
    if title:
        folder_name += f" - {safe_drive_name(title)}"
    metadata = {"name": folder_name, "mimeType": "application/vnd.google-apps.folder"}
    if parent:
        metadata["parents"] = [parent]
    result = drive_json(
        "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
        access_token,
        method="POST",
        body=json.dumps(metadata).encode(),
        content_type="application/json; charset=UTF-8",
    )
    put_setting(conn, key, result["id"])
    return result["id"]


def drive_upload(access_token, name, mime_type, content, folder_id):
    boundary = f"reporter_{int(time.time())}_{secrets.token_hex(8)}"
    metadata = {"name": name}
    if folder_id:
        metadata["parents"] = [folder_id]
    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            b"Content-Type: application/json; charset=UTF-8\r\n\r\n",
            json.dumps(metadata).encode(),
            b"\r\n",
            f"--{boundary}\r\n".encode(),
            f"Content-Type: {mime_type}\r\n\r\n".encode(),
            content,
            b"\r\n",
            f"--{boundary}--".encode(),
        ]
    )
    return drive_json(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
        access_token,
        method="POST",
        body=body,
        content_type=f"multipart/related; boundary={boundary}",
    )


def drive_json(url, access_token, method="GET", body=None, content_type=None):
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {access_token}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Google Drive request failed: {detail}") from exc


def safe_drive_name(name):
    bad = '\\/:*?"<>|#{}%~&'
    cleaned = "".join(" " if char in bad else char for char in name)
    return " ".join(cleaned.split())[:90]


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Reporter server on http://127.0.0.1:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
