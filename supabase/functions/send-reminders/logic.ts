// Cálculo dos avisos de contas e cartões. Espelha as regras de index.html / js/app.js
// (occ, dueOf, billStatus, faturaOf, currentCloseYm, cardAlerts). Função pura: sem I/O.

export interface Bill {
  id: string; kind?: string; name: string; amount: number; day?: number; date?: string;
  start?: string; end?: string; parcels?: number; card?: string | null; paid?: string[];
}
export interface Tx { id: string; type: string; desc: string; amount: number; date: string; card?: string | null }
export interface Card { id: string; name: string; closeDay: number; dueDay: number; paid?: string[] }
export interface Data { tx: Tx[]; bills: Bill[]; cards: Card[] }
export interface Reminder { key: string; title: string; body: string }

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (s: string) => s.split("-").map(Number);
const dim = (ym: string) => { const [y, m] = parts(ym); return new Date(y, m, 0).getDate(); };
const ymd = (d: Date) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const mKey = (s: string) => s.slice(0, 7);
export const shiftMonth = (ym: string, delta: number) => { const [y, m] = parts(ym); return ymd(new Date(y, m - 1 + delta, 1)).slice(0, 7); };
const monthDiff = (a: string, b: string) => { const [ay, am] = parts(a), [by, bm] = parts(b); return (by - ay) * 12 + (bm - am); };
export const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = parts(a), [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
};
export const money = (v: number) => "R$ " + v.toFixed(2).replace(".", ",");

// Dia de hoje no fuso de São Paulo (YYYY-MM-DD)
export function todaySP(now = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now); // en-CA já formata como YYYY-MM-DD
}

export function dueOf(b: Bill, ym: string): string {
  if (b.kind === "unica") return b.date!;
  const [y, m] = parts(ym);
  return ymd(new Date(y, m - 1, Math.min(b.day!, dim(ym))));
}

// Ocorrências de contas num mês (mesma regra de occ() do app)
export function occ(bills: Bill[], ym: string): { b: Bill; amount: number }[] {
  const out: { b: Bill; amount: number }[] = [];
  bills.forEach(b => {
    const kind = b.kind || "mensal";
    if (kind === "unica") { if (mKey(b.date!) === ym) out.push({ b, amount: b.amount }); return; }
    if (kind === "parcelada") {
      const i = monthDiff(b.start!, ym);
      if (i >= 0 && i < b.parcels!) out.push({ b, amount: b.amount });
      return;
    }
    if ((!b.start || ym >= b.start) && (!b.end || ym <= b.end)) out.push({ b, amount: b.amount });
  });
  return out;
}

export function closeDateOf(card: Card, ym: string): string {
  const [y, m] = parts(ym);
  return ymd(new Date(y, m - 1, Math.min(card.closeDay, dim(ym))));
}
export function dueDateOfFatura(card: Card, closeYm: string): string {
  const dueYm = card.dueDay > card.closeDay ? closeYm : shiftMonth(closeYm, 1);
  const [y, m] = parts(dueYm);
  return ymd(new Date(y, m - 1, Math.min(card.dueDay, dim(dueYm))));
}

// Fatura que fecha em closeYm (mesma regra de faturaOf())
export function faturaOf(data: Data, card: Card, closeYm: string) {
  const close = closeDateOf(card, closeYm);
  const prevClose = closeDateOf(card, shiftMonth(closeYm, -1));
  let total = 0;
  [shiftMonth(closeYm, -1), closeYm].forEach(ym => {
    data.tx.filter(t => mKey(t.date) === ym && t.type === "expense" && t.card === card.id)
      .forEach(t => { if (t.date > prevClose && t.date <= close) total += t.amount; });
    occ(data.bills, ym).filter(o => o.b.card === card.id).forEach(o => {
      const d = dueOf(o.b, ym);
      if (d > prevClose && d <= close) total += o.amount;
    });
  });
  return { close, closeYm, due: dueDateOfFatura(card, closeYm), total: Math.round(total * 100) / 100 };
}

export function currentCloseYm(card: Card, today: string): string {
  const cm = mKey(today);
  return closeDateOf(card, cm) >= today ? cm : shiftMonth(cm, 1);
}

// Todos os avisos que o app mostraria hoje, com chave estável para não repetir envio
export function buildReminders(data: Data, today: string): Reminder[] {
  const out: Reminder[] = [];
  const cur = mKey(today);

  // Contas do mês corrente: vencem em até 2 dias, atrasadas ou vencendo hoje
  occ(data.bills, cur).forEach(({ b, amount }) => {
    if ((b.paid || []).includes(cur)) return;
    const d = daysBetween(today, dueOf(b, cur));
    if (d > 2) return;
    const title = d < 0 ? "Conta atrasada" : d === 0 ? "Conta vence hoje" : `Conta vence em ${d} dia(s)`;
    out.push({ key: `bill:${b.id}:${cur}:${d < 0 ? "late" : d === 0 ? "today" : "soon" + d}`, title, body: `${b.name}: ${money(amount)}` });
  });

  // Cartões: fechamento (até 3 dias) e vencimento de faturas abertas/recentes
  (data.cards || []).forEach(c => {
    const cy = currentCloseYm(c, today);
    const open = faturaOf(data, c, cy);
    const dClose = daysBetween(today, open.close);
    if (dClose === 0) out.push({ key: `close:${c.id}:${cy}:0`, title: `${c.name}: fatura fecha hoje`, body: `Valor até agora: ${money(open.total)}` });
    else if (dClose > 0 && dClose <= 3) out.push({ key: `close:${c.id}:${cy}:${dClose}`, title: `${c.name}: fatura fecha em ${dClose} dia(s)`, body: `Valor até agora: ${money(open.total)}` });

    [shiftMonth(cy, -1), cy].forEach(ym => {
      if ((c.paid || []).includes(ym)) return;
      const f = faturaOf(data, c, ym);
      if (f.total <= 0) return;
      const d = daysBetween(today, f.due);
      if (d < 0) out.push({ key: `due:${c.id}:${ym}:late`, title: `${c.name}: fatura vencida`, body: `${money(f.total)} venceu em ${f.due}. Pague logo para evitar juros e multa.` });
      else if (d === 0) out.push({ key: `due:${c.id}:${ym}:0`, title: `${c.name}: fatura vence hoje`, body: `${money(f.total)}. Pague hoje para evitar juros.` });
      else if (d <= 3) out.push({ key: `due:${c.id}:${ym}:${d}`, title: `${c.name}: fatura vence em ${d} dia(s)`, body: `${money(f.total)} até ${f.due}` });
    });
  });
  return out;
}
