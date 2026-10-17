// Importação de extrato (OFX ou CSV): revisão dos lançamentos antes de salvar. Ignora duplicados.
import { $, showToast } from "../ui/dom.js";
import { state, save } from "../state/store.js";
import { money, esc, uid } from "../core/format.js";
import { brDate } from "../core/dates.js";
import { parseExtrato } from "../core/import.js";
import { renderAll } from "../render.js";

let impRows = [];

function renderImport() {
  const box = $("impBox");
  box.hidden = false;
  box.innerHTML = `<p class="muted" style="font-size:13px;margin:12px 0 8px">${impRows.length} lançamentos encontrados. Desmarque o que não quer importar.</p>
    <div class="list">${impRows.map((r, i) => `<label class="row imp"><input type="checkbox" data-i="${i}" ${r.on ? "checked" : ""}><div class="rmain"><div class="t">${esc(r.desc)}</div><div class="s">${brDate(r.date)} · ${r.type === "income" ? "Receita" : "Despesa"}</div></div><div class="amt ${r.type === "income" ? "income" : "expense"}">${money(r.amount)}</div></label>`).join("")}</div>
    <div class="btnrow" style="margin-top:12px"><button class="ghost" id="impCancel" type="button">Cancelar</button><button class="primary" id="impOk" type="button">Importar selecionados</button></div>`;
  box.querySelectorAll("[data-i]").forEach((c) => { c.onchange = () => { impRows[+c.dataset.i].on = c.checked; }; });
  $("impCancel").onclick = () => {
    box.hidden = true;
    impRows = [];
    $("impFile").value = "";
  };
  $("impOk").onclick = () => {
    const { db } = state;
    let added = 0, skipped = 0;
    impRows.filter((r) => r.on).forEach((r) => {
      const dup = db.tx.some((t) => t.date === r.date && Math.abs(t.amount - r.amount) < 0.005 && t.desc === r.desc);
      if (dup) {
        skipped++;
        return;
      }
      db.tx.push({ id: uid(), type: r.type, desc: r.desc, amount: r.amount, date: r.date, category: "Outros", card: null, created: Date.now() });
      added++;
    });
    save();
    box.hidden = true;
    impRows = [];
    $("impFile").value = "";
    renderAll();
    showToast(`${added} importados${skipped ? `, ${skipped} já existiam` : ""}`);
  };
}

export function wireImport() {
  $("impFile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    const rows = parseExtrato(text);
    if (!rows || !rows.length) {
      showToast("Não encontrei lançamentos neste arquivo");
      $("impBox").hidden = true;
      impRows = [];
      return;
    }
    impRows = rows.map((r) => ({ ...r, on: true }));
    renderImport();
  };
}
