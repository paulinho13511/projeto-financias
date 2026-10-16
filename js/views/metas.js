// Metas: progresso, depósitos dos últimos 6 meses e sugestão de reserva de emergência.
import { $, showToast } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, mKey, shiftMonth, monthLabel, fmtDate } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { emergenciaMedia } from "../core/analytics.js";
import { ultimosSeisMeses, progressoMeta, depositosPorMes, ultimosDepositos } from "../core/goals.js";

export function renderGoals() {
  const cur = mKey(today());
  const list = state.db.goals || [];
  const months = ultimosSeisMeses(cur);
  $("goalList").innerHTML = list.length ? list.map((g) => {
    const { pct, left, done, perMonth } = progressoMeta(g, cur);
    const info = done
      ? "Meta alcançada"
      : left < 0
        ? "Prazo vencido"
        : `Faltam ${money(g.target - g.saved)} · guardar ${money(perMonth)} por mês até ${monthLabel(g.deadline)}`;
    const log = g.log || [];
    const dep = depositosPorMes(log, months);
    const dmax = Math.max(...dep, 1);
    const totalDep = dep.reduce((s, v) => s + v, 0);
    const recent = ultimosDepositos(log);
    return `<div class="goal">
      <div class="gh"><div style="min-width:0"><div class="t">${esc(g.name)}</div><div class="s">${money(g.saved)} de ${money(g.target)}</div></div><button class="ico" title="Excluir meta" data-gdel="${esc(g.id)}">×</button></div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="s">${info}</div>
      ${done ? "" : `<div class="gr"><input type="number" step="0.01" min="0.01" placeholder="Guardar agora (R$)" data-gin="${esc(g.id)}"><button class="ghost" type="button" data-gadd="${esc(g.id)}">Guardar</button></div>`}
      <div class="hist ghist">${months.map((m, i) => `<div class="hcol ${m === cur ? "cur" : ""}"><div class="hbar" style="height:${((dep[i] / dmax) * 100).toFixed(1)}%" title="${esc(monthLabel(m))}: ${esc(money(dep[i]))}"></div><span>${monthLabel(m).split(" ")[0].slice(0, 3)}</span></div>`).join("")}</div>
      <div class="s">Depositado nos últimos 6 meses: ${money(totalDep)}${recent.length ? ` · Últimos: ${recent.map((x) => `${fmtDate(x.d)} ${money(x.v)}`).join(", ")}` : ""}</div>
    </div>`;
  }).join("") : `<div class="empty">Crie uma meta: reserva de emergência, viagem, troca de celular...</div>`;
}

export function renderEmergencia() {
  const cur = mKey(today());
  const media = emergenciaMedia(state.db, cur);
  if (media === null) {
    $("emerg").innerHTML = `<h2>Reserva de emergência</h2><div class="empty">Registre despesas de pelo menos um mês anterior para sugerir o valor.</div>`;
    return;
  }
  $("emerg").innerHTML = `<h2>Reserva de emergência</h2>
    <p class="muted" style="font-size:14px;line-height:1.5;margin:0 0 12px">Suas despesas médias recentes são <b>${money(media)}</b> por mês. Três meses dão <b>${money(media * 3)}</b>; seis meses dão <b>${money(media * 6)}</b>.</p>
    <button class="ghost" type="button" id="emergBtn">Usar seis meses como meta</button>`;
  $("emergBtn").onclick = () => {
    $("gName").value = "Reserva de emergência";
    $("gTarget").value = Math.round(media * 6);
    $("gDeadline").value = shiftMonth(cur, 12);
    $("gName").focus();
    showToast("Revise os dados e clique em Criar meta");
  };
}
