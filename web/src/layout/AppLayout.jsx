import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { TELAS, tituloDe } from "../routes.js";
import { Icone } from "./Icones.jsx";
import { useSessao } from "../auth/Sessao.jsx";

// Moldura do app: mesmas classes do front atual (.side, .bottom, .app, .top), então o visual é o mesmo.
export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [maisAberto, setMaisAberto] = useState(false);
  const { usuario, sair } = useSessao();
  const titulo = tituloDe(pathname);

  useEffect(() => { document.title = `${titulo} · Minhas Finanças`; setMaisAberto(false); }, [titulo]);

  const ir = path => () => navigate(path);
  const on = path => (pathname === path ? "on" : undefined);

  return (
    <>
      <aside className="side" aria-label="Navegação principal">
        <div className="brand"><i></i>Minhas Finanças</div>
        {TELAS.map(t => (
          <button key={t.id} className={on(t.path)} aria-current={pathname === t.path ? "page" : undefined} onClick={ir(t.path)}>
            {t.titulo}
          </button>
        ))}
        <button className="sideNew" onClick={ir("/lancamentos")}>+ Novo lançamento</button>
        <button className="sideSair" onClick={() => sair()} title={usuario && usuario.email}>Sair</button>
      </aside>

      <nav className="bottom" aria-label="Navegação">
        {TELAS.filter(t => t.inferior).slice(0, 2).map(t => (
          <button key={t.id} className={on(t.path)} onClick={ir(t.path)}>
            <Icone nome={t.id} /><span>{t.titulo}</span>
          </button>
        ))}
        <button className={["fab", on("/lancamentos")].filter(Boolean).join(" ")} aria-label="Novo lançamento" onClick={ir("/lancamentos")}>
          <Icone nome="novo" />
        </button>
        {TELAS.filter(t => t.inferior).slice(2).map(t => (
          <button key={t.id} className={on(t.path)} onClick={ir(t.path)}>
            <Icone nome={t.id} /><span>{t.titulo}</span>
          </button>
        ))}
        <button aria-expanded={maisAberto} onClick={() => setMaisAberto(v => !v)}>
          <Icone nome="mais" /><span>Mais</span>
        </button>
      </nav>

      {maisAberto && (
        <div className="sheet" onClick={() => setMaisAberto(false)}>
          <div className="sheetbox maisLista" onClick={e => e.stopPropagation()}>
            {TELAS.map(t => (
              <button key={t.id} className={on(t.path)} onClick={ir(t.path)}>{t.titulo}</button>
            ))}
            <button className="sair" onClick={() => sair()}>Sair{usuario ? ` (${usuario.email})` : ""}</button>
            <button className="close" onClick={() => setMaisAberto(false)}>Fechar</button>
          </div>
        </div>
      )}

      <div className="app">
        <header className="top">
          <div className="ttl">
            <small>Minhas Finanças</small>
            <h1>{titulo}</h1>
          </div>
        </header>
        <main className="view on">
          <Outlet />
        </main>
      </div>
    </>
  );
}
