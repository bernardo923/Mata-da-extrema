// ===== Views =====
const Views = {};

// ===========================================================================
// DASHBOARD
// ===========================================================================
Views.dashboard = function () {
  const ativos = DB.bovinos.ativos();
  const totalCabecas = ativos.length;
  const semLote = ativos.filter(b => !b.loteId || !DB.lotes.get(b.loteId)).length;
  const pesoTotal = U.sum(ativos, b => DB.pesagens.pesoAtual(b.id));
  const pesoMedio = totalCabecas ? pesoTotal / totalCabecas : 0;
  const arrobaMedia = U.kgToArroba(pesoMedio, DB.state.config.rendimentoCarcaca);
  const gmds = ativos.map(b => DB.pesagens.gmdGeral(b.id)).filter(g => g > 0);
  const gmdMedio = gmds.length ? gmds.reduce((s, g) => s + g, 0) / gmds.length : 0;
  const hoje = U.todayISO();
  const tempos = ativos.map(b => U.daysBetween(b.dataEntrada, hoje));
  const tempoMedio = tempos.length ? tempos.reduce((s, t) => s + t, 0) / tempos.length : 0;
  const pesoUA = DB.state.config.pesoUA || 450;
  const ua = pesoTotal / pesoUA;
  const areaPasto = DB.state.config.areaPastoHa || 0;
  const uaPorHa = areaPasto > 0 ? ua / areaPasto : null;

  const totalCustoOperacional = U.sum(DB.despesas.list(), 'valor');
  const totalInvestimentos = U.sum(DB.investimentos.list(), 'valor');
  const totalReceitas = U.sum(DB.vendas.list(), 'valorTotal');
  const totalCompraGado = U.sum(DB.bovinos.list(), 'custoEntrada');
  const margem = totalReceitas - totalCustoOperacional - totalCompraGado;

  // despesas por categoria (gráfico)
  const porCategoria = U.groupBy(DB.despesas.list(), 'categoria');
  const catLabels = Object.keys(porCategoria);
  const catValores = catLabels.map(k => U.sum(porCategoria[k], 'valor'));

  // despesas mensais
  const mensalMap = {};
  DB.despesas.list().forEach(d => {
    const ym = d.data.slice(0, 7);
    mensalMap[ym] = (mensalMap[ym] || 0) + d.valor;
  });
  const meses = Object.keys(mensalMap).sort();
  const valoresMes = meses.map(m => mensalMap[m]);

  const contasPend = DB.contas.pendentes();
  const contasVencidas = DB.contas.aPagar().filter(c => c.vencimento < hoje);
  const racaoAcabando = DB.racao.estoque().filter(e => e.saldo <= 0 ? e.entradas > 0 : (e.dias !== null && e.dias <= 7));
  const alertas = [
    contasPend.length ? `<a href="#/contas" onclick="sessionStorage.setItem('filtro_contas','pendentes')" class="underline">${contasPend.length} conta(s) aguardando aprovação (${U.money(U.sum(contasPend, 'valor'))})</a>` : '',
    contasVencidas.length ? `<a href="#/contas" onclick="sessionStorage.setItem('filtro_contas','apagar')" class="underline text-red-700">${contasVencidas.length} conta(s) vencida(s)</a>` : '',
    ...racaoAcabando.map(e => `<a href="#/racao" class="underline">${U.esc(e.tipo)}: ${e.saldo <= 0 ? 'sem estoque' : 'estoque para ~' + U.num(e.dias, 0) + ' dias'}</a>`),
  ].filter(Boolean);

  return `
    ${alertas.length ? `<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap gap-x-5 gap-y-1"><b>Atenção:</b>${alertas.join('')}</div>` : ''}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Cabeças ativas</div><div class="kpi-value">${totalCabecas}</div><div class="kpi-sub">${semLote > 0 ? `<a href="#/bovinos" onclick="sessionStorage.setItem('filtro_lote','__semlote__');sessionStorage.setItem('filtro_status','ativo');" class="text-amber-700 underline">${semLote} sem lote</a> · ${totalCabecas - semLote} em lotes` : 'No plantel'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Peso total</div><div class="kpi-value">${U.num(pesoTotal, 0)} kg</div><div class="kpi-sub">${U.num(U.kgToArroba(pesoTotal), 1)} @ carcaça</div></div>
      <div class="kpi-card"><div class="kpi-label">Peso médio</div><div class="kpi-value">${U.num(pesoMedio, 0)} kg</div><div class="kpi-sub">${U.num(arrobaMedia, 2)} @ por cabeça</div></div>
      <div class="kpi-card"><div class="kpi-label">GMD médio</div><div class="kpi-value">${U.num(gmdMedio, 3)} kg/dia</div><div class="kpi-sub">Ganho médio diário</div></div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Tempo médio na fazenda</div><div class="kpi-value">${U.num(tempoMedio, 0)} dias</div><div class="kpi-sub">${U.num(tempoMedio / 30, 1)} meses</div></div>
      <div class="kpi-card"><div class="kpi-label">Unidades animais (UA)</div><div class="kpi-value">${U.num(ua, 1)}</div><div class="kpi-sub">1 UA = ${pesoUA} kg peso vivo</div></div>
      <div class="kpi-card">
        <div class="kpi-label">UA / hectare</div>
        <div class="kpi-value">${uaPorHa !== null ? U.num(uaPorHa, 2) : '—'}</div>
        <div class="kpi-sub">${areaPasto > 0 ? `${U.num(areaPasto, 1)} ha de pasto` : 'Configure área em <a href="#/config" class="underline">Configurações</a>'}</div>
      </div>
      <div class="kpi-card"><div class="kpi-label">Lotes ativos</div><div class="kpi-value">${DB.lotes.list().length}</div><div class="kpi-sub">Agrupamento de manejo</div></div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Investido em gado</div><div class="kpi-value">${U.money(totalCompraGado)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Custo operacional</div><div class="kpi-value text-money-neg">${U.money(totalCustoOperacional)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Investimentos (CAPEX)</div><div class="kpi-value">${U.money(totalInvestimentos)}</div><div class="kpi-sub">Pasto / Sede / Curral / etc.</div></div>
      <div class="kpi-card"><div class="kpi-label">Receitas (vendas)</div><div class="kpi-value text-money-pos">${U.money(totalReceitas)}</div><div class="kpi-sub">Margem ${margem >= 0 ? 'positiva' : 'negativa'}: ${U.money(margem)}</div></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      <div class="card">
        <div class="card-title">Despesas por categoria</div>
        <canvas id="chart-categorias" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Despesas operacionais por mês</div>
        <canvas id="chart-mensal" height="200"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Bovinos com maior GMD (Top 5)</div>
      <table class="table">
        <thead><tr><th>Brinco</th><th>Nome</th><th>Categoria</th><th class="text-right">Peso atual</th><th class="text-right">@ atual</th><th class="text-right">GMD (kg/dia)</th></tr></thead>
        <tbody>
          ${ativos
            .map(b => ({ b, gmd: DB.pesagens.gmdGeral(b.id), peso: DB.pesagens.pesoAtual(b.id) }))
            .sort((a, b) => b.gmd - a.gmd)
            .slice(0, 5)
            .map(({ b, gmd, peso }) => `
              <tr class="clickable" onclick="location.hash='#/bovinos/${b.id}'">
                <td>${U.esc(b.brinco)}</td>
                <td>${U.esc(b.nome)}</td>
                <td><span class="badge">${U.esc(b.categoria)}</span></td>
                <td class="text-right">${U.num(peso, 0)} kg</td>
                <td class="text-right">${U.num(U.kgToArroba(peso), 2)}</td>
                <td class="text-right text-money-pos">${U.num(gmd, 3)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="text-center text-stone-500 py-6">Sem bovinos cadastrados</td></tr>'}
        </tbody>
      </table>
    </div>

    <script>
      (function () {
        const ctx1 = document.getElementById('chart-categorias');
        if (ctx1 && ${catLabels.length}) {
          new Chart(ctx1, {
            type: 'doughnut',
            data: { labels: ${JSON.stringify(catLabels)}, datasets: [{ data: ${JSON.stringify(catValores)}, backgroundColor: ['#84cc16','#0ea5e9','#f59e0b','#ef4444','#8b5cf6','#10b981','#ec4899','#6366f1','#f97316','#14b8a6','#a3a3a3','#78716c'] }] },
            options: { plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } } }
          });
        }
        const ctx2 = document.getElementById('chart-mensal');
        if (ctx2 && ${meses.length}) {
          new Chart(ctx2, {
            type: 'bar',
            data: { labels: ${JSON.stringify(meses)}, datasets: [{ label: 'Despesas (R$)', data: ${JSON.stringify(valoresMes)}, backgroundColor: '#1c1917' }] },
            options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
          });
        }
      })();
    </script>
  `;
};

// ===========================================================================
// BOVINOS
// ===========================================================================
Views.bovinos = function () {
  const lista = DB.bovinos.list();
  const filtroLote = sessionStorage.getItem('filtro_lote') || '';
  const filtroStatus = sessionStorage.getItem('filtro_status') || 'ativo';

  const filtrados = lista.filter(b => {
    if (filtroLote === '__semlote__') {
      if (b.loteId && DB.lotes.get(b.loteId)) return false;
    } else if (filtroLote && b.loteId !== filtroLote) return false;
    if (filtroStatus && b.status !== filtroStatus) return false;
    return true;
  });

  return `
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div class="flex items-center gap-2">
        <select class="select" style="width: auto" onchange="sessionStorage.setItem('filtro_lote', this.value); App.render();">
          <option value="">Todos os lotes</option>
          <option value="__semlote__" ${filtroLote === '__semlote__' ? 'selected' : ''}>Sem lote</option>
          ${DB.lotes.list().map(l => `<option value="${l.id}" ${filtroLote === l.id ? 'selected' : ''}>${U.esc(l.nome)}</option>`).join('')}
        </select>
        <select class="select" style="width: auto" onchange="sessionStorage.setItem('filtro_status', this.value); App.render();">
          <option value="ativo" ${filtroStatus === 'ativo' ? 'selected' : ''}>Ativos</option>
          <option value="vendido" ${filtroStatus === 'vendido' ? 'selected' : ''}>Vendidos</option>
          <option value="" ${filtroStatus === '' ? 'selected' : ''}>Todos</option>
        </select>
        <span class="text-xs text-stone-500">${filtrados.length} bovino(s)</span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-danger" id="bov-bulk-delete" style="display:none" onclick="Views.bovinosDeleteSelecionados()">Excluir selecionados</button>
        <button class="btn btn-secondary" onclick="Views.bovinosImport()">Importar CSV</button>
        <button class="btn btn-primary" onclick="Views.bovinoForm()">+ Novo bovino</button>
      </div>
    </div>

    <div class="card p-0 overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th style="width:2rem"><input type="checkbox" title="Selecionar todos" onchange="Views.bovinoToggleTodos(this)" /></th>
            <th>Brinco</th><th>Nome</th><th>Categoria</th><th>Lote</th>
            <th class="text-right">Peso entrada</th><th class="text-right">Peso atual</th>
            <th class="text-right">GMD</th><th class="text-right">Custo total</th>
            <th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${filtrados.map(b => {
            const peso = DB.pesagens.pesoAtual(b.id);
            const gmd = DB.pesagens.gmdGeral(b.id);
            const custo = DB.rateio.custoTotalBovino(b.id);
            const lote = b.loteId ? (DB.lotes.get(b.loteId)?.nome || '—') : '—';
            return `
              <tr class="clickable" onclick="location.hash='#/bovinos/${b.id}'">
                <td onclick="event.stopPropagation()"><input type="checkbox" class="bov-check" data-id="${b.id}" onchange="Views.bovinoToggleSelecao(this)" /></td>
                <td class="font-mono font-medium">${U.esc(b.brinco)}</td>
                <td>${U.esc(b.nome)}</td>
                <td><span class="badge">${U.esc(b.categoria)}</span></td>
                <td class="text-stone-500">${U.esc(lote)}</td>
                <td class="text-right">${U.num(b.pesoEntrada, 0)} kg</td>
                <td class="text-right">${U.num(peso, 0)} kg</td>
                <td class="text-right ${gmd > 0 ? 'text-money-pos' : ''}">${U.num(gmd, 3)}</td>
                <td class="text-right">${U.money(custo)}</td>
                <td><span class="badge badge-${b.status === 'ativo' ? 'green' : 'stone'}">${U.esc(b.status)}</span></td>
                <td onclick="event.stopPropagation()">
                  <button class="btn btn-icon" onclick="Views.bovinoForm('${b.id}')">Editar</button>
                </td>
              </tr>
            `;
          }).join('') || `<tr><td colspan="11" class="text-center text-stone-500 py-8">Nenhum bovino cadastrado</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

// ----- Seleção múltipla de bovinos -----
Views._bovinosSelecionados = function () {
  return Array.from(document.querySelectorAll('.bov-check:checked')).map(c => c.dataset.id);
};

Views._bovinosAtualizarBarraSelecao = function () {
  const n = Views._bovinosSelecionados().length;
  const btn = document.getElementById('bov-bulk-delete');
  if (!btn) return;
  btn.style.display = n ? '' : 'none';
  btn.textContent = `Excluir selecionados (${n})`;
};

Views.bovinoToggleSelecao = function () {
  Views._bovinosAtualizarBarraSelecao();
};

Views.bovinoToggleTodos = function (el) {
  document.querySelectorAll('.bov-check').forEach(c => { c.checked = el.checked; });
  Views._bovinosAtualizarBarraSelecao();
};

Views.bovinosDeleteSelecionados = function () {
  const ids = Views._bovinosSelecionados();
  if (!ids.length) return;
  if (!U.confirm(`Excluir ${ids.length} bovino(s) e todas as suas pesagens? Essa ação não pode ser desfeita.`)) return;
  ids.forEach(id => DB.bovinos.remove(id));
  U.toast(`${ids.length} bovino(s) excluído(s)`, 'success');
  App.render();
};

Views.bovinoForm = function (id) {
  const b = id ? DB.bovinos.get(id) : null;
  const isEdit = !!b;
  const lotes = DB.lotes.list();

  U.modal(isEdit ? `Editar bovino ${U.esc(b.brinco)}` : 'Novo bovino', `
    <form id="form-bovino" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Brinco *</label><input class="input" name="brinco" value="${U.esc(b?.brinco || '')}" required /></div>
      <div><label class="field-label">Nome / apelido</label><input class="input" name="nome" value="${U.esc(b?.nome || '')}" /></div>
      <div><label class="field-label">Categoria</label>
        <select class="select" name="categoria">${CATEGORIAS_BOVINO.map(c => `<option ${b?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div><label class="field-label">Sexo</label>
        <select class="select" name="sexo"><option value="M" ${b?.sexo !== 'F' ? 'selected' : ''}>Macho</option><option value="F" ${b?.sexo === 'F' ? 'selected' : ''}>Fêmea</option></select>
      </div>
      <div><label class="field-label">Lote</label>
        <select class="select" name="loteId"><option value="">— Sem lote —</option>${lotes.map(l => `<option value="${l.id}" ${b?.loteId === l.id ? 'selected' : ''}>${U.esc(l.nome)}</option>`).join('')}</select>
      </div>
      <div><label class="field-label">Data de entrada *</label><input class="input" name="dataEntrada" type="date" value="${b?.dataEntrada || U.todayISO()}" required /></div>
      <div><label class="field-label">Peso de entrada (kg)</label><input class="input" name="pesoEntrada" type="number" step="0.1" value="${b?.pesoEntrada || 0}" /></div>
      <div><label class="field-label">Preço @ entrada (R$)</label><input class="input" name="precoArrobaEntrada" type="number" step="0.01" value="${b?.precoArrobaEntrada || 0}" /></div>
      <div class="col-span-2"><label class="field-label">Custo de entrada (R$) — calculado se vazio</label><input class="input" name="custoEntrada" type="number" step="0.01" value="${b?.custoEntrada || ''}" placeholder="auto: peso/30 × preço @" /></div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2">${U.esc(b?.observacoes || '')}</textarea></div>
      ${isEdit ? `<div class="col-span-2"><label class="field-label">Status</label>
        <select class="select" name="status"><option value="ativo" ${b.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="vendido" ${b.status === 'vendido' ? 'selected' : ''}>Vendido</option><option value="morto" ${b.status === 'morto' ? 'selected' : ''}>Morto</option></select>
      </div>` : ''}
      <div class="col-span-2 flex justify-between items-center pt-2 border-t border-stone-200 mt-2">
        <div>${isEdit ? `<button type="button" class="btn btn-danger btn-sm" onclick="Views.bovinoDelete('${b.id}')">Excluir</button>` : ''}</div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar' : 'Criar'}</button>
        </div>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-bovino').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.pesoEntrada = parseFloat(data.pesoEntrada) || 0;
      data.precoArrobaEntrada = parseFloat(data.precoArrobaEntrada) || 0;
      data.custoEntrada = data.custoEntrada ? parseFloat(data.custoEntrada) : (data.pesoEntrada / 30) * data.precoArrobaEntrada;
      data.loteId = data.loteId || null;
      if (isEdit) {
        DB.bovinos.update(id, data);
        U.toast('Bovino atualizado', 'success');
      } else {
        DB.bovinos.add(data);
        U.toast('Bovino criado', 'success');
      }
      U.closeModal();
      App.render();
    });
  });
};

Views.bovinosImport = function () {
  const exemplo = `brinco,nome,categoria,sexo,lote,dataEntrada,pesoEntrada,precoArrobaEntrada,custoEntrada,pesoAtual,observacoes
001,Touro 01,Boi,M,Lote A,2024-08-16,380,280,,415,
002,Touro 02,Boi,M,Lote A,2024-08-16,395,280,,,Reprodutor
101,Bezerro 01,Bezerro,M,Lote B,2024-09-01,220,290,,260,`;
  U.modal('Importar bovinos via CSV', `
    <div class="space-y-3">
      <div class="text-sm text-stone-600">
        <p class="mb-2">Colunas suportadas (cabeçalho obrigatório, ordem livre, separador <code>,</code> ou <code>;</code>):</p>
        <ul class="text-xs list-disc pl-5 space-y-0.5">
          <li><code>brinco</code> *, <code>nome</code>, <code>categoria</code> (Bezerro/Boi/Vaca/...), <code>sexo</code> (M/F)</li>
          <li><code>lote</code> — nome do lote (cria automaticamente se não existir)</li>
          <li><code>dataEntrada</code> — formato AAAA-MM-DD ou DD/MM/AAAA</li>
          <li><code>pesoEntrada</code> (kg), <code>precoArrobaEntrada</code> (R$)</li>
          <li><code>custoEntrada</code> (R$ — opcional, calculado se vazio)</li>
          <li><code>pesoAtual</code> (kg — opcional, registra uma pesagem na data de hoje)</li>
          <li><code>observacoes</code></li>
        </ul>
        <p class="text-xs text-stone-500 mt-2">Unidades no cabeçalho são ignoradas — <code>pesoEntrada (kg)</code> funciona igual a <code>pesoEntrada</code>. Se o brinco já existir, o bovino é <strong>atualizado</strong> em vez de duplicado.</p>
      </div>
      <details class="text-xs">
        <summary class="cursor-pointer text-stone-700 hover:text-stone-900">Ver exemplo</summary>
        <pre class="bg-stone-100 p-2 rounded text-xs mt-1 overflow-x-auto">${U.esc(exemplo)}</pre>
        <button class="btn btn-icon mt-1" onclick="U.download('exemplo_bovinos.csv', \`${exemplo}\`, 'text/csv')">Baixar exemplo</button>
      </details>
      <div>
        <label class="field-label">Arquivo CSV</label>
        <input id="bov-csv" type="file" accept=".csv,.txt" class="input" />
      </div>
      <div id="bov-preview" class="text-xs"></div>
      <div class="flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="bov-import-btn" disabled>Importar</button>
      </div>
    </div>
  `, body => {
    let parsed = null;
    body.querySelector('#bov-csv').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        try {
          parsed = U.parseCSV(ev.target.result);
          body.querySelector('#bov-preview').innerHTML = `<div class="bg-green-50 border border-green-200 rounded p-2"><strong>${parsed.rows.length}</strong> linha(s) detectada(s). Cabeçalhos: ${parsed.headers.map(h => `<code class="text-xs">${U.esc(h)}</code>`).join(', ')}</div>`;
          body.querySelector('#bov-import-btn').disabled = false;
        } catch (err) {
          body.querySelector('#bov-preview').innerHTML = `<div class="bg-red-50 border border-red-200 rounded p-2 text-red-700">Erro: ${U.esc(err.message)}</div>`;
        }
      };
      r.readAsText(f);
    });
    body.querySelector('#bov-import-btn').addEventListener('click', () => {
      if (!parsed) return;
      let ok = 0, atualizados = 0, skip = 0;
      const lotesCache = {};
      DB.lotes.list().forEach(l => { lotesCache[l.nome.toLowerCase()] = l.id; });
      const brincoIndex = {};
      DB.bovinos.list().forEach(b => { brincoIndex[b.brinco] = b.id; });
      parsed.rows.forEach(row => {
        const brinco = (row.brinco || '').trim();
        if (!brinco) { skip++; return; }
        const data = U.parseDateBR(row.dataentrada || '') || U.todayISO();
        const peso = parseFloat(String(row.pesoentrada || '').replace(',', '.')) || 0;
        const preco = parseFloat(String(row.precoarrobaentrada || '').replace(',', '.')) || 0;
        let custo = parseFloat(String(row.custoentrada || '').replace(',', '.'));
        if (!custo || isNaN(custo)) custo = (peso / 30) * preco;
        let loteId = null;
        const loteNome = (row.lote || '').trim();
        if (loteNome) {
          const k = loteNome.toLowerCase();
          if (!lotesCache[k]) {
            const novo = DB.lotes.add({ nome: loteNome });
            lotesCache[k] = novo.id;
          }
          loteId = lotesCache[k];
        }
        const campos = {
          brinco, nome: row.nome || '',
          categoria: row.categoria || 'Boi',
          sexo: (row.sexo || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
          loteId,
          dataEntrada: data,
          pesoEntrada: peso, precoArrobaEntrada: preco, custoEntrada: custo,
          observacoes: row.observacoes || '',
        };
        let bovinoId = brincoIndex[brinco];
        if (bovinoId) {
          DB.bovinos.update(bovinoId, campos);
          atualizados++;
        } else {
          const novo = DB.bovinos.add(campos);
          bovinoId = novo.id;
          brincoIndex[brinco] = bovinoId;
          ok++;
        }
        const pesoAtual = parseFloat(String(row.pesoatual || '').replace(',', '.'));
        if (pesoAtual && !isNaN(pesoAtual)) {
          const jaTem = DB.pesagens.porBovino(bovinoId)
            .some(p => p.data === U.todayISO() && p.pesoKg === pesoAtual);
          if (!jaTem) {
            DB.pesagens.add({ bovinoId, data: U.todayISO(), pesoKg: pesoAtual, observacoes: 'Importado via CSV' });
          }
        }
      });
      U.closeModal();
      U.toast(`${ok} criado(s), ${atualizados} atualizado(s), ${skip} ignorado(s)`, 'success');
      App.render();
    });
  });
};

Views.bovinoDelete = function (id) {
  if (!U.confirm('Excluir este bovino e todas as suas pesagens?')) return;
  DB.bovinos.remove(id);
  U.closeModal();
  U.toast('Bovino excluído');
  location.hash = '#/bovinos';
};

Views.bovinoDetail = function (id) {
  const b = DB.bovinos.get(id);
  if (!b) return `<div class="card">Bovino não encontrado.</div>`;

  const pesagens = DB.pesagens.porBovino(id);
  const pontos = [
    { data: b.dataEntrada, peso: b.pesoEntrada, tipo: 'entrada' },
    ...pesagens.map(p => ({ data: p.data, peso: p.pesoKg, tipo: 'pesagem', id: p.id })),
  ];

  // GMD entre pesagens
  const gmds = [];
  for (let i = 1; i < pontos.length; i++) {
    const prev = pontos[i - 1];
    const curr = pontos[i];
    const dias = U.daysBetween(prev.data, curr.data);
    gmds.push({
      de: prev.data,
      ate: curr.data,
      dias,
      ganho: curr.peso - prev.peso,
      gmd: dias > 0 ? (curr.peso - prev.peso) / dias : 0,
    });
  }

  const pesoAtual = DB.pesagens.pesoAtual(id);
  const arrobaAtual = U.kgToArroba(pesoAtual);
  const ganhoTotal = pesoAtual - b.pesoEntrada;
  const gmdGeral = DB.pesagens.gmdGeral(id);
  const custoOp = DB.rateio.custoOperacionalBovino(id);
  const custoTotal = DB.rateio.custoTotalBovino(id);
  const lote = b.loteId ? DB.lotes.get(b.loteId) : null;

  return `
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="text-xs text-stone-500"><a href="#/bovinos" class="hover:underline">← Bovinos</a></div>
        <h2 class="text-xl font-semibold">Brinco ${U.esc(b.brinco)} ${b.nome ? '— ' + U.esc(b.nome) : ''}</h2>
        <div class="flex gap-2 mt-1">
          <span class="badge">${U.esc(b.categoria)}</span>
          <span class="badge">${b.sexo === 'F' ? 'Fêmea' : 'Macho'}</span>
          <span class="badge badge-${b.status === 'ativo' ? 'green' : 'stone'}">${U.esc(b.status)}</span>
          ${lote ? `<span class="badge badge-blue">${U.esc(lote.nome)}</span>` : ''}
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="Views.pesagemForm(null, '${b.id}')">+ Pesagem</button>
        <button class="btn btn-secondary" onclick="Views.bovinoForm('${b.id}')">Editar</button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div class="kpi-card"><div class="kpi-label">Peso atual</div><div class="kpi-value">${U.num(pesoAtual, 0)} kg</div><div class="kpi-sub">${U.num(arrobaAtual, 2)} @ carcaça</div></div>
      <div class="kpi-card"><div class="kpi-label">Ganho total</div><div class="kpi-value text-money-pos">+${U.num(ganhoTotal, 0)} kg</div><div class="kpi-sub">desde ${U.formatDate(b.dataEntrada)}</div></div>
      <div class="kpi-card"><div class="kpi-label">GMD geral</div><div class="kpi-value">${U.num(gmdGeral, 3)}</div><div class="kpi-sub">kg/dia</div></div>
      <div class="kpi-card"><div class="kpi-label">Custo total</div><div class="kpi-value">${U.money(custoTotal)}</div><div class="kpi-sub">+ ${U.money(custoOp)} operacional</div></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <div class="card lg:col-span-2">
        <div class="card-title">Evolução de peso</div>
        <canvas id="chart-peso" height="120"></canvas>
      </div>
      <div class="card">
        <div class="card-title">Dados de entrada</div>
        <dl class="text-sm space-y-1.5">
          <div class="flex justify-between"><dt class="text-stone-500">Data entrada</dt><dd>${U.formatDate(b.dataEntrada)}</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Peso entrada</dt><dd>${U.num(b.pesoEntrada, 0)} kg (${U.num(U.kgToArroba(b.pesoEntrada), 2)} @)</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Preço @ entrada</dt><dd>${U.money(b.precoArrobaEntrada)}</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Custo entrada</dt><dd>${U.money(b.custoEntrada)}</dd></div>
          ${b.dataSaida ? `
          <div class="border-t border-stone-200 pt-2 mt-2"></div>
          <div class="flex justify-between"><dt class="text-stone-500">Data saída</dt><dd>${U.formatDate(b.dataSaida)}</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Peso saída</dt><dd>${U.num(b.pesoSaida || 0, 0)} kg</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Preço @ saída</dt><dd>${U.money(b.precoArrobaSaida || 0)}</dd></div>
          <div class="flex justify-between"><dt class="text-stone-500">Receita venda</dt><dd class="text-money-pos">${U.money(b.receitaSaida || 0)}</dd></div>
          ` : ''}
        </dl>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-title">Histórico de pesagens (${pesagens.length})</div>
      <table class="table">
        <thead><tr><th>Data</th><th class="text-right">Peso (kg)</th><th class="text-right">@ carcaça</th><th class="text-right">Ganho desde anterior</th><th class="text-right">Dias</th><th class="text-right">GMD período</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          <tr>
            <td>${U.formatDate(b.dataEntrada)}</td>
            <td class="text-right">${U.num(b.pesoEntrada, 0)}</td>
            <td class="text-right">${U.num(U.kgToArroba(b.pesoEntrada), 2)}</td>
            <td class="text-right text-stone-400">— entrada —</td>
            <td class="text-right">—</td>
            <td class="text-right">—</td>
            <td colspan="2" class="text-stone-500 italic">Pesagem inicial (entrada)</td>
          </tr>
          ${pesagens.map((p, i) => {
            const g = gmds[i];
            return `
              <tr>
                <td>${U.formatDate(p.data)}</td>
                <td class="text-right">${U.num(p.pesoKg, 0)}</td>
                <td class="text-right">${U.num(U.kgToArroba(p.pesoKg), 2)}</td>
                <td class="text-right ${g.ganho >= 0 ? 'text-money-pos' : 'text-money-neg'}">${g.ganho >= 0 ? '+' : ''}${U.num(g.ganho, 1)}</td>
                <td class="text-right">${g.dias}</td>
                <td class="text-right">${U.num(g.gmd, 3)}</td>
                <td>${U.esc(p.observacoes || '')}</td>
                <td><button class="btn btn-icon" onclick="Views.pesagemDelete('${p.id}', '${b.id}')">×</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <script>
      (function () {
        const ctx = document.getElementById('chart-peso');
        if (ctx) {
          const labels = ${JSON.stringify(pontos.map(p => U.formatDate(p.data)))};
          const pesos = ${JSON.stringify(pontos.map(p => p.peso))};
          new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: 'Peso (kg)',
                data: pesos,
                borderColor: '#84cc16',
                backgroundColor: 'rgba(132,204,22,0.1)',
                tension: 0.2,
                fill: true,
                pointRadius: 5,
                pointBackgroundColor: '#1c1917',
              }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false } } }
          });
        }
      })();
    </script>
  `;
};

// ===========================================================================
// PESAGENS
// ===========================================================================
Views.pesagens = function () {
  const lista = [...DB.pesagens.list()].sort((a, b) => b.data.localeCompare(a.data));
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-stone-500">${lista.length} pesagem(ns) registrada(s)</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="Views.pesagensImport()">Importar CSV</button>
        <button class="btn btn-secondary" onclick="Views.pesagemBatch()">+ Pesagem em lote</button>
        <button class="btn btn-primary" onclick="Views.pesagemForm()">+ Pesagem individual</button>
      </div>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Data</th><th>Bovino</th><th>Lote</th><th class="text-right">Peso (kg)</th><th class="text-right">@ carcaça</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          ${lista.map(p => {
            const b = DB.bovinos.get(p.bovinoId);
            const lote = b?.loteId ? DB.lotes.get(b.loteId)?.nome : '—';
            return `
              <tr>
                <td>${U.formatDate(p.data)}</td>
                <td><a href="#/bovinos/${p.bovinoId}" class="hover:underline">${U.esc(b?.brinco || '?')} — ${U.esc(b?.nome || '')}</a></td>
                <td class="text-stone-500">${U.esc(lote || '—')}</td>
                <td class="text-right">${U.num(p.pesoKg, 0)}</td>
                <td class="text-right">${U.num(U.kgToArroba(p.pesoKg), 2)}</td>
                <td>${p.origem === 'campo' ? '<span class="badge badge-blue">vaqueiro</span> ' : ''}${U.esc(p.observacoes || '')}</td>
                <td><button class="btn btn-icon" onclick="Views.pesagemDelete('${p.id}')">×</button></td>
              </tr>
            `;
          }).join('') || `<tr><td colspan="7" class="text-center text-stone-500 py-8">Nenhuma pesagem registrada</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

Views.pesagemForm = function (pesagemId, bovinoIdPre) {
  const p = pesagemId ? DB.state.pesagens.find(x => x.id === pesagemId) : null;
  const ativos = DB.bovinos.ativos();
  U.modal(p ? 'Editar pesagem' : 'Nova pesagem', `
    <form id="form-pesagem" class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label class="field-label">Bovino</label>
        <select class="select" name="bovinoId" required>
          <option value="">Selecione...</option>
          ${ativos.map(b => `<option value="${b.id}" ${(p?.bovinoId === b.id || bovinoIdPre === b.id) ? 'selected' : ''}>${U.esc(b.brinco)} — ${U.esc(b.nome)}</option>`).join('')}
        </select>
      </div>
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${p?.data || U.todayISO()}" required /></div>
      <div><label class="field-label">Peso (kg) *</label><input class="input" name="pesoKg" type="number" step="0.1" value="${p?.pesoKg || ''}" required /></div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2">${U.esc(p?.observacoes || '')}</textarea></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200 mt-2">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-pesagem').addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.pesoKg = parseFloat(fd.pesoKg);
      if (p) DB.pesagens.update(pesagemId, fd);
      else DB.pesagens.add(fd);
      U.closeModal();
      U.toast('Pesagem salva', 'success');
      App.render();
    });
  });
};

Views.pesagemBatch = function () {
  const lotes = DB.lotes.list();
  U.modal('Pesagem em lote', `
    <div class="mb-3">
      <label class="field-label">Filtrar por lote</label>
      <select id="batch-lote" class="select">
        <option value="">Todos os bovinos ativos</option>
        ${lotes.map(l => `<option value="${l.id}">${U.esc(l.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="mb-3">
      <label class="field-label">Data da pesagem</label>
      <input id="batch-data" type="date" class="input" value="${U.todayISO()}" />
    </div>
    <div id="batch-list"></div>
    <div class="flex justify-end gap-2 pt-3 border-t border-stone-200 mt-3">
      <button class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="batch-save">Salvar pesagens</button>
    </div>
  `, body => {
    const renderList = () => {
      const loteId = body.querySelector('#batch-lote').value;
      const bovinos = loteId ? DB.bovinos.porLote(loteId) : DB.bovinos.ativos();
      body.querySelector('#batch-list').innerHTML = `
        <table class="table">
          <thead><tr><th>Brinco</th><th>Nome</th><th class="text-right">Peso anterior</th><th class="text-right">Novo peso (kg)</th></tr></thead>
          <tbody>
            ${bovinos.map(b => `
              <tr>
                <td class="font-mono">${U.esc(b.brinco)}</td>
                <td>${U.esc(b.nome)}</td>
                <td class="text-right text-stone-500">${U.num(DB.pesagens.pesoAtual(b.id), 0)} kg</td>
                <td class="text-right"><input class="input batch-input" data-bovino="${b.id}" type="number" step="0.1" placeholder="—" style="text-align:right" /></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };
    renderList();
    body.querySelector('#batch-lote').addEventListener('change', renderList);
    body.querySelector('#batch-save').addEventListener('click', () => {
      const data = body.querySelector('#batch-data').value;
      const inputs = body.querySelectorAll('.batch-input');
      let count = 0;
      inputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (v > 0) {
          DB.pesagens.add({ bovinoId: inp.dataset.bovino, data, pesoKg: v });
          count++;
        }
      });
      U.closeModal();
      U.toast(`${count} pesagem(ns) salva(s)`, 'success');
      App.render();
    });
  });
};

Views.pesagensImport = function () {
  const exemplo = `brinco,data,pesoKg,observacoes
001,2024-11-01,415,
001,2025-02-01,460,Pesagem trimestral
002,2024-11-01,432,`;
  U.modal('Importar pesagens via CSV', `
    <div class="space-y-3">
      <div class="text-sm text-stone-600">
        <p class="mb-2">Colunas: <code>brinco</code> *, <code>data</code> *, <code>pesoKg</code> *, <code>observacoes</code></p>
        <p class="text-xs text-stone-500">O bovino é localizado pelo brinco. Linhas sem brinco existente são ignoradas.</p>
      </div>
      <details class="text-xs">
        <summary class="cursor-pointer">Ver exemplo</summary>
        <pre class="bg-stone-100 p-2 rounded text-xs mt-1">${U.esc(exemplo)}</pre>
        <button class="btn btn-icon mt-1" onclick="U.download('exemplo_pesagens.csv', \`${exemplo}\`, 'text/csv')">Baixar exemplo</button>
      </details>
      <div><label class="field-label">Arquivo CSV</label><input id="pes-csv" type="file" accept=".csv,.txt" class="input" /></div>
      <div id="pes-preview" class="text-xs"></div>
      <div class="flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="pes-import-btn" disabled>Importar</button>
      </div>
    </div>
  `, body => {
    let parsed = null;
    body.querySelector('#pes-csv').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        parsed = U.parseCSV(ev.target.result);
        body.querySelector('#pes-preview').innerHTML = `<div class="bg-green-50 border border-green-200 rounded p-2"><strong>${parsed.rows.length}</strong> linha(s) detectada(s)</div>`;
        body.querySelector('#pes-import-btn').disabled = false;
      };
      r.readAsText(f);
    });
    body.querySelector('#pes-import-btn').addEventListener('click', () => {
      if (!parsed) return;
      const brincoIndex = {};
      DB.bovinos.list().forEach(b => { brincoIndex[b.brinco] = b.id; });
      let ok = 0, skip = 0;
      parsed.rows.forEach(row => {
        const brinco = (row.brinco || '').trim();
        const bovinoId = brincoIndex[brinco];
        if (!bovinoId) { skip++; return; }
        const data = U.parseDateBR(row.data || '');
        const peso = parseFloat(String(row.pesokg || row.peso || '').replace(',', '.'));
        if (!data || !peso) { skip++; return; }
        DB.pesagens.add({ bovinoId, data, pesoKg: peso, observacoes: row.observacoes || '' });
        ok++;
      });
      U.closeModal();
      U.toast(`${ok} pesagem(ns) importada(s) (${skip} ignorada(s))`, 'success');
      App.render();
    });
  });
};

Views.pesagemDelete = function (id, bovinoId) {
  if (!U.confirm('Excluir esta pesagem?')) return;
  DB.pesagens.remove(id);
  U.toast('Pesagem excluída');
  if (bovinoId) location.hash = '#/bovinos/' + bovinoId;
  else App.render();
};

// ===========================================================================
// LOTES
// ===========================================================================
Views.lotes = function () {
  const lotes = DB.lotes.list();
  const hoje = U.todayISO();
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-stone-500">${lotes.length} lote(s)</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="Views.lotesImport()">Importar CSV</button>
        <button class="btn btn-primary" onclick="Views.loteForm()">+ Novo lote</button>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${lotes.map(l => {
        const bovinos = DB.bovinos.porLote(l.id);
        const pesoTotal = U.sum(bovinos, b => DB.pesagens.pesoAtual(b.id));
        const pesoMedio = bovinos.length ? pesoTotal / bovinos.length : 0;
        const gmdMedio = bovinos.length ? U.sum(bovinos, b => DB.pesagens.gmdGeral(b.id)) / bovinos.length : 0;
        const tempos = bovinos.map(b => U.daysBetween(b.dataEntrada, hoje));
        const tempoMedio = tempos.length ? tempos.reduce((s, t) => s + t, 0) / tempos.length : 0;
        const ua = pesoTotal / (DB.state.config.pesoUA || 450);
        const custoTotal = U.sum(bovinos, b => DB.rateio.custoTotalBovino(b.id));
        const custoMedio = bovinos.length ? custoTotal / bovinos.length : 0;
        return `
          <div class="card">
            <div class="flex items-start justify-between mb-2">
              <div>
                <div class="font-semibold">${U.esc(l.nome)}</div>
                <div class="text-xs text-stone-500">${U.esc(l.descricao || '')}</div>
              </div>
              <div class="flex gap-1">
                <button class="btn btn-icon" onclick="Views.loteForm('${l.id}')">Editar</button>
              </div>
            </div>
            <dl class="text-sm space-y-1">
              <div class="flex justify-between"><dt class="text-stone-500">Cabeças</dt><dd>${bovinos.length}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Peso total</dt><dd>${U.num(pesoTotal, 0)} kg</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Peso médio</dt><dd>${U.num(pesoMedio, 0)} kg / ${U.num(U.kgToArroba(pesoMedio), 2)} @</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">@ total</dt><dd>${U.num(U.kgToArroba(pesoTotal), 1)} @</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">UA do lote</dt><dd>${U.num(ua, 2)}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">GMD médio</dt><dd>${U.num(gmdMedio, 3)} kg/dia</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Tempo médio na fazenda</dt><dd>${U.num(tempoMedio, 0)} dias</dd></div>
              <div class="flex justify-between border-t border-stone-100 pt-1 mt-1"><dt class="text-stone-500">Custo total alocado</dt><dd>${U.money(custoTotal)}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Custo médio/cabeça</dt><dd>${U.money(custoMedio)}</dd></div>
            </dl>
          </div>
        `;
      }).join('') || `<div class="card text-stone-500 text-sm">Nenhum lote cadastrado.</div>`}
    </div>
  `;
};

Views.lotesImport = function () {
  const exemplo = `lote,descricao,brinco
Lote A,Engorda terminação,001
Lote A,Engorda terminação,002
Lote A,Engorda terminação,003
Lote B,Recria,101
Lote B,Recria,102`;
  U.modal('Importar lotes e atribuir bovinos via CSV', `
    <div class="space-y-3">
      <div class="text-sm text-stone-600">
        <p class="mb-2">Cada linha = um bovino atribuído a um lote. Colunas:</p>
        <ul class="text-xs list-disc pl-5 space-y-0.5">
          <li><code>lote</code> * — nome do lote (cria se não existir)</li>
          <li><code>brinco</code> * — bovino a ser atribuído (deve já estar cadastrado)</li>
          <li><code>descricao</code> — descrição do lote (opcional, usada na criação)</li>
        </ul>
        <p class="text-xs text-stone-500 mt-2">Para cadastrar bovinos novos junto com o lote, use a importação de bovinos (a coluna <code>lote</code> faz a vinculação automaticamente).</p>
      </div>
      <details class="text-xs">
        <summary class="cursor-pointer">Ver exemplo</summary>
        <pre class="bg-stone-100 p-2 rounded text-xs mt-1">${U.esc(exemplo)}</pre>
        <button class="btn btn-icon mt-1" onclick="U.download('exemplo_lotes.csv', \`${exemplo}\`, 'text/csv')">Baixar exemplo</button>
      </details>
      <div><label class="field-label">Arquivo CSV</label><input id="lot-csv" type="file" accept=".csv,.txt" class="input" /></div>
      <div id="lot-preview" class="text-xs"></div>
      <div class="flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="lot-import-btn" disabled>Importar</button>
      </div>
    </div>
  `, body => {
    let parsed = null;
    body.querySelector('#lot-csv').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        parsed = U.parseCSV(ev.target.result);
        body.querySelector('#lot-preview').innerHTML = `<div class="bg-green-50 border border-green-200 rounded p-2"><strong>${parsed.rows.length}</strong> atribuição(ões) detectada(s)</div>`;
        body.querySelector('#lot-import-btn').disabled = false;
      };
      r.readAsText(f);
    });
    body.querySelector('#lot-import-btn').addEventListener('click', () => {
      if (!parsed) return;
      const brincoIndex = {};
      DB.bovinos.list().forEach(b => { brincoIndex[b.brinco] = b.id; });
      const lotesCache = {};
      DB.lotes.list().forEach(l => { lotesCache[l.nome.toLowerCase()] = l.id; });
      let lotesNovos = 0, atribs = 0, skip = 0;
      parsed.rows.forEach(row => {
        const loteNome = (row.lote || '').trim();
        const brinco = (row.brinco || '').trim();
        if (!loteNome) { skip++; return; }
        const k = loteNome.toLowerCase();
        if (!lotesCache[k]) {
          const novo = DB.lotes.add({ nome: loteNome, descricao: row.descricao || '' });
          lotesCache[k] = novo.id;
          lotesNovos++;
        }
        if (brinco && brincoIndex[brinco]) {
          DB.bovinos.update(brincoIndex[brinco], { loteId: lotesCache[k] });
          atribs++;
        } else if (brinco) skip++;
      });
      U.closeModal();
      U.toast(`${lotesNovos} lote(s) novo(s), ${atribs} bovino(s) atribuído(s) (${skip} ignorado(s))`, 'success');
      App.render();
    });
  });
};

Views.loteForm = function (id) {
  const l = id ? DB.lotes.get(id) : null;
  // bovinos elegíveis: ativos sem lote OU já neste lote
  const elegiveis = DB.bovinos.list().filter(b =>
    b.status === 'ativo' && (!b.loteId || b.loteId === l?.id)
  );

  U.modal(l ? 'Editar lote' : 'Novo lote', `
    <form id="form-lote" class="space-y-3">
      <div><label class="field-label">Nome *</label><input class="input" name="nome" value="${U.esc(l?.nome || '')}" required /></div>
      <div><label class="field-label">Descrição</label><textarea class="textarea" name="descricao" rows="2">${U.esc(l?.descricao || '')}</textarea></div>

      <div class="border-t border-stone-200 pt-3">
        <label class="field-label">Bovinos no lote</label>
        <div class="text-xs text-stone-500 mb-2">Marque os bovinos que pertencem a este lote. Os demais ficam disponíveis para outros lotes.</div>
        <div class="border border-stone-200 rounded max-h-72 overflow-y-auto p-2">
          ${elegiveis.length === 0 ? '<div class="text-stone-500 text-sm p-2">Nenhum bovino disponível. Cadastre bovinos primeiro.</div>' : elegiveis.map(b => {
            const peso = DB.pesagens.pesoAtual(b.id);
            const arroba = U.kgToArroba(peso, DB.state.config.rendimentoCarcaca);
            const checked = b.loteId === l?.id ? 'checked' : '';
            return `
              <label class="flex items-center gap-2 py-1 px-1 hover:bg-stone-50 rounded cursor-pointer">
                <input type="checkbox" class="lote-cb" data-bovino="${b.id}" data-arroba="${arroba}" data-peso="${peso}" data-categoria="${U.esc(b.categoria)}" ${checked} />
                <span class="font-mono text-xs w-12">${U.esc(b.brinco)}</span>
                <span class="text-xs flex-1">${U.esc(b.nome)}</span>
                <span class="badge badge-stone">${U.esc(b.categoria)}</span>
                <span class="text-xs text-stone-500 w-32 text-right">${U.num(peso, 0)} kg / ${U.num(arroba, 2)} @</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>

      <div class="bg-stone-50 border border-stone-200 rounded p-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <div><div class="text-stone-500 uppercase tracking-wider">Cabeças</div><div class="text-base font-semibold" id="lote-stats-count">0</div></div>
        <div><div class="text-stone-500 uppercase tracking-wider">@ média</div><div class="text-base font-semibold" id="lote-stats-mean">—</div></div>
        <div><div class="text-stone-500 uppercase tracking-wider">@ mediana</div><div class="text-base font-semibold" id="lote-stats-median">—</div></div>
        <div><div class="text-stone-500 uppercase tracking-wider">Menor / maior</div><div class="text-base font-semibold" id="lote-stats-range">—</div></div>
        <div><div class="text-stone-500 uppercase tracking-wider">Delta (Δ)</div><div class="text-base font-semibold" id="lote-stats-delta">—</div></div>
      </div>
      <div id="lote-stats-cat" class="text-xs text-stone-500"></div>

      <div class="flex justify-between pt-2 border-t border-stone-200">
        <div>${l ? `<button type="button" class="btn btn-danger btn-sm" onclick="Views.loteDelete('${l.id}')">Excluir</button>` : ''}</div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    </form>
  `, body => {
    const updateStats = () => {
      const checks = [...body.querySelectorAll('.lote-cb:checked')];
      const arrobas = checks.map(c => parseFloat(c.dataset.arroba));
      const count = checks.length;
      body.querySelector('#lote-stats-count').textContent = count;
      if (count === 0) {
        body.querySelector('#lote-stats-mean').textContent = '—';
        body.querySelector('#lote-stats-median').textContent = '—';
        body.querySelector('#lote-stats-range').textContent = '—';
        body.querySelector('#lote-stats-delta').textContent = '—';
        body.querySelector('#lote-stats-cat').textContent = '';
        return;
      }
      const mean = arrobas.reduce((s, x) => s + x, 0) / count;
      const med = U.median(arrobas);
      const min = Math.min(...arrobas);
      const max = Math.max(...arrobas);
      body.querySelector('#lote-stats-mean').textContent = U.num(mean, 2) + ' @';
      body.querySelector('#lote-stats-median').textContent = U.num(med, 2) + ' @';
      body.querySelector('#lote-stats-range').textContent = U.num(min, 2) + ' / ' + U.num(max, 2) + ' @';
      body.querySelector('#lote-stats-delta').textContent = U.num(max - min, 2) + ' @';
      // breakdown por categoria
      const cats = {};
      checks.forEach(c => { cats[c.dataset.categoria] = (cats[c.dataset.categoria] || 0) + 1; });
      body.querySelector('#lote-stats-cat').textContent =
        'Composição: ' + Object.entries(cats).map(([k, v]) => `${v} ${k}${v > 1 ? '(s)' : ''}`).join(' · ');
    };
    body.querySelectorAll('.lote-cb').forEach(c => c.addEventListener('change', updateStats));
    updateStats();

    body.querySelector('#form-lote').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      const loteId = l ? (DB.lotes.update(id, data), id) : DB.lotes.add(data).id;
      // atribuir bovinos: tira os desmarcados que estavam no lote, adiciona os marcados
      const marcados = new Set([...body.querySelectorAll('.lote-cb:checked')].map(c => c.dataset.bovino));
      elegiveis.forEach(b => {
        if (marcados.has(b.id) && b.loteId !== loteId) {
          DB.bovinos.update(b.id, { loteId });
        } else if (!marcados.has(b.id) && b.loteId === loteId) {
          DB.bovinos.update(b.id, { loteId: null });
        }
      });
      U.closeModal();
      U.toast('Lote salvo', 'success');
      App.render();
    });
  });
};

Views.loteDelete = function (id) {
  if (!U.confirm('Excluir este lote? Os bovinos ficarão sem lote.')) return;
  DB.lotes.remove(id);
  U.closeModal();
  U.toast('Lote excluído');
  App.render();
};

// ===========================================================================
// DESPESAS
// ===========================================================================
Views._desp = { cat: '', sub: '', lote: '', ano: '', abertos: {} };
Views.despSet = function (k, v) {
  Views._desp[k] = v;
  if (k === 'cat') Views._desp.sub = '';
  App.render();
};
Views.despToggle = function (id) {
  Views._desp.abertos[id] = !Views._desp.abertos[id];
  App.render();
};

Views.despesas = function () {
  const st = Views._desp;
  const todas = DB.despesas.list();
  const anos = [...new Set(todas.map(d => (d.data || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const sub = d => d.fornecedor || '(sem descrição)';
  // filtros de lote e ano valem para o resumo; categoria/subcategoria filtram a lista
  const base = todas.filter(d => (!st.lote || d.loteId === st.lote) && (!st.ano || (d.data || '').startsWith(st.ano)));
  const lista = base
    .filter(d => (!st.cat || d.categoria === st.cat) && (!st.sub || sub(d) === st.sub))
    .sort((a, b) => b.data.localeCompare(a.data));
  const total = U.sum(base, 'valor');

  // resumo categoria → subcategoria
  const porCat = {};
  base.forEach(d => {
    const c = porCat[d.categoria] = porCat[d.categoria] || { total: 0, n: 0, subs: {} };
    c.total += d.valor || 0; c.n++;
    const sc = c.subs[sub(d)] = c.subs[sub(d)] || { total: 0, n: 0 };
    sc.total += d.valor || 0; sc.n++;
  });
  const cats = Object.entries(porCat).sort((a, b) => b[1].total - a[1].total);
  const pct = v => total ? U.num(v / total * 100, 1) + '%' : '';
  const q = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const subsDaCat = st.cat && porCat[st.cat] ? Object.keys(porCat[st.cat].subs).sort() : [];
  const sel = (k, opts, vazio) => `<select class="select !w-auto" onchange="Views.despSet('${k}', this.value)">
      <option value="">${vazio}</option>
      ${opts.map(([v, l]) => `<option value="${U.esc(v)}" ${st[k] === v ? 'selected' : ''}>${U.esc(l)}</option>`).join('')}
    </select>`;

  const itensHTML = d => {
    const itens = d.itens || [];
    if (!itens.length) return `<div class="text-xs text-stone-500 py-2">Lançamento manual, sem itens de extrato vinculados.${d.observacoes ? ' ' + U.esc(d.observacoes) : ''}</div>`;
    const soma = U.sum(itens, 'valor');
    return `
      <table class="w-full text-xs my-1">
        <thead><tr class="text-stone-500"><th class="text-left font-medium py-1">Data</th><th class="text-left font-medium">Lançamento no extrato</th><th class="text-right font-medium">Valor no extrato</th><th class="text-right font-medium">Parte deste lote</th><th class="text-right font-medium">Considerado</th></tr></thead>
        <tbody>
          ${itens.map(i => `<tr class="border-t border-stone-200">
            <td class="py-1 whitespace-nowrap">${U.formatDate(i.data)}</td>
            <td>${U.esc(i.descricao)}</td>
            <td class="text-right whitespace-nowrap">${U.money(i.valorExtrato)}</td>
            <td class="text-right whitespace-nowrap">${U.num((i.parte || 0) * 100, 1)}%</td>
            <td class="text-right whitespace-nowrap">${U.money(i.valor)}</td>
          </tr>`).join('')}
          <tr class="border-t border-stone-300 font-semibold"><td colspan="4" class="py-1">Total (${itens.length} lançamento${itens.length > 1 ? 's' : ''})</td><td class="text-right">${U.money(soma)}</td></tr>
        </tbody>
      </table>
      ${d.observacoes ? `<div class="text-[11px] text-stone-500 pb-1">${U.esc(d.observacoes)}</div>` : ''}`;
  };

  return `
    <div class="flex flex-wrap items-center gap-2 mb-4">
      ${sel('cat', cats.map(([c, o]) => [c, `${c} — ${U.money(o.total)}`]), 'Todas as categorias')}
      ${st.cat ? sel('sub', subsDaCat.map(x => [x, `${x} — ${U.money(porCat[st.cat].subs[x].total)}`]), 'Todas as subcategorias') : ''}
      ${sel('lote', DB.lotes.list().map(l => [l.id, /^lote/i.test(l.nome) ? l.nome : 'Lote ' + l.nome]), 'Todos os lotes')}
      ${sel('ano', anos.map(a => [a, a]), 'Todos os anos')}
      ${(st.cat || st.sub || st.lote || st.ano) ? `<button class="btn btn-secondary" onclick="Views._desp = { cat: '', sub: '', lote: '', ano: '', abertos: {} }; App.render()">Limpar filtros</button>` : ''}
      <div class="flex-1"></div>
      <button class="btn btn-primary" onclick="Views.despesaForm()">+ Nova despesa</button>
    </div>

    <div class="card p-0 mb-4">
      <div class="card-title px-4 pt-4">Por categoria e subcategoria <span class="text-xs font-normal text-stone-500">— clique para filtrar</span></div>
      <div class="overflow-x-auto">
      <table class="table text-sm">
        <thead><tr><th>Categoria / subcategoria</th><th class="text-right">Lançamentos</th><th class="text-right">Valor</th><th class="text-right">%</th></tr></thead>
        <tbody>
          ${cats.map(([c, o]) => `
            <tr class="clickable font-semibold ${st.cat === c && !st.sub ? 'bg-lime-50' : 'bg-stone-50'}" onclick="Views.despSet('cat', '${q(c)}')">
              <td>${U.esc(c)}</td><td class="text-right">${o.n}</td><td class="text-right">${U.money(o.total)}</td><td class="text-right text-stone-500">${pct(o.total)}</td>
            </tr>
            ${Object.entries(o.subs).sort((a, b) => b[1].total - a[1].total).map(([sc, so]) => `
              <tr class="clickable text-stone-600 ${st.cat === c && st.sub === sc ? 'bg-lime-50' : ''}" onclick="Views._desp.cat='${q(c)}'; Views.despSet('sub', '${q(sc)}')">
                <td class="pl-8">${U.esc(sc)}</td><td class="text-right">${so.n}</td><td class="text-right">${U.money(so.total)}</td><td class="text-right text-stone-500">${pct(so.total)}</td>
              </tr>`).join('')}
          `).join('') || `<tr><td colspan="4" class="text-center text-stone-500 py-6">Nenhuma despesa</td></tr>`}
          ${cats.length ? `<tr class="font-semibold border-t-2"><td>Total</td><td class="text-right">${base.length}</td><td class="text-right">${U.money(total)}</td><td></td></tr>` : ''}
        </tbody>
      </table>
      </div>
    </div>

    <div class="text-sm text-stone-500 mb-2">${lista.length} despesa(s)${st.cat ? ' em ' + U.esc(st.cat) : ''}${st.sub ? ' › ' + U.esc(st.sub) : ''} — total ${U.money(U.sum(lista, 'valor'))}. Clique em ▸ para ver os lançamentos considerados.</div>
    <div class="card p-0 overflow-x-auto">
      <table class="table">
        <thead><tr><th></th><th>Data</th><th>Subcategoria</th><th>Categoria</th><th>Escopo</th><th class="text-right">Lanç.</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(d => {
            const lote = d.loteId ? DB.lotes.get(d.loteId)?.nome : '';
            const escopo = d.rateioEscopo === 'lote' ? `Lote: ${U.esc(lote || '?')}` : (d.rateioEscopo === 'manual' ? 'Manual' : 'Todos ativos');
            const aberto = !!st.abertos[d.id];
            return `
              <tr class="clickable" onclick="Views.despToggle('${d.id}')">
                <td class="w-6 text-stone-400">${aberto ? '▾' : '▸'}</td>
                <td class="whitespace-nowrap">${U.formatDate(d.data)}</td>
                <td>${U.esc(d.fornecedor)}</td>
                <td><span class="badge">${U.esc(d.categoria)}</span></td>
                <td class="text-stone-500 text-xs whitespace-nowrap">${escopo}</td>
                <td class="text-right text-stone-500">${(d.itens || []).length || '—'}</td>
                <td class="text-right text-money-neg whitespace-nowrap">${U.money(d.valor)}</td>
                <td class="whitespace-nowrap" onclick="event.stopPropagation()">
                  <button class="btn btn-icon" title="Editar" onclick="Views.despesaForm('${d.id}')">✎</button>
                  <button class="btn btn-icon" title="Excluir" onclick="Views.despesaDelete('${d.id}')">×</button>
                </td>
              </tr>
              ${aberto ? `<tr><td></td><td colspan="7" class="bg-stone-50">${itensHTML(d)}</td></tr>` : ''}
            `;
          }).join('') || `<tr><td colspan="8" class="text-center text-stone-500 py-8">Nenhuma despesa registrada</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

Views.despesaForm = function (id) {
  const d = id ? DB.despesas.get(id) : null;
  const lotes = DB.lotes.list();
  const ativos = DB.bovinos.ativos();

  U.modal(d ? 'Editar despesa' : 'Nova despesa operacional', `
    <form id="form-despesa" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${d?.data || U.todayISO()}" required /></div>
      <div><label class="field-label">Valor (R$) *</label><input class="input" name="valor" type="number" step="0.01" value="${d?.valor || ''}" required /></div>
      <div class="col-span-2"><label class="field-label">Fornecedor / Descrição</label><input class="input" name="fornecedor" value="${U.esc(d?.fornecedor || '')}" /></div>
      <div><label class="field-label">Categoria</label>
        <select class="select" name="categoria">${CATEGORIAS_DESPESA.map(c => `<option ${d?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div><label class="field-label">Tipo de rateio</label>
        <select class="select" name="rateioTipo" id="rateio-tipo">
          ${RATEIO_TIPOS.map(t => `<option value="${t.id}" ${d?.rateioTipo === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="col-span-2" id="rateio-escopo-wrap">
        <label class="field-label">Aplicar a:</label>
        <select class="select" name="rateioEscopo" id="rateio-escopo">
          <option value="todos" ${d?.rateioEscopo === 'todos' ? 'selected' : ''}>Todos os bovinos ativos na data</option>
          <option value="lote" ${d?.rateioEscopo === 'lote' ? 'selected' : ''}>Apenas um lote</option>
        </select>
      </div>
      <div class="col-span-2 hidden" id="lote-wrap">
        <label class="field-label">Lote</label>
        <select class="select" name="loteId">
          <option value="">Selecione...</option>
          ${lotes.map(l => `<option value="${l.id}" ${d?.loteId === l.id ? 'selected' : ''}>${U.esc(l.nome)}</option>`).join('')}
        </select>
      </div>
      <div class="col-span-2 hidden" id="manual-wrap">
        <label class="field-label">Distribuição manual (R$)</label>
        <div id="manual-list" class="space-y-2 max-h-60 overflow-y-auto border border-stone-200 rounded p-2"></div>
        <div class="text-xs text-stone-500 mt-1">Total alocado: <span id="manual-total">R$ 0,00</span></div>
      </div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2">${U.esc(d?.observacoes || '')}</textarea></div>
      <div class="col-span-2 bg-stone-50 border border-stone-200 rounded p-3">
        <div class="text-xs font-semibold text-stone-700 mb-1">Prévia do rateio</div>
        <div id="rateio-preview" class="text-xs text-stone-600">—</div>
      </div>
      <div class="col-span-2 flex justify-between pt-2 border-t border-stone-200">
        <div>${d ? `<button type="button" class="btn btn-danger btn-sm" onclick="Views.despesaDelete('${d.id}')">Excluir</button>` : ''}</div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    </form>
  `, body => {
    const form = body.querySelector('#form-despesa');
    const tipoSel = body.querySelector('#rateio-tipo');
    const escopoSel = body.querySelector('#rateio-escopo');
    const loteWrap = body.querySelector('#lote-wrap');
    const escopoWrap = body.querySelector('#rateio-escopo-wrap');
    const manualWrap = body.querySelector('#manual-wrap');
    const manualList = body.querySelector('#manual-list');
    const manualTotal = body.querySelector('#manual-total');
    const preview = body.querySelector('#rateio-preview');

    const updateUI = () => {
      const tipo = tipoSel.value;
      const escopo = escopoSel.value;
      manualWrap.classList.toggle('hidden', tipo !== 'manual');
      escopoWrap.classList.toggle('hidden', tipo === 'manual');
      loteWrap.classList.toggle('hidden', escopo !== 'lote' || tipo === 'manual');
      if (tipo === 'manual') renderManual();
      updatePreview();
    };

    const renderManual = () => {
      const existentes = d?.bovinosManuais || [];
      manualList.innerHTML = ativos.map(b => {
        const ex = existentes.find(x => x.bovinoId === b.id);
        return `
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono w-16">${U.esc(b.brinco)}</span>
            <span class="text-xs flex-1">${U.esc(b.nome)}</span>
            <input class="input manual-input" data-bovino="${b.id}" type="number" step="0.01" style="width: 120px" placeholder="0,00" value="${ex?.valor || ''}" />
          </div>
        `;
      }).join('');
      manualList.querySelectorAll('.manual-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const total = [...manualList.querySelectorAll('.manual-input')].reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
          manualTotal.textContent = U.money(total);
        });
      });
      const total = [...manualList.querySelectorAll('.manual-input')].reduce((s, x) => s + (parseFloat(x.value) || 0), 0);
      manualTotal.textContent = U.money(total);
    };

    const updatePreview = () => {
      const fd = Object.fromEntries(new FormData(form).entries());
      const despesa = {
        data: fd.data,
        valor: parseFloat(fd.valor) || 0,
        rateioTipo: fd.rateioTipo,
        rateioEscopo: fd.rateioEscopo,
        loteId: fd.loteId || null,
        bovinosManuais: tipoSel.value === 'manual'
          ? [...manualList.querySelectorAll('.manual-input')].map(i => ({ bovinoId: i.dataset.bovino, valor: parseFloat(i.value) || 0 })).filter(x => x.valor > 0)
          : [],
      };
      const r = DB.rateio.calcular(despesa);
      const entries = Object.entries(r);
      if (entries.length === 0) {
        preview.innerHTML = '<em>Nenhum bovino elegível.</em>';
        return;
      }
      preview.innerHTML = `<strong>${entries.length} bovino(s) — total ${U.money(Object.values(r).reduce((s,v)=>s+v,0))}</strong><br>` +
        entries.slice(0, 6).map(([bid, val]) => {
          const b = DB.bovinos.get(bid);
          return `${U.esc(b?.brinco)}: ${U.money(val)}`;
        }).join(' · ') + (entries.length > 6 ? ` <em>+${entries.length - 6}</em>` : '');
    };

    tipoSel.addEventListener('change', updateUI);
    escopoSel.addEventListener('change', updateUI);
    form.addEventListener('input', updatePreview);
    updateUI();

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.valor = parseFloat(fd.valor) || 0;
      fd.loteId = fd.loteId || null;
      fd.bovinosManuais = tipoSel.value === 'manual'
        ? [...manualList.querySelectorAll('.manual-input')]
            .map(i => ({ bovinoId: i.dataset.bovino, valor: parseFloat(i.value) || 0 }))
            .filter(x => x.valor > 0)
        : [];
      if (d) DB.despesas.update(id, fd);
      else DB.despesas.add(fd);
      U.closeModal();
      U.toast('Despesa salva', 'success');
      App.render();
    });
  });
};

Views.despesaDelete = function (id) {
  if (!U.confirm('Excluir esta despesa?')) return;
  DB.despesas.remove(id);
  U.closeModal();
  U.toast('Despesa excluída');
  App.render();
};

// ===========================================================================
// INVESTIMENTOS
// ===========================================================================
Views.investimentos = function () {
  const lista = [...DB.investimentos.list()].sort((a, b) => b.data.localeCompare(a.data));
  const porCat = U.groupBy(lista, 'categoria');
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-stone-500">${lista.length} lançamento(s) — total ${U.money(U.sum(lista, 'valor'))}</div>
      <button class="btn btn-primary" onclick="Views.investimentoForm()">+ Novo investimento</button>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      ${Object.entries(porCat).map(([cat, items]) => `
        <div class="kpi-card">
          <div class="kpi-label">${U.esc(cat)}</div>
          <div class="kpi-value text-base">${U.money(U.sum(items, 'valor'))}</div>
          <div class="kpi-sub">${items.length} lançamento(s)</div>
        </div>
      `).join('')}
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(i => `
            <tr class="clickable" onclick="Views.investimentoForm('${i.id}')">
              <td>${U.formatDate(i.data)}</td>
              <td>${U.esc(i.descricao)}</td>
              <td><span class="badge badge-blue">${U.esc(i.categoria)}</span></td>
              <td class="text-right">${U.money(i.valor)}</td>
              <td onclick="event.stopPropagation()"><button class="btn btn-icon" onclick="Views.investimentoDelete('${i.id}')">×</button></td>
            </tr>
          `).join('') || `<tr><td colspan="5" class="text-center text-stone-500 py-8">Nenhum investimento registrado</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

Views.investimentoForm = function (id) {
  const inv = id ? DB.state.investimentos.find(x => x.id === id) : null;
  U.modal(inv ? 'Editar investimento' : 'Novo investimento (CAPEX)', `
    <form id="form-inv" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${inv?.data || U.todayISO()}" required /></div>
      <div><label class="field-label">Valor (R$) *</label><input class="input" name="valor" type="number" step="0.01" value="${inv?.valor || ''}" required /></div>
      <div class="col-span-2"><label class="field-label">Descrição</label><input class="input" name="descricao" value="${U.esc(inv?.descricao || '')}" /></div>
      <div class="col-span-2"><label class="field-label">Categoria</label>
        <select class="select" name="categoria">${CATEGORIAS_INVESTIMENTO.map(c => `<option ${inv?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2">${U.esc(inv?.observacoes || '')}</textarea></div>
      <div class="col-span-2 flex justify-between pt-2 border-t border-stone-200">
        <div>${inv ? `<button type="button" class="btn btn-danger btn-sm" onclick="Views.investimentoDelete('${inv.id}')">Excluir</button>` : ''}</div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-inv').addEventListener('submit', e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.valor = parseFloat(data.valor) || 0;
      if (inv) DB.investimentos.update(id, data);
      else DB.investimentos.add(data);
      U.closeModal();
      U.toast('Investimento salvo', 'success');
      App.render();
    });
  });
};

Views.investimentoDelete = function (id) {
  if (!U.confirm('Excluir este investimento?')) return;
  DB.investimentos.remove(id);
  U.closeModal();
  U.toast('Investimento excluído');
  App.render();
};

// ===========================================================================
// VENDAS
// ===========================================================================
Views.vendas = function () {
  const lista = [...DB.vendas.list()].sort((a, b) => b.data.localeCompare(a.data));
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-stone-500">${lista.length} venda(s) — total ${U.money(U.sum(lista, 'valorTotal'))}</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="Views.receitaForm()">+ Outra receita</button>
        <button class="btn btn-primary" onclick="Views.vendaForm()">+ Nova venda</button>
      </div>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Data</th><th>Comprador</th><th class="text-right">Cabeças</th><th class="text-right">Peso total (kg)</th><th class="text-right">@ total</th><th class="text-right">Preço @</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(v => `
            <tr>
              <td>${U.formatDate(v.data)}</td>
              <td>${U.esc(v.comprador)}${v.tipo === 'outra' ? ' <span class="text-[11px] bg-stone-100 text-stone-600 rounded px-1.5 py-0.5">outra receita</span>' : ''}</td>
              <td class="text-right">${v.tipo === 'outra' ? '—' : v.bovinoIds.length}</td>
              <td class="text-right">${U.num(v.pesoTotalKg, 0)}</td>
              <td class="text-right">${U.num(U.kgToArroba(v.pesoTotalKg), 1)}</td>
              <td class="text-right">${U.money(v.precoArroba)}</td>
              <td class="text-right text-money-pos">${U.money(v.valorTotal)}</td>
              <td><button class="btn btn-icon" onclick="Views.vendaDelete('${v.id}')">×</button></td>
            </tr>
          `).join('') || `<tr><td colspan="8" class="text-center text-stone-500 py-8">Nenhuma venda registrada</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
};

Views.vendaForm = function () {
  const ativos = DB.bovinos.ativos();
  U.modal('Nova venda / saída para frigorífico', `
    <form id="form-venda" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${U.todayISO()}" required /></div>
      <div><label class="field-label">Comprador / Frigorífico</label><input class="input" name="comprador" /></div>
      <div><label class="field-label">Preço @ (R$) *</label><input class="input" name="precoArroba" type="number" step="0.01" required id="venda-preco" /></div>
      <div><label class="field-label">Rendimento de carcaça</label><input class="input" name="rendimento" type="number" step="0.01" value="0.52" id="venda-rend" /></div>
      <div class="col-span-2">
        <label class="field-label">Bovinos vendidos</label>
        <div class="border border-stone-200 rounded p-2 max-h-72 overflow-y-auto">
          ${ativos.map(b => {
            const peso = DB.pesagens.pesoAtual(b.id);
            return `
              <label class="flex items-center gap-2 py-1 hover:bg-stone-50 px-1 rounded">
                <input type="checkbox" class="venda-cb" data-bovino="${b.id}" data-peso="${peso}" />
                <span class="font-mono text-xs w-12">${U.esc(b.brinco)}</span>
                <span class="text-xs flex-1">${U.esc(b.nome)}</span>
                <span class="text-xs text-stone-500">${U.num(peso, 0)} kg / ${U.num(U.kgToArroba(peso), 2)} @</span>
              </label>
            `;
          }).join('') || '<div class="text-stone-500 text-sm p-2">Nenhum bovino ativo</div>'}
        </div>
      </div>
      <div class="col-span-2 bg-stone-50 border border-stone-200 rounded p-3 text-xs">
        <div>Selecionados: <strong id="v-count">0</strong> · Peso total: <strong id="v-peso">0 kg</strong> · @: <strong id="v-arroba">0</strong> · Valor: <strong class="text-money-pos" id="v-total">R$ 0,00</strong></div>
      </div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2"></textarea></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar venda</button>
      </div>
    </form>
  `, body => {
    const form = body.querySelector('#form-venda');
    const update = () => {
      const checked = [...body.querySelectorAll('.venda-cb:checked')];
      const peso = checked.reduce((s, c) => s + parseFloat(c.dataset.peso || 0), 0);
      const rend = parseFloat(body.querySelector('#venda-rend').value) || 0.52;
      const arroba = (peso * rend) / 15;
      const preco = parseFloat(body.querySelector('#venda-preco').value) || 0;
      const total = arroba * preco;
      body.querySelector('#v-count').textContent = checked.length;
      body.querySelector('#v-peso').textContent = U.num(peso, 0) + ' kg';
      body.querySelector('#v-arroba').textContent = U.num(arroba, 2);
      body.querySelector('#v-total').textContent = U.money(total);
    };
    body.querySelectorAll('.venda-cb').forEach(c => c.addEventListener('change', update));
    body.querySelector('#venda-preco').addEventListener('input', update);
    body.querySelector('#venda-rend').addEventListener('input', update);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const checked = [...body.querySelectorAll('.venda-cb:checked')];
      if (checked.length === 0) { U.toast('Selecione ao menos um bovino', 'error'); return; }
      const bovinoIds = checked.map(c => c.dataset.bovino);
      const pesoTotalKg = checked.reduce((s, c) => s + parseFloat(c.dataset.peso || 0), 0);
      const rend = parseFloat(fd.rendimento) || 0.52;
      const precoArroba = parseFloat(fd.precoArroba) || 0;
      const arrobaTotal = (pesoTotalKg * rend) / 15;
      const valorTotal = arrobaTotal * precoArroba;
      DB.vendas.add({
        data: fd.data, comprador: fd.comprador, observacoes: fd.observacoes,
        bovinoIds, pesoTotalKg, precoArroba, valorTotal,
      });
      // distribuir receita por bovino (proporcional ao peso)
      checked.forEach(c => {
        const peso = parseFloat(c.dataset.peso);
        const partArroba = (peso * rend) / 15;
        const receita = partArroba * precoArroba;
        DB.bovinos.update(c.dataset.bovino, {
          status: 'vendido', dataSaida: fd.data, pesoSaida: peso,
          precoArrobaSaida: precoArroba, receitaSaida: receita,
        });
      });
      U.closeModal();
      U.toast('Venda registrada', 'success');
      App.render();
    });
  });
};

Views.receitaForm = function () {
  U.modal('Outra receita (não é venda de gado)', `
    <form id="form-receita" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${U.todayISO()}" required /></div>
      <div><label class="field-label">Valor (R$) *</label><input class="input" name="valor" type="number" step="0.01" min="0.01" required /></div>
      <div class="col-span-2"><label class="field-label">Origem *</label><input class="input" name="comprador" placeholder="ex.: aluguel de antena, arrendamento, reembolso" required /></div>
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2"></textarea></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-receita').addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      DB.vendas.add({ tipo: 'outra', data: fd.data, comprador: fd.comprador, observacoes: fd.observacoes, valorTotal: parseFloat(fd.valor) || 0 });
      U.closeModal();
      U.toast('Receita registrada', 'success');
      App.render();
    });
  });
};

Views.vendaDelete = function (id) {
  if (!U.confirm('Excluir esta venda? Os bovinos voltam para o status ativo.')) return;
  DB.vendas.remove(id);
  U.toast('Venda excluída');
  App.render();
};

// ===========================================================================
// RATEIO & CUSTOS
// ===========================================================================
Views.rateio = function () {
  const ativos = DB.bovinos.list();
  return `
    <div class="mb-4">
      <h2 class="section-title">Custo por bovino — alocação de despesas</h2>
      <div class="text-xs text-stone-500 mb-2">Soma de todas as despesas operacionais alocadas a cada bovino, conforme o método de rateio configurado em cada lançamento.</div>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Brinco</th><th>Nome</th><th>Lote</th><th class="text-right">Peso atual</th><th class="text-right">Custo entrada</th><th class="text-right">Custo operacional</th><th class="text-right">Custo total</th><th class="text-right">Receita venda</th><th class="text-right">Margem</th></tr></thead>
        <tbody>
          ${ativos.map(b => {
            const peso = DB.pesagens.pesoAtual(b.id);
            const custoOp = DB.rateio.custoOperacionalBovino(b.id);
            const custoTotal = (b.custoEntrada || 0) + custoOp;
            const receita = b.receitaSaida || 0;
            const margem = receita - custoTotal;
            const lote = b.loteId ? DB.lotes.get(b.loteId)?.nome : '—';
            return `
              <tr class="clickable" onclick="location.hash='#/bovinos/${b.id}'">
                <td class="font-mono">${U.esc(b.brinco)}</td>
                <td>${U.esc(b.nome)}</td>
                <td class="text-stone-500">${U.esc(lote || '—')}</td>
                <td class="text-right">${U.num(peso, 0)} kg</td>
                <td class="text-right">${U.money(b.custoEntrada || 0)}</td>
                <td class="text-right text-money-neg">${U.money(custoOp)}</td>
                <td class="text-right">${U.money(custoTotal)}</td>
                <td class="text-right text-money-pos">${receita ? U.money(receita) : '—'}</td>
                <td class="text-right ${margem >= 0 ? 'text-money-pos' : 'text-money-neg'}">${receita ? U.money(margem) : '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
};

// ===========================================================================
// SIMULADOR DE VENDA
// ===========================================================================
Views.simulador = function () {
  const lotes = DB.lotes.list();
  const ativos = DB.bovinos.ativos();
  const rendimento = DB.state.config.rendimentoCarcaca || 0.52;

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card lg:col-span-1">
        <div class="card-title">Parâmetros da simulação</div>
        <div class="space-y-3">
          <div>
            <label class="field-label">Escopo</label>
            <select id="sim-escopo" class="select">
              <option value="todos">Todos os bovinos ativos</option>
              ${lotes.map(l => `<option value="${l.id}">Lote: ${U.esc(l.nome)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="field-label">Preço @ venda (R$) *</label>
            <input id="sim-preco" type="number" step="0.01" class="input" value="320" />
          </div>
          <div>
            <label class="field-label">Rendimento de carcaça</label>
            <input id="sim-rend" type="number" step="0.01" class="input" value="${rendimento}" />
          </div>
          <div class="border-t border-stone-200 pt-3">
            <div class="text-xs uppercase tracking-wider text-stone-500 mb-2">Projeção (opcional)</div>
            <label class="field-label">Dias até a venda</label>
            <input id="sim-dias" type="number" class="input" value="0" placeholder="0 = vender hoje" />
            <label class="field-label mt-2">GMD esperado (kg/dia)</label>
            <input id="sim-gmd" type="number" step="0.01" class="input" value="0.6" />
            <label class="field-label mt-2">Despesa operacional projetada (R$/cabeça/dia)</label>
            <input id="sim-despesa-dia" type="number" step="0.01" class="input" value="3.50" placeholder="ração + insumos médios" />
          </div>
          <button id="sim-run" class="btn btn-primary w-full">Calcular</button>
        </div>
      </div>

      <div class="lg:col-span-2 space-y-4">
        <div id="sim-result"></div>
      </div>
    </div>

    <script>
      (function () {
        const run = () => {
          const escopo = document.getElementById('sim-escopo').value;
          const preco = parseFloat(document.getElementById('sim-preco').value) || 0;
          const rend = parseFloat(document.getElementById('sim-rend').value) || 0.52;
          const dias = parseInt(document.getElementById('sim-dias').value) || 0;
          const gmdProj = parseFloat(document.getElementById('sim-gmd').value) || 0;
          const despDia = parseFloat(document.getElementById('sim-despesa-dia').value) || 0;

          const bovinos = escopo === 'todos'
            ? DB.bovinos.ativos()
            : DB.bovinos.porLote(escopo);

          if (bovinos.length === 0) {
            document.getElementById('sim-result').innerHTML = '<div class="card text-stone-500">Nenhum bovino no escopo selecionado.</div>';
            return;
          }

          const linhas = bovinos.map(b => {
            const pesoAtual = DB.pesagens.pesoAtual(b.id);
            const pesoFuturo = pesoAtual + (gmdProj * dias);
            const arrobas = (pesoFuturo * rend) / 15;
            const receita = arrobas * preco;
            const custoEntrada = b.custoEntrada || 0;
            const custoOperacional = DB.rateio.custoOperacionalBovino(b.id);
            const custoProjetado = despDia * dias;
            const custoTotal = custoEntrada + custoOperacional + custoProjetado;
            const margem = receita - custoTotal;
            const roi = custoTotal > 0 ? (margem / custoTotal) * 100 : 0;
            return { b, pesoAtual, pesoFuturo, arrobas, receita, custoEntrada, custoOperacional, custoProjetado, custoTotal, margem, roi };
          });

          const totReceita = linhas.reduce((s, x) => s + x.receita, 0);
          const totCusto = linhas.reduce((s, x) => s + x.custoTotal, 0);
          const totMargem = totReceita - totCusto;
          const margemMedia = totMargem / linhas.length;
          const roiMedio = totCusto > 0 ? (totMargem / totCusto) * 100 : 0;
          const totArrobas = linhas.reduce((s, x) => s + x.arrobas, 0);
          const breakeven = totArrobas > 0 ? totCusto / totArrobas : 0;

          let html = '';
          html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
          html += '<div class="kpi-card"><div class="kpi-label">Receita estimada</div><div class="kpi-value text-money-pos">' + U.money(totReceita) + '</div><div class="kpi-sub">' + U.num(totArrobas, 1) + ' @ a ' + U.money(preco) + '</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Custo total</div><div class="kpi-value text-money-neg">' + U.money(totCusto) + '</div><div class="kpi-sub">' + bovinos.length + ' cabeça(s)</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Margem total</div><div class="kpi-value ' + (totMargem >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.money(totMargem) + '</div><div class="kpi-sub">ROI ' + U.num(roiMedio, 1) + '%</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Margem média/cabeça</div><div class="kpi-value ' + (margemMedia >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.money(margemMedia) + '</div><div class="kpi-sub">Breakeven: ' + U.money(breakeven) + '/@</div></div>';
          html += '</div>';

          html += '<div class="card p-0 mt-4"><div class="px-4 pt-4 card-title">Detalhe por bovino</div>';
          html += '<div class="overflow-x-auto">';
          html += '<table class="table"><thead><tr><th>Brinco</th><th>Nome</th><th class="text-right">Peso atual</th>';
          if (dias > 0) html += '<th class="text-right">Peso projetado</th>';
          html += '<th class="text-right">@ a vender</th><th class="text-right">Receita</th><th class="text-right">Custo total</th><th class="text-right">Margem</th><th class="text-right">ROI</th></tr></thead><tbody>';
          linhas.forEach(L => {
            html += '<tr>';
            html += '<td class="font-mono">' + U.esc(L.b.brinco) + '</td>';
            html += '<td>' + U.esc(L.b.nome) + '</td>';
            html += '<td class="text-right">' + U.num(L.pesoAtual, 0) + ' kg</td>';
            if (dias > 0) html += '<td class="text-right">' + U.num(L.pesoFuturo, 0) + ' kg</td>';
            html += '<td class="text-right">' + U.num(L.arrobas, 2) + '</td>';
            html += '<td class="text-right">' + U.money(L.receita) + '</td>';
            html += '<td class="text-right text-money-neg">' + U.money(L.custoTotal) + '</td>';
            html += '<td class="text-right ' + (L.margem >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.money(L.margem) + '</td>';
            html += '<td class="text-right ' + (L.roi >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.num(L.roi, 1) + '%</td>';
            html += '</tr>';
          });
          html += '</tbody></table></div></div>';

          document.getElementById('sim-result').innerHTML = html;
        };
        document.getElementById('sim-run').addEventListener('click', run);
        run();
      })();
    </script>
  `;
};

// ===========================================================================
// CONFIGURAÇÕES DA FAZENDA
// ===========================================================================
Views.config = function () {
  const c = DB.state.config;
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">Identificação</div>
        <form id="form-config" class="space-y-3">
          <div><label class="field-label">Nome da fazenda</label><input class="input" name="nomeFazenda" value="${U.esc(c.nomeFazenda || '')}" /></div>

          <div class="border-t border-stone-200 pt-3">
            <div class="text-xs uppercase tracking-wider text-stone-500 mb-2">Áreas (georreferenciamento)</div>
          </div>
          <div><label class="field-label">Área total (hectares)</label><input class="input" name="areaTotalHa" type="number" step="0.01" value="${c.areaTotalHa || ''}" /></div>
          <div>
            <label class="field-label">Área de pastagem (hectares) — usada para cálculo de UA/ha</label>
            <input class="input" name="areaPastoHa" type="number" step="0.01" value="${c.areaPastoHa || ''}" />
            <p class="text-xs text-stone-500 mt-1">Subtraia áreas de APP, sede, mata e estradas para ter a área efetiva de pastejo.</p>
          </div>

          <div class="border-t border-stone-200 pt-3">
            <div class="text-xs uppercase tracking-wider text-stone-500 mb-2">Parâmetros zootécnicos</div>
          </div>
          <div><label class="field-label">Rendimento de carcaça (0–1)</label><input class="input" name="rendimentoCarcaca" type="number" step="0.01" value="${c.rendimentoCarcaca || 0.52}" /></div>
          <div><label class="field-label">Peso de 1 UA (kg de peso vivo)</label><input class="input" name="pesoUA" type="number" value="${c.pesoUA || 450}" /></div>

          <div class="flex justify-end pt-2 border-t border-stone-200">
            <button type="submit" class="btn btn-primary">Salvar configurações</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Resumo da fazenda</div>
        ${(() => {
          const ativos = DB.bovinos.ativos();
          const pesoTotal = U.sum(ativos, b => DB.pesagens.pesoAtual(b.id));
          const ua = pesoTotal / (c.pesoUA || 450);
          const uaHa = c.areaPastoHa ? ua / c.areaPastoHa : null;
          return `
            <dl class="text-sm space-y-2">
              <div class="flex justify-between"><dt class="text-stone-500">Área total</dt><dd>${c.areaTotalHa ? U.num(c.areaTotalHa, 1) + ' ha' : '—'}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Área de pasto</dt><dd>${c.areaPastoHa ? U.num(c.areaPastoHa, 1) + ' ha' : '—'}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Cabeças ativas</dt><dd>${ativos.length}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Peso vivo total</dt><dd>${U.num(pesoTotal, 0)} kg</dd></div>
              <div class="flex justify-between border-t border-stone-100 pt-2"><dt class="text-stone-500">Unidades animais (UA)</dt><dd class="font-semibold">${U.num(ua, 2)}</dd></div>
              <div class="flex justify-between"><dt class="text-stone-500">Lotação (UA/ha)</dt><dd class="font-semibold">${uaHa !== null ? U.num(uaHa, 2) + ' UA/ha' : '— configure área de pasto —'}</dd></div>
            </dl>
            <div class="mt-3 pt-3 border-t border-stone-200 text-xs text-stone-500 leading-relaxed">
              <strong>Referência:</strong> taxa de lotação adequada em pastagem de cerrado vai de 0,8 a 2,0 UA/ha conforme manejo. Acima disso costuma indicar superlotação.
            </div>
          `;
        })()}
      </div>
    </div>

    <script>
      document.getElementById('form-config').addEventListener('submit', e => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        DB.state.config = {
          ...DB.state.config,
          nomeFazenda: fd.nomeFazenda,
          areaTotalHa: parseFloat(fd.areaTotalHa) || 0,
          areaPastoHa: parseFloat(fd.areaPastoHa) || 0,
          rendimentoCarcaca: parseFloat(fd.rendimentoCarcaca) || 0.52,
          pesoUA: parseFloat(fd.pesoUA) || 450,
        };
        DB.save();
        U.toast('Configurações salvas', 'success');
        App.render();
      });
    </script>
  `;
};

// ===========================================================================
// RELATÓRIOS
// ===========================================================================
Views.relatorios = function () {
  const totalCompra = U.sum(DB.bovinos.list(), 'custoEntrada');
  const totalDespesas = U.sum(DB.despesas.list(), 'valor');
  const totalInv = U.sum(DB.investimentos.list(), 'valor');
  const totalVendas = U.sum(DB.vendas.list(), 'valorTotal');
  const margem = totalVendas - totalCompra - totalDespesas;

  // margem por animal vendido
  const vendidos = DB.bovinos.list().filter(b => b.status === 'vendido' && b.receitaSaida);
  const linhasMargem = vendidos.map(b => {
    const custoOp = DB.rateio.custoOperacionalBovino(b.id);
    const custoTotal = (b.custoEntrada || 0) + custoOp;
    const margemBov = (b.receitaSaida || 0) - custoTotal;
    const roi = custoTotal > 0 ? (margemBov / custoTotal) * 100 : 0;
    const dias = b.dataSaida ? U.daysBetween(b.dataEntrada, b.dataSaida) : 0;
    const ganhoKg = (b.pesoSaida || 0) - (b.pesoEntrada || 0);
    return { b, custoOp, custoTotal, margem: margemBov, roi, dias, ganhoKg };
  });
  const margemTotal = linhasMargem.reduce((s, x) => s + x.margem, 0);
  const margemMedia = linhasMargem.length ? margemTotal / linhasMargem.length : 0;
  const roiMedio = linhasMargem.length ? linhasMargem.reduce((s, x) => s + x.roi, 0) / linhasMargem.length : 0;

  const porCategoria = U.groupBy(DB.despesas.list(), 'categoria');
  const porInvCat = U.groupBy(DB.investimentos.list(), 'categoria');

  return `
    <div class="card mb-4">
      <div class="card-title">Margem por animal vendido</div>
      ${linhasMargem.length === 0 ? `<div class="text-stone-500 text-sm">Nenhuma venda registrada ainda.</div>` : `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div class="kpi-card"><div class="kpi-label">Animais vendidos</div><div class="kpi-value">${linhasMargem.length}</div></div>
          <div class="kpi-card"><div class="kpi-label">Margem total</div><div class="kpi-value ${margemTotal >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.money(margemTotal)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Margem média/cabeça</div><div class="kpi-value ${margemMedia >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.money(margemMedia)}</div></div>
          <div class="kpi-card"><div class="kpi-label">ROI médio</div><div class="kpi-value ${roiMedio >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.num(roiMedio, 1)}%</div></div>
        </div>
        <table class="table">
          <thead><tr><th>Brinco</th><th>Nome</th><th>Saída</th><th class="text-right">Dias na fazenda</th><th class="text-right">Ganho (kg)</th><th class="text-right">Custo entrada</th><th class="text-right">Custo operacional</th><th class="text-right">Custo total</th><th class="text-right">Receita venda</th><th class="text-right">Margem</th><th class="text-right">ROI</th></tr></thead>
          <tbody>
            ${linhasMargem.map(L => `
              <tr class="clickable" onclick="location.hash='#/bovinos/${L.b.id}'">
                <td class="font-mono">${U.esc(L.b.brinco)}</td>
                <td>${U.esc(L.b.nome)}</td>
                <td>${U.formatDate(L.b.dataSaida)}</td>
                <td class="text-right">${L.dias}</td>
                <td class="text-right text-money-pos">+${U.num(L.ganhoKg, 0)}</td>
                <td class="text-right">${U.money(L.b.custoEntrada || 0)}</td>
                <td class="text-right text-money-neg">${U.money(L.custoOp)}</td>
                <td class="text-right">${U.money(L.custoTotal)}</td>
                <td class="text-right text-money-pos">${U.money(L.b.receitaSaida)}</td>
                <td class="text-right ${L.margem >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.money(L.margem)}</td>
                <td class="text-right ${L.roi >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.num(L.roi, 1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">DRE Simplificado</div>
        <table class="table">
          <tbody>
            <tr><td>(+) Receita de vendas</td><td class="text-right text-money-pos">${U.money(totalVendas)}</td></tr>
            <tr><td>(−) Custo de aquisição de gado</td><td class="text-right text-money-neg">${U.money(totalCompra)}</td></tr>
            <tr><td>(−) Despesas operacionais</td><td class="text-right text-money-neg">${U.money(totalDespesas)}</td></tr>
            <tr class="font-semibold border-t-2"><td>= Margem bruta operacional</td><td class="text-right ${margem >= 0 ? 'text-money-pos' : 'text-money-neg'}">${U.money(margem)}</td></tr>
            <tr><td colspan="2" class="text-xs text-stone-500 italic pt-2">Investimentos (CAPEX) tratados separadamente: ${U.money(totalInv)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Despesas por categoria</div>
        <table class="table">
          <tbody>
            ${Object.entries(porCategoria).sort((a,b)=>U.sum(b[1],'valor')-U.sum(a[1],'valor')).map(([cat, items]) => `
              <tr><td>${U.esc(cat)}</td><td class="text-right">${U.money(U.sum(items, 'valor'))}</td><td class="text-right text-stone-500 text-xs">${items.length} lanç.</td></tr>
            `).join('')}
            <tr class="font-semibold border-t-2"><td>Total</td><td class="text-right">${U.money(totalDespesas)}</td><td></td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Investimentos (CAPEX) por categoria</div>
        <table class="table">
          <tbody>
            ${Object.entries(porInvCat).map(([cat, items]) => `
              <tr><td>${U.esc(cat)}</td><td class="text-right">${U.money(U.sum(items, 'valor'))}</td></tr>
            `).join('')}
            <tr class="font-semibold border-t-2"><td>Total</td><td class="text-right">${U.money(totalInv)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">Indicadores zootécnicos</div>
        <dl class="text-sm space-y-2">
          ${(() => {
            const ativos = DB.bovinos.ativos();
            const pesoMedio = ativos.length ? U.sum(ativos, b => DB.pesagens.pesoAtual(b.id)) / ativos.length : 0;
            const gmdMedio = ativos.length ? ativos.map(b => DB.pesagens.gmdGeral(b.id)).reduce((s,g)=>s+g,0) / ativos.length : 0;
            const custoMedio = ativos.length ? U.sum(ativos, b => DB.rateio.custoTotalBovino(b.id)) / ativos.length : 0;
            const arrobaMedia = U.kgToArroba(pesoMedio);
            const ganhoArrobaMedio = ativos.length
              ? ativos.map(b => U.kgToArroba(DB.pesagens.pesoAtual(b.id) - b.pesoEntrada)).reduce((s,a)=>s+a,0) / ativos.length
              : 0;
            const custoPorArrobaGanha = ganhoArrobaMedio > 0 ? (custoMedio / ganhoArrobaMedio) : 0;
            return `
              <div class="flex justify-between"><dt>Cabeças ativas</dt><dd>${ativos.length}</dd></div>
              <div class="flex justify-between"><dt>Peso médio</dt><dd>${U.num(pesoMedio, 0)} kg / ${U.num(arrobaMedia, 2)} @</dd></div>
              <div class="flex justify-between"><dt>GMD médio</dt><dd>${U.num(gmdMedio, 3)} kg/dia</dd></div>
              <div class="flex justify-between"><dt>Custo médio por cabeça</dt><dd>${U.money(custoMedio)}</dd></div>
              <div class="flex justify-between"><dt>Ganho médio em @</dt><dd>${U.num(ganhoArrobaMedio, 2)} @</dd></div>
              <div class="flex justify-between font-semibold"><dt>Custo por @ ganha</dt><dd>${U.money(custoPorArrobaGanha)}</dd></div>
            `;
          })()}
        </dl>
      </div>
    </div>
  `;
};

// ===========================================================================
// DADOS (Importar / Exportar)
// ===========================================================================
Views.dados = function () {
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">Exportar</div>
        <p class="text-sm text-stone-600 mb-3">Baixe um arquivo JSON com todos os dados (backup completo).</p>
        <button class="btn btn-primary" onclick="App.exportData()">Baixar backup JSON</button>
      </div>
      <div class="card">
        <div class="card-title">Importar</div>
        <p class="text-sm text-stone-600 mb-3">Substitui os dados atuais pelo backup carregado.</p>
        <input type="file" id="import-file" accept=".json" class="input mb-2" />
        <button class="btn btn-secondary" onclick="App.importData()">Importar JSON</button>
      </div>
      <div class="card">
        <div class="card-title">Importar CSV de despesas (controle de gastos)</div>
        <p class="text-sm text-stone-600 mb-3">Formato esperado: Data, Mês, Ano, Fornecedor/Descrição, Valor, Tipo (categoria). Linhas com valor positivo entram como Receita (vendas/outras); negativas como Despesa.</p>
        <input type="file" id="import-csv" accept=".csv" class="input mb-2" />
        <div class="flex gap-2">
          <button class="btn btn-secondary" onclick="App.importCSV()">Importar CSV</button>
        </div>
      </div>
      <div class="card border-red-200">
        <div class="card-title text-red-700">Zona de perigo</div>
        <p class="text-sm text-stone-600 mb-3">Apaga todos os dados deste navegador. Não há como desfazer.</p>
        <button class="btn btn-danger" onclick="App.resetData()">Resetar dados</button>
      </div>
    </div>
  `;
};

// ===========================================================================
// CONTAS A PAGAR (lançadas pelo vaqueiro em /campo ou aqui no ERP)
// ===========================================================================
Views._contaStatus = function (c) {
  const hoje = U.todayISO();
  if (c.status === 'pendente') return '<span class="badge badge-amber">Aguardando aprovação</span>';
  if (c.status === 'rejeitada') return '<span class="badge badge-stone">Rejeitada</span>';
  if (c.status === 'paga') return `<span class="badge badge-green">Paga ${U.formatDate(c.dataPagamento)}</span>`;
  if (c.vencimento < hoje) return '<span class="badge badge-red">Vencida</span>';
  return '<span class="badge badge-blue">A pagar</span>';
};

Views.contas = function () {
  const filtro = sessionStorage.getItem('filtro_contas') || 'abertas';
  const hoje = U.todayISO();
  const todas = DB.contas.list();
  const pend = DB.contas.pendentes();
  const aPagar = DB.contas.aPagar();
  const vencidas = aPagar.filter(c => c.vencimento < hoje);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const semana = aPagar.filter(c => c.vencimento >= hoje && c.vencimento <= em7);

  const filtros = {
    abertas: c => c.status === 'pendente' || c.status === 'aprovada',
    pendentes: c => c.status === 'pendente',
    apagar: c => c.status === 'aprovada',
    pagas: c => c.status === 'paga',
    todas: () => true,
  };
  const lista = todas.filter(filtros[filtro] || filtros.abertas)
    .sort((a, b) => (a.status === 'pendente' ? 0 : 1) - (b.status === 'pendente' ? 0 : 1) || a.vencimento.localeCompare(b.vencimento));

  const btnFiltro = (id, label) =>
    `<button class="btn btn-sm ${filtro === id ? 'btn-primary' : 'btn-secondary'}" onclick="sessionStorage.setItem('filtro_contas','${id}');App.render()">${label}</button>`;

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Aguardando aprovação</div><div class="kpi-value">${pend.length}</div><div class="kpi-sub">${U.money(U.sum(pend, 'valor'))}</div></div>
      <div class="kpi-card"><div class="kpi-label">A pagar</div><div class="kpi-value">${U.money(U.sum(aPagar, 'valor'))}</div><div class="kpi-sub">${aPagar.length} conta(s) aprovada(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">Vencendo em 7 dias</div><div class="kpi-value">${U.money(U.sum(semana, 'valor'))}</div><div class="kpi-sub">${semana.length} conta(s)</div></div>
      <div class="kpi-card"><div class="kpi-label">Vencidas</div><div class="kpi-value ${vencidas.length ? 'text-money-neg' : ''}">${U.money(U.sum(vencidas, 'valor'))}</div><div class="kpi-sub">${vencidas.length} conta(s)</div></div>
    </div>
    <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="flex gap-2 flex-wrap">
        ${btnFiltro('abertas', 'Em aberto')}${btnFiltro('pendentes', 'Aguardando aprovação')}${btnFiltro('apagar', 'A pagar')}${btnFiltro('pagas', 'Pagas')}${btnFiltro('todas', 'Todas')}
      </div>
      <button class="btn btn-primary" onclick="Views.contaForm()">+ Nova conta</button>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th><th>Origem</th><th>Status</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(c => `
            <tr>
              <td class="${c.status === 'aprovada' && c.vencimento < hoje ? 'text-red-700 font-semibold' : ''}">${U.formatDate(c.vencimento)}</td>
              <td>${U.esc(c.fornecedor)}</td>
              <td class="text-stone-500">${U.esc(c.descricao || '')}${c.temAnexo ? ` <button class="btn btn-icon" title="Ver foto" onclick="Views.contaAnexo('${c.id}')">📷</button>` : ''}</td>
              <td class="text-xs text-stone-500">${c.origem === 'campo' ? 'Vaqueiro' : 'ERP'}</td>
              <td>${Views._contaStatus(c)}</td>
              <td class="text-right">${U.money(c.valor)}</td>
              <td class="whitespace-nowrap text-right">
                ${c.status === 'pendente' ? `
                  <button class="btn btn-sm btn-primary" onclick="Views.contaAprovar('${c.id}')">Aprovar</button>
                  <button class="btn btn-sm btn-secondary" onclick="Views.contaRejeitar('${c.id}')">Rejeitar</button>` : ''}
                ${c.status === 'aprovada' ? `<button class="btn btn-sm btn-primary" onclick="Views.contaPagar('${c.id}')">Marcar paga</button>` : ''}
                ${c.despesaId ? `<a class="btn btn-sm btn-secondary" href="#/despesas" onclick="setTimeout(()=>Views.despesaForm('${c.despesaId}'),50)">Despesa</a>` : ''}
                ${c.status !== 'pendente' && !c.despesaId ? `<button class="btn btn-icon" title="Excluir" onclick="Views.contaDelete('${c.id}')">×</button>` : ''}
                ${c.status === 'pendente' ? `<button class="btn btn-icon" title="Editar" onclick="Views.contaForm('${c.id}')">✎</button>` : ''}
              </td>
            </tr>`).join('') || `<tr><td colspan="7" class="text-center text-stone-500 py-8">Nenhuma conta neste filtro</td></tr>`}
        </tbody>
      </table>
    </div>
    <p class="text-xs text-stone-500 mt-3">Contas lançadas pelo vaqueiro chegam como <b>Aguardando aprovação</b>. Ao aprovar, a conta vira uma despesa operacional (entra no rateio) e fica <b>A pagar</b> até ser marcada como paga.</p>
  `;
};

Views.contaForm = function (id) {
  const c = id ? DB.contas.get(id) : null;
  U.modal(c ? 'Editar conta' : 'Nova conta a pagar', `
    <form id="form-conta" class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label class="field-label">Fornecedor *</label><input class="input" name="fornecedor" value="${U.esc(c?.fornecedor || '')}" required /></div>
      <div><label class="field-label">Valor (R$) *</label><input class="input" name="valor" type="number" step="0.01" value="${c?.valor || ''}" required /></div>
      <div><label class="field-label">Vencimento *</label><input class="input" name="vencimento" type="date" value="${c?.vencimento || U.todayISO()}" required /></div>
      <div class="col-span-2"><label class="field-label">Descrição</label><textarea class="textarea" name="descricao" rows="2">${U.esc(c?.descricao || '')}</textarea></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200 mt-2">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-conta').addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.valor = parseFloat(fd.valor) || 0;
      if (c) DB.contas.update(id, fd);
      else DB.contas.add(fd);
      U.closeModal();
      U.toast('Conta salva', 'success');
      App.render();
    });
  });
};

// Aprovar = criar a despesa operacional (com rateio) e deixar a conta "a pagar"
Views.contaAprovar = function (id) {
  const c = DB.contas.get(id);
  if (!c) return;
  const lotes = DB.lotes.list();
  const texto = `${c.fornecedor} ${c.descricao}`.toLowerCase();
  const catSugerida = CATEGORIAS_DESPESA.find(cat => cat !== 'Outros' && texto.includes(cat.toLowerCase().slice(0, 5))) || 'Outros';
  U.modal('Aprovar conta', `
    <div class="mb-4 text-sm bg-stone-50 border border-stone-200 rounded p-3">
      <div class="font-semibold">${U.esc(c.fornecedor)} — ${U.money(c.valor)}</div>
      <div class="text-stone-500">Vence ${U.formatDate(c.vencimento)}${c.descricao ? ' · ' + U.esc(c.descricao) : ''}</div>
      ${c.temAnexo ? `<button type="button" class="btn btn-sm btn-secondary mt-2" onclick="Views.contaAnexo('${c.id}', true)">📷 Ver foto</button><div id="anexo-inline" class="mt-2"></div>` : ''}
    </div>
    <form id="form-aprovar" class="grid grid-cols-2 gap-3">
      <div><label class="field-label">Valor (R$)</label><input class="input" name="valor" type="number" step="0.01" value="${c.valor}" required /></div>
      <div><label class="field-label">Data da despesa</label><input class="input" name="data" type="date" value="${c.vencimento}" required /></div>
      <div><label class="field-label">Categoria</label>
        <select class="select" name="categoria">${CATEGORIAS_DESPESA.map(x => `<option ${x === catSugerida ? 'selected' : ''}>${x}</option>`).join('')}</select>
      </div>
      <div><label class="field-label">Rateio</label>
        <select class="select" name="rateioTipo">
          <option value="peso">Proporcional ao peso</option>
          <option value="igual">Igual por cabeça</option>
        </select>
      </div>
      <div><label class="field-label">Escopo</label>
        <select class="select" name="rateioEscopo" id="ap-escopo">
          <option value="todos">Todos os ativos</option>
          ${lotes.length ? '<option value="lote">Um lote</option>' : ''}
        </select>
      </div>
      <div id="ap-lote-wrap" class="hidden"><label class="field-label">Lote</label>
        <select class="select" name="loteId">${lotes.map(l => `<option value="${l.id}">${U.esc(l.nome)}</option>`).join('')}</select>
      </div>
      <div class="col-span-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" name="jaPaga" /> Já está paga</label></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200 mt-2">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Aprovar e lançar despesa</button>
      </div>
    </form>
  `, body => {
    const escopo = body.querySelector('#ap-escopo');
    escopo.addEventListener('change', () => body.querySelector('#ap-lote-wrap').classList.toggle('hidden', escopo.value !== 'lote'));
    body.querySelector('#form-aprovar').addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      const valor = parseFloat(fd.valor) || 0;
      const despesa = DB.despesas.add({
        data: fd.data,
        fornecedor: c.fornecedor,
        categoria: fd.categoria,
        valor,
        rateioTipo: fd.rateioTipo,
        rateioEscopo: fd.rateioEscopo,
        loteId: fd.rateioEscopo === 'lote' ? fd.loteId : null,
        observacoes: [c.descricao, c.origem === 'campo' ? '(lançado pelo vaqueiro)' : ''].filter(Boolean).join(' '),
        contaId: c.id,
      });
      DB.contas.update(c.id, {
        valor,
        status: fd.jaPaga ? 'paga' : 'aprovada',
        dataPagamento: fd.jaPaga ? U.todayISO() : null,
        despesaId: despesa.id,
      });
      U.closeModal();
      U.toast('Conta aprovada e lançada em despesas', 'success');
      App.render();
    });
  });
};

Views.contaPagar = function (id) {
  const c = DB.contas.get(id);
  if (!c) return;
  U.modal('Marcar como paga', `
    <form id="form-pagar" class="space-y-3">
      <div class="text-sm">${U.esc(c.fornecedor)} — <b>${U.money(c.valor)}</b> (vence ${U.formatDate(c.vencimento)})</div>
      <div><label class="field-label">Data do pagamento</label><input class="input" name="dataPagamento" type="date" value="${U.todayISO()}" required /></div>
      <div class="flex justify-end gap-2 pt-2 border-t border-stone-200">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Confirmar pagamento</button>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-pagar').addEventListener('submit', e => {
      e.preventDefault();
      DB.contas.update(id, { status: 'paga', dataPagamento: new FormData(e.target).get('dataPagamento') });
      U.closeModal();
      U.toast('Conta paga', 'success');
      App.render();
    });
  });
};

Views.contaRejeitar = function (id) {
  if (!U.confirm('Rejeitar esta conta? Ela não vira despesa.')) return;
  DB.contas.update(id, { status: 'rejeitada' });
  U.toast('Conta rejeitada');
  App.render();
};

Views.contaDelete = function (id) {
  if (!U.confirm('Excluir esta conta?')) return;
  DB.contas.remove(id);
  U.toast('Conta excluída');
  App.render();
};

Views.contaAnexo = async function (id, inline) {
  try {
    const src = await DB.anexoCampo(id);
    const img = `<img src="${src}" alt="Foto do boleto/nota" class="w-full rounded border border-stone-200" />`;
    const alvo = inline && document.getElementById('anexo-inline');
    if (alvo) alvo.innerHTML = img;
    else U.modal('Foto do boleto / nota', img + `<div class="mt-3 text-right"><a class="btn btn-secondary" href="${src}" download="boleto-${id}.jpg">Baixar</a></div>`);
  } catch (e) {
    U.toast('Foto não encontrada', 'error');
  }
};

// ===========================================================================
// RAÇÃO & ESTOQUE
// ===========================================================================
Views.racao = function () {
  const est = DB.racao.estoque();
  const lotes = DB.lotes.list();
  const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const consumos30 = DB.racao.consumos().filter(c => c.data > trintaDias);

  // consumo por lote nos últimos 30 dias (kg/cab/dia usando cabeças atuais do lote)
  const porLote = U.groupBy(consumos30, c => c.loteId || '__todos__');
  const linhasLote = Object.entries(porLote).map(([loteId, cs]) => {
    const lote = loteId === '__todos__' ? null : DB.lotes.get(loteId);
    const cab = lote ? DB.bovinos.porLote(loteId).length : DB.bovinos.ativos().length;
    const kg = U.sum(cs, 'kg');
    const dias = new Set(cs.map(c => c.data)).size;
    return { nome: lote ? lote.nome : 'Todos os lotes', cab, kg, dias, kgCabDia: cab && dias ? kg / cab / dias : null };
  }).sort((a, b) => b.kg - a.kg);

  const movs = [
    ...DB.racao.entradas().map(e => ({ ...e, mov: 'entrada' })),
    ...DB.racao.consumos().map(c => ({ ...c, mov: 'consumo' })),
  ].sort((a, b) => b.data.localeCompare(a.data) || String(b.lancadoEm || '').localeCompare(String(a.lancadoEm || ''))).slice(0, 200);

  return `
    <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="text-sm text-stone-500">Estoque = entradas − consumos lançados. Autonomia pela média dos últimos 7 dias.</div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="Views.racaoForm('entrada')">+ Entrada de ração</button>
        <button class="btn btn-primary" onclick="Views.racaoForm('consumo')">+ Consumo</button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${est.map(e => {
        const alerta = e.saldo < 0 ? 'text-money-neg' : (e.dias !== null && e.dias <= 7 ? 'text-amber-700' : '');
        return `<div class="kpi-card">
          <div class="kpi-label">${U.esc(e.tipo)}</div>
          <div class="kpi-value ${alerta}">${U.num(e.saldo, 0)} kg</div>
          <div class="kpi-sub">${e.consumoDia > 0 ? `${U.num(e.consumoDia, 0)} kg/dia · ${e.saldo > 0 ? '~' + U.num(e.dias, 0) + ' dias' : 'sem estoque'}` : 'sem consumo nos últimos 7 dias'}</div>
        </div>`;
      }).join('') || '<div class="kpi-card col-span-2 lg:col-span-4 text-sm text-stone-500">Nenhuma ração lançada ainda. O vaqueiro lança entradas e consumo pela tela de campo (<a class="underline" href="/campo/" target="_blank">/campo</a>).</div>'}
    </div>

    <div class="card p-0 mb-6">
      <div class="px-5 pt-4 card-title">Consumo por lote — últimos 30 dias</div>
      <table class="table">
        <thead><tr><th>Lote</th><th class="text-right">Cabeças</th><th class="text-right">Dias com trato</th><th class="text-right">Total (kg)</th><th class="text-right">kg/cab/dia</th></tr></thead>
        <tbody>
          ${linhasLote.map(l => `<tr><td>${U.esc(l.nome)}</td><td class="text-right">${l.cab}</td><td class="text-right">${l.dias}</td><td class="text-right">${U.num(l.kg, 0)}</td><td class="text-right">${l.kgCabDia !== null ? U.num(l.kgCabDia, 2) : '—'}</td></tr>`).join('')
            || '<tr><td colspan="5" class="text-center text-stone-500 py-6">Sem consumo nos últimos 30 dias</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="card p-0">
      <div class="px-5 pt-4 card-title">Movimentações</div>
      <table class="table">
        <thead><tr><th>Data</th><th>Tipo</th><th>Ração</th><th>Lote / Fornecedor</th><th class="text-right">kg</th><th>Origem</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          ${movs.map(m => `<tr>
            <td>${U.formatDate(m.data)}</td>
            <td>${m.mov === 'entrada' ? '<span class="badge badge-green">Entrada</span>' : '<span class="badge badge-amber">Consumo</span>'}</td>
            <td>${U.esc(m.tipo)}</td>
            <td class="text-stone-500">${m.mov === 'entrada' ? U.esc(m.fornecedor || '—') : U.esc(m.loteId ? (DB.lotes.get(m.loteId)?.nome || '?') : 'Todos')}</td>
            <td class="text-right ${m.mov === 'consumo' ? 'text-money-neg' : 'text-money-pos'}">${m.mov === 'consumo' ? '−' : '+'}${U.num(m.kg, 0)}</td>
            <td class="text-xs text-stone-500">${m.origem === 'campo' ? 'Vaqueiro' : 'ERP'}</td>
            <td class="text-stone-500">${U.esc(m.observacoes || '')}</td>
            <td><button class="btn btn-icon" onclick="Views.racaoDelete('${m.id}')">×</button></td>
          </tr>`).join('') || '<tr><td colspan="8" class="text-center text-stone-500 py-6">Nenhuma movimentação</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
};

Views.racaoForm = function (mov) {
  const entrada = mov === 'entrada';
  const tipos = DB.racao.tipos();
  const lotes = DB.lotes.list();
  U.modal(entrada ? 'Entrada de ração' : 'Consumo de ração', `
    <form id="form-racao" class="grid grid-cols-2 gap-3">
      <div class="col-span-2"><label class="field-label">Ração *</label>
        <input class="input" name="tipo" list="racao-tipos" required />
        <datalist id="racao-tipos">${tipos.map(t => `<option value="${U.esc(t)}"></option>`).join('')}</datalist>
      </div>
      <div><label class="field-label">Quantidade (kg) *</label><input class="input" name="kg" type="number" step="0.1" required /></div>
      <div><label class="field-label">Data *</label><input class="input" name="data" type="date" value="${U.todayISO()}" required /></div>
      ${entrada
        ? `<div class="col-span-2"><label class="field-label">Fornecedor</label><input class="input" name="fornecedor" /></div>`
        : `<div class="col-span-2"><label class="field-label">Lote</label><select class="select" name="loteId"><option value="">Todos os lotes</option>${lotes.map(l => `<option value="${l.id}">${U.esc(l.nome)}</option>`).join('')}</select></div>`}
      <div class="col-span-2"><label class="field-label">Observações</label><textarea class="textarea" name="observacoes" rows="2"></textarea></div>
      <div class="col-span-2 flex justify-end gap-2 pt-2 border-t border-stone-200 mt-2">
        <button type="button" class="btn btn-secondary" onclick="U.closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, body => {
    body.querySelector('#form-racao').addEventListener('submit', e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.kg = parseFloat(fd.kg) || 0;
      fd.tipo = fd.tipo.trim();
      if (entrada) DB.racao.addEntrada(fd);
      else DB.racao.addConsumo({ ...fd, loteId: fd.loteId || null });
      U.closeModal();
      U.toast('Lançamento salvo', 'success');
      App.render();
    });
  });
};

Views.racaoDelete = function (id) {
  if (!U.confirm('Excluir esta movimentação de ração?')) return;
  DB.racao.remove(id);
  U.toast('Movimentação excluída');
  App.render();
};

// ===========================================================================
// DRE DA FAZENDA
// ===========================================================================
Views._dre = { ano: null, lote: 'todos', colunas: 'meses' };

Views.dreSet = function (k, v) { Views._dre[k] = v; App.render(); };

// Distribui uma despesa entre lotes: { loteId|'sem': valor }
Views._dreDespesaPorLote = function (d) {
  if (d.rateioEscopo === 'lote' && d.loteId) return { [d.loteId]: d.valor || 0 };
  const out = {}; let alocado = 0;
  const r = DB.rateio.calcular(d);
  Object.entries(r).forEach(([bid, v]) => {
    const k = DB.bovinos.get(bid)?.loteId || 'sem';
    out[k] = (out[k] || 0) + v; alocado += v;
  });
  const resto = (d.valor || 0) - alocado;
  if (Math.abs(resto) > 0.005) out.sem = (out.sem || 0) + resto;
  return out;
};

Views.dre = function () {
  const st = Views._dre;
  const anos = new Set([new Date().getFullYear()]);
  [...DB.despesas.list(), ...DB.vendas.list(), ...DB.investimentos.list()].forEach(x => x.data && anos.add(+x.data.slice(0, 4)));
  DB.bovinos.list().forEach(b => { b.dataEntrada && anos.add(+b.dataEntrada.slice(0, 4)); b.dataSaida && anos.add(+b.dataSaida.slice(0, 4)); });
  const listaAnos = [...anos].sort((a, b) => b - a);
  if (!st.ano || !anos.has(st.ano)) st.ano = listaAnos.find(a => DB.despesas.list().some(d => d.data?.startsWith(String(a)))) || listaAnos[0];
  const ano = String(st.ano);
  const lotes = DB.lotes.list();
  const nomeLote = id => id === 'sem' ? 'Sem lote' : (lotes.find(l => l.id === id)?.nome || '—');
  const rotLote = l => /^lote/i.test(l.nome) ? l.nome : 'Lote ' + l.nome;
  const porLotes = st.colunas === 'lotes';
  const filtroLote = porLotes ? 'todos' : st.lote;
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const noAno = iso => iso && iso.startsWith(ano);

  // linhas: { chave: { colKey: valor } }
  const L = {};
  const add = (linha, data, loteId, v) => {
    if (!v || !noAno(data)) return;
    if (filtroLote !== 'todos' && loteId !== filtroLote) return;
    const col = porLotes ? (loteId || 'sem') : data.slice(5, 7);
    L[linha] = L[linha] || {};
    L[linha][col] = (L[linha][col] || 0) + v;
  };

  // Receita e custo do gado vendido
  DB.bovinos.list().forEach(b => {
    if (b.status === 'vendido' && b.dataSaida) {
      add('receita', b.dataSaida, b.loteId || 'sem', b.receitaSaida || 0);
    }
    add('compraGado', b.dataEntrada, b.loteId || 'sem', b.custoEntrada || 0);
  });
  // vendas lançadas sem animais cadastrados (ex.: lote vendido antes de entrar no app)
  DB.vendas.list().filter(v => !v.bovinoIds?.length && v.tipo !== 'outra').forEach(v => {
    add('receita', v.data, v.loteId || 'sem', v.valorTotal || 0);
  });

  // Outras receitas (não são de gado): sem lote
  DB.vendas.list().filter(v => v.tipo === 'outra').forEach(v => {
    if (filtroLote !== 'todos' || !noAno(v.data)) return;
    const col = porLotes ? 'fazenda' : v.data.slice(5, 7);
    L.outras = L.outras || {}; L.outras[col] = (L.outras[col] || 0) + (v.valorTotal || 0);
  });

  // Despesas por categoria (depreciação separada)
  const isDep = d => /deprecia/i.test(`${d.fornecedor} ${d.categoria}`);
  const catsDesp = new Set();
  DB.despesas.list().forEach(d => {
    const linha = isDep(d) ? 'dep' : 'desp:' + (d.categoria || 'Outros');
    if (!isDep(d)) catsDesp.add(d.categoria || 'Outros');
    Object.entries(Views._dreDespesaPorLote(d)).forEach(([lid, v]) => add(linha, d.data, lid, v));
  });

  // Investimentos (CAPEX) por categoria. Só têm lote quando são cabeças de gado
  // tratadas como investimento (abateCompraGado): saem da compra de gado da DRE.
  const catsInv = new Set();
  DB.investimentos.list().forEach(i => {
    if (filtroLote !== 'todos' && !porLotes && i.loteId !== filtroLote) return;
    if (!noAno(i.data)) return;
    if (i.abateCompraGado) add('compraGado', i.data, i.loteId || 'sem', -(i.valor || 0));
    catsInv.add(i.categoria || 'Outros');
    const col = porLotes ? (i.loteId || 'fazenda') : i.data.slice(5, 7);
    const k = 'inv:' + (i.categoria || 'Outros');
    L[k] = L[k] || {}; L[k][col] = (L[k][col] || 0) + (i.valor || 0);
  });

  // colunas
  let cols;
  if (porLotes) {
    const usados = new Set();
    Object.values(L).forEach(o => Object.keys(o).forEach(k => usados.add(k)));
    cols = lotes.filter(l => usados.has(l.id)).map(l => ({ key: l.id, label: rotLote(l) }));
    if (usados.has('sem')) cols.push({ key: 'sem', label: 'Sem lote' });
    if (usados.has('fazenda')) cols.push({ key: 'fazenda', label: 'Fazenda (geral)' });
  } else {
    cols = MESES.map((m, i) => ({ key: String(i + 1).padStart(2, '0'), label: m }));
  }

  const soma = (...chaves) => {
    const o = {};
    chaves.forEach(([k, sinal]) => Object.entries(L[k] || {}).forEach(([c, v]) => { o[c] = (o[c] || 0) + sinal * v; }));
    return o;
  };
  const tot = o => Object.values(o || {}).reduce((s, v) => s + v, 0);
  const cats = [...catsDesp].sort((a, b) => tot(L['desp:' + b]) - tot(L['desp:' + a]));
  const despTotal = soma(...cats.map(c => ['desp:' + c, 1]));
  const receita = L.receita || {};
  const margemBruta = soma(['receita', 1], ['compraGado', -1]);
  const ebitda = soma(['receita', 1], ['compraGado', -1], ...cats.map(c => ['desp:' + c, -1]));
  const resultado = soma(['receita', 1], ['compraGado', -1], ...cats.map(c => ['desp:' + c, -1]), ['outras', 1], ['dep', -1]);
  const invCats = [...catsInv].sort((a, b) => tot(L['inv:' + b]) - tot(L['inv:' + a]));
  const capex = soma(...invCats.map(c => ['inv:' + c, 1]));
  const totalInvestido = capex;

  const fmt = (v, neg) => {
    if (!v || Math.abs(v) < 0.005) return '<span class="text-stone-300">—</span>';
    const s = U.money(Math.abs(v)).replace('R$', '').trim();
    return (neg || v < 0) ? `(${s})` : s;
  };
  const cls = v => v > 0.005 ? 'text-money-pos' : v < -0.005 ? 'text-money-neg' : '';
  const row = (label, o, opt = {}) => {
    const t = tot(o);
    const corTotal = opt.resultado ? cls(t) : '';
    return `<tr class="${opt.strong ? 'font-semibold bg-stone-50' : ''} ${opt.sub ? 'text-stone-600' : ''}">
      <td class="whitespace-nowrap sticky left-0 bg-white ${opt.strong ? '!bg-stone-50' : ''} ${opt.sub ? 'pl-6' : ''}">${label}</td>
      ${cols.map(c => `<td class="text-right whitespace-nowrap tabular-nums ${opt.resultado ? cls((o || {})[c.key]) : ''}">${fmt((o || {})[c.key], opt.neg)}</td>`).join('')}
      <td class="text-right whitespace-nowrap tabular-nums font-semibold ${corTotal}">${fmt(t, opt.neg)}</td>
      ${opt.pct === false ? '<td></td>' : `<td class="text-right text-xs text-stone-500 tabular-nums">${tot(receita) ? U.num((t / tot(receita)) * 100, 1) + '%' : ''}</td>`}
    </tr>`;
  };
  const head = `<thead><tr><th class="sticky left-0 bg-white">R$</th>${cols.map(c => `<th class="text-right">${c.label}</th>`).join('')}<th class="text-right">Total ${ano}</th><th class="text-right">% rec.</th></tr></thead>`;
  const sel = (k, opts) => `<select class="select !w-auto" onchange="Views.dreSet('${k}', ${k === 'ano' ? '+this.value' : 'this.value'})">${opts.map(([v, l]) => `<option value="${v}" ${String(st[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

  // rebanho em estoque no fim do período
  const fimAno = ano + '-12-31';
  const emEstoque = DB.bovinos.list().filter(b => b.dataEntrada <= fimAno && (!b.dataSaida || b.dataSaida > fimAno))
    .filter(b => filtroLote === 'todos' || b.loteId === filtroLote);
  const estoqueEntrada = U.sum(emEstoque, b => b.custoEntrada || 0);
  const estoqueOper = U.sum(emEstoque, b => DB.rateio.custoOperacionalBovino(b.id));

  const kpi = (label, v, sub, cor = true) => `<div class="kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value whitespace-nowrap ${cor ? cls(v) : ''}">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

  return `
    <div class="flex flex-wrap items-center gap-2 mb-4">
      ${sel('ano', listaAnos.map(a => [a, a]))}
      ${sel('colunas', [['meses', 'Colunas: meses'], ['lotes', 'Colunas: lotes']])}
      ${porLotes ? '' : sel('lote', [['todos', 'Todos os lotes'], ...lotes.map(l => [l.id, rotLote(l)])])}
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      ${kpi('Receita de vendas', tot(receita), 'gado vendido no período')}
      ${kpi('Despesas operacionais', -tot(despTotal) - tot(L.dep), 'inclui depreciação')}
      ${kpi('Resultado do período', tot(resultado), 'gado − compra − despesas + outras receitas')}
      ${kpi('Investido no período', tot(totalInvestido), 'CAPEX: máquinas, benfeitorias, pasto', false)}
    </div>

    <div class="card p-0 mb-4">
      <div class="card-title px-4 pt-4">DRE ${ano}${filtroLote !== 'todos' ? ' — ' + U.esc(rotLote({ nome: nomeLote(filtroLote) })) : ''}</div>
      <div class="overflow-x-auto">
        <table class="table text-sm">
          ${head}
          <tbody>
            ${row('(+) Receita bruta de vendas de gado', receita)}
            ${row('(−) Compra de gado no período', L.compraGado, { neg: true })}
            ${row('= Margem bruta', margemBruta, { strong: true, resultado: true })}
            ${row('(−) Despesas operacionais', despTotal, { neg: true })}
            ${cats.map(c => row(U.esc(c), L['desp:' + c], { neg: true, sub: true })).join('')}
            ${row('= Resultado operacional (EBITDA)', ebitda, { strong: true, resultado: true })}
            ${row('(+) Outras receitas (não são de gado)', L.outras)}
            ${row('(−) Depreciação', L.dep, { neg: true })}
            ${row('= Resultado do período', resultado, { strong: true, resultado: true })}
          </tbody>
        </table>
      </div>
      <div class="text-xs text-stone-500 px-4 pb-4 pt-2 space-y-1">
        <div>Despesas entram no mês da data do lançamento e no lote conforme o rateio de cada despesa. A compra de gado entra como custo no mês e no lote da entrada dos animais (custo de entrada de cada animal).</div>
        <div>Depreciação = despesas com "depreciação" no fornecedor ou categoria. Outras receitas não têm lote${porLotes ? ' (coluna "Fazenda (geral)")' : filtroLote !== 'todos' ? ' e ficam fora com lote filtrado' : ''}; % rec. é sobre a receita de gado. Obras da sede não fazem parte do app.</div>
      </div>
    </div>

    <div class="card p-0 mb-4">
      <div class="card-title px-4 pt-4">Investimentos no período</div>
      <div class="overflow-x-auto">
        <table class="table text-sm">
          ${head.replace('% rec.', '')}
          <tbody>
            ${row('CAPEX — máquinas, benfeitorias, pasto', capex, { pct: false })}
            ${invCats.map(c => row(U.esc(c), L['inv:' + c], { sub: true, pct: false })).join('')}
            ${row('= Total investido', totalInvestido, { strong: true, pct: false })}
          </tbody>
        </table>
      </div>
      <div class="text-xs text-stone-500 px-4 pb-4 pt-2">
        ${porLotes ? 'CAPEX não tem lote: aparece na coluna "Fazenda (geral)". ' : filtroLote !== 'todos' ? 'CAPEX não tem lote e fica fora quando um lote está filtrado. ' : ''}A compra de gado está na DRE, como custo, exceto as cabeças lançadas como investimento em gado (saem da compra do lote). Os investimentos não entram no resultado; o trator entra na DRE só pela depreciação.
        ${DB.investimentos.list().filter(i => noAno(i.data)).length ? '' : ' <strong>Nenhum investimento (CAPEX) lançado em ' + ano + '.</strong> <a class="underline" href="#/investimentos">Lançar investimentos</a>'}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      ${kpi('Rebanho em estoque (fim de ' + ano + ')', estoqueEntrada + estoqueOper, `${emEstoque.length} cabeças`, false)}
      ${kpi('Custo de compra em estoque', estoqueEntrada, 'custo de entrada dos animais no rebanho', false)}
      ${kpi('Custo operacional já alocado', estoqueOper, 'despesas atribuídas a esses animais (todos os anos)', false)}
    </div>
  `;
};
