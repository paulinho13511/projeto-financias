// Metas e caixinhas: progresso, prazo e parcela mensal sugerida.
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { today, mKey, monthLabel } from "../core/dates.js";
import { money, esc } from "../core/format.js";
import { progressoMeta } from "../core/goals.js";

export function renderGoals() {
  const cur = mKey(today());
  const list = state.db.goals || [];
  $("goalList").innerHTML = list.length ? list.map((g) => {
    const { pct, left, done, perMonth } = progressoMeta(g, cur);
    const info = done
      ? "Meta alcançada"
      : left < 0
        ? "Prazo vencido"
        : `Faltam ${money(g.target - g.saved)} · guardar ${money(perMonth)} por mês até ${monthLabel(g.deadline)}`;
    return `<div class="goal">
      <div class="gh"><div style="min-width:0"><div class="t">${esc(g.name)}</div><div class="s">${money(g.saved)} de ${money(g.target)}</div></div><button class="ico" title="Excluir meta" data-gdel="${esc(g.id)}">×</button></div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="s">${info}</div>
      ${done ? "" : `<div class="gr"><input type="number" step="0.01" min="0.01" placeholder="Guardar agora (R$)" data-gin="${esc(g.id)}"><button class="ghost" type="button" data-gadd="${esc(g.id)}">Guardar</button></div>`}
    </div>`;
  }).join("") : `<div class="empty">Crie uma meta: reserva de emergência, viagem, troca de celular...</div>`;
}
