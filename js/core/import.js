// Leitura de extratos (OFX ou CSV) para revisão antes de importar. Funções puras.

// Lançamentos de um arquivo OFX (bloco STMTTRN por transação)
export function parseOFX(text) {
  const out = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  blocks.forEach((b) => {
    const g = (tag) => {
      const m = b.match(new RegExp("<" + tag + ">([^<\\r\\n]*)", "i"));
      return m ? m[1].trim() : "";
    };
    const d = g("DTPOSTED"), amt = parseFloat(g("TRNAMT").replace(",", "."));
    const desc = (g("MEMO") || g("NAME") || "Transação").replace(/\s+/g, " ");
    if (!/^\d{8}/.test(d) || isNaN(amt)) return;
    out.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      desc,
      amount: Math.abs(amt),
      type: amt < 0 ? "expense" : "income",
    });
  });
  return out;
}

// Data em DD/MM/AAAA ou AAAA-MM-DD; null se não reconhecer
export function parseDateBR(s) {
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Valor em formato brasileiro (1.234,56) ou decimal com ponto
export function parseMoneyBR(s) {
  let v = s.replace(/[R$\s]/g, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  return parseFloat(v);
}

// Lançamentos de um CSV com cabeçalho de data, descrição e valor. null se faltar data ou valor.
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const cells = (l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const iD = head.findIndex((h) => /data|date/.test(h));
  const iDesc = head.findIndex((h) => /descri|hist|memo|nome|name/.test(h));
  const iV = head.findIndex((h) => /valor|amount|value/.test(h));
  if (iD < 0 || iV < 0) return null;
  return lines.slice(1).map((l) => {
    const c = cells(l);
    const date = parseDateBR(c[iD] || ""), amt = parseMoneyBR(c[iV] || "");
    return date && !isNaN(amt)
      ? { date, desc: c[iDesc] || "Transação", amount: Math.abs(amt), type: amt < 0 ? "expense" : "income" }
      : null;
  }).filter(Boolean);
}

// Detecta o formato pelo conteúdo: OFX se tiver STMTTRN, senão CSV
export function parseExtrato(text) {
  return /<STMTTRN>/i.test(text) ? parseOFX(text) : parseCSV(text);
}
