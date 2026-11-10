import { createBrowserRouter } from "react-router-dom";
import AppLayout from "./layout/AppLayout.jsx";
import Protegido from "./auth/Protegido.jsx";
import Inicio from "./pages/Inicio.jsx";
import Lancamentos from "./pages/Lancamentos.jsx";
import Carteira from "./pages/Carteira.jsx";
import Contas from "./pages/Contas.jsx";
import Calendario from "./pages/Calendario.jsx";
import Categorias from "./pages/Categorias.jsx";
import Assinaturas from "./pages/Assinaturas.jsx";
import Metas from "./pages/Metas.jsx";
import NaoEncontrada from "./pages/NaoEncontrada.jsx";

// Todas as telas ficam dentro do AppLayout (cabeçalho + barra lateral + barra inferior),
// e o AppLayout só aparece para quem está logado (Protegido mostra a tela de entrada no lugar).
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Protegido><AppLayout /></Protegido>,
    children: [
      { index: true, element: <Inicio /> },
      { path: "lancamentos", element: <Lancamentos /> },
      { path: "carteira", element: <Carteira /> },
      { path: "contas", element: <Contas /> },
      { path: "calendario", element: <Calendario /> },
      { path: "categorias", element: <Categorias /> },
      { path: "assinaturas", element: <Assinaturas /> },
      { path: "metas", element: <Metas /> },
      { path: "*", element: <NaoEncontrada /> },
    ],
  },
]);
