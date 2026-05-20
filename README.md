# Companion Web Dashboard

Live, browser-based dashboards for [Bitfocus Companion](https://bitfocus.io/companion) variables. Build dashboards in a browser, view them on any device on your network, optionally use cells and panels as Companion buttons.

Inspired by [tomhillmeyer/companion-dashboard](https://github.com/tomhillmeyer/companion-dashboard) — same idea, runs as a local webserver instead of a single-window desktop app.

## Current features

- Multiple dashboards, each with free-positioned panels (drag to move, drag corners to resize)
- Panels = optional header + rows × cols grid of cells, like editing a table
- Cells support markdown, HTML, and `$(connection:variable)` references
- Conditional styling per cell — change bg/text/border colors when a variable matches a condition (eq, neq, contains, gt, lt, regex, etc.)
- Variable autocomplete: type `$` in any text field to filter/insert variables
- Cell and panel buttons that fire Companion presses, in Press or Toggle (step) mode
- Focus mode: auto-zoom one panel to fill the canvas when a condition becomes true (e.g. video time remaining < 10s)
- Reusable panel templates
- Multi-device viewing — open the viewer URL on any device on your LAN

## Downloads

Latest release: **[github.com/iceyfire95/Companion-Dash/releases/latest](https://github.com/iceyfire95/Companion-Dash/releases/latest)**

| Platform | File |
|---|---|
| macOS Apple Silicon (M1/M2/M3/M4) | `Companion Web Dashboard-X.Y.Z-arm64.dmg` |
| macOS Intel | `Companion Web Dashboard-X.Y.Z-intelmac.dmg` |
| Windows x64 | `Companion Web Dashboard-X.Y.Z-x64.exe` (portable) |
| Raspberry Pi (64-bit) | `companion-web-dashboard_X.Y.Z_arm64.deb` |

**The macOS and Windows alpha builds are unsigned.** On first launch:

- **macOS:** right-click the app → **Open** → **Open** (gets past "cannot be opened because Apple cannot check it")
- **Windows:** SmartScreen → **More info** → **Run anyway**

After first launch they open normally.

## Running on a Raspberry Pi

The `.deb` is self-contained — it bundles its own Node.js runtime and has no external dependencies. Designed to sit alongside [companion-pi](https://github.com/bitfocus/companion-pi) on the same device, but it works on any 64-bit Debian/Raspberry Pi OS install.

Requirements: Raspberry Pi 4 or 5 running 64-bit Raspberry Pi OS (or any Debian 12+ arm64).

Install:

```bash
sudo apt install ./companion-web-dashboard_X.Y.Z_arm64.deb
```

Run in the foreground:

```bash
companion-web-dashboard
```

Or run as a service that auto-starts on boot:

```bash
sudo systemctl start companion-web-dashboard
sudo systemctl enable companion-web-dashboard
sudo systemctl status companion-web-dashboard
journalctl -u companion-web-dashboard -f         # tail logs
```

Then open `http://<pi-ip>:3000` from any device on the LAN.

Data is stored under `$HOME/.companion-web-dashboard/data.db`. Override with `CWD_DB_PATH=/somewhere/data.db` or change the port with `PORT=8080`.

To uninstall:

```bash
sudo apt remove companion-web-dashboard
```

User data is preserved on uninstall.

## Planned features

- Authentication / multi-user permissions
- Code-signed builds (no more first-launch warnings)
- Persistent toggle button state across restarts
- Expression operators in variable references (math, formatting)
- Multi-page dashboards
- Custom fonts
- Embedded video / iframe cells
- Docker image for the Pi / Linux build