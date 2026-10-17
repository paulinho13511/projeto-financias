// Lançamentos e totais do mês. Lançamentos (tx) + contas (bills) somados no mês.
import { mKey } from "./dates.js";
import { occ } from "./billing.js";

export const txOf = (tx, ym) => tx.filter((t) => mKey(t.date) === ym);

export const sortedTx = (tx) =>
  [...tx].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));

export function totals(db, ym) {
  const items = txOf(db.tx, ym);
  const bills = occ(db.bills, ym);
  const inc = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const exp = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0)
    + bills.reduce((s, o) => s + o.amount, 0);
  return { inc, exp, bal: inc - exp, items, bills };
}

// Despesas por categoria de um total mensal (lançamentos primeiro, depois contas)
export function expenseByCategory(t) {
  const byCat = {}, counts = {};
  t.items.filter((x) => x.type === "expense").forEach((x) => {
    byCat[x.category] = (byCat[x.category] || 0) + x.amount;
    counts[x.category] = (counts[x.category] || 0) + 1;
  });
  t.bills.forEach((o) => {
    byCat[o.b.category] = (byCat[o.b.category] || 0) + o.amount;
    counts[o.b.category] = (counts[o.b.category] || 0) + 1;
  });
  return { byCat, counts };
}

// Gastos por categoria de um mês, ordenados do maior para o menor
export function categoriasOrdenadas(byCat) {
  return Object.entries(byCat).sort((a, b) => b[1] - a[1]);
}
