// Modo privado: oculta receitas e saldo com desfoque (CSS: body.priv [data-priv]).
// Não redesenha a tela: só alterna a classe e guarda a preferência neste aparelho.
import { $ } from "./dom.js";
import { state } from "../state/store.js";

export function initPrivacy() {
  try {
    state.privacy = localStorage.getItem("fin_priv") === "1";
  } catch (e) {
    // armazenamento bloqueado: começa com os valores visíveis
  }
  document.body.classList.toggle("priv", state.privacy);
  $("privBtn").setAttribute("aria-pressed", String(state.privacy));
  $("privBtn").onclick = () => setPrivacy(!state.privacy);
}

function setPrivacy(v) {
  state.privacy = v;
  try {
    localStorage.setItem("fin_priv", v ? "1" : "0");
  } catch (e) {
    // sem persistência: a preferência vale só nesta sessão
  }
  document.body.classList.toggle("priv", v);
  $("privBtn").setAttribute("aria-pressed", String(v));
  $("privBtn").setAttribute("aria-label", v ? "Mostrar valores" : "Ocultar valores");
}
