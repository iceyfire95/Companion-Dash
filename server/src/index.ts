import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import dashboardsRouter from './routes/dashboards.js';
import panelsRouter from './routes/panels.js';
import savedPanelsRouter from './routes/savedPanels.js';
import settingsRouter from './routes/settings.js';
import { poller } from './services/poller.js';
import { rebuildWantedVariables } from './services/orchestrator.js';

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/dashboards', dashboardsRouter);
app.use('/api/panels', panelsRouter);
app.use('/api/saved-panels', savedPanelsRouter);
app.use('/api/settings', settingsRouter);

// Serve built client when present (production single-port)
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// --- Socket.io: emit variable changes to viewers ---
io.on('connection', (socket) => {
  // Send full snapshot on connect
  socket.emit('values:snapshot', poller.getAll());
});

poller.on('change', ({ id, value }: { id: string; value: string }) => {
  io.emit('values:update', { id, value });
});

// Bootstrap
rebuildWantedVariables();
poller.start();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
