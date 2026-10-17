// Filtros do histórico e troca de mês.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { renderAll } from "../render.js";
import { renderFeed } from "../views/lancamentos.js";

export function wireFilters() {
  $("month").onchange = (e) => {
    state.sel = e.target.value;
    renderAll();
  };
  $("search").oninput = () => renderFeed();
  $("filterType").onchange = () => renderFeed();
  ["fFrom", "fTo", "fSort"].forEach((id) => $(id).addEventListener("change", () => renderFeed()));
}
