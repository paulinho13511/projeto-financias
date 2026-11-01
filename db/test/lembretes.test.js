var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_node_test = __toESM(require("node:test"));
var import_strict = __toESM(require("node:assert/strict"));
var import_lembretes = require("../../api/_lib/lembretes.js");
const base = (over = {}) => ({ tx: [], bills: [], cards: [], ...over });
const titles = (r) => r.map((x) => x.title);
(0, import_node_test.default)("money formata em reais com milhar", () => {
  import_strict.default.equal((0, import_lembretes.money)(1234.5), "R$ 1.234,50");
  import_strict.default.equal((0, import_lembretes.money)(0), "R$ 0,00");
  import_strict.default.equal((0, import_lembretes.money)(33.34), "R$ 33,34");
});
(0, import_node_test.default)("conta que vence dia 2 aparece no dia 31 (mês seguinte)", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Internet", amount: 120, day: 2, start: "2026-01", paid: [] }] });
  const r = (0, import_lembretes.buildReminders)(d, "2026-10-31");
  import_strict.default.equal(r.length, 1);
  import_strict.default.equal(r[0].title, "Conta vence em 2 dias");
  import_strict.default.match(r[0].key, /^bill:a:2026-11:soon2$/);
});
(0, import_node_test.default)("conta paga no mês não gera aviso; no mês seguinte ainda gera", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Luz", amount: 90, day: 2, start: "2026-01", paid: ["2026-10", "2026-11"] }] });
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-10-31").length, 0);
});
(0, import_node_test.default)("aviso no dia certo: vence hoje, amanhã, em 2 dias e atrasada", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 15, start: "2026-01", paid: [] }] });
  import_strict.default.deepEqual(titles((0, import_lembretes.buildReminders)(d, "2026-10-13")), ["Conta vence em 2 dias"]);
  import_strict.default.deepEqual(titles((0, import_lembretes.buildReminders)(d, "2026-10-14")), ["Conta vence amanhã"]);
  import_strict.default.deepEqual(titles((0, import_lembretes.buildReminders)(d, "2026-10-15")), ["Conta vence hoje"]);
  import_strict.default.deepEqual(titles((0, import_lembretes.buildReminders)(d, "2026-10-16")), ["Conta atrasada há 1 dia(s)"]);
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-10-12").length, 0);
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-10-23").length, 0, "depois de 7 dias de atraso o push para");
});
(0, import_node_test.default)("atraso gera um aviso por dia (chaves diferentes)", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 15, start: "2026-01", paid: [] }] });
  const k1 = (0, import_lembretes.buildReminders)(d, "2026-10-16")[0].key, k2 = (0, import_lembretes.buildReminders)(d, "2026-10-17")[0].key;
  import_strict.default.notEqual(k1, k2);
});
(0, import_node_test.default)("compra no cartão não gera aviso de conta; vai na fatura", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({ cards: [card], bills: [{ id: "u", kind: "unica", name: "TV", amount: 300, date: "2026-10-12", card: "c1", paid: [] }] });
  const r = (0, import_lembretes.buildReminders)(d, "2026-10-14");
  import_strict.default.ok(!r.some((x) => x.key.startsWith("bill:")));
});
(0, import_node_test.default)("fatura do cartão avisa 3 dias antes, no dia certo e atrasada, com o valor", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250.5, date: "2026-10-05", card: "c1" }] });
  const d17 = (0, import_lembretes.buildReminders)(d, "2026-10-17").find((x) => x.key.startsWith("due:"));
  import_strict.default.equal(d17.title, "Nubank: fatura vence em 3 dias");
  import_strict.default.match(d17.body, /R\$ 250,50 até 20\/10\/2026/);
  const d20 = (0, import_lembretes.buildReminders)(d, "2026-10-20").find((x) => x.key.startsWith("due:"));
  import_strict.default.equal(d20.title, "Nubank: fatura vence hoje");
  import_strict.default.match(d20.body, /R\$ 250,50/);
  const d21 = (0, import_lembretes.buildReminders)(d, "2026-10-21").find((x) => x.key.startsWith("due:"));
  import_strict.default.equal(d21.title, "Nubank: fatura vencida há 1 dia(s)");
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-10-16").some((x) => x.key.startsWith("due:")), false, "4 dias antes ainda não avisa");
});
(0, import_node_test.default)("fatura marcada como paga não avisa", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: ["2026-10"] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250, date: "2026-10-05", card: "c1" }] });
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-10-20").some((x) => x.key.startsWith("due:")), false);
});
(0, import_node_test.default)("fatura que vence no mês seguinte ao fechamento (vence dia 5, fecha dia 25)", () => {
  const card = { id: "c1", name: "Inter", closeDay: 25, dueDay: 5, paid: [] };
  const d = base({ cards: [card], tx: [{ id: "t", type: "expense", desc: "Loja", amount: 100, date: "2026-10-10", card: "c1" }] });
  const r = (0, import_lembretes.buildReminders)(d, "2026-11-05").find((x) => x.key.startsWith("due:"));
  import_strict.default.equal(r.title, "Inter: fatura vence hoje");
});
(0, import_node_test.default)("total devido no mês soma contas sem cartão e faturas que vencem no mês", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({
    cards: [card],
    tx: [{ id: "t", type: "expense", desc: "Mercado", amount: 250.5, date: "2026-10-05", card: "c1" }],
    bills: [
      { id: "a", kind: "mensal", name: "Aluguel", amount: 1e3, day: 5, start: "2026-01", paid: [] },
      { id: "b", kind: "mensal", name: "Luz", amount: 90, day: 8, start: "2026-01", paid: ["2026-10"] },
      { id: "u", kind: "unica", name: "TV", amount: 300, date: "2026-10-12", card: "c1", paid: [] }
    ]
  });
  import_strict.default.equal((0, import_lembretes.owedInMonth)(d, "2026-10-10"), 1550.5);
  const r = (0, import_lembretes.buildReminders)(d, "2026-10-17").find((x) => x.key.startsWith("due:"));
  import_strict.default.match(r.body, /Em aberto no mês: R\$ 1\.550,50/);
});
(0, import_node_test.default)("resumo do mês no dia 1", () => {
  const d = base({ bills: [{ id: "a", kind: "mensal", name: "Aluguel", amount: 1e3, day: 5, start: "2026-01", paid: [] }] });
  const r = (0, import_lembretes.buildReminders)(d, "2026-11-01");
  const s = r.find((x) => x.key === "sum:2026-11");
  import_strict.default.equal(s.title, "Resumo de novembro");
  import_strict.default.match(s.body, /R\$ 1\.000,00/);
  import_strict.default.equal((0, import_lembretes.buildReminders)(d, "2026-11-02").some((x) => x.key.startsWith("sum:")), false);
});
(0, import_node_test.default)("última parcela absorve os centavos", () => {
  const b = { id: "p", kind: "parcelada", name: "TV", amount: 33.33, last: 33.34, parcels: 3, start: "2026-10", day: 25, paid: [] };
  import_strict.default.equal((0, import_lembretes.occ)([b], "2026-10")[0].amount, 33.33);
  import_strict.default.equal((0, import_lembretes.occ)([b], "2026-12")[0].amount, 33.34);
  import_strict.default.equal((0, import_lembretes.occ)([b], "2027-01").length, 0);
});
(0, import_node_test.default)("chaves de aviso são únicas", () => {
  const card = { id: "c1", name: "Nubank", closeDay: 13, dueDay: 20, paid: [] };
  const d = base({
    cards: [card],
    tx: [{ id: "t", type: "expense", desc: "M", amount: 10, date: "2026-10-05", card: "c1" }],
    bills: [{ id: "a", kind: "mensal", name: "Água", amount: 50, day: 20, start: "2026-01", paid: [] }]
  });
  const r = (0, import_lembretes.buildReminders)(d, "2026-10-20");
  import_strict.default.equal(new Set(r.map((x) => x.key)).size, r.length);
});

