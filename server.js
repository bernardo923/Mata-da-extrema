// ERP Fazenda — backend
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'fazenda2026';
const DATABASE_URL = process.env.DATABASE_URL;

const app = express();
app.use(express.json({ limit: '20mb' }));
app.disable('x-powered-by');

// =============================================================
// Database
// =============================================================
let pool = null;
let memoryFallback = { data: {}, updated_at: null };

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
  console.log('[db] Postgres pool initialized');
} else {
  console.warn('[db] DATABASE_URL not set — using in-memory fallback (DEV ONLY)');
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS farm_state (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (id = 1)
    );
  `);
  await pool.query(`INSERT INTO farm_state (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT DO NOTHING;`);
  console.log('[db] schema ready');
}

// =============================================================
// Auth — single password, constant-time compare
// =============================================================
function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!timingSafeEqualStr(token, APP_PASSWORD)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (timingSafeEqualStr(password, APP_PASSWORD)) {
    return res.json({ token: APP_PASSWORD, ok: true });
  }
  res.status(401).json({ error: 'invalid password' });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: !!pool, ts: new Date().toISOString() });
});

// =============================================================
// State CRUD (single-row JSONB blob)
// =============================================================
app.get('/api/state', auth, async (req, res) => {
  try {
    if (!pool) return res.json(memoryFallback);
    const r = await pool.query('SELECT data, updated_at FROM farm_state WHERE id = 1');
    res.json({
      data: (r.rows[0] && r.rows[0].data) || {},
      updated_at: r.rows[0] && r.rows[0].updated_at,
    });
  } catch (e) {
    console.error('[GET /api/state]', e);
    res.status(500).json({ error: 'db error' });
  }
});

app.put('/api/state', auth, async (req, res) => {
  const data = req.body && req.body.data;
  if (typeof data !== 'object' || data === null) {
    return res.status(400).json({ error: 'invalid payload' });
  }
  try {
    if (!pool) {
      memoryFallback = { data, updated_at: new Date().toISOString() };
      return res.json({ ok: true, updated_at: memoryFallback.updated_at });
    }
    const r = await pool.query(
      'UPDATE farm_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1 RETURNING updated_at',
      [JSON.stringify(data)]
    );
    res.json({ ok: true, updated_at: r.rows[0].updated_at });
  } catch (e) {
    console.error('[PUT /api/state]', e);
    res.status(500).json({ error: 'db error' });
  }
});

// =============================================================
// Static frontend
// =============================================================
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// =============================================================
// Boot
// =============================================================
initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`[erp] listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('[boot] init failed:', err);
    process.exit(1);
  });
