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

export async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

// Assinatura antiga deste aparelho (outra chave VAPID ou expirada) é descartada e recriada.
// Lança exceção em qualquer falha.
export async function subscribe(email) {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) {
    await old.unsubscribe();
    await sb.from("push_subscriptions").delete().eq("endpoint", old.endpoint);
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToBytes(VAPID_PUBLIC),
  });
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({
    endpoint: j.endpoint,
    email: email.toLowerCase(),
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) throw error;
}
