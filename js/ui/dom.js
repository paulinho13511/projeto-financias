// Utilitários de interface: acesso ao DOM, avisos, confirmação própria e animações.
import { money } from "../core/format.js";

export const $ = (id) => document.getElementById(id);

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let toastTimer;
export function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// Confirmação própria (o visualizador do navegador bloqueia a caixa padrão)
export function ask(msg) {
  return new Promise((resolve) => {
    $("modalMsg").textContent = msg;
    $("modal").hidden = false;
    const done = (v) => {
      $("modal").hidden = true;
      $("mYes").onclick = null;
      $("mNo").onclick = null;
      resolve(v);
    };
    $("mYes").onclick = () => done(true);
    $("mNo").onclick = () => done(false);
  });
}

const easeOut = (p) => 1 - Math.pow(1 - p, 3);

export function countUp(el, to, duration) {
  const from = parseFloat(el.dataset.value) || 0;
  el.dataset.value = to;
  if (reduceMotion || from === to) {
    el.textContent = money(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / (duration || 600), 1);
    el.textContent = money(from + (to - from) * easeOut(p));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function animateBars() {
  if (reduceMotion) return;
  document.querySelectorAll(".bar i,.hbar").forEach((bar) => {
    const h = bar.style.height, w = bar.style.width;
    bar.style.transition = "none";
    if (h) bar.style.height = "0%";
    if (w) bar.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = "all .9s cubic-bezier(.22,1,.36,1)";
      if (h) bar.style.height = h;
      if (w) bar.style.width = w;
    }));
  });
}

export function stagger(el, step) {
  if (reduceMotion || !el) return;
  [...el.children].forEach((child, i) => {
    child.style.animation = "enter .42s cubic-bezier(.22,1,.36,1) " + (Math.min(i, 12) * (step || 45)) + "ms both";
  });
}
