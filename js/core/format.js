// Formatação e utilidades sem dependência de DOM.

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Modo privado: quando ativo, os valores em reais aparecem mascarados
let masked = false;
export const setMasked = (v) => { masked = v; };
export const money = (v) => (masked ? "R$ ****" : BRL.format(v));

export const pad = (n) => String(n).padStart(2, "0");

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
