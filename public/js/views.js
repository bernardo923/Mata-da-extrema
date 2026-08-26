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

  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Cabeças ativas</div><div class="kpi-value">${totalCabecas}</div><div class="kpi-sub">${semLote > 0 ? `<a href="#/bovinos" onclick="sessionStorage.setItem('filtro_lote','__semlote__');sessionStorage.setItem('filtro_status','ativo');" class="text-amber-700 underline">${semLote} sem lote</a> · ${totalCabecas - semLote} em lotes` : 'No plantel'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Peso total</div><div class="kpi-value">${U.num(pesoTotal, 0)} kg</div><div class="kpi-sub">${U.num(U.kgToArroba(pesoTotal), 1)} @ carcaça</div></div>
      <div class="kpi-card"><div class="kpi-label">Peso médio</div><div class="kpi-value">${U.num(pesoMedio, 0)} kg</div><div class="kpi-sub">${U.num(arrobaMedia, 2)} @ por cabeça</div></div>
      <div class="kpi-card"><div class="kpi-label">GMD médio</div><div class="kpi-value">${U.num(gmdMedio, 3)} kg/dia</div><div class="kpi-sub">Ganho médio diário</div></div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="kpi-card"><div class="kpi-label">Tempo médio na fazenda</div><div class="kpi-value">${U.num(tempoMedio, 0)} dias</div><div class="kpi-sub">${U.num(tempoMedio / 30, 1)} meses</div></div>
      <div class="kpi-card"><div class="kpi-label">Unidades animais (UA)</div><div class="kpi-value">${U.num(ua, 1)}</div><div class="kpi-sub">1 UA = ${pesoUA} kg peso vivo</div></div>
      <div class="kpi-card">
        <div class="kpi-label">UA / hectare</div>
        <div class="kpi-value">${uaPorHa !== null ? U.num(uaPorHa, 2) : '—'}</div>
        <div class="kpi-sub">${areaPasto > 0 ? `${U.num(areaPasto, 1)} ha de pasto` : 'Configure área em <a href="#/config" class="underline">Configurações</a>'}</div>
      </div>
      <div class="kpi-card"><div class="kpi-label">Lotes ativos</div><div class="kpi-value">${DB.lotes.list().length}</div><div class="kpi-sub">Agrupamento de manejo</div></div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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

    <div class="card p-0 overflow-hidden">
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

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
                <td>${U.esc(p.observacoes || '')}</td>
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
Views.despesas = function () {
  const lista = [...DB.despesas.list()].sort((a, b) => b.data.localeCompare(a.data));
  return `
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-stone-500">${lista.length} despesa(s) — total ${U.money(U.sum(lista, 'valor'))}</div>
      <button class="btn btn-primary" onclick="Views.despesaForm()">+ Nova despesa</button>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Data</th><th>Fornecedor</th><th>Categoria</th><th>Rateio</th><th>Escopo</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(d => {
            const lote = d.loteId ? DB.lotes.get(d.loteId)?.nome : '';
            const escopo = d.rateioEscopo === 'lote' ? `Lote: ${U.esc(lote || '?')}` : (d.rateioEscopo === 'manual' ? 'Manual' : 'Todos ativos');
            return `
              <tr class="clickable" onclick="Views.despesaForm('${d.id}')">
                <td>${U.formatDate(d.data)}</td>
                <td>${U.esc(d.fornecedor)}</td>
                <td><span class="badge">${U.esc(d.categoria)}</span></td>
                <td>${U.esc(d.rateioTipo)}</td>
                <td class="text-stone-500 text-xs">${escopo}</td>
                <td class="text-right text-money-neg">${U.money(d.valor)}</td>
                <td onclick="event.stopPropagation()"><button class="btn btn-icon" onclick="Views.despesaDelete('${d.id}')">×</button></td>
              </tr>
            `;
          }).join('') || `<tr><td colspan="7" class="text-center text-stone-500 py-8">Nenhuma despesa registrada</td></tr>`}
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
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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
      <button class="btn btn-primary" onclick="Views.vendaForm()">+ Nova venda</button>
    </div>
    <div class="card p-0">
      <table class="table">
        <thead><tr><th>Data</th><th>Comprador</th><th class="text-right">Cabeças</th><th class="text-right">Peso total (kg)</th><th class="text-right">@ total</th><th class="text-right">Preço @</th><th class="text-right">Valor</th><th></th></tr></thead>
        <tbody>
          ${lista.map(v => `
            <tr>
              <td>${U.formatDate(v.data)}</td>
              <td>${U.esc(v.comprador)}</td>
              <td class="text-right">${v.bovinoIds.length}</td>
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
          html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">';
          html += '<div class="kpi-card"><div class="kpi-label">Receita estimada</div><div class="kpi-value text-money-pos">' + U.money(totReceita) + '</div><div class="kpi-sub">' + U.num(totArrobas, 1) + ' @ a ' + U.money(preco) + '</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Custo total</div><div class="kpi-value text-money-neg">' + U.money(totCusto) + '</div><div class="kpi-sub">' + bovinos.length + ' cabeça(s)</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Margem total</div><div class="kpi-value ' + (totMargem >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.money(totMargem) + '</div><div class="kpi-sub">ROI ' + U.num(roiMedio, 1) + '%</div></div>';
          html += '<div class="kpi-card"><div class="kpi-label">Margem média/cabeça</div><div class="kpi-value ' + (margemMedia >= 0 ? 'text-money-pos' : 'text-money-neg') + '">' + U.money(margemMedia) + '</div><div class="kpi-sub">Breakeven: ' + U.money(breakeven) + '/@</div></div>';
          html += '</div>';

          html += '<div class="card p-0 mt-4"><div class="px-4 pt-4 card-title">Detalhe por bovino</div>';
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
          html += '</tbody></table></div>';

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
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
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
