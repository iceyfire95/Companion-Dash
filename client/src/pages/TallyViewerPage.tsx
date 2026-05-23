import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import {
  type TallySource, tallyState, tallyColor
} from '../lib/tally';
import { useAutoFit } from '../lib/useAutoFit';

/**
 * Fullscreen tally page for one source. URL: /tally/:slug
 * Body becomes the camera-light: green PVW, red PGM, black off.
 * Optional source name overlaid centred, auto-fit to fill the screen
 * (same useAutoFit pattern as cells / focus mode).
 */
export function TallyViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const liveValues = useVariableValues();
  const [restValues, setRestValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState<TallySource | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load source by slug. Re-resolve every 5s in case the user edits config
  // in another tab.
  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const load = async () => {
      try {
        const s = await api.getTallySourceBySlug(slug);
        if (alive) { setSource(s); setError(null); }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [slug]);

  // REST fallback for values - in case socket isn't connected yet.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const v = await api.getValues();
        if (alive) setRestValues(v);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Body classes + colour are global because we want the whole window painted.
  // Reset on unmount so other pages aren't left red.
  const values = { ...restValues, ...liveValues };
  const state = source ? tallyState(values, source) : 'off';
  const bg = tallyColor(state);

  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevMargin = document.body.style.margin;
    const prevOverflow = document.body.style.overflow;
    document.body.style.backgroundColor = bg;
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.margin = prevMargin;
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.backgroundColor = '';
    };
  }, [bg]);

  if (!slug) {
    return <ErrorOverlay msg="No source specified." />;
  }
  if (error) {
    return <ErrorOverlay msg={`Source not found: ${slug}`} />;
  }
  // While loading, body is already black (off). Don't render label until known.
  if (!source) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: bg,
      transition: 'background-color 50ms linear'
    }}>
      {source.showLabel && <FittedLabel text={source.name} state={state} />}
    </div>
  );
}

// -------------------------------------------------------------------------
// Auto-fit label centred in the viewport. Same binary-search font sizing as
// regular cells, so the name fills whatever space is available without being
// hard-coded to a px size.

function FittedLabel({
  text, state
}: {
  text: string;
  state: 'pgm' | 'pvw' | 'off';
}) {
  // Text colour: white on red/green for contrast; mid-gray on black (so the
  // label is visible but doesn't fight the "off" signal).
  const color = state === 'off' ? '#444' : '#ffffff';
  const { outerRef, innerRef } = useAutoFit(24, [text]);
  return (
    <div
      ref={outerRef}
      style={{
        position: 'absolute',
        inset: '5vmin',                // small breathing room from edges
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      <div
        ref={innerRef}
        style={{
          color,
          fontWeight: 800,
          textAlign: 'center',
          lineHeight: 1.05,
          letterSpacing: '0.01em',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          // useAutoFit assigns font-size; seed the inline style so initial
          // paint isn't 16px-flash.
          fontSize: '24px',
          whiteSpace: 'nowrap'
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ErrorOverlay({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', color: '#888',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 18, padding: 24, textAlign: 'center'
    }}>
      {msg}
    </div>
  );
}
