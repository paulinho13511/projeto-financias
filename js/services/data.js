// Dados do app na tabela app_data (um JSON por usuário) e acesso em allowed_emails.
//
// Gravação em fila: uma escrita de cada vez, sempre com o estado mais recente.
// Controle de concorrência: a escrita só vale se o registro não mudou desde a última leitura
// (updated_at é a versão). Se outro aparelho gravou antes, nada é sobrescrito.
import { sb } from "./supabase.js";

const ERROR_THROTTLE_MS = 4000;

let writeChain = Promise.resolve();
let lastSaveErr = 0;
let dbUpdatedAt = null;  // updated_at do registro na última leitura/gravação bem-sucedida
let dbConflict = false;  // true = dados mudaram em outro lugar; gravações bloqueadas até recarregar

export const isConflict = () => dbConflict;

export function resetSync() {
  dbUpdatedAt = null;
  dbConflict = false;
}

// null = este e-mail não tem acesso
export async function fetchAccess(email) {
  const { data, error } = await sb.from("allowed_emails").select("email,is_admin").eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchData() {
  const { data, error } = await sb.from("app_data").select("data,updated_at").eq("id", 1).single();
  if (error) throw error;
  dbUpdatedAt = data.updated_at;
  dbConflict = false;
  const d = data.data || {};
  d.tx = d.tx || [];
  d.bills = d.bills || [];
  d.budgets = d.budgets || {};
  d.cards = d.cards || [];
  d.goals = d.goals || [];
  d.settings = d.settings || {};
  return d;
}

// Enfileira a gravação de um snapshot. onError recebe "conflict" ou "network",
// no máximo uma vez a cada 4 segundos para não encher a tela de avisos.
export function enqueueWrite(snapshot, email, onError) {
  writeChain = writeChain
    .then(async () => {
      const expected = dbUpdatedAt; // lido dentro da fila, para refletir a gravação anterior
      const nowIso = new Date().toISOString();
      const { data, error } = await sb.from("app_data")
        .update({ data: snapshot, updated_by: email, updated_at: nowIso })
        .eq("id", 1)
        .eq("updated_at", expected)
        .select("updated_at");
      if (error) throw error;
      if (!data || !data.length) {
        dbConflict = true;
        throw new Error("conflito");
      }
      dbUpdatedAt = data[0].updated_at;
    })
    .catch(() => {
      const now = Date.now();
      if (now - lastSaveErr > ERROR_THROTTLE_MS) {
        lastSaveErr = now;
        onError(dbConflict ? "conflict" : "network");
      }
    });
}
