import TelaAMigrar from "../components/TelaAMigrar.jsx";

export default function Carteira() {
  return <TelaAMigrar arquivo="carteira.html" itens={["Contas bancárias e saldos", "Cartões e faturas", "Transferências e extrato por conta"]} />;
}
