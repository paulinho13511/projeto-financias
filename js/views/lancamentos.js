// Lançamentos: histórico com busca, filtros e ordenação, atalhos de lançamentos frequentes e chips de cartão.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { fmtDate } from "../core/dates.js";
import { esc } from "../core/format.js";
import { sortedTx } from "../core/ledger.js";
import { filtrarTransacoes } from "../core/feed.js";
import { txRow } from "./inicio.js";

export function renderFeed() {
  const q = $("search").value.trim().toLowerCase();
  const ft = $("filterType").value, sort = $("fSort").value;
  const from = $("fFrom").value, to = $("fTo").value;
  const items = filtrarTransacoes(sortedTx(state.db.tx), { q, ft, from, to, cards: state.fCards, sort });
  if (!items.length) {
    $("feed").innerHTML = `<div class="empty">Nada encontrado</div>`;
    return;
  }
  let html = "", last = "";
  items.forEach((t) => {
    if (sort === "recent" && t.date !== last) {
      last = t.date;
      html += `<div class="day">${fmtDate(t.date, true)}</div>`;
    }
    html += txRow(t);
  });
  $("feed").innerHTML = `<div class="list">${html}</div>`;
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
