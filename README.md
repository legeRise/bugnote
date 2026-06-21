````md
# BugNote

A small, file-based issue reporter that runs with Python 3. No npm install, no database, and no required cloud setup.

## Why Python's `http.server`?

The server (`server.py`) uses only the Python standard library — mainly `http.server`, `json`, `cgi`, and `threading`.

The goal is to keep setup simple. Most servers already have Python 3 installed, so BugNote can be copied to a machine and run without installing extra packages, creating a virtual environment, or running a build step.

By default, the server runs on host `0.0.0.0` and port `9203`. Both can be changed with environment variables:

```bash
HOST=127.0.0.1 PORT=8000 python3 server.py
````

## What It Does

BugNote provides a simple web UI for reporting and managing issues.

It supports:

* Creating bug reports
* Rich text notes
* Inline image and video attachments
* Upload, paste, drag-and-drop, and camera capture
* Filtering and searching issues
* Viewing, editing, and deleting saved issues

All data is stored locally on disk.

## How It Saves Data

BugNote stores everything as plain files. There is no database to set up or maintain.

```text
issues/issue-0001.json       ← each issue as JSON
media/issue-0001/photo.png   ← attachments for that issue
media/issue-0001/video.webm
```

The saved data can be inspected directly by opening the `issues/` and `media/` folders.

## Run

```bash
python3 server.py
```

Then open:

```text
http://127.0.0.1:9203
```

## Backups

Since BugNote stores data in only two folders — `issues/` and `media/` — backups can be handled by copying or syncing those folders somewhere else.

### Option 1 — rclone + cron

You can configure an [rclone](https://rclone.org) remote once, such as Google Drive, Dropbox, S3, Mega, Cloudflare R2, or Backblaze.

Then add a cron job like this:

```cron
*/10 * * * * cd /path/to/bugnote && rclone sync issues remote:bucket/issues && rclone sync media remote:bucket/media
```

This keeps BugNote local while letting a separate sync process handle backups.

### Option 2 — a small Python script

Another option is to write a small Python script that copies the `issues/` and `media/` folders to a storage provider.

For example, [legeRise/storage-utilities](https://github.com/legeRise/storage-utilities) contains simple single-file storage integrations for R2, Supabase, and Mega. They were built for another project, but the same idea can be adapted here.

The main idea is simple: BugNote saves locally, and a separate process handles off-site backup.

## Files

```text
index.html   ← UI
app.js       ← front-end logic
styles.css   ← styling
server.py    ← HTTP server and API
```

Created on first run:

```text
issues/      ← saved issue JSON files
media/       ← uploaded images and videos
```

```
```
