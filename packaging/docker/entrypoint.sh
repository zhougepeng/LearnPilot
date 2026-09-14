#!/usr/bin/env sh
set -eu

port=${LEARNPILOT_PORT:-3081}

if [ -n "${LEARNPILOT_TRUSTED_HOST:-}" ]; then
  exec pnpm dsh --profile web --port "$port" --no-open --trusted-host "$LEARNPILOT_TRUSTED_HOST" "$@"
fi

exec pnpm dsh --profile web --port "$port" --no-open "$@"
