// Ponto único de redesenho: atualiza todas as telas a partir do estado atual.
import { $, stagger } from "./ui/dom.js";
import { state } from "./state/store.js";
import { today, mKey, shiftMonth, monthLabel } from "./core/dates.js";
import { renderInicio, renderNext, renderChart } from "./views/inicio.js";
import { renderContas } from "./views/contas.js";
import { renderCal } from "./views/calendario.js";
import { renderCardChips, renderFeed, renderQuick } from "./views/lancamentos.js";
import { renderRev, renderHist, renderDonut, renderCmp } from "./views/categorias.js";
import { renderIns, renderVar } from "./views/insights.js";
import { renderGoals } from "./views/metas.js";
import { renderSubs } from "./views/assinaturas.js";
import { renderCards, populateCardSelects } from "./views/cartoes.js";

function populateMonths() {
  const now = mKey(today());
  const set = new Set([now, shiftMonth(now, 1), shiftMonth(now, 2), state.sel]);
  state.db.tx.forEach((t) => set.add(mKey(t.date)));
  const list = [...set].sort().reverse();
  $("month").innerHTML = list.map((k) => `<option value="${k}" ${k === state.sel ? "selected" : ""}>${monthLabel(k)}</option>`).join("");
}

// Blocos da aba Início e da análise mensal que dependem de outros dados
export function renderV13() {
  if (!state.db) return;
  renderQuick();
  renderDonut();
  renderCmp();
  renderVar();
  renderGoals();
  renderSubs();
}

export function renderAll() {
  populateMonths();
  renderCardChips();
  renderInicio();
  renderChart();
  renderNext();
  renderFeed();
  renderContas();
  renderCal();
  renderRev();
  renderHist();
  renderIns();
  renderCards();
  populateCardSelects();
  renderV13();
  stagger($("reminders"));
  stagger($("notifs"));
  stagger($("recent"));
  stagger($("billsList"));
  stagger($("catList"));
  stagger($("top"));
  stagger($("insBody"), 80);
  stagger($("calGrid"), 10);
}
