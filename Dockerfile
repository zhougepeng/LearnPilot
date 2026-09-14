# LearnPilot runs from the complete built workspace. The browser profile resolves
# plugin modules at runtime, so this image intentionally preserves the workspace
# layout instead of repackaging it as a single executable.
FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install --yes --no-install-recommends python3 make g++ git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app
COPY . .

ARG DSH_CLIENT_COMMIT_HASH
RUN test -n "$DSH_CLIENT_COMMIT_HASH" \
  && pnpm install --frozen-lockfile \
  && DSH_CLIENT_COMMIT_HASH="$DSH_CLIENT_COMMIT_HASH" pnpm run build:lib \
  && pnpm exec tsdown --config packaging/docker/vendor-runtime.tsdown.ts \
  && DSH_CLIENT_COMMIT_HASH="$DSH_CLIENT_COMMIT_HASH" pnpm run build:official

FROM node:24-bookworm-slim AS runtime

ARG LEARNPILOT_VERSION=dev

ENV DSH_HOME=/data/dsh
ENV DSH_TELEMETRY_DISABLED=1

LABEL org.opencontainers.image.title="LearnPilot"
LABEL org.opencontainers.image.description="AI-assisted homework and learning workspace"
LABEL org.opencontainers.image.version="$LEARNPILOT_VERSION"

RUN mkdir -p /data/dsh \
  && chown -R node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN chmod 0755 /app/packaging/docker/entrypoint.sh

USER node
EXPOSE 3081
VOLUME ["/data"]

ENTRYPOINT ["./packaging/docker/entrypoint.sh"]
