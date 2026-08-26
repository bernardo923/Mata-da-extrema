// ===== Utilities =====
const ARROBA_KG = 15; // 1 @ = 15 kg de carcaça
const RENDIMENTO_PADRAO = 0.52; // rendimento de carcaça padrão (peso vivo -> carcaça)

const U = {
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  },

  formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  parseDateBR(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  },

  daysBetween(a, b) {
    const ms = new Date(b) - new Date(a);
    return Math.round(ms / 86400000);
  },

  money(v) {
    if (v == null || isNaN(v)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(v);
  },

  num(v, decimals = 2) {
    if (v == null || isNaN(v)) return '—';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(v);
  },

  parseMoney(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    let s = String(str).trim();
    s = s.replace(/[^\d,.\-]/g, '');
    // Brazilian: 1.234,56 — convert thousands dot, decimal comma
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  },

  // Peso vivo (kg) -> Arrobas (@)
  // Em pecuária BR: @ é medida em carcaça (1@ = 15 kg de carcaça)
  // Para boi vivo: @ vivo = peso_vivo / 30 (aproximado, considerando 50% rendimento)
  // Para precisão: @ carcaça = peso_vivo * rendimento / 15
  kgToArroba(kg, rendimento = RENDIMENTO_PADRAO) {
    return (kg * rendimento) / ARROBA_KG;
  },

  arrobaToKgVivo(arrobas, rendimento = RENDIMENTO_PADRAO) {
    return (arrobas * ARROBA_KG) / rendimento;
  },

  // GMD: ganho médio diário em kg
  gmd(pesoInicial, pesoFinal, dias) {
    if (!dias || dias <= 0) return 0;
    return (pesoFinal - pesoInicial) / dias;
  },

  toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className =
      'fixed bottom-6 right-6 text-white text-sm px-4 py-2 rounded shadow-lg z-50 ' +
      (type === 'error' ? 'bg-red-700' : type === 'success' ? 'bg-green-700' : 'bg-stone-900');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2500);
  },

  modal(title, bodyHTML, onMount) {
    const m = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHTML;
    m.classList.remove('hidden');
    m.classList.add('flex');
    if (onMount) onMount(document.getElementById('modal-body'));
  },

  closeModal() {
    const m = document.getElementById('modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
    document.getElementById('modal-body').innerHTML = '';
  },

  confirm(msg) {
    return window.confirm(msg);
  },

  esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  groupBy(arr, key) {
    return arr.reduce((acc, x) => {
      const k = typeof key === 'function' ? key(x) : x[key];
      (acc[k] = acc[k] || []).push(x);
      return acc;
    }, {});
  },

  sum(arr, key) {
    return arr.reduce((s, x) => s + (typeof key === 'function' ? key(x) : x[key] || 0), 0);
  },

  median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  },

  // Parse CSV with quoted fields. Auto-detects ; or , as separator.
  parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (!lines.length) return { headers: [], rows: [] };
    // detect separator
    const first = lines[0];
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const parseLine = (line) => {
      const out = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
          inQ = !inQ; continue;
        }
        if (c === sep && !inQ) { out.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      out.push(cur.trim());
      return out;
    };
    // Normaliza cabeçalhos: minúsculas, sem acentos, sem unidades "(kg)"/"(R$)" e sem espaços
    const normHeader = (h) => h
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '');
    const headers = parseLine(lines[0]).map(normHeader);
    const rows = lines.slice(1).map(l => {
      const cols = parseLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
      return obj;
    });
    return { headers, rows };
  },

  download(filename, data, mime = 'application/json') {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Categorias padrão (baseadas no controle de gastos da fazenda)
const CATEGORIAS_DESPESA = [
  'Ração',
  'Vacinas',
  'Veterinário',
  'Plantel',
  'Sal mineral',
  'Salários',
  'Energia',
  'Manutenção',
  'Despesas administrativas',
  'Imposto',
  'Combustível',
  'Frete',
  'Advogado',
  'Outros',
];

const CATEGORIAS_INVESTIMENTO = [
  'Pasto / Formação',
  'Sede',
  'Curral',
  'Cercas',
  'Maquinário',
  'Veículos',
  'Benfeitorias',
  'Reservatório / Água',
  'Outros',
];

const CATEGORIAS_BOVINO = ['Bezerro', 'Bezerra', 'Novilho', 'Novilha', 'Boi', 'Vaca', 'Touro'];

const RATEIO_TIPOS = [
  { id: 'peso', label: 'Proporcional ao peso (recomendado p/ ração)' },
  { id: 'igual', label: 'Igual por cabeça' },
  { id: 'manual', label: 'Manual (lote/bovino específico)' },
];
