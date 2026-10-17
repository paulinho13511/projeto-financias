// Extrato do mês para exportação (CSV e impressão). Funções puras.
import { txOf } from "./ledger.js";
import { occ, dueOf } from "./billing.js";
import { brDate } from "./dates.js";

// Lançamentos e contas do mês em uma lista única, ordenada por data
export function linhasExtrato(db, ym) {
  const nomeCartao = (id) => ((db.cards || []).find((c) => c.id === id) || {}).name || "";
  return [
    ...txOf(db.tx, ym).map((t) => ({
      date: t.date, desc: t.desc, cat: t.category, type: t.type, amount: t.amount, card: nomeCartao(t.card),
    })),
    ...occ(db.bills, ym).map((o) => ({
      date: dueOf(o.b, ym), desc: `${o.b.name} (${o.label})`, cat: o.b.category,
      type: "expense", amount: o.amount, card: nomeCartao(o.b.card),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

// Campo seguro para CSV: entre aspas e sem início que o Excel/Planilhas interpretaria como fórmula
const campo = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

// Texto CSV com separador ";" (padrão do Excel em português)
export function csvExtrato(rows) {
  return [
    "Data;Descrição;Categoria;Tipo;Valor;Cartão",
    ...rows.map((r) => [
      brDate(r.date),
      campo(r.desc),
      campo(r.cat),
      r.type === "income" ? "Receita" : "Despesa",
      r.amount.toFixed(2).replace(".", ","),
      campo(r.card),
    ].join(";")),
  ].join("\r\n");
}
