# LearnPilot Linux package

For a Linux server, use the tested Docker release described in [`../docker/README.md`](../docker/README.md). The `.deb` and `.tar.gz` below remain useful as local installer artifacts, but they are not the production-server release path.

The Linux artifact includes the self-contained executable and a complete Node runtime carrier. On servers that already provide Node.js, the launcher uses the carrier for reliable dynamic profile loading; otherwise it falls back to the single-file executable.

Install the `.deb` package with:

```sh
sudo apt install ./learnpilot-linux-x64.deb
```

Then start the local web service:

```sh
learnpilot
```

The default address is `http://127.0.0.1:3081/`. Set `LEARNPILOT_PORT` to use another port.

The package is built on Ubuntu by `.github/workflows/learnpilot-linux.yml`. It does not include local `.dsh-home` data, credentials, model keys, or homework history.

## 发布新版本

正式发布使用 GitHub Actions，不需要在本机安装 Linux 打包环境：

1. 打开仓库的 **Actions**，选择 **LearnPilot Linux package**。
2. 点击 **Run workflow**，分支选择 `master`。
3. 在 `Release tag` 输入一个没有使用过的版本号，例如 `v0.1.0`，然后点击 **Run workflow**。
4. 工作流成功后，打开仓库的 **Releases**，进入对应版本即可下载 `.deb` 或 `.tar.gz`。

版本号必须使用 `v主版本.次版本.修订版本` 格式，已存在的 tag 不要重复使用。推送代码到 `master` 会自动执行一次构建验证，但不会创建正式 Release；只有通过 **Run workflow** 并填写版本号才会发布。
