#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -x .tools/venv/bin/python ]]; then
  echo 'Run bash scripts/agents/setup-vibetest.sh first.' >&2
  exit 1
fi
exec .tools/venv/bin/python scripts/agents/run-vibetest.py
