# LearnPilot Linux package

The Linux artifact is a self-contained Node executable with the LearnPilot web profile. It does not require Node.js or pnpm on the target machine.

Install the `.deb` package with:

```sh
sudo apt install ./learnpilot-linux-x64.deb
```

Then start the local web service:

```sh
learnpilot
```

The default address is `http://127.0.0.1:3081/`. Set `LEARNPILOT_PORT` to use another port.

The package is built on Ubuntu by `.github/workflows/learnpilot-linux.yml`. The bundled executable is produced from the supported `dsh --profile web` launcher; it does not include local `.dsh-home` data, credentials, model keys, or homework history.
