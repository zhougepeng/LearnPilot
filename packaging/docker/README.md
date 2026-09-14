# LearnPilot Docker deployment

The Docker image is the supported Linux-server release path. It retains the built workspace and its real module layout, which lets the `web` profile load plugins at runtime. The older Linux `.deb` and `.tar.gz` are still desktop-style artifacts; they are not the server deployment route.

## Build and release

1. In GitHub Actions, open **LearnPilot Docker image**.
2. Click **Run workflow**, select `master`, and enter a new release tag such as `v0.2.0`.
3. The workflow builds the image, starts it with a clean persistent-data directory, and checks that port 3081 returns an HTTP response.
4. On success, the GitHub Release contains `learnpilot-v0.2.0-linux-x64.tar.gz`.

The workflow refuses malformed tags and does not publish a release when its startup check fails.

## Server deployment

The server needs Docker Engine and Docker Compose v2. Download the release archive to the server, then run:

```sh
bash /opt/learnpilot-docker/deploy.sh \
  /tmp/learnpilot-v0.2.0-linux-x64.tar.gz \
  learnpilot:v0.2.0 \
  47.85.37.105
```

`deploy.sh` copies the previous `~/.dsh` directory into `/var/lib/learnpilot/dsh` only once, before starting the container. It assigns that directory to the container user so settings and session data remain writable after migration. The container binds only to `127.0.0.1:3081`; the existing Nginx reverse proxy remains the public entry point.

Completion means the script reports an HTTP response from `127.0.0.1:3081`, and the public Nginx address no longer returns 502.
