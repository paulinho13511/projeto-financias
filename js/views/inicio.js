// Tela Início: saldo, gráfico de gastos, próxima conta, lembretes e últimos lançamentos.
import { $, countUp } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, mKey, dim, fmtDate } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { totals, sortedTx } from "../core/ledger.js";
import { contasEmAberto } from "../core/billing.js";
import { avisosInicio } from "../core/alerts.js";
import { serieGastos } from "../core/analytics.js";

// Linha de lançamento (usada no início e no histórico)
export function txRow(t) {
  const inc = t.type === "income";
  return `<div class="row"><div class="ic ${inc ? "" : "out"}">${esc(t.category.charAt(0))}</div><div class="rmain"><div class="t">${esc(t.desc)}</div><div class="s">${esc(t.category)} · ${fmtDate(t.date)}</div></div><div class="actions"><span class="amt ${inc ? "income" : "expense"}">${inc ? "+" : "−"} ${money(t.amount)}</span><button class="ico" title="Remover" data-act="delTx" data-id="${t.id}">×</button></div></div>`;
}

export function renderInicio() {
  const { db, sel } = state;
  const t = totals(db, sel);
  countUp($("balance"), t.bal);
  $("balance").className = "big " + (t.bal < 0 ? "expense" : "");
  countUp($("inc"), t.inc);
  countUp($("exp"), t.exp);

  const { rem, cards, msgs } = avisosInicio(db, sel);
  const cur = mKey(today());
  const billRows = rem.map(({ b, st, amount, label }) => `
    <div class="row">
      <div class="rmain"><div class="t">${esc(b.name)}<span class="tag">${label}</span><span class="tag ${st.cls}">${st.label}</span></div>
      <div class="s">Vence em ${fmtDate(st.due, true)} · ${money(amount)}</div></div>
      <button class="ghost" data-act="togglePaid" data-id="${b.id}" data-ym="${cur}">Marcar paga</button>
    </div>`).join("");
  const cardRows = cards.map((c) => `
    <div class="row">
      <div class="rmain"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.body)}</div></div>
      ${c.paidable ? `<button class="ghost" data-act="markFaturaPaid" data-id="${c.cardId}" data-ym="${c.closeYm}">Marcar paga</button>` : ""}
    </div>`).join("");
  $("reminders").innerHTML = (billRows + cardRows) || `<div class="empty">Nenhum lembrete nos próximos dias</div>`;

  $("notifs").innerHTML = msgs.length
    ? msgs.map((m) => `
    <div class="notif"><div class="app-n">Minhas Finanças · agora</div>
    <div class="msg"><b>${esc(m.title)}</b><br>${esc(m.body)}</div></div>`).join("")
    : `<div class="empty">Nenhuma notificação pendente</div>`;

  $("recent").innerHTML = sortedTx(db.tx).slice(0, 5).map(txRow).join("") || `<div class="empty">Nenhum lançamento ainda</div>`;
}

export function renderNext() {
  const { db } = state;
  const list = contasEmAberto(db.bills, mKey(today()));
  const el = $("nextBill");
  if (!list.length) {
    el.innerHTML = `<div class="muted">Próxima conta</div><div class="nx-empty">Nenhuma conta em aberto neste mês</div>`;
    return;
  }
  const { b, st, amount, label } = list[0];
  el.innerHTML = `<div class="muted">Próxima conta</div>
    <div class="nx-title">${esc(b.name)} <span class="tag">${label}</span></div>
    <div class="nx-row"><span class="nx-amt">${money(amount)}</span><span class="tag ${st.cls}">${st.label}</span></div>
    <div class="muted">Vence em ${fmtDate(st.due, true)}</div>`;
}

export function renderChart() {
  const { db, sel } = state;
  const { n, cum } = serieGastos(db, sel);
  if (state.chartSel !== sel) {
    state.chartSel = sel;
    state.chartDay = null;
  }
  const W = 320, H = 160, P = 10;
  const max = Math.max(...cum, 1);
  const xs = (i) => P + (W - 2 * P) * (i / Math.max(n - 1, 1));
  const ys = (v) => H - P - (H - 2 * P) * (v / max);
  let line = "";
  cum.forEach((v, i) => { line += (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(v).toFixed(1); });
  const area = line + ` L${xs(n - 1).toFixed(1)} ${H - P} L${xs(0).toFixed(1)} ${H - P} Z`;
  const idx = state.chartDay !== null
    ? state.chartDay
    : (sel === mKey(today()) ? Math.min(parseInt(today().slice(8, 10), 10) - 1, n - 1) : n - 1);
  const dot = `<line x1="${xs(idx).toFixed(1)}" y1="${P}" x2="${xs(idx).toFixed(1)}" y2="${H - P}" stroke="#ffffff40" stroke-dasharray="3 3"/><circle cx="${xs(idx).toFixed(1)}" cy="${ys(cum[idx]).toFixed(1)}" r="6" fill="#8b5cf6" stroke="#13151c" stroke-width="3"/>`;
  $("spendChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos acumulados no mês">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".42"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#gArea)"/>
    <path d="${line}" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dot}</svg>`;
  $("chartTotal").textContent = money(cum[idx] || 0);
  $("chartLabel").textContent = `Gastos acumulados até o dia ${idx + 1}`;
  const ticks = [1, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n];
  $("chartAxis").innerHTML = [...new Set(ticks)].map((d) => `<span>${d}</span>`).join("");

  // quanto sobra no mês e quanto por dia
  const t = totals(db, sel);
  const cur = mKey(today());
  let txt;
  if (sel < cur) {
    txt = "Mês encerrado";
  } else {
    const days = sel === cur ? n - parseInt(today().slice(8, 10), 10) + 1 : n;
    txt = t.bal >= 0
      ? `Sobra ${money(t.bal)} · ${money(t.bal / days)} por dia até o fim do mês`
      : `Faltam ${money(-t.bal)} para fechar o mês`;
  }
  $("perDay").textContent = txt;
}

// Gráfico: arrastar ou tocar escolhe o dia mostrado
function chartPick(e) {
  const r = $("spendChart").getBoundingClientRect();
  if (!r.width) return;
  const n = dim(state.sel);
  const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
  state.chartDay = Math.round(f * Math.max(n - 1, 1));
  renderChart();
}

let chartDrag = false;
export function wireChart() {
  $("spendChart").addEventListener("pointerdown", (e) => { chartDrag = true; chartPick(e); });
  window.addEventListener("pointermove", (e) => { if (chartDrag) chartPick(e); });
  window.addEventListener("pointerup", () => { chartDrag = false; });
}
