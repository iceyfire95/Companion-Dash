import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import {
  type TallySource, tallyState, tallyColor, activeMatches
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

  // Live destination summary - only meaningful when state != off AND
  // the source is in inList mode. Operators standing next to the
  // camera see "Cam 1" big + "on: LED, FB 1" small underneath.
  const activeList = activeMatches(values, source, state);
  const matchSummary = activeList.join(', ');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: bg,
      transition: 'background-color 50ms linear'
    }}>
      {source.showLabel && (
        <FittedLabel
          text={source.name}
          state={state}
          hasFooter={matchSummary.length > 0}
        />
      )}
      {matchSummary && (
        <MatchedFooter text={matchSummary} state={state} />
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Auto-fit label centred in the viewport. Same binary-search font sizing as
// regular cells, so the name fills whatever space is available without being
// hard-coded to a px size.

function FittedLabel({
  text, state, hasFooter
}: {
  text: string;
  state: 'pgm' | 'aux' | 'pvw' | 'off';
  hasFooter: boolean;
}) {
  // Text colour:
  //   off → dark grey (visible without fighting the "off" signal)
  //   aux (yellow) → near-black for contrast against bright yellow
  //   pgm/pvw → white
  const color =
    state === 'off' ? '#444' :
    state === 'aux' ? '#0a0a0a' :
                       '#ffffff';
  // When the matched-destinations footer is showing, leave extra
  // space at the bottom (~18vmin) so the autofit doesn't size the
  // name into the footer's territory. The 5vmin breathing-room on
  // the other sides is unchanged.
  const bottom = hasFooter ? '18vmin' : '5vmin';
  const { outerRef, innerRef } = useAutoFit(24, [text, hasFooter]);
  return (
    <div
      ref={outerRef}
      style={{
        position: 'absolute',
        top: '5vmin',
        left: '5vmin',
        right: '5vmin',
        bottom,
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

/**
 * Bottom strip showing which tracked destinations the source is
 * currently live at. Sized to be visible at distance without
 * competing with the big source name. White on red/green, hidden
 * entirely when off (no matchSummary).
 */
function MatchedFooter({
  text, state
}: {
  text: string;
  state: 'pgm' | 'aux' | 'pvw' | 'off';
}) {
  if (state === 'off') return null;
  // Dark text on yellow (aux), white on red/green.
  const color = state === 'aux' ? '#0a0a0a' : '#ffffff';
  return (
    <div style={{
      position: 'absolute',
      bottom: '4vmin',
      left: '5vmin',
      right: '5vmin',
      textAlign: 'center',
      color,
      opacity: state === 'aux' ? 0.9 : 0.85,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      // Roughly 6% of the smaller viewport dimension - readable from
      // ~2m away on a tablet without dominating the tally light.
      fontSize: '6vmin',
      fontWeight: 600,
      letterSpacing: '0.02em',
      lineHeight: 1.1,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none'
    }}>
      on: {text}
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
