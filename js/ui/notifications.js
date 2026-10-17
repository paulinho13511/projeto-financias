// Botão de notificações: ativa o aviso neste aparelho.
import { $, showToast } from "./dom.js";
import { state } from "../state/store.js";
import { VAPID_PUBLIC, pushSupported, subscribe } from "../services/push.js";

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;

export function wireNotifications() {
  $("notifBtn").onclick = async () => {
    try {
      if (!pushSupported() || !("Notification" in window)) {
        showToast(isIOS
          ? "No iPhone, adicione o app à Tela de Início e ative por lá"
          : "Este navegador não suporta notificações em segundo plano");
        return;
      }
      if (isIOS && !isStandalone) {
        showToast("No iPhone: Compartilhar → Adicionar à Tela de Início, depois ative pelo ícone do app");
        return;
      }
      if (VAPID_PUBLIC.startsWith("COLE_")) {
        showToast("Notificações ainda não configuradas");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        showToast("Permissão de notificação não concedida");
        return;
      }
      await subscribe(state.sessionUser.email);
      showToast("Notificações ativadas neste aparelho");
    } catch (err) {
      showToast("Não foi possível ativar as notificações");
    }
  };
}
