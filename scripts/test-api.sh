#!/usr/bin/env bash
# Runs every Postman collection in postman/collections/ against the local API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000/api}"
MCP_URL="${MCP_URL:-http://127.0.0.1:8000/mcp}"

TOKEN="${API_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$ROOT/backend/.env" ]; then
  TOKEN="$(sed -n 's/^API_TOKEN=//p' "$ROOT/backend/.env" | tail -n 1 | tr -d "\"'\r")"
fi
if [ -z "$TOKEN" ]; then
  echo "No API_TOKEN: export it or set it in backend/.env" >&2
  exit 1
fi

# Any HTTP answer (even 401) means the API is up; curl prints 000 when nothing listens.
status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE_URL/tasks" || true)"
if [ "$status" = "000" ]; then
  echo "API not reachable at $BASE_URL: start it with \`make dev\`" >&2
  exit 1
fi

failed=()
passed=()
skipped=()
for dir in "$ROOT"/postman/collections/*/; do
  name="$(basename "$dir")"
  # A collection without requests runs 0 assertions and exits 0: it must not count as a pass.
  if [ -z "$(find "$dir" -name '*.request.yaml' -print -quit)" ]; then
    skipped+=("$name")
    continue
  fi
  echo "=== $name ==="
  # --env-var takes precedence over the collection-level baseUrl variable.
  if postman collection run "$dir" \
      --env-var "apiToken=$TOKEN" \
      --env-var "baseUrl=$BASE_URL" \
      --env-var "mcpUrl=$MCP_URL"; then
    passed+=("$name")
  else
    failed+=("$name")
  fi
done

echo
echo "Summary: ${#passed[@]} passed, ${#failed[@]} failed, ${#skipped[@]} skipped (no request)"
for n in ${passed[@]+"${passed[@]}"}; do echo "  PASS  $n"; done
for n in ${failed[@]+"${failed[@]}"}; do echo "  FAIL  $n"; done
for n in ${skipped[@]+"${skipped[@]}"}; do echo "  SKIP  $n"; done
[ "${#failed[@]}" -eq 0 ] && [ "${#passed[@]}" -gt 0 ]
