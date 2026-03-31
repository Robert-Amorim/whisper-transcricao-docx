#!/usr/bin/env bash
set -euo pipefail

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "[redis-preflight] Redis version"
redis-server --version
echo

echo "[redis-preflight] Service state"
systemctl is-active redis-server
systemctl is-enabled redis-server
echo

echo "[redis-preflight] INFO server"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO server | sed -n '1,20p'
echo

echo "[redis-preflight] Persistence config"
for key in appendonly dir dbfilename appendfilename save; do
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET "$key"
done
echo

echo "[redis-preflight] Persistence info"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO persistence | sed -n '1,30p'
echo

echo "[redis-preflight] Memory info"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory | sed -n '1,30p'
echo

echo "[redis-preflight] Clients info"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO clients | sed -n '1,20p'
echo

echo "[redis-preflight] Queue counts"
printf 'wait=%s active=%s failed=%s completed=%s\n' \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:wait)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:active)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:failed)" \
  "$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ZCARD bull:transcriptions:completed)"
echo

echo "[redis-preflight] Disk availability"
df -h /
