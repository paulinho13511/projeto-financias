import { useSessao } from "./Sessao.jsx";
import TelaEntrada from "./TelaEntrada.jsx";

// Só mostra o app para quem está dentro. O endereço não muda: depois de entrar, a pessoa continua na tela que abriu.
export default function Protegido({ children }) {
  const { estado } = useSessao();
  return estado === "dentro" ? children : <TelaEntrada />;
}
