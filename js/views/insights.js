// Insights: resumo do mês com dicas, e renda variável.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, mKey, monthLabel } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { resumoMes, rendasRecentes } from "../core/analytics.js";

export function renderVar() {
  const { db } = state;
  const on = !!(db.settings && db.settings.variable);
  $("varIncome").checked = on;
  if (!on) {
    $("varInfo").textContent = "Ative se sua renda muda de mês. O app sugere um orçamento com base na sua menor renda recente.";
    return;
  }
  const incs = rendasRecentes(db, mKey(today()));
  if (incs.length < 3) {
    $("varInfo").textContent = `Registre receitas de pelo menos 3 meses para calcular (você tem ${incs.length}).`;
    return;
  }
  const min = Math.min(...incs);
  $("varInfo").innerHTML = `Menor renda dos últimos ${incs.length} meses com receita: <b>${esc(money(min))}</b>. Planeje seus gastos fixos até esse valor; o que entrar acima dele vai para a reserva.`;
}

// Dicas em linguagem simples, a partir da taxa de economia, da variação e da maior categoria
function dicas({ rate, diff, prevK, top, avg }) {
  const tips = [];
  if (rate === null) tips.push("Cadastre as receitas deste mês para ver sua taxa de economia.");
  else if (rate < 0) tips.push("Você gastou mais do que recebeu neste mês. Vale revisar as maiores categorias.");
  else if (rate < 10) tips.push("Sua taxa de economia está abaixo de 10%. Tente reduzir os gastos variáveis.");
  else tips.push(`Você guardou cerca de ${rate.toFixed(0)}% da receita neste mês. Ótimo ritmo.`);
  if (diff !== null) {
    tips.push(diff > 0
      ? `Suas despesas subiram ${diff.toFixed(0)}% em relação a ${monthLabel(prevK)}.`
      : `Suas despesas caíram ${Math.abs(diff).toFixed(0)}% em relação a ${monthLabel(prevK)}.`);
  }
  if (top) tips.push(`Maior categoria de gasto: ${top[0]}, com ${money(top[1])}.`);
  tips.push(`Média diária de gasto: ${money(avg)}.`);
  return tips;
}

export function renderIns() {
  const { db, sel } = state;
  const r = resumoMes(db, sel, today());
  const { diff, avg, rate, contas, prevK, top } = r;
  const fmtPct = diff === null ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(0) + "%";

  $("insBody").innerHTML = `
    <div class="card"><h2>Resumo do mês</h2>
      <div class="list">
        <div class="row"><span class="t">Taxa de economia</span><span class="amt">${rate === null ? "—" : rate.toFixed(0) + "%"}</span></div>
        <div class="row"><span class="t">Variação de despesas</span><span class="amt ${diff > 0 ? "expense" : "income"}">${fmtPct}</span></div>
        <div class="row"><span class="t">Média diária</span><span class="amt">${money(avg)}</span></div>
        <div class="row"><span class="t">Contas do mês</span><span class="amt">${money(contas)}</span></div>
      </div>
    </div>
    <div class="card"><h2>Insights</h2>
      ${dicas({ rate, diff, prevK, top, avg }).map((x) => `<div class="tip"><p>${esc(x)}</p></div>`).join("")}
    </div>`;
}
