# macOS Packaging

This folder wraps the web server + React UI in an Electron menu-bar app, then
uses `electron-builder` to produce a signed and notarized `.dmg` for
distribution.

## App behaviour

- Launches into the **menu bar** (no Dock icon, no auto-opening window),
  similar to Bitfocus Companion itself.
- Server runs silently in the background on port 3000 (auto-picks another
  port if 3000 is taken).
- Click the menu-bar icon for: **Open Editor in Browser**, **Copy Server URL**,
  **Show Status Window**, **Restart Server**, **Quit**.
- A small status window appears on first launch showing server state and a
  one-click "Open in browser" button. Closing it leaves the server running.
- Quitting the app stops the server.

## Run as a desktop app in dev

```bash
# from repo root
npm run mac:dev
```

This builds client + server, then runs Electron pointing at the dev build.
Window opens automatically. Closing it quits the server.

## Unsigned local build (no Apple Developer account needed)

Produces a `.app` and `.dmg` you can run on YOUR mac. Other macs will get a
Gatekeeper warning ("can't verify the developer"). Recipients can right-click
the app → Open to bypass.

```bash
npm run mac:pack    # quick build, app bundle only, no dmg
# or
npm run mac:build   # full: signs locally if a Developer ID is present, makes dmg + zip
```

Output: `electron/out/`. After building, run
`npm run mac:rehydrate-server` to restore server devDependencies that were
pruned during the build.

## Signed + notarized release build (Apple Developer Program required)

### One-time setup

1. **Apple Developer Program enrollment** — $99/year at
   <https://developer.apple.com/programs/>.

2. **Developer ID Application certificate** — In Xcode → Settings → Accounts,
   add your Apple ID, select your team, click Manage Certificates, then `+` →
   "Developer ID Application". The certificate auto-installs into your login
   keychain. Verify with:

   ```bash
   security find-identity -v -p codesigning
   ```

   You should see a line like
   `1) ABC123... "Developer ID Application: Your Name (TEAMID)"`.

3. **App-specific password** — Go to <https://appleid.apple.com> → Sign-In and
   Security → App-Specific Passwords → Generate. Save it; you can't view it
   again. Used for notarization.

4. **Team ID** — Find at <https://developer.apple.com/account> → Membership
   details. 10 character string like `ABCDE12345`.

### Build a signed + notarized release

Set env vars and run:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"

npm run mac:build:signed
```

`electron-builder` will:

1. Code-sign the `.app` with your Developer ID certificate
2. Upload the signed app to Apple's notary service via `notarytool`
3. Wait for Apple's response (usually 1-5 minutes)
4. Staple the notarization ticket to the `.app`
5. Build a `.dmg` containing the signed + stapled app

The output `.dmg` opens cleanly on any modern Mac with no warnings.

### Verify a signed build

```bash
codesign --verify --deep --strict --verbose=2 "electron/out/mac-arm64/Companion Web Dashboard.app"
spctl --assess --type execute --verbose "electron/out/mac-arm64/Companion Web Dashboard.app"
xcrun stapler validate "electron/out/mac-arm64/Companion Web Dashboard.app"
```

All three should print "accepted" / "valid".

## App icon

Put an `icon.icns` at `electron/build/icon.icns`. See `electron/build/README-icon.md`
for how to create one from a 1024×1024 PNG. If absent, build uses the default
Electron icon (a grey rocket).

## How it works internally

- Electron main process (`electron/main.cjs`) is CommonJS.
- On `app.dock.hide()` (macOS), the app becomes a menu-bar accessory app
  with no Dock presence.
- A `Tray` is installed with a template PNG icon (`build/trayTemplate.png`,
  auto-inverted in light/dark mode).
- On startup it spawns the bundled Node server as a child process with
  `ELECTRON_RUN_AS_NODE=1`, which makes Electron's bundled Node run as plain
  Node (no Chromium, no Electron APIs).
- The server listens on `PORT` (default 3000, falls back to OS-assigned if
  3000 is taken).
- Main waits for `GET /api/health` to return 200, then enables the
  "Open Editor in Browser" menu item.
- Clicking it opens the user's default browser at `http://127.0.0.1:<port>/`.
- The optional status window (`Show Status Window` menu item) is an in-app
  Electron `BrowserWindow` with a small native UI showing status, URL, and
  Open / Copy / Restart buttons.

Why a child process and not in-process? The server is ESM
(`"type": "module"`), the Electron main process is CJS. Cleaner to keep them
separate processes. Bonus: server can be restarted independently via the
tray menu.

## Tray icon

The tray icon is a 22x22 template PNG (and 44x44 @2x) at
`build/trayTemplate.png` / `build/trayTemplate@2x.png`. Template images are
black + alpha only; macOS auto-tints them for the current menu bar style.

To customise: replace those two PNGs with your own 22×22 / 44×44 template
images.

## Troubleshooting

- **"can't be opened because Apple cannot check it for malicious software"**:
  the build wasn't notarized, or notarization stapling failed. Re-run with
  `--verbose` and check the notarytool log.
- **"app is damaged"**: usually from running an unsigned build downloaded via
  browser. The quarantine attribute breaks unsigned builds. Either sign +
  notarize, or `xattr -cr "/path/to/Companion Web Dashboard.app"`.
- **server fails to start**: check that `npm run build` (server + client) ran
  before `mac:build` and that `server/dist/index.js` exists.
- **node:sqlite not found**: Electron 35+ ships Node 22 which includes
  `node:sqlite`. If you're on older Electron, bump it in
  `electron/package.json`.
