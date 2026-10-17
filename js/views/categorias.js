// Categorias: gastos por categoria com limites, principais gastos, histórico de 6 meses e gráfico de rosca.
import { $, animateBars } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, shiftMonth, monthLabel } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { totals, expenseByCategory, categoriasOrdenadas } from "../core/ledger.js";
import { CATS } from "../core/constants.js";

const PAL = ["#8b5cf6", "#a78bfa", "#ffb86b", "#f87171", "#b58cff", "#7bd389", "#fbbf24", "#8a8fa3"];

export function renderRev() {
  const { db, sel } = state;
  const t = totals(db, sel);
  const entries = categoriasOrdenadas(expenseByCategory(t).byCat);
  const totalExp = t.exp || 1;
  $("catList").innerHTML = entries.length ? entries.map(([c, v]) => {
    const lim = db.budgets[c];
    const pct = lim ? (v / lim) * 100 : (v / totalExp) * 100;
    const cls = lim && v >= lim ? "over" : lim && v >= lim * 0.8 ? "near" : "";
    return `<div class="cat">
      <div class="hd"><span>${esc(c)}</span><span>${money(v)} · ${((v / totalExp) * 100).toFixed(0)}%</span></div>
      <div class="bar"><i class="${cls}" style="width:${Math.min(pct, 100)}%"></i></div>
      ${lim ? `<div class="muted" style="margin-top:6px">Limite ${money(lim)}</div>` : ""}
    </div>`;
  }).join("") : `<div class="empty">Nenhuma despesa neste mês</div>`;

  $("budgetList").innerHTML = CATS.map((c) => `
    <div class="row"><span class="t">${c}</span>
    <input type="number" min="0" step="50" style="width:140px;text-align:right" value="${db.budgets[c] || ""}" placeholder="sem limite" data-act="setBudget" data-cat="${esc(c)}"></div>`).join("");

  const topRows = [
    ...t.items.filter((x) => x.type === "expense").map((x) => ({ name: x.desc, cat: x.category, amount: x.amount })),
    ...t.bills.map((o) => ({ name: o.b.name, cat: o.b.category, amount: o.amount })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 5);
  $("top").innerHTML = topRows.map((r) => `<div class="row"><div class="rmain"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.cat || "")}</div></div><div class="amt expense">${money(r.amount)}</div></div>`).join("")
    || `<div class="empty">Sem despesas neste mês</div>`;
  animateBars();
}

// Despesas dos últimos 6 meses, com o mês selecionado em destaque
export function renderHist() {
  const { db, sel } = state;
  const keys = [];
  for (let i = 5; i >= 0; i--) keys.push(shiftMonth(sel, -i));
  const vals = keys.map((k) => totals(db, k).exp);
  const max = Math.max(...vals, 1);
  $("hist").innerHTML = keys.map((k, i) => `<div class="hcol ${k === sel ? "cur" : ""}"><div class="hbar" style="height:${(vals[i] / max) * 100}%" title="${money(vals[i])}"></div><span>${monthLabel(k).split(" ")[0].slice(0, 3)}</span></div>`).join("");
}

export function renderDonut() {
  const { db, sel } = state;
  const t = totals(db, sel);
  const { byCat } = expenseByCategory(t);
  const entries = categoriasOrdenadas(byCat);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) {
    $("donut").innerHTML = `<div class="empty">Sem despesas neste mês</div>`;
    return;
  }
  const R = 62, C = 2 * Math.PI * R;
  let off = 0;
  const segs = entries.map(([c, v], i) => {
    const len = (v / total) * C;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="26" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(c)}: ${money(v)}</title></circle>`;
    off += len;
    return s;
  }).join("");
  $("donut").innerHTML = `<div class="donutWrap">
    <svg viewBox="0 0 180 180" role="img" aria-label="Distribuição das despesas por categoria">
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--card2)" stroke-width="26"/>${segs}
      <text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="11">Total</text>
      <text x="90" y="104" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="700">${esc(money(total))}</text>
    </svg>
    <div class="legend">${entries.map(([c, v], i) => `<div><i style="background:${PAL[i % PAL.length]}"></i><span>${esc(c)}</span><b class="pct">${Math.round((v / total) * 100)}%</b></div>`).join("")}</div>
  </div>`;
}

// Comparação mês a mês: receitas e despesas dos últimos 6 meses
export function renderCmp() {
  const { db, sel } = state;
  const data = [5, 4, 3, 2, 1, 0].map((k) => {
    const ym = shiftMonth(sel, -k);
    const t = totals(db, ym);
    return { ym, inc: t.inc, exp: t.exp };
  });
  const max = Math.max(1, ...data.map((d) => Math.max(d.inc, d.exp)));
  $("cmp").innerHTML = data.map((d) => `<div class="col" title="${esc(monthLabel(d.ym))}: receitas ${esc(money(d.inc))}, despesas ${esc(money(d.exp))}">
    <div class="pair"><i style="height:${((d.inc / max) * 100).toFixed(1)}%;background:#8b5cf6"></i><i style="height:${((d.exp / max) * 100).toFixed(1)}%;background:#f87171"></i></div>
    <span class="lb">${esc(monthLabel(d.ym).slice(0, 3))}</span></div>`).join("");
}
