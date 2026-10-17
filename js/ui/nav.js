// Navegação entre as telas (barra inferior, menu lateral e atalhos).
import { $ } from "./dom.js";
import { state } from "../state/store.js";
import { TITLES } from "../core/constants.js";

export function go(v) {
  state.currentView = v;
  const view = v === "metas" ? "ins" : v; // Metas fica dentro de Insights (card "Metas e caixinhas")
  document.querySelectorAll(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + view));
  document.querySelectorAll("[data-nav]").forEach((x) => x.classList.toggle("on", x.dataset.nav === v && !x.classList.contains("sideNew")));
  $("pageTitle").textContent = TITLES[v] || "Início";
  $("menu").hidden = true;
  window.scrollTo({ top: 0, behavior: "auto" });
  if (v === "metas") requestAnimationFrame(() => $("goalCard").scrollIntoView({ block: "start", behavior: "smooth" }));
}

export function wireNav() {
  document.querySelectorAll("[data-nav]").forEach((b) => { b.onclick = () => go(b.dataset.nav); });
  document.querySelectorAll("[data-go]").forEach((b) => { b.onclick = () => go(b.dataset.go); });
  $("navMais").onclick = () => { $("menu").hidden = false; };
  $("menuBtn").onclick = () => { $("menu").hidden = false; };
  $("menuClose").onclick = () => { $("menu").hidden = true; };
  $("menu").onclick = (e) => { if (e.target.id === "menu") $("menu").hidden = true; };
}
