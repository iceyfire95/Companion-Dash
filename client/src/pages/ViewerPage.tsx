import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useVariableValues } from '../lib/useVariableValues';
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
      } catch {}
    }
    load();
    // Poll panels periodically so viewer picks up editor changes
    const id = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [dashboardId]);

  if (!dashboard) return <div style={{ padding: 20 }}>Loading...</div>;

  return (
    <div className="viewer-wrap" style={{ background: dashboard.bgColor }}>
      <div
        style={{
          position: 'relative',
          width: dashboard.width,
          height: dashboard.height,
          background: dashboard.bgColor,
          overflow: 'hidden',
          // Scale to fit window while preserving aspect ratio
          transform: 'scale(var(--scale, 1))',
          transformOrigin: 'center center'
        }}
        ref={el => {
          if (!el) return;
          const parent = el.parentElement;
          if (!parent) return;
          const fit = () => {
            const sx = parent.clientWidth / dashboard.width;
            const sy = parent.clientHeight / dashboard.height;
            const s = Math.min(sx, sy, 1.5);
            el.style.setProperty('--scale', String(s));
          };
          fit();
          const ro = new ResizeObserver(fit);
          ro.observe(parent);
        }}
      >
        {panels.map(p => (
          <PanelView key={p.id} panel={p} values={values} />
        ))}
      </div>
    </div>
  );
}
