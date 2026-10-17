// Cartões de crédito: fechamento, vencimento e faturas. Funções puras.
import { parts, mKey, dim, shiftMonth, ymd, today, daysBetween, fmtDate } from "./dates.js";
import { money } from "./format.js";
import { dueOf, occ } from "./billing.js";
import { txOf } from "./ledger.js";

const closeDateOf = (card, ym) => {
  const [y, m] = parts(ym);
  return ymd(new Date(y, m - 1, Math.min(card.closeDay, dim(ym))));
};

function dueDateOfFatura(card, closeYm) {
  const dueYm = card.dueDay > card.closeDay ? closeYm : shiftMonth(closeYm, 1);
  const [y, m] = parts(dueYm);
  return ymd(new Date(y, m - 1, Math.min(card.dueDay, dim(dueYm))));
}

// Fatura que fecha no mês closeYm: compras com data entre o fechamento anterior e este
export function faturaOf(card, closeYm, db) {
  const close = closeDateOf(card, closeYm);
  const prevClose = closeDateOf(card, shiftMonth(closeYm, -1));
  const items = [];
  [shiftMonth(closeYm, -1), closeYm].forEach((ym) => {
    txOf(db.tx, ym)
      .filter((t) => t.type === "expense" && t.card === card.id)
      .forEach((t) => {
        if (t.date > prevClose && t.date <= close) items.push({ desc: t.desc, amount: t.amount, date: t.date });
      });
    occ(db.bills, ym)
      .filter((o) => o.b.card === card.id)
      .forEach((o) => {
        const d = dueOf(o.b, ym);
        if (d > prevClose && d <= close) items.push({ desc: `${o.b.name} (${o.label})`, amount: o.amount, date: d });
      });
  });
  return {
    close,
    closeYm,
    due: dueDateOfFatura(card, closeYm),
    total: items.reduce((s, i) => s + i.amount, 0),
    items,
  };
}

// Fatura aberta hoje: a que fecha no próximo fechamento (inclusive hoje)
export function currentCloseYm(card, hoje = today()) {
  const cm = mKey(hoje);
  return closeDateOf(card, cm) >= hoje ? cm : shiftMonth(cm, 1);
}

// Avisos de fatura: fecha em breve, vencida, vence hoje ou em até 3 dias
export function cardAlerts(db, hoje = today()) {
  const out = [];
  (db.cards || []).forEach((c) => {
    const cy = currentCloseYm(c, hoje);
    const openF = faturaOf(c, cy, db);
    const dClose = daysBetween(hoje, openF.close);
    if (dClose === 0) {
      out.push({ title: `${c.name}: fatura fecha hoje`, body: `Valor até agora: ${money(openF.total)}`, level: "info" });
    } else if (dClose > 0 && dClose <= 3) {
      out.push({ title: `${c.name}: fatura fecha em ${dClose} dia(s)`, body: `Valor até agora: ${money(openF.total)}`, level: "info" });
    }
    [shiftMonth(cy, -1), cy].forEach((ym) => {
      if ((c.paid || []).includes(ym)) return;
      const f = faturaOf(c, ym, db);
      if (f.total <= 0) return;
      const d = daysBetween(hoje, f.due);
      const base = { cardId: c.id, closeYm: ym, paidable: true };
      if (d < 0) {
        out.push({ ...base, title: `${c.name}: fatura vencida`, body: `${money(f.total)} venceu em ${fmtDate(f.due)}. Pague logo para evitar juros e multa.`, level: "late" });
      } else if (d === 0) {
        out.push({ ...base, title: `${c.name}: fatura vence hoje`, body: `${money(f.total)}. Pague hoje para evitar juros.`, level: "late" });
      } else if (d <= 3) {
        out.push({ ...base, title: `${c.name}: fatura vence em ${d} dia(s)`, body: `${money(f.total)} até ${fmtDate(f.due)}`, level: "soon" });
      }
    });
  });
  return out;
}
