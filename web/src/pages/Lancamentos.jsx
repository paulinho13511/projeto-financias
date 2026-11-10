import TelaAMigrar from "../components/TelaAMigrar.jsx";

export default function Lancamentos() {
  return <TelaAMigrar arquivo="lancamentos.html" itens={["Novo lançamento (despesa ou receita, à vista ou parcelado)", "Histórico com busca e filtros", "Exportar CSV, imprimir e importar extrato"]} />;
}
