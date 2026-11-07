// ===== Tela de campo (vaqueiro) =====
// Tudo que é lançado vai primeiro para uma fila no celular e é enviado quando houver sinal.
// O servidor ignora reenvios (o id é gerado aqui), então reenviar nunca duplica.

const K = {
  token: 'campo_token',
  ref: 'campo_ref_v1',
  fila: 'campo_fila_v1',
  kgSaco: 'campo_kg_saco',
  teclado: 'campo_teclado',
};

const C = {
  ref: null,
  fila: [],
  online: navigator.onLine,
  enviando: false,

  // ---------- util ----------
  uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },
  hoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  data(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return iso.slice(0, 10) === C.hoje() ? 'hoje' : `${d}/${m}${y === String(new Date().getFullYear()) ? '' : '/' + y}`;
  },
  kg(v) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v || 0) + ' kg'; },
  dinheiro(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0); },
  num(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').trim().replace(/\s/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  ler(k, padrao) {
    try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; }
  },
  gravar(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  },
  aviso(msg, tipo = '') {
    const el = document.getElementById('aviso');
    el.textContent = msg;
    el.className = 'aviso ' + tipo;
    el.hidden = false;
    clearTimeout(C._avisoT);
    C._avisoT = setTimeout(() => { el.hidden = true; }, tipo === 'erro' ? 5000 : 2600);
  },
  vibrar() { try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} },

  // ---------- rede ----------
  token() { return localStorage.getItem(K.token); },
  async api(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + C.token() };
    const r = await fetch(url, { ...opts, headers });
    if (r.status === 401) {
      localStorage.removeItem(K.token);
      C.mostrarLogin();
      throw Object.assign(new Error('sem acesso'), { status: 401 });
    }
    if (!r.ok) throw new Error('erro ' + r.status);
    return r.json();
  },

  async atualizarRef() {
    try {
      const ref = await C.api('/api/campo/ref');
      C.ref = ref;
      C.gravar(K.ref, ref);
      C.online = true;
    } catch (e) {
      if (e.status !== 401) C.online = false;
    }
    C.status();
  },

  salvarFila() {
    const ok = C.gravar(K.fila, C.fila);
    if (!ok) C.aviso('Memória do celular cheia. Conecte à internet para enviar os lançamentos.', 'erro');
    return ok;
  },

  enfileirar(tipo, payload, anexo) {
    const item = { id: C.uid(), tipo, payload, criadoEm: new Date().toISOString() };
    if (anexo) item.anexo = anexo;
    C.fila.push(item);
    if (!C.salvarFila()) {
      // sem espaço: tenta guardar sem a foto
      if (anexo) {
        delete item.anexo;
        item.payload.semFoto = true;
        if (C.salvarFila()) C.aviso('Salvo SEM a foto (memória cheia).', 'erro');
      }
    }
    C.status();
    C.enviar();
    return item;
  },

  async enviar() {
    if (C.enviando || !C.fila.length || !C.token()) return;
    C.enviando = true;
    C.status();
    try {
      // envia em pacotes pequenos (fotos pesam)
      while (C.fila.some(f => !f.erro)) {
        const pacote = C.fila.filter(f => !f.erro).slice(0, 8);
        const r = await C.api('/api/campo/lancamentos', {
          method: 'POST',
          body: JSON.stringify({ lancamentos: pacote.map(({ id, tipo, payload, anexo }) => ({ id, tipo, payload, anexo })) }),
        });
        const aceitos = new Set(r.aceitos || []);
        const rejeit = {};
        (r.rejeitados || []).forEach(x => { if (x.id) rejeit[x.id] = x.error; });
        C.fila = C.fila.filter(f => !aceitos.has(f.id));
        C.fila.forEach(f => { if (rejeit[f.id]) f.erro = rejeit[f.id]; });
        C.salvarFila();
        if (!aceitos.size && !Object.keys(rejeit).length) break;
      }
      C.online = true;
      await C.atualizarRef();
    } catch (e) {
      if (e.status !== 401) C.online = false;
    } finally {
      C.enviando = false;
      C.status();
      if (C.rota().tela === '') C.render();
    }
  },

  status() {
    const el = document.getElementById('status');
    const n = C.fila.filter(f => !f.erro).length;
    const erros = C.fila.filter(f => f.erro).length;
    if (!C.online || !navigator.onLine) {
      el.textContent = n ? `Sem sinal · ${n} no celular` : 'Sem sinal';
      el.className = 'status off';
    } else if (C.enviando) {
      el.textContent = `Enviando ${n}…`;
      el.className = 'status fila';
    } else if (n) {
      el.textContent = `${n} para enviar`;
      el.className = 'status fila';
    } else if (erros) {
      el.textContent = `${erros} com erro`;
      el.className = 'status off';
    } else {
      el.textContent = '✓ Tudo enviado';
      el.className = 'status ok';
    }
  },

  // ---------- dados derivados ----------
  bovino(id) { return (C.ref?.bovinos || []).find(b => b.id === id); },
  lote(id) { return (C.ref?.lotes || []).find(l => l.id === id); },

  // pesagens de hoje (fila + já enviadas)
  pesadosHoje() {
    const hoje = C.hoje();
    const m = {};
    (C.ref?.recentes || []).forEach(r => {
      if (r.tipo === 'pesagem' && r.payload.data === hoje) m[r.payload.bovinoId] = r.payload.pesoKg;
    });
    C.fila.forEach(f => {
      if (f.tipo === 'pesagem' && f.payload.data === hoje) m[f.payload.bovinoId] = f.payload.pesoKg;
    });
    return m;
  },

  // último peso conhecido, considerando o que ainda está no celular
  ultimoPeso(b) {
    let peso = b.pesoAtual, data = b.dataPeso;
    C.fila.forEach(f => {
      if (f.tipo === 'pesagem' && f.payload.bovinoId === b.id && (!data || f.payload.data >= data)) {
        peso = f.payload.pesoKg; data = f.payload.data;
      }
    });
    return { peso, data };
  },

  estoque() {
    const m = {};
    (C.ref?.estoque || []).forEach(e => { m[e.tipo] = { ...e }; });
    const ensure = t => (m[t] = m[t] || { tipo: t, kg: 0, consumo7d: 0 });
    C.fila.forEach(f => {
      if (f.tipo === 'entradaRacao') ensure(f.payload.tipoRacao).kg += f.payload.kg;
      if (f.tipo === 'consumo') {
        const e = ensure(f.payload.tipoRacao);
        e.kg -= f.payload.kg;
        e.consumo7d += f.payload.kg;
      }
    });
    return Object.values(m).sort((a, b) => a.tipo.localeCompare(b.tipo));
  },

  tiposRacao() { return C.estoque().map(e => e.tipo); },

  descrever(tipo, p) {
    switch (tipo) {
      case 'pesagem': {
        const b = C.bovino(p.bovinoId);
        return { icone: '⚖️', titulo: `Brinco ${b ? b.brinco : '?'}${b && b.nome ? ' · ' + b.nome : ''}`, valor: C.kg(p.pesoKg), sub: C.data(p.data) };
      }
      case 'consumo': {
        const l = p.loteId ? C.lote(p.loteId) : null;
        return { icone: '🌾', titulo: `Tratou: ${p.tipoRacao}`, valor: C.kg(p.kg), sub: `${l ? l.nome : 'Todos os lotes'} · ${C.data(p.data)}` };
      }
      case 'entradaRacao':
        return { icone: '🚚', titulo: `Chegou: ${p.tipoRacao}`, valor: C.kg(p.kg), sub: `${p.fornecedor ? p.fornecedor + ' · ' : ''}${C.data(p.data)}` };
      case 'conta':
        return { icone: '🧾', titulo: p.fornecedor, valor: C.dinheiro(p.valor), sub: `vence ${C.data(p.vencimento)}${p.descricao ? ' · ' + p.descricao : ''}` };
      default:
        return { icone: '•', titulo: tipo, valor: '', sub: '' };
    }
  },

  // ---------- rotas ----------
  rota() {
    const [tela, param] = location.hash.replace(/^#\/?/, '').split('/');
    return { tela: tela || '', param };
  },
  ir(h) { location.hash = h; },

  render() {
    if (!C.token()) return C.mostrarLogin();
    const { tela, param } = C.rota();
    const titulos = { '': 'Lançamentos', pesar: 'Pesar animais', consumo: 'Ração usada', entrada: 'Ração recebida', conta: 'Conta a pagar' };
    document.getElementById('topo-tela').textContent = titulos[tela] || 'Lançamentos';
    document.getElementById('topo-fazenda').textContent = C.ref?.fazenda || 'Fazenda';
    document.getElementById('btn-voltar').hidden = tela === '';
    const main = document.getElementById('tela');
    window.scrollTo(0, 0);
    if (tela === 'pesar' && param) return C.telaPesarAnimal(main, param);
    if (tela === 'pesar') return C.telaPesar(main);
    if (tela === 'consumo') return C.telaRacao(main, 'consumo');
    if (tela === 'entrada') return C.telaRacao(main, 'entradaRacao');
    if (tela === 'conta') return C.telaConta(main);
    return C.telaInicio(main);
  },

  voltar() {
    const { tela, param } = C.rota();
    C.ir(tela === 'pesar' && param ? '#pesar' : '#');
  },

  // ---------- telas ----------
  telaInicio(main) {
    const pesados = Object.keys(C.pesadosHoje()).length;
    const ativos = (C.ref?.bovinos || []).length;
    const est = C.estoque();

    const locais = C.fila.map(f => ({ ...f, origem: f.erro ? 'erro' : 'fila' }));
    const servidor = (C.ref?.recentes || []).map(r => ({ ...r, origem: r.incorporado ? 'erp' : 'ok' }));
    const itens = [...locais.reverse(), ...servidor].slice(0, 20);
    const selo = { fila: '<span class="selo fila">no celular</span>', ok: '<span class="selo ok">enviado</span>', erp: '<span class="selo erp">no ERP</span>', erro: '<span class="selo erro">erro</span>' };

    main.innerHTML = `
      <div class="grade">
        <button class="tile pesar" onclick="C.ir('#pesar')">
          <span class="tile-icone">⚖️</span>
          <span><div class="tile-nome">Pesar</div><div class="tile-info">${pesados} de ${ativos} hoje</div></span>
        </button>
        <button class="tile" onclick="C.ir('#consumo')">
          <span class="tile-icone">🌾</span>
          <span><div class="tile-nome">Ração usada</div><div class="tile-info">Trato do dia</div></span>
        </button>
        <button class="tile" onclick="C.ir('#entrada')">
          <span class="tile-icone">🚚</span>
          <span><div class="tile-nome">Ração recebida</div><div class="tile-info">Chegou carga</div></span>
        </button>
        <button class="tile" onclick="C.ir('#conta')">
          <span class="tile-icone">🧾</span>
          <span><div class="tile-nome">Conta a pagar</div><div class="tile-info">Boleto / nota</div></span>
        </button>
      </div>

      ${est.length ? `
        <div class="secao">Estoque de ração</div>
        ${est.map(e => {
          const porDia = e.consumo7d / 7;
          const dias = porDia > 0 ? Math.floor(e.kg / porDia) : null;
          const cls = e.kg < 0 ? 'negativo' : (dias !== null && dias <= 7 ? 'baixo' : '');
          return `<div class="estoque ${cls}">
            <div><b>${C.esc(e.tipo)}</b><div class="item-sub">${dias !== null ? (e.kg <= 0 ? 'acabou' : `dá para ~${dias} dia(s)`) : 'sem consumo na semana'}</div></div>
            <div class="item-valor">${C.kg(e.kg)}</div>
          </div>`;
        }).join('')}` : ''}

      <div class="secao">Últimos lançamentos</div>
      <div class="lista">
        ${itens.map(i => {
          const d = C.descrever(i.tipo, i.payload);
          return `<div class="item">
            <div class="item-icone">${d.icone}</div>
            <div class="item-corpo">
              <div class="item-titulo">${C.esc(d.titulo)}</div>
              <div class="item-sub">${C.esc(d.sub)} ${selo[i.origem] || ''}${i.erro ? ' ' + C.esc(i.erro) : ''}</div>
            </div>
            <div class="item-valor">${C.esc(d.valor)}</div>
            ${i.origem === 'erro' || i.origem === 'fila' ? `<button class="link" onclick="C.apagarDaFila('${i.id}')">apagar</button>` : ''}
          </div>`;
        }).join('') || '<div class="vazio">Nada lançado ainda</div>'}
      </div>

      <div class="rodape">
        <button class="link" onclick="C.enviar(); C.atualizarRef().then(() => C.render())">Atualizar</button>
        <button class="link" onclick="C.sair()">Sair</button>
      </div>
    `;
  },

  apagarDaFila(id) {
    const f = C.fila.find(x => x.id === id);
    if (!f) return;
    const d = C.descrever(f.tipo, f.payload);
    if (!confirm(`Apagar este lançamento que ainda não foi enviado?\n\n${d.titulo} — ${d.valor}`)) return;
    C.fila = C.fila.filter(x => x.id !== id);
    C.salvarFila();
    C.status();
    C.render();
  },

  // ----- Pesagem: lista de animais -----
  telaPesar(main) {
    const lotes = C.ref?.lotes || [];
    const loteSel = sessionStorage.getItem('campo_lote') || '';
    const teclado = localStorage.getItem(K.teclado) || 'numeric';
    main.innerHTML = `
      <div class="busca">
        <div class="linha" style="align-items:center">
          <input id="busca" class="entrada" style="flex:4" type="search" inputmode="${teclado}" autocomplete="off" placeholder="Digite o brinco" />
          <button class="chip" style="flex:0 0 auto" onclick="C.trocarTeclado()">${teclado === 'numeric' ? 'ABC' : '123'}</button>
        </div>
        ${lotes.length ? `<div class="chips" style="margin-top:10px">
          <button class="chip ${loteSel ? '' : 'ativo'}" data-lote="">Todos</button>
          ${lotes.map(l => `<button class="chip ${loteSel === l.id ? 'ativo' : ''}" data-lote="${C.esc(l.id)}">${C.esc(l.nome)}</button>`).join('')}
        </div>` : ''}
      </div>
      <div id="contador" class="contador"></div>
      <div id="animais" class="lista"></div>
    `;
    const busca = main.querySelector('#busca');
    const desenhar = () => C.listaAnimais(busca.value, sessionStorage.getItem('campo_lote') || '');
    busca.addEventListener('input', desenhar);
    busca.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const primeiro = document.querySelector('#animais .animal');
      if (primeiro) primeiro.click();
    });
    main.querySelectorAll('[data-lote]').forEach(b => b.addEventListener('click', () => {
      sessionStorage.setItem('campo_lote', b.dataset.lote);
      main.querySelectorAll('[data-lote]').forEach(x => x.classList.toggle('ativo', x === b));
      desenhar();
    }));
    desenhar();
    busca.focus();
  },

  trocarTeclado() {
    const atual = localStorage.getItem(K.teclado) || 'numeric';
    localStorage.setItem(K.teclado, atual === 'numeric' ? 'text' : 'numeric');
    C.render();
  },

  listaAnimais(termo, loteId) {
    const pesados = C.pesadosHoje();
    const t = (termo || '').trim().toLowerCase();
    let lista = (C.ref?.bovinos || []).filter(b => !loteId || b.loteId === loteId);
    const total = lista.length;
    const feitos = lista.filter(b => pesados[b.id] != null).length;
    if (t) {
      lista = lista.filter(b => String(b.brinco).toLowerCase().includes(t) || String(b.nome).toLowerCase().includes(t));
      // brinco exato ou começando com o termo vem primeiro
      lista.sort((a, b) => {
        const ra = String(a.brinco).toLowerCase() === t ? 0 : String(a.brinco).toLowerCase().startsWith(t) ? 1 : 2;
        const rb = String(b.brinco).toLowerCase() === t ? 0 : String(b.brinco).toLowerCase().startsWith(t) ? 1 : 2;
        return ra - rb || String(a.brinco).localeCompare(String(b.brinco), 'pt-BR', { numeric: true });
      });
    } else {
      // sem busca: quem falta pesar hoje primeiro
      lista.sort((a, b) => (pesados[a.id] != null) - (pesados[b.id] != null) || String(a.brinco).localeCompare(String(b.brinco), 'pt-BR', { numeric: true }));
    }
    document.getElementById('contador').innerHTML = `<b>${feitos}</b> de ${total} pesados hoje`;
    document.getElementById('animais').innerHTML = lista.slice(0, 80).map(b => {
      const hoje = pesados[b.id];
      const u = C.ultimoPeso(b);
      const lote = C.lote(b.loteId);
      return `<button class="animal ${hoje != null ? 'feito' : ''}" onclick="C.ir('#pesar/${encodeURIComponent(b.id)}')">
        <span class="brinco">${C.esc(b.brinco || '—')}</span>
        <span class="item-corpo">
          <span class="item-titulo" style="display:block">${C.esc(b.nome || b.categoria || '')}</span>
          <span class="item-sub">${lote ? C.esc(lote.nome) + ' · ' : ''}${hoje != null ? 'pesado hoje' : `último ${u.peso ? C.kg(u.peso) : '—'} (${C.data(u.data)})`}</span>
        </span>
        <span class="item-valor">${hoje != null ? '✓ ' + C.kg(hoje) : '›'}</span>
      </button>`;
    }).join('') || `<div class="vazio">${(C.ref?.bovinos || []).length ? 'Nenhum animal com esse brinco' : 'Nenhum animal ativo. Conecte à internet para baixar a lista.'}</div>`;
  },

  // ----- Pesagem: um animal -----
  telaPesarAnimal(main, id) {
    const b = C.bovino(decodeURIComponent(id));
    if (!b) { main.innerHTML = '<div class="vazio">Animal não encontrado</div>'; return; }
    const u = C.ultimoPeso(b);
    const lote = C.lote(b.loteId);
    main.innerHTML = `
      <div class="cartao">
        <div class="cartao-topo">
          <span class="brinco">${C.esc(b.brinco || '—')}</span>
          <div class="item-corpo">
            <div class="item-titulo">${C.esc(b.nome || b.categoria || '')}</div>
            <div class="item-sub">${lote ? C.esc(lote.nome) + ' · ' : ''}${C.esc(b.categoria || '')}</div>
          </div>
        </div>
        <div class="ajuda" style="margin-top:12px">Último peso: <b>${u.peso ? C.kg(u.peso) : '—'}</b> ${u.data ? '(' + C.data(u.data) + ')' : ''}</div>
      </div>
      <form id="f">
        <div class="campo">
          <label class="rotulo" for="peso">Peso (kg)</label>
          <input id="peso" name="peso" class="entrada grande" inputmode="decimal" autocomplete="off" placeholder="0" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="data">Data</label>
          <input id="data" name="data" class="entrada" type="date" value="${C.hoje()}" max="${C.hoje()}" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="obs">Observação (opcional)</label>
          <textarea id="obs" name="obs" class="entrada" placeholder="Ex.: mancando, tratado, etc."></textarea>
        </div>
        <button class="botao" type="submit">Salvar e pesar o próximo</button>
      </form>
    `;
    const peso = main.querySelector('#peso');
    peso.focus();
    main.querySelector('#f').addEventListener('submit', e => {
      e.preventDefault();
      const kg = C.num(peso.value);
      if (!(kg > 0 && kg < 2500)) { C.aviso('Peso inválido', 'erro'); peso.focus(); return; }
      if (u.peso > 0 && Math.abs(kg - u.peso) / u.peso > 0.25) {
        if (!confirm(`O peso ${C.kg(kg)} está bem diferente do último (${C.kg(u.peso)}).\n\nEstá certo?`)) { peso.focus(); return; }
      }
      C.enfileirar('pesagem', {
        bovinoId: b.id,
        pesoKg: kg,
        data: main.querySelector('#data').value || C.hoje(),
        observacoes: main.querySelector('#obs').value.trim(),
      });
      C.vibrar();
      C.aviso(`Brinco ${b.brinco}: ${C.kg(kg)} salvo`, 'ok');
      location.replace('#pesar');
    });
  },

  // ----- Ração: consumo ou entrada -----
  telaRacao(main, tipo) {
    const consumo = tipo === 'consumo';
    const tipos = C.tiposRacao();
    const lotes = C.ref?.lotes || [];
    const kgSaco = C.ler(K.kgSaco, null) || C.ref?.kgPorSaco || 40;
    const est = C.estoque();
    main.innerHTML = `
      <form id="f">
        <div class="campo">
          <label class="rotulo">Qual ração</label>
          <div class="chips" id="tipos">
            ${tipos.map((t, i) => `<button type="button" class="chip ${tipos.length === 1 ? 'ativo' : ''}" data-tipo="${C.esc(t)}">${C.esc(t)}</button>`).join('')}
            <button type="button" class="chip ${tipos.length ? '' : 'ativo'}" data-tipo="">+ Outra</button>
          </div>
          <input id="tipoNovo" class="entrada" style="margin-top:10px" placeholder="Nome da ração (ex.: Ração engorda, Sal mineral, Silagem)" ${tipos.length ? 'hidden' : ''} />
          <div id="saldo" class="ajuda"></div>
        </div>
        ${consumo ? `
        <div class="campo">
          <label class="rotulo">Para qual lote</label>
          <div class="chips" id="lotes">
            ${lotes.map(l => `<button type="button" class="chip ${lotes.length === 1 ? 'ativo' : ''}" data-lote="${C.esc(l.id)}">${C.esc(l.nome)}${l.cabecas ? ` (${l.cabecas})` : ''}</button>`).join('')}
            <button type="button" class="chip ${lotes.length === 1 ? '' : (lotes.length ? '' : 'ativo')}" data-lote="">Todos</button>
          </div>
        </div>` : ''}
        <div class="campo">
          <label class="rotulo">Quantidade</label>
          <div class="chips" id="unidade" style="margin-bottom:10px">
            <button type="button" class="chip ativo" data-un="kg">em kg</button>
            <button type="button" class="chip" data-un="saco">em sacos</button>
          </div>
          <input id="qtd" class="entrada grande" inputmode="decimal" autocomplete="off" placeholder="0" required />
          <div id="saco-cfg" class="linha" style="margin-top:10px;align-items:center" hidden>
            <span class="ajuda" style="margin:0">Cada saco tem</span>
            <input id="kgSaco" class="entrada" inputmode="decimal" value="${kgSaco}" style="max-width:110px" />
            <span class="ajuda" style="margin:0">kg</span>
          </div>
          <div id="total" class="ajuda"></div>
        </div>
        ${consumo ? '' : `
        <div class="campo">
          <label class="rotulo" for="forn">Fornecedor (opcional)</label>
          <input id="forn" class="entrada" autocomplete="off" />
        </div>`}
        <div class="campo">
          <label class="rotulo" for="data">Data</label>
          <input id="data" class="entrada" type="date" value="${C.hoje()}" max="${C.hoje()}" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="obs">Observação (opcional)</label>
          <textarea id="obs" class="entrada"></textarea>
        </div>
        <button class="botao" type="submit">Salvar</button>
      </form>
    `;

    let tipoSel = tipos.length === 1 ? tipos[0] : (tipos.length ? null : '');
    let loteSel = lotes.length === 1 ? lotes[0].id : (lotes.length ? null : '');
    let un = 'kg';
    const q = s => main.querySelector(s);
    const kgTotal = () => {
      const v = C.num(q('#qtd').value);
      return un === 'saco' ? v * C.num(q('#kgSaco').value) : v;
    };
    const atualizar = () => {
      const nome = tipoSel === '' ? q('#tipoNovo').value.trim() : tipoSel;
      const e = est.find(x => x.tipo === nome);
      q('#saldo').textContent = e ? `Estoque atual: ${C.kg(e.kg)}` : '';
      q('#total').textContent = un === 'saco' && kgTotal() ? `= ${C.kg(kgTotal())}` : '';
    };
    q('#tipos').addEventListener('click', ev => {
      const b = ev.target.closest('[data-tipo]');
      if (!b) return;
      tipoSel = b.dataset.tipo;
      q('#tipos').querySelectorAll('.chip').forEach(x => x.classList.toggle('ativo', x === b));
      q('#tipoNovo').hidden = tipoSel !== '';
      if (tipoSel === '') q('#tipoNovo').focus();
      atualizar();
    });
    if (consumo) q('#lotes').addEventListener('click', ev => {
      const b = ev.target.closest('[data-lote]');
      if (!b) return;
      loteSel = b.dataset.lote;
      q('#lotes').querySelectorAll('.chip').forEach(x => x.classList.toggle('ativo', x === b));
    });
    q('#unidade').addEventListener('click', ev => {
      const b = ev.target.closest('[data-un]');
      if (!b) return;
      un = b.dataset.un;
      q('#unidade').querySelectorAll('.chip').forEach(x => x.classList.toggle('ativo', x === b));
      q('#saco-cfg').hidden = un !== 'saco';
      atualizar();
    });
    q('#tipoNovo').addEventListener('input', atualizar);
    q('#qtd').addEventListener('input', atualizar);
    q('#kgSaco').addEventListener('input', atualizar);
    atualizar();

    q('#f').addEventListener('submit', ev => {
      ev.preventDefault();
      const nome = tipoSel === '' ? q('#tipoNovo').value.trim() : tipoSel;
      if (!nome) { C.aviso('Escolha a ração', 'erro'); return; }
      if (consumo && loteSel === null) { C.aviso('Escolha o lote', 'erro'); return; }
      const kg = Math.round(kgTotal() * 10) / 10;
      if (!(kg > 0)) { C.aviso('Informe a quantidade', 'erro'); q('#qtd').focus(); return; }
      if (un === 'saco') C.gravar(K.kgSaco, C.num(q('#kgSaco').value));
      const payload = { tipoRacao: nome, kg, data: q('#data').value || C.hoje(), observacoes: q('#obs').value.trim() };
      if (consumo) payload.loteId = loteSel || null;
      else payload.fornecedor = q('#forn').value.trim();
      C.enfileirar(tipo, payload);
      C.vibrar();
      C.aviso(`${consumo ? 'Consumo' : 'Entrada'} de ${C.kg(kg)} salvo`, 'ok');
      C.ir('#');
    });
  },

  // ----- Conta a pagar -----
  telaConta(main) {
    main.innerHTML = `
      <form id="f">
        <div class="campo">
          <label class="rotulo">Foto do boleto ou nota</label>
          <label class="botao claro" style="text-align:center;margin:0">
            📷 Tirar foto
            <input id="foto" type="file" accept="image/*" capture="environment" hidden />
          </label>
          <img id="prev" class="foto-prev" hidden alt="Foto do boleto" />
        </div>
        <div class="campo">
          <label class="rotulo" for="forn">Fornecedor / quem cobra</label>
          <input id="forn" class="entrada" autocomplete="off" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="valor">Valor (R$)</label>
          <input id="valor" class="entrada grande" inputmode="decimal" autocomplete="off" placeholder="0,00" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="venc">Vencimento</label>
          <input id="venc" class="entrada" type="date" value="${C.hoje()}" required />
        </div>
        <div class="campo">
          <label class="rotulo" for="desc">Do que é (opcional)</label>
          <textarea id="desc" class="entrada" placeholder="Ex.: 20 sacos de sal, conserto da cerca"></textarea>
        </div>
        <button class="botao" type="submit">Enviar para aprovação</button>
        <p class="ajuda" style="text-align:center">A conta fica pendente até ser aprovada no ERP.</p>
      </form>
    `;
    const q = s => main.querySelector(s);
    let anexo = null;
    q('#foto').addEventListener('change', async ev => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        anexo = await C.comprimir(file);
        q('#prev').src = anexo;
        q('#prev').hidden = false;
      } catch (e) {
        C.aviso('Não consegui ler a foto', 'erro');
      }
    });
    q('#f').addEventListener('submit', ev => {
      ev.preventDefault();
      const valor = C.num(q('#valor').value);
      if (!(valor > 0)) { C.aviso('Informe o valor', 'erro'); return; }
      const fornecedor = q('#forn').value.trim();
      if (!fornecedor) { C.aviso('Informe o fornecedor', 'erro'); return; }
      C.enfileirar('conta', {
        fornecedor, valor,
        vencimento: q('#venc').value,
        descricao: q('#desc').value.trim(),
      }, anexo);
      C.vibrar();
      C.aviso('Conta enviada para aprovação', 'ok');
      C.ir('#');
    });
  },

  // reduz a foto para ~1600px JPEG para caber no celular e subir rápido
  comprimir(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600;
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s);
        cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  },

  // ---------- login ----------
  mostrarLogin() {
    document.getElementById('btn-voltar').hidden = true;
    document.getElementById('topo-tela').textContent = 'Entrar';
    const main = document.getElementById('tela');
    main.innerHTML = `
      <form id="login" class="login">
        <h1>Lançamentos do campo</h1>
        <p>Digite a senha do vaqueiro.</p>
        <input id="senha" class="entrada" type="password" autocomplete="current-password" placeholder="Senha" required />
        <button class="botao" type="submit">Entrar</button>
        <div id="erro" class="erro-texto"></div>
      </form>
    `;
    main.querySelector('#login').addEventListener('submit', async ev => {
      ev.preventDefault();
      const erro = main.querySelector('#erro');
      erro.textContent = '';
      try {
        const r = await fetch('/api/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: main.querySelector('#senha').value }),
        });
        if (!r.ok) throw new Error('senha');
        const j = await r.json();
        localStorage.setItem(K.token, j.token);
        await C.atualizarRef();
        C.enviar();
        C.ir('#');
        C.render();
      } catch (e) {
        erro.textContent = navigator.onLine ? 'Senha incorreta.' : 'Sem internet. Para entrar a primeira vez precisa de sinal.';
      }
    });
  },

  sair() {
    const n = C.fila.length;
    if (n && !confirm(`Ainda há ${n} lançamento(s) no celular que não foram enviados. Sair mesmo assim? Eles continuam guardados.`)) return;
    localStorage.removeItem(K.token);
    C.mostrarLogin();
  },

  // ---------- início ----------
  async iniciar() {
    C.fila = C.ler(K.fila, []);
    C.ref = C.ler(K.ref, null);
    document.getElementById('btn-voltar').addEventListener('click', C.voltar);
    window.addEventListener('hashchange', () => C.render());
    window.addEventListener('online', () => { C.online = true; C.enviar(); C.atualizarRef().then(() => { if (C.rota().tela === '') C.render(); }); });
    window.addEventListener('offline', () => { C.online = false; C.status(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) C.enviar(); });
    setInterval(() => C.enviar(), 60000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    C.status();
    if (!C.token()) return C.mostrarLogin();
    C.render();
    await C.atualizarRef();
    C.enviar();
    if (C.rota().tela === '' || C.rota().tela === 'pesar') {
      // re-desenha com dados frescos sem perder o que está sendo digitado na pesagem
      if (C.rota().tela === '') C.render();
      else if (!C.rota().param) {
        const busca = document.getElementById('busca');
        if (busca) C.listaAnimais(busca.value, sessionStorage.getItem('campo_lote') || '');
      }
    }
  },
};

C.iniciar();
