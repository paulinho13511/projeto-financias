// Ações sobre registros existentes: marcar contas, excluir, limites, metas e renda variável.
import { $, ask, showToast } from "../ui/dom.js";
import { state, save } from "../state/store.js";
import { today } from "../core/dates.js";
import { renderAll, renderV13 } from "../render.js";

export function togglePaid(id, ym) {
  const { db } = state;
  const b = db.bills.find((x) => x.id === id);
  if (!b) return;
  b.paid = b.paid || [];
  const marcou = !b.paid.includes(ym);
  b.paid = b.paid.includes(ym) ? b.paid.filter((x) => x !== ym) : [...b.paid, ym];
  state.justPaid = marcou ? id : null;
  save();
  renderAll();
  state.justPaid = null;
  if (marcou) showToast("Conta marcada como paga");
}

export function markFaturaPaid(cardId, closeYm) {
  const c = (state.db.cards || []).find((x) => x.id === cardId);
  if (!c) return;
  c.paid = c.paid || [];
  if (!c.paid.includes(closeYm)) c.paid.push(closeYm);
  save();
  renderAll();
  showToast("Fatura marcada como paga");
}

export async function delCard(id) {
  if (!(await ask("Excluir este cartão? As compras já lançadas continuam no histórico."))) return;
  state.db.cards = (state.db.cards || []).filter((c) => c.id !== id);
  save();
  renderAll();
}

export async function delBill(id) {
  if (!(await ask("Excluir esta conta? Todas as parcelas dela também serão removidas."))) return;
  state.db.bills = state.db.bills.filter((b) => b.id !== id);
  save();
  renderAll();
}

export async function delTx(id) {
  if (!(await ask("Remover este lançamento?"))) return;
  state.db.tx = state.db.tx.filter((t) => t.id !== id);
  save();
  renderAll();
}

export function setBudget(cat, val) {
  const v = parseFloat(val);
  if (!v || v <= 0) delete state.db.budgets[cat];
  else state.db.budgets[cat] = v;
  save();
  renderAll();
}

// Metas: depositar valor ou excluir
async function onGoalListClick(e) {
  const { db } = state;
  const add = e.target.closest("[data-gadd]"), del = e.target.closest("[data-gdel]");
  if (add) {
    const g = db.goals.find((x) => x.id === add.dataset.gadd);
    const input = document.querySelector(`[data-gin="${CSS.escape(g.id)}"]`);
    const v = parseFloat(input.value);
    if (!(v > 0)) {
      showToast("Digite um valor");
      return;
    }
    g.saved = Math.round((g.saved + v) * 100) / 100;
    g.log = [...(g.log || []), { d: today(), v }];
    save();
    renderV13();
    showToast(g.saved >= g.target ? "Meta alcançada!" : "Valor guardado");
  } else if (del) {
    const g = db.goals.find((x) => x.id === del.dataset.gdel);
    if (!g) return;
    if (!(await ask(`Excluir a meta "${g.name}"?`))) return;
    db.goals = db.goals.filter((x) => x.id !== g.id);
    save();
    renderV13();
  }
}

// Delegação de cliques com data-act (sem handlers inline, compatível com CSP sem unsafe-inline)
const ACTIONS = {
  delTx: (d) => delTx(d.id),
  delBill: (d) => delBill(d.id),
  delCard: (d) => delCard(d.id),
  togglePaid: (d) => togglePaid(d.id, d.ym),
  markFaturaPaid: (d) => markFaturaPaid(d.id, d.ym),
};

export function wireRecords() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("button[data-act]");
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("input[data-act='setBudget']");
    if (el) setBudget(el.dataset.cat, el.value);
  });
  $("goalList").onclick = onGoalListClick;
  $("varIncome").onchange = (e) => {
    state.db.settings = { ...(state.db.settings || {}), variable: e.target.checked };
    save();
    renderV13();
  };
}
