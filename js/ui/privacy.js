// Modo privado: oculta os valores em reais (money mostra "R$ ****") e guarda a preferência neste aparelho.
import { $ } from "./dom.js";
import { state } from "../state/store.js";
import { setMasked } from "../core/format.js";
import { renderAll } from "../render.js";

export function initPrivacy() {
  try {
    state.privacy = localStorage.getItem("fin_priv") === "1";
  } catch (e) {
    // armazenamento bloqueado: começa com os valores visíveis
  }
  setMasked(state.privacy);
  $("privBtn").onclick = () => setPrivacy(!state.privacy);
  $("privBtn").setAttribute("aria-pressed", String(state.privacy));
}

function setPrivacy(v) {
  state.privacy = v;
  try {
    localStorage.setItem("fin_priv", v ? "1" : "0");
  } catch (e) {
    // sem persistência: a preferência vale só nesta sessão
  }
  setMasked(v);
  $("privBtn").setAttribute("aria-pressed", String(v));
  if (state.db) renderAll();
}
