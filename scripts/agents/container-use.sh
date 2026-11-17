#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -x .tools/bin/container-use ]]; then
  echo 'Run npm run agent:container:setup first.' >&2
  exit 1
fi
if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo 'container-use needs a running Docker daemon. Use the Agent runtime CI job on GitHub if this host does not support Docker.' >&2
  exit 1
fi
exec .tools/bin/container-use "$@"
