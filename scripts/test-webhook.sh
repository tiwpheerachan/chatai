#!/usr/bin/env bash
# Test ingest webhook (no real platform required)
# Requires INGEST_SECRET to be set on the server and exported here.
set -e
URL=${URL:-http://localhost:3000}
: "${INGEST_SECRET:?Set INGEST_SECRET to match the server env}"

curl -s -X POST "$URL/api/webhooks/ingest" \
  -H "Content-Type: application/json" \
  -H "x-ingest-token: $INGEST_SECRET" \
  -d '{
    "channel":"line",
    "channel_user_id":"U_TEST_'"$RANDOM"'",
    "display_name":"ลูกค้าทดสอบ",
    "text":"ขอคืนเงินค่ะ ของผิดรุ่น",
    "brand_id":"11111111-1111-1111-1111-111111111111"
  }' | jq .
