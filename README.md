# BugNote

BugNote is a small file-based issue tracker with a React/Vite frontend and a Python file-storage API. The heavier browser features now lean on mature packages: Uppy handles upload, paste, drag-drop, webcam photo capture, and webcam video recording; marker.js handles image annotation before upload.

## Docker (recommended)

Docker Compose pulls the published `habib926653/bugnote` image, starts BugNote, exposes port 9201, and keeps the current project's `issues/`, `media/`, and settings files available through `/data`.

```bash
docker compose pull
docker compose up -d
```

Open `http://127.0.0.1:9201`. View logs or stop the app with:

```bash
docker compose logs -f
docker compose down
```

Rebuilding or removing the container does not delete the project data. To store data somewhere else or change the host port:

```bash
BUGNOTE_DATA_DIR=/path/to/bugnote-data BUGNOTE_PORT=8080 docker compose up -d
```

The data directory must be writable and will contain `issues/`, `media/`, `settings.json`, and `github_settings.json`.

The three Docker-related files have separate roles:

- `compose.yaml` is the only file users run. It pulls the published image and starts BugNote.
- `Dockerfile` is the image recipe used by maintainers and GitHub Actions. End users do not run it directly.
- `.github/workflows/docker-publish.yml` runs on GitHub and publishes images built from the Dockerfile. End users do not run it.

For an occasional local source build, use the Dockerfile directly:

```bash
docker build -t bugnote:local .
docker run -d --name bugnote-local -p 9201:9201 -v "$(pwd):/data" bugnote:local
```

### Publishing

The GitHub Actions workflow publishes multi-platform images to `habib926653/bugnote` after pushes to `main`, version tags such as `v0.2.0`, or a manual workflow run. Add a GitHub Actions repository secret named `DOCKERHUB_TOKEN` containing a Docker Hub personal access token.

To deploy a fixed version rather than `latest`:

```bash
BUGNOTE_VERSION=v0.2.0 docker compose up -d
```

## Requirements

- Docker Engine with Docker Compose (recommended), or
- Node.js 20+ and Python 3.10–3.12 for a manual installation.

No database or third-party Python packages are required. Remote camera and microphone access require HTTPS; browsers permit them on localhost for development.

## Run

Install frontend dependencies once:

```bash
npm install
```

For day-to-day frontend development, run the Python API and Vite in two terminals:

```bash
python3 server.py
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

For a production-style local run, build the frontend and let Python serve the compiled app:

```bash
npm run build
python3 server.py
```

Then open:

```text
http://127.0.0.1:9201
```

By default, the server listens on `0.0.0.0:9201`. You can change that with environment variables:

```bash
HOST=127.0.0.1 PORT=8000 python3 server.py
```

## Routes

```text
/           issues dashboard
/issues     issues dashboard, normalized to /
/settings   settings page
```

The server returns the same app shell for these routes so refreshes and direct links work.

## Features

- Create, edit, and delete issues.
- Track title, reporter, assignee, status, tags, description, created date, and updated date.
- Manage reporters, assignees, tags, tag colors, and statuses from Settings.
- Optionally sync saved issues to a GitHub repository.
- Attach images and videos through Uppy by upload, paste, drag-and-drop, webcam photo capture, or webcam video recording.
- Annotate image uploads with marker.js before saving them to the issue media folder.
- Filter issues from one search field.
- Show visible issue counts while filtering.

## Search

Plain text search matches issue number, title, description, reporter, assignee, status, tags, and dates.

Scoped filters can be mixed with plain text:

```text
reporter:habib
assignee:husnain
tag:bug
status:open
is:fixed
created:2026-06-22
updated:jun
```

Examples:

```text
status:open tag:bug
assignee:husnain upload error
reporter:habib created:2026
```

## Data

BugNote stores data as files in the project folder.

```text
settings.json                  settings
github_settings.json           GitHub repo, token, and assignee mapping
issues/issue-0001.json         issue data
media/issue-0001/photo.png     media for an issue
media/issue-0001/video.webm
```

Existing issue files are read on startup. Older settings that only have `reporters` are still accepted; assignees are initialized from that list for compatibility.

GitHub sync is configured from Settings. BugNote stores the token in `github_settings.json`, creates missing GitHub labels from BugNote tags, maps BugNote assignees to GitHub usernames, and keeps the GitHub issue number in the local issue JSON. `fixed` closes the GitHub issue as completed; `not doing` and `closed but not fixed` close it as not planned. Images and videos remain in `media/`; GitHub issue bodies link back to those files.

## Limits

Upload and JSON payload limits can be changed with environment variables:

```bash
MAX_JSON_BYTES=524288 MAX_UPLOAD_BYTES=262144000 python3 server.py
```

The default upload limit is 250 MB.

## Auth

BugNote does not include built-in authentication. For a small internal deployment, put it behind a reverse proxy and add authentication there.

Simple options:

- Nginx Basic Auth for the whole site.
- Caddy `basicauth`.
- A private VPN or tunnel with access control.
- Route-based auth at a reverse proxy if only some paths should be protected.

Example Nginx shape:

```nginx
location / {
    auth_basic "BugNote";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:9201;
}
```

Use HTTPS at the proxy when exposing BugNote beyond a trusted local network.

## Backups

Back up these paths:

```text
settings.json
issues/
media/
```

You can copy them directly, sync them with `rsync`, or use a tool such as `rclone`.

Example cron job:

```cron
*/10 * * * * cd /path/to/bugnote && rclone sync issues remote:bucket/issues && rclone sync media remote:bucket/media && rclone copy settings.json remote:bucket/
```

## Files

```text
index.html       Vite app shell
src/             React frontend
package.json     frontend dependencies and scripts
server.py        Python HTTP server and API
issues/          issue JSON files
media/           uploaded issue media
```
