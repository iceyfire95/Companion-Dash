Companion-Dash v0.9.4-alpha — aux yellow + stale var cleanup + scroll
======================================================================

Apply: from repo root, extract this tar.gz, accept overwrites.

    cd ~/Documents/git/companion-web-dashboard
    tar -xzvf companion-dash-v0.9.4-aux-cleanup-scroll.tar.gz

Prerequisite: v0.9.3-alpha. No DB migration. No new deps.

Three fixes
-----------

### 1. AUX destinations show yellow

Tally state was just PGM (red) / PVW (green) / OFF. Aux destinations
got lumped into PGM or PVW depending on which side they were routed
on, which was wrong - an aux output isn't the same kind of signal as
the broadcast PVW/PGM.

New state machine:

    1. Tracked SCREEN on PGM           → red    (PROGRAM)
    2. Tracked AUX on either side      → yellow (AUX)
    3. Tracked SCREEN on PVW           → green  (PREVIEW)
    4. Non-inList truthy/equals match  → existing behaviour
    5. Otherwise                       → black  (OFF)

PGM beats AUX beats PVW. Detected from the kind prefix on the
matched destination tokens ("Screen <name>" vs "AUX <name>"), which
is already what we persist for EM auto-populated sources, so this is
purely a display/state change - no schema changes, no need to
re-create existing tally sources.

Text colour on yellow is near-black for contrast (white on yellow
disappears at distance).

### 2. Stale variables disappear from the Variables page

When a panel or watched-variable was deleted, the polled values for
its referenced Companion variables stayed in the browser's local
state forever. Going from show to show would balloon the Variables
page with old data that no longer had any source.

Fix is two parts:

  * Server: poller already dropped its own cached value when the
    variable left the wanted set; now it also emits a 'drop' event,
    which the socket layer forwards as 'values:delete' to clients.

  * Client: useVariableValues hook listens for 'values:delete' and
    removes the entry from local state.

Already-running browsers receive deletes for variables removed since
their last connect. Reconnecting also gets a fresh snapshot which
naturally has the stale values absent.

### 3. Pages scroll when content exceeds viewport

The .page CSS class sets height:100vh + overflow:hidden so the
top-of-page toolbar stays anchored, but pages without their own
scroll container (Variables, Tally, Home, Settings) were clipping
content. Added `flex:1; overflow:auto; minHeight:0` to each page's
content wrapper so long lists scroll within the page body.

The Editor page is unaffected (it already has its own .canvas-wrap
scroll container).

Files modified
--------------
  server/src/services/poller.ts             (emit 'drop' event)
  server/src/index.ts                       (forward as values:delete)
  client/src/lib/useVariableValues.ts       (handle values:delete)
  client/src/lib/tally.ts                   ('aux' TallyState +
                                             priority + activeMatches)
  client/src/pages/TallyHubPage.tsx         (AUX label, yellow on
                                             aux, activeMatches)
  client/src/pages/TallyViewerPage.tsx      (aux background +
                                             dark text on yellow)
  client/src/pages/VariablesPage.tsx        (scroll wrapper)
  client/src/pages/HomePage.tsx             (scroll wrapper)
  client/src/pages/SettingsPage.tsx         (scroll wrapper)
  4 × package.json                          (0.9.3 → 0.9.4-alpha)

No DB schema change, no new endpoints.

Tested
------
12 unit assertions on tallyState covering the new priority:
  - PGM screen → pgm
  - PVW screen → pvw
  - PVW screen + PGM aux → aux (overrides pvw)
  - PGM screen + PVW aux → pgm (pgm wins)
  - Only aux on either side → aux
  - Mixed screen + aux on PGM → pgm
  - Off / untracked → off
  - TSL truthy back-compat: PGM/PVW/off all correct
