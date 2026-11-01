// Primeiro acesso por convite: /definir-senha?token=... (o código vale uma vez e expira em 7 dias).
const dsToken = new URLSearchParams(location.search).get("token") || "";
history.replaceState(null, "", location.pathname);   // tira o código da barra de endereço e do histórico
const dsMsg = (t, ok) => { const m = document.getElementById("dsMsg"); m.textContent = t; m.classList.toggle("ok", !!ok); };
if (!dsToken) { dsMsg("Link incompleto. Peça um novo convite ao administrador."); document.getElementById("dsBtn").disabled = true; }
document.getElementById("dsForm").onsubmit = async e => {
  e.preventDefault();
  const a = document.getElementById("dsPw").value, b = document.getElementById("dsPw2").value;
  if (a.length < 10) { dsMsg("A senha precisa ter pelo menos 10 caracteres."); return; }
  if (a !== b) { dsMsg("As senhas não conferem."); return; }
  const btn = document.getElementById("dsBtn");
  btn.disabled = true; dsMsg("");
  try {
    await API.post("/api/definir-senha", { token: dsToken, senha: a });
    document.getElementById("dsForm").hidden = true;
    dsMsg("Senha definida. Agora é só entrar com seu e-mail e essa senha.", true);
    document.getElementById("dsIr").hidden = false;
  } catch (err) {
    dsMsg(err.rede ? "Sem conexão. Tente de novo." : err.message);
    btn.disabled = false;
  }
};
