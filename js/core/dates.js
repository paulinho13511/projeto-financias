// Datas no formato "YYYY-MM-DD" e meses "YYYY-MM". Todas as funções são puras,
// exceto today(), que lê o relógio do aparelho.
import { pad } from "./format.js";

export const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const today = () => ymd(new Date());
export const mKey = (s) => s.slice(0, 7);
export const parts = (s) => s.split("-").map(Number);

export const dim = (ym) => {
  const [y, m] = parts(ym);
  return new Date(y, m, 0).getDate();
};

export const monthDiff = (a, b) => {
  const [ay, am] = parts(a), [by, bm] = parts(b);
  return (by - ay) * 12 + (bm - am);
};

export const daysBetween = (a, b) => {
  const [ay, am, ad] = parts(a), [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
};

export const shiftMonth = (ym, delta) => {
  const [y, m] = parts(ym);
  return ymd(new Date(y, m - 1 + delta, 1)).slice(0, 7);
};

export const monthLabel = (ym) => {
  const [y, m] = parts(ym);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export const fmtDate = (s, long) => {
  const [y, m, d] = parts(s);
  return new Date(y, m - 1, d).toLocaleDateString(
    "pt-BR",
    long ? { weekday: "long", day: "numeric", month: "long" } : { day: "2-digit", month: "2-digit" },
  );
};

// Data no formato brasileiro DD/MM/AAAA (usada em exportações)
export const brDate = (s) => {
  const [y, m, d] = parts(s);
  return `${pad(d)}/${pad(m)}/${y}`;
};
