// Cartões: faturas abertas e fechadas, e seleção nos formulários.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, fmtDate, shiftMonth } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { currentCloseYm, faturaOf } from "../core/cards.js";

export function renderCards() {
  const { db } = state;
  const cards = db.cards || [];
  $("cardList").innerHTML = cards.length
    ? cards.map((c) => {
      const cy = currentCloseYm(c, today()), open = faturaOf(c, cy, db);
      const pendingYm = shiftMonth(cy, -1), pend = faturaOf(c, pendingYm, db);
      const pendingOpen = !(c.paid || []).includes(pendingYm) && pend.total > 0;
      return `<div class="row"><div class="rmain">
      <div class="t">${esc(c.name)}</div>
      <div class="s">Fatura aberta: ${money(open.total)} · fecha ${fmtDate(open.close)} · vence ${fmtDate(open.due)}</div>
      ${pendingOpen ? `<div class="s warn">Fatura fechada: ${money(pend.total)} · vence ${fmtDate(pend.due)}</div>` : ""}
      </div><div class="actions">
      ${pendingOpen ? `<button class="ghost" data-act="markFaturaPaid" data-id="${c.id}" data-ym="${pendingYm}">Marcar paga</button>` : ""}
      <button class="ico" title="Excluir cartão" data-act="delCard" data-id="${c.id}">×</button></div></div>`;
    }).join("")
    : `<div class="empty">Cadastre seus cartões para acompanhar as faturas</div>`;
}

export function populateCardSelects() {
  const opts = `<option value="">Sem cartão</option>` + (state.db.cards || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("txCard").innerHTML = opts;
  $("bCard").innerHTML = opts;
}
