import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { serverEnv } from './config/env';
import { ensureSchema } from './db/pool';
import { restrictiveCors, securityHeaders } from './middleware/security';
import { authRouter } from './routes/auth';
import { healthHandler } from './routes/health';
import { apiRouter } from './routes/vault';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(restrictiveCors);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', healthHandler);
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Serve Vite production build when running built server
const distDir = path.resolve(__dirname, '../dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

async function start(): Promise<void> {
  try {
    await ensureSchema();
  } catch {
    // Allow server to start and report databaseReady: false on /api/health
    console.error('AMAN warning: database schema check deferred (DB unavailable)');
  }

  app.listen(serverEnv.port, () => {
    console.log(`AMAN server listening on port ${serverEnv.port}`);
  });
}

void start();
