Companion-Dash v0.6.0-alpha — Auto-populate tally sources
=========================================================

Apply: from repo root, extract this tar.gz, accept overwrites.

    cd ~/Documents/git/companion-web-dashboard
    tar -xzvf companion-dash-v0.6.0-auto-tally.tar.gz

No new npm dependencies. Existing data.db is migrated automatically on
first server boot (two new columns ALTERed into tally_sources). The
existing tally feature from v0.5.0 still works unchanged for sources
that don't use match-value mode.

NOTE: applies cleanly on top of either v0.4.0 OR v0.5.0. If you're
applying on top of v0.4.0 (i.e. skipping the v0.5.0 patch), this
single bundle contains the entire tally feature plus auto-populate.

What's new in v0.6.0
--------------------

1. **Auto-populate wizard.** On the Tally page, click the new
   "⚡ Auto-populate from connection" button. Pick TSL listener /
   vMix / ATEM, type your Companion connection label, set the
   input count, and the dashboard probes Companion for each input
   and proposes a list of TallySources you can review/edit before
   saving in bulk.

2. **Match-value mode** for tally sources. A new optional field on
   TallySource — `pvwMatchValue` / `pgmMatchValue`. When set, "on"
   means the raw variable value *equals* that string (after trim).
   When empty, falls back to existing truthy detection.

   Required for ATEM. ATEM exposes tally as a single input-id
   pointer (`atem:pgm1_input_id = "5"`), so to make per-camera
   tally lights you need "is the pointer equal to MY camera number".

   The manual "Add tally source" dialog also gained these fields.
   Leave them blank for TSL/vMix; fill in for ATEM (auto-populate
   does this for you automatically).

Files added:
  server/src/services/tallyAutoPopulate.ts (new)
  client/src/pages/AutoPopulateWizard.tsx  (new)

Files modified (vs upstream main):
  server/src/types-tally.ts                (match value fields)
  server/src/db/tally.ts                   (migration + match cols)
  server/src/routes/tallySources.ts        (preview + bulk endpoints)
  server/src/index.ts                      (mount tally route)
  server/src/services/orchestrator.ts      (merge tally vars)
  client/src/lib/tally.ts                  (match mode + types)
  client/src/lib/api.ts                    (new endpoints)
  client/src/main.tsx                      (routes)
  client/src/pages/HomePage.tsx            (Tally nav button)
  client/src/pages/TallyHubPage.tsx        (wizard hook + match cols)
  client/src/pages/TallyViewerPage.tsx    (carry-over from v0.5.0)
  package.json / server/package.json / client/package.json
    / electron/package.json                (version → 0.6.0-alpha)

How auto-populate works per module
----------------------------------

* **TSL listener** — boolean-style tally. Probes
  `<conn>:tally_<N>_label` for the name. Uses
  `<conn>:tally_<N>_tally1` (PVW) and `<conn>:tally_<N>_tally2` (PGM)
  by default; configurable in the wizard if your switcher uses
  different bits. Truthy mode (no match value).

* **vMix** — boolean-style tally per input per mix. Probes
  `<conn>:input_<N>_name`. Uses
  `<conn>:input_<N>_mix_<M>_tally_preview` and `_tally_program`.
  Mix number configurable. Truthy mode.

* **ATEM** — input-id pointer style. Probes `<conn>:long_<N>`
  for the long input name. Uses `<conn>:pvw<ME>_input_id` and
  `<conn>:pgm<ME>_input_id` as the pvw/pgm vars, with the input
  number as the match value. So input 5 is on PGM iff
  `pgm1_input_id == "5"`. Match mode.

Smoke-tested end-to-end against a mock Companion: preview probes
return correct labels for known inputs and fallback names for
unknown ones; bulk-insert persists the rows with correct match
values; the orchestrator merges the new vars into the polling
set; the by-slug endpoint serves correct sources to the
fullscreen viewer.

Existing v0.5.0 tally sources continue working unchanged because
empty match values fall through to truthy detection (= old
behaviour).

Known gaps (not blockers)
-------------------------

* CONTEXT.md not updated.
* Probe times out at 1.5s per variable; with concurrency 8, a
  32-input scan takes about 1-3 seconds end-to-end against a
  responsive Companion.
* TSL listener publishes its variables only AFTER the first tally
  packet arrives. If your TSL listener has never received any data,
  the wizard will mark everything unconfirmed — but you can still
  check the rows and create them; once data starts flowing the
  variables will resolve and tally lights will go live.
