import { Link } from "react-router-dom";

export default function NaoEncontrada() {
  return (
    <section className="card">
      <div className="empty">Essa tela não existe. <Link to="/">Voltar ao início</Link></div>
    </section>
  );
}
