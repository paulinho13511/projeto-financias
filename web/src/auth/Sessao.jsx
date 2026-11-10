import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API } from "../lib/api.js";

// Sessão do app (mesmas regras do front atual, frontend/js/app.js):
// - a sessão de verdade é o cookie httpOnly "sid"; "mf_sessao" no localStorage é só uma dica para mostrar o
//   esqueleto em vez do formulário ao reabrir o app;
// - bloqueia depois de 30 min sem uso e ao voltar depois de mais de 1 min com a página em segundo plano.
const INATIVO_MS = 30 * 60 * 1000;
const FORA_MS = 60 * 1000;
const DICA = "mf_sessao";

const dica = {
  ler: () => { try { return localStorage.getItem(DICA) === "1"; } catch { return false; } },
  gravar: () => { try { localStorage.setItem(DICA, "1"); } catch { /* sem armazenamento: só perde a dica */ } },
  apagar: () => { try { localStorage.removeItem(DICA); } catch { /* idem */ } },
};

const MSG_SEM_ACESSO = "Este e-mail ainda não tem acesso. Peça ao administrador para liberar.";
const MSG_NUVEM = "Não foi possível conectar à nuvem. Tente entrar de novo.";

const SessaoCtx = createContext(null);
export const useSessao = () => useContext(SessaoCtx);

export function SessaoProvider({ children }) {
  // estado: "verificando" (dica presente, conferindo o cookie) | "fora" | "dentro"
  const [estado, setEstado] = useState(() => (dica.ler() ? "verificando" : "fora"));
  const [usuario, setUsuario] = useState(null);       // { email, is_admin }
  const [aviso, setAviso] = useState("");              // mensagem mostrada na tela de entrada
  const bloqueadoAte = useRef(0);                      // espera local depois de "muitas tentativas"

  const sair = useCallback(async (motivo = "") => {
    setUsuario(null);
    setEstado("fora");
    setAviso(motivo);
    dica.apagar();
    try { await API.post("/api/logout"); } catch { /* a sessão pode já ter acabado */ }
  }, []);

  // Ao abrir: se este aparelho já entrou antes, confere se o cookie ainda vale.
  useEffect(() => {
    if (estado !== "verificando") return;
    let vivo = true;
    API.get("/api/me")
      .then(me => { if (vivo) { setUsuario(me); setEstado("dentro"); } })
      .catch(err => {
        if (!vivo) return;
        if (err.status === 401) dica.apagar();   // expirou ou foi encerrada em outro lugar
        setAviso(err.status === 403 ? MSG_SEM_ACESSO : err.status === 401 ? "" : MSG_NUVEM);
        setEstado("fora");
      });
    return () => { vivo = false; };
  }, [estado]);

  // Devolve a mensagem de erro (texto vazio = entrou).
  const entrar = useCallback(async (email, senha) => {
    const espera = bloqueadoAte.current - Date.now();
    if (espera > 0) return `Muitas tentativas. Aguarde ${Math.ceil(espera / 1000)} s.`;
    let aceito = false;   // true = e-mail e senha aceitos pelo servidor
    try {
      await API.post("/api/login", { email: email.trim().toLowerCase(), senha });
      aceito = true;
      const me = await API.get("/api/me");
      dica.gravar();
      setUsuario(me);
      setAviso("");
      setEstado("dentro");
      return "";
    } catch (err) {
      if (err.status === 403) return MSG_SEM_ACESSO;
      if (err.status === 401 && !aceito) return "E-mail ou senha incorretos.";   // o servidor conta as tentativas
      if (err.status === 429) { bloqueadoAte.current = Date.now() + 30000; return "Muitas tentativas. Aguarde alguns minutos."; }
      if (aceito) { try { await API.post("/api/logout"); } catch { /* não deixa sessão pela metade */ } }
      return MSG_NUVEM;
    }
  }, []);

  // Bloqueio automático, só enquanto há alguém dentro.
  useEffect(() => {
    if (estado !== "dentro") return;
    let timer = setTimeout(() => sair("Bloqueado por inatividade"), INATIVO_MS);
    const mexeu = () => { clearTimeout(timer); timer = setTimeout(() => sair("Bloqueado por inatividade"), INATIVO_MS); };
    let saiuEm = 0;
    const visibilidade = () => {
      if (document.hidden) saiuEm = Date.now();
      else if (saiuEm && Date.now() - saiuEm > FORA_MS) sair("Bloqueado ao sair da página");
    };
    const eventos = ["pointerdown", "keydown", "touchstart", "scroll"];
    eventos.forEach(ev => document.addEventListener(ev, mexeu, { passive: true }));
    document.addEventListener("visibilitychange", visibilidade);
    return () => {
      clearTimeout(timer);
      eventos.forEach(ev => document.removeEventListener(ev, mexeu));
      document.removeEventListener("visibilitychange", visibilidade);
    };
  }, [estado, sair]);

  // O CSS atual esconde a moldura do app com body.locked.
  useEffect(() => { document.body.classList.toggle("locked", estado !== "dentro"); }, [estado]);

  return (
    <SessaoCtx.Provider value={{ estado, usuario, aviso, entrar, sair }}>
      {children}
    </SessaoCtx.Provider>
  );
}
