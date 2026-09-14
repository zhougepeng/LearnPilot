# Agent Note: LearnPilot Docker release

Status: implemented

English | [中文](2026-09-14-learnpilot-docker-release.zh.md)

## Problem

LearnPilot's web profile imports plugin modules dynamically. The Linux single-file executable and its copied Node carrier repeatedly omitted runtime files or package metadata, so a build could finish while the server later failed before binding port 3081. A Linux release needs to prove the real web process starts from a clean environment before an operator downloads it.

## Decision

LearnPilot's supported Linux-server release is a Docker image built from the full workspace after `pnpm run build:official`. The image preserves the workspace and `node_modules` layout rather than relying on the single-file executable. Its entrypoint starts the supported `dsh --profile web` application with an explicit persistent `DSH_HOME` under `/data`.

The `LearnPilot Docker image` GitHub Actions workflow builds the image on Linux, starts one container with an empty mounted data directory, and waits for an HTTP response from port 3081. Only a passing manual run uploads the image archive to the requested GitHub Release. The archive is loaded on the server through Docker Compose, which binds 3081 only on loopback for the existing Nginx proxy.

The deployment script migrates the former `~/.dsh` directory into `/var/lib/learnpilot/dsh` only when the target directory is empty and no migration marker exists. Later releases reuse that mounted directory and never replace it.

## Alternatives considered

**Continue repairing the single-file executable.** The executable passed packaging but failed during dynamic module resolution. Further asset copying would not prove that future dynamic imports or package-local metadata remain present, so it does not meet the server-release reliability goal.

**Build on the production server.** A server build makes the deployed bytes depend on mutable system packages and available disk space. Building and smoke-testing one archive in GitHub gives the server the same bytes that passed startup validation.

**Publish only to a container registry.** A registry requires the server to hold a read credential when the repository is private. A release archive can be downloaded and loaded without embedding such a credential in the server configuration.

## Consequences

The first deployment requires Docker Engine and Compose v2 on the server, and the release archive is larger than a single executable. In return, a release candidate contains the actual module layout needed by the browser profile and fails in GitHub before it reaches Nginx.

The existing `.deb` workflow remains available for local installation experiments, but it is not evidence that the public web service is deployable. A release is complete only after the image smoke test passes, the server script observes a local HTTP response, and the Nginx address no longer returns 502.