// Edge Function: envia por push os avisos de contas e cartões, uma vez por aviso.
// Disparada todo dia pelo pg_cron (ver supabase/README.md). Requer o segredo CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { buildReminders, todaySP, type Data } from "./logic.ts";

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`variável ${k} não configurada`);
  return v;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("não autorizado", { status: 401 });

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

  const { data: row, error: e1 } = await sb.from("app_data").select("data").eq("id", 1).single();
  if (e1) return new Response("erro ao ler dados", { status: 500 });
  const data: Data = { tx: [], bills: [], cards: [], ...(row.data || {}) };

  // Só envia para quem ainda tem acesso ao app
  const { data: access } = await sb.from("allowed_emails").select("email");
  const allowed = new Set((access || []).map((r: { email: string }) => r.email.toLowerCase()));
  const { data: subs, error: e2 } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth,email");
  if (e2) return new Response("erro ao ler inscrições", { status: 500 });
  const targets = (subs || []).filter((s: { email: string }) => allowed.has(s.email.toLowerCase()));

  const today = todaySP();
  const reminders = buildReminders(data, today);
  if (!reminders.length || !targets.length) return Response.json({ today, sent: 0, candidates: reminders.length });

  // Avisos já enviados (deduplicação)
  const keys = reminders.map(r => r.key);
  const { data: already } = await sb.from("reminder_log").select("key").in("key", keys);
  const sentKeys = new Set((already || []).map((r: { key: string }) => r.key));
  const fresh = reminders.filter(r => !sentKeys.has(r.key));

  let sent = 0, failed = 0;
  for (const r of fresh) {
    let ok = false;
    for (const s of targets) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: r.title, body: r.body, tag: r.key }),
          { TTL: 60 * 60 * 12 },
        );
        ok = true;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else failed++;
      }
    }
    if (ok) {
      await sb.from("reminder_log").insert({ key: r.key });
      sent++;
    }
  }

  // Limpeza do registro de envios com mais de 120 dias
  const cutoff = new Date(Date.now() - 120 * 864e5).toISOString();
  await sb.from("reminder_log").delete().lt("sent_at", cutoff);

  return Response.json({ today, candidates: reminders.length, sent, failed });
});
