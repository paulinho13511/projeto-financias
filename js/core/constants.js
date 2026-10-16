// Listas fixas do app (categorias, rótulos das abas e regra 50/30/20).

export const CATS = ["Alimentação", "Moradia", "Transporte", "Lazer", "Saúde", "Contas", "Educação", "Outros"];
export const ICATS = ["Salário", "Freelance", "Investimentos"];

export const TITLES = {
  inicio: "Início",
  subs: "Assinaturas",
  lanc: "Lançamentos",
  contas: "Contas",
  cal: "Calendário",
  rev: "Categorias",
  ins: "Insights",
  metas: "Metas",
};

// Regra 50/30/20: necessidades até 50%, desejos até 30%, poupança de pelo menos 20% da receita
export const GRUPO_503 = {
  Moradia: "nec", Alimentação: "nec", Transporte: "nec", Saúde: "nec", Contas: "nec", Educação: "nec",
  Lazer: "des", Outros: "des",
};
