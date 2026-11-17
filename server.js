// ERP Fazenda — backend
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'fazenda2026';
// Senha do vaqueiro: abre só a tela de campo (/campo). Sem a variável, o acesso de campo fica desligado.
const VAQUEIRO_PASSWORD = process.env.VAQUEIRO_PASSWORD || '';
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
  // Lançamentos do campo: tabela própria, só recebe inserts. O ERP incorpora no estado e marca incorporado_em.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campo_lancamentos (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      payload JSONB NOT NULL,
      anexo TEXT,
      autor TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      incorporado_em TIMESTAMPTZ
    );
  `);
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

function tokenRole(token) {
  if (timingSafeEqualStr(token, APP_PASSWORD)) return 'admin';
  if (VAQUEIRO_PASSWORD && timingSafeEqualStr(token, VAQUEIRO_PASSWORD)) return 'vaqueiro';
  return null;
}

function bearer(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// ERP completo: só admin
function auth(req, res, next) {
  if (tokenRole(bearer(req)) !== 'admin') {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Tela de campo: admin ou vaqueiro
function authCampo(req, res, next) {
  const role = tokenRole(bearer(req));
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  req.role = role;
  next();
}

app.post('/api/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  const role = tokenRole(password);
  if (role) return res.json({ token: password, role, ok: true });
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
  // Controle de concorrência: o cliente manda a versão (updated_at) que carregou.
  // Se outro aparelho salvou depois, recusa com 409 para não sobrescrever.
  const base = req.body.baseUpdatedAt || null;
  try {
    if (!pool) {
      if (memoryFallback.updated_at && base !== memoryFallback.updated_at) {
        return res.status(409).json({ error: 'conflict', updated_at: memoryFallback.updated_at });
      }
      memoryFallback = { data, updated_at: new Date().toISOString() };
      return res.json({ ok: true, updated_at: memoryFallback.updated_at });
    }
    // Sem versão base (tela antiga, aberta antes desta atualização): só grava se a linha ainda não tem dados.
    const r = base
      ? await pool.query(
          `UPDATE farm_state SET data = $1::jsonb, updated_at = NOW()
            WHERE id = 1 AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
            RETURNING updated_at`,
          [JSON.stringify(data), base])
      : await pool.query(
          `UPDATE farm_state SET data = $1::jsonb, updated_at = NOW()
            WHERE id = 1 AND (data IS NULL OR data = '{}'::jsonb) RETURNING updated_at`,
          [JSON.stringify(data)]);
    if (!r.rows.length) {
      const cur = await pool.query('SELECT updated_at FROM farm_state WHERE id = 1');
      return res.status(409).json({ error: 'conflict', updated_at: cur.rows[0] && cur.rows[0].updated_at });
    }
    res.json({ ok: true, updated_at: r.rows[0].updated_at });
  } catch (e) {
    console.error('[PUT /api/state]', e);
    res.status(500).json({ error: 'db error' });
  }
});

// =============================================================
// Campo (vaqueiro) — lançamentos append-only
// =============================================================
let memoryCampo = []; // fallback sem banco

const MAX_ANEXO = 4 * 1024 * 1024; // ~4 MB de data URL
const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : parseFloat(v));

// Valida e normaliza um lançamento. Retorna { payload } ou { error }.
function validarLancamento(l) {
  const p = l.payload || {};
  switch (l.tipo) {
    case 'pesagem': {
      const pesoKg = num(p.pesoKg);
      if (!str(p.bovinoId, 80)) return { error: 'bovino obrigatório' };
      if (!isISODate(p.data)) return { error: 'data inválida' };
      if (!(pesoKg > 0 && pesoKg < 2500)) return { error: 'peso inválido' };
      return { payload: { bovinoId: str(p.bovinoId, 80), data: p.data, pesoKg, observacoes: str(p.observacoes) } };
    }
    case 'consumo': {
      const kg = num(p.kg);
      if (!str(p.tipoRacao, 80)) return { error: 'tipo de ração obrigatório' };
      if (!isISODate(p.data)) return { error: 'data inválida' };
      if (!(kg > 0 && kg < 200000)) return { error: 'quantidade inválida' };
      return { payload: { loteId: str(p.loteId, 80) || null, tipoRacao: str(p.tipoRacao, 80), kg, data: p.data, observacoes: str(p.observacoes) } };
    }
    case 'entradaRacao': {
      const kg = num(p.kg);
      if (!str(p.tipoRacao, 80)) return { error: 'tipo de ração obrigatório' };
      if (!isISODate(p.data)) return { error: 'data inválida' };
      if (!(kg > 0 && kg < 1000000)) return { error: 'quantidade inválida' };
      return { payload: { tipoRacao: str(p.tipoRacao, 80), kg, data: p.data, fornecedor: str(p.fornecedor, 120), observacoes: str(p.observacoes) } };
    }
    case 'conta': {
      const valor = num(p.valor);
      if (!str(p.fornecedor, 120)) return { error: 'fornecedor obrigatório' };
      if (!(valor > 0 && valor < 100000000)) return { error: 'valor inválido' };
      if (!isISODate(p.vencimento)) return { error: 'vencimento inválido' };
      return { payload: { fornecedor: str(p.fornecedor, 120), descricao: str(p.descricao), valor, vencimento: p.vencimento } };
    }
    default:
      return { error: 'tipo desconhecido' };
  }
}

async function lerEstado() {
  if (!pool) return memoryFallback.data || {};
  const r = await pool.query('SELECT data FROM farm_state WHERE id = 1');
  return (r.rows[0] && r.rows[0].data) || {};
}

async function lerCampo({ pendentes = false, limite = null } = {}) {
  if (!pool) {
    let rows = memoryCampo.map(({ anexo, ...r }) => ({ ...r, tem_anexo: !!anexo }));
    if (pendentes) rows = rows.filter(r => !r.incorporado_em);
    rows.sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    return limite ? rows.slice(0, limite) : rows;
  }
  const r = await pool.query(
    `SELECT id, tipo, payload, autor, criado_em, incorporado_em, (anexo IS NOT NULL) AS tem_anexo
       FROM campo_lancamentos
      ${pendentes ? 'WHERE incorporado_em IS NULL' : ''}
      ORDER BY criado_em DESC
      ${limite ? 'LIMIT ' + parseInt(limite, 10) : ''}`
  );
  return r.rows;
}

// Dados de referência para a tela do vaqueiro (sem financeiro)
app.get('/api/campo/ref', authCampo, async (req, res) => {
  try {
    const st = await lerEstado();
    const pend = await lerCampo({ pendentes: true });
    const pesagens = [...(st.pesagens || [])];
    const entradas = [...(st.racaoEntradas || [])];
    const consumos = [...(st.racaoConsumos || [])];
    pend.forEach(r => {
      const p = r.payload;
      if (r.tipo === 'pesagem') pesagens.push({ bovinoId: p.bovinoId, data: p.data, pesoKg: p.pesoKg });
      if (r.tipo === 'entradaRacao') entradas.push({ tipo: p.tipoRacao, kg: p.kg, data: p.data });
      if (r.tipo === 'consumo') consumos.push({ tipo: p.tipoRacao, kg: p.kg, data: p.data, loteId: p.loteId });
    });

    const ultimaPesagem = {};
    pesagens.forEach(p => {
      const u = ultimaPesagem[p.bovinoId];
      if (!u || p.data >= u.data) ultimaPesagem[p.bovinoId] = p;
    });

    const ativos = (st.bovinos || []).filter(b => b.status === 'ativo');
    const bovinos = ativos.map(b => {
      const u = ultimaPesagem[b.id];
      return {
        id: b.id, brinco: b.brinco || '', nome: b.nome || '', categoria: b.categoria || '',
        loteId: b.loteId || null,
        pesoAtual: u ? u.pesoKg : (b.pesoEntrada || 0),
        dataPeso: u ? u.data : (b.dataEntrada || null),
      };
    });
    const lotes = (st.lotes || []).map(l => ({
      id: l.id, nome: l.nome, cabecas: ativos.filter(b => b.loteId === l.id).length,
    }));

    // Estoque por tipo de ração (kg) e consumo médio dos últimos 7 dias
    const hoje = new Date();
    const seteDias = new Date(hoje.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const estoque = {};
    const ensure = t => (estoque[t] = estoque[t] || { tipo: t, kg: 0, consumo7d: 0 });
    entradas.forEach(e => { if (e.tipo) ensure(e.tipo).kg += +e.kg || 0; });
    consumos.forEach(c => {
      if (!c.tipo) return;
      const e = ensure(c.tipo);
      e.kg -= +c.kg || 0;
      if (c.data > seteDias) e.consumo7d += +c.kg || 0;
    });

    const recentes = (await lerCampo({ limite: 40 })).map(r => ({
      id: r.id, tipo: r.tipo, payload: r.payload, criado_em: r.criado_em,
      incorporado: !!r.incorporado_em, tem_anexo: r.tem_anexo,
    }));

    res.json({
      fazenda: (st.config && st.config.nomeFazenda) || 'Fazenda',
      role: req.role,
      bovinos, lotes,
      estoque: Object.values(estoque),
      kgPorSaco: (st.config && st.config.kgPorSaco) || 40,
      recentes,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[GET /api/campo/ref]', e);
    res.status(500).json({ error: 'db error' });
  }
});

// Recebe a fila do celular. Idempotente: o id vem do aparelho; reenvio não duplica.
app.post('/api/campo/lancamentos', authCampo, async (req, res) => {
  const lista = Array.isArray(req.body && req.body.lancamentos) ? req.body.lancamentos : [];
  if (!lista.length || lista.length > 200) return res.status(400).json({ error: 'lista vazia ou grande demais' });
  const aceitos = [];
  const rejeitados = [];
  try {
    for (const l of lista) {
      const id = str(l && l.id, 80);
      if (!id) { rejeitados.push({ id: null, error: 'sem id' }); continue; }
      const v = validarLancamento(l);
      if (v.error) { rejeitados.push({ id, error: v.error }); continue; }
      let anexo = null;
      if (l.tipo === 'conta' && typeof l.anexo === 'string' && l.anexo.startsWith('data:image/')) {
        if (l.anexo.length > MAX_ANEXO) { rejeitados.push({ id, error: 'foto grande demais' }); continue; }
        anexo = l.anexo;
      }
      if (pool) {
        await pool.query(
          `INSERT INTO campo_lancamentos (id, tipo, payload, anexo, autor)
           VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [id, l.tipo, JSON.stringify(v.payload), anexo, req.role]
        );
      } else if (!memoryCampo.some(r => r.id === id)) {
        memoryCampo.push({ id, tipo: l.tipo, payload: v.payload, anexo, autor: req.role, criado_em: new Date().toISOString(), incorporado_em: null });
      }
      aceitos.push(id);
    }
    res.json({ ok: true, aceitos, rejeitados });
  } catch (e) {
    console.error('[POST /api/campo/lancamentos]', e);
    res.status(500).json({ error: 'db error', aceitos, rejeitados });
  }
});

// ERP: lançamentos ainda não incorporados ao estado
app.get('/api/campo/pendentes', auth, async (req, res) => {
  try {
    res.json({ lancamentos: await lerCampo({ pendentes: true }) });
  } catch (e) {
    console.error('[GET /api/campo/pendentes]', e);
    res.status(500).json({ error: 'db error' });
  }
});

// ERP: marca como incorporados (depois de salvar o estado)
app.post('/api/campo/ack', auth, async (req, res) => {
  const ids = (Array.isArray(req.body && req.body.ids) ? req.body.ids : []).filter(x => typeof x === 'string');
  if (!ids.length) return res.json({ ok: true, n: 0 });
  try {
    if (pool) {
      await pool.query('UPDATE campo_lancamentos SET incorporado_em = NOW() WHERE id = ANY($1) AND incorporado_em IS NULL', [ids]);
    } else {
      memoryCampo.forEach(r => { if (ids.includes(r.id) && !r.incorporado_em) r.incorporado_em = new Date().toISOString(); });
    }
    res.json({ ok: true, n: ids.length });
  } catch (e) {
    console.error('[POST /api/campo/ack]', e);
    res.status(500).json({ error: 'db error' });
  }
});

// ERP: foto do boleto/nota
app.get('/api/campo/anexo/:id', auth, async (req, res) => {
  try {
    let anexo = null;
    if (pool) {
      const r = await pool.query('SELECT anexo FROM campo_lancamentos WHERE id = $1', [req.params.id]);
      anexo = r.rows[0] && r.rows[0].anexo;
    } else {
      const r = memoryCampo.find(x => x.id === req.params.id);
      anexo = r && r.anexo;
    }
    if (!anexo) return res.status(404).json({ error: 'sem anexo' });
    res.json({ anexo });
  } catch (e) {
    console.error('[GET /api/campo/anexo]', e);
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
