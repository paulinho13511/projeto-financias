// Cálculos de análise: resumo, variação, previsão, regra 50/30/20, revisão, reserva e gráfico.
import { mKey, shiftMonth, dim, today } from "./dates.js";
import { totals, expenseByCategory, categoriasOrdenadas, txOf } from "./ledger.js";
import { occ, dueOf } from "./billing.js";

// Variação percentual entre dois valores (null quando não há base de comparação)
export const variacao = (atual, anterior) => (anterior ? ((atual - anterior) / anterior) * 100 : null);

// Dias de referência do mês: até hoje, se o mês é o atual; senão o mês inteiro
export function diasDoMes(sel, hoje = today()) {
  if (sel !== mKey(hoje)) return dim(sel);
  return Math.max(1, parseInt(hoje.slice(8, 10), 10));
}

// Receitas dos últimos 6 meses (incluindo o atual) que tiveram valor
export function rendasRecentes(db, cur) {
  return [0, 1, 2, 3, 4, 5].map((k) => totals(db, shiftMonth(cur, -k)).inc).filter((v) => v > 0);
}

// Resumo do mês usado em Insights
export function resumoMes(db, sel, hoje = today()) {
  const cur = totals(db, sel);
  const prevK = shiftMonth(sel, -1);
  const prev = totals(db, prevK);
  const days = diasDoMes(sel, hoje);
  const { byCat } = expenseByCategory(cur);
  return {
    cur,
    prevK,
    diff: variacao(cur.exp, prev.exp),
    days,
    avg: cur.exp / days,
    rate: cur.inc ? ((cur.inc - cur.exp) / cur.inc) * 100 : null,
    top: categoriasOrdenadas(byCat)[0],
    contas: cur.bills.reduce((s, o) => s + o.amount, 0),
  };
}

// Gasto acumulado dia a dia no mês: despesas lançadas + contas na data de vencimento
export function serieGastos(db, sel) {
  const n = dim(sel);
  const daily = new Array(n + 1).fill(0);
  txOf(db.tx, sel)
    .filter((t) => t.type === "expense")
    .forEach((t) => { daily[parseInt(t.date.slice(8, 10), 10)] += t.amount; });
  occ(db.bills, sel).forEach((o) => {
    const d = parseInt(dueOf(o.b, sel).slice(8, 10), 10);
    if (d >= 1 && d <= n) daily[d] += o.amount;
  });
  const cum = [];
  let acc = 0;
  for (let d = 1; d <= n; d++) {
    acc += daily[d];
    cum.push(acc);
  }
  return { n, cum };
}
