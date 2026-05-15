import * as db from '../db/index.js';
import { poller } from './poller.js';
import { extractAllVariables } from './variables.js';

export function rebuildWantedVariables(): void {
  const dashboards = db.listDashboards();
  const allPanels = dashboards.flatMap(d => db.listPanels(d.id));
  const fromPanels = extractAllVariables(allPanels);
  const watched = db.getWatchedNames();
  // Merge - dedupe via Set
  const all = new Set<string>([...fromPanels, ...watched]);
  poller.setWantedVariables([...all]);
}
