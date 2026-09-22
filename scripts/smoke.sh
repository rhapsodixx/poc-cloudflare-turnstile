#!/usr/bin/env bash
# Exercises the non-browser branches of /api/otp/request.
# Usage: bun run smoke            (against http://localhost:5173)
#        BASE_URL=https://... bun run smoke
set -u
BASE="${BASE_URL:-http://localhost:5173}"
fails=0

post() { # $1=path $2=json  -> prints "<status> <body>"
  curl -s -o /tmp/smoke-body -w '%{http_code}' -X POST "$BASE$1" \
    -H 'content-type: application/json' -d "$2"
  printf ' '
  cat /tmp/smoke-body
}

check() { # $1=label $2=expected-status $3=expected-substring $4=path $5=json
  local out status
  out="$(post "$4" "$5")"
  status="${out%% *}"
  if [[ "$status" == "$2" && "$out" == *"$3"* ]]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1 -> $out (wanted $2 containing '$3')"
    fails=$((fails + 1))
  fi
}

echo "smoke against $BASE"
check 'unknown case'    400 'bad-request'               /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"nope"}'
check 'invalid phone'   422 'invalid-phone'             /api/otp/request '{"phone":"12","token":"dummy","simCase":"invalid-phone"}'
check 'missing token'   400 'missing-token'             /api/otp/request '{"phone":"081234567890","simCase":"missing-token"}'
check 'server rejects'  403 'invalid-input-response'    /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"server-rejects"}'
check 'token replay'    403 'timeout-or-duplicate'      /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"token-replay"}'

echo '  ... per-phone limit (4 requests, limit 3)'
curl -s -X POST "$BASE/api/sim/reset" -H 'content-type: application/json' -d '{"simCase":"per-phone"}' >/dev/null
for i in 1 2 3; do
  post /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}' >/dev/null
done
check 'per-phone 429'   429 'rate-limited'              /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}'
check 'reset clears'    200 '"ok":true'                 /api/sim/reset '{"simCase":"per-phone"}'
check 'after reset 200' 200 '"otpId"'                   /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}'

echo
if [[ $fails -eq 0 ]]; then echo "all smoke checks passed"; else echo "$fails smoke check(s) failed"; fi
exit $fails
