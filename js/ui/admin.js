// Acessos de usuários (somente administrador): liberar contas e remover acessos.
import { $, ask, showToast } from "./dom.js";
import { esc } from "../core/format.js";
import { adminCall, listAccess, removeAccess } from "../services/admin.js";

const MIN_PASSWORD = 10;

function openAcl() {
  $("menu").hidden = true;
  $("aclSheet").hidden = false;
  loadAcl();
}

async function loadAcl() {
  const list = $("aclList");
  list.innerHTML = `<div class="empty">Carregando…</div>`;
  let data;
  try {
    data = await listAccess();
  } catch (err) {
    list.innerHTML = `<div class="empty">Não foi possível carregar a lista.</div>`;
    return;
  }
  list.innerHTML = data.length
    ? data.map((r) => `
    <div class="row"><div class="rmain"><div class="t">${esc(r.email)}</div>
    <div class="s">${r.is_admin ? "Administrador" : "Pode usar o app"}</div></div>
    ${r.is_admin ? "" : `<button class="ico" title="Remover acesso" data-rm="${esc(r.email)}">×</button>`}</div>`).join("")
    : `<div class="empty">Nenhum outro e-mail liberado</div>`;
  list.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = async () => {
      const em = b.dataset.rm;
      if (!(await ask(`Remover o acesso de ${em}?`))) return;
      try {
        await removeAccess(em);
      } catch (err) {
        showToast("Não foi possível remover o acesso");
        return;
      }
      showToast("Acesso removido");
      loadAcl();
    };
  });
}

export function wireAdmin() {
  $("accessBtn").onclick = openAcl;
  $("aclClose").onclick = () => { $("aclSheet").hidden = true; };
  $("aclForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("aclEmail").value.trim().toLowerCase();
    const password = $("aclPw").value;
    if (password.length < MIN_PASSWORD) {
      showToast("A senha precisa ter pelo menos 10 caracteres");
      return;
    }
    try {
      await adminCall({ action: "create", email, password });
      $("aclEmail").value = "";
      $("aclPw").value = "";
      showToast("Acesso criado. Envie o e-mail e a senha para a pessoa.");
      loadAcl();
    } catch (err) {
      showToast(err.message || "Não foi possível criar o acesso");
    }
  };
}
