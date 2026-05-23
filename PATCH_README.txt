Companion-Dash v0.8.0-alpha — PIN-based editor lock
====================================================

Apply: from repo root, extract this tar.gz, accept overwrites.

    cd ~/Documents/git/companion-web-dashboard
    tar -xzvf companion-dash-v0.8.0-auth.tar.gz

Prerequisite: v0.7.0-alpha (this patch builds on that base).

No new npm dependencies. SQLite migration runs automatically on first
server boot — adds `auth_settings` (1-row config) and `sessions`
tables. Existing dashboards / panels / tally sources keep working
unchanged. **Auth defaults to OFF**: dashboard behaves exactly like
v0.7 until you opt in via Settings.

What's new
----------

**4-digit PIN gate for editing.**

* Viewer pages (`/view/:id`, `/tally`, `/tally/:slug`) and tally
  status are ALWAYS public — never require a PIN.
* Editing requires a PIN once you enable the lock: creating /
  modifying / deleting dashboards, panels, tally sources, watched
  variables, saved templates, Companion connection settings, and
  PIN-test button presses from the inspector.
* Viewer button presses (`POST /api/buttons/trigger`) are NOT
  gated — viewers still fire Companion buttons normally.
* `GET /api/settings/companion` is also gated (host+port shouldn't
  leak to unauth'd viewers); other GETs remain public.

**Security choices.**

* PIN stored as scrypt hash + 16-byte random salt. We never store
  the PIN itself.
* Sessions: 32-byte random token, HTTP-only cookie, SameSite=Strict,
  24-hour ABSOLUTE expiry (no sliding renewal). HttpOnly means JS
  can't read the cookie even if the page is XSS'd; SameSite=Strict
  blocks CSRF.
* The Secure cookie flag is OFF by default (so plain-HTTP LAN setups
  work). Behind a reverse proxy with TLS, set
  `CWD_REQUIRE_HTTPS=1` in the server env to flip it on.
* Brute-force defense: 5 wrong attempts per IP triggers a 5-minute
  lockout — even the correct PIN gets a 429 during the window.
* PIN format is strict 4 ASCII digits, validated client-side
  (numeric input mode for soft-keyboard) and server-side.

**UX.**

* When auth is enabled and you're not logged in:
  - all editing buttons / inputs are hidden (Create / Edit / Delete
    / + Add tally source / Auto-populate / etc.)
  - viewer-only UI (View buttons, Open ↗ tally links, tally tiles,
    variable list) stays visible
  - top-right of every page shows a `🔓 Log in` button
  - direct navigation to `/edit/:id` redirects to `/view/:id` so a
    stripped-down editor never appears
* When logged in: top-right shows `🔒 Log out`. Mutations work as
  before.
* If you hit a 401 during an action (e.g. session expired
  mid-edit), the login modal pops up automatically and the action
  retries after successful PIN entry. No work lost.
* Login modal: numeric-only 4-digit input with countdown when
  rate-limit hit. Dismissable via Escape / outside-click / Cancel
  button.

**Setup flow.**

1. Go to Settings → Authentication section
2. Click "Enable PIN lock", enter 4-digit PIN twice, click Save
3. PIN lock is now ON. Your current session stays logged in for 24h
4. Other devices / new tabs will need to log in to edit

**Files added.**

  server/src/db/auth.ts
  server/src/services/loginAttempts.ts
  server/src/services/requireAuth.ts
  server/src/routes/auth.ts
  client/src/lib/auth.ts
  client/src/components/AuthBar.tsx

**Files modified.**

  server/src/index.ts                            (init + mount)
  server/src/routes/dashboards.ts                (gate POST/PUT/DELETE + bg routes)
  server/src/routes/panels.ts                    (gate POST/PUT/DELETE)
  server/src/routes/savedPanels.ts               (gate POST/DELETE)
  server/src/routes/settings.ts                  (gate /companion GET+PUT, /variable-names GET)
  server/src/routes/watchedVariables.ts          (gate POST/DELETE)
  server/src/routes/tallySources.ts              (gate POST/PUT/DELETE + auto-populate)
  server/src/routes/buttons.ts                   (gate /test, /reset; /trigger stays public)
  client/src/main.tsx                            (LoginModal mount + edit gate)
  client/src/lib/api.ts                          (401 retry + credentials: same-origin)
  client/src/pages/HomePage.tsx                  (hide create/edit/delete when locked)
  client/src/pages/SettingsPage.tsx              (Authentication section + lock UI)
  client/src/pages/VariablesPage.tsx             (hide add/remove when locked)
  client/src/pages/TallyHubPage.tsx              (hide add/wizard/edit/delete when locked)
  client/src/pages/EditorPage.tsx                (AuthBar in toolbar)
  4 × package.json                               (0.7.0 → 0.8.0-alpha)

**New endpoints.**

  GET    /api/auth/status      always callable - {enabled, authenticated, hasPin}
  POST   /api/auth/setup       set/change PIN (authed if currently enabled)
  POST   /api/auth/login       body {pin} - sets cookie on success
  POST   /api/auth/logout      clears cookie + revokes session
  POST   /api/auth/disable     authed only - wipes PIN + all sessions

**Tested.**

  - Fresh DB → auth off → mutations succeed
  - Setup PIN → mutations 401 without cookie
  - GET /dashboards stays 200 (public)
  - GET /settings/companion → 401 (gated read)
  - GET /settings/values → 200 (viewer needs this)
  - Wrong PIN → remaining counter, blocked=false until 5th attempt
  - 5th wrong PIN → blocked=true, retryInMs=300000
  - 6th attempt (incl. correct PIN) → 429 "too many failed attempts"
  - Correct PIN → 200, Set-Cookie with HttpOnly, SameSite=Strict,
    Max-Age=86400, no Secure (CWD_REQUIRE_HTTPS not set)
  - Authed mutation → 201
  - Logout → next mutation 401 again
  - Migration from a v0.7 DB → tables created, defaults sane,
    existing rows preserved

**Known gaps (not blockers).**

  - CONTEXT.md not updated.
  - No "remember me" / extended session option - by design.
  - No "reset PIN if forgotten" flow. To reset, delete the
    auth_settings row from the SQLite DB on the server. Documenting
    this in README would be a good follow-up.
  - Single-role: there's no admin/viewer distinction beyond "has the
    PIN or doesn't". A future iteration could add per-route
    granularity if needed.
