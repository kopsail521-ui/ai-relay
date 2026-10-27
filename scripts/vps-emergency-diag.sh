#!/bin/bash
# Emergency read-only diagnostics: website is unreachable at TCP level.
# Collects container/Caddy/disk/memory state and sanitized log tails. Never
# prints keys/tokens/secrets; log output is filtered for credential-ish
# patterns before being shown.
set -uo pipefail
ROOT=/opt/ai-relay

echo "===== TIME ====="
date -u '+%Y-%m-%dT%H:%M:%SZ'

echo "===== DOCKER PS (all containers, name/status/restarts) ====="
docker ps -a --format '{{.Names}} | {{.Status}} | {{.Image}}' 2>&1 | head -40

echo "===== CADDY SYSTEMD ====="
systemctl is-active caddy 2>&1 || true
systemctl status caddy --no-pager -n 5 2>&1 | head -15 || true

echo "===== DOCKER HEALTHCHECK NAMES ====="
for c in ai-relay-new-api ai-relay-creem-moderation ai-relay-apimart-passthrough; do
  echo "-- $c"
  docker inspect --format '{{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} started={{.State.StartedAt}}' "$c" 2>&1 || echo "container missing"
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$c" 2>&1 || true
done

echo "===== LISTEN PORTS 3000/3001/3011/80/443 ====="
ss -ltnp 2>/dev/null | grep -E ':(3000|3001|3011|80|443)\b' | sed 's/ users:.*//' | head -20 || true

echo "===== DISK ====="
df -h / /opt/ai-relay 2>&1 | head -5
echo "--- top disk consumers ---"
du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -rh | head -10
du -sh "$ROOT/data" /opt/ai-relay/data/new-api/one-api.db* /opt/ai-relay/static/uploads 2>/dev/null | sort -rh | head -10
echo "--- docker daemon log rotation config ---"
docker info --format '{{.LoggingDriver}}' 2>&1 || true
cat /etc/docker/daemon.json 2>/dev/null | head -20 || echo "no /etc/docker/daemon.json"
echo "--- WAL/journal sizes ---"
ls -lh /opt/ai-relay/data/new-api/one-api.db* 2>/dev/null | head -5
journalctl --disk-usage 2>&1 | head -2 || true
echo "===== MEMORY ====="
free -m 2>&1 | head -3
echo "--- top memory processes (host) ---"
ps aux --sort=-%mem 2>/dev/null | head -12 | awk '{printf "%s %s %s %s %s\n", $2, $3, $4, $6/1024"MB", $11}'
echo "--- container memory usage ---"
docker stats --no-stream --format '{{.Name}} mem={{.MemUsage}} cpu={{.CPUPerc}}' 2>&1 | head -10

echo "===== NEW-API LOG TAIL (sanitized) ====="
docker logs --tail 30 ai-relay-new-api 2>&1 | sed -E 's/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/\1***/gi; s/(Bearer )[^ ]+/\1***/gi; s/(Authorization[^:]*: )[^ ]+/\1***/gi' | tail -30

echo "===== CADDY LOG TAIL ====="
journalctl -u caddy --no-pager -n 20 2>&1 | sed -E 's/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/\1***/gi' | tail -20 || true

echo "===== MODERATION PROXY LOG TAIL (sanitized) ====="
docker logs --tail 20 ai-relay-creem-moderation 2>&1 | sed -E 's/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/\1***/gi' | tail -20

echo "===== APIMART LOG TAIL (sanitized) ====="
docker logs --tail 20 ai-relay-apimart-passthrough 2>&1 | sed -E 's/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/\1***/gi' | tail -20

echo "===== LOCAL PROBES ====="
curl -sS -o /dev/null -w "local_3000_status=%{http_code}\n" --max-time 5 http://127.0.0.1:3000/api/status 2>&1 || echo "local_3000_status=UNREACHABLE"
curl -sS -o /dev/null -w "local_3001_status=%{http_code}\n" --max-time 5 http://127.0.0.1:3001/healthz 2>&1 || echo "local_3001_status=UNREACHABLE"
curl -sS -o /dev/null -w "local_3011_status=%{http_code}\n" --max-time 5 http://127.0.0.1:3011/healthz 2>&1 || echo "local_3011_status=UNREACHABLE"

echo "===== DONE_EMERGENCY_DIAG ====="