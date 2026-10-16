// Autenticação. Erros de rede e de credencial propagam como exceção para a tela tratar.
import { sb } from "./supabase.js";

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function getSession() {
  try {
    return (await sb.auth.getSession()).data.session;
  } catch (e) {
    return null;
  }
}

// Encerra a sessão local sem propagar erro (usado ao bloquear o app)
export async function signOut() {
  try {
    await sb.auth.signOut();
  } catch (e) {
    // sessão já encerrada ou sem rede: nada a fazer
  }
}

export async function updatePassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}
