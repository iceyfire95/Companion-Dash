import type {
  Dashboard, Panel, SavedPanelTemplate, CompanionConfig, ButtonAction
} from '../types';
import type {
  TallySource, AutoPopulateRequest, AutoPopulateResult
} from './tally';

async function j<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  if (r.status === 204) return undefined as unknown as T;
  return r.json() as Promise<T>;
}

export const api = {
  // Dashboards
  listDashboards: () => j<Dashboard[]>('/api/dashboards'),
  createDashboard: (data: Partial<Dashboard>) =>
    j<Dashboard>('/api/dashboards', { method: 'POST', body: JSON.stringify(data) }),
  getDashboard: (id: string) => j<Dashboard>(`/api/dashboards/${id}`),
  updateDashboard: (id: string, data: Partial<Dashboard>) =>
    j<Dashboard>(`/api/dashboards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDashboard: (id: string) => j<void>(`/api/dashboards/${id}`, { method: 'DELETE' }),
  listPanels: (id: string) => j<Panel[]>(`/api/dashboards/${id}/panels`),

  /**
   * Upload a PNG or JPEG as the dashboard's background image. The body
   * is the raw bytes; we set the Content-Type header to the file's MIME
   * type so the server can validate. Server enforces an 8 MB cap and a
   * PNG/JPEG-only allowlist.
   */
  uploadDashboardBackground: async (id: string, file: File): Promise<Dashboard> => {
    const r = await fetch(`/api/dashboards/${id}/background`, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`${r.status}: ${text || r.statusText}`);
    }
    return r.json() as Promise<Dashboard>;
  },
  removeDashboardBackground: (id: string) =>
    j<Dashboard>(`/api/dashboards/${id}/background`, { method: 'DELETE' }),
  setDashboardBackgroundFit: (id: string, fit: 'cover' | 'contain' | 'stretch') =>
    j<Dashboard>(`/api/dashboards/${id}/background-fit`, {
      method: 'PUT',
      body: JSON.stringify({ fit })
    }),
  /**
   * Returns the URL to GET the background image bytes, with a cache-
   * buster keyed on the dashboard's updatedAt so a fresh upload always
   * forces a reload in the browser. Useful as an <img src>.
   */
  dashboardBackgroundUrl: (id: string, updatedAt: number) =>
    `/api/dashboards/${id}/background?v=${updatedAt}`,

  // Panels
  createPanel: (data: { dashboardId: string; templateId?: string; x?: number; y?: number }) =>
    j<Panel>('/api/panels', { method: 'POST', body: JSON.stringify(data) }),
  updatePanel: (id: string, data: Partial<Panel>) =>
    j<Panel>(`/api/panels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePanel: (id: string) => j<void>(`/api/panels/${id}`, { method: 'DELETE' }),

  // Templates
  listTemplates: () => j<SavedPanelTemplate[]>('/api/saved-panels'),
  saveTemplate: (panelId: string, name: string) =>
    j<SavedPanelTemplate>('/api/saved-panels', {
      method: 'POST',
      body: JSON.stringify({ panelId, name })
    }),
  deleteTemplate: (id: string) => j<void>(`/api/saved-panels/${id}`, { method: 'DELETE' }),

  // Settings
  getCompanion: () => j<CompanionConfig>('/api/settings/companion'),
  setCompanion: (cfg: CompanionConfig) =>
    j<CompanionConfig>('/api/settings/companion', { method: 'PUT', body: JSON.stringify(cfg) }),
  getValues: () => j<Record<string, string>>('/api/settings/values'),
  getStatus: () => j<PollerStatus>('/api/settings/status'),
  getVariableNames: () => j<{ names: string[] }>('/api/settings/variable-names'),

  // Buttons
  triggerButton: (panelId: string, cellId: string | null) =>
    j<{ ok: boolean; error?: string; firedAction?: ButtonAction; nextStep?: number }>(
      '/api/buttons/trigger',
      { method: 'POST', body: JSON.stringify({ panelId, cellId }) }
    ),
  testButton: (action: ButtonAction) =>
    j<{ ok: boolean; error?: string }>(
      '/api/buttons/test',
      { method: 'POST', body: JSON.stringify({ action }) }
    ),
  resetToggle: (panelId: string, cellId: string | null | undefined) =>
    j<{ ok: boolean }>('/api/buttons/reset', {
      method: 'POST',
      body: JSON.stringify({ panelId, cellId })
    }),

  // Watched variables
  listWatched: () => j<WatchedVariable[]>('/api/watched-variables'),
  addWatched: (name: string) =>
    j<{ added: WatchedVariable[]; skipped: string[] }>('/api/watched-variables', {
      method: 'POST', body: JSON.stringify({ name })
    }),
  addWatchedBulk: (names: string) =>
    j<{ added: WatchedVariable[]; skipped: string[] }>('/api/watched-variables', {
      method: 'POST', body: JSON.stringify({ names })
    }),
  removeWatched: (id: string) =>
    j<void>(`/api/watched-variables/${id}`, { method: 'DELETE' }),

  // Tally sources
  listTallySources: () => j<TallySource[]>('/api/tally-sources'),
  getTallySourceBySlug: (slug: string) =>
    j<TallySource>(`/api/tally-sources/by-slug/${encodeURIComponent(slug)}`),
  createTallySource: (data: Partial<TallySource>) =>
    j<TallySource>('/api/tally-sources', { method: 'POST', body: JSON.stringify(data) }),
  updateTallySource: (id: string, data: Partial<TallySource>) =>
    j<TallySource>(`/api/tally-sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTallySource: (id: string) =>
    j<void>(`/api/tally-sources/${id}`, { method: 'DELETE' }),
  previewAutoPopulate: (req: AutoPopulateRequest) =>
    j<AutoPopulateResult>('/api/tally-sources/auto-populate/preview', {
      method: 'POST', body: JSON.stringify(req)
    }),
  bulkCreateTallySources: (items: Array<Partial<TallySource>>) =>
    j<{ created: TallySource[] }>('/api/tally-sources/bulk', {
      method: 'POST', body: JSON.stringify({ items })
    })
};

export interface WatchedVariable {
  id: string;
  name: string;
  createdAt: number;
}

export interface PollerStatus {
  enabled: boolean;
  connected: boolean;
  host: string;
  port: number;
  pollIntervalMs: number;
  wantedCount: number;
  knownCount: number;
  lastPollAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  successInLastPoll: number;
  failInLastPoll: number;
}
