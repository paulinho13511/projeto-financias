// Tela inicial com blocos em ordem personalizável (guardada neste aparelho).
import { $ } from "./dom.js";
import { state } from "../state/store.js";
import { esc } from "../core/format.js";

const HOME_BLOCKS = [
  ["heroCard", "Saldo do mês"],
  ["pulse", "Destaques do mês"],
  ["chartCard", "Gastos no mês"],
  ["nextBill", "Próxima conta"],
  ["remindersCard", "Lembretes de contas"],
  ["homeLower", "Notificações e últimos lançamentos"],
];
const HOME_KEY = "fin_home_order";

function homeOrder() {
  const ids = HOME_BLOCKS.map((b) => b[0]);
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
    if (Array.isArray(saved) && saved.length === ids.length && ids.every((i) => saved.includes(i))) return saved;
  } catch (e) {
    // ordem salva inválida ou armazenamento bloqueado: usa a ordem padrão
  }
  return ids;
}

// order começa em 1 para que a barra de controles (order 0) fique sempre no topo
function applyHomeOrder(order) {
  order.forEach((id, i) => {
    const el = $(id);
    if (el) el.style.order = i + 1;
  });
}

function renderHomePanel(order) {
  const panel = $("homeOrderPanel");
  panel.hidden = !state.homeEdit;
  if (!state.homeEdit) {
    panel.innerHTML = "";
    return;
  }
  panel.innerHTML = order.map((id, i) => {
    const label = HOME_BLOCKS.find((b) => b[0] === id)[1];
    return `<div class="ordRow">
      <span class="ordN">${i + 1}</span>
      <span class="ordL">${esc(label)}</span>
      <button class="ico" type="button" data-mv="-1" data-id="${id}" ${i === 0 ? "disabled" : ""} aria-label="Subir ${esc(label)}">↑</button>
      <button class="ico" type="button" data-mv="1" data-id="${id}" ${i === order.length - 1 ? "disabled" : ""} aria-label="Descer ${esc(label)}">↓</button>
    </div>`;
  }).join("") + `<button class="ghost" id="homeReset" type="button">Restaurar ordem padrão</button>`;
}

function moveHome(id, dir) {
  const order = homeOrder().slice(), i = order.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify(order));
  } catch (e) {
    // sem persistência: a ordem vale só nesta sessão
  }
  applyHomeOrder(order);
  renderHomePanel(order);
}

export function initHome() {
  applyHomeOrder(homeOrder());
}

export function wireHome() {
  $("orgBtn").onclick = () => {
    state.homeEdit = !state.homeEdit;
    $("orgBtn").textContent = state.homeEdit ? "Concluir" : "Organizar blocos";
    $("orgBtn").setAttribute("aria-pressed", String(state.homeEdit));
    renderHomePanel(homeOrder());
  };
  $("homeOrderPanel").onclick = (e) => {
    const b = e.target.closest("[data-mv]");
    if (b) {
      moveHome(b.dataset.id, +b.dataset.mv);
      return;
    }
    if (e.target.closest("#homeReset")) {
      try {
        localStorage.removeItem(HOME_KEY);
      } catch (x) {
        // sem armazenamento: nada a remover
      }
      applyHomeOrder(homeOrder());
      renderHomePanel(homeOrder());
    }
  };
}
