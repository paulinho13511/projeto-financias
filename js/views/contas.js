// Tela Contas: contas do mês (fixas, parceladas e únicas) com status e total.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { monthLabel, fmtDate } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { occ, billStatus, remainingAfter } from "../core/billing.js";

export function renderContas() {
  const { db, sel } = state;
  $("billMonthLabel").textContent = monthLabel(sel);
  let total = 0, paid = 0;
  const rows = occ(db.bills, sel).map(({ b, amount, label }) => {
    const st = billStatus(b, sel);
    total += amount;
    if (st.key === "paid") paid += amount;
    const compra = b.kind === "parcelada" ? ` · compra de ${money(b.amount * b.parcels)}` : "";
    return `<div class="row">
      <div class="rmain"><div class="t">${esc(b.name)}<span class="tag">${label}</span><span class="tag ${st.cls}">${st.label}</span></div>
      <div class="s">${money(amount)} · vence ${fmtDate(st.due)}${compra} · ${esc(b.category)}</div></div>
      <div class="actions">
        <button class="ghost" data-act="togglePaid" data-id="${b.id}" data-ym="${sel}">${st.key === "paid" ? "Desfazer" : "Marcar paga"}</button>
        <button class="ico" title="Editar" data-edit="${esc(b.id)}" aria-label="Editar conta">✎</button>
        <button class="ico" title="Excluir" data-act="delBill" data-id="${b.id}">×</button>
      </div></div>`;
  }).join("");
  const debt = db.bills.reduce((s, b) => s + remainingAfter(b, sel) * b.amount, 0);
  $("billsList").innerHTML = db.bills.length
    ? `<div class="row" style="background:var(--accent);color:var(--ink)"><div class="t">Total do mês</div><div class="amt">${money(paid)} pagos de ${money(total)}</div></div>${rows}
      <div class="row"><div class="t">Parcelamentos a pagar depois deste mês</div><div class="amt">${money(debt)}</div></div>`
    : `<div class="empty">Cadastre contas fixas, parcelamentos ou contas únicas</div>`;
}
