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

**These alpha builds are unsigned.** On first launch:

- **macOS:** right-click the app → **Open** → **Open** (gets past "cannot be opened because Apple cannot check it")
- **Windows:** SmartScreen → **More info** → **Run anyway**

After first launch they open normally.

## Planned features

- Authentication / multi-user permissions
- Code-signed builds (no more first-launch warnings)
- Persistent toggle button state across restarts
- Expression operators in variable references (math, formatting)
- Multi-page dashboards
- Custom fonts
- Embedded video / iframe cells