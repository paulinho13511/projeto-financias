// Testes do núcleo puro do front (js/core). Valores esperados calculados à mão, não extraídos do código.
// Rodar: node --test tests/front/core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { dueOf, occ, remainingAfter, billStatus, contasEmAberto } from "../../js/core/billing.js";
import { totals, txOf, expenseByCategory } from "../../js/core/ledger.js";
import { faturaOf, currentCloseYm, cardAlerts, compromissoCartoes } from "../../js/core/cards.js";
import {
  variacao, previsaoFimDoMes, regra503, revisaoDelta, emergenciaMedia, rendasRecentes, resumoMes, serieGastos,
} from "../../js/core/analytics.js";
import { progressoMeta, depositosPorMes, ultimosDepositos } from "../../js/core/goals.js";
import { filtrarLinhas, linhasDoMes, resumoLinhas } from "../../js/core/feed.js";
import { avisosInicio } from "../../js/core/alerts.js";
import { money, esc } from "../../js/core/format.js";
import { daysBetween, monthDiff, shiftMonth, dim } from "../../js/core/dates.js";

const HOJE = "2026-10-16";

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

test("compromissoCartoes: ignora faturas zeradas e pagas", () => {
  const db = { tx: [], bills: [], cards: [{ id: "c1", closeDay: 8, dueDay: 15, paid: [] }] };
  assert.deepEqual(compromissoCartoes(db, HOJE), []);
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

test("previsaoFimDoMes: mês atual projeta gastos variáveis pelo ritmo", () => {
  // dia 16, 31 dias: restam 15. Gasto variável 160 => ritmo 10/dia => 150 a menos
  const t = { bal: 1000, items: [{ type: "expense", amount: 160 }] };
  const p = previsaoFimDoMes(t, "2026-10", HOJE);
  assert.equal(p.valor, 850);
  assert.equal(p.projetado, true);
  assert.deepEqual(previsaoFimDoMes(t, "2026-09", HOJE), { valor: 1000, projetado: false });
});

test("regra503: percentuais por grupo e poupança", () => {
  const r = regra503({ inc: 1000, exp: 800 }, { Moradia: 400, Lazer: 200, Outros: 100 });
  assert.equal(r.nec, 40);
  assert.equal(r.des, 30);
  assert.equal(r.pou, 20);
  assert.equal(regra503({ inc: 0, exp: 10 }, {}), null);
});

test("revisaoDelta: ordena pela maior variação absoluta", () => {
  const d = revisaoDelta({ A: 100, B: 50 }, { A: 40, C: 70 });
  assert.deepEqual(d.map((x) => [x.c, x.d]), [["C", -70], ["A", 60], ["B", 50]]);
});

test("emergenciaMedia: média dos meses anteriores com gasto", () => {
  const db = {
    tx: [
      { id: "1", type: "expense", amount: 300, date: "2026-09-10", desc: "a", category: "x" },
      { id: "2", type: "expense", amount: 600, date: "2026-08-10", desc: "b", category: "x" },
    ],
    bills: [],
  };
  assert.equal(emergenciaMedia(db, "2026-10"), 450);
  assert.equal(emergenciaMedia({ tx: [], bills: [] }, "2026-10"), null);
});

test("rendasRecentes: só meses com receita", () => {
  const db = { tx: [{ id: "1", type: "income", amount: 1000, date: "2026-10-05", desc: "s", category: "x" }], bills: [] };
  assert.deepEqual(rendasRecentes(db, "2026-10"), [1000]);
});

test("resumoMes: economia e maior categoria", () => {
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
  assert.equal(p.falta, 750);
});

test("depositosPorMes e ultimosDepositos", () => {
  const log = [{ d: "2026-09-15", v: 700 }, { d: "2026-10-01", v: 500 }];
  assert.deepEqual(depositosPorMes(log, ["2026-09", "2026-10"]), [700, 500]);
  assert.equal(ultimosDepositos(log)[0].v, 500);
});

test("filtrarLinhas: ordenação por data agrupa; maior valor não agrupa", () => {
  const rows = [
    { kind: "tx", date: "2026-10-05", created: 2, amount: 10, desc: "b", category: "x", type: "expense", card: null },
    { kind: "tx", date: "2026-10-05", created: 1, amount: 30, desc: "a", category: "x", type: "expense", card: null },
  ];
  const base = { q: "", ft: "all", from: "", to: "", cards: new Set() };
  const byDate = filtrarLinhas(rows, { ...base, sort: "date" });
  assert.equal(byDate.porData, true);
  assert.deepEqual(byDate.items.map((r) => r.desc), ["a", "b"]);
  const high = filtrarLinhas(rows, { ...base, sort: "high" });
  assert.equal(high.porData, false);
  assert.deepEqual(high.items.map((r) => r.amount), [30, 10]);
});

test("filtrarLinhas: busca e filtro por cartão ('none' = sem cartão)", () => {
  const rows = [
    { kind: "tx", date: "2026-10-05", created: 1, amount: 10, desc: "Mercado", category: "Alimentação", type: "expense", card: "c1" },
    { kind: "tx", date: "2026-10-06", created: 2, amount: 20, desc: "Uber", category: "Transporte", type: "expense", card: null },
  ];
  const base = { ft: "all", from: "", to: "", sort: "date" };
  assert.equal(filtrarLinhas(rows, { ...base, q: "uber", cards: new Set() }).items.length, 1);
  assert.deepEqual(filtrarLinhas(rows, { ...base, q: "", cards: new Set(["none"]) }).items.map((r) => r.desc), ["Uber"]);
});

test("linhasDoMes + resumoLinhas: recebido, pago e a pagar", () => {
  const db = {
    tx: [{ id: "1", type: "income", amount: 1000, date: "2026-10-05", desc: "s", category: "Salário", created: 1 }],
    bills: [
      { id: "b", kind: "mensal", day: 10, amount: 300, name: "Aluguel", category: "Moradia", paid: ["2026-10"] },
      { id: "c", kind: "mensal", day: 20, amount: 100, name: "Internet", category: "Contas", paid: [] },
    ],
  };
  const r = resumoLinhas(linhasDoMes(db, "2026-10", HOJE));
  assert.deepEqual(r, { recebido: 1000, pago: 300, aPagar: 100 });
});

test("avisosInicio: limite quase atingido (80%)", () => {
  const db = {
    tx: [{ id: "1", type: "expense", amount: 90, date: "2026-10-05", desc: "x", category: "Lazer" }],
    bills: [],
    cards: [],
    budgets: { Lazer: 100 },
  };
  const { msgs } = avisosInicio(db, "2026-10", HOJE);
  // Intl pt-BR usa espaço não quebrável (U+00A0) entre "R$" e o valor
  const norm = (s) => s.replace(/ /g, " ");
  assert.ok(msgs.some((m) => m.title === "Quase no limite" && norm(m.body) === "Lazer: R$ 90,00 de R$ 100,00 (90%)"));
});

test("daysBetween, monthDiff, shiftMonth e dim", () => {
  assert.equal(daysBetween("2026-10-16", "2026-10-18"), 2);
  assert.equal(monthDiff("2026-10", "2027-01"), 3);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(dim("2028-02"), 29);
});

test("format: moeda pt-BR e escape de HTML", () => {
  assert.match(money(1234.5), /^R\$\s1\.234,50$/);
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});
