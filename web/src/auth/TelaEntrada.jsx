import { useEffect, useRef, useState } from "react";
import { useSessao } from "./Sessao.jsx";
import logoUrl from "../../../frontend/assets/logo-mark.svg?url";
import globoUrl from "../../../frontend/js/login-globe.js?url";

// Tela de entrada: mesma marcação de frontend/screens/overlays/lock.html (ids e classes), para o
// login.css e o globo (frontend/js/login-globe.js, sem nenhuma alteração) funcionarem como hoje.
export default function TelaEntrada() {
  const { estado, aviso, entrar } = useSessao();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(aviso);
  const [enviando, setEnviando] = useState(false);
  const lockRef = useRef(null);

  useEffect(() => { setErro(aviso); }, [aviso]);

  // O globo é um script independente que procura #lock ao rodar. Cada vez que a tela monta, um <script>
  // novo roda de novo; ao desmontar, o próprio script libera o WebGL (canvas.__lkDispose).
  // O setTimeout evita rodar duas vezes no modo estrito do React (monta, desmonta e monta de novo).
  useEffect(() => {
    const lock = lockRef.current;
    let script = null;
    const t = setTimeout(() => {
      script = document.createElement("script");
      script.src = globoUrl;
      document.body.appendChild(script);
    }, 0);
    return () => {
      clearTimeout(t);
      const canvas = lock && lock.querySelector(".lk-globe");
      if (canvas && canvas.__lkDispose) canvas.__lkDispose();
      if (script) script.remove();
    };
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const msg = await entrar(email, senha);
    setSenha("");
    setEnviando(false);
    if (msg) setErro(msg);
  }

  const verificando = estado === "verificando";

  return (
    <div className="lock lk-intro" id="lock" ref={lockRef}>
      <canvas className="lk-globe" aria-hidden="true"></canvas>
      <div className="lk-shell">
        <section className="lk-stage" aria-hidden="true"></section>
        <section className="lk-panel">
          <div className="lk-logo"><img src={logoUrl} alt="" /></div>
          <div className="lk-brand">Minhas Finanças</div>
          <p className="lk-tag">Seu dinheiro sob controle</p>
          {verificando ? (
            <div className="skeleton" style={{ height: 260, width: "100%" }} aria-label="Carregando" />
          ) : (
            <form className="lk-form" onSubmit={enviar}>
              <label className="lk-fld">E-mail
                <input type="email" placeholder="seu@email.com" autoComplete="username" required
                  value={email} onChange={e => setEmail(e.target.value)} />
              </label>
              <label className="lk-fld">Senha
                <input type="password" placeholder="Sua senha" autoComplete="current-password" required
                  value={senha} onChange={e => setSenha(e.target.value)} />
              </label>
              <div className="lk-err" role="alert">{erro}</div>
              <button className="lk-btn" type="submit" disabled={enviando}>Entrar</button>
              <p className="lk-foot">Não tem conta? Peça ao administrador para liberar seu acesso.</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
