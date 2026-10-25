// Edge Function: envia por push os avisos de contas e cartões, uma vez por aviso e por aparelho.
// Disparada todo dia pelo pg_cron (ver supabase/reminders.sql). O token de chamada fica na
// tabela reminder_config (só a service role lê); o pg_cron lê o mesmo token do banco.
// Cada pessoa recebe só os avisos dos próprios dados, nos próprios aparelhos.
// Corpo opcional: {"dry": true} calcula e devolve os avisos sem enviar nem registrar nada.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";
import { buildReminders, todaySP, type Data, type Reminder } from "./logic.ts";

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`variável ${k} não configurada`);
  return v;
};

// Identificador curto do aparelho (o endpoint completo é longo e não precisa ir para o registro)
async function shortHash(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 6).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Sub { endpoint: string; p256dh: string; auth: string; email: string }
interface Job { key: string; reminder: Reminder; sub: Sub }

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: cfg, error: eCfg } = await sb.from("reminder_config").select("value").eq("key", "cron_token").maybeSingle();
  const token = req.headers.get("x-cron-secret");
  if (eCfg || !cfg || !token || token !== cfg.value) return new Response("não autorizado", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dry = body?.dry === true;

  // Só envia para quem ainda tem acesso ao app
  const { data: access } = await sb.from("allowed_emails").select("email");
  const allowed = new Set((access || []).map((r: { email: string }) => r.email.toLowerCase()));
  const { data: subs, error: e2 } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth,email");
  if (e2) return new Response("erro ao ler inscrições", { status: 500 });
  const targets = (subs || []).filter((s: Sub) => allowed.has(s.email.toLowerCase())) as Sub[];

  // e-mail -> id do usuário -> dados dele
  const { data: list, error: eU } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (eU) return new Response("erro ao ler usuários", { status: 500 });
  const idByEmail = new Map(list.users.map(u => [(u.email ?? "").toLowerCase(), u.id]));
  const { data: rows, error: e1 } = await sb.from("app_data").select("user_id,data");
  if (e1) return new Response("erro ao ler dados", { status: 500 });
  const dataById = new Map((rows || []).map((r: { user_id: string; data: unknown }) => [r.user_id, r.data]));

  const today = todaySP();
  const jobs: Job[] = [];
  const byEmail = new Map<string, Sub[]>();
  targets.forEach(s => { const k = s.email.toLowerCase(); byEmail.set(k, [...(byEmail.get(k) || []), s]); });
  for (const [email, devices] of byEmail) {
    const uid = idByEmail.get(email);
    if (!uid) continue;
    const d: Data = { tx: [], bills: [], cards: [], ...((dataById.get(uid) as object) || {}) };
    for (const r of buildReminders(d, today)) {
      for (const s of devices) jobs.push({ key: `${uid}:${r.key}:${await shortHash(s.endpoint)}`, reminder: r, sub: s });
    }
  }

  if (dry) {
    return Response.json({
      today, dry: true, users: byEmail.size, devices: targets.length, candidates: jobs.length,
      preview: jobs.map(j => ({ title: j.reminder.title, body: j.reminder.body, device: j.sub.endpoint.split("/")[2] })),
    });
  }
  if (!jobs.length) return Response.json({ today, users: byEmail.size, devices: targets.length, sent: 0, candidates: 0 });
  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

  // Avisos já enviados para cada aparelho (deduplicação)
  const { data: already } = await sb.from("reminder_log").select("key").in("key", jobs.map(j => j.key));
  const sentKeys = new Set((already || []).map((r: { key: string }) => r.key));

  let sent = 0, failed = 0, removed = 0;
  const errors: { status?: number; msg: string }[] = [];
  for (const j of jobs.filter(j => !sentKeys.has(j.key))) {
    try {
      await webpush.sendNotification(
        { endpoint: j.sub.endpoint, keys: { p256dh: j.sub.p256dh, auth: j.sub.auth } },
        JSON.stringify({ title: j.reminder.title, body: j.reminder.body, tag: j.reminder.key }),
        { TTL: 60 * 60 * 12, urgency: "high" },
      );
      await sb.from("reminder_log").insert({ key: j.key });   // registrado por aparelho: quem falhou tenta de novo
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) { await sb.from("push_subscriptions").delete().eq("endpoint", j.sub.endpoint); removed++; }
      else { failed++; errors.push({ status: code, msg: String((err as Error).message ?? err).slice(0, 160) }); }
    }
  }

  // Limpeza do registro de envios com mais de 120 dias
  const cutoff = new Date(Date.now() - 120 * 864e5).toISOString();
  await sb.from("reminder_log").delete().lt("sent_at", cutoff);

  return Response.json({ today, users: byEmail.size, devices: targets.length, candidates: jobs.length, sent, failed, removed, errors: errors.slice(0, 3) });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("send-reminders:", e);
    return new Response("erro interno: " + (e instanceof Error ? e.message : String(e)), { status: 500 });
  }
});
