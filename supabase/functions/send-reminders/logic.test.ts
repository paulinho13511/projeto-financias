// Testes da lógica dos avisos. Rodar: node --experimental-strip-types --test supabase/functions/send-reminders/logic.test.ts
// (também roda com `deno test`).
import test from "node:test";
import assert from "node:assert/strict";
import { buildReminders, owedInMonth, occ, money, type Data } from "./logic.ts";

const base = (over: Partial<Data> = {}): Data => ({ tx: [], bills: [], cards: [], ...over });
const titles = (r: { title: string }[]) => r.map(x => x.title);

test("money formata em reais com milhar", () => {
  assert.equal(money(1234.5), "R$ 1.234,50");
  assert.equal(money(0), "R$ 0,00");
  assert.equal(money(33.34), "R$ 33,34");
});

test("conta que vence dia 2 aparece no dia 31 (mês seguinte)", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Internet", amount: 120, day: 2, start: "2026-01", paid: [] }] });
  const r = buildReminders(d, "2026-10-31");
  assert.equal(r.length, 1);
  assert.equal(r[0].title, "Conta vence em 2 dias");
  assert.match(r[0].key, /^bill:a:2026-11:soon2$/);
});

test("conta paga no mês não gera aviso; no mês seguinte ainda gera", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Luz", amount: 90, day: 2, start: "2026-01", paid: ["2026-10", "2026-11"] }] });
  assert.equal(buildReminders(d, "2026-10-31").length, 0);
});

test("aviso no dia certo: vence hoje, amanhã, em 2 dias e atrasada", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 15, start: "2026-01", paid: [] }] });
  assert.deepEqual(titles(buildReminders(d, "2026-10-13")), ["Conta vence em 2 dias"]);
  assert.deepEqual(titles(buildReminders(d, "2026-10-14")), ["Conta vence amanhã"]);
  assert.deepEqual(titles(buildReminders(d, "2026-10-15")), ["Conta vence hoje"]);
  assert.deepEqual(titles(buildReminders(d, "2026-10-16")), ["Conta atrasada há 1 dia(s)"]);
  assert.equal(buildReminders(d, "2026-10-12").length, 0);
  assert.equal(buildReminders(d, "2026-10-23").length, 0, "depois de 7 dias de atraso o push para");
});

test("atraso gera um aviso por dia (chaves diferentes)", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 15, start: "2026-01", paid: [] }] });
  const k1 = buildReminders(d, "2026-10-16")[0].key, k2 = buildReminders(d, "2026-10-17")[0].key;
  assert.notEqual(k1, k2);
});

test("compra no cartão não gera aviso de conta; vai na fatura", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({ cards: [card], bills: [{ id: "u", kind: "unica", name: "TV", amount: 300, date: "2026-10-12", card: "c1", paid: [] }] });
  const r = buildReminders(d, "2026-10-14"); // pós-fechamento; vence dia 20
  assert.ok(!r.some(x => x.key.startsWith("bill:")));
});

test("fatura do cartão avisa 3 dias antes, no dia certo e atrasada, com o valor", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250.5, date: "2026-10-05", card: "c1" }] });
  const d17 = buildReminders(d, "2026-10-17").find(x => x.key.startsWith("due:"))!;
  assert.equal(d17.title, "Nubank: fatura vence em 3 dias");
  assert.match(d17.body, /R\$ 250,50 até 20\/10\/2026/);
  const d20 = buildReminders(d, "2026-10-20").find(x => x.key.startsWith("due:"))!;
  assert.equal(d20.title, "Nubank: fatura vence hoje");
  assert.match(d20.body, /R\$ 250,50/);
  const d21 = buildReminders(d, "2026-10-21").find(x => x.key.startsWith("due:"))!;
  assert.equal(d21.title, "Nubank: fatura vencida há 1 dia(s)");
  assert.equal(buildReminders(d, "2026-10-16").some(x => x.key.startsWith("due:")), false, "4 dias antes ainda não avisa");
});

test("fatura marcada como paga não avisa", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: ["2026-10"] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250, date: "2026-10-05", card: "c1" }] });
  assert.equal(buildReminders(d, "2026-10-20").some(x => x.key.startsWith("due:")), false);
});

test("fatura que vence no mês seguinte ao fechamento (vence dia 5, fecha dia 25)", () => {
  const card = { id: "c1", name: "Inter", closeDay: 25, dueDay: 5, paid: [] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Loja", amount: 100, date: "2026-10-10", card: "c1" }] });
  const r = buildReminders(d, "2026-11-05").find(x => x.key.startsWith("due:"))!;
  assert.equal(r.title, "Inter: fatura vence hoje");
});

test("total devido no mês soma contas sem cartão e faturas que vencem no mês", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({
    cards: [card],
    tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250.5, date: "2026-10-05", card: "c1" }],
    bills: [
      { id: "a", kind: "mensal", name: "Aluguel", amount: 1000, day: 5, start: "2026-01", paid: [] },
      { id: "b", kind: "mensal", name: "Luz", amount: 90, day: 8, start: "2026-01", paid: ["2026-10"] },
      { id: "u", kind: "unica", name: "TV", amount: 300, date: "2026-10-12", card: "c1", paid: [] },
    ],
  });
  // 1000 (aluguel) + fatura (250,50 + 300 da TV no cartão) = 1550,50; Luz paga fica de fora
  assert.equal(owedInMonth(d, "2026-10-10"), 1550.5);
  const r = buildReminders(d, "2026-10-17").find(x => x.key.startsWith("due:"))!;
  assert.match(r.body, /Em aberto no mês: R\$ 1\.550,50/);
});

test("resumo do mês no dia 1", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Aluguel", amount: 1000, day: 5, start: "2026-01", paid: [] }] });
  const r = buildReminders(d, "2026-11-01");
  const s = r.find(x => x.key === "sum:2026-11")!;
  assert.equal(s.title, "Resumo de novembro");
  assert.match(s.body, /R\$ 1\.000,00/);
  assert.equal(buildReminders(d, "2026-11-02").some(x => x.key.startsWith("sum:")), false);
});

test("última parcela absorve os centavos", () => {
  const b = { id: "p", kind: "parcelada", name: "TV", amount: 33.33, last: 33.34, parcels: 3, start: "2026-10", day: 25, paid: [] };
  assert.equal(occ([b], "2026-10")[0].amount, 33.33);
  assert.equal(occ([b], "2026-12")[0].amount, 33.34);
  assert.equal(occ([b], "2027-01").length, 0);
});

test("chaves de aviso são únicas", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "M", amount: 10, date: "2026-10-05", card: "c1" }],
    bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 20, start: "2026-01", paid: [] }] });
  const r = buildReminders(d, "2026-10-20");
  assert.equal(new Set(r.map(x => x.key)).size, r.length);
});
