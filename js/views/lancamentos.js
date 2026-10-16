// Lançamentos: histórico do mês com filtros, atalhos de lançamentos frequentes e chips de cartão.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { fmtDate } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { linhasDoMes, resumoLinhas, filtrarLinhas } from "../core/feed.js";

function histRow(r) {
  const inc = r.type === "income";
  let tags, sub, action;
  if (r.kind === "tx") {
    tags = inc ? `<span class="tag ok">Recebido</span>` : `<span class="tag">Pago</span>`;
    sub = `${esc(r.category)} · ${fmtDate(r.date)}`;
    action = `<button class="ico" title="Remover" data-act="delTx" data-id="${r.t.id}">×</button>`;
  } else {
    const st = r.st, paid = st.key === "paid", late = st.key === "late" || st.key === "today";
    const label = paid ? "Pago" : late ? "Atrasado" : "A pagar";
    const cls = paid ? "ok" : late ? "late" : "soon";
    tags = `<span class="tag ${cls}">${label}</span><span class="tag">${esc(r.o.label)}</span>`;
    sub = `Conta · ${esc(r.category)} · vence ${fmtDate(r.date)}`;
    action = `<button class="ghost" data-act="togglePaid" data-id="${r.o.b.id}" data-ym="${state.sel}">${paid ? "Desfazer" : "Marcar paga"}</button>`;
  }
  const flash = r.kind === "bill" && state.justPaid === r.o.b.id ? " flash" : "";
  return `<div class="row${flash}"><div class="ic ${inc ? "" : "out"}">${esc(r.category.charAt(0))}</div><div class="rmain"><div class="t">${esc(r.desc)} ${tags}</div><div class="s">${sub}</div></div><div class="actions"><span class="amt ${inc ? "income" : "expense"}">${inc ? "+" : "−"} ${money(r.amount)}</span>${action}</div></div>`;
}

export function renderFeed() {
  const q = $("search").value.trim().toLowerCase();
  const ft = $("filterType").value, sort = $("fSort").value;
  const from = $("fFrom").value, to = $("fTo").value;
  const rows = linhasDoMes(state.db, state.sel);
  const { recebido, pago, aPagar } = resumoLinhas(rows);
  const { items, porData } = filtrarLinhas(rows, { q, ft, from, to, cards: state.fCards, sort });
  const resumo = `<div class="hsum">
    <div><span>Recebido</span><b class="income" data-priv>${money(recebido)}</b></div>
    <div><span>Pago</span><b>${money(pago)}</b></div>
    <div><span>A pagar</span><b class="expense">${money(aPagar)}</b></div></div>`;
  let html = "", last = "";
  items.forEach((r) => {
    if (porData && r.date !== last) {
      last = r.date;
      html += `<div class="day">${fmtDate(r.date, true)}</div>`;
    }
    html += histRow(r);
  });
  $("feed").innerHTML = resumo + (items.length
    ? `<div class="list">${html}</div>`
    : `<div class="empty">Nada encontrado neste mês</div>`);
}

export function renderQuick() {
  const freq = {};
  state.db.tx.filter((t) => t.type === "expense").forEach((t) => {
    const k = t.desc.trim();
    if (!k) return;
    const f = freq[k] || { desc: k, cat: t.category, amt: t.amount, n: 0 };
    f.n++;
    f.cat = t.category;
    f.amt = t.amount;
    freq[k] = f;
  });
  const top = Object.values(freq).sort((a, b) => b.n - a.n).slice(0, 6);
  $("quick").innerHTML = top.length
    ? top.map((f, i) => `<button type="button" class="chip" data-q="${i}">${esc(f.desc)}</button>`).join("")
    : `<span class="muted" style="font-size:13px">Seus lançamentos mais usados aparecem aqui</span>`;
  $("quick").querySelectorAll("[data-q]").forEach((b) => {
    b.onclick = () => {
      const f = top[+b.dataset.q];
      $("txDesc").value = f.desc;
      if ([...$("txCat").options].some((o) => o.value === f.cat)) $("txCat").value = f.cat;
      $("txAmt").value = f.amt;
      $("txAmt").focus();
    };
  });
}

export function renderCardChips() {
  const opts = [["none", "Sem cartão"], ...(state.db.cards || []).map((c) => [c.id, c.name])];
  $("fCards").innerHTML = opts.map(([id, name]) => `<button type="button" class="chip" aria-pressed="${state.fCards.has(id)}" data-fc="${esc(id)}">${esc(name)}</button>`).join("");
  $("fCards").querySelectorAll("[data-fc]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.fc;
      if (state.fCards.has(id)) state.fCards.delete(id);
      else state.fCards.add(id);
      renderCardChips();
    };
  });
}
