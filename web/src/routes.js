// Lista única das telas: o roteador, a barra lateral, a barra inferior e o título do cabeçalho leem daqui.
// Tela nova = um item aqui + o componente em src/pages/.
export const TELAS = [
  { path: "/",            id: "inicio",      titulo: "Início",       inferior: true },
  { path: "/lancamentos", id: "lancamentos", titulo: "Lançamentos" },
  { path: "/carteira",    id: "carteira",    titulo: "Carteira" },
  { path: "/metas",       id: "metas",       titulo: "Metas",        inferior: true },
  { path: "/contas",      id: "contas",      titulo: "Contas" },
  { path: "/calendario",  id: "calendario",  titulo: "Calendário",   inferior: true },
  { path: "/categorias",  id: "categorias",  titulo: "Categorias" },
  { path: "/assinaturas", id: "assinaturas", titulo: "Assinaturas" },
];

export const tituloDe = pathname => (TELAS.find(t => t.path === pathname) || { titulo: "Não encontrada" }).titulo;
