import type {
  Dashboard, Panel, SavedPanelTemplate, CompanionConfig
} from '../types';

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
  getStatus: () => j<PollerStatus>('/api/settings/status')
};

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
