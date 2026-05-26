import { useState } from 'react';
import { api } from '../lib/api';
import type {
  ModuleType, AutoPopulateRequest, AutoPopulateResult, TallySource,
  EMDestination
} from '../lib/tally';

/**
 * Auto-populate wizard: pick module → enter connection + options →
 * probe companion → review/edit proposed rows → confirm.
 *
 * Renders as an inline panel rather than a modal so it sits naturally
 * above the source grid and the user can see what's about to land.
 */
export function AutoPopulateWizard({
  onCancel,
  onCreated
}: {
  onCancel: () => void;
  onCreated: (created: TallySource[]) => void;
}) {
  type Step = 'config' | 'em-destinations' | 'preview';
  const [step, setStep] = useState<Step>('config');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config form state
  const [module, setModule] = useState<ModuleType>('tsl');
  const [connection, setConnection] = useState('');
  const [inputCount, setInputCount] = useState(8);
  // TSL options
  const [tslStartAddress, setTslStartAddress] = useState(0);
  const [tslPvwBit, setTslPvwBit] = useState<1 | 2 | 3 | 4>(1);
  const [tslPgmBit, setTslPgmBit] = useState<1 | 2 | 3 | 4>(2);
  // vMix options
  const [vmixMix, setVmixMix] = useState(1);
  // ATEM options
  const [atemME, setAtemME] = useState(1);
  const [atemStartInput, setAtemStartInput] = useState(1);
  // EM options
  // emDiscovered: full structured list from probe step.
  // emSelectedKeys: which entries are ticked (key format: "<kind>:<name>"
  // so a screen and aux with the same name don't collide).
  const [emDiscovered, setEmDiscovered] = useState<EMDestination[]>([]);
  const [emSelectedKeys, setEmSelectedKeys] = useState<Set<string>>(new Set());
  const [emScannedSlots, setEmScannedSlots] = useState<{screens: number; aux: number} | null>(null);

  // Preview state
  const [preview, setPreview] = useState<AutoPopulateResult | null>(null);
  // Per-row checkbox + edited name. Indexed by preview row index.
  const [rowKeep, setRowKeep] = useState<boolean[]>([]);
  const [rowName, setRowName] = useState<string[]>([]);

  /**
   * Step 1 → next. For TSL/vMix/ATEM, jump straight to the preview
   * (server probes connection for labels). For Event Master, we first
   * detour through a destinations-selection step.
   */
  async function advanceFromConfig() {
    setError(null);
    if (!connection.trim()) { setError('Connection label is required.'); return; }
    if (inputCount < 1) { setError('Input count must be at least 1.'); return; }
    if (module === 'em') {
      // Probe destinations and move to the dest-selection step.
      // 256/256 default range covers sparse Barco EM screen IDs that
      // sit at higher slots after frame edits (an "LED" screen at
      // slot 47, etc.).
      setBusy(true);
      try {
        const result = await api.probeEMDestinations(connection.trim(), 256, 256);
        setEmDiscovered(result.destinations);
        setEmScannedSlots({ screens: result.screenSlots, aux: result.auxSlots });
        // Default: nothing selected - force the user to pick.
        // (Auto-selecting all would create dangerously broad tally
        // rules - "Cam 1 is on if it's on ANY destination" is
        // rarely what someone wants.)
        setEmSelectedKeys(new Set());
        setStep('em-destinations');
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    // Non-EM: run preview directly.
    await runPreview();
  }

  /**
   * Run the auto-populate preview. For EM, requires emSelected to be
   * non-empty (validated by the destinations step's button gating).
   */
  async function runPreview() {
    setError(null);
    if (!connection.trim()) { setError('Connection label is required.'); return; }
    if (inputCount < 1) { setError('Input count must be at least 1.'); return; }
    setBusy(true);
    try {
      const req: AutoPopulateRequest = {
        module,
        connection: connection.trim(),
        inputCount
      };
      if (module === 'tsl') {
        req.tslStartAddress = tslStartAddress;
        req.tslPvwBit = tslPvwBit;
        req.tslPgmBit = tslPgmBit;
      } else if (module === 'vmix') {
        req.vmixMix = vmixMix;
      } else if (module === 'atem') {
        req.atemME = atemME;
        req.atemStartInput = atemStartInput;
      } else if (module === 'em') {
        if (emSelectedKeys.size === 0) {
          setError('Pick at least one destination to track.');
          setBusy(false);
          return;
        }
        // Map ticked entries (matched by "kind:name" key) back to
        // structured {name, kind} for the server.
        req.emDestinations = emDiscovered
          .filter(d => emSelectedKeys.has(`${d.kind}:${d.name}`));
      }
      const result = await api.previewAutoPopulate(req);
      setPreview(result);
      // Default: keep everything, even unconfirmed (user can untick).
      setRowKeep(result.proposed.map(() => true));
      setRowName(result.proposed.map(p => p.partial.name ?? ''));
      setStep('preview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCreate() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const items = preview.proposed
        .map((p, i) => ({ ...p.partial, name: rowName[i].trim() || p.partial.name }))
        .filter((_, i) => rowKeep[i]);
      if (items.length === 0) {
        setError('No sources selected.');
        setBusy(false);
        return;
      }
      const result = await api.bulkCreateTallySources(items);
      onCreated(result.created);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: '#141414', border: '1px solid #2a2a2a', borderRadius: 6,
      padding: 14, marginBottom: 16
    }}>
      <div style={{
        fontSize: 11, color: '#888', textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 10
      }}>
        Auto-populate tally sources — Step{' '}
        {step === 'config'           ? '1' :
         step === 'em-destinations'  ? '2' :
                                       (module === 'em' ? '3' : '2')} of{' '}
        {module === 'em' ? '3' : '2'}
      </div>

      {step === 'config' && (
        <ConfigStep
          module={module} setModule={setModule}
          connection={connection} setConnection={setConnection}
          inputCount={inputCount} setInputCount={setInputCount}
          tslStartAddress={tslStartAddress} setTslStartAddress={setTslStartAddress}
          tslPvwBit={tslPvwBit} setTslPvwBit={setTslPvwBit}
          tslPgmBit={tslPgmBit} setTslPgmBit={setTslPgmBit}
          vmixMix={vmixMix} setVmixMix={setVmixMix}
          atemME={atemME} setAtemME={setAtemME}
          atemStartInput={atemStartInput} setAtemStartInput={setAtemStartInput}
        />
      )}

      {step === 'em-destinations' && (
        <EMDestinationsStep
          discovered={emDiscovered}
          selectedKeys={emSelectedKeys}
          setSelectedKeys={setEmSelectedKeys}
          scannedSlots={emScannedSlots}
        />
      )}

      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          rowKeep={rowKeep} setRowKeep={setRowKeep}
          rowName={rowName} setRowName={setRowName}
        />
      )}

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        {step === 'config' && (
          <>
            <button onClick={onCancel} disabled={busy}>Cancel</button>
            <button className="primary" onClick={advanceFromConfig} disabled={busy}>
              {busy
                ? (module === 'em' ? 'Probing destinations…' : 'Probing…')
                : (module === 'em' ? 'Find destinations →' : 'Probe & preview →')}
            </button>
          </>
        )}
        {step === 'em-destinations' && (
          <>
            <button onClick={() => setStep('config')} disabled={busy}>← Back</button>
            <button onClick={onCancel} disabled={busy}>Cancel</button>
            <button className="primary" onClick={runPreview}
                    disabled={busy || emSelectedKeys.size === 0}>
              {busy ? 'Probing sources…' : `Preview ${inputCount} source(s) →`}
            </button>
          </>
        )}
        {step === 'preview' && (
          <>
            <button
              onClick={() => setStep(module === 'em' ? 'em-destinations' : 'config')}
              disabled={busy}>← Back</button>
            <button onClick={onCancel} disabled={busy}>Cancel</button>
            <button className="primary" onClick={confirmCreate} disabled={busy}>
              {busy ? 'Creating…' : `Create ${rowKeep.filter(Boolean).length} source(s)`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------

function ConfigStep(props: {
  module: ModuleType; setModule: (m: ModuleType) => void;
  connection: string; setConnection: (s: string) => void;
  inputCount: number; setInputCount: (n: number) => void;
  tslStartAddress: number; setTslStartAddress: (n: number) => void;
  tslPvwBit: 1 | 2 | 3 | 4; setTslPvwBit: (n: 1 | 2 | 3 | 4) => void;
  tslPgmBit: 1 | 2 | 3 | 4; setTslPgmBit: (n: 1 | 2 | 3 | 4) => void;
  vmixMix: number; setVmixMix: (n: number) => void;
  atemME: number; setAtemME: (n: number) => void;
  atemStartInput: number; setAtemStartInput: (n: number) => void;
}) {
  const defaultConnection =
    props.module === 'tsl' ? 'tsl' :
    props.module === 'vmix' ? 'vmix' :
    props.module === 'em' ? 'em' :
                              'atem';
  return (
    <>
      <Row label="Module">
        <select value={props.module}
                onChange={e => props.setModule(e.target.value as ModuleType)}
                style={{ width: '100%' }}>
          <option value="tsl">TSL UMD Listener (boolean per address)</option>
          <option value="vmix">vMix (boolean per input)</option>
          <option value="atem">Blackmagic ATEM (input-id pointer)</option>
          <option value="em">Barco Event Master (per-destination)</option>
        </select>
      </Row>

      <Row label="Connection label in Companion">
        <input
          placeholder={defaultConnection}
          value={props.connection}
          onChange={e => props.setConnection(e.target.value)}
          style={{
            width: '100%',
            fontFamily: 'ui-monospace, Menlo, monospace'
          }}
        />
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
          The label you gave this connection in Companion. Case-sensitive
          in Companion v4. Variables will look like{' '}
          <code>{props.connection || defaultConnection}:…</code>.
        </div>
      </Row>

      <Row label={
        props.module === 'tsl' ? 'Number of tally addresses' :
        props.module === 'em'  ? 'Number of sources to scan' :
                                 'Number of inputs'}>
        <input type="number" min={1} max={128}
               value={props.inputCount}
               onChange={e => props.setInputCount(Number(e.target.value))}
               style={{ width: 120 }} />
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
          {props.module === 'em'
            ? 'How many EM sources to scan. Each becomes one tally source (Cam 1, Cam 2, …) that lights up when on PVW/PGM at any tracked destination.'
            : `How many to scan. We'll probe Companion for each and use what comes back. Unconfirmed entries can still be kept on the next step.`}
        </div>
      </Row>

      {props.module === 'tsl' && (
        <>
          <Row label="Starting tally address">
            <input type="number" min={0} max={1023}
                   value={props.tslStartAddress}
                   onChange={e => props.setTslStartAddress(Number(e.target.value))}
                   style={{ width: 120 }} />
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              TSL addresses are 0-indexed. Most setups use 0 onwards.
            </div>
          </Row>
          <Row label="PVW / PGM tally bits">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#aaa' }}>PVW =</span>
              <select value={props.tslPvwBit}
                      onChange={e => props.setTslPvwBit(Number(e.target.value) as 1 | 2 | 3 | 4)}
                      style={{ width: 80 }}>
                {[1, 2, 3, 4].map(n =>
                  <option key={n} value={n}>tally{n}</option>)}
              </select>
              <span style={{ fontSize: 12, color: '#aaa', marginLeft: 12 }}>PGM =</span>
              <select value={props.tslPgmBit}
                      onChange={e => props.setTslPgmBit(Number(e.target.value) as 1 | 2 | 3 | 4)}
                      style={{ width: 80 }}>
                {[1, 2, 3, 4].map(n =>
                  <option key={n} value={n}>tally{n}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              TSL UMD has 4 tally bits per address. Convention is
              tally1=PVW, tally2=PGM but some switchers invert.
            </div>
          </Row>
        </>
      )}

      {props.module === 'vmix' && (
        <Row label="Mix number">
          <input type="number" min={1} max={32}
                 value={props.vmixMix}
                 onChange={e => props.setVmixMix(Number(e.target.value))}
                 style={{ width: 120 }} />
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            vMix supports multiple mixes. Mix 1 is the main program.
            Pick a different number for secondary mixes; you can run
            this wizard multiple times for different mixes.
          </div>
        </Row>
      )}

      {props.module === 'atem' && (
        <>
          <Row label="M/E number">
            <input type="number" min={1} max={4}
                   value={props.atemME}
                   onChange={e => props.setAtemME(Number(e.target.value))}
                   style={{ width: 120 }} />
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              Most ATEM switchers have one M/E (Mix Effect). Larger
              switchers have ME 2/3/4.
            </div>
          </Row>
          <Row label="Starting input number">
            <input type="number" min={1} max={999}
                   value={props.atemStartInput}
                   onChange={e => props.setAtemStartInput(Number(e.target.value))}
                   style={{ width: 120 }} />
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              ATEM input numbers start at 1 (Camera 1). Higher numbers
              are internal sources (Color, Media, SuperSource) — skip
              them by raising the start or reducing the count.
            </div>
          </Row>
        </>
      )}
    </>
  );
}

// -------------------------------------------------------------------------

function PreviewStep({
  preview, rowKeep, setRowKeep, rowName, setRowName
}: {
  preview: AutoPopulateResult;
  rowKeep: boolean[]; setRowKeep: (a: boolean[]) => void;
  rowName: string[]; setRowName: (a: string[]) => void;
}) {
  const confirmedCount = preview.proposed.filter(p => p.confirmed).length;
  const totalCount = preview.proposed.length;

  function setKeep(i: number, v: boolean) {
    const next = rowKeep.slice();
    next[i] = v;
    setRowKeep(next);
  }
  function setName(i: number, v: string) {
    const next = rowName.slice();
    next[i] = v;
    setRowName(next);
  }
  function checkAll(v: boolean) {
    setRowKeep(rowKeep.map(() => v));
  }
  function checkConfirmedOnly() {
    setRowKeep(preview.proposed.map(p => p.confirmed));
  }

  return (
    <>
      <div style={{
        fontSize: 12, color: '#aaa', lineHeight: 1.5, marginBottom: 10
      }}>
        Companion confirmed <b>{confirmedCount}</b> of <b>{totalCount}</b>{' '}
        inputs (label variable returned a non-empty value). Unconfirmed
        rows still get created if checked — TSL listener in particular
        only publishes variables after the first packet arrives.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => checkAll(true)}
                style={{ padding: '3px 10px', fontSize: 11 }}>Check all</button>
        <button onClick={() => checkAll(false)}
                style={{ padding: '3px 10px', fontSize: 11 }}>Uncheck all</button>
        <button onClick={checkConfirmedOnly}
                style={{ padding: '3px 10px', fontSize: 11 }}>Confirmed only</button>
      </div>

      <div style={{
        border: '1px solid #2a2a2a', borderRadius: 4,
        background: '#0f0f0f', maxHeight: 400, overflow: 'auto'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 1fr 1fr',
          padding: '6px 10px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
          color: '#888', fontWeight: 600,
          borderBottom: '1px solid #2a2a2a', background: '#1a1a1a'
        }}>
          <div></div>
          <div>Name</div>
          <div>PVW variable</div>
          <div>PGM variable</div>
        </div>
        {preview.proposed.map((p, i) => {
          const pvw = p.partial.pvwVariable ?? '';
          const pgm = p.partial.pgmVariable ?? '';
          const pvwMatch = p.partial.pvwMatchValue;
          const pgmMatch = p.partial.pgmMatchValue;
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 1fr 1fr',
              padding: '4px 10px',
              fontSize: 12, alignItems: 'center',
              borderBottom: '1px solid #1f1f1f',
              opacity: rowKeep[i] ? 1 : 0.5
            }}>
              <input type="checkbox"
                     checked={rowKeep[i]}
                     onChange={e => setKeep(i, e.target.checked)} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={rowName[i]}
                  onChange={e => setName(i, e.target.value)}
                  style={{ flex: 1, padding: '2px 6px', fontSize: 12 }}
                />
                {!p.confirmed && (
                  <span title="Companion did not return a value for the label variable"
                        style={{
                    fontSize: 10, color: '#f59e0b',
                    border: '1px solid #f59e0b', borderRadius: 3,
                    padding: '0 4px'
                  }}>?</span>
                )}
              </div>
              <code style={{
                color: '#7dd3fc', fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }} title={`${pvw}${pvwMatch ? ` == "${pvwMatch}"` : ''}`}>
                {pvw}{pvwMatch ? <span style={{ color: '#fbbf24' }}> == {pvwMatch}</span> : null}
              </code>
              <code style={{
                color: '#7dd3fc', fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }} title={`${pgm}${pgmMatch ? ` == "${pgmMatch}"` : ''}`}>
                {pgm}{pgmMatch ? <span style={{ color: '#fbbf24' }}> == {pgmMatch}</span> : null}
              </code>
            </div>
          );
        })}
      </div>
    </>
  );
}

// -------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 11, color: '#888', textTransform: 'uppercase',
        letterSpacing: 0.5, fontWeight: 600, marginBottom: 4
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ===========================================================================
// EM Destinations step — shown for Event Master between config and preview.
//
// We've already probed the connection for screen_<N>_name and
// aux_<N>_name and have a deduped, sorted list of destination names.
// User ticks which destinations to track for tally; selections feed
// into the auto-populate preview as req.emDestinations.
//
// No selection = preview is disabled. Defaults to nothing checked —
// "track every destination" is rarely what someone wants and would
// cause every source to light red the moment it touches any output.
// ===========================================================================

function EMDestinationsStep({
  discovered, selectedKeys, setSelectedKeys, scannedSlots
}: {
  discovered: EMDestination[];
  selectedKeys: Set<string>;
  setSelectedKeys: (next: Set<string>) => void;
  scannedSlots: { screens: number; aux: number } | null;
}) {
  // Each entry's identity is "<kind>:<name>" so a screen and an aux
  // sharing the same name remain distinct selections.
  const keyOf = (d: EMDestination) => `${d.kind}:${d.name}`;

  function toggle(d: EMDestination) {
    const k = keyOf(d);
    const next = new Set(selectedKeys);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelectedKeys(next);
  }
  function checkAll() {
    setSelectedKeys(new Set(discovered.map(keyOf)));
  }
  function uncheckAll() {
    setSelectedKeys(new Set());
  }

  if (discovered.length === 0) {
    return (
      <div style={{
        padding: 14, fontSize: 13, color: '#aaa', lineHeight: 1.5,
        background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 4
      }}>
        No destination names found on this connection. Things to check:
        <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
          <li>Is the Event Master module connected and the frame
              reachable?</li>
          <li>Does Companion show non-empty values for
              <code>screen_1_name</code>, <code>aux_1_name</code> etc.
              on the Variables page?</li>
          <li>Is the connection label correct (case-sensitive)?</li>
        </ul>
        {scannedSlots && (
          <div style={{ marginTop: 8, color: '#666' }}>
            Scanned {scannedSlots.screens} screen slots and {scannedSlots.aux} aux slots.
          </div>
        )}
      </div>
    );
  }

  const screenCount = discovered.filter(d => d.kind === 'screen').length;
  const auxCount = discovered.filter(d => d.kind === 'aux').length;

  return (
    <div>
      <div style={{
        fontSize: 13, color: '#aaa', lineHeight: 1.5, marginBottom: 8
      }}>
        Found <b>{discovered.length}</b> destination
        {discovered.length === 1 ? '' : 's'}
        {' '}({screenCount} screen{screenCount === 1 ? '' : 's'},
        {' '}{auxCount} aux).{' '}
        Pick the ones to track — a source's tally lights up when it's
        on PVW or PGM at <i>any</i> ticked destination. Screens
        automatically include all their layers (e.g. ticking "LED"
        also catches "LED L2", "LED L3", etc.).
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={checkAll}
                style={{ padding: '3px 10px', fontSize: 11 }}>Check all</button>
        <button onClick={uncheckAll}
                style={{ padding: '3px 10px', fontSize: 11 }}>Uncheck all</button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#666', alignSelf: 'center' }}>
          {selectedKeys.size} of {discovered.length} selected
        </div>
      </div>

      <div style={{
        border: '1px solid #2a2a2a', borderRadius: 4,
        background: '#0f0f0f', maxHeight: 360, overflow: 'auto'
      }}>
        {discovered.map(d => {
          const k = keyOf(d);
          // Kind tag colour: screens are a neutral grey, aux a softer
          // amber so the user can tell types at a glance.
          const tagBg = d.kind === 'screen' ? '#1a3a5a' : '#3a2a1a';
          const tagFg = d.kind === 'screen' ? '#7dd3fc' : '#fbbf24';
          return (
            <label key={k}
                   style={{
                     display: 'flex', alignItems: 'center', gap: 8,
                     padding: '6px 10px',
                     borderBottom: '1px solid #1f1f1f',
                     cursor: 'pointer',
                     fontSize: 13
                   }}>
              <input type="checkbox"
                     checked={selectedKeys.has(k)}
                     onChange={() => toggle(d)} />
              <span style={{ flex: 1 }}>{d.name}</span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 3,
                background: tagBg, color: tagFg, fontWeight: 600,
                letterSpacing: 0.3, textTransform: 'uppercase'
              }}>{d.kind}</span>
            </label>
          );
        })}
      </div>

      {scannedSlots && (
        <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
          Scanned {scannedSlots.screens} screen slots and {scannedSlots.aux} aux slots.
          Re-open the wizard if you've added new destinations since.
        </div>
      )}
    </div>
  );
}
