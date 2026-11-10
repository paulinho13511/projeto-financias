import TelaAMigrar from "../components/TelaAMigrar.jsx";

export default function Inicio() {
  return <TelaAMigrar arquivo="inicio.html" itens={["Saldo do mês, receitas e despesas", "Estou bem? · Posso gastar? · O que vem aí?", "Gráfico de gastos acumulados", "Prévia de notificações e últimos lançamentos"]} />;
}
