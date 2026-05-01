// ===== Dados de exemplo (carregados se DB estiver vazio) =====
const SEED = {
  shouldSeed() {
    return DB.state.bovinos.length === 0 && DB.state.lotes.length === 0;
  },

  run() {
    // Lotes
    const loteA = DB.lotes.add({ nome: 'Lote A — Engorda', descricao: 'Bois em terminação' });
    const loteB = DB.lotes.add({ nome: 'Lote B — Recria', descricao: 'Bezerros em recria' });

    // Bovinos
    const bovinos = [
      { brinco: '001', nome: 'Touro 01', categoria: 'Boi', sexo: 'M', loteId: loteA.id,
        dataEntrada: '2024-08-16', pesoEntrada: 380, precoArrobaEntrada: 280,
        custoEntrada: 380 / 30 * 280 },
      { brinco: '002', nome: 'Touro 02', categoria: 'Boi', sexo: 'M', loteId: loteA.id,
        dataEntrada: '2024-08-16', pesoEntrada: 395, precoArrobaEntrada: 280,
        custoEntrada: 395 / 30 * 280 },
      { brinco: '003', nome: 'Touro 03', categoria: 'Boi', sexo: 'M', loteId: loteA.id,
        dataEntrada: '2024-08-16', pesoEntrada: 410, precoArrobaEntrada: 280,
        custoEntrada: 410 / 30 * 280 },
      { brinco: '101', nome: 'Bezerro 01', categoria: 'Bezerro', sexo: 'M', loteId: loteB.id,
        dataEntrada: '2024-09-01', pesoEntrada: 220, precoArrobaEntrada: 290,
        custoEntrada: 220 / 30 * 290 },
      { brinco: '102', nome: 'Bezerro 02', categoria: 'Bezerro', sexo: 'M', loteId: loteB.id,
        dataEntrada: '2024-09-01', pesoEntrada: 235, precoArrobaEntrada: 290,
        custoEntrada: 235 / 30 * 290 },
    ];
    const ids = bovinos.map(b => DB.bovinos.add(b).id);

    // Pesagens (3 ao longo do tempo)
    const pesagensData = [
      // bovino, data, peso
      [ids[0], '2024-11-01', 415], [ids[0], '2025-02-01', 460], [ids[0], '2025-05-01', 510],
      [ids[1], '2024-11-01', 432], [ids[1], '2025-02-01', 478], [ids[1], '2025-05-01', 525],
      [ids[2], '2024-11-01', 448], [ids[2], '2025-02-01', 495], [ids[2], '2025-05-01', 545],
      [ids[3], '2024-11-01', 248], [ids[3], '2025-02-01', 285], [ids[3], '2025-05-01', 330],
      [ids[4], '2024-11-01', 262], [ids[4], '2025-02-01', 300], [ids[4], '2025-05-01', 348],
    ];
    pesagensData.forEach(([bid, data, peso]) => {
      DB.pesagens.add({ bovinoId: bid, data, pesoKg: peso });
    });

    // Despesas exemplo
    DB.despesas.add({
      data: '2024-11-11', fornecedor: 'COOPERATIVA AGROPECUARIA UNAI',
      categoria: 'Ração', valor: 6657.62, rateioTipo: 'peso', rateioEscopo: 'todos',
    });
    DB.despesas.add({
      data: '2024-09-05', fornecedor: 'Opcao Rural',
      categoria: 'Vacinas', valor: 622.80, rateioTipo: 'igual', rateioEscopo: 'todos',
    });
    DB.despesas.add({
      data: '2024-06-03', fornecedor: 'Natalia Bernstein',
      categoria: 'Veterinário', valor: 1412.00, rateioTipo: 'igual', rateioEscopo: 'lote',
      loteId: loteA.id,
    });

    // Investimentos exemplo
    DB.investimentos.add({
      data: '2024-08-14', descricao: 'Reforma do curral', categoria: 'Curral', valor: 14744.00,
    });
    DB.investimentos.add({
      data: '2024-07-22', descricao: 'Honorários advocatícios — escritura',
      categoria: 'Outros', valor: 12000.00,
    });

    DB.save();
  },
};
