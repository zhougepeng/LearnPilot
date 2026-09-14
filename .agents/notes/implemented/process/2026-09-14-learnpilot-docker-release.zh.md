# Agent Note: LearnPilot Docker 发布

Status: implemented

[English](2026-09-14-learnpilot-docker-release.md) | 中文

## 问题

LearnPilot 的 Web profile 会在运行时动态导入插件模块。Linux 单文件可执行包及其复制的 Node 运行目录曾反复缺少运行文件或包元数据，因此构建虽然结束，服务器仍会在监听 3081 端口前失败。Linux 发布需要在运营人员下载前，证明真实 Web 进程可以从干净环境启动。

## 决策

LearnPilot 支持的 Linux 服务器发布方式是 Docker 镜像。镜像在完整工作区执行 `pnpm run build:official` 后构建，保留工作区与 `node_modules` 布局，不依赖单文件可执行包。入口通过支持的 `dsh --profile web` 启动应用，并把持久化的 `DSH_HOME` 明确放在 `/data` 下。

GitHub Actions 的 `LearnPilot Docker image` 工作流会在 Linux 上构建镜像，用空的数据挂载目录启动一个容器，并等待 3081 端口返回 HTTP 响应。只有通过检查的手动运行才会把镜像归档上传到指定 GitHub Release。服务器通过 Docker Compose 加载归档，3081 只绑定到 loopback，继续由已有 Nginx 对外转发。

部署脚本只会在目标目录为空且不存在迁移标记时，把原来的 `~/.dsh` 迁移到 `/var/lib/learnpilot/dsh`。后续版本复用这个挂载目录，绝不替换其中的数据。

## 考虑过的替代方案

**继续修补单文件可执行包。** 可执行包可以完成打包，却会在动态模块解析时失败。继续补拷贝资源无法证明未来的动态导入或包内元数据仍然完整，因此不能满足服务器发布的可靠性目标。

**在生产服务器上构建。** 服务器构建会让部署字节依赖可变的系统包和可用磁盘空间。在 GitHub 构建并冒烟检查一个归档，可以让服务器加载同一批已验证的字节。

**只发布到镜像仓库。** 当仓库私有时，镜像仓库要求服务器持有读取凭据。Release 归档可以下载并加载，不需要在服务器配置中写入这种凭据。

## 后果

首次部署需要服务器安装 Docker Engine 和 Compose v2，归档也会比单文件可执行包更大。作为交换，发布候选包含浏览器 profile 实际需要的模块布局，并会在到达 Nginx 前于 GitHub 失败。

现有 `.deb` 工作流仍可用于本地安装试验，但不能作为公开 Web 服务可部署的证据。一次发布只有在镜像冒烟检查通过、服务器脚本观察到本地 HTTP 响应、且 Nginx 地址不再返回 502 后才算完成。