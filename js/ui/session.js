// Sessão: tela de entrada, início e fim da sessão, bloqueio por inatividade e troca de aba.
import { $ } from "./dom.js";
import { state } from "../state/store.js";
import { today, mKey } from "../core/dates.js";
import { fetchAccess, fetchData, resetSync } from "../services/data.js";
import { signIn, signOut, getSession } from "../services/auth.js";
import { renderAll } from "../render.js";
import { go } from "./nav.js";
import { refreshNotifStatus } from "./notifications.js";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const LOCK_AFTER_FAILS = 5;
const LOCK_WAIT_MS = 30000;

function showLock() {
  $("lock").hidden = false;
  $("lockForm").hidden = false;
  $("lockSkel").hidden = true;
  $("pw").value = "";
  $("lockErr").textContent = "";
}

async function startSession(user) {
  const access = await fetchAccess(user.email.toLowerCase());
  if (!access) throw new Error("sem-acesso");
  const data = await fetchData();
  state.db = data;
  state.sessionUser = user;
  state.isAdmin = !!access.is_admin;
  enterApp();
}

function enterApp() {
  $("lock").hidden = true;
  document.body.classList.remove("locked");
  $("accessBtn").hidden = !state.isAdmin;
  state.sel = mKey(today());
  renderAll();
  go("inicio");
  bumpIdle();
  refreshNotifStatus();
}

async function lockApp(reason) {
  state.db = null;
  state.sessionUser = null;
  state.isAdmin = false;
  resetSync();
  clearTimeout(state.idleTimer);
  $("menu").hidden = true;
  $("modal").hidden = true;
  $("aclSheet").hidden = true;
  $("pwSheet").hidden = true;
  document.body.classList.add("locked");
  await signOut();
  showLock();
  if (reason) $("lockErr").textContent = reason;
}

// Reinicia o contador de inatividade a cada interação
function bumpIdle() {
  clearTimeout(state.idleTimer);
  if (state.sessionUser) {
    state.idleTimer = setTimeout(() => lockApp("Bloqueado por inatividade"), IDLE_LIMIT_MS);
  }
}

async function onLoginSubmit(e) {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase();
  const pw = $("pw").value;
  $("lockErr").textContent = "";
  const wait = state.lockedUntil - Date.now();
  if (wait > 0) {
    $("lockErr").textContent = `Muitas tentativas. Aguarde ${Math.ceil(wait / 1000)} s.`;
    return;
  }
  $("lockBtn").disabled = true;
  try {
    const user = await signIn(email, pw);
    await startSession(user);
    state.fails = 0;
  } catch (err) {
    const msg = (err && err.message) || "";
    if (msg === "sem-acesso") {
      await signOut();
      $("lockErr").textContent = "Este e-mail ainda não tem acesso. Peça ao administrador para liberar.";
    } else {
      state.fails++;
      if (state.fails >= LOCK_AFTER_FAILS) {
        state.lockedUntil = Date.now() + LOCK_WAIT_MS;
        state.fails = 0;
        $("lockErr").textContent = "Muitas tentativas. Aguarde 30 s.";
      } else {
        $("lockErr").textContent = "E-mail ou senha incorretos.";
      }
    }
  } finally {
    $("lockBtn").disabled = false;
    $("pw").value = "";
  }
}

// Verifica se já existe uma sessão salva e entra direto, ou mostra a tela de login
export async function startup() {
  const session = await getSession();
  if (session) {
    $("lock").hidden = false;
    $("lockForm").hidden = true;
    $("lockSkel").hidden = false;
    try {
      await startSession(session.user);
      return;
    } catch (err) {
      const semAcesso = err && err.message === "sem-acesso";
      if (semAcesso) await signOut();
      showLock();
      $("lockErr").textContent = semAcesso
        ? "Este e-mail ainda não tem acesso. Peça ao administrador para liberar."
        : "Não foi possível conectar à nuvem. Tente entrar de novo.";
      return;
    }
  }
  showLock();
}

export function wireSession() {
  $("lockForm").onsubmit = onLoginSubmit;
  $("lockNow").onclick = () => lockApp();
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) => {
    document.addEventListener(ev, bumpIdle, { passive: true });
  });
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (state.sessionUser && hiddenAt && Date.now() - hiddenAt > IDLE_LIMIT_MS) {
      lockApp("Sessão encerrada após 30 minutos fora do app");
    }
  });
}
