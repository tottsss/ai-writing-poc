#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  jobs -p | xargs -I {} kill {} 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "$REPO_ROOT/apps/api"
  uv sync
  uv run uvicorn app.main:app --reload --port 8000
) &

(
  cd "$REPO_ROOT/apps/web"
  npm install
  npm run dev
) &

wait
