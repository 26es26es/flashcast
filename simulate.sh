#!/bin/bash

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
DURATION=30
RATE=100
CLICK_RATE=10

usage() {
  cat <<EOF
Usage: $0 [--duration=<seconds>] [--rate=<req/sec>] [--click-rate=<percent>]

  --duration     How long to run, in seconds.            (default: ${DURATION})
  --rate         Ad-slot requests generated per second.  (default: ${RATE})
  --click-rate   Chance a served ad is clicked, 0-100.   (default: ${CLICK_RATE})

Environment:
  BASE_URL       Gateway address. (default: ${BASE_URL})
EOF
}

for arg in "$@"; do
  case "$arg" in
    --duration=*)   DURATION="${arg#*=}"   ;;
    --rate=*)       RATE="${arg#*=}"       ;;
    --click-rate=*) CLICK_RATE="${arg#*=}" ;;
    -h|--help)      usage; exit 0          ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

for pair in "duration:$DURATION" "rate:$RATE" "click-rate:$CLICK_RATE"; do
  name="${pair%%:*}"
  value="${pair#*:}"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "--${name} must be a non-negative integer (got: ${value})" >&2
    exit 1
  fi
done

if [ "$RATE" -eq 0 ]; then
  echo "--rate must be greater than zero." >&2
  exit 1
fi
if [ "$CLICK_RATE" -gt 100 ]; then
  echo "--click-rate must be between 0 and 100 (got: ${CLICK_RATE})." >&2
  exit 1
fi

CATEGORIES=(gaming sports music tech finance)
INTERVAL=$(awk -v r="$RATE" 'BEGIN { printf "%.6f", 1 / r }')

echo "Starting FlashCast real-time traffic simulator..."
echo "  target      : ${BASE_URL}"
echo "  duration    : ${DURATION}s"
echo "  rate        : ${RATE} req/s (one request every ${INTERVAL}s)"
echo "  click-rate  : ${CLICK_RATE}%"
echo "Press [CTRL+C] to stop early."
echo "-----------------------------------------------"

SENT=0

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping simulator, waiting for in-flight requests..."
  local child
  for child in $(jobs -p 2>/dev/null); do
    kill "$child" 2>/dev/null
  done
  wait 2>/dev/null
  echo "Done. Sent ${SENT} ad-slot requests."
}
trap cleanup INT TERM EXIT

fire() {
  local category="$1"
  local click_rate="$2"

  local response
  response=$(curl -s -m 5 -X POST "${BASE_URL}/decisions" \
    -H "Content-Type: application/json" \
    -d "{\"category\": \"${category}\"}") || return 0

  local campaign_id
  campaign_id=$(printf '%s' "$response" | grep -o '"campaign_id":[0-9]*' | head -1 | cut -d: -f2)
  [ -z "$campaign_id" ] && return 0
  [ "$campaign_id" -eq 0 ] 2>/dev/null && return 0

  if [ "$click_rate" -gt 0 ] && [ $((RANDOM % 100)) -lt "$click_rate" ]; then
    curl -s -m 5 -o /dev/null -X POST "${BASE_URL}/decisions/click" \
      -H "Content-Type: application/json" \
      -d "{\"campaign_id\": ${campaign_id}}" || true
  fi
}

END=$(( SECONDS + DURATION ))

while [ "$SECONDS" -lt "$END" ]; do
  fire "${CATEGORIES[$((RANDOM % ${#CATEGORIES[@]}))]}" "$CLICK_RATE" &
  SENT=$((SENT + 1))
  sleep "$INTERVAL"
done

wait 2>/dev/null
