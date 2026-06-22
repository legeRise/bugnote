#!/usr/bin/env python3
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning, module="cgi")

import cgi
import json
import mimetypes
import os
import re
import shutil
import socket
import threading
import time
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ISSUES_DIR = ROOT / "issues"
MEDIA_DIR = ROOT / "media"
SETTINGS_PATH = ROOT / "settings.json"
MAX_JSON_BYTES = int(os.environ.get("MAX_JSON_BYTES", str(512 * 1024)))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(250 * 1024 * 1024)))
FILE_LOCK = threading.Lock()

DEFAULT_SETTINGS = {
    "reporters": ["Habib"],
    "tags": [],
    "statuses": ["open", "fixed", "closed but not fixed", "not doing"],
}

DEFAULT_TAG_COLOR = "#0f8b8d"


def ensure_dirs():
    ISSUES_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)


def clean_list(values, max_items=200):
    cleaned = []
    seen = set()
    for value in values if isinstance(values, list) else []:
        label = re.sub(r"\s+", " ", str(value)).strip()
        key = label.casefold()
        if label and key not in seen:
            cleaned.append(label[:80])
            seen.add(key)
        if len(cleaned) >= max_items:
            break
    return cleaned


def clean_color(value):
    color = str(value or "").strip()
    return color if re.fullmatch(r"#[0-9A-Fa-f]{6}", color) else DEFAULT_TAG_COLOR


def clean_tags(values, max_items=200):
    cleaned = []
    seen = set()
    for value in values if isinstance(values, list) else []:
        if isinstance(value, dict):
            label = re.sub(r"\s+", " ", str(value.get("label", ""))).strip()
            color = clean_color(value.get("color"))
        else:
            label = re.sub(r"\s+", " ", str(value)).strip()
            color = DEFAULT_TAG_COLOR
        key = label.casefold()
        if label and key not in seen:
            cleaned.append({"label": label[:40], "color": color})
            seen.add(key)
        if len(cleaned) >= max_items:
            break
    return cleaned


def read_settings():
    settings = DEFAULT_SETTINGS.copy()
    try:
        saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            settings.update(
                {
                    "reporters": clean_list(saved.get("reporters", [])),
                    "tags": clean_tags(saved.get("tags", [])),
                    "statuses": clean_list(saved.get("statuses", [])),
                }
            )
    except Exception:
        pass
    return {
        "reporters": clean_list([*DEFAULT_SETTINGS["reporters"], *settings.get("reporters", [])]) or DEFAULT_SETTINGS["reporters"],
        "tags": clean_tags(settings.get("tags", [])),
        "statuses": clean_list([*DEFAULT_SETTINGS["statuses"], *settings.get("statuses", [])]) or DEFAULT_SETTINGS["statuses"],
    }


def write_settings(settings):
    next_settings = {
        "reporters": clean_list(settings.get("reporters", [])) or DEFAULT_SETTINGS["reporters"],
        "tags": clean_tags(settings.get("tags", [])),
        "statuses": clean_list(settings.get("statuses", [])) or DEFAULT_SETTINGS["statuses"],
    }
    SETTINGS_PATH.write_text(json.dumps(next_settings, indent=2) + "\n", encoding="utf-8")
    return next_settings


def issue_number(issue_id):
    return f"{int(issue_id):04d}"


def issue_path(issue_id):
    ensure_dirs()
    return ISSUES_DIR / f"issue-{issue_number(issue_id)}.json"


def safe_filename(name):
    name = Path(name or "media").name.strip() or "media"
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip(".-")
    return name[:120] or "media"


def unique_path(path):
    if not path.exists():
        return path
    for index in range(2, 10000):
        candidate = path.with_name(f"{path.stem}-{index}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError("Could not create a unique filename")


def next_issue_id():
    ensure_dirs()
    max_id = 0
    for path in ISSUES_DIR.glob("issue-*.json"):
        match = re.search(r"issue-(\d+)\.json$", path.name)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return max_id + 1


def read_issue(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def all_issues():
    ensure_dirs()
    issues = [issue for issue in (read_issue(path) for path in ISSUES_DIR.glob("issue-*.json")) if issue]
    return sorted(issues, key=lambda issue: int(issue.get("id", 0)), reverse=True)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
    }

    def translate_path(self, path):
        path = urllib.parse.urlparse(path).path
        if path == "/":
            return str(ROOT / "index.html")
        return str(ROOT / path.lstrip("/"))

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(self), microphone=(self)")
        super().end_headers()

    def do_GET(self):
        if self.api_path == "/api/issues":
            return self.json({"issues": all_issues()})
        if self.api_path == "/api/issues/next-id":
            issue_id = next_issue_id()
            return self.json({"id": issue_id, "number": issue_number(issue_id)})
        if self.api_path == "/api/settings":
            return self.json(read_settings())
        if self.api_path == "/api/health":
            return self.json({"ok": True})
        return super().do_GET()

    def do_POST(self):
        if self.api_path == "/api/issues":
            return self.save_issue()
        if self.api_path == "/api/media":
            return self.save_media()
        if self.api_path == "/api/settings":
            return self.save_settings()
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        ensure_dirs()
        match = re.fullmatch(r"/api/issues/(\d+)", self.api_path)
        if not match:
            return self.send_error(HTTPStatus.NOT_FOUND)
        issue_id = int(match.group(1))
        path = issue_path(issue_id)
        if path.exists():
            path.unlink()
        media_path = MEDIA_DIR / f"issue-{issue_number(issue_id)}"
        if media_path.exists():
            shutil.rmtree(media_path)
        self.json({"ok": True})

    @property
    def api_path(self):
        return urllib.parse.urlparse(self.path).path.rstrip("/")

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_JSON_BYTES:
            raise ValueError("JSON payload is too large")
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    def json(self, payload, status=200):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def save_issue(self):
        ensure_dirs()
        try:
            payload = self.read_json()
        except ValueError as exc:
            return self.json({"error": str(exc)}, 413)
        with FILE_LOCK:
            issue_id = int(payload.get("id") or next_issue_id())
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            existing = read_issue(issue_path(issue_id)) or {}
            issue = {
                "id": issue_id,
                "number": issue_number(issue_id),
                "title": str(payload.get("title", "")).strip(),
                "reporter": str(payload.get("reporter", "")).strip(),
                "assignedTo": str(payload.get("assignedTo", "")).strip(),
                "status": str(payload.get("status", "open")).strip() or "open",
                "tags": clean_list(payload.get("tags", []), max_items=24),
                "descriptionHtml": str(payload.get("descriptionHtml", "")).strip(),
                "media": payload.get("media", []),
                "createdAt": existing.get("createdAt") or now,
                "updatedAt": now,
            }
            if not issue["title"]:
                return self.json({"error": "Title is required"}, 400)
            issue_path(issue_id).write_text(json.dumps(issue, indent=2) + "\n", encoding="utf-8")
        self.json({"ok": True, "issue": issue})

    def save_settings(self):
        ensure_dirs()
        try:
            payload = self.read_json()
        except ValueError as exc:
            return self.json({"error": str(exc)}, 413)
        with FILE_LOCK:
            settings = write_settings(payload)
        self.json({"ok": True, "settings": settings})

    def save_media(self):
        ensure_dirs()
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            return self.json({"error": "Upload is too large"}, 413)
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        if "file" not in form:
            return self.json({"error": "Missing file"}, 400)
        issue_id = int(form.getfirst("issueId", "0") or "0")
        if issue_id <= 0:
            return self.json({"error": "Missing issue id"}, 400)

        item = form["file"]
        name = safe_filename(form.getfirst("name", item.filename or "media"))
        with FILE_LOCK:
            issue_dir = MEDIA_DIR / f"issue-{issue_number(issue_id)}"
            issue_dir.mkdir(parents=True, exist_ok=True)
            path = unique_path(issue_dir / name)
            with path.open("wb") as output:
                shutil.copyfileobj(item.file, output)

        content_type = form.getfirst("type", "") or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.json(
            {
                "ok": True,
                "name": path.name,
                "type": content_type,
                "url": "/" + path.relative_to(ROOT).as_posix(),
                "path": path.relative_to(ROOT).as_posix(),
            }
        )


def local_ip_addresses():
    addresses = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            address = probe.getsockname()[0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


if __name__ == "__main__":
    ensure_dirs()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "9201"))
    print(f"Reporter on http://{host}:{port}")
    for address in local_ip_addresses():
        print(f"Mobile/LAN: http://{address}:{port}")
    print(f"Issues: {ISSUES_DIR}")
    print(f"Media:  {MEDIA_DIR}")
    try:
        ThreadingHTTPServer((host, port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nReporter stopped")
