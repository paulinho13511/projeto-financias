// Cliente do Supabase (chave pública; a segurança fica na RLS do banco).
// O SDK UMD é carregado por um <script> clássico antes deste módulo e expõe window.supabase.

const SB_URL = "https://htkrdndcbfnngzlghcjj.supabase.co";
const SB_KEY = "sb_publishable_RCdmuHeF4RFa3eoYO-NdNQ_Tr-yhnRo";

export const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
