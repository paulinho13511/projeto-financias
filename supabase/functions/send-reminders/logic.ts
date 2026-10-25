// Cálculo dos avisos de contas e cartões. Espelha as regras de js/app.js
// (occ, dueOf, faturaOf, currentCloseYm, cardAlerts). Função pura: sem I/O.

export interface Bill {
  id: string; kind?: string; name: string; amount: number; last?: number; day?: number; date?: string;
  start?: string; end?: string; parcels?: number; card?: string | null; paid?: string[];
}
export interface Tx { id: string; type: string; desc: string; amount: number; date: string; card?: string | null }
export interface Card { id: string; name: string; closeDay: number; dueDay: number; paid?: string[] }
export interface Data { tx: Tx[]; bills: Bill[]; cards: Card[] }
export interface Reminder { key: string; title: string; body: string }

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (s: string) => s.split("-").map(Number);
const dim = (ym: string) => { const [y, m] = parts(ym); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};
const mKey = (s: string) => s.slice(0, 7);
export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = parts(ym);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
};
const monthDiff = (a: string, b: string) => { const [ay, am] = parts(a), [by, bm] = parts(b); return (by - ay) * 12 + (bm - am); };
export const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = parts(a), [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 864e5);
};
export const money = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const round2 = (v: number) => Math.round(v * 100) / 100;

// Avisos de atraso continuam por até 7 dias; depois disso o app ainda mostra, mas o push para.
const MAX_LATE_DAYS = 7;

// Dia de hoje no fuso de São Paulo (YYYY-MM-DD)
export function todaySP(now = new Date()): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now);
}

export function dueOf(b: Bill, ym: string): string {
  if (b.kind === "unica") return b.date!;
  const [y, m] = parts(ym);
  return ymd(y, m, Math.min(b.day!, dim(ym)));
}

// Ocorrências de contas num mês (mesma regra de occ() do app; a última parcela pode ter ajuste de centavos)
export function occ(bills: Bill[], ym: string): { b: Bill; amount: number }[] {
  const out: { b: Bill; amount: number }[] = [];
  bills.forEach(b => {
    const kind = b.kind || "mensal";
    if (kind === "unica") { if (mKey(b.date!) === ym) out.push({ b, amount: b.amount }); return; }
    if (kind === "parcelada") {
      const i = monthDiff(b.start!, ym);
      if (i >= 0 && i < b.parcels!) out.push({ b, amount: b.last != null && i === b.parcels! - 1 ? b.last : b.amount });
      return;
    }
    if ((!b.start || ym >= b.start) && (!b.end || ym <= b.end)) out.push({ b, amount: b.amount });
  });
  return out;
}

export function closeDateOf(card: Card, ym: string): string {
  const [y, m] = parts(ym);
  return ymd(y, m, Math.min(card.closeDay, dim(ym)));
}
export function dueDateOfFatura(card: Card, closeYm: string): string {
  const dueYm = card.dueDay > card.closeDay ? closeYm : shiftMonth(closeYm, 1);
  const [y, m] = parts(dueYm);
  return ymd(y, m, Math.min(card.dueDay, dim(dueYm)));
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
  return { close, closeYm, due: dueDateOfFatura(card, closeYm), total: round2(total) };
}

export function currentCloseYm(card: Card, today: string): string {
  const cm = mKey(today);
  return closeDateOf(card, cm) >= today ? cm : shiftMonth(cm, 1);
}

// Quanto ainda falta pagar no mês de "today": contas sem cartão não pagas + faturas de cartão
// que vencem neste mês e não foram pagas. (Compras no cartão já entram na fatura, não são somadas duas vezes.)
export function owedInMonth(data: Data, today: string): number {
  const cur = mKey(today);
  let total = 0;
  occ(data.bills, cur).forEach(({ b, amount }) => {
    if (b.card) return;
    if (!(b.paid || []).includes(cur)) total += amount;
  });
  (data.cards || []).forEach(c => {
    const closeYm = c.dueDay > c.closeDay ? cur : shiftMonth(cur, -1);
    if ((c.paid || []).includes(closeYm)) return;
    total += faturaOf(data, c, closeYm).total;
  });
  return round2(total);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Todos os avisos que o app mostraria hoje, com chave estável para não repetir envio.
// Cada aviso leva no texto quanto ainda falta pagar no mês.
export function buildReminders(data: Data, today: string): Reminder[] {
  const out: Reminder[] = [];
  const cur = mKey(today);
  const owed = owedInMonth(data, today);
  const tail = owed > 0 ? ` · Em aberto no mês: ${money(owed)}` : "";

  // Resumo no dia 1: quanto o mês inteiro ainda tem a pagar
  if (today.endsWith("-01") && owed > 0) {
    const [, m] = parts(cur);
    out.push({ key: `sum:${cur}`, title: `Resumo de ${MESES[m - 1]}`, body: `Você tem ${money(owed)} em contas e faturas em aberto neste mês.` });
  }

  // Contas sem cartão do mês atual e do seguinte (o vencimento do dia 1 ou 2 aparece nos últimos dias do mês).
  // Compras no cartão são pagas pela fatura, então não geram aviso de conta.
  [cur, shiftMonth(cur, 1)].forEach(ym => {
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

  // Cartões: fechamento (até 3 dias) e vencimento da fatura (até 3 dias antes, no dia e atrasada)
  (data.cards || []).forEach(c => {
    const cy = currentCloseYm(c, today);
    const open = faturaOf(data, c, cy);
    const dClose = daysBetween(today, open.close);
    if (dClose === 0) out.push({ key: `close:${c.id}:${cy}:0`, title: `${c.name}: fatura fecha hoje`, body: `Valor até agora: ${money(open.total)}${tail}` });
    else if (dClose > 0 && dClose <= 3) out.push({ key: `close:${c.id}:${cy}:${dClose}`, title: `${c.name}: fatura fecha em ${dClose} dia(s)`, body: `Valor até agora: ${money(open.total)}${tail}` });

    [shiftMonth(cy, -1), cy].forEach(ym => {
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
