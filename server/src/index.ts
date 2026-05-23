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
import buttonsRouter from './routes/buttons.js';
import watchedVariablesRouter from './routes/watchedVariables.js';
import tallySourcesRouter from './routes/tallySources.js';
import authRouter from './routes/auth.js';
import { poller } from './services/poller.js';
import { rebuildWantedVariables } from './services/orchestrator.js';
import { db } from './db/index.js';
import { initTallyDb } from './db/tally.js';
import { initBackgroundsDb, MAX_BACKGROUND_BYTES } from './db/backgrounds.js';
import { initAuthDb } from './db/auth.js';

// Initialise extension tables on the shared sqlite handle before any
// route touches them.
initTallyDb(db);
initBackgroundsDb(db);
initAuthDb(db);

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: '*' } });

app.use(cors());
// JSON body parser stays modest. Background uploads use express.raw() on
// their own route with the higher MAX_BACKGROUND_BYTES cap, so we don't
// need to inflate the global JSON limit.
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/dashboards', dashboardsRouter);
app.use('/api/panels', panelsRouter);
app.use('/api/saved-panels', savedPanelsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/buttons', buttonsRouter);
app.use('/api/watched-variables', watchedVariablesRouter);
app.use('/api/tally-sources', tallySourcesRouter);
app.use('/api/auth', authRouter);

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
  socket.emit('values:snapshot', poller.getAll());
});

poller.on('change', ({ id, value }: { id: string; value: string }) => {
  io.emit('values:update', { id, value });
});

// Bootstrap
rebuildWantedVariables();
poller.start();

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT} (bg upload cap ${(MAX_BACKGROUND_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
});
