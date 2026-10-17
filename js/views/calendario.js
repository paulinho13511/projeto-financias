// Calendário do mês: vencimentos por dia e próximos três meses.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, parts, dim, shiftMonth, monthLabel } from "../core/dates.js";
import { money, esc, pad } from "../core/format.js";
import { occ, dueOf } from "../core/billing.js";

const compactQuery = matchMedia("(max-width:480px)");
let compactCal = compactQuery.matches;

export function renderCal() {
  const { db, sel } = state;
  const [y, m] = parts(sel);
  const n = dim(sel);
  const first = new Date(y, m - 1, 1).getDay();
  const items = occ(db.bills, sel);
  const total = items.reduce((s, o) => s + o.amount, 0);
  $("calTitle").textContent = `${monthLabel(sel)} · ${money(total)} em contas`;
  let h = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < first; i++) h += `<div class="d blank"></div>`;
  for (let d = 1; d <= n; d++) {
    const ds = `${sel}-${pad(d)}`;
    const due = items.filter((o) => parseInt(dueOf(o.b, sel).slice(8), 10) === d);
    h += `<div class="d ${ds === today() ? "today" : ""}"><div class="n">${d}</div>${due.map((o) => {
      const paid = (o.b.paid || []).includes(sel);
      const label = compactCal ? "●" : esc(o.b.name);
      return `<div class="b ${paid ? "paid" : ""}" title="${esc(o.b.name)} · ${money(o.amount)} · ${o.label}">${label}</div>`;
    }).join("")}</div>`;
  }
  $("calGrid").innerHTML = h;
  $("calNext").innerHTML = [1, 2, 3].map((i) => {
    const k = shiftMonth(sel, i);
    const list = occ(db.bills, k);
    const sum = list.reduce((s, o) => s + o.amount, 0);
    return `<div class="row"><div><div class="t">${monthLabel(k)}</div><div class="s">${list.length} conta(s)</div></div><div class="amt">${money(sum)}</div></div>`;
  }).join("");
}

// Troca o modo compacto (celular) quando a largura da tela muda
export function wireCalendar() {
  compactQuery.addEventListener("change", (e) => {
    compactCal = e.matches;
    renderCal();
  });
}
