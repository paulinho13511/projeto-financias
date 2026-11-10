// Marcador temporário: mostra o que a tela vai ter e de onde vem o HTML antigo. Some quando a tela for migrada.
export default function TelaAMigrar({ arquivo, itens }) {
  return (
    <section className="card migrar">
      <b>Tela ainda não migrada</b>
      <p>HTML atual: <code>frontend/screens/views/{arquivo}</code></p>
      <ul>{itens.map(i => <li key={i}>{i}</li>)}</ul>
    </section>
  );
}
