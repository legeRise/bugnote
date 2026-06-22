# BugNote

BugNote is a small file-based issue tracker that runs with Python 3. It does not require npm, a database, or a build step.

## Run

```bash
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
- Attach images and videos by upload, paste, drag-and-drop, or camera capture.
- Keep media inline with the issue description.
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
issues/issue-0001.json         issue data
media/issue-0001/photo.png     media for an issue
media/issue-0001/video.webm
```

Existing issue files are read on startup. Older settings that only have `reporters` are still accepted; assignees are initialized from that list for compatibility.

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
index.html   UI markup
app.js       front-end behavior
styles.css   styling
server.py    Python HTTP server and API
```
