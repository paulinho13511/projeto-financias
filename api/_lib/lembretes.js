var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var logic_exports = {};
__export(logic_exports, {
  buildReminders: () => buildReminders,
  closeDateOf: () => closeDateOf,
  currentCloseYm: () => currentCloseYm,
  daysBetween: () => daysBetween,
  dueDateOfFatura: () => dueDateOfFatura,
  dueOf: () => dueOf,
  faturaOf: () => faturaOf,
  money: () => money,
  occ: () => occ,
  owedInMonth: () => owedInMonth,
  shiftMonth: () => shiftMonth,
  todaySP: () => todaySP
});
module.exports = __toCommonJS(logic_exports);
const pad = (n) => String(n).padStart(2, "0");
const parts = (s) => s.split("-").map(Number);
const dim = (ym) => {
  const [y, m] = parts(ym);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const ymd = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const mKey = (s) => s.slice(0, 7);
const shiftMonth = (ym, delta) => {
  const [y, m] = parts(ym);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
};
const monthDiff = (a, b) => {
  const [ay, am] = parts(a), [by, bm] = parts(b);
  return (by - ay) * 12 + (bm - am);
};
const daysBetween = (a, b) => {
  const [ay, am, ad] = parts(a), [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
};
const money = (v) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const round2 = (v) => Math.round(v * 100) / 100;
const MAX_LATE_DAYS = 7;
function todaySP(now = /* @__PURE__ */ new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now);
}
function dueOf(b, ym) {
  if (b.kind === "unica") return b.date;
  const [y, m] = parts(ym);
  return ymd(y, m, Math.min(b.day, dim(ym)));
}
function occ(bills, ym) {
  const out = [];
  bills.forEach((b) => {
    const kind = b.kind || "mensal";
    if (kind === "unica") {
      if (mKey(b.date) === ym) out.push({ b, amount: b.amount });
      return;
    }
    if (kind === "parcelada") {
      const i = monthDiff(b.start, ym);
      if (i >= 0 && i < b.parcels) out.push({ b, amount: b.last != null && i === b.parcels - 1 ? b.last : b.amount });
      return;
    }
    if ((!b.start || ym >= b.start) && (!b.end || ym <= b.end)) out.push({ b, amount: b.amount });
  });
  return out;
}
function closeDateOf(card, ym) {
  const [y, m] = parts(ym);
  return ymd(y, m, Math.min(card.closeDay, dim(ym)));
}
function dueDateOfFatura(card, closeYm) {
  const dueYm = card.dueDay > card.closeDay ? closeYm : shiftMonth(closeYm, 1);
  const [y, m] = parts(dueYm);
  return ymd(y, m, Math.min(card.dueDay, dim(dueYm)));
}
function faturaOf(data, card, closeYm) {
  const close = closeDateOf(card, closeYm);
  const prevClose = closeDateOf(card, shiftMonth(closeYm, -1));
  let total = 0;
  [shiftMonth(closeYm, -1), closeYm].forEach((ym) => {
    data.tx.filter((t) => mKey(t.date) === ym && t.type === "expense" && t.card === card.id).forEach((t) => {
      if (t.date > prevClose && t.date <= close) total += t.amount;
    });
    occ(data.bills, ym).filter((o) => o.b.card === card.id).forEach((o) => {
      const d = dueOf(o.b, ym);
      if (d > prevClose && d <= close) total += o.amount;
    });
  });
  return { close, closeYm, due: dueDateOfFatura(card, closeYm), total: round2(total) };
}
function currentCloseYm(card, today) {
  const cm = mKey(today);
  return closeDateOf(card, cm) >= today ? cm : shiftMonth(cm, 1);
}
function owedInMonth(data, today) {
  const cur = mKey(today);
  let total = 0;
  occ(data.bills, cur).forEach(({ b, amount }) => {
    if (b.card) return;
    if (!(b.paid || []).includes(cur)) total += amount;
  });
  (data.cards || []).forEach((c) => {
    const closeYm = c.dueDay > c.closeDay ? cur : shiftMonth(cur, -1);
    if ((c.paid || []).includes(closeYm)) return;
    total += faturaOf(data, c, closeYm).total;
  });
  return round2(total);
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function buildReminders(data, today) {
  const out = [];
  const cur = mKey(today);
  const owed = owedInMonth(data, today);
  const tail = owed > 0 ? ` · Em aberto no mês: ${money(owed)}` : "";
  if (today.endsWith("-01") && owed > 0) {
    const [, m] = parts(cur);
    out.push({ key: `sum:${cur}`, title: `Resumo de ${MESES[m - 1]}`, body: `Você tem ${money(owed)} em contas e faturas em aberto neste mês.` });
  }
  [shiftMonth(cur, -1), cur, shiftMonth(cur, 1)].forEach((ym) => {
    occ(data.bills, ym).forEach(({ b, amount }) => {
      if (b.card) return;
      if ((b.paid || []).includes(ym)) return;
      const d = daysBetween(today, dueOf(b, ym));
      if (d > 2 || d < -MAX_LATE_DAYS) return;
      const title = d < 0 ? `Conta atrasada há ${-d} dia(s)` : d === 0 ? "Conta vence hoje" : d === 1 ? "Conta vence amanhã" : `Conta vence em ${d} dias`;
      const tag = d < 0 ? `late${-d}` : d === 0 ? "today" : `soon${d}`;
      out.push({ key: `bill:${b.id}:${ym}:${tag}`, title, body: `${b.name}: ${money(amount)}${tail}` });
    });
  });
  (data.cards || []).forEach((c) => {
    const cy = currentCloseYm(c, today);
    const open = faturaOf(data, c, cy);
    const dClose = daysBetween(today, open.close);
    if (dClose === 0) out.push({ key: `close:${c.id}:${cy}:0`, title: `${c.name}: fatura fecha hoje`, body: `Valor até agora: ${money(open.total)}${tail}` });
    else if (dClose > 0 && dClose <= 3) out.push({ key: `close:${c.id}:${cy}:${dClose}`, title: `${c.name}: fatura fecha em ${dClose} dia(s)`, body: `Valor até agora: ${money(open.total)}${tail}` });
    [shiftMonth(cy, -1), cy].forEach((ym) => {
      if ((c.paid || []).includes(ym)) return;
      const f = faturaOf(data, c, ym);
      if (f.total <= 0) return;
      const d = daysBetween(today, f.due);
      if (d > 3 || d < -MAX_LATE_DAYS) return;
      if (d < 0) out.push({ key: `due:${c.id}:${ym}:late${-d}`, title: `${c.name}: fatura vencida há ${-d} dia(s)`, body: `${money(f.total)} venceu em ${f.due.split("-").reverse().join("/")}. Pague logo para evitar juros e multa.${tail}` });
      else if (d === 0) out.push({ key: `due:${c.id}:${ym}:0`, title: `${c.name}: fatura vence hoje`, body: `${money(f.total)}. Pague hoje para evitar juros.${tail}` });
      else out.push({ key: `due:${c.id}:${ym}:${d}`, title: d === 1 ? `${c.name}: fatura vence amanhã` : `${c.name}: fatura vence em ${d} dias`, body: `${money(f.total)} até ${f.due.split("-").reverse().join("/")}${tail}` });
    });
  });
  return out;
}
