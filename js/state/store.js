// Estado único do app. Todos os módulos leem e alteram o estado por aqui.
import { today, mKey } from "../core/dates.js";
import { showToast } from "../ui/dom.js";
import { enqueueWrite, isConflict } from "../services/data.js";

export const state = {
  db: null,            // dados do app, carregados da nuvem depois do login
  sessionUser: null,   // usuário logado (null = bloqueado)
  isAdmin: false,
  sel: mKey(today()),  // mês selecionado (YYYY-MM)
  privacy: false,      // modo privado: desfoca receitas e saldo
  justPaid: null,      // id da conta marcada agora (a linha pisca uma vez)
  fCards: new Set(),   // filtro do histórico por cartão ("none" = sem cartão)
  chartDay: null,      // dia escolhido no gráfico
  chartSel: null,      // mês do gráfico anterior (para resetar o dia escolhido)
  currentView: "inicio",
  homeEdit: false,     // modo "Organizar blocos" da tela inicial
  idleTimer: null,
  fails: 0,            // tentativas de login falhas seguidas
  lockedUntil: 0,      // bloqueio temporário do formulário de login (timestamp)
};

// Grava o estado na nuvem. Não grava se não há sessão ou se houve conflito.
export function save() {
  if (!state.db || !state.sessionUser) return;
  if (isConflict()) {
    showToast("Dados alterados em outro aparelho. Recarregue a página antes de continuar.");
    return;
  }
  const snapshot = JSON.parse(JSON.stringify(state.db));
  enqueueWrite(snapshot, state.sessionUser.email, (kind) => {
    showToast(kind === "conflict"
      ? "Dados alterados em outro aparelho. Recarregue a página; a última alteração não foi salva."
      : "Não foi possível salvar na nuvem. Verifique a conexão.");
  });
}
