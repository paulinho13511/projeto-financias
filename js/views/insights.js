// Insights: resumo do mês, regra 50/30/20, revisão do mês e renda variável.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, mKey, shiftMonth, monthLabel } from "../core/dates.js";
import { money, esc, capitalize } from "../core/format.js";
import { totals, expenseByCategory, catTotals } from "../core/ledger.js";
import { resumoMes, regra503, revisaoDelta, rendasRecentes } from "../core/analytics.js";

function renderRegra() {
  const { db, sel } = state;
  const t = totals(db, sel);
  const r = regra503(t, expenseByCategory(t).byCat);
  if (!r) {
    $("rule503").innerHTML = `<h2>Regra 50/30/20</h2><div class="empty">Registre as receitas deste mês para comparar com a regra.</div>`;
    return;
  }
  const linha = (nome, real, meta, cls) => `<div class="r503"><div class="hd"><span>${nome}</span><span>${real.toFixed(0)}% · meta ${meta}</span></div><div class="bar"><i class="${cls}" style="width:${Math.min(real, 100).toFixed(1)}%"></i></div></div>`;
  $("rule503").innerHTML = `<h2>Regra 50/30/20</h2>
    <p class="muted" style="font-size:13px;margin:0 0 10px">Percentual da receita do mês.</p>
    ${linha("Necessidades", r.nec, "50%", r.nec > 50 ? "over" : "")}
    ${linha("Desejos", r.des, "30%", r.des > 30 ? "over" : "")}
    ${linha("Poupança", r.pou, "mín. 20%", r.pou < 20 ? "near" : "")}`;
}

function renderRevisao() {
  const { db, sel } = state;
  const prevK = shiftMonth(sel, -1);
  const delta = revisaoDelta(catTotals(db, sel), catTotals(db, prevK));
  const head = `<h2>Revisão do mês</h2>`;
  if (!delta.length) {
    $("review").innerHTML = head + `<div class="empty">Nenhuma mudança relevante em relação a ${esc(monthLabel(prevK))}.</div>`;
    return;
  }
  const subida = delta.find((x) => x.d > 0);
  $("review").innerHTML = head + `<p class="muted" style="font-size:13px;margin:0 0 10px">O que mudou em relação a ${esc(monthLabel(prevK))}:</p>`
    + delta.map((x) => `<div class="row"><span class="t">${esc(x.c)}</span><span class="amt ${x.d > 0 ? "expense" : "income"}">${x.d > 0 ? "+" : "−"} ${money(Math.abs(x.d))}</span></div>`).join("")
    + (subida ? `<p class="muted" style="font-size:13px;margin:12px 0 0">Maior aumento: ${esc(subida.c)}. Vale definir um limite para ela no mês que vem (aba Categorias).</p>` : "");
}

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

export function renderIns() {
  const { db, sel } = state;
  const { cur, diff, avg, rate, comprometido, top, contas } = resumoMes(db, sel, today());
  const fmtPct = (v) => v === null ? "—" : (v > 0 ? "+" : "") + v.toFixed(0) + "%";

  $("insHero").innerHTML = `
    <div class="insTop">
      <div><small class="muted">Resumo do mês</small><h2 class="insTitle">${esc(capitalize(monthLabel(sel)))}</h2></div>
      <span class="badge ${rate !== null && rate < 0 ? "bad" : ""}">${rate === null ? "Sem receitas" : "Economia de " + rate.toFixed(0) + "%"}</span>
    </div>
    <div class="insTiles">
      <div class="tile in"><span>Receitas</span><b data-priv>${money(cur.inc)}</b></div>
      <div class="tile out"><span>Despesas</span><b>${money(cur.exp)}</b></div>
      <div class="tile bal"><span>Saldo</span><b data-priv class="${cur.bal < 0 ? "expense" : ""}">${money(cur.bal)}</b></div>
    </div>
    <div class="meterWrap">
      <div class="meterLabel"><span>Parte da receita já gasta</span><b>${cur.inc ? comprometido.toFixed(0) + "%" : "—"}</b></div>
      <div class="meter ${comprometido >= 100 ? "over" : ""}"><i style="width:${comprometido.toFixed(1)}%"></i></div>
    </div>`;

  $("insDetails").innerHTML = `
    <h2>Detalhes</h2>
    <div class="kv">
      <div><span>Variação de despesas</span><b class="${diff !== null && diff > 0 ? "expense" : "income"}">${fmtPct(diff)}</b></div>
      <div><span>Média diária de gasto</span><b>${money(avg)}</b></div>
      <div><span>Contas fixas e parceladas</span><b>${money(contas)}</b></div>
      <div><span>Maior categoria</span><b>${top ? esc(top[0]) + " · " + money(top[1]) : "—"}</b></div>
    </div>`;
  renderRegra();
  renderRevisao();
}
