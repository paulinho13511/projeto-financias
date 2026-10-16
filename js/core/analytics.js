// Cálculos de análise: resumo, variação, previsão, regra 50/30/20, revisão, reserva e gráfico.
import { mKey, shiftMonth, dim, today } from "./dates.js";
import { totals, expenseByCategory, categoriasOrdenadas, txOf } from "./ledger.js";
import { occ, dueOf } from "./billing.js";
import { GRUPO_503 } from "./constants.js";

// Variação percentual entre dois valores (null quando não há base de comparação)
export const variacao = (atual, anterior) => (anterior ? ((atual - anterior) / anterior) * 100 : null);

// Dias de referência do mês: até hoje, se o mês é o atual; senão o mês inteiro
export function diasDoMes(sel, hoje = today()) {
  if (sel !== mKey(hoje)) return dim(sel);
  return Math.max(1, parseInt(hoje.slice(8, 10), 10));
}

// Previsão de saldo ao fim do mês. No mês atual, projeta os gastos variáveis restantes
// pelo ritmo de gasto até hoje (as contas já estão descontadas no saldo do mês).
export function previsaoFimDoMes(t, sel, hoje = today()) {
  if (sel !== mKey(hoje)) return { valor: t.bal, projetado: false };
  const dia = Math.max(1, parseInt(hoje.slice(8, 10), 10));
  const restam = Math.max(0, dim(sel) - dia);
  const variaveis = t.items.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0);
  return { valor: t.bal - (variaveis / dia) * restam, projetado: true };
}

// Regra 50/30/20 em percentual da receita do mês. Retorna null se não há receita.
export function regra503(t, byCat) {
  if (!t.inc) return null;
  const g = { nec: 0, des: 0 };
  Object.entries(byCat).forEach(([c, v]) => { g[GRUPO_503[c] || "des"] += v; });
  return {
    nec: (g.nec / t.inc) * 100,
    des: (g.des / t.inc) * 100,
    pou: Math.max(0, ((t.inc - t.exp) / t.inc) * 100),
  };
}

// Categorias que mais mudaram em relação ao mês anterior (até 4)
export function revisaoDelta(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((c) => ({ c, d: (a[c] || 0) - (b[c] || 0), v: a[c] || 0 }))
    .filter((x) => x.d !== 0)
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    .slice(0, 4);
}

// Média de despesas dos 3 meses anteriores que tiveram gasto (null se nenhum)
export function emergenciaMedia(db, cur) {
  const meses = [1, 2, 3].map((k) => totals(db, shiftMonth(cur, -k)).exp).filter((v) => v > 0);
  if (!meses.length) return null;
  return meses.reduce((s, v) => s + v, 0) / meses.length;
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
    comprometido: cur.inc ? Math.min(100, (cur.exp / cur.inc) * 100) : 0,
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
