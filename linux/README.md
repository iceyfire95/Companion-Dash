# Linux / Raspberry Pi Build

Self-contained Debian package for `linux/arm64` (Raspberry Pi 4/5 with 64-bit OS).

## What it ships

- `/opt/companion-web-dashboard/` — app + bundled Node 22 binary, server dist, server `node_modules`, client dist
- `/usr/bin/companion-web-dashboard` — launcher on PATH
- `/lib/systemd/system/companion-web-dashboard.service` — systemd unit (not auto-enabled)

User data lives at `$HOME/.companion-web-dashboard/data.db`.

No runtime dependencies — Node is bundled. The `.deb` declares no `Depends:`.

## Build (from a Mac)

```bash
brew install dpkg   # one-time
npm run linux:build
```

Output: `electron/out/companion-web-dashboard_<version>_arm64.deb`

The Node tarball is cached under `linux/.build/cache/` so rebuilds are quick.

## Install on the Pi

Copy the `.deb` to the Pi, then:

```bash
sudo apt install ./companion-web-dashboard_*_arm64.deb
```

(Using `apt install ./file.deb` instead of `dpkg -i` gives nicer error output but
since the package has no dependencies, either works.)

## Run

Manual (foreground, easiest for first try):

```bash
companion-web-dashboard
```

As a service:

```bash
sudo systemctl start companion-web-dashboard
sudo systemctl enable companion-web-dashboard   # auto-start on boot
sudo systemctl status companion-web-dashboard
journalctl -u companion-web-dashboard -f         # tail logs
```

Open `http://<pi-ip>:3000` from any device on the LAN.

## Uninstall

```bash
sudo apt remove companion-web-dashboard
```

User data under `$HOME/.companion-web-dashboard/` is preserved.

## Notes

- Service runs as `root` by default. To run as a normal user, override:
  `sudo systemctl edit companion-web-dashboard` and add `[Service]\nUser=youruser`
- Override port with `PORT=8080 companion-web-dashboard` or via systemd `Environment=`.
- Override DB location with `CWD_DB_PATH=/somewhere/data.db`.
