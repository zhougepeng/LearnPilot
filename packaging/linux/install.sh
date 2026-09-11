#!/usr/bin/env sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root: sudo ./install.sh" >&2
  exit 1
fi

package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
install_dir=/opt/learnpilot

install -d -m 0755 "$install_dir"
install -m 0755 "$package_dir/deepseek-harness-sdk-runtime-linux-x64" "$install_dir/deepseek-harness-sdk-runtime-linux-x64"
install -m 0755 "$package_dir/deepseek-harness-sdk-runtime-linux-x64-rg" "$install_dir/deepseek-harness-sdk-runtime-linux-x64-rg"
install -m 0755 "$package_dir/learnpilot" "$install_dir/learnpilot"
ln -sfn "$install_dir/learnpilot" /usr/local/bin/learnpilot

echo "LearnPilot installed. Start it with: learnpilot"
