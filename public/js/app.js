// ===== Router & App =====
const App = {
  routes: {
    'dashboard': { title: 'Dashboard', subtitle: 'Visão geral da fazenda' },
    'bovinos': { title: 'Bovinos', subtitle: 'Plantel — entradas, status e ranking' },
    'pesagens': { title: 'Pesagens', subtitle: 'Histórico de pesagens individuais e em lote' },
    'lotes': { title: 'Lotes', subtitle: 'Agrupamento para rateio e manejo' },
    'despesas': { title: 'Despesas operacionais', subtitle: 'OPEX com rateio por lote ou peso' },
    'contas': { title: 'Contas a pagar', subtitle: 'Aprovação das contas lançadas pelo vaqueiro e vencimentos' },
    'racao': { title: 'Ração & Estoque', subtitle: 'Entradas, consumo por lote e autonomia do estoque' },
    'investimentos': { title: 'Investimentos', subtitle: 'CAPEX — pasto, sede, curral, maquinário' },
    'vendas': { title: 'Vendas / Receitas', subtitle: 'Saídas para frigorífico e outras receitas' },
    'dre': { title: 'DRE', subtitle: 'Demonstração de resultado e investimentos do período' },
    'rateio': { title: 'Rateio & Custos', subtitle: 'Custo alocado por bovino' },
    'simulador': { title: 'Simulador de venda', subtitle: 'Projete margem e lucro antes de vender' },
    'relatorios': { title: 'Relatórios', subtitle: 'DRE, indicadores zootécnicos e financeiros' },
    'config': { title: 'Configurações da fazenda', subtitle: 'Áreas, parâmetros zootécnicos, identificação' },
    'dados': { title: 'Importar / Exportar', subtitle: 'Backup, restauração e importação CSV' },
  },

  async init() {
    // Tenta carregar; se 401, mostra tela de login
    try {
      await this.boot();
    } catch (e) {
      if (e && e.status === 401) {
        this.showAuthScreen();
        return;
      }
      console.error(e);
      document.getElementById('loading-screen').innerHTML =
        '<div class="text-center text-red-700"><div class="text-lg font-semibold">Erro ao iniciar</div><div class="text-sm mt-2">' +
        (e.message || e) + '</div><button onclick="location.reload()" class="btn btn-primary mt-4">Tentar novamente</button></div>';
    }
  },

  async boot() {
    await DB.load();
    if (SEED.shouldSeed()) {
      SEED.run();
      DB.save();
      U.toast('Dados de exemplo carregados — explore e depois resete em Importar/Exportar', 'info');
    }
    this.showApp();
    document.getElementById('today-date').textContent = U.formatDate(U.todayISO());
    document.getElementById('modal-close').addEventListener('click', U.closeModal);
    document.getElementById('modal').addEventListener('click', e => {
      if (e.target.id === 'modal') U.closeModal();
    });
    document.getElementById('btn-quick-add').addEventListener('click', () => App.quickAdd());
    window.addEventListener('hashchange', () => this.render());
    // best-effort flush before unload
    window.addEventListener('beforeunload', () => {
      if (DB._saveTimer) {
        clearTimeout(DB._saveTimer);
        // sync attempt is best-effort; sendBeacon would be ideal but auth header isn't supported there
        try { DB._sync(); } catch (e) {}
      }
    });
    if (!location.hash) location.hash = '#/dashboard';
    this.render();
  },

  showAuthScreen() {
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('app-root').classList.add('hidden');
    const auth = document.getElementById('auth-screen');
    auth.classList.remove('hidden');
    auth.classList.add('flex');
    const form = document.getElementById('auth-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const password = document.getElementById('auth-password').value;
      const persist = document.getElementById('auth-persist').checked;
      const err = document.getElementById('auth-error');
      err.classList.add('hidden');
      try {
        await DB.login(password, persist);
        auth.classList.add('hidden');
        auth.classList.remove('flex');
        document.getElementById('loading-screen').classList.remove('hidden');
        await this.boot();
      } catch (e2) {
        err.textContent = 'Senha incorreta. Tente novamente.';
        err.classList.remove('hidden');
      }
    });
  },

  showApp() {
    document.getElementById('loading-screen').classList.add('hidden');
    const root = document.getElementById('app-root');
    root.classList.remove('hidden');
    root.classList.add('flex');
  },

  parseHash() {
    const hash = location.hash.replace(/^#\//, '') || 'dashboard';
    const [route, ...params] = hash.split('/');
    return { route, params };
  },

  render() {
    const { route, params } = this.parseHash();
    const meta = this.routes[route] || this.routes.dashboard;
    document.getElementById('page-title').textContent = meta.title;
    document.getElementById('page-subtitle').textContent = meta.subtitle;
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === route);
    });

    const badge = document.getElementById('nav-contas-badge');
    if (badge) {
      const n = DB.contas.pendentes().length;
      badge.textContent = n;
      badge.classList.toggle('hidden', !n);
    }

    const view = document.getElementById('view');
    let html = '';
    if (route === 'bovinos' && params[0]) {
      html = Views.bovinoDetail(params[0]);
    } else if (Views[route]) {
      html = Views[route]();
    } else {
      html = Views.dashboard();
    }
    view.innerHTML = html;
    // Re-execute inline scripts (Chart.js)
    view.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script');
      ns.textContent = s.textContent;
      s.replaceWith(ns);
    });
  },

  quickAdd() {
    const { route } = this.parseHash();
    const map = {
      bovinos: () => Views.bovinoForm(),
      pesagens: () => Views.pesagemForm(),
      lotes: () => Views.loteForm(),
      despesas: () => Views.despesaForm(),
      contas: () => Views.contaForm(),
      racao: () => Views.racaoForm('consumo'),
      investimentos: () => Views.investimentoForm(),
      vendas: () => Views.vendaForm(),
    };
    const action = map[route] || (() => {
      U.modal('O que deseja adicionar?', `
        <div class="grid grid-cols-2 gap-2">
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.bovinoForm();">Bovino</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.pesagemForm();">Pesagem</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.despesaForm();">Despesa</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.investimentoForm();">Investimento</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.vendaForm();">Venda</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.loteForm();">Lote</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.contaForm();">Conta a pagar</button>
          <button class="btn btn-secondary" onclick="U.closeModal(); Views.racaoForm('consumo');">Consumo de ração</button>
        </div>
      `);
    });
    action();
  },

  exportData() {
    const data = DB.export();
    U.download(`backup_fazenda_${U.todayISO()}.json`, data);
    U.toast('Backup baixado', 'success');
  },

  importData() {
    const file = document.getElementById('import-file').files[0];
    if (!file) { U.toast('Escolha um arquivo', 'error'); return; }
    if (!U.confirm('Isso vai substituir todos os dados atuais (servidor + cliente). Continuar?')) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        DB.import(e.target.result);
        U.toast('Dados importados', 'success');
        App.render();
      } catch (err) {
        U.toast('Falha ao importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },

  importCSV() {
    const file = document.getElementById('import-csv').files[0];
    if (!file) { U.toast('Escolha um arquivo CSV', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { U.toast('CSV vazio', 'error'); return; }

      // Parse CSV considerando aspas
      const parseLine = (line) => {
        const out = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQ = !inQ; continue; }
          if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
          cur += c;
        }
        out.push(cur);
        return out;
      };

      let imported = 0, skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        if (cols.length < 5) { skipped++; continue; }
        const [dataStr, mes, ano, descr, valor, tipo] = cols;
        const data = U.parseDateBR(dataStr);
        if (!data) { skipped++; continue; }
        const v = U.parseMoney(valor);
        if (v === 0) { skipped++; continue; }
        const categoria = (tipo || 'Outros').trim();

        if (v > 0) {
          // Receita: ignora — vendas devem ser registradas individualmente
          skipped++;
          continue;
        }

        const valorAbs = Math.abs(v);
        // Categorias de investimento da fazenda
        const isInvestimento = ['Casa', 'Pasto', 'Curral', 'Sede', 'Cercas', 'Maquinário'].some(
          c => categoria.toLowerCase().includes(c.toLowerCase())
        );

        if (isInvestimento) {
          let cat = 'Outros';
          if (/casa|sede/i.test(categoria)) cat = 'Sede';
          else if (/pasto/i.test(categoria)) cat = 'Pasto / Formação';
          else if (/curral/i.test(categoria)) cat = 'Curral';
          else if (/cerca/i.test(categoria)) cat = 'Cercas';
          else if (/maqu/i.test(categoria)) cat = 'Maquinário';
          DB.investimentos.add({
            data, descricao: descr.trim(), categoria: cat, valor: valorAbs,
          });
        } else {
          // Mapear categorias do CSV para as do sistema
          let cat = categoria;
          const norm = categoria.toLowerCase();
          if (/raç/i.test(norm)) cat = 'Ração';
          else if (/vacin/i.test(norm)) cat = 'Vacinas';
          else if (/veterin/i.test(norm)) cat = 'Veterinário';
          else if (/sal[áa]rio/i.test(norm)) cat = 'Salários';
          else if (/energ/i.test(norm)) cat = 'Energia';
          else if (/manuten/i.test(norm)) cat = 'Manutenção';
          else if (/imposto/i.test(norm)) cat = 'Imposto';
          else if (/administr/i.test(norm)) cat = 'Despesas administrativas';
          else if (/advog/i.test(norm)) cat = 'Advogado';
          else if (/plantel/i.test(norm)) cat = 'Plantel';
          else if (/compra gado/i.test(norm)) {
            // Compra de gado: vai como observação — usuário deve cadastrar bovinos individualmente
            skipped++; continue;
          } else cat = 'Outros';
          DB.despesas.add({
            data, fornecedor: descr.trim(), categoria: cat, valor: valorAbs,
            rateioTipo: 'peso', rateioEscopo: 'todos',
          });
        }
        imported++;
      }
      U.toast(`Importadas ${imported} linhas (${skipped} ignoradas)`, 'success');
      App.render();
    };
    reader.readAsText(file);
  },

  resetData() {
    if (!U.confirm('Apagar TODOS os dados? Não há como desfazer.')) return;
    if (!U.confirm('Tem certeza? Última chance.')) return;
    DB.reset();
    U.toast('Dados apagados');
    location.hash = '#/dashboard';
    App.render();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
