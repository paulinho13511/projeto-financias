// Metas de economia: progresso, prazo e depósitos. Funções puras.
import { mKey, monthDiff, shiftMonth } from "./dates.js";

// Os 6 meses que terminam em cur, do mais antigo ao atual
export const ultimosSeisMeses = (cur) => {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(cur, -i));
  return months;
};

export function progressoMeta(g, cur) {
  const pct = Math.min(100, g.target ? (g.saved / g.target) * 100 : 0);
  const left = monthDiff(cur, g.deadline);
  const done = g.saved >= g.target;
  const perMonth = Math.max(0, (g.target - g.saved) / Math.max(1, left));
  return { pct, left, done, perMonth, falta: g.target - g.saved };
}

// Total depositado em cada um dos meses informados
export function depositosPorMes(log, months) {
  return months.map((m) => log.filter((x) => mKey(x.d) === m).reduce((s, x) => s + x.v, 0));
}

// Últimos depósitos, do mais recente para o mais antigo (até 4)
export const ultimosDepositos = (log) => [...log].sort((a, b) => b.d.localeCompare(a.d)).slice(0, 4);
