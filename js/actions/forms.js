// Formulários de cadastro e edição: lançamento, conta (fixa/parcelada/única), cartão, meta e edição de conta.
import { $, showToast } from "../ui/dom.js";
import { state, save } from "../state/store.js";
import { today, mKey, shiftMonth } from "../core/dates.js";
import { money, esc, uid } from "../core/format.js";
import { CATS, ICATS } from "../core/constants.js";
import { renderAll, renderV13 } from "../render.js";

// ---------- lançamento (despesa, receita ou compra parcelada) ----------
function updateTxParc() {
  const parc = $("txParc").value === "parc";
  $("txParcBox").hidden = !parc;
  $("txParcels").required = parc;
  const n = parseInt($("txParcels").value, 10) || 0, a = parseFloat($("txAmt").value) || 0;
  $("txParcInfo").textContent = parc && n > 0 && a > 0 ? `${n}x de ${money(a / n)}` : "";
}

function onTxSubmit(e) {
  e.preventDefault();
  const { db } = state;
  const type = document.querySelector('input[name="type"]:checked').value;
  const date = $("txDate").value;
  const desc = $("txDesc").value.trim(), amount = parseFloat($("txAmt").value);
  const category = $("txCat").value, card = $("txCard").value || null;
  if ($("txParc").value === "parc") {
    if (type === "income") {
      showToast("Parcelamento só vale para despesas");
      return;
    }
    const n = Math.min(120, Math.max(2, parseInt($("txParcels").value, 10)));
    db.bills.push({
      id: uid(), kind: "parcelada", name: desc, amount: Math.round((amount / n) * 100) / 100,
      parcels: n, start: mKey(date), day: parseInt(date.slice(8, 10), 10), category, card, paid: [],
    });
    showToast(`Compra parcelada em ${n}x cadastrada`);
  } else {
    db.tx.push({ id: uid(), type, desc, amount, date, category, card, created: Date.now() });
    showToast("Lançamento adicionado");
  }
  save();
  e.target.reset();
  $("txDate").value = today();
  updateTxParc();
  state.sel = mKey(date);
  renderAll();
}

// ---------- conta fixa, parcelada ou única ----------
function syncBillForm() {
  const kind = document.querySelector('input[name="kind"]:checked').value;
  $("bDay").hidden = kind === "unica";
  $("bDay").required = kind !== "unica";
  $("bDate").hidden = kind !== "unica";
  $("bDate").required = kind === "unica";
  $("endBox").hidden = kind !== "mensal";
  const until = kind === "mensal" && $("bEndType").value === "until";
  $("bEnd").hidden = !until;
  $("bEnd").required = until;
  if (!$("bEnd").value) $("bEnd").value = shiftMonth(mKey(today()), 12);
  $("parcBox").hidden = kind !== "parcelada";
  $("bParcels").required = kind === "parcelada";
  $("bStart").required = kind === "parcelada";
  if (!$("bDate").value) $("bDate").value = today();
  if (!$("bStart").value) $("bStart").value = mKey(today());
  updateParcTotal();
}

function updateParcTotal() {
  const kind = document.querySelector('input[name="kind"]:checked').value;
  const a = parseFloat($("bAmt").value) || 0, n = parseInt($("bParcels").value, 10) || 0;
  const box = $("parcTotal");
  box.hidden = !(kind === "parcelada" && a > 0 && n > 0);
  box.textContent = `Total da compra: ${money(a * n)} em ${n} parcelas de ${money(a)}`;
}

function onBillSubmit(e) {
  e.preventDefault();
  const kind = document.querySelector('input[name="kind"]:checked').value;
  const b = {
    id: uid(), kind, name: $("bName").value.trim(), amount: parseFloat($("bAmt").value),
    category: $("bCat").value, card: $("bCard").value || null, paid: [],
  };
  if (kind === "unica") b.date = $("bDate").value;
  else b.day = Math.min(31, Math.max(1, parseInt($("bDay").value, 10)));
  if (kind === "parcelada") {
    b.parcels = Math.min(120, Math.max(2, parseInt($("bParcels").value, 10)));
    b.start = $("bStart").value;
  }
  if (kind === "mensal") {
    b.start = mKey(today());
    if ($("bEndType").value === "until") b.end = $("bEnd").value;
  }
  if (kind === "mensal" && $("bSub").checked) b.sub = true;
  state.db.bills.push(b);
  save();
  e.target.reset();
  syncBillForm();
  renderAll();
  showToast(kind === "parcelada" ? "Parcelamento cadastrado" : "Conta cadastrada");
}

// ---------- edição de conta ----------
function openEdit(id) {
  const { db } = state;
  const b = db.bills.find((x) => x.id === id);
  if (!b) return;
  const kind = b.kind || "mensal";
  $("eId").value = b.id;
  $("eName").value = b.name;
  $("eAmt").value = b.amount;
  $("eCat").innerHTML = CATS.map((c) => `<option ${c === b.category ? "selected" : ""}>${c}</option>`).join("");
  $("eCard").innerHTML = `<option value="">Sem cartão</option>` + (db.cards || []).map((c) => `<option value="${esc(c.id)}" ${c.id === b.card ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const isUnica = kind === "unica", isMensal = kind === "mensal";
  $("eDay").hidden = isUnica;
  $("eDay").required = !isUnica;
  $("eDay").value = b.day || "";
  $("eDate").hidden = !isUnica;
  $("eDate").required = isUnica;
  $("eDate").value = b.date || "";
  $("eEndType").hidden = !isMensal;
  $("eEnd").hidden = !(isMensal && b.end);
  $("eEndType").value = isMensal && b.end ? "until" : "forever";
  $("eEnd").value = b.end || "";
  $("eSubBox").hidden = !isMensal;
  $("eSub").checked = !!b.sub;
  $("eNote").hidden = kind !== "parcelada";
  $("eNote").textContent = kind === "parcelada"
    ? "Parcelamento: dá para alterar nome, valor da parcela, dia, cartão e categoria. Número de parcelas e início não mudam."
    : "";
  $("editSheet").hidden = false;
}

function onEditSubmit(e) {
  e.preventDefault();
  const b = state.db.bills.find((x) => x.id === $("eId").value);
  if (!b) return;
  const kind = b.kind || "mensal";
  b.name = $("eName").value.trim();
  b.amount = parseFloat($("eAmt").value);
  b.category = $("eCat").value;
  b.card = $("eCard").value || null;
  if (kind === "unica") {
    b.date = $("eDate").value;
  } else {
    b.day = Math.min(31, Math.max(1, parseInt($("eDay").value, 10)));
  }
  if (kind === "mensal") {
    if ($("eEndType").value === "until" && $("eEnd").value) b.end = $("eEnd").value;
    else delete b.end;
    if ($("eSub").checked) b.sub = true;
    else delete b.sub;
  }
  save();
  $("editSheet").hidden = true;
  renderAll();
  showToast("Conta atualizada");
}

// ---------- cartão ----------
function onCardSubmit(e) {
  e.preventDefault();
  const { db } = state;
  db.cards = db.cards || [];
  db.cards.push({
    id: uid(),
    name: $("cName").value.trim(),
    closeDay: Math.min(31, Math.max(1, parseInt($("cClose").value, 10))),
    dueDay: Math.min(31, Math.max(1, parseInt($("cDue").value, 10))),
    paid: [],
  });
  save();
  e.target.reset();
  renderAll();
  showToast("Cartão cadastrado");
}

// ---------- meta ----------
function onGoalSubmit(e) {
  e.preventDefault();
  const name = $("gName").value.trim(), target = parseFloat($("gTarget").value), deadline = $("gDeadline").value;
  if (!name || !(target > 0) || !deadline) {
    showToast("Preencha nome, valor e prazo");
    return;
  }
  state.db.goals = state.db.goals || [];
  state.db.goals.push({ id: uid(), name, target, deadline, saved: 0 });
  save();
  e.target.reset();
  renderV13();
  showToast("Meta criada");
}

// Liga os formulários e define os valores iniciais dos campos (mesma ordem da versão anterior)
export function wireForms() {
  $("txForm").onsubmit = onTxSubmit;
  $("billForm").onsubmit = onBillSubmit;
  $("editForm").onsubmit = onEditSubmit;
  $("cardForm").onsubmit = onCardSubmit;
  $("goalForm").onsubmit = onGoalSubmit;
  $("eEndType").onchange = () => {
    $("eEnd").hidden = $("eEndType").value !== "until";
    if (!$("eEnd").value) $("eEnd").value = mKey(today());
  };
  $("eClose").onclick = () => { $("editSheet").hidden = true; };
  $("billsList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (btn) openEdit(btn.dataset.edit);
  });
}

export function initForms() {
  $("txCat").innerHTML = [...new Set([...CATS, ...ICATS])].map((c) => `<option>${c}</option>`).join("");
  $("bCat").innerHTML = CATS.map((c) => `<option>${c}</option>`).join("");
  $("txDate").value = today();
  document.querySelectorAll('input[name="kind"]').forEach((r) => { r.onchange = syncBillForm; });
  ["bAmt", "bParcels", "bStart"].forEach((id) => $(id).addEventListener("input", updateParcTotal));
  syncBillForm();
  $("bEndType").onchange = syncBillForm;
  $("txParc").onchange = updateTxParc;
  $("txParcels").addEventListener("input", updateTxParc);
  $("txAmt").addEventListener("input", updateTxParc);
}
