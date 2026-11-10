import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router.jsx";
import { SessaoProvider } from "./auth/Sessao.jsx";

// Mesmo visual do front atual: o CSS é importado direto de frontend/styles enquanto a migração acontece.
import "../../frontend/styles/app.css";
import "../../frontend/styles/login.css";
import "../../frontend/styles/neon.css";
import "./styles/nav.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SessaoProvider>
      <RouterProvider router={router} />
    </SessaoProvider>
  </StrictMode>
);
