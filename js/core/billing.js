// Contas: mensal, parcelada e única. Funções puras: recebem a lista de contas e a data de hoje.
import { parts, mKey, dim, monthDiff, daysBetween, ymd, today } from "./dates.js";

// Data de vencimento da conta no mês ym
export function dueOf(b, ym) {
  if (b.kind === "unica") return b.date;
  const [y, m] = parts(ym);
  return ymd(new Date(y, m - 1, Math.min(b.day, dim(ym))));
}

// Ocorrências de contas num mês: mensal (sempre), parcelada (1/12, 2/12...) ou única (uma vez)
export function occ(bills, ym) {
  const out = [];
  bills.forEach((b) => {
    const kind = b.kind || "mensal";
    if (kind === "unica") {
      if (mKey(b.date) === ym) out.push({ b, amount: b.amount, label: "Única" });
      return;
    }
    if (kind === "parcelada") {
      const i = monthDiff(b.start, ym);
      if (i >= 0 && i < b.parcels) out.push({ b, amount: b.amount, label: `${i + 1}/${b.parcels}` });
      return;
    }
    if ((!b.start || ym >= b.start) && (!b.end || ym <= b.end)) {
      out.push({ b, amount: b.amount, label: b.end ? `Até ${b.end.slice(5, 7)}/${b.end.slice(0, 4)}` : "Mensal" });
    }
  });
  return out;
}

// Parcelas que ainda faltam depois do mês informado
export function remainingAfter(b, ym) {
  if (b.kind !== "parcelada") return 0;
  const i = monthDiff(b.start, ym);
  if (i < 0) return b.parcels;
  return Math.max(0, b.parcels - (i + 1));
}

export function billStatus(b, ym, hoje = today()) {
  const paid = (b.paid || []).includes(ym);
  const due = dueOf(b, ym);
  const d = daysBetween(hoje, due);
  if (paid) return { key: "paid", label: "Paga", cls: "ok", due, d };
  if (d < 0) return { key: "late", label: "Atrasada", cls: "late", due, d };
  if (d === 0) return { key: "today", label: "Vence hoje", cls: "late", due, d };
  if (d <= 3) return { key: "soon", label: "Vence em " + d + "d", cls: "soon", due, d };
  return { key: "open", label: "Em aberto", cls: "", due, d };
}

// Contas do mês ainda não pagas, da mais próxima para a mais distante
export function contasEmAberto(bills, ym, hoje = today()) {
  return occ(bills, ym)
    .map((o) => ({ ...o, st: billStatus(o.b, ym, hoje) }))
    .filter((x) => x.st.key !== "paid")
    .sort((a, b) => a.st.d - b.st.d);
}
