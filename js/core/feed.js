// Histórico de lançamentos: busca, filtros e ordenação. Função pura.

// Aplica busca, tipo, período e cartão, depois ordena.
// cards é um Set de ids de cartão ("none" = sem cartão). sort: "recent" (padrão), "high" ou "low".
export function filtrarTransacoes(list, { q, ft, from, to, cards, sort }) {
  let items = list.filter((t) => (ft === "all" || t.type === ft)
    && (!q || t.desc.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)));
  if (from) items = items.filter((t) => t.date >= from);
  if (to) items = items.filter((t) => t.date <= to);
  if (cards.size) items = items.filter((t) => (t.card && cards.has(t.card)) || (!t.card && cards.has("none")));
  if (sort === "high") items.sort((a, b) => b.amount - a.amount);
  if (sort === "low") items.sort((a, b) => a.amount - b.amount);
  return items;
}
