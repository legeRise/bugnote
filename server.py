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
import urllib.request
import urllib.error
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ISSUES_DIR = ROOT / "issues"
MEDIA_DIR = ROOT / "media"
SETTINGS_PATH = ROOT / "settings.json"
GITHUB_SETTINGS_PATH = ROOT / "github_settings.json"
MAX_JSON_BYTES = int(os.environ.get("MAX_JSON_BYTES", str(512 * 1024)))
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(250 * 1024 * 1024)))
FILE_LOCK = threading.Lock()

DEFAULT_SETTINGS = {
    "reporters": ["Habib"],
    "assignees": ["Habib"],
    "tags": [],
    "statuses": ["Open", "Fixed", "Not Doing"],
}

DEFAULT_TAG_COLOR = "#0f8b8d"
GITHUB_API = "https://api.github.com"
GITHUB_TOKEN_KEEP = "__bugnote_keep_existing_token__"


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


def clean_issue_tags(values, max_items=24):
    labels = []
    for value in values if isinstance(values, list) else []:
        if isinstance(value, dict):
            labels.append(value.get("label", ""))
        else:
            labels.append(value)
    return clean_list(labels, max_items=max_items)


def clean_github_username(value):
    username = str(value or "").strip().lstrip("@")
    if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", username):
        return username
    return ""


def parse_github_repo(repo_url):
    value = str(repo_url or "").strip()
    if not value:
        return "", "", ""
    if value.startswith("git@github.com:"):
        value = "https://github.com/" + value.split(":", 1)[1]
    parsed = urllib.parse.urlparse(value if "://" in value else f"https://github.com/{value}")
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    parts = [part for part in path.split("/") if part]
    if parsed.netloc and parsed.netloc.lower() != "github.com":
        return "", "", ""
    if len(parts) < 2:
        return "", "", ""
    owner, repo = parts[0], parts[1]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        return "", "", ""
    return owner, repo, f"https://github.com/{owner}/{repo}"


def clean_assignee_mapping(value):
    mapping = {}
    source = value if isinstance(value, dict) else {}
    for name, username in source.items():
        clean_name = re.sub(r"\s+", " ", str(name or "")).strip()[:80]
        clean_username = clean_github_username(username)
        if clean_name and clean_username:
            mapping[clean_name] = clean_username
    return mapping


def clean_status_mapping(value):
    mapping = {}
    source = value if isinstance(value, dict) else {}
    for status, reason in source.items():
        clean_status = re.sub(r"\s+", " ", str(status or "")).strip()[:60]
        clean_reason = str(reason or "").strip()
        if clean_status and clean_reason in {"completed", "not_planned", "open"}:
            mapping[clean_status] = clean_reason
    return mapping


def clean_repos(values, fallback_token="", existing_repos=None):
    existing_map = {}
    if existing_repos:
        for er in existing_repos:
            if isinstance(er, dict):
                key = (er.get("owner", ""), er.get("repo", ""))
                existing_map[key] = er.get("token", "") or ""
    cleaned = []
    for value in values if isinstance(values, list) else []:
        if isinstance(value, dict):
            owner, repo, repo_url = parse_github_repo(value.get("repoUrl") or "")
            if not owner or not repo:
                continue
            token = str(value.get("token") or "").strip()
            if not token:
                # Check if existing repo had its own token
                existing_token = existing_map.get((owner, repo), "")
                if existing_token:
                    token = existing_token
                else:
                    token = fallback_token
            cleaned.append({
                "name": str(value.get("name") or repo).strip()[:80],
                "repoUrl": repo_url,
                "owner": owner,
                "repo": repo,
                "token": token,
                "enabled": bool(value.get("enabled", True)) and bool(token),
                "assigneeMapping": clean_assignee_mapping(value.get("assigneeMapping", {})),
            })
    return cleaned


def public_github_settings(settings):
    public = dict(settings)
    public.pop("token", None)
    public["tokenSaved"] = bool(settings.get("token"))
    # Strip tokens from repos list for public view
    if "repos" in public:
        stripped = []
        for repo in settings.get("repos", []):
            public_repo = {k: v for k, v in repo.items() if k != "token"}
            public_repo["tokenSaved"] = bool(repo.get("token"))
            stripped.append(public_repo)
        public["repos"] = stripped
    return public


def default_github_settings():
    return {
        "enabled": False,
        "repoUrl": "",
        "owner": "",
        "repo": "",
        "token": "",
        "assigneeMapping": {},
        "statusMapping": {
            "Fixed": "completed",
            "Not Doing": "not_planned",
        },
        "repos": [],
        "activeRepoIndex": -1,
        "lastTestedAt": "",
        "lastTestOk": False,
        "lastMessage": "",
    }


def read_github_settings(include_token=False):
    settings = default_github_settings()
    try:
        saved = json.loads(GITHUB_SETTINGS_PATH.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            owner, repo, repo_url = parse_github_repo(saved.get("repoUrl") or saved.get("repository") or "")
            saved_status_mapping = clean_status_mapping(saved.get("statusMapping", {}))
            settings.update(
                {
                    "enabled": bool(saved.get("enabled")),
                    "repoUrl": repo_url,
                    "owner": owner,
                    "repo": repo,
                    "token": str(saved.get("token") or ""),
                    "assigneeMapping": clean_assignee_mapping(saved.get("assigneeMapping", {})),
                    "statusMapping": saved_status_mapping if saved_status_mapping else settings["statusMapping"],
                    "repos": clean_repos(saved.get("repos", [])),
                    "activeRepoIndex": int(saved.get("activeRepoIndex", -1)),
                    "lastTestedAt": str(saved.get("lastTestedAt") or ""),
                    "lastTestOk": bool(saved.get("lastTestOk")),
                    "lastMessage": str(saved.get("lastMessage") or ""),
                }
            )
    except Exception:
        pass
    return settings if include_token else public_github_settings(settings)


def write_github_settings(payload):
    existing = read_github_settings(include_token=True)
    token = str(payload.get("token", GITHUB_TOKEN_KEEP) or "").strip()
    if token == GITHUB_TOKEN_KEEP:
        token = existing.get("token", "")
    settings = {
        "enabled": bool(payload.get("enabled")) and bool(token),
        "repoUrl": existing.get("repoUrl", ""),
        "owner": existing.get("owner", ""),
        "repo": existing.get("repo", ""),
        "token": token,
        "assigneeMapping": clean_assignee_mapping(payload.get("assigneeMapping", existing.get("assigneeMapping", {}))),
        "statusMapping": clean_status_mapping(payload.get("statusMapping", existing.get("statusMapping", {}))),
        "repos": clean_repos(payload.get("repos", existing.get("repos", [])), fallback_token=token, existing_repos=existing.get("repos", [])),
        "activeRepoIndex": int(payload.get("activeRepoIndex", existing.get("activeRepoIndex", -1))),
        "lastTestedAt": str(payload.get("lastTestedAt") or existing.get("lastTestedAt") or ""),
        "lastTestOk": bool(payload.get("lastTestOk", existing.get("lastTestOk", False))),
        "lastMessage": str(payload.get("lastMessage") or existing.get("lastMessage") or ""),
    }
    GITHUB_SETTINGS_PATH.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    return settings


def read_settings():
    settings = DEFAULT_SETTINGS.copy()
    try:
        saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        if isinstance(saved, dict):
            saved_reporters = clean_list(saved.get("reporters", []))
            settings.update(
                {
                    "reporters": saved_reporters,
                    "assignees": clean_list(saved.get("assignees", saved_reporters)),
                    "tags": clean_tags(saved.get("tags", [])),
                    "statuses": clean_list(saved.get("statuses", [])),
                }
            )
    except Exception:
        pass
    return {
        "reporters": clean_list([*DEFAULT_SETTINGS["reporters"], *settings.get("reporters", [])]) or DEFAULT_SETTINGS["reporters"],
        "assignees": clean_list(settings.get("assignees", [])),
        "tags": clean_tags(settings.get("tags", [])),
        "statuses": clean_list([*DEFAULT_SETTINGS["statuses"], *settings.get("statuses", [])]) or DEFAULT_SETTINGS["statuses"],
    }


def write_settings(settings):
    next_settings = {
        "reporters": clean_list(settings.get("reporters", [])) or DEFAULT_SETTINGS["reporters"],
        "assignees": clean_list(settings.get("assignees", [])),
        "tags": clean_tags(settings.get("tags", [])),
        "statuses": clean_list(settings.get("statuses", [])) or DEFAULT_SETTINGS["statuses"],
    }
    SETTINGS_PATH.write_text(json.dumps(next_settings, indent=2) + "\n", encoding="utf-8")
    return next_settings


def github_request(settings, method, path, payload=None, expected=(200, 201, 204)):
    token = settings.get("token", "")
    if not token:
        raise RuntimeError("GitHub token is missing")
    body = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "BugNote",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{GITHUB_API}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            data = response.read().decode("utf-8")
            if response.status not in expected:
                raise RuntimeError(f"GitHub returned {response.status}")
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        message = ""
        try:
            message = json.loads(details).get("message", "")
        except Exception:
            message = details[:180]
        raise RuntimeError(message or f"GitHub returned {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach GitHub: {exc.reason}") from exc


def issue_state_for_status(status, settings=None):
    """
    Map a BugNote status to GitHub issue state and state_reason.
    Uses the configured statusMapping from github_settings, falling back
    to 'open' with no state_reason if not mapped.
    """
    status_mapping = {}
    if settings and isinstance(settings, dict):
        status_mapping = settings.get("statusMapping", {})
    if not status_mapping:
        gh_settings = read_github_settings(include_token=True)
        status_mapping = gh_settings.get("statusMapping", {})
    clean_status = str(status or "").strip().casefold()
    # Check configured mapping (case-insensitive)
    for mapped_status, reason in status_mapping.items():
        if mapped_status.casefold() == clean_status:
            if reason == "open":
                return "open", None
            return "closed", reason
    return "open", None


def markdown_from_html(html, base_url):
    template = re.sub(r"</(p|div|li|h[1-6])>", "\n", str(html or ""), flags=re.I)
    template = re.sub(r"<br\s*/?>", "\n", template, flags=re.I)

    def media_replacer(match):
        tag = match.group(0)
        src_match = re.search(r"\bsrc=[\"']([^\"']+)[\"']", tag, flags=re.I)
        if not src_match:
            return ""
        src = absolute_media_url(src_match.group(1), base_url)
        alt_match = re.search(r"\b(?:alt|data-name)=[\"']([^\"']+)[\"']", tag, flags=re.I)
        label = html_unescape(alt_match.group(1)) if alt_match else "media"
        if tag.lower().startswith("<video"):
            return f"\n[Video: {label}]({src})\n"
        return f"\n![{label}]({src})\n"

    template = re.sub(r"<img\b[^>]*>|<video\b[\s\S]*?</video>", media_replacer, template, flags=re.I)
    template = re.sub(r"<li\b[^>]*>", "- ", template, flags=re.I)
    template = re.sub(r"<[^>]+>", "", template)
    template = html_unescape(template)
    template = re.sub(r"\n{3,}", "\n\n", template)
    return template.strip()


def html_unescape(value):
    return (
        str(value or "")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )


def absolute_media_url(url, base_url):
    parsed = urllib.parse.urlparse(str(url or ""))
    if parsed.scheme in {"http", "https"}:
        return url
    base = str(base_url or "").rstrip("/")
    if not base:
        return url
    return urllib.parse.urljoin(base + "/", str(url or "").lstrip("/"))


def github_issue_body(issue, base_url):
    lines = []
    if issue.get("reporter"):
        lines.append(f"> **Reported by:** {issue['reporter']}")
    if issue.get("status"):
        lines.append(f"> **BugNote status:** {issue['status']}")
    if lines:
        lines.append("")
    description = markdown_from_html(issue.get("descriptionHtml", ""), base_url)
    if description:
        lines.append(description)
    return "\n".join(lines).strip() or "_No description._"


def sync_github_labels(settings, labels):
    owner, repo = settings.get("owner"), settings.get("repo")
    if not owner or not repo:
        return
    for label in labels:
        clean_label = str(label or "").strip()
        if not clean_label:
            continue
        try:
            github_request(settings, "GET", f"/repos/{owner}/{repo}/labels/{urllib.parse.quote(clean_label, safe='')}")
        except RuntimeError:
            github_request(settings, "POST", f"/repos/{owner}/{repo}/labels", {"name": clean_label, "color": "0f8b8d"})


def valid_github_assignee(settings, username):
    owner, repo = settings.get("owner"), settings.get("repo")
    username = clean_github_username(username)
    if not username:
        return False
    github_request(settings, "GET", f"/repos/{owner}/{repo}/assignees/{username}", expected=(204,))
    return True


def github_payload_for_issue(issue, settings, base_url):
    labels = clean_issue_tags(issue.get("tags", []), max_items=24)
    assignees = []
    assigned_to = str(issue.get("assignedTo") or "").strip()
    if assigned_to:
        username = settings.get("assigneeMapping", {}).get(assigned_to, "")
        if not username:
            raise RuntimeError(f"Add a GitHub username for assignee '{assigned_to}' in Settings.")
        valid_github_assignee(settings, username)
        assignees = [username]
    state, state_reason = issue_state_for_status(issue.get("status"), settings)
    payload = {
        "title": issue.get("title") or f"BugNote issue #{issue.get('number')}",
        "body": github_issue_body(issue, base_url),
        "labels": labels,
        "assignees": assignees,
    }
    return payload, labels, state, state_reason


def resolve_github_settings_for_issue(issue, override_owner="", override_repo=""):
    """Resolve the GitHub settings to use for a given issue.
    
    Priority:
    1. If override_owner/override_repo provided (from issue dialog), use that repo.
    2. If the issue already has a github reference with owner/repo, use that repo.
    3. Otherwise use the active (default) repo.
    Also merges top-level assigneeMapping and statusMapping into the repo config.
    """
    settings = read_github_settings(include_token=True)
    repos = settings.get("repos", [])
    top_assignee_mapping = settings.get("assigneeMapping", {})
    top_status_mapping = settings.get("statusMapping", {})
    
    def match_repo(owner, repo_name):
        for rc in repos:
            if rc.get("owner") == owner and rc.get("repo") == repo_name and rc.get("token"):
                rc_copy = {**rc}
                if not rc_copy.get("assigneeMapping"):
                    rc_copy["assigneeMapping"] = top_assignee_mapping
                return rc_copy
        return None
    
    # 1. Explicit override from issue dialog
    if override_owner and override_repo:
        matched = match_repo(override_owner, override_repo)
        if matched:
            return matched, top_status_mapping
    
    # 2. Existing github reference on the issue
    github_ref = issue.get("github") if isinstance(issue.get("github"), dict) else {}
    ref_owner = github_ref.get("owner", "")
    ref_repo = github_ref.get("repo", "")
    if ref_owner and ref_repo:
        matched = match_repo(ref_owner, ref_repo)
        if matched:
            return matched, top_status_mapping
    
    # 3. Active (default) repo
    active_index = settings.get("activeRepoIndex", -1)
    if 0 <= active_index < len(repos):
        repo_config = repos[active_index]
        if repo_config.get("token"):
            repo_config = {**repo_config}
            if not repo_config.get("assigneeMapping"):
                repo_config["assigneeMapping"] = top_assignee_mapping
            return repo_config, top_status_mapping
    
    return None, top_status_mapping


def sync_issue_to_github(issue, base_url, override_owner="", override_repo=""):
    all_settings = read_github_settings(include_token=True)
    
    # Don't sync if GitHub is disabled globally
    if not all_settings.get("enabled"):
        return issue
    
    # Try to resolve the right settings for this issue
    repo_settings, status_mapping = resolve_github_settings_for_issue(issue, override_owner, override_repo)
    
    if not repo_settings:
        return issue
    
    if not repo_settings.get("owner") or not repo_settings.get("repo") or not repo_settings.get("token"):
        raise RuntimeError("GitHub is enabled but repo or token is missing.")
    
    # Merge status mapping into repo_settings for issue_state_for_status
    if status_mapping:
        repo_settings = {**repo_settings, "statusMapping": status_mapping}

    payload, labels, state, state_reason = github_payload_for_issue(issue, repo_settings, base_url)
    sync_github_labels(repo_settings, labels)
    owner, repo = repo_settings["owner"], repo_settings["repo"]
    github_ref = issue.get("github") if isinstance(issue.get("github"), dict) else {}
    issue_number_value = github_ref.get("number")

    if issue_number_value:
        github_issue = github_request(repo_settings, "PATCH", f"/repos/{owner}/{repo}/issues/{int(issue_number_value)}", payload)
    else:
        github_issue = github_request(repo_settings, "POST", f"/repos/{owner}/{repo}/issues", payload)
        issue_number_value = github_issue.get("number")

    state_payload = {"state": state}
    if state_reason:
        state_payload["state_reason"] = state_reason
    github_issue = github_request(repo_settings, "PATCH", f"/repos/{owner}/{repo}/issues/{int(issue_number_value)}", state_payload)
    issue["github"] = {
        "owner": owner,
        "repo": repo,
        "number": github_issue.get("number", issue_number_value),
        "url": github_issue.get("html_url", github_ref.get("url", "")),
        "state": github_issue.get("state", state),
        "stateReason": github_issue.get("state_reason", state_reason or ""),
        "syncedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    return issue


def close_github_issue_on_delete(issue_data):
    """Close a GitHub issue when the BugNote issue is deleted."""
    github_ref = issue_data.get("github") if isinstance(issue_data.get("github"), dict) else {}
    issue_number_value = github_ref.get("number")
    owner = github_ref.get("owner", "")
    repo = github_ref.get("repo", "")
    if not issue_number_value or not owner or not repo:
        return
    
    # Find the right settings for this repo
    all_settings = read_github_settings(include_token=True)
    repo_settings = None
    for rc in all_settings.get("repos", []):
        if rc.get("owner") == owner and rc.get("repo") == repo and rc.get("token"):
            repo_settings = rc
            break
    if not repo_settings and all_settings.get("owner") == owner and all_settings.get("repo") == repo and all_settings.get("token"):
        repo_settings = all_settings
    
    if not repo_settings:
        return
    
    close_payload = {"state": "closed", "state_reason": "not_planned"}
    github_request(repo_settings, "PATCH", f"/repos/{owner}/{repo}/issues/{int(issue_number_value)}", close_payload)


def test_github_connection(settings):
    # Test against the active/default repo from the repos list
    repos = settings.get("repos", [])
    active_index = settings.get("activeRepoIndex", -1)
    if 0 <= active_index < len(repos):
        repo_config = repos[active_index]
        owner, repo = repo_config.get("owner"), repo_config.get("repo")
        if not owner or not repo:
            raise RuntimeError("The default repo has an invalid URL. Remove and re-add it.")
        github_request(repo_config, "GET", f"/repos/{owner}/{repo}")
        for local_name, username in settings.get("assigneeMapping", {}).items():
            if username:
                try:
                    valid_github_assignee(repo_config, username)
                except RuntimeError as exc:
                    raise RuntimeError(f"{username} is not assignable for {local_name}: {exc}") from exc
    elif repos:
        raise RuntimeError("No repo is set as default. Mark one as default in the Repositories section.")
    else:
        raise RuntimeError("Add at least one repository first.")
    return True


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
        return normalize_issue(json.loads(path.read_text(encoding="utf-8")), path)
    except Exception:
        return None


def normalize_issue(issue, path=None):
    if not isinstance(issue, dict):
        return None
    issue_id = int(issue.get("id") or issue_id_from_path(path) or 0)
    if issue_id <= 0:
        return None
    issue_number_text = str(issue.get("number") or issue_number(issue_id))
    return {
        "id": issue_id,
        "number": issue_number_text.zfill(4),
        "title": str(issue.get("title") or f"Issue #{issue_number_text.zfill(4)}").strip(),
        "reporter": str(issue.get("reporter") or "").strip(),
        "assignedTo": str(issue.get("assignedTo") or "").strip(),
        "status": str(issue.get("status") or "open").strip() or "open",
        "tags": clean_issue_tags(issue.get("tags", []), max_items=24),
        "descriptionHtml": str(issue.get("descriptionHtml") or "").strip(),
        "media": issue.get("media", []) if isinstance(issue.get("media", []), list) else [],
        "github": issue.get("github", {}) if isinstance(issue.get("github", {}), dict) else {},
        "githubError": str(issue.get("githubError") or "").strip(),
        "createdAt": str(issue.get("createdAt") or "").strip(),
        "updatedAt": str(issue.get("updatedAt") or issue.get("createdAt") or "").strip(),
    }


def issue_id_from_path(path):
    if not path:
        return 0
    match = re.search(r"issue-(\d+)", Path(path).name)
    return int(match.group(1)) if match else 0


def media_only_issue(path):
    match = re.fullmatch(r"issue-(\d+)", path.name)
    if not match:
        return None
    issue_id = int(match.group(1))
    media = []
    for file_path in sorted(item for item in path.iterdir() if item.is_file()):
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        media.append(
            {
                "name": file_path.name,
                "type": content_type,
                "url": "/" + file_path.relative_to(ROOT).as_posix(),
                "path": file_path.relative_to(ROOT).as_posix(),
            }
        )
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(path.stat().st_mtime))
    return {
        "id": issue_id,
        "number": issue_number(issue_id),
        "title": f"Issue #{issue_number(issue_id)}",
        "reporter": "",
        "assignedTo": "",
        "status": "open",
        "tags": [],
        "descriptionHtml": "",
        "media": media,
        "github": {},
        "githubError": "",
        "createdAt": created_at,
        "updatedAt": created_at,
    }


def all_issues():
    ensure_dirs()
    issues = [issue for issue in (read_issue(path) for path in ISSUES_DIR.glob("issue-*.json")) if issue]
    issue_ids = {int(issue.get("id", 0)) for issue in issues}
    for path in MEDIA_DIR.glob("issue-*"):
        issue = media_only_issue(path) if path.is_dir() else None
        if issue and issue["id"] not in issue_ids:
            issues.append(issue)
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
        if path in {"/", "/issues", "/settings"}:
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
        if self.api_path == "/api/github-settings":
            return self.json(read_github_settings())
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
        if self.api_path == "/api/github-settings":
            return self.save_github_settings()
        if self.api_path == "/api/github-test":
            return self.test_github()
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self):
        ensure_dirs()
        match = re.fullmatch(r"/api/issues/(\d+)", self.api_path)
        if not match:
            return self.send_error(HTTPStatus.NOT_FOUND)
        issue_id = int(match.group(1))
        path = issue_path(issue_id)
        
        # Close the GitHub issue if it exists
        issue_data = read_issue(path) if path.exists() else None
        if issue_data:
            github_ref = issue_data.get("github") if isinstance(issue_data.get("github"), dict) else {}
            if github_ref.get("number"):
                try:
                    close_github_issue_on_delete(issue_data)
                except Exception:
                    pass
        
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
            "github": existing.get("github", {}) if isinstance(existing.get("github", {}), dict) else {},
            "githubError": "",
            "createdAt": existing.get("createdAt") or now,
            "updatedAt": now,
        }
        if not issue["title"]:
            return self.json({"error": "Title is required"}, 400)
        try:
            override_owner = str(payload.get("githubRepoOwner") or "").strip()
            override_repo = str(payload.get("githubRepo") or "").strip()
            issue = sync_issue_to_github(issue, self.request_base_url(), override_owner, override_repo)
        except RuntimeError as exc:
            issue["githubError"] = str(exc)
        with FILE_LOCK:
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

    def save_github_settings(self):
        ensure_dirs()
        try:
            payload = self.read_json()
        except ValueError as exc:
            return self.json({"error": str(exc)}, 413)
        with FILE_LOCK:
            settings = write_github_settings(payload)
        self.json({"ok": True, "settings": public_github_settings(settings)})

    def test_github(self):
        ensure_dirs()
        try:
            payload = self.read_json()
        except ValueError as exc:
            return self.json({"error": str(exc)}, 413)
        with FILE_LOCK:
            settings = write_github_settings(payload)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        try:
            test_github_connection(settings)
            settings["lastTestedAt"] = now
            settings["lastTestOk"] = True
            settings["lastMessage"] = "Connection works."
            write_github_settings(settings)
            return self.json({"ok": True, "message": settings["lastMessage"], "settings": public_github_settings(settings)})
        except RuntimeError as exc:
            settings["lastTestedAt"] = now
            settings["lastTestOk"] = False
            settings["lastMessage"] = str(exc)
            write_github_settings(settings)
            return self.json({"ok": False, "error": str(exc), "settings": public_github_settings(settings)}, 400)

    def request_base_url(self):
        proto = self.headers.get("X-Forwarded-Proto", "http").split(",", 1)[0].strip() or "http"
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or ""
        return f"{proto}://{host}" if host else ""

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
    print(f"BugNote on http://{host}:{port}")
    for address in local_ip_addresses():
        print(f"Mobile/LAN: http://{address}:{port}")
    print(f"Issues: {ISSUES_DIR}")
    print(f"Media:  {MEDIA_DIR}")
    try:
        ThreadingHTTPServer((host, port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nBugNote stopped")
