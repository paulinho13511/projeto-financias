// Cliente da API (mesmo comportamento de frontend/js/api.js, agora como módulo).
// A sessão vive num cookie httpOnly que o navegador envia sozinho; o JavaScript nunca vê o token.
// Erros chegam como Error com .status (código HTTP) e .message (texto vindo do servidor); falha de rede tem .rede = true.
async function chamar(metodo, caminho, corpo) {
  let r;
  try {
    r = await fetch(caminho, {
      method: metodo,
      credentials: "same-origin",
      cache: "no-store",
      headers: metodo === "GET" ? {} : { "Content-Type": "application/json" },
      body: metodo === "GET" ? undefined : JSON.stringify(corpo || {}),
    });
  } catch {
    const e = new Error("Sem conexão"); e.rede = true; throw e;
  }
  let dados = null;
  try { dados = await r.json(); } catch { /* resposta sem corpo */ }
  if (!r.ok) {
    const e = new Error((dados && dados.erro) || "Não foi possível concluir");
    e.status = r.status; e.dados = dados;
    throw e;
  }
  return dados;
}

export const API = {
  get: c => chamar("GET", c),
  post: (c, b) => chamar("POST", c, b),
  put: (c, b) => chamar("PUT", c, b),
  patch: (c, b) => chamar("PATCH", c, b),
  del: (c, b) => chamar("DELETE", c, b),
};
