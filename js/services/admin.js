// Chamadas de administração: função segura no Supabase (criação de contas) e lista de acessos.
import { sb } from "./supabase.js";

export async function adminCall(body) {
  const { data, error } = await sb.functions.invoke("hyper-api", { body });
  if (error) {
    let msg = "Não foi possível concluir";
    try {
      const j = await error.context.json();
      if (j && j.error) msg = j.error;
    } catch (e) {
      // resposta sem corpo JSON: mantém a mensagem genérica
    }
    throw new Error(msg);
  }
  return data;
}

export async function listAccess() {
  const { data, error } = await sb.from("allowed_emails").select("email,is_admin").order("email");
  if (error) throw error;
  return data;
}

export async function removeAccess(email) {
  const { error } = await sb.from("allowed_emails").delete().eq("email", email);
  if (error) throw error;
}
