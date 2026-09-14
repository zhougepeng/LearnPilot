#!/usr/bin/env bash
set -euo pipefail

version=${1:-0.1.0}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
binary="$root/dist-exe/deepseek-harness-sdk-runtime-linux-x64"
ripgrep="$binary-rg"
node_runtime="$root/python/sdk-runtime/src/deepseek_harness_runtime/runtime/node"
out="$root/dist-linux"
stage="$out/deb"

[[ -x "$binary" ]] || { echo "missing Linux executable: $binary" >&2; exit 1; }
[[ -x "$ripgrep" ]] || { echo "missing ripgrep sidecar: $ripgrep" >&2; exit 1; }
[[ -f "$node_runtime/node_modules/@deepseek-ai/dsh/lib/bin.js" ]] || {
  echo "missing Node runtime carrier: $node_runtime" >&2
  exit 1
}

rm -rf "$out"
mkdir -p "$stage/opt/learnpilot" "$stage/usr/bin" "$stage/DEBIAN"
install -m 0755 "$binary" "$stage/opt/learnpilot/"
install -m 0755 "$ripgrep" "$stage/opt/learnpilot/"
install -m 0755 "$root/packaging/linux/learnpilot" "$stage/opt/learnpilot/learnpilot"
mkdir -p "$stage/opt/learnpilot/runtime"
cp -a "$node_runtime" "$stage/opt/learnpilot/runtime/node"
ln -s /opt/learnpilot/learnpilot "$stage/usr/bin/learnpilot"

cat > "$stage/DEBIAN/control" <<EOF
Package: learnpilot
Version: $version
Section: education
Priority: optional
Architecture: amd64
Maintainer: LearnPilot contributors
Description: AI-assisted homework and learning workspace
 LearnPilot organizes homework and provides chapter study support.
EOF

dpkg-deb --build "$stage" "$out/learnpilot-linux-x64.deb" >/dev/null
tar -C "$stage/opt" -czf "$out/learnpilot-linux-x64.tar.gz" learnpilot
echo "created $out/learnpilot-linux-x64.deb"
echo "created $out/learnpilot-linux-x64.tar.gz"
