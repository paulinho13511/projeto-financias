// Troca de senha feita pelo próprio usuário (folha "Trocar senha").
import { $, showToast } from "./dom.js";
import { updatePassword } from "../services/auth.js";

const MIN_PASSWORD = 10;

export function wireAccount() {
  $("pwBtn").onclick = () => {
    $("menu").hidden = true;
    $("newPw").value = "";
    $("newPw2").value = "";
    $("pwSheet").hidden = false;
  };
  $("pwClose").onclick = () => { $("pwSheet").hidden = true; };
  $("pwForm").onsubmit = async (e) => {
    e.preventDefault();
    const a = $("newPw").value, b = $("newPw2").value;
    if (a.length < MIN_PASSWORD) {
      showToast("A senha precisa ter pelo menos 10 caracteres");
      return;
    }
    if (a !== b) {
      showToast("As senhas não conferem");
      return;
    }
    try {
      await updatePassword(a);
    } catch (err) {
      showToast("Não foi possível trocar a senha");
      return;
    }
    $("pwSheet").hidden = true;
    showToast("Senha trocada com sucesso");
  };
}
