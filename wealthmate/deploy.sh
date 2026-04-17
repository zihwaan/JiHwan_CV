#!/usr/bin/env bash
# Safe deploy script for wealthmate on zihwan.com.
#
# Lesson learned: the EC2 box is memory-constrained. Running `vite build`
# on the server concurrently with pm2-managed node + uvicorn pushes it
# past the OOM threshold and knocks sshd / nginx off the air. So we build
# the SPA *locally* and rsync only the pre-built `dist/` to the server.
#
# Prereqs on the server (one-time):
#   - /usr/bin/claude   (sudo npm i -g @anthropic-ai/claude-code)
#   - node, pm2, nginx already configured (they are)
#   - ~/JiHwan_CV/wealthmate/backend/.venv populated
#   - /swapfile (see DEPLOY.md) recommended for future npm ci on server

set -euo pipefail

SSH_KEY="${SSH_KEY:-/Users/zihwan/Desktop/zihwan.com.pem}"
HOST="${HOST:-ec2-user@52.65.23.216}"
LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LOCAL_ROOT"

echo "== 1. local SPA build (spare the server's memory)"
( cd wealthmate/frontend && npm run build )

echo "== 2. rsync backend (source only — exclude venv/db/cache/secrets)"
rsync -az --delete \
  --exclude 'node_modules' --exclude '.venv' --exclude 'dist' \
  --exclude '__pycache__' --exclude 'wealthmate.db' --exclude '.DS_Store' \
  --exclude '.env' --exclude '.keys.json' --exclude '.keys.json.tmp' \
  -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
  wealthmate/backend/ \
  "$HOST:~/JiHwan_CV/wealthmate/backend/"

echo "== 3. rsync pre-built frontend dist/"
rsync -az --delete \
  -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
  wealthmate/frontend/dist/ \
  "$HOST:~/JiHwan_CV/wealthmate/frontend/dist/"

echo "== 4. rsync top-level Express files (index, server.js, package.json)"
rsync -az \
  -e "ssh -o StrictHostKeyChecking=no -i $SSH_KEY" \
  index.html server.js package.json \
  "$HOST:~/JiHwan_CV/"

echo "== 5. restart pm2 processes (only; no build on server)"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$HOST" '
  set -e
  cd ~/JiHwan_CV
  # keep node deps in sync only if package.json actually changed (cheap on server)
  if ! diff -q ~/.pm2/.last-pkg package.json >/dev/null 2>&1; then
    npm install --omit=dev --silent 2>&1 | tail -3 || true
    cp package.json ~/.pm2/.last-pkg
  fi
  # pm2 may have been restarted by a reboot — resurrect from dump if empty
  if ! pm2 describe wealthmate-api >/dev/null 2>&1; then
    echo "   (pm2 dump resurrect)"
    pm2 resurrect
    sleep 2
  fi
  pm2 restart wealthmate-api --update-env
  pm2 restart zihwan-cv --update-env
  pm2 save
'

echo "== 6. wait for readiness and smoke test"
sleep 3
for ep in \
  "https://zihwan.com/" \
  "https://zihwan.com/wealthmate/" \
  "https://zihwan.com/wealthmate/api/auth/status" \
  "https://zihwan.com/wealthmate/api/dashboard/user-jihwan-001"
do
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$ep")
  printf "  %-60s HTTP=%s\n" "$ep" "$code"
  [ "$code" = "200" ] || { echo "FAIL: $ep"; exit 1; }
done

echo "ALL GREEN"
