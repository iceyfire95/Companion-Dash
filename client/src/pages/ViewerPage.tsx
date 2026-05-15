import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
import { evaluateRule } from '../lib/variables';
import type { Dashboard, Panel } from '../types';
import { PanelView } from '../components/PanelView';

export function ViewerPage() {
  const { dashboardId = '' } = useParams();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const values = useVariableValues();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const d = await api.getDashboard(dashboardId);
        const ps = await api.listPanels(dashboardId);
        if (!cancelled) { setDashboard(d); setPanels(ps); }
      } catch { /* ignore */ }
    }
    load();
    // Poll panels periodically so viewer picks up editor changes
    const id = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [dashboardId]);

  // Auto-focus: pick first panel whose focusRule currently matches.
  const focusedPanel = useMemo(() => {
    const matching = panels.filter(p =>
      p.focusRule?.enabled &&
      evaluateRule(p.focusRule, values)
    );
    if (matching.length === 0) return null;
    return matching.sort((a, b) => {
      const dz = (b.zIndex ?? 0) - (a.zIndex ?? 0);
      return dz !== 0 ? dz : a.id.localeCompare(b.id);
    })[0];
  }, [panels, values]);

  if (!dashboard) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <StickyMaxCanvas
      designWidth={dashboard.width}
      designHeight={dashboard.height}
      bgColor={dashboard.bgColor}
    >
      {focusedPanel ? (
        <FocusedPanel
          panel={focusedPanel}
          values={values}
          canvasWidth={dashboard.width}
          canvasHeight={dashboard.height}
        />
      ) : (
        panels.map(p => (
          <PanelView
            key={p.id}
            panel={p}
            values={values}
            onCellButtonPress={(cellId) => {
              void api.triggerButton(p.id, cellId).catch(e => console.error('button trigger failed', e));
            }}
            onPanelButtonPress={() => {
              void api.triggerButton(p.id, null).catch(e => console.error('button trigger failed', e));
            }}
          />
        ))
      )}
    </StickyMaxCanvas>
  );
}

/**
 * Viewer canvas with sticky-max sizing:
 *
 * - Tracks the largest viewport (window.innerWidth/innerHeight) seen during
 *   this session. Canvas grows but never shrinks.
 * - The canvas's display size equals the scaled design size. Scale is
 *   `Math.min(maxViewportW / designW, maxViewportH / designH, 4)` so the
 *   authored design scales up to fill the largest viewport observed.
 * - The outer wrapper has `overflow: auto`. When the browser is smaller than
 *   the canvas (e.g. user shrank the window after maximizing), scrollbars
 *   appear and the user can scroll to see clipped content.
 *
 * Typical workflow: open the viewer, maximize the browser to lock in the
 * canvas size at full screen, then optionally shrink the window to focus
 * on a region of the dashboard via scrolling.
 */
function StickyMaxCanvas({
  designWidth, designHeight, bgColor, children
}: {
  designWidth: number;
  designHeight: number;
  bgColor: string;
  children: React.ReactNode;
}) {
  // Initial canvas size: current viewport at first render. Grows monotonically.
  const [maxViewport, setMaxViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : designWidth,
    h: typeof window !== 'undefined' ? window.innerHeight : designHeight
  });

  // Watch the window for the largest viewport seen during this session.
  useEffect(() => {
    const onResize = () => {
      setMaxViewport(prev => ({
        w: Math.max(prev.w, window.innerWidth),
        h: Math.max(prev.h, window.innerHeight)
      }));
    };
    window.addEventListener('resize', onResize);
    // Initial sample in case the first render happened before layout settled.
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Compute scale to fill the largest viewport ever seen.
  // Capped at 4x so authored 1920x1080 can fill an 8K display, but not more.
  const scale = useMemo(() => {
    const sx = maxViewport.w / designWidth;
    const sy = maxViewport.h / designHeight;
    return Math.min(sx, sy, 4);
  }, [maxViewport.w, maxViewport.h, designWidth, designHeight]);

  const canvasW = designWidth * scale;
  const canvasH = designHeight * scale;

  return (
    <div
      className="viewer-wrap viewer-scroll"
      style={{
        background: bgColor,
        overflow: 'auto'
      }}
    >
      {/* Outer fit-container at scaled-display size. Holds the on-screen
          footprint of the canvas. If the viewport is smaller than this,
          the parent's overflow:auto creates scrollbars. */}
      <div
        style={{
          width: canvasW,
          height: canvasH,
          position: 'relative',
          overflow: 'hidden',
          background: bgColor,
          // No flex centering - we want top-left anchored so scrolling makes
          // sense. The canvas occupies its own scrollable area.
        }}
      >
        {/* Inner canvas at design-size, scaled via transform. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: designWidth,
            height: designHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Render a single panel filling the canvas. We construct a transient Panel
 * with x=0, y=0, width=canvasWidth, height=canvasHeight so PanelView's
 * existing layout uses the full area. Original panel geometry is preserved
 * elsewhere - this is only for display.
 */
function FocusedPanel({
  panel, values, canvasWidth, canvasHeight
}: {
  panel: Panel;
  values: Record<string, string>;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const fullPanel: Panel = useMemo(() => ({
    ...panel,
    x: 0,
    y: 0,
    width: canvasWidth,
    height: canvasHeight,
    zIndex: 9999
  }), [panel, canvasWidth, canvasHeight]);
  return (
    <div className="focus-wrap">
      <PanelView
        panel={fullPanel}
        values={values}
        onCellButtonPress={(cellId) => {
          void api.triggerButton(panel.id, cellId).catch(e => console.error('button trigger failed', e));
        }}
        onPanelButtonPress={() => {
          void api.triggerButton(panel.id, null).catch(e => console.error('button trigger failed', e));
        }}
      />
    </div>
  );
}
