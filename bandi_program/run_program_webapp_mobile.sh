#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
PORT=${PORT:-8001}
HOST=0.0.0.0
INTERFACES=${INTERFACES:-"en0 en1"}

detect_local_ip() {
  local iface ip

  for iface in ${=INTERFACES}; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  done

  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }'
    return 0
  fi

  return 1
}

LOCAL_IP=$(detect_local_ip || true)

echo "Starting program webapp for mobile preview..."
if [[ -n "$LOCAL_IP" ]]; then
  echo "Mobile URL: http://$LOCAL_IP:$PORT/program-index.html"
else
  echo "Mobile URL: local IP not detected automatically."
  echo "Check your Mac IP, then open http://<your-mac-ip>:$PORT/program-index.html on your phone."
fi
echo "Same Wi-Fi network is required."

cd "$SCRIPT_DIR"
exec python3 serve_program_webapp.py --host "$HOST" --port "$PORT"
