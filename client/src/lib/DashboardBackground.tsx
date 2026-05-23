import type { Dashboard } from '../types';
import { api } from './api';

/**
 * Renders a dashboard's optional background image inside the canvas.
 *
 * Sits at design coordinates (0,0 → designW,designH) inside the same
 * transform-scaled inner canvas div used by panels, so it scales
 * identically to panels when the viewer/editor zooms in and out.
 *
 * The image is fetched via the API URL helper which appends ?v=<updatedAt>
 * so a re-upload busts the browser cache. We also key the <img> on
 * updatedAt as a belt-and-braces guard against React reusing the DOM
 * element across uploads.
 *
 * Fit modes map directly onto CSS object-fit:
 *   cover    → image covers the canvas, edges may be cropped
 *   contain  → image fits inside the canvas, may letterbox
 *   stretch  → image is stretched to canvas dimensions (object-fit: fill)
 *
 * No image = no DOM = no network call. The component is a noop when
 * dashboard.hasBackground is false.
 */
export function DashboardBackground({ dashboard }: { dashboard: Dashboard }) {
  if (!dashboard.hasBackground) return null;
  const fit = dashboard.backgroundFit ?? 'cover';
  const objectFit: React.CSSProperties['objectFit'] =
    fit === 'stretch' ? 'fill' :
    fit === 'contain' ? 'contain' :
                        'cover';
  return (
    <img
      key={dashboard.updatedAt}
      src={api.dashboardBackgroundUrl(dashboard.id, dashboard.updatedAt)}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: dashboard.width,
        height: dashboard.height,
        objectFit,
        // We render before panels in DOM order; same stacking context,
        // so panels naturally paint on top. No explicit z-index needed
        // (and a negative one would interact badly with user-set
        // panel.zIndex values).
        // Don't intercept clicks - drags on the canvas should land
        // on panels or the canvas-wrap background, never on the image.
        pointerEvents: 'none',
        userSelect: 'none'
      }}
    />
  );
}
