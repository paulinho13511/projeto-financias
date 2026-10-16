// Histórico do mês: lançamentos e contas em uma lista única, com resumo e filtros. Funções puras.
import { today } from "./dates.js";
import { txOf } from "./ledger.js";
import { occ, billStatus } from "./billing.js";

// Linhas do mês inteiro: lançamentos (receita/despesa) + contas do mês
export function linhasDoMes(db, sel, hoje = today()) {
  return [
    ...txOf(db.tx, sel).map((t) => ({
      kind: "tx", date: t.date, created: t.created || 0, t,
      type: t.type, amount: t.amount, desc: t.desc, category: t.category, card: t.card,
    })),
    ...occ(db.bills, sel).map((o) => {
      const st = billStatus(o.b, sel, hoje);
      return {
        kind: "bill", date: st.due, created: 0, o, st,
        type: "expense", amount: o.amount, desc: o.b.name, category: o.b.category, card: o.b.card,
      };
    }),
  ];
}

// Resumo do mês inteiro (sem filtros)
export function resumoLinhas(rows) {
  const soma = (arr) => arr.reduce((s, r) => s + r.amount, 0);
  return {
    recebido: soma(rows.filter((r) => r.kind === "tx" && r.type === "income")),
    pago: soma(rows.filter((r) => (r.kind === "tx" && r.type === "expense") || (r.kind === "bill" && r.st.key === "paid"))),
    aPagar: soma(rows.filter((r) => r.kind === "bill" && r.st.key !== "paid")),
  };
}

// Aplica filtros e ordenação. cards é um Set de ids de cartão (ou "none" para sem cartão).
export function filtrarLinhas(rows, { q, ft, from, to, cards, sort }) {
  let items = rows.filter((r) => (ft === "all" || r.type === ft)
    && (!q || r.desc.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)));
  if (from) items = items.filter((r) => r.date >= from);
  if (to) items = items.filter((r) => r.date <= to);
  if (cards.size) items = items.filter((r) => (r.card && cards.has(r.card)) || (!r.card && cards.has("none")));
  // agrupa por dia só quando a ordenação é por data
  const porData = !(sort === "high" || sort === "low");
  if (sort === "high") items.sort((a, b) => b.amount - a.amount);
  else if (sort === "low") items.sort((a, b) => a.amount - b.amount);
  else items.sort((a, b) => a.date.localeCompare(b.date) || (a.created - b.created));
  return { items, porData };
}
