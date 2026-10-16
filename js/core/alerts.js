// Avisos da tela inicial: lembretes de contas, faturas e limites de categoria. Funções puras.
import { mKey, today } from "./dates.js";
import { money } from "./format.js";
import { contasEmAberto } from "./billing.js";
import { cardAlerts } from "./cards.js";
import { totals, expenseByCategory } from "./ledger.js";

export function avisosInicio(db, sel, hoje = today()) {
  // lembretes: contas em aberto nos próximos 7 dias
  const rem = contasEmAberto(db.bills, mKey(hoje), hoje).filter((x) => x.st.d <= 7);
  const cards = cardAlerts(db, hoje);

  const msgs = rem
    .filter((x) => x.st.d <= 2)
    .map(({ b, st, amount }) => ({
      title: st.d < 0 ? "Conta atrasada" : st.d === 0 ? "Conta vence hoje" : `Conta vence em ${st.d} dia(s)`,
      body: `${b.name}: ${money(amount)}`,
    }))
    .concat(cards.map((c) => ({ title: c.title, body: c.body })));

  const { byCat } = expenseByCategory(totals(db, sel));
  Object.entries(db.budgets || {}).forEach(([c, lim]) => {
    const v = byCat[c] || 0;
    if (v >= lim) msgs.push({ title: "Limite atingido", body: `${c}: ${money(v)} de ${money(lim)}` });
    else if (v >= lim * 0.8) msgs.push({ title: "Quase no limite", body: `${c}: ${money(v)} de ${money(lim)} (${Math.round((v / lim) * 100)}%)` });
  });

  return { rem, cards, msgs };
}
