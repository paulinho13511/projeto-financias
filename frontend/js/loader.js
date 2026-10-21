// Carrega as telas (frontend/screens) dentro de #screens e só depois inicia o app.
const SCREENS_BASE = "frontend/screens/";
const SCREENS = [
  "shell/nav.html",
  "shell/bottom-nav.html",
  "shell/app-start.html",
  "views/inicio.html",
  "views/lancamentos.html",
  "views/contas.html",
  "views/calendario.html",
  "views/categorias.html",
  "views/assinaturas.html",
  "views/insights.html",
  "views/dicas.html",
  "shell/app-end.html",
  "dialogs/menu.html",
  "dialogs/editar-conta.html",
  "dialogs/acessos.html",
  "dialogs/trocar-senha.html",
  "dialogs/modal.html",
  "overlays/toast.html",
  "overlays/lock.html"
];

async function loadScreens() {
  const host = document.getElementById("screens");
  const parts = await Promise.all(SCREENS.map(async (f) => {
    const res = await fetch(SCREENS_BASE + f, { cache: "no-cache" });
    if (!res.ok) throw new Error("tela não encontrada: " + f);
    return res.text();
  }));
  host.innerHTML = parts.join("\n");
}

loadScreens()
  .then(() => {
    const app = document.createElement("script");
    app.src = "frontend/js/app.js";
    document.body.appendChild(app);
  })
  .catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML("afterbegin", '<p style="padding:16px">Não foi possível carregar a tela. Recarregue a página.</p>');
  });
