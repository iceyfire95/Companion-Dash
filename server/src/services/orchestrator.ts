import * as db from '../db/index.js';
import { poller } from './poller.js';
import { extractAllVariables } from './variables.js';

export function rebuildWantedVariables(): void {
  const dashboards = db.listDashboards();
  const allPanels = dashboards.flatMap(d => db.listPanels(d.id));
  const vars = extractAllVariables(allPanels);
  poller.setWantedVariables(vars);
}
