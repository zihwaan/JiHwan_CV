# WealthMate deployment notes (zihwan.com)

## Runtime layout

```
nginx 443  ──►  Express :8080 (pm2 "zihwan-cv")
                  ├─ /                           → static (JiHwan_CV/*.html)
                  ├─ /wealthmate/                → static (wealthmate/frontend/dist/)
                  └─ /wealthmate/api/*           → http-proxy → 127.0.0.1:8001
                                                    (pm2 "wealthmate-api",
                                                     uvicorn + FastAPI)
```

SQLite DB lives at `wealthmate/backend/wealthmate.db`.
Claude auth: FastAPI's `/api/auth/status` reports `ANTHROPIC_API_KEY` / `claude`
CLI state. To enable chat on the server, either `export ANTHROPIC_API_KEY=...`
in the `wealthmate-api` PM2 env, or install Claude CLI system-wide and log in.

## Claude CLI login flow (headless server)

`claude auth login --claudeai` on a remote box can't receive the OAuth
localhost redirect — the user's browser lives on a different machine.
The CLI therefore falls back to the paste-back flow:

1. Frontend `POST /api/auth/login` → backend spawns CLI with `stdin=PIPE`,
   stores the `asyncio.subprocess.Process` in a module-level singleton,
   returns the OAuth URL.
2. User clicks the link, approves in their browser, the browser page
   shows an Authentication Code.
3. Frontend posts that code to `POST /api/auth/complete`; backend writes
   `code\n` to the CLI's stdin, waits for the CLI to exit, and re-queries
   `claude auth status`.
4. Banner flips to `ready=true` on the next poll.

Only one login session at a time — a fresh `/login` terminates any older
process first. `/logout` also terminates the tracked subprocess.

## Why PM2 and not systemd
Amazon Linux 2023 has SELinux in *Enforcing* mode. A systemd unit running
`.venv/bin/python` from `$HOME` fails with `203/EXEC` because `user_home_t`
files aren't executable from the `init_t` context. PM2 inherits the
unconfined user context from the ec2-user login session, so no relabeling
is needed.

## First-time server setup

```bash
# Claude Code CLI (enables the in-browser login flow; without this, the agent
# only works when ANTHROPIC_API_KEY is set in the wealthmate-api PM2 env)
sudo npm install -g @anthropic-ai/claude-code

cd ~/JiHwan_CV
npm install            # picks up http-proxy-middleware

cd ~/JiHwan_CV/wealthmate/backend
python3 -m venv .venv
.venv/bin/pip install fastapi uvicorn aiosqlite anthropic httpx
.venv/bin/python seed.py

cd ~/JiHwan_CV/wealthmate/frontend
npm install
npm run build          # emits dist/ with base=/wealthmate/

pm2 start .venv/bin/python \
  --name wealthmate-api \
  --cwd ~/JiHwan_CV/wealthmate/backend \
  -- -m uvicorn main:app --host 127.0.0.1 --port 8001

pm2 restart zihwan-cv --update-env
pm2 save
```

## Subsequent deploys (after editing code)

```bash
cd ~/JiHwan_CV && git pull
# backend change → pm2 restart wealthmate-api
# frontend change → cd wealthmate/frontend && npm run build
# express change → pm2 restart zihwan-cv
```

## Verifying

```bash
# locally on the box
curl -fsS http://127.0.0.1:8001/                                        # FastAPI root
curl -fsS http://127.0.0.1:8080/wealthmate/api/dashboard/user-minjun-001  # proxy

# public
curl -I https://zihwan.com/wealthmate/
curl -fsS https://zihwan.com/wealthmate/api/dashboard/user-minjun-001 | head -c 200
```
