#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
git submodule update --init tools/vibetest-use
uv venv --allow-existing .tools/venv
uv pip sync --python .tools/venv/bin/python tools/vibetest-requirements.txt
.tools/venv/bin/python -m playwright install chromium
