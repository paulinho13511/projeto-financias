// Exportação do mês: CSV para planilhas e extrato para impressão (PDF pelo navegador).
import { $ } from "../ui/dom.js";
import { state } from "../state/store.js";
import { BRL, esc } from "../core/format.js";
import { brDate, monthLabel } from "../core/dates.js";
import { totals } from "../core/ledger.js";
import { linhasExtrato, csvExtrato } from "../core/export.js";

export function wireExport() {
  $("csvBtn").onclick = () => {
    const { db, sel } = state;
    const blob = new Blob(["﻿" + csvExtrato(linhasExtrato(db, sel))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `financas-${sel}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  };

  $("pdfBtn").onclick = () => {
    const { db, sel } = state;
    const t = totals(db, sel);
    const body = linhasExtrato(db, sel).map((r) => `<tr><td>${brDate(r.date)}</td><td>${esc(r.desc)}</td><td>${esc(r.cat)}</td><td>${r.type === "income" ? "Receita" : "Despesa"}</td><td class="n">${BRL.format(r.amount)}</td></tr>`).join("");
    $("printArea").innerHTML = `<h2>Extrato de ${esc(monthLabel(sel))}</h2>
    <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th class="n">Valor</th></tr></thead>
    <tbody>${body || '<tr><td colspan="5">Sem lançamentos</td></tr>'}</tbody></table>
    <p style="margin-top:14px"><b>Receitas:</b> ${BRL.format(t.inc)} · <b>Despesas:</b> ${BRL.format(t.exp)} · <b>Saldo:</b> ${BRL.format(t.bal)}</p>`;
    window.print();
  };
}
