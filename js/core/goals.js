// Metas de economia: progresso, prazo e parcela mensal. Função pura.
import { monthDiff } from "./dates.js";

export function progressoMeta(g, cur) {
  const pct = Math.min(100, g.target ? (g.saved / g.target) * 100 : 0);
  const left = monthDiff(cur, g.deadline);
  const done = g.saved >= g.target;
  const perMonth = Math.max(0, (g.target - g.saved) / Math.max(1, left));
  return { pct, left, done, perMonth };
}
