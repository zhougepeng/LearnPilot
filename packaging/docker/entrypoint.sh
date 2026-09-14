#!/usr/bin/env sh
set -eu

port=${LEARNPILOT_PORT:-3081}

if [ -n "${LEARNPILOT_TRUSTED_HOST:-}" ]; then
  exec node --import tsx/esm apps/cli/src/bin.ts --profile web --port "$port" --no-open --trusted-host "$LEARNPILOT_TRUSTED_HOST" "$@"
fi

exec node --import tsx/esm apps/cli/src/bin.ts --profile web --port "$port" --no-open "$@"
