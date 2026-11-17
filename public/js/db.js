// ===== Storage Layer (API-backed) =====
const TOKEN_KEY = 'erp_fazenda_token';
const API_BASE = ''; // same origin

const DB = {
  state: {
    bovinos: [],
    lotes: [],
    pesagens: [],
    despesas: [],
    investimentos: [],
    vendas: [],
    racaoEntradas: [],
    racaoConsumos: [],
    contasPagar: [],
    financiamentos: [],
    config: {
      kgPorSaco: 40,
      nomeFazenda: 'Mata da Extrema',
      rendimentoCarcaca: 0.52,
      areaTotalHa: 0,
      areaPastoHa: 0,
      pesoUA: 450,
    },
  },

  token: null,
  _saveTimer: null,
  _syncing: false,
  _pendingSync: false,
  _lastSyncStatus: 'idle',

  // ----- Auth -----
  getToken() {
    return this.token || sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  },

  setToken(token, persist) {
    this.token = token;
    if (persist) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  clearToken() {
    this.token = null;
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  },

  async login(password, persist) {
    const r = await fetch(API_BASE + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error('Senha incorreta');
    const j = await r.json();
    if (j.role === 'vaqueiro') {
      // senha do vaqueiro abre só a tela de campo
      localStorage.setItem('campo_token', j.token);
      location.href = '/campo/';
      return j;
    }
    this.setToken(j.token, !!persist);
    return j;
  },

  async _fetch(url, opts = {}) {
    const token = this.getToken();
    const headers = Object.assign({}, opts.headers, { 'Content-Type': 'application/json' });
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = await fetch(API_BASE + url, Object.assign({}, opts, { headers }));
    if (r.status === 401) {
      this.clearToken();
      const err = new Error('unauthorized');
      err.status = 401;
      throw err;
    }
    return r;
  },

  // ----- State load / save -----
  async load() {
    const r = await this._fetch('/api/state');
    if (!r.ok) throw new Error('Falha ao carregar estado');
    const j = await r.json();
    this._updatedAt = j.updated_at || null;
    if (j.data && Object.keys(j.data).length) {
      this.state = {
        ...this.state,
        ...j.data,
        config: { ...this.state.config, ...(j.data.config || {}) },
      };
    }
    ['racaoEntradas', 'racaoConsumos', 'contasPagar', 'financiamentos'].forEach(k => {
      if (!Array.isArray(this.state[k])) this.state[k] = [];
    });
    this._lastSyncStatus = 'ok';
    this._updateSyncIndicator();
    await this.incorporarCampo();
  },

  // Traz para o estado os lançamentos feitos na tela do vaqueiro (/campo).
  // Idempotente: usa o id do lançamento como id do registro; se já existe, pula.
  async incorporarCampo() {
    let lancs = [];
    try {
      const r = await this._fetch('/api/campo/pendentes');
      if (!r.ok) return 0;
      lancs = (await r.json()).lancamentos || [];
    } catch (e) {
      console.warn('[campo] não foi possível buscar pendentes', e);
      return 0;
    }
    if (!lancs.length) return 0;
    const st = this.state;
    const existe = (arr, id) => arr.some(x => x.id === id);
    let n = 0;
    lancs.sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em))).forEach(l => {
      const p = l.payload || {};
      const base = { id: l.id, origem: 'campo', lancadoEm: l.criado_em };
      if (l.tipo === 'pesagem' && !existe(st.pesagens, l.id)) {
        st.pesagens.push({ ...base, bovinoId: p.bovinoId, data: p.data, pesoKg: p.pesoKg, observacoes: p.observacoes || '' });
        n++;
      } else if (l.tipo === 'consumo' && !existe(st.racaoConsumos, l.id)) {
        st.racaoConsumos.push({ ...base, data: p.data, loteId: p.loteId || null, tipo: p.tipoRacao, kg: p.kg, observacoes: p.observacoes || '' });
        n++;
      } else if (l.tipo === 'entradaRacao' && !existe(st.racaoEntradas, l.id)) {
        st.racaoEntradas.push({ ...base, data: p.data, tipo: p.tipoRacao, kg: p.kg, fornecedor: p.fornecedor || '', observacoes: p.observacoes || '' });
        n++;
      } else if (l.tipo === 'conta' && !existe(st.contasPagar, l.id)) {
        st.contasPagar.push({
          ...base, fornecedor: p.fornecedor, descricao: p.descricao || '', valor: p.valor,
          vencimento: p.vencimento, status: 'pendente', temAnexo: !!l.tem_anexo,
          despesaId: null, dataPagamento: null,
        });
        n++;
      }
    });
    // salva o estado ANTES de marcar como incorporado; se falhar, na próxima carga tenta de novo sem duplicar
    clearTimeout(this._saveTimer);
    await this._sync();
    if (this._lastSyncStatus !== 'ok') return 0;
    try {
      await this._fetch('/api/campo/ack', { method: 'POST', body: JSON.stringify({ ids: lancs.map(l => l.id) }) });
    } catch (e) { console.warn('[campo] ack falhou', e); }
    if (n && typeof U !== 'undefined') setTimeout(() => U.toast(`${n} lançamento(s) do campo incorporados`, 'success'), 300);
    return n;
  },

  async anexoCampo(id) {
    const r = await this._fetch('/api/campo/anexo/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('sem anexo');
    return (await r.json()).anexo;
  },

  // Debounced save: agrupa mutações em rajadas curtas em uma chamada de rede
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._sync(), 600);
    this._lastSyncStatus = 'syncing';
    this._updateSyncIndicator();
  },

  async _sync() {
    if (this._syncing) { this._pendingSync = true; return; }
    this._syncing = true;
    this._lastSyncStatus = 'syncing';
    this._updateSyncIndicator();
    try {
      const r = await this._fetch('/api/state', {
        method: 'PUT',
        body: JSON.stringify({ data: this.state, baseUpdatedAt: this._updatedAt }),
      });
      if (r.status === 409) {
        // Outro aparelho/aba salvou depois que esta tela carregou: não sobrescreve.
        this._lastSyncStatus = 'error';
        if (typeof U !== 'undefined') U.toast('Os dados foram alterados em outro aparelho. Recarregando a versão mais nova — refaça a última alteração.', 'error');
        setTimeout(() => location.reload(), 2500);
        return;
      }
      if (!r.ok) throw new Error('Falha ao salvar (' + r.status + ')');
      const j = await r.json().catch(() => ({}));
      if (j.updated_at) this._updatedAt = j.updated_at;
      this._lastSyncStatus = 'ok';
    } catch (e) {
      console.error('[sync]', e);
      this._lastSyncStatus = 'error';
      if (typeof U !== 'undefined') U.toast('Falha ao sincronizar — verifique a conexão', 'error');
    } finally {
      this._syncing = false;
      this._updateSyncIndicator();
      if (this._pendingSync) { this._pendingSync = false; this.save(); }
    }
  },

  _updateSyncIndicator() {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    const map = {
      idle:    { text: '',                  cls: 'text-stone-400' },
      syncing: { text: '⟳ sincronizando…',  cls: 'text-stone-500' },
      ok:      { text: '✓ sincronizado',    cls: 'text-green-600' },
      error:   { text: '⚠ erro de sync',    cls: 'text-red-600' },
    };
    const m = map[this._lastSyncStatus] || map.idle;
    el.textContent = m.text;
    el.className = 'text-xs ' + m.cls;
  },

  reset() {
    this.state = {
      bovinos: [], lotes: [], pesagens: [], despesas: [], investimentos: [], vendas: [],
      racaoEntradas: [], racaoConsumos: [], contasPagar: [], financiamentos: [],
      config: { nomeFazenda: 'Mata da Extrema', rendimentoCarcaca: 0.52, areaTotalHa: 0, areaPastoHa: 0, pesoUA: 450, kgPorSaco: 40 },
    };
    this.save();
  },

  export() {
    return JSON.stringify(this.state, null, 2);
  },

  import(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    this.state = { ...this.state, ...parsed };
    this.save();
  },

  logout() {
    this.clearToken();
    location.reload();
  },

  // ===== BOVINOS =====
  bovinos: {
    list() { return DB.state.bovinos; },
    get(id) { return DB.state.bovinos.find(b => b.id === id); },
    add(b) {
      const novo = {
        id: U.uid(),
        brinco: '',
        nome: '',
        categoria: 'Boi',
        sexo: 'M',
        loteId: null,
        dataEntrada: U.todayISO(),
        pesoEntrada: 0,
        precoArrobaEntrada: 0,
        custoEntrada: 0,
        observacoes: '',
        status: 'ativo',
        dataSaida: null,
        pesoSaida: null,
        precoArrobaSaida: null,
        receitaSaida: null,
        ...b,
      };
      DB.state.bovinos.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.bovinos.findIndex(b => b.id === id);
      if (i < 0) return;
      DB.state.bovinos[i] = { ...DB.state.bovinos[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.bovinos = DB.state.bovinos.filter(b => b.id !== id);
      DB.state.pesagens = DB.state.pesagens.filter(p => p.bovinoId !== id);
      DB.save();
    },
    ativos() {
      return DB.state.bovinos.filter(b => b.status === 'ativo');
    },
    porLote(loteId) {
      return DB.state.bovinos.filter(b => b.loteId === loteId && b.status === 'ativo');
    },
  },

  // ===== LOTES =====
  lotes: {
    list() { return DB.state.lotes; },
    get(id) { return DB.state.lotes.find(l => l.id === id); },
    add(l) {
      const novo = { id: U.uid(), nome: '', descricao: '', dataCriacao: U.todayISO(), ...l };
      DB.state.lotes.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.lotes.findIndex(l => l.id === id);
      if (i < 0) return;
      DB.state.lotes[i] = { ...DB.state.lotes[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.lotes = DB.state.lotes.filter(l => l.id !== id);
      DB.state.bovinos.forEach(b => { if (b.loteId === id) b.loteId = null; });
      DB.save();
    },
  },

  // ===== PESAGENS =====
  pesagens: {
    list() { return DB.state.pesagens; },
    add(p) {
      const novo = {
        id: U.uid(),
        bovinoId: null,
        data: U.todayISO(),
        pesoKg: 0,
        observacoes: '',
        ...p,
      };
      DB.state.pesagens.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.pesagens.findIndex(p => p.id === id);
      if (i < 0) return;
      DB.state.pesagens[i] = { ...DB.state.pesagens[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.pesagens = DB.state.pesagens.filter(p => p.id !== id);
      DB.save();
    },
    porBovino(bovinoId) {
      return DB.state.pesagens
        .filter(p => p.bovinoId === bovinoId)
        .sort((a, b) => a.data.localeCompare(b.data));
    },
    // peso atual = pesagem mais recente OU peso de entrada
    pesoAtual(bovinoId) {
      const bovino = DB.bovinos.get(bovinoId);
      if (!bovino) return 0;
      const ps = this.porBovino(bovinoId);
      if (ps.length === 0) return bovino.pesoEntrada || 0;
      return ps[ps.length - 1].pesoKg;
    },
    dataUltimaPesagem(bovinoId) {
      const bovino = DB.bovinos.get(bovinoId);
      if (!bovino) return null;
      const ps = this.porBovino(bovinoId);
      if (ps.length === 0) return bovino.dataEntrada;
      return ps[ps.length - 1].data;
    },
    // GMD desde entrada
    gmdGeral(bovinoId) {
      const bovino = DB.bovinos.get(bovinoId);
      if (!bovino) return 0;
      const pesoFinal = this.pesoAtual(bovinoId);
      const dataFinal = this.dataUltimaPesagem(bovinoId);
      const dias = U.daysBetween(bovino.dataEntrada, dataFinal);
      return U.gmd(bovino.pesoEntrada, pesoFinal, dias);
    },
  },

  // ===== DESPESAS OPERACIONAIS =====
  despesas: {
    list() { return DB.state.despesas; },
    get(id) { return DB.state.despesas.find(d => d.id === id); },
    add(d) {
      const novo = {
        id: U.uid(),
        data: U.todayISO(),
        fornecedor: '',
        categoria: 'Outros',
        valor: 0,
        rateioTipo: 'peso', // peso | igual | manual
        rateioEscopo: 'todos', // todos | lote | manual
        loteId: null,
        bovinosManuais: [], // [{bovinoId, valor}]
        observacoes: '',
        ...d,
      };
      DB.state.despesas.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.despesas.findIndex(d => d.id === id);
      if (i < 0) return;
      DB.state.despesas[i] = { ...DB.state.despesas[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.despesas = DB.state.despesas.filter(d => d.id !== id);
      DB.save();
    },
  },

  // ===== INVESTIMENTOS =====
  investimentos: {
    list() { return DB.state.investimentos; },
    add(i) {
      const novo = {
        id: U.uid(),
        data: U.todayISO(),
        descricao: '',
        categoria: 'Outros',
        valor: 0,
        observacoes: '',
        ...i,
      };
      DB.state.investimentos.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.investimentos.findIndex(x => x.id === id);
      if (i < 0) return;
      DB.state.investimentos[i] = { ...DB.state.investimentos[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.investimentos = DB.state.investimentos.filter(i => i.id !== id);
      DB.save();
    },
  },

  // ===== FINANCIAMENTOS =====
  // { id, descricao, banco, dataContratacao, valor, taxaAA (%), vencimento, regime: 'composto'|'simples',
  //   pagamentos: [{ id, data, valor, observacoes }], observacoes }
  financiamentos: {
    list() { if (!Array.isArray(DB.state.financiamentos)) DB.state.financiamentos = []; return DB.state.financiamentos; },
    get(id) { return this.list().find(f => f.id === id); },
    add(f) {
      const novo = { id: U.uid(), descricao: '', banco: '', dataContratacao: U.todayISO(), valor: 0, taxaAA: 0, vencimento: '', regime: 'composto', pagamentos: [], observacoes: '', ...f };
      this.list().push(novo); DB.save(); return novo;
    },
    update(id, patch) {
      const l = this.list(); const i = l.findIndex(x => x.id === id);
      if (i < 0) return; l[i] = { ...l[i], ...patch }; DB.save();
    },
    remove(id) { DB.state.financiamentos = this.list().filter(f => f.id !== id); DB.save(); },
    addPagamento(id, p) {
      const f = this.get(id); if (!f) return;
      f.pagamentos = [...(f.pagamentos || []), { id: U.uid(), ...p }]; DB.save();
    },
    removePagamento(id, pid) {
      const f = this.get(id); if (!f) return;
      f.pagamentos = (f.pagamentos || []).filter(p => p.id !== pid); DB.save();
    },
    // Situação na data (ISO): { principal, juros, saldo, pago, jurosTotais }
    // Juros corridos por dia, base 365. Composto: taxa efetiva anual capitalizada dia a dia.
    // Simples: juros sobre o principal. Pagamentos abatem primeiro os juros, depois o principal.
    situacao(f, ateISO) {
      const dia = 86400000, d0 = Date.parse(f.dataContratacao), dFim = Date.parse(ateISO);
      let principal = 0, juros = 0, pago = 0, jurosTotais = 0;
      if (!f.dataContratacao || dFim < d0) return { principal, juros, saldo: 0, pago, jurosTotais };
      principal = +f.valor || 0;
      const i = (+f.taxaAA || 0) / 100;
      const correr = (de, ate) => {
        const t = Math.max(0, (ate - de) / dia) / 365;
        const j = f.regime === 'simples' ? principal * i * t : (principal + juros) * (Math.pow(1 + i, t) - 1);
        juros += j; jurosTotais += j;
      };
      let ult = d0;
      [...(f.pagamentos || [])].filter(p => Date.parse(p.data) <= dFim).sort((a, b) => a.data.localeCompare(b.data)).forEach(p => {
        const dp = Math.max(Date.parse(p.data), d0);
        correr(ult, dp); ult = dp;
        let v = +p.valor || 0; pago += v;
        const aj = Math.min(v, juros); juros -= aj; v -= aj;
        principal = Math.max(0, principal - v);
      });
      correr(ult, dFim);
      return { principal, juros, saldo: principal + juros, pago, jurosTotais };
    },
    // Juros de competência entre duas datas (de exclusivo, ate inclusivo)
    jurosEntre(f, deISO, ateISO) {
      return Math.max(0, this.situacao(f, ateISO).jurosTotais - this.situacao(f, deISO).jurosTotais);
    },
  },

  // ===== VENDAS =====
  vendas: {
    list() { return DB.state.vendas; },
    add(v) {
      const novo = {
        id: U.uid(),
        data: U.todayISO(),
        comprador: '',
        bovinoIds: [],
        pesoTotalKg: 0,
        precoArroba: 0,
        valorTotal: 0,
        observacoes: '',
        ...v,
      };
      DB.state.vendas.push(novo);
      // marcar bovinos como vendidos
      novo.bovinoIds.forEach(bid => {
        DB.bovinos.update(bid, { status: 'vendido', dataSaida: novo.data });
      });
      DB.save();
      return novo;
    },
    remove(id) {
      const v = DB.state.vendas.find(x => x.id === id);
      if (v) {
        v.bovinoIds.forEach(bid => {
          DB.bovinos.update(bid, { status: 'ativo', dataSaida: null, pesoSaida: null, receitaSaida: null });
        });
      }
      DB.state.vendas = DB.state.vendas.filter(x => x.id !== id);
      DB.save();
    },
  },

  // ===== RAÇÃO (estoque e consumo) =====
  racao: {
    entradas() { return DB.state.racaoEntradas; },
    consumos() { return DB.state.racaoConsumos; },
    addEntrada(e) {
      const novo = { id: U.uid(), data: U.todayISO(), tipo: '', kg: 0, fornecedor: '', observacoes: '', ...e };
      DB.state.racaoEntradas.push(novo);
      DB.save();
      return novo;
    },
    addConsumo(c) {
      const novo = { id: U.uid(), data: U.todayISO(), loteId: null, tipo: '', kg: 0, observacoes: '', ...c };
      DB.state.racaoConsumos.push(novo);
      DB.save();
      return novo;
    },
    remove(id) {
      DB.state.racaoEntradas = DB.state.racaoEntradas.filter(x => x.id !== id);
      DB.state.racaoConsumos = DB.state.racaoConsumos.filter(x => x.id !== id);
      DB.save();
    },
    tipos() {
      const s = new Set();
      DB.state.racaoEntradas.forEach(e => e.tipo && s.add(e.tipo));
      DB.state.racaoConsumos.forEach(c => c.tipo && s.add(c.tipo));
      return [...s].sort((a, b) => a.localeCompare(b));
    },
    // [{tipo, entradas, consumo, saldo, consumoDia (média 7d), dias}]
    estoque() {
      const seteDias = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      return this.tipos().map(tipo => {
        const ent = U.sum(DB.state.racaoEntradas.filter(e => e.tipo === tipo), 'kg');
        const cons = DB.state.racaoConsumos.filter(c => c.tipo === tipo);
        const consTotal = U.sum(cons, 'kg');
        const cons7 = U.sum(cons.filter(c => c.data > seteDias), 'kg');
        const consumoDia = cons7 / 7;
        const saldo = ent - consTotal;
        return { tipo, entradas: ent, consumo: consTotal, saldo, consumoDia, dias: consumoDia > 0 ? saldo / consumoDia : null };
      });
    },
  },

  // ===== CONTAS A PAGAR =====
  contas: {
    list() { return DB.state.contasPagar; },
    get(id) { return DB.state.contasPagar.find(c => c.id === id); },
    add(c) {
      const novo = {
        id: U.uid(), fornecedor: '', descricao: '', valor: 0, vencimento: U.todayISO(),
        status: 'pendente', temAnexo: false, despesaId: null, dataPagamento: null, origem: 'erp', ...c,
      };
      DB.state.contasPagar.push(novo);
      DB.save();
      return novo;
    },
    update(id, patch) {
      const i = DB.state.contasPagar.findIndex(c => c.id === id);
      if (i < 0) return;
      DB.state.contasPagar[i] = { ...DB.state.contasPagar[i], ...patch };
      DB.save();
    },
    remove(id) {
      DB.state.contasPagar = DB.state.contasPagar.filter(c => c.id !== id);
      DB.save();
    },
    pendentes() { return DB.state.contasPagar.filter(c => c.status === 'pendente'); },
    // aprovadas e ainda não pagas
    aPagar() { return DB.state.contasPagar.filter(c => c.status === 'aprovada'); },
  },

  // ===== RATEIO ENGINE =====
  rateio: {
    // retorna mapa { bovinoId: valorAlocado } para uma despesa
    calcular(despesa) {
      const result = {};
      if (despesa.rateioTipo === 'manual') {
        despesa.bovinosManuais.forEach(b => { result[b.bovinoId] = b.valor; });
        return result;
      }

      // determinar bovinos elegíveis (estavam ativos na data da despesa)
      const dataRef = despesa.data;
      const bovinos = DB.state.bovinos.filter(b => {
        if (b.dataEntrada > dataRef) return false;
        if (b.dataSaida && b.dataSaida < dataRef) return false;
        if (despesa.rateioEscopo === 'lote' && despesa.loteId) {
          return b.loteId === despesa.loteId;
        }
        return true;
      });

      if (bovinos.length === 0) return result;

      if (despesa.rateioTipo === 'igual') {
        const cota = despesa.valor / bovinos.length;
        bovinos.forEach(b => { result[b.id] = cota; });
        return result;
      }

      // proporcional ao peso na data da despesa
      const pesos = bovinos.map(b => {
        // peso na data: última pesagem <= dataRef, ou peso de entrada
        const ps = DB.pesagens
          .porBovino(b.id)
          .filter(p => p.data <= dataRef);
        const peso = ps.length ? ps[ps.length - 1].pesoKg : b.pesoEntrada;
        return { bovino: b, peso: peso || 1 };
      });
      const totalPeso = pesos.reduce((s, x) => s + x.peso, 0);
      if (totalPeso === 0) return result;
      pesos.forEach(({ bovino, peso }) => {
        result[bovino.id] = (peso / totalPeso) * despesa.valor;
      });
      return result;
    },

    // custo operacional total alocado a um bovino
    custoOperacionalBovino(bovinoId) {
      let total = 0;
      DB.state.despesas.forEach(d => {
        const r = this.calcular(d);
        if (r[bovinoId]) total += r[bovinoId];
      });
      return total;
    },

    // custo total bovino (entrada + operacional alocado)
    custoTotalBovino(bovinoId) {
      const b = DB.bovinos.get(bovinoId);
      if (!b) return 0;
      return (b.custoEntrada || 0) + this.custoOperacionalBovino(bovinoId);
    },
  },
};
