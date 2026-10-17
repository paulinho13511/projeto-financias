// Notificações push: inscrição deste aparelho no Web Push e registro no Supabase.
import { sb } from "./supabase.js";

// Chave pública VAPID (não é segredo). Gerada com: npx web-push generate-vapid-keys
export const VAPID_PUBLIC = "BHf5RmIEowZkC5Nb8ONCW1N57VtopLk-PjE6FePRKvIlfpgCKN1WatRQY9OmDDVhAylk_wRhp-Srfsh6cJyeQMo";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window;

function b64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Reaproveita a inscrição deste aparelho se ela já existir e registra no Supabase.
// Lança exceção em qualquer falha.
export async function subscribe(email) {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(VAPID_PUBLIC),
    });
  }
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({
    endpoint: j.endpoint,
    email: email.toLowerCase(),
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) throw error;
}
