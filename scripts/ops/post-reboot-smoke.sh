#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://voxora.integraretech.com.br}"
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:62011}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
PM2_SERVICE="${PM2_SERVICE:-pm2-ubuntu}"
RUN_E2E="${RUN_E2E:-0}"

check_http_ok() {
  local url="$1"
  local label="$2"
  local status

  status="$(curl -sk -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$status" != "200" ]]; then
    echo "[post-reboot-smoke] FAIL $label -> HTTP $status" >&2
    exit 1
  fi

  echo "[post-reboot-smoke] OK   $label -> HTTP 200"
}

require_pm2_process() {
  local name="$1"
  local pid

  pid="$(pm2 pid "$name" | tail -n 1 | tr -d '[:space:]')"
  if [[ -z "$pid" || "$pid" == "0" ]]; then
    echo "[post-reboot-smoke] FAIL pm2 process '$name' is not online" >&2
    exit 1
  fi

  echo "[post-reboot-smoke] OK   pm2 process '$name' online with pid $pid"
}

echo "[post-reboot-smoke] Checking system services"
[[ "$(systemctl is-active nginx)" == "active" ]] || { echo "[post-reboot-smoke] FAIL nginx inactive" >&2; exit 1; }
[[ "$(systemctl is-active "$PM2_SERVICE")" == "active" ]] || { echo "[post-reboot-smoke] FAIL $PM2_SERVICE inactive" >&2; exit 1; }
echo "[post-reboot-smoke] OK   nginx active"
echo "[post-reboot-smoke] OK   $PM2_SERVICE active"

echo "[post-reboot-smoke] Checking PM2 apps"
require_pm2_process "transcribe-api"
require_pm2_process "transcribe-worker"

if pm2 pid transcribe-web | tail -n 1 | grep -Eq '^[1-9][0-9]*$'; then
  echo "[post-reboot-smoke] FAIL transcribe-web should not run in production" >&2
  exit 1
fi
echo "[post-reboot-smoke] OK   transcribe-web absent from PM2 production runtime"

echo "[post-reboot-smoke] Checking listeners"
ss -ltn | grep -q ':62011 ' || { echo "[post-reboot-smoke] FAIL api port 62011 not listening" >&2; exit 1; }
if ss -ltn | grep -q ':62012 '; then
  echo "[post-reboot-smoke] FAIL preview port 62012 should not be listening" >&2
  exit 1
fi
echo "[post-reboot-smoke] OK   api port 62011 listening"
echo "[post-reboot-smoke] OK   preview port 62012 closed"

echo "[post-reboot-smoke] Checking HTTP health"
check_http_ok "$LOCAL_API_URL/health" "local api health"
check_http_ok "$BASE_URL/health" "public health"
check_http_ok "$BASE_URL/" "public web"

echo "[post-reboot-smoke] Checking Redis and queue"
[[ "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping)" == "PONG" ]] || { echo "[post-reboot-smoke] FAIL redis ping" >&2; exit 1; }
echo "[post-reboot-smoke] OK   redis ping"
printf '[post-reboot-smoke] Queue counts wait=%s active=%s failed=%s completed=%s\n' \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:wait)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:active)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:failed)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:completed)"

if [[ "$RUN_E2E" == "1" ]]; then
  echo "[post-reboot-smoke] Running end-to-end smoke"
  API_BASE_URL="$BASE_URL" npm run smoke:e2e
fi

echo "[post-reboot-smoke] All checks passed"
