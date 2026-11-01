// Conta atrasada que atravessa a virada do mês continua gerando aviso (antes o push parava no dia 1).
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReminders } = require("../../api/_lib/lembretes.js");

test("conta atrasada do mês anterior continua avisando na virada do mês (até 7 dias)", () => {
  const d = { tx: [], cards: [], bills: [{ id: "a", kind: "mensal", name: "Aluguel", amount: 800, day: 29, start: "2026-01", paid: ["2026-09"] }] };
  const atrasada = buildReminders(d, "2026-11-02").find(x => /^bill:a:2026-10:late/.test(x.key));
  assert.ok(atrasada, "aviso de atraso do mês anterior sumiu");
  assert.equal(atrasada.title, "Conta atrasada há 4 dia(s)");
  assert.ok(!buildReminders(d, "2026-11-10").some(x => /2026-10/.test(x.key)), "depois de 7 dias o push para");
});

test("conta do mês anterior já paga não avisa", () => {
  const d = { tx: [], cards: [], bills: [{ id: "a", kind: "mensal", name: "Aluguel", amount: 800, day: 29, start: "2026-01", paid: ["2026-10"] }] };
  assert.ok(!buildReminders(d, "2026-11-02").some(x => /2026-10/.test(x.key)));
});
