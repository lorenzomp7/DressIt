#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
version=v0.4.2
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_amd64 ;;
  Linux-aarch64) platform=linux_arm64 ;;
  Darwin-x86_64) platform=darwin_amd64 ;;
  Darwin-arm64) platform=darwin_arm64 ;;
  *) echo 'Unsupported platform: install container-use using the upstream instructions.' >&2; exit 1 ;;
esac
mkdir -p .tools/bin
archive="container-use_${version}_${platform}.tar.gz"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
base="https://github.com/dagger/container-use/releases/download/$version"
curl --fail --silent --show-error --location --max-time 120 "$base/$archive" -o "$work/$archive"
curl --fail --silent --show-error --location --max-time 120 "$base/checksums.txt" -o "$work/checksums.txt"
python3 - "$work" "$archive" <<'PY'
import hashlib, pathlib, sys
root, name = pathlib.Path(sys.argv[1]), sys.argv[2]
expected = next(line.split()[0] for line in (root/'checksums.txt').read_text().splitlines() if line.split()[-1] == name)
actual = hashlib.sha256((root/name).read_bytes()).hexdigest()
if actual != expected: sys.exit('container-use checksum mismatch')
PY
tar -xzf "$work/$archive" -C .tools/bin container-use
.tools/bin/container-use version
