// Assinaturas: contas fixas marcadas como assinatura, com totais do mês, do ano e acumulado.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { money, esc, pad } from "../core/format.js";
import { occ } from "../core/billing.js";

export function renderSubs() {
  const { db, sel } = state;
  const subsAll = (db.bills || []).filter((b) => b.sub);
  const monthSubs = occ(db.bills, sel).filter((o) => o.b.sub);
  const monthTotal = monthSubs.reduce((s, o) => s + o.amount, 0);
  const annual = monthSubs.reduce((s, o) => s + o.amount * 12, 0);
  let acc = 0;
  for (let m = 1; m <= parseInt(sel.slice(5, 7), 10); m++) {
    const ym = `${sel.slice(0, 4)}-${pad(m)}`;
    occ(db.bills, ym).forEach((o) => { if (o.b.sub) acc += o.amount; });
  }
  $("subMonth").textContent = money(monthTotal);
  $("subYear").textContent = money(annual);
  $("subAcc").textContent = money(acc);
  $("subList").innerHTML = monthSubs.length
    ? monthSubs.map((o) => `<div class="row"><div class="rmain"><div class="t">${esc(o.b.name)}</div><div class="s">${esc(o.b.category)} · ${money(o.amount)} por mês · ${money(o.amount * 12)} por ano</div></div></div>`).join("")
    : `<div class="empty">${subsAll.length ? "Nenhuma assinatura ativa neste mês" : "Em Contas, cadastre uma conta fixa e marque \"É assinatura\""}</div>`;
}
