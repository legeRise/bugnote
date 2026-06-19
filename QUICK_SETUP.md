# Quick Setup

Run the setup wizard:

```bash
python3 setup.py
```

It asks for:

- admin password,
- port,
- Google Client ID,
- Google Client Secret,
- Google Drive parent folder ID.

You can rerun `python3 setup.py` later to change these.

## Start The Server

```bash
python3 server.py
```

Open:

```text
http://127.0.0.1:8001/
```

## 3. Connect Google Drive

For connect-once Drive, open:

```text
http://127.0.0.1:8001/auth/google/start
```

Google Cloud must include this redirect URI:

```text
http://127.0.0.1:8001/auth/google/callback
```
