#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
HOST=${HOST:-127.0.0.1}
PORT=${PORT:-8001}

cd "$SCRIPT_DIR"
exec python3 serve_program_webapp.py --host "$HOST" --port "$PORT"
