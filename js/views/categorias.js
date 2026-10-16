// Categorias: gastos por categoria com limites, principais gastos e gráfico de rosca.
import { $, animateBars, showToast } from "../ui/dom.js";
import { state } from "../state/store.js";
import { money, esc } from "../core/format.js";
import { totals, expenseByCategory, categoriasOrdenadas } from "../core/ledger.js";
import { diasDoMes } from "../core/analytics.js";
import { CATS } from "../core/constants.js";
import { go } from "../ui/nav.js";
import { renderFeed } from "./lancamentos.js";

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

export function renderDonut() {
  const { db, sel } = state;
  const t = totals(db, sel);
  const { byCat, counts } = expenseByCategory(t);
  const entries = categoriasOrdenadas(byCat);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) {
    $("donut").innerHTML = `<div class="empty">Sem despesas neste mês</div>`;
    return;
  }
  const n = Object.values(counts).reduce((s, v) => s + v, 0);
  const top = entries[0];
  const days = diasDoMes(sel);
  const R = 62, C = 2 * Math.PI * R;
  let off = 0;
  const segs = entries.map(([c, v], i) => {
    const len = (v / total) * C;
    const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="26" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(c)}: ${money(v)}</title></circle>`;
    off += len;
    return s;
  }).join("");
  const rows = entries.map(([c, v], i) => {
    const pct = (v / total) * 100, k = counts[c] || 0;
    return `<button type="button" class="catRow tap" data-cat="${esc(c)}" style="--c:${PAL[i % PAL.length]}" title="Ver ${esc(c)} no histórico">
      <span class="cdot"></span>
      <span class="cname">${esc(c)}<small>${k} ${k === 1 ? "lançamento" : "lançamentos"}</small></span>
      <span class="cval">${money(v)}</span>
      <span class="cpct">${pct.toFixed(0)}%</span>
      <span class="cbar"><i style="width:${pct.toFixed(1)}%"></i></span>
    </button>`;
  }).join("");
  $("donut").innerHTML = `<div class="donutWrap">
    <svg viewBox="0 0 180 180" role="img" aria-label="Distribuição das despesas por categoria">
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--card2)" stroke-width="26"/>${segs}
      <text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="11">Total</text>
      <text x="90" y="104" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="700">${esc(money(total))}</text>
    </svg>
    <div class="donutStats">
      <div class="stat"><span>Maior categoria</span><b>${esc(top[0])}</b></div>
      <div class="stat"><span>Lançamentos</span><b>${n}</b></div>
      <div class="stat"><span>Média por dia</span><b>${money(total / days)}</b></div>
    </div>
  </div>
  <div class="catList">${rows}</div>`;
}

// Tocar numa categoria do gráfico abre o histórico filtrado por ela
export function wireDonut() {
  $("donut").addEventListener("click", (e) => {
    const d = e.target.closest("[data-cat]");
    if (!d) return;
    $("search").value = d.dataset.cat;
    $("filterType").value = "expense";
    go("lanc");
    renderFeed();
    showToast(`Mostrando ${d.dataset.cat} no histórico`);
  });
}
