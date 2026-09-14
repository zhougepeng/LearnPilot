#!/usr/bin/env bash
set -euo pipefail

archive=${1:?Usage: deploy.sh <image-tar.gz> <image-tag> <trusted-host>}
image=${2:?Usage: deploy.sh <image-tar.gz> <image-tag> <trusted-host>}
trusted_host=${3:?Usage: deploy.sh <image-tar.gz> <image-tag> <trusted-host>}
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
data_dir=${LEARNPILOT_DATA_DIR:-/var/lib/learnpilot}
legacy_home=${LEARNPILOT_LEGACY_HOME:-"$HOME/.dsh"}
container_user=${LEARNPILOT_CONTAINER_USER:-1000:1000}

[[ -r "$archive" ]] || { echo "image archive is not readable: $archive" >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed. Install Docker before deploying LearnPilot." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }

sudo install -d -o "${container_user%%:*}" -g "${container_user##*:}" -m 0750 "$data_dir/dsh"
if [[ -d "$legacy_home" && ! -e "$data_dir/.legacy-dsh-migrated" ]]; then
  if [[ -n "$(find "$data_dir/dsh" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "refusing to merge legacy data into non-empty $data_dir/dsh" >&2
    exit 1
  fi
  sudo cp -a "$legacy_home/." "$data_dir/dsh/"
  sudo chown -R "$container_user" "$data_dir/dsh"
  sudo touch "$data_dir/.legacy-dsh-migrated"
fi

gzip -dc "$archive" | sudo docker load
sudo env \
  LEARNPILOT_IMAGE="$image" \
  LEARNPILOT_TRUSTED_HOST="$trusted_host" \
  LEARNPILOT_DATA_DIR="$data_dir" \
  docker compose -f "$root/compose.yaml" up -d --remove-orphans

for _ in $(seq 1 30); do
  status=$(curl --connect-timeout 2 --max-time 5 --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3081/ || true)
  case "$status" in
    200|302|401)
      echo "LearnPilot is listening on http://127.0.0.1:3081/ (HTTP $status)"
      exit 0
      ;;
  esac
  sleep 2
done

sudo docker compose -f "$root/compose.yaml" logs --tail=120 learnpilot >&2 || true
echo "LearnPilot did not become reachable on 127.0.0.1:3081." >&2
exit 1
