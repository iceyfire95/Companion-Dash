import { useState } from 'react';
import { api } from '../lib/api';
import type {
  ModuleType, AutoPopulateRequest, AutoPopulateResult, TallySource
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
  type Step = 'config' | 'preview';
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

  // Preview state
  const [preview, setPreview] = useState<AutoPopulateResult | null>(null);
  // Per-row checkbox + edited name. Indexed by preview row index.
  const [rowKeep, setRowKeep] = useState<boolean[]>([]);
  const [rowName, setRowName] = useState<string[]>([]);

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
        Auto-populate tally sources — Step {step === 'config' ? '1 of 2' : '2 of 2'}
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
            <button className="primary" onClick={runPreview} disabled={busy}>
              {busy ? 'Probing…' : 'Probe & preview →'}
            </button>
          </>
        )}
        {step === 'preview' && (
          <>
            <button onClick={() => setStep('config')} disabled={busy}>← Back</button>
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

      <Row label={props.module === 'tsl' ? 'Number of tally addresses' : 'Number of inputs'}>
        <input type="number" min={1} max={128}
               value={props.inputCount}
               onChange={e => props.setInputCount(Number(e.target.value))}
               style={{ width: 120 }} />
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
          How many to scan. We'll probe Companion for each and use what
          comes back. Unconfirmed entries can still be kept on the next
          step.
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
