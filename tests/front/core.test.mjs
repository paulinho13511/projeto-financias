// Testes do núcleo puro do front (js/core). Valores esperados calculados à mão, não extraídos do código.
// Rodar: node --test tests/front/core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { dueOf, occ, remainingAfter, billStatus, contasEmAberto } from "../../js/core/billing.js";
import { totals, txOf, expenseByCategory } from "../../js/core/ledger.js";
import { faturaOf, currentCloseYm, cardAlerts } from "../../js/core/cards.js";
import { variacao, rendasRecentes, resumoMes, serieGastos } from "../../js/core/analytics.js";
import { progressoMeta } from "../../js/core/goals.js";
import { filtrarTransacoes } from "../../js/core/feed.js";
import { linhasExtrato, csvExtrato } from "../../js/core/export.js";
import { parseOFX, parseCSV, parseDateBR, parseMoneyBR, parseExtrato } from "../../js/core/import.js";
import { avisosInicio } from "../../js/core/alerts.js";
import { money, esc, setMasked } from "../../js/core/format.js";
import { daysBetween, monthDiff, shiftMonth, dim, brDate } from "../../js/core/dates.js";

const HOJE = "2026-10-16";
// Intl pt-BR usa espaço não quebrável (U+00A0) entre "R$" e o valor
const semNbsp = (s) => s.replace(/ /g, " ");

test("dueOf: dia 31 em fevereiro cai no último dia do mês", () => {
  assert.equal(dueOf({ kind: "mensal", day: 31 }, "2026-02"), "2026-02-28");
});

test("dueOf: conta única usa a própria data", () => {
  assert.equal(dueOf({ kind: "unica", date: "2026-10-20" }, "2026-10"), "2026-10-20");
});

test("occ: mensal respeita início e fim; rótulo 'Até MM/AAAA'", () => {
  const bills = [{ kind: "mensal", name: "X", amount: 10, start: "2026-01", end: "2026-03" }];
  assert.equal(occ(bills, "2026-02")[0].label, "Até 03/2026");
  assert.equal(occ(bills, "2026-04").length, 0);
});

test("occ: parcelada mostra a parcela do mês e some fora do intervalo", () => {
  const bills = [{ kind: "parcelada", name: "N", amount: 250, parcels: 10, start: "2026-08" }];
  assert.equal(occ(bills, "2026-10")[0].label, "3/10");
  assert.equal(occ(bills, "2026-07").length, 0);
  assert.equal(occ(bills, "2027-06").length, 0); // 11ª parcela não existe
});

test("remainingAfter: parcelas que faltam depois do mês", () => {
  const b = { kind: "parcelada", start: "2026-08", parcels: 10 };
  assert.equal(remainingAfter(b, "2026-10"), 7); // já pagou 3 (ago, set, out)
  assert.equal(remainingAfter(b, "2026-07"), 10); // ainda não começou
  assert.equal(remainingAfter({ kind: "mensal" }, "2026-10"), 0);
});

test("billStatus: paga, atrasada, vence em breve e em aberto", () => {
  assert.equal(billStatus({ kind: "mensal", day: 18, paid: ["2026-10"] }, "2026-10", HOJE).key, "paid");
  assert.equal(billStatus({ kind: "mensal", day: 10, paid: [] }, "2026-10", HOJE).key, "late");
  const soon = billStatus({ kind: "mensal", day: 18, paid: [] }, "2026-10", HOJE);
  assert.equal(soon.key, "soon");
  assert.equal(soon.label, "Vence em 2d");
  assert.equal(billStatus({ kind: "mensal", day: 30, paid: [] }, "2026-10", HOJE).key, "open");
});

test("contasEmAberto: só não pagas, da mais próxima para a mais distante", () => {
  const bills = [
    { id: "a", kind: "mensal", day: 30, paid: [], amount: 1, name: "a", category: "x" },
    { id: "b", kind: "mensal", day: 18, paid: [], amount: 1, name: "b", category: "x" },
    { id: "c", kind: "mensal", day: 17, paid: ["2026-10"], amount: 1, name: "c", category: "x" },
  ];
  const ids = contasEmAberto(bills, "2026-10", HOJE).map((x) => x.b.id);
  assert.deepEqual(ids, ["b", "a"]);
});

test("faturaOf: soma compras entre fechamentos e calcula vencimento", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 8, dueDay: 15, paid: [] };
  const db = {
    tx: [
      { type: "expense", card: "c1", amount: 100, date: "2026-09-20", desc: "a" },
      { type: "expense", card: "c1", amount: 50, date: "2026-10-05", desc: "b" },
      { type: "expense", card: "c1", amount: 999, date: "2026-08-14", desc: "fora" },
    ],
    bills: [],
  };
  const f = faturaOf(card, "2026-10", db);
  assert.equal(f.total, 150);
  assert.equal(f.close, "2026-10-08");
  assert.equal(f.due, "2026-10-15");
});

test("currentCloseYm: fecha hoje ou depois mostra o mês; já fechou vai para o próximo", () => {
  const card = { closeDay: 8, dueDay: 15 };
  assert.equal(currentCloseYm(card, "2026-10-05"), "2026-10");
  assert.equal(currentCloseYm(card, "2026-10-16"), "2026-11");
});

test("cardAlerts: fatura que fecha em 2 dias gera aviso informativo", () => {
  const db = { tx: [], bills: [], cards: [{ id: "c1", name: "Inter", closeDay: 18, dueDay: 25, paid: [] }] };
  const alerts = cardAlerts(db, HOJE);
  assert.ok(alerts.some((a) => a.title === "Inter: fatura fecha em 2 dia(s)" && a.level === "info"));
});

test("totals: despesas incluem contas do mês; receitas só lançamentos", () => {
  const db = {
    tx: [
      { id: "1", type: "income", amount: 1000, date: "2026-10-05", desc: "s", category: "Salário" },
      { id: "2", type: "expense", amount: 200, date: "2026-10-06", desc: "m", category: "Alimentação" },
    ],
    bills: [{ kind: "mensal", day: 10, amount: 300, name: "Aluguel", category: "Moradia" }],
  };
  const t = totals(db, "2026-10");
  assert.equal(t.inc, 1000);
  assert.equal(t.exp, 500);
  assert.equal(t.bal, 500);
  assert.equal(txOf(db.tx, "2026-09").length, 0);
  const { byCat, counts } = expenseByCategory(t);
  assert.deepEqual(byCat, { Alimentação: 200, Moradia: 300 });
  assert.deepEqual(counts, { Alimentação: 1, Moradia: 1 });
});

test("variacao: percentual, e null sem base", () => {
  assert.equal(variacao(120, 100), 20);
  assert.equal(variacao(5, 0), null);
});

test("rendasRecentes: só meses com receita", () => {
  const db = { tx: [{ id: "1", type: "income", amount: 1000, date: "2026-10-05", desc: "s", category: "x" }], bills: [] };
  assert.deepEqual(rendasRecentes(db, "2026-10"), [1000]);
});

test("resumoMes: economia, maior categoria e média diária", () => {
  const db = {
    tx: [
      { id: "1", type: "income", amount: 1000, date: "2026-10-05", desc: "s", category: "x" },
      { id: "2", type: "expense", amount: 400, date: "2026-10-06", desc: "m", category: "Lazer" },
    ],
    bills: [],
  };
  const r = resumoMes(db, "2026-10", HOJE);
  assert.equal(r.rate, 60);
  assert.deepEqual(r.top, ["Lazer", 400]);
  assert.equal(r.days, 16);
  assert.equal(r.avg, 25);
  assert.equal(r.contas, 0);
});

test("serieGastos: fevereiro tem 28 dias e a conta do dia 31 cai no último", () => {
  const db = { tx: [], bills: [{ kind: "mensal", day: 31, amount: 90, name: "x", category: "y", start: "2026-01" }] };
  const { n, cum } = serieGastos(db, "2026-02");
  assert.equal(n, 28);
  assert.equal(cum.length, 28);
  assert.equal(cum[27], 90);
  assert.equal(cum[26], 0);
});

test("progressoMeta: faltante, parcela mensal e percentual", () => {
  const p = progressoMeta({ target: 1000, saved: 250, deadline: "2026-12" }, "2026-10");
  assert.equal(p.left, 2);
  assert.equal(p.perMonth, 375);
  assert.equal(p.pct, 25);
  assert.equal(p.done, false);
});

test("filtrarTransacoes: busca, tipo, cartão ('none' = sem cartão) e ordenação por valor", () => {
  const list = [
    { desc: "Mercado", category: "Alimentação", amount: 10, date: "2026-10-05", type: "expense", card: "c1" },
    { desc: "Uber", category: "Transporte", amount: 30, date: "2026-10-06", type: "expense", card: null },
  ];
  const base = { q: "", ft: "all", from: "", to: "", cards: new Set(), sort: "recent" };
  assert.equal(filtrarTransacoes(list, { ...base, q: "uber" }).length, 1);
  assert.deepEqual(filtrarTransacoes(list, { ...base, cards: new Set(["none"]) }).map((t) => t.desc), ["Uber"]);
  assert.equal(filtrarTransacoes(list, { ...base, ft: "income" }).length, 0);
  assert.deepEqual(filtrarTransacoes(list, { ...base, sort: "high" }).map((t) => t.amount), [30, 10]);
  assert.deepEqual(filtrarTransacoes(list, { ...base, sort: "low" }).map((t) => t.amount), [10, 30]);
  assert.deepEqual(filtrarTransacoes(list, { ...base, from: "2026-10-06" }).map((t) => t.desc), ["Uber"]);
});

test("linhasExtrato: lançamentos e contas do mês em ordem de data, com nome do cartão", () => {
  const db = {
    tx: [{ id: "1", type: "expense", amount: 200, date: "2026-10-06", desc: "Mercado", category: "Alimentação", card: "c1" }],
    bills: [{ id: "b", kind: "mensal", day: 10, amount: 300, name: "Aluguel", category: "Moradia" }],
    cards: [{ id: "c1", name: "Nubank" }],
  };
  const rows = linhasExtrato(db, "2026-10");
  assert.deepEqual(rows.map((r) => r.desc.split(" (")[0]), ["Mercado", "Aluguel"]);
  assert.equal(rows[0].card, "Nubank");
  assert.equal(rows[1].date, "2026-10-10");
  assert.equal(rows[1].card, "");
});

test("csvExtrato: separador ';', valor com vírgula e proteção contra fórmula", () => {
  const rows = [
    { date: "2026-10-05", desc: "Mercado", cat: "Alimentação", type: "expense", amount: 320.5, card: "Nubank" },
    { date: "2026-10-01", desc: "=cmd", cat: "x", type: "income", amount: 10, card: "" },
  ];
  assert.equal(
    csvExtrato(rows),
    [
      "Data;Descrição;Categoria;Tipo;Valor;Cartão",
      '05/10/2026;"Mercado";"Alimentação";Despesa;320,50;"Nubank"',
      '01/10/2026;"\'=cmd";"x";Receita;10,00;""',
    ].join("\r\n"),
  );
});

test("parseCSV: datas e valores brasileiros, sinal define a natureza", () => {
  const rows = parseCSV("Data;Descrição;Valor\n05/10/2026;Padaria;-12,50\n06/10/2026;Salário;3.000,00");
  assert.deepEqual(rows, [
    { date: "2026-10-05", desc: "Padaria", amount: 12.5, type: "expense" },
    { date: "2026-10-06", desc: "Salário", amount: 3000, type: "income" },
  ]);
});

test("parseCSV: sem coluna de valor devolve null", () => {
  assert.equal(parseCSV("Data;Nome\n05/10/2026;x"), null);
});

test("parseOFX: lê data, valor e descrição de cada transação", () => {
  const text = "<OFX><BANKTRANLIST>\n<STMTTRN>\n<DTPOSTED>20261005120000\n<TRNAMT>-45.90\n<MEMO>UBER  *TRIP\n</STMTTRN>\n</BANKTRANLIST></OFX>";
  assert.deepEqual(parseOFX(text), [{ date: "2026-10-05", desc: "UBER *TRIP", amount: 45.9, type: "expense" }]);
  assert.equal(parseExtrato(text).length, 1);
});

test("parseDateBR e parseMoneyBR: formatos aceitos e recusados", () => {
  assert.equal(parseDateBR("05/10/2026"), "2026-10-05");
  assert.equal(parseDateBR("2026-10-05"), "2026-10-05");
  assert.equal(parseDateBR("abc"), null);
  assert.equal(parseMoneyBR("R$ 1.234,56"), 1234.56);
});

test("avisosInicio: limite atingido aparece; abaixo do limite não", () => {
  const base = { bills: [], cards: [], budgets: { Lazer: 100 } };
  const estourou = avisosInicio({ ...base, tx: [{ id: "1", type: "expense", amount: 120, date: "2026-10-05", desc: "x", category: "Lazer" }] }, "2026-10", HOJE);
  assert.ok(estourou.msgs.some((m) => m.title === "Limite atingido" && semNbsp(m.body) === "Lazer: R$ 120,00 de R$ 100,00"));
  const perto = avisosInicio({ ...base, tx: [{ id: "1", type: "expense", amount: 90, date: "2026-10-05", desc: "x", category: "Lazer" }] }, "2026-10", HOJE);
  assert.equal(perto.msgs.length, 0);
});

test("daysBetween, monthDiff, shiftMonth, dim e brDate", () => {
  assert.equal(daysBetween("2026-10-16", "2026-10-18"), 2);
  assert.equal(monthDiff("2026-10", "2027-01"), 3);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(dim("2028-02"), 29);
  assert.equal(brDate("2026-10-05"), "05/10/2026");
});

test("format: moeda pt-BR, máscara do modo privado e escape de HTML", () => {
  assert.equal(semNbsp(money(1234.5)), "R$ 1.234,50");
  setMasked(true);
  assert.equal(money(1234.5), "R$ ****");
  setMasked(false);
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
