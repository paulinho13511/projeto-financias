const CATS=["Alimentação","Moradia","Transporte","Lazer","Saúde","Contas","Educação","Outros"];
const ICATS=["Salário","Freelance","Investimentos"];
const KEY="financas_v2";
const TITLES={inicio:"Início",subs:"Assinaturas",lanc:"Lançamentos",contas:"Contas",cal:"Calendário",rev:"Categorias",metas:"Metas",carteira:"Carteira"};
const BRL=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const mKey=s=>s.slice(0,7);
const parts=s=>s.split("-").map(Number);
let privacy=false;
const r2=v=>Math.round((Number(v)||0)*100)/100+0;   // centavos exatos; o "+0" troca -0 por 0
const money=v=>privacy?"R$ ****":BRL.format(r2(v));
// Campos de valor em reais: aceitam 1.626,76 · 1626,76 · R$ 1.626,76 · 1626.76. Devolve NaN se não der para entender com segurança.
function parseValor(s,neg){
  let v=String(s==null?"":s).replace(/R\$|\s/g,"");
  if(!v)return NaN;
  const n=v.startsWith("-");
  if(n){if(!neg)return NaN;v=v.slice(1)}
  if(v.includes(",")){
    if(!/^\d{1,3}(\.\d{3})+,\d{1,2}$|^\d+,\d{1,2}$/.test(v))return NaN;   // ponto só como milhar, vírgula como decimal
    v=v.replace(/\./g,"").replace(",",".");
  }else if(/^\d{1,3}(\.\d{3})+$/.test(v)){v=v.replace(/\./g,"")}            // 1.626 = mil seiscentos e vinte e seis
  else if(!/^\d+(\.\d{1,2})?$/.test(v))return NaN;                          // 1626 ou 1626.76
  const x=parseFloat(v);
  return Number.isFinite(x)?(n?-x:x):NaN;
}
const fmtValor=v=>(+v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const MSG_VALOR="Digite um valor válido, por exemplo 1.626,76";
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const dim=ym=>{const[y,m]=parts(ym);return new Date(y,m,0).getDate()};
const dueOf=(b,ym)=>{
  if(b.kind==="unica")return b.date;
  const[y,m]=parts(ym);return ymd(new Date(y,m-1,Math.min(b.day,dim(ym))));
};
const monthDiff=(a,b)=>{const[ay,am]=parts(a),[by,bm]=parts(b);return (by-ay)*12+(bm-am)};
// Parcelamento em centavos exatos: a última parcela (b.last) absorve a diferença do arredondamento
function splitParcel(total,n){
  const p=Math.round(total/n*100)/100;
  return{p,last:Math.round((total-p*(n-1))*100)/100};
}
const parcelAmt=(b,i)=>b.last!=null&&i===b.parcels-1?b.last:b.amount;
const billTotal=b=>b.kind==="parcelada"?Math.round((b.amount*(b.parcels-1)+(b.last!=null?b.last:b.amount))*100)/100:b.amount;
// Ocorrências de contas num mês: mensal (sempre), parcelada (1/12, 2/12...) ou única (uma vez)
function occ(ym){
  const out=[];
  db.bills.forEach(b=>{
    const kind=b.kind||"mensal";
    if(kind==="unica"){if(mKey(b.date)===ym)out.push({b,amount:b.amount,label:"Única"});return}
    if(kind==="parcelada"){
      const i=monthDiff(b.start,ym);
      if(i>=0&&i<b.parcels)out.push({b,amount:parcelAmt(b,i),label:`${i+1}/${b.parcels}`});
      return;
    }
    if((!b.start||ym>=b.start)&&(!b.end||ym<=b.end)){
      out.push({b,amount:b.amount,label:b.end?`Até ${b.end.slice(5,7)}/${b.end.slice(0,4)}`:"Mensal"});
    }
  });
  return out;
}
// Parcelas que ainda faltam depois do mês informado
function remainingAfter(b,ym){
  if(b.kind!=="parcelada")return 0;
  const i=monthDiff(b.start,ym);
  if(i<0)return b.parcels;
  return Math.max(0,b.parcels-(i+1));
}
// Valor que ainda falta pagar depois do mês informado (as parcelas restantes sempre incluem a última)
function remainingValue(b,ym){
  const k=remainingAfter(b,ym);
  if(!k)return 0;
  return b.last!=null?Math.round((b.amount*(k-1)+b.last)*100)/100:Math.round(k*b.amount*100)/100;
}
const daysBetween=(a,b)=>{const[ay,am,ad]=parts(a),[by,bm,bd]=parts(b);return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/864e5)};
const monthLabel=ym=>{const[y,m]=parts(ym);return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})};
const shiftMonth=(ym,delta)=>{const[y,m]=parts(ym);return ymd(new Date(y,m-1+delta,1)).slice(0,7)};
const fmtDate=(s,long)=>{const[y,m,d]=parts(s);return new Date(y,m-1,d).toLocaleDateString("pt-BR",long?{weekday:"long",day:"numeric",month:"long"}:{day:"2-digit",month:"2-digit"})};

/* ---------- nuvem: API própria (funções da Vercel + Neon); cliente em js/api.js ---------- */
let db=null;           // dados do app, carregados da nuvem depois do login
let sessionUser=null;  // usuário logado (null = bloqueado)
let isAdmin=false;

/* gravação em fila: uma escrita de cada vez, sempre com o estado mais recente.
   Controle de concorrência: a escrita só vale se o registro não mudou desde a última leitura
   (updated_at é a versão). Se outro aparelho gravou antes, nada é sobrescrito. */
let writeChain=Promise.resolve();
let lastSaveErr=0;
let dbUpdatedAt=null;     // updated_at do registro na última leitura/gravação bem-sucedida
let dbConflict=false;     // true = dados mudaram em outro lugar; gravações bloqueadas até recarregar
function save(){
  if(!db||!sessionUser)return;
  if(dbConflict){showToast("Dados alterados em outro aparelho. Recarregue a página antes de continuar.");return}
  const snapshot=JSON.parse(JSON.stringify(db));
  writeChain=writeChain
    .then(async()=>{
      const expected=dbUpdatedAt;   // lido aqui, dentro da fila, para refletir a gravação anterior
      const r=await API.put("/api/dados",{data:snapshot,versao:expected});
      dbUpdatedAt=r.versao;
      filaConfirmar(snapshot);   // o que estava esperando no aparelho já está na nuvem
    })
    .catch(err=>{
      if(err&&err.status===409)dbConflict=true;
      if(err&&err.status===401){lockApp("Sessão expirada. Entre de novo.");return}
      const now=Date.now();
      if(now-lastSaveErr>4000){
        lastSaveErr=now;
        showToast(dbConflict
          ? "Dados alterados em outro aparelho. Recarregue a página; a última alteração não foi salva."
          : (err&&err.rede)||!navigator.onLine
            ? "Sem internet: ficou guardado neste aparelho e será enviado quando a conexão voltar."
            : "Não foi possível salvar na nuvem. Verifique a conexão.");
      }
    });
}
// Carrega quem está logado e os dados dele (a primeira entrada cria um registro vazio no servidor).
async function fetchSession(){
  const me=await API.get("/api/me");
  const rec=await API.get("/api/dados");
  dbUpdatedAt=rec.versao;dbConflict=false;
  const d=rec.data||{};
  d.tx=d.tx||[];d.bills=d.bills||[];d.budgets=d.budgets||{};d.cards=d.cards||[];d.goals=d.goals||[];d.settings=d.settings||{};d.accounts=d.accounts||[];
  return {me,data:d};
}

/* ---------- tela de entrada (somente login: contas são criadas pelo administrador) ---------- */
let lockedUntil=0;
function showLock(){
  $("lock").hidden=false;
  $("lockForm").hidden=false;$("lockSkel").hidden=true;
  $("pw").value="";
  $("lockErr").textContent="";
}
async function startSession(){
  const {me,data}=await fetchSession();
  db=data;sessionUser={email:me.email};isAdmin=!!me.is_admin;
  const recuperados=filaMesclar();
  try{localStorage.setItem("mf_sessao","1")}catch(_){}   // só uma dica para mostrar o esqueleto ao reabrir; a sessão de verdade é o cookie
  enterApp();
  if(recuperados){save();showToast(`${recuperados} lançamento(s) feito(s) sem internet foram enviados`)}
}
function enterApp(){
  $("lock").hidden=true;
  document.body.classList.remove("locked");
  $("accessBtn").hidden=!isAdmin;
  sel=mKey(today());
  renderAll();
  go("inicio");
  bumpIdle();
}
async function lockApp(reason){
  db=null;sessionUser=null;isAdmin=false;dbUpdatedAt=null;dbConflict=false;clearTimeout(idleTimer);
  $("menu").hidden=true;$("modal").hidden=true;$("aclSheet").hidden=true;$("pwSheet").hidden=true;
  $("payModal").hidden=true;$("editSheet").hidden=true;$("rlSheet").hidden=true;$("eiSheet").hidden=true;   // nada de diálogo aberto por cima da tela de entrada
  $("payYes").onclick=null;$("payNo").onclick=null;$("mYes").onclick=null;$("mNo").onclick=null;
  document.body.classList.add("locked");
  try{localStorage.removeItem("mf_sessao")}catch(_){}
  try{await API.post("/api/logout")}catch(e){}
  showLock();
  if(reason)$("lockErr").textContent=reason;
}
$("lockForm").onsubmit=async e=>{
  e.preventDefault();
  const email=$("email").value.trim().toLowerCase();
  const pw=$("pw").value;
  $("lockErr").textContent="";
  const wait=lockedUntil-Date.now();
  if(wait>0){$("lockErr").textContent=`Muitas tentativas. Aguarde ${Math.ceil(wait/1000)} s.`;return}
  $("lockBtn").disabled=true;
  let entrou=false;   // true = e-mail e senha foram aceitos pelo servidor
  try{
    await API.post("/api/login",{email,senha:pw});
    entrou=true;
    await startSession();
  }catch(err){
    if(err&&err.status===403){
      $("lockErr").textContent="Este e-mail ainda não tem acesso. Peça ao administrador para liberar.";
    }
    else if(err&&err.status===401&&!entrou){
      $("lockErr").textContent="E-mail ou senha incorretos.";   // o servidor conta as tentativas e bloqueia
    }
    else if(err&&err.status===429){
      lockedUntil=Date.now()+30000;
      $("lockErr").textContent="Muitas tentativas. Aguarde alguns minutos.";
    }
    else{
      // falha de rede ou da nuvem: não é culpa da senha e não deixa sessão pela metade
      if(entrou){try{await API.post("/api/logout")}catch(_){}}
      $("lockErr").textContent="Não foi possível conectar à nuvem. Tente entrar de novo.";
    }
  }finally{
    $("lockBtn").disabled=false;
    $("pw").value="";
  }
};
$("lockNow").onclick=()=>lockApp();

/* ---------- acesso de usuários (somente administrador) ---------- */
function openAcl(){
  $("menu").hidden=true;
  $("aclSheet").hidden=false;
  loadAcl();
}
async function loadAcl(){
  const list=$("aclList");
  list.innerHTML=`<div class="empty">Carregando…</div>`;
  let data;
  try{data=(await API.get("/api/acessos")).lista}
  catch(err){list.innerHTML=`<div class="empty">Não foi possível carregar a lista.</div>`;return}
  list.innerHTML=data.length?data.map(r=>`
    <div class="row"><div class="rmain"><div class="t">${esc(r.email)}</div>
    <div class="s">${r.is_admin?"Administrador":"Usuário"}</div></div>
    ${r.email===sessionUser.email.toLowerCase()?"":`<button class="ghost" data-adm="${esc(r.email)}" data-val="${r.is_admin?"0":"1"}">${r.is_admin?"Tirar admin":"Dar admin"}</button>`}
    ${r.is_admin?"":`<button class="ico" title="Remover acesso" data-rm="${esc(r.email)}">×</button>`}</div>`).join("")
    :`<div class="empty">Nenhum outro e-mail liberado</div>`;
  list.querySelectorAll("[data-rm]").forEach(b=>b.onclick=async()=>{
    const em=b.dataset.rm;
    if(!(await ask(`Remover o acesso de ${em}? A conta de login dela será apagada.`)))return;
    const guardar=await ask("Guardar um backup dos dados dessa pessoa antes de apagar?");
    try{
      await API.del("/api/acessos",{email:em,guardar_backup:guardar});
      showToast(guardar?"Acesso removido. Backup guardado.":"Acesso removido");
    }catch(err){showToast(err.message||"Não foi possível remover o acesso");return}
    loadAcl();
  });
  list.querySelectorAll("[data-adm]").forEach(b=>b.onclick=async()=>{
    const em=b.dataset.adm, val=b.dataset.val==="1";
    try{await API.patch("/api/acessos",{email:em,is_admin:val})}
    catch(err){showToast("Não foi possível alterar a permissão");return}
    showToast(val?"Agora pode adicionar pessoas":"Permissão de administrador removida");
    loadAcl();
  });
}
$("accessBtn").onclick=openAcl;
$("aclClose").onclick=()=>{$("aclSheet").hidden=true};
$("aclForm").onsubmit=async e=>{
  e.preventDefault();
  const email=$("aclEmail").value.trim().toLowerCase();
  const password=$("aclPw").value;
  if(password.length<10){showToast("A senha precisa ter pelo menos 10 caracteres");return}
  try{
    await API.post("/api/acessos",{email,senha:password});
    $("aclEmail").value="";$("aclPw").value="";
    showToast("Acesso criado. Envie o e-mail e a senha para a pessoa.");
    loadAcl();
  }catch(err){showToast(err.message||"Não foi possível criar o acesso")}
};

/* ---------- troca de senha pelo próprio usuário ---------- */
$("pwBtn").onclick=()=>{
  $("menu").hidden=true;
  $("curPw").value="";$("newPw").value="";$("newPw2").value="";
  $("pwSheet").hidden=false;
};
$("pwClose").onclick=()=>{$("pwSheet").hidden=true};
$("pwForm").onsubmit=async e=>{
  e.preventDefault();
  const cur=$("curPw").value,a=$("newPw").value,b=$("newPw2").value;
  if(!cur){showToast("Digite a senha atual");return}
  if(a.length<10){showToast("A senha precisa ter pelo menos 10 caracteres");return}
  if(a!==b){showToast("As senhas não conferem");return}
  try{await API.post("/api/senha",{atual:cur,nova:a})}
  catch(err){
    if(err&&err.status===401){lockApp("Sessão expirada. Entre de novo.");return}
    showToast(err&&(err.status===403||err.status===429)?err.message:"Não foi possível trocar a senha");return
  }
  $("curPw").value="";
  $("pwSheet").hidden=true;
  showToast("Senha trocada com sucesso");
};

/* ---------- bloqueio automático ---------- */
let idleTimer=null;
function bumpIdle(){
  clearTimeout(idleTimer);
  if(sessionUser)idleTimer=setTimeout(()=>lockApp("Bloqueado por inatividade"),30*60*1000);
}
["pointerdown","keydown","touchstart","scroll"].forEach(ev=>document.addEventListener(ev,bumpIdle,{passive:true}));
let hiddenAt=0;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){hiddenAt=Date.now()}
  else if(sessionUser&&hiddenAt&&Date.now()-hiddenAt>60*1000){lockApp("Bloqueado ao sair da página")}
});

let sel=mKey(today());

const txOf=ym=>db.tx.filter(t=>mKey(t.date)===ym);
const sortedTx=()=>db.tx.filter(t=>t.type!=="payment").sort((a,b)=>b.date.localeCompare(a.date)||(b.created||0)-(a.created||0));
function totals(ym){
  const items=txOf(ym);
  const bills=occ(ym);
  const inc=items.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const exp=items.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)+bills.reduce((s,o)=>s+o.amount,0);
  return{inc:r2(inc),exp:r2(exp),bal:r2(inc-exp),items,bills};   // somas em centavos: 0,30 − 0,10 − 0,20 dá 0, não −0,00
}
/* ---------- carteira: contas (corrente, poupança, dinheiro) e saldo de cada uma ----------
   Saldo = saldo inicial + receitas − despesas dos lançamentos ligados à conta (em centavos, sem erro de arredondamento).
   Lançamentos sem conta e compras no cartão (pagas pela fatura) não entram no saldo. */
const ACC_TYPES={corrente:"Conta corrente",poupanca:"Poupança",carteira:"Carteira"};
const toCents=v=>Math.round((Number(v)||0)*100);
function accBalance(a){
  let c=toCents(a.initial);
  accMoves(a).forEach(m=>{c+=m.delta});
  return c/100;
}
// Movimentos de uma conta, em centavos (positivo entra, negativo sai): lançamentos, transferências e pagamentos.
function accMoves(a){
  const out=[];
  db.tx.forEach(t=>{
    const v=toCents(t.amount);
    if(t.type==="transfer"){
      if(t.from===a.id)out.push({t,delta:-v});
      if(t.to===a.id)out.push({t,delta:v});
      return;
    }
    if(t.account!==a.id||(t.card&&t.type!=="income"))return;   // compra no cartão sai pela fatura; receita nunca é "no cartão"
    out.push({t,delta:t.type==="income"?v:-v});
  });
  return out;
}
const accTotal=()=>(db.accounts||[]).reduce((s,a)=>s+toCents(accBalance(a)),0)/100;
const accName=id=>{const a=(db.accounts||[]).find(x=>x.id===id);return a?a.name:""};
function billStatus(b,ym){
  const paid=(b.paid||[]).includes(ym);
  const due=dueOf(b,ym);
  const d=daysBetween(today(),due);
  if(paid)return{key:"paid",label:"Paga",cls:"ok",due,d};
  // conta no cartão não vence sozinha: ela é paga junto com a fatura
  if(b.card&&(db.cards||[]).some(c=>c.id===b.card))return{key:"card",label:"Na fatura",cls:"",due,d};
  if(d<0)return{key:"late",label:"Atrasada",cls:"late",due,d};
  if(d===0)return{key:"today",label:"Vence hoje",cls:"late",due,d};
  if(d<=3)return{key:"soon",label:"Vence em "+d+"d",cls:"soon",due,d};
  return{key:"open",label:"Em aberto",cls:"",due,d};
}
function closeDateOf(card,ym){const[y,m]=parts(ym);return ymd(new Date(y,m-1,Math.min(card.closeDay,dim(ym))))}
function dueDateOfFatura(card,closeYm){
  const dueYm=card.dueDay>card.closeDay?closeYm:shiftMonth(closeYm,1);
  const[y,m]=parts(dueYm);
  return ymd(new Date(y,m-1,Math.min(card.dueDay,dim(dueYm))));
}
// Fatura que fecha no mês closeYm: compras com data entre o fechamento anterior e este
function faturaOf(card,closeYm){
  const close=closeDateOf(card,closeYm);
  const prevClose=closeDateOf(card,shiftMonth(closeYm,-1));
  const items=[];
  [shiftMonth(closeYm,-1),closeYm].forEach(ym=>{
    txOf(ym).filter(t=>t.type==="expense"&&t.card===card.id).forEach(t=>{
      if(t.date>prevClose&&t.date<=close)items.push({desc:t.desc,amount:t.amount,date:t.date});
    });
    occ(ym).filter(o=>o.b.card===card.id).forEach(o=>{
      const d=dueOf(o.b,ym);
      if(d>prevClose&&d<=close)items.push({desc:`${o.b.name} (${o.label})`,amount:o.amount,date:d,bill:o.b.id,billYm:ym});
    });
  });
  return{close,closeYm,due:dueDateOfFatura(card,closeYm),total:r2(items.reduce((s,i)=>s+i.amount,0)),items};
}
// Fatura aberta hoje: a que fecha no próximo fechamento (inclusive hoje)
function currentCloseYm(card){
  const cm=mKey(today());
  return closeDateOf(card,cm)>=today()?cm:shiftMonth(cm,1);
}
function cardAlerts(){
  const out=[];
  (db.cards||[]).forEach(c=>{
    const cy=currentCloseYm(c);
    const openF=faturaOf(c,cy);
    const dClose=daysBetween(today(),openF.close);
    if(dClose===0)out.push({title:`${c.name}: fatura fecha hoje`,body:`Valor até agora: ${money(openF.total)}`,level:"info"});
    else if(dClose>0&&dClose<=3)out.push({title:`${c.name}: fatura fecha em ${dClose} dia(s)`,body:`Valor até agora: ${money(openF.total)}`,level:"info"});
    [shiftMonth(cy,-1),cy].forEach(ym=>{
      const dev=devidoFatura(c,ym);
      if(dev<=0)return;
      const f=faturaOf(c,ym);
      const d=daysBetween(today(),f.due);
      const base={cardId:c.id,closeYm:ym,paidable:true};
      if(d<0)out.push({...base,title:`${c.name}: fatura vencida`,body:`${money(dev)} venceu em ${fmtDate(f.due)}. Pague logo para evitar juros e multa.`,level:"late"});
      else if(d===0)out.push({...base,title:`${c.name}: fatura vence hoje`,body:`${money(dev)}. Pague hoje para evitar juros.`,level:"late"});
      else if(d<=3)out.push({...base,title:`${c.name}: fatura vence em ${d} dia(s)`,body:`${money(dev)} até ${fmtDate(f.due)}`,level:"soon"});
    });
  });
  return out;
}
/* Fatura: quanto falta pagar = total das compras − pagamentos registrados para ela.
   Assim, uma compra lançada depois do pagamento aparece como "falta pagar", em vez de sumir.
   Fatura marcada como paga no jeito antigo (sem pagamento registrado) continua valendo como paga. */
function pagoFatura(c,ym){
  return r2(db.tx.filter(t=>t.type==="payment"&&t.ref&&t.ref.kind==="fatura"&&t.ref.card===c.id&&t.ref.ym===ym).reduce((s,t)=>s+t.amount,0));
}
function devidoFatura(c,ym){
  const pago=pagoFatura(c,ym);
  if(!pago&&(c.paid||[]).includes(ym))return 0;
  return Math.max(0,r2(faturaOf(c,ym).total-pago));
}
/* Ao pagar, o usuário escolhe de qual conta o dinheiro sai. O pagamento vira um movimento da conta
   (tipo "payment"), que não conta como despesa de novo: a despesa já está no mês. Sem contas cadastradas, nada pergunta. */
let lastPayAcc="";
function askPayAccount(msg,obrigatoria){
  const accs=db.accounts||[];
  if(!accs.length)return Promise.resolve("");
  return new Promise(resolve=>{
    $("payMsg").textContent=msg;
    $("payAcc").innerHTML=(obrigatoria?"":`<option value="">Não descontar de nenhuma conta</option>`)+accs.map(a=>`<option value="${esc(a.id)}">${esc(a.name)} · ${money(accBalance(a))}</option>`).join("");
    $("payAcc").value=accs.some(a=>a.id===lastPayAcc)?lastPayAcc:accs[0].id;
    $("payModal").hidden=false;
    const done=v=>{$("payModal").hidden=true;$("payYes").onclick=null;$("payNo").onclick=null;resolve(v)};
    $("payYes").onclick=()=>{lastPayAcc=$("payAcc").value||lastPayAcc;done($("payAcc").value)};
    $("payNo").onclick=()=>done(null);
  });
}
const dropPayment=(kind,match)=>{db.tx=db.tx.filter(t=>!(t.type==="payment"&&t.ref&&t.ref.kind===kind&&Object.keys(match).every(k=>t.ref[k]===match[k])))};
async function markFaturaPaid(cardId,closeYm){
  const c=(db.cards||[]).find(x=>x.id===cardId);if(!c)return;
  const valor=devidoFatura(c,closeYm);
  if(!(valor>0)){showToast("Esta fatura já está paga");return}
  const fat=faturaOf(c,closeYm);
  const aberta=closeYm===currentCloseYm(c);
  const acc=await askPayAccount(`${aberta?"Pagar adiantado":"Pagar"} a fatura ${c.name}: ${money(valor)}. De qual conta sai o dinheiro?`,true);
  if(acc===null)return;
  c.paid=c.paid||[];
  if(!c.paid.includes(closeYm))c.paid.push(closeYm);
  // as contas que estavam nesta fatura (assinaturas, parcelas) ficam pagas junto com ela
  fat.items.filter(i=>i.bill).forEach(i=>{
    const b=db.bills.find(x=>x.id===i.bill);
    if(b){b.paid=b.paid||[];if(!b.paid.includes(i.billYm))b.paid.push(i.billYm)}
  });
  if(acc)db.tx.push({id:uid(),type:"payment",desc:`Fatura ${c.name}`,amount:valor,date:today(),category:"Cartão",account:acc,ref:{kind:"fatura",card:cardId,ym:closeYm},created:Date.now()});
  save();renderAll();showToast(`Fatura ${c.name} paga: ${money(valor)}`);
}
async function delCard(id){
  if(!(await ask("Excluir este cartão? As compras já lançadas continuam no histórico.")))return;
  db.cards=(db.cards||[]).filter(c=>c.id!==id);save();renderAll();
}
window.markFaturaPaid=markFaturaPaid;window.delCard=delCard;

/* ícone de cada categoria (desenho de linha, na cor do texto); categoria desconhecida mostra a inicial */
const CAT_SVG={
  "Alimentação":'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.5h11.2l2.2-8.5H6.3"/>',
  "Moradia":'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  "Transporte":'<path d="M5 15l1.6-5a2 2 0 0 1 1.9-1.4h7a2 2 0 0 1 1.9 1.4L19 15"/><rect x="3" y="15" width="18" height="4.5" rx="1.6"/><path d="M6.5 19.5V21M17.5 19.5V21"/>',
  "Lazer":'<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6v12M16 6v12M3 12h5M16 12h5"/>',
  "Saúde":'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  "Contas":'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  "Educação":'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  "Outros":'<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  "Salário":'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  "Freelance":'<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5h6v2"/>',
  "Investimentos":'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'
};
const catIcon=c=>CAT_SVG[c]?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAT_SVG[c]}</svg>`:esc(String(c||"?").charAt(0));
function txRow(t){
  if(t.type==="transfer"){
    const de=accName(t.from)||"Conta removida", para=accName(t.to)||"Conta removida";
    return `<div class="row"><div class="ic xfer">⇄</div><div class="rmain"><div class="t">${esc(t.desc)}</div><div class="s">${esc(de)} → ${esc(para)} · ${fmtDate(t.date)}</div></div><div class="actions"><span class="amt neutral">${money(t.amount)}</span><button class="ico" title="Remover" data-act="delTx" data-id="${esc(t.id)}">×</button></div></div>`;
  }
  const inc=t.type==="income";
  return `<div class="row"><div class="ic ${inc?"in":"out"}" title="${esc(t.category)}">${catIcon(t.category)}</div><div class="rmain"><div class="t">${esc(t.desc)}</div><div class="s">${esc(t.category)} · ${fmtDate(t.date)}${t.account&&accName(t.account)?" · "+esc(accName(t.account)):""}${t.card&&cardName(t.card)?" · cartão "+esc(cardName(t.card)):""}</div></div><div class="actions"><span class="amt ${inc?"income":"expense"}">${inc?"+":"−"} ${money(t.amount)}</span><button class="ico" title="Remover" data-act="delTx" data-id="${esc(t.id)}">×</button></div></div>`;
}

/* ---------- confirmação própria (o visualizador bloqueia a caixa padrão) ---------- */
function ask(msg,yes,no){
  return new Promise(resolve=>{
    $("modalMsg").textContent=msg;
    $("mYes").textContent=yes||"Confirmar";$("mNo").textContent=no||"Cancelar";
    $("modal").hidden=false;
    const done=v=>{$("modal").hidden=true;$("mYes").onclick=null;$("mNo").onclick=null;resolve(v)};
    $("mYes").onclick=()=>done(true);
    $("mNo").onclick=()=>done(false);
  });
}

/* ---------- animações ---------- */
const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut=p=>1-Math.pow(1-p,3);
function countUp(el,to,duration){
  const from=parseFloat(el.dataset.value)||0;
  el.dataset.value=to;
  if(reduceMotion||from===to){el.textContent=money(to);return}
  const start=performance.now();
  const step=now=>{
    const p=Math.min((now-start)/(duration||600),1);
    el.textContent=money(from+(to-from)*easeOut(p));
    if(p<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// As animações de entrada só tocam ao abrir uma tela ou trocar de mês; marcar uma conta como
// paga, por exemplo, atualiza as listas sem fazê-las "pular" de novo.
let animNow=false, replayAnim=false;
function animateBars(){
  if(reduceMotion||!animNow)return;
  document.querySelectorAll(".bar i,.hbar").forEach(bar=>{
    const h=bar.style.height, w=bar.style.width;
    bar.style.transition="none";
    if(h)bar.style.height="0%";
    if(w)bar.style.width="0%";
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      bar.style.transition="all .9s cubic-bezier(.22,1,.36,1)";
      if(h)bar.style.height=h;
      if(w)bar.style.width=w;
    }));
  });
}
function stagger(el,step){
  if(reduceMotion||!el)return;
  const kids=[...el.children];
  kids.forEach(child=>{child.style.animation="none"});
  void el.offsetWidth;   // reinicia a animação mesmo em itens que já tinham tocado
  kids.forEach((child,i)=>{
    child.style.animation="enter .42s cubic-bezier(.22,1,.36,1) "+(Math.min(i,12)*(step||45))+"ms both";
  });
}
let toastTimer;
function showToast(msg){
  const t=$("toast");
  t.textContent=msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
}

/* ---------- ações ---------- */
async function togglePaid(id,ym){
  const b=db.bills.find(x=>x.id===id);if(!b)return;
  b.paid=b.paid||[];
  const marcou=!b.paid.includes(ym);
  if(marcou){
    // conta no cartão é paga pela fatura: só marca, sem tirar dinheiro de conta
    if(!b.card){
      const o=occ(ym).find(x=>x.b.id===id);
      const amount=o?o.amount:b.amount;
      const acc=await askPayAccount(`Pagar ${b.name} (${money(amount)}). De qual conta sai o dinheiro?`);
      if(acc===null)return;
      if(acc)db.tx.push({id:uid(),type:"payment",desc:`Pagamento: ${b.name}`,amount,date:today(),category:b.category||"Contas",account:acc,ref:{kind:"bill",id,ym},created:Date.now()});
    }
    b.paid=[...b.paid,ym];
  }else{
    b.paid=b.paid.filter(x=>x!==ym);
    dropPayment("bill",{id,ym});   // desmarcar devolve o dinheiro à conta
  }
  save();renderAll();
  if(marcou)showToast("Conta marcada como paga");
}
// Conta fixa que já existia antes do mês aberto e ainda está ativa nele: dá para encerrar daqui para frente
const hasHistory=(b,ym)=>(b.kind||"mensal")==="mensal"&&!!b.start&&b.start<ym&&(!b.end||b.end>=ym);
async function delBill(id){
  const b=db.bills.find(x=>x.id===id);if(!b)return;
  if(hasHistory(b,sel)){
    // cancelar uma assinatura não pode apagar os meses em que ela existiu
    if(await ask(`Encerrar "${b.name}" a partir de ${monthLabel(sel)}? Os meses anteriores continuam no histórico.`,"Encerrar","Apagar tudo")){
      b.end=shiftMonth(sel,-1);
      save();renderAll();showToast("Conta encerrada; o histórico foi mantido");return;
    }
    if(!(await ask(`Apagar "${b.name}" de todos os meses, inclusive do histórico? Isso muda os totais dos meses passados.`,"Apagar tudo","Voltar")))return;
  }else if(!(await ask("Excluir esta conta? Todas as parcelas dela também serão removidas.")))return;
  db.bills=db.bills.filter(x=>x.id!==id);save();renderAll();
}
async function delTx(id){
  if(!(await ask("Remover este lançamento?")))return;
  db.tx=db.tx.filter(t=>t.id!==id);save();renderAll();
}
function setBudget(cat,val){
  const v=parseValor(val);
  if(String(val).trim()&&!(v>0)){showToast(MSG_VALOR);renderAll();return}   // texto inválido: não apaga o limite sem avisar
  if(!(v>0))delete db.budgets[cat];else db.budgets[cat]=v;
  save();renderAll();
}
window.togglePaid=togglePaid;window.delBill=delBill;window.delTx=delTx;window.setBudget=setBudget;

/* ---------- renderização ---------- */
function populateMonths(){
  const now=mKey(today());
  const set=new Set([now,shiftMonth(now,1),shiftMonth(now,2),sel]);
  db.tx.forEach(t=>set.add(mKey(t.date)));
  const list=[...set].sort().reverse();
  const curto=window.matchMedia("(max-width:480px)").matches;      // no celular o nome inteiro do mês não cabe no seletor
  const nome=k=>curto?(([y,m])=>new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"short",year:"numeric"}))(parts(k)):monthLabel(k);
  $("month").innerHTML=list.map(k=>`<option value="${esc(k)}" ${k===sel?"selected":""}>${nome(k)}</option>`).join("");
}

function renderInicio(){
  const t=totals(sel);
  countUp($("balance"),t.bal);
  $("balance").className="big "+(t.bal<0?"expense":"");
  countUp($("inc"),t.inc);
  countUp($("exp"),t.exp);

  const rem=openBills().filter(x=>x.st.d<=7);
  const cards=cardAlerts();
  const msgs=rem.filter(x=>x.st.d<=2).map(({b,st,amount})=>({
    title:st.d<0?"Conta atrasada":st.d===0?"Conta vence hoje":`Conta vence em ${st.d} dia(s)`,
    body:`${b.name}: ${money(amount)}`
  })).concat(cards.map(c=>({title:c.title,body:c.body})));
  const bySel={};
  t.items.filter(x=>x.type==="expense").forEach(x=>bySel[x.category]=(bySel[x.category]||0)+x.amount);
  t.bills.forEach(o=>bySel[o.b.category]=(bySel[o.b.category]||0)+o.amount);
  Object.entries(db.budgets).forEach(([c,lim])=>{
    if((bySel[c]||0)>=lim)msgs.push({title:"Limite atingido",body:`${c}: ${money(bySel[c]||0)} de ${money(lim)}`});
  });
  $("notifs").innerHTML=msgs.length?msgs.map(m=>`
    <div class="notif"><div class="app-n">TravaDin · agora</div>
    <div class="msg"><b>${esc(m.title)}</b><br>${esc(m.body)}</div></div>`).join(""):`<div class="empty">Nenhuma notificação pendente</div>`;

  $("recent").innerHTML=sortedTx().slice(0,5).map(txRow).join("")||`<div class="empty">Nenhum lançamento ainda</div>`;
}

let chartDay=null, chartSel=null;
function renderChart(){
  const n=dim(sel);
  const daily=new Array(n+1).fill(0);
  txOf(sel).filter(t=>t.type==="expense").forEach(t=>{daily[parseInt(t.date.slice(8,10),10)]+=t.amount});
  occ(sel).forEach(o=>{const d=parseInt(dueOf(o.b,sel).slice(8,10),10);if(d>=1&&d<=n)daily[d]+=o.amount});
  const cum=[];let acc=0;
  for(let d=1;d<=n;d++){acc+=daily[d];cum.push(acc)}
  if(chartSel!==sel){chartSel=sel;chartDay=null}
  const W=320,H=160,P=10;
  const max=Math.max(...cum,1);
  const xs=i=>P+(W-2*P)*(i/Math.max(n-1,1));
  const ys=v=>H-P-(H-2*P)*(v/max);
  let line="";
  cum.forEach((v,i)=>{line+=(i?"L":"M")+xs(i).toFixed(1)+" "+ys(v).toFixed(1)});
  const area=line+` L${xs(n-1).toFixed(1)} ${H-P} L${xs(0).toFixed(1)} ${H-P} Z`;
  const idx=chartDay!==null?chartDay:(sel===mKey(today())?Math.min(parseInt(today().slice(8,10),10)-1,n-1):n-1);
  const dot=`<line x1="${xs(idx).toFixed(1)}" y1="${P}" x2="${xs(idx).toFixed(1)}" y2="${H-P}" stroke="#ffffff40" stroke-dasharray="3 3"/><circle cx="${xs(idx).toFixed(1)}" cy="${ys(cum[idx]).toFixed(1)}" r="6" fill="#ffffff" stroke="#000" stroke-width="3"/>`;
  $("spendChart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos acumulados no mês">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4d" stop-opacity=".3"/><stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#gArea)"/>
    <path d="${line}" fill="none" stroke="#ff4d4d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dot}</svg>`;
  $("chartTotal").textContent=money(cum[idx]||0);
  $("chartLabel").textContent=`Gastos acumulados até o dia ${idx+1}`;
  const ticks=[1,Math.round(n/4),Math.round(n/2),Math.round(3*n/4),n];
  $("chartAxis").innerHTML=[...new Set(ticks)].map(d=>`<span>${d}</span>`).join("");

  // quanto sobra no mês e quanto por dia
  const t=totals(sel);
  const cur=mKey(today());
  let txt;
  if(sel<cur)txt="Mês encerrado";
  else{
    const days=sel===cur?n-parseInt(today().slice(8,10),10)+1:n;
    txt=t.bal>=0
      ?`Sobra ${money(t.bal)} · ${money(t.bal/days)} por dia até o fim do mês`
      :`Faltam ${money(-t.bal)} para fechar o mês`;
  }
  $("perDay").textContent=txt;
}
function chartPick(e){
  const r=$("spendChart").getBoundingClientRect();
  if(!r.width)return;
  const n=dim(sel);
  const f=Math.min(Math.max((e.clientX-r.left)/r.width,0),1);
  chartDay=Math.round(f*(Math.max(n-1,1)));
  renderChart();
}
let chartDrag=false;
$("spendChart").addEventListener("pointerdown",e=>{chartDrag=true;chartPick(e)});
window.addEventListener("pointermove",e=>{if(chartDrag)chartPick(e)});
window.addEventListener("pointerup",()=>{chartDrag=false});


// Contas em aberto: as atrasadas do mês anterior, as do mês atual e as do seguinte, da mais urgente
// para a mais distante (assim uma conta atrasada não some na virada do mês, nem o vencimento do dia 1 ou 2
// nos últimos dias do mês). Contas no cartão ficam de fora: elas são pagas junto com a fatura.
function openBills(){
  const cur=mKey(today());
  return [shiftMonth(cur,-1),cur,shiftMonth(cur,1)]
    .flatMap(ym=>occ(ym).map(o=>({...o,ym,st:billStatus(o.b,ym)})))
    .filter(x=>x.st.key!=="paid"&&x.st.key!=="card")
    .sort((a,b)=>a.st.d-b.st.d);
}


function renderContas(){
  $("billMonthLabel").textContent=monthLabel(sel);
  let total=0,paid=0;
  const rows=occ(sel).map(({b,amount,label})=>{
    const st=billStatus(b,sel);
    total+=amount;if(st.key==="paid")paid+=amount;
    const compra=b.kind==="parcelada"?` · compra de ${money(billTotal(b))}`:"";
    return `<div class="row">
      <div class="rmain"><div class="t">${esc(b.name)}<span class="tag">${label}</span><span class="tag ${st.cls}">${st.label}</span></div>
      <div class="s">${money(amount)} · vence ${fmtDate(st.due)}${compra} · ${esc(b.category)}</div></div>
      <div class="actions">
        <button class="ghost" data-act="togglePaid" data-id="${esc(b.id)}" data-ym="${sel}">${st.key==="paid"?"Desfazer":"Marcar paga"}</button>
        <button class="ico" title="Editar" data-edit="${esc(b.id)}" aria-label="Editar conta">✎</button>
        <button class="ico" title="Excluir" data-act="delBill" data-id="${esc(b.id)}">×</button>
      </div></div>`;
  }).join("");
  const debt=db.bills.reduce((s,b)=>s+remainingValue(b,sel),0);
  $("billsList").innerHTML=db.bills.length
    ?`<div class="row" style="background:var(--accent);color:var(--ink)"><div class="t">Total do mês</div><div class="amt">${money(paid)} pagos de ${money(total)}</div></div>${rows}
      <div class="row"><div class="t">Parcelamentos a pagar depois deste mês</div><div class="amt">${money(debt)}</div></div>`
    :`<div class="empty">Cadastre contas fixas, parcelamentos ou contas únicas</div>`;
}

function renderCal(){
  const[y,m]=parts(sel);
  const n=dim(sel);
  const first=new Date(y,m-1,1).getDay();
  const items=occ(sel);
  const total=items.reduce((s,o)=>s+o.amount,0);
  $("calTitle").textContent=`${monthLabel(sel)} · ${money(total)} em contas`;
  let h=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<first;i++)h+=`<div class="d blank"></div>`;
  for(let d=1;d<=n;d++){
    const ds=`${sel}-${pad(d)}`;
    const due=items.filter(o=>parseInt(dueOf(o.b,sel).slice(8),10)===d);
    h+=`<div class="d ${ds===today()?"today":""}"><div class="n">${d}</div>${due.map(o=>{
      const paid=(o.b.paid||[]).includes(sel);
      const label=compactCal?"●":esc(o.b.name);
      return `<div class="b ${paid?"paid":""}" title="${esc(o.b.name)} · ${money(o.amount)} · ${o.label}">${label}</div>`;
    }).join("")}</div>`;
  }
  $("calGrid").innerHTML=h;
  $("calNext").innerHTML=[1,2,3].map(i=>{
    const k=shiftMonth(sel,i);
    const list=occ(k);
    const sum=list.reduce((s,o)=>s+o.amount,0);
    return `<div class="row"><div><div class="t">${monthLabel(k)}</div><div class="s">${list.length} conta(s)</div></div><div class="amt">${money(sum)}</div></div>`;
  }).join("");
}
const compactQuery=matchMedia("(max-width:480px)");
let compactCal=compactQuery.matches;
compactQuery.addEventListener("change",e=>{compactCal=e.matches;renderCal()});

function renderRev(){
  const t=totals(sel);
  const byCat={};
  t.items.filter(x=>x.type==="expense").forEach(x=>byCat[x.category]=(byCat[x.category]||0)+x.amount);
  t.bills.forEach(o=>byCat[o.b.category]=(byCat[o.b.category]||0)+o.amount);
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const totalExp=t.exp||1;
  $("catList").innerHTML=entries.length?entries.map(([c,v])=>{
    const lim=db.budgets[c];
    const pct=lim?(v/lim)*100:(v/totalExp)*100;
    const cls=lim&&v>=lim?"over":lim&&v>=lim*0.8?"near":"";
    return `<div class="cat">
      <div class="hd"><span>${esc(c)}</span><span>${money(v)} · ${((v/totalExp)*100).toFixed(0)}%</span></div>
      <div class="bar"><i class="${cls}" style="width:${Math.min(pct,100)}%"></i></div>
      ${lim?`<div class="muted" style="margin-top:6px">Limite ${money(lim)}</div>`:""}
    </div>`;
  }).join(""):`<div class="empty">Nenhuma despesa neste mês</div>`;

  $("budgetList").innerHTML=CATS.map(c=>`
    <div class="row"><span class="t">${c}</span>
    <input type="text" inputmode="decimal" autocomplete="off" data-money style="width:140px;text-align:right" value="${db.budgets[c]?fmtValor(db.budgets[c]):""}" placeholder="sem limite" data-act="setBudget" data-cat="${esc(c)}"></div>`).join("");

  const topRows=[
    ...t.items.filter(x=>x.type==="expense").map(x=>({name:x.desc,cat:x.category,amount:x.amount})),
    ...t.bills.map(o=>({name:o.b.name,cat:o.b.category,amount:o.amount}))
  ].sort((a,b)=>b.amount-a.amount).slice(0,5);
  $("top").innerHTML=topRows.map(r=>`<div class="row"><div class="rmain"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.cat||"")}</div></div><div class="amt expense">${money(r.amount)}</div></div>`).join("")||`<div class="empty">Sem despesas neste mês</div>`;
  animateBars();
}

function renderHist(){
  const keys=[];for(let i=5;i>=0;i--)keys.push(shiftMonth(sel,-i));
  const vals=keys.map(k=>totals(k).exp);
  const max=Math.max(...vals,1);
  $("hist").innerHTML=keys.map((k,i)=>`<div class="hcol ${k===sel?"cur":""}"><div class="hbar" style="height:${(vals[i]/max)*100}%" title="${money(vals[i])}"></div><span>${monthLabel(k).split(" ")[0].slice(0,3)}</span></div>`).join("");
}

/* ---------- Como estou: três respostas em frases, sem gráfico ----------
   Usa sempre o mês de hoje. "Sobra" é o mesmo Saldo do mês da tela Início (receitas − despesas − contas do mês),
   então o que ainda vai vencer já está descontado. */
// Quanto ainda vai cair neste mês, sem a pessoa precisar informar nada: o app olha o último mês (dos 3 anteriores)
// que teve receita na categoria "Salário" e repete os mesmos dias e valores. O que já entrou como Salário neste mês
// abate o previsto (nada é contado em dobro); extras (Freelance, Investimentos) só entram quando lançados.
// Só conta parcelas de hoje em diante: se o dia já passou e o salário não foi lançado, o app não inventa esse dinheiro.
function rendaPrevista(cm){
  const salarios=ym=>txOf(ym).filter(t=>t.type==="income"&&t.category==="Salário");
  const base=[1,2,3].map(k=>shiftMonth(cm,-k)).find(ym=>salarios(ym).length);
  if(!base)return 0;
  const modelo=salarios(base);
  const esperado=modelo.reduce((s,t)=>s+t.amount,0);
  const jaEntrou=salarios(cm).reduce((s,t)=>s+t.amount,0);
  const faltam=modelo.filter(t=>`${cm}-${pad(Math.min(parseInt(t.date.slice(8),10),dim(cm)))}`>=today()).reduce((s,t)=>s+t.amount,0);
  return r2(Math.min(faltam,Math.max(0,esperado-jaEntrou)));
}
function renderComoEstou(){
  const cm=mKey(today());
  $("ceBloco").hidden=sel!==cm;                      // o sinal vale para o mês de hoje; em outro mês, só o resumo e os gráficos
  if(sel!==cm)return;
  const t=totals(cm);
  const resta=dim(cm)-parseInt(today().slice(8,10),10)+1;          // dias que faltam, contando hoje
  // contas em aberto + faturas do cartão (a fechada que falta pagar e a aberta, com o que já gastou), da mais urgente para a mais distante
  const lista=openBills().map(x=>({nome:x.b.name,valor:x.amount,d:x.st.d,act:"togglePaid",id:x.b.id,ym:x.ym,botao:"Paguei"}));
  (db.cards||[]).forEach(c=>{
    const cy=currentCloseYm(c), ym=shiftMonth(cy,-1);
    const devF=devidoFatura(c,ym);
    if(devF>0)lista.push({nome:"Fatura "+c.name,valor:devF,d:daysBetween(today(),dueDateOfFatura(c,ym)),act:"markFaturaPaid",id:c.id,ym,cartao:true,botao:"Paguei",nota:"Fatura fechada"});
    const devA=devidoFatura(c,cy);
    if(devA>0){const fa=faturaOf(c,cy),fecha=daysBetween(today(),fa.close);
      lista.push({nome:"Fatura "+c.name,valor:devA,d:daysBetween(today(),fa.due),act:"markFaturaPaid",id:c.id,ym:cy,cartao:true,botao:"Pagar",
        nota:`Em aberto · ${fecha===0?"fecha hoje":fecha===1?"fecha amanhã":"fecha em "+fecha+" dias"} · vence ${fmtDate(fa.due)}`});}
  });
  lista.sort((a,b)=>a.d-b.d);
  const proximas=lista.filter(x=>x.d<=30||x.cartao);     // atrasadas, o que vence em 30 dias e sempre as faturas do cartão
  const atrasadas=lista.filter(x=>x.d<0).length;
  const prev=rendaPrevista(cm);
  const renda=r2(t.inc+prev), sobra=r2(renda-t.exp);      // renda = o que já entrou + o que ainda vai cair
  const usado=renda>0?Math.round(t.exp/renda*100):null;

  let cor="cinza",titulo="Sem dados ainda",frase="Cadastre uma receita e seus gastos para eu poder avaliar o mês.";
  if(renda>0||t.exp>0){
    if(renda<=0){cor="vermelho";titulo="Cuidado";frase="Você tem gastos neste mês, mas nenhuma receita cadastrada."}
    else if(sobra<0){cor="vermelho";titulo="Cuidado";frase="As contas e os gastos do mês já passam do que você ganha."}
    else if(usado>=80){cor="amarelo";titulo="Atenção";frase=`Você já comprometeu ${usado}% do que ganha este mês.`}
    else{cor="verde";titulo="Tudo certo";frase=`Você usou ${usado}% do que ganha este mês. Está dentro do planejado.`}
    if(atrasadas&&cor!=="vermelho"){cor="amarelo";titulo="Atenção";frase=`Você tem ${atrasadas} ${atrasadas>1?"contas atrasadas":"conta atrasada"} para pagar.`}
  }
  $("ceSinal").innerHTML=`<div class="luz ${cor}"></div><div><b>${esc(titulo)}</b><span>${esc(frase)}</span></div>`;

  let pode;
  if(!(renda>0||t.exp>0))pode=`<div class="ceFrase">Cadastre a receita deste mês para eu calcular quanto você pode gastar.</div>`;
  else if(sobra<0)pode=`<div class="ceFrase">Neste mês já faltam<b class="ceGrande neg">${money(-sobra)}</b>para cobrir tudo o que você tem a pagar.</div>`;
  else if(sobra===0)pode=`<div class="ceFrase">Não sobra nada neste mês: tudo o que você ganhou já está comprometido.</div>`;
  else pode=`<div class="ceFrase">Você ainda pode gastar<b class="ceGrande">${money(sobra)}</b>até o fim do mês</div>
    <div class="ceBarra"><div style="width:${Math.min(100,usado||0)}%"></div></div>
    <div class="ceNota">Dá cerca de ${money(sobra/resta)} por dia · ${resta===1?"falta 1 dia":"faltam "+resta+" dias"}. As contas que ainda vão vencer já foram descontadas.${prev>0?` Já contei ${money(prev)} que ainda vai cair este mês.`:""}</div>`;
  $("cePode").innerHTML=pode;

  $("ceVem").innerHTML=proximas.length?proximas.slice(0,5).map(x=>{
    const [peq,gra]=x.d<0?["atrasada há",`${-x.d} ${x.d===-1?"dia":"dias"}`]:x.d===0?["vence","hoje"]:x.d===1?["vence","amanhã"]:["vence em",`${x.d} dias`];
    return `<div class="ceItem ${x.d<0?"late":x.d<=3?"soon":""}${x.cartao?" cartao":""}"><div class="ceDia">${peq}<b>${gra}</b></div><div class="ceMid"><div class="n">${esc(x.nome)}</div>${x.nota?`<div class="nota">${esc(x.nota)}</div>`:""}<div class="v">${money(x.valor)}</div></div><button class="ghost" type="button" data-act="${x.act}" data-id="${esc(x.id)}" data-ym="${esc(x.ym)}">${x.botao}</button></div>`;
  }).join(""):`<div class="ceFrase">Nenhuma conta em aberto. Tudo em dia.</div>`;
}
$("ceMaisBtn").onclick=()=>{
  const d=$("ceDetalhes");d.hidden=!d.hidden;
  $("ceMaisBtn").textContent=d.hidden?"Ver detalhes (gráficos)":"Esconder detalhes";
  $("ceMaisBtn").setAttribute("aria-expanded",String(!d.hidden));
};

function renderIns(){
  const cur=totals(sel);
  const prevK=shiftMonth(sel,-1);
  const prev=totals(prevK);
  const diff=prev.exp?((cur.exp-prev.exp)/prev.exp)*100:null;
  const now=mKey(today());
  // Média diária do que JÁ foi gasto: no mês atual conta só até hoje (um aluguel que vence dia 28 não
  // entra na média do dia 5); em outros meses vale o mês inteiro.
  const days=sel===now?Math.max(1,parseInt(today().slice(8,10),10)):dim(sel);
  const upTo=sel===now?today():"9999-12-31";
  const spent=cur.items.filter(x=>x.type==="expense"&&x.date<=upTo).reduce((s,x)=>s+x.amount,0)
    +cur.bills.filter(o=>dueOf(o.b,sel)<=upTo).reduce((s,o)=>s+o.amount,0);
  const avg=spent/days;
  const rate=cur.inc?((cur.inc-cur.exp)/cur.inc)*100:null;
  const byCat={};
  cur.items.filter(x=>x.type==="expense").forEach(x=>byCat[x.category]=(byCat[x.category]||0)+x.amount);
  cur.bills.forEach(o=>byCat[o.b.category]=(byCat[o.b.category]||0)+o.amount);
  const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];

  const tips=[];
  if(rate===null)tips.push("Cadastre as receitas deste mês para ver sua taxa de economia.");
  else if(rate<0)tips.push("Você gastou mais do que recebeu neste mês. Vale revisar as maiores categorias.");
  else if(rate<10)tips.push("Sua taxa de economia está abaixo de 10%. Tente reduzir os gastos variáveis.");
  else tips.push(`Você guardou cerca de ${rate.toFixed(0)}% da receita neste mês. Ótimo ritmo.`);
  if(diff!==null)tips.push(diff>0
    ?`Suas despesas subiram ${diff.toFixed(0)}% em relação a ${monthLabel(prevK)}.`
    :`Suas despesas caíram ${Math.abs(diff).toFixed(0)}% em relação a ${monthLabel(prevK)}.`);
  if(top)tips.push(`Maior categoria de gasto: ${top[0]}, com ${money(top[1])}.`);
  tips.push(`Média diária de gasto: ${money(avg)}.`);

  $("insBody").innerHTML=`
    <div class="card"><h2>Resumo do mês</h2>
      <div class="list">
        <div class="row"><span class="t">Taxa de economia</span><span class="amt">${rate===null?"—":rate.toFixed(0)+"%"}</span></div>
        <div class="row"><span class="t">Variação de despesas</span><span class="amt ${diff>0?"expense":"income"}">${diff===null?"—":(diff>0?"+":"")+diff.toFixed(0)+"%"}</span></div>
        <div class="row"><span class="t">Média diária</span><span class="amt">${money(avg)}</span></div>
        <div class="row"><span class="t">Contas do mês</span><span class="amt">${money(occ(sel).reduce((s,o)=>s+o.amount,0))}</span></div>
      </div>
    </div>
    <div class="card"><h2>Observações do mês</h2>
      ${tips.map(x=>`<div class="tip"><p>${esc(x)}</p></div>`).join("")}
    </div>`;
}

const STAGGERS=[["notifs"],["recent"],["billsList"],["accList"],["catList"],["top"],["insBody",80],["calGrid",10]];
function playEnter(){
  animNow=true;
  STAGGERS.forEach(([id,step])=>stagger($(id),step));
  animateBars();
  animNow=false;
}
function renderAll(){
  animNow=replayAnim;
  populateMonths();
  renderCardChips();
  renderInicio();
  renderChart();
  renderFeed();
  renderContas();
  renderCal();
  renderRev();
  renderHist();
  renderIns();
  renderComoEstou();
  renderCards();
  populateCardSelects();
  renderCarteira();
  renderV13();
  animNow=false;
  if(replayAnim){replayAnim=false;playEnter()}
}

function renderCards(){
  const cards=db.cards||[];
  $("cardList").innerHTML=cards.length?cards.map(c=>{
    const cy=currentCloseYm(c), open=faturaOf(c,cy), devA=devidoFatura(c,cy);
    const pendingYm=shiftMonth(cy,-1), pend=faturaOf(c,pendingYm), devF=devidoFatura(c,pendingYm);
    const vencida=devF>0&&daysBetween(today(),pend.due)<0;
    return `<div class="row"><div class="rmain">
      <div class="t">${esc(c.name)}</div>
      <div class="s">Fatura aberta: ${money(devA)}${devA<open.total?` (de ${money(open.total)}, parte já paga)`:""} · fecha ${fmtDate(open.close)} · vence ${fmtDate(open.due)}</div>
      <div class="s">Fecha todo dia ${c.closeDay} · vence todo dia ${c.dueDay}</div>
      ${devF>0?`<div class="s warn">Fatura fechada${vencida?" e vencida":""}: falta pagar ${money(devF)} · vence ${fmtDate(pend.due)}</div>`:""}
      </div><div class="actions">
      ${devF>0?`<button class="ghost" data-act="markFaturaPaid" data-id="${esc(c.id)}" data-ym="${esc(pendingYm)}">Paguei</button>`
        :devA>0?`<button class="ghost" data-act="markFaturaPaid" data-id="${esc(c.id)}" data-ym="${esc(cy)}">Pagar adiantado</button>`:""}
      <button class="ico" title="Editar cartão" aria-label="Editar cartão" data-act="editCard" data-id="${esc(c.id)}">✎</button>
      <button class="ico" title="Excluir cartão" aria-label="Excluir cartão" data-act="delCard" data-id="${esc(c.id)}">×</button></div></div>`;
  }).join(""):`<div class="empty">Cadastre seus cartões para acompanhar as faturas</div>`;
}
function renderCarteira(){
  const accs=db.accounts||[];
  const total=accTotal();
  $("accTotal").textContent=money(total);
  $("accTotal").className="big "+(total<0?"expense":"");
  $("heroAcc").hidden=!accs.length;
  $("heroAccVal").textContent=money(total);
  $("accList").innerHTML=accs.length?accs.map(a=>{
    const b=accBalance(a);
    return `<div class="row"><div class="ic">${esc(a.name.charAt(0).toUpperCase())}</div><div class="rmain"><div class="t">${esc(a.name)}</div><div class="s">${ACC_TYPES[a.type]||"Conta"} · saldo inicial ${money(a.initial||0)}</div></div><div class="actions"><span class="amt ${b<0?"expense":"income"}">${money(b)}</span><button class="ico" title="Editar conta" aria-label="Editar conta" data-act="editAcc" data-id="${esc(a.id)}">✎</button><button class="ico" title="Excluir conta" aria-label="Excluir conta" data-act="delAcc" data-id="${esc(a.id)}">×</button></div></div>`;
  }).join(""):`<div class="empty">Cadastre suas contas para acompanhar o saldo de cada uma</div>`;
  renderTransfer(accs);
  renderStatement(accs);
}
function renderTransfer(accs){
  const opts=accs.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  const keep={from:$("trFrom").value,to:$("trTo").value};
  $("trFrom").innerHTML=opts;$("trTo").innerHTML=opts;
  if(accs.some(a=>a.id===keep.from))$("trFrom").value=keep.from;
  if(accs.some(a=>a.id===keep.to))$("trTo").value=keep.to;
  else if(accs.length>1)$("trTo").value=accs.find(a=>a.id!==$("trFrom").value).id;
  $("trForm").hidden=accs.length<2;
  $("trHint").hidden=accs.length>=2;
}
function renderStatement(accs){
  $("stmtCard").hidden=!accs.length;
  if(!accs.length)return;
  const keep=$("stmtAcc").value;
  $("stmtAcc").innerHTML=accs.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  if(accs.some(a=>a.id===keep))$("stmtAcc").value=keep;
  const a=accs.find(x=>x.id===$("stmtAcc").value)||accs[0];
  const moves=accMoves(a).sort((x,y)=>x.t.date.localeCompare(y.t.date)||(x.t.created||0)-(y.t.created||0));
  let run=toCents(a.initial);
  const rows=moves.map(m=>{run+=m.delta;return{...m,saldo:run/100}}).reverse();
  const label=t=>{
    if(t.type==="transfer"){
      return t.from===a.id?`Transferência para ${accName(t.to)||"conta removida"}`:`Transferência de ${accName(t.from)||"conta removida"}`;
    }
    return t.desc;
  };
  $("stmtList").innerHTML=rows.slice(0,200).map(m=>`<div class="row"><div class="rmain"><div class="t">${esc(label(m.t))}</div><div class="s">${fmtDate(m.t.date)} · saldo ${money(m.saldo)}</div></div><span class="amt ${m.delta<0?"expense":"income"}">${m.delta<0?"−":"+"} ${money(Math.abs(m.delta)/100)}</span></div>`).join("")
    +`<div class="row"><div class="rmain"><div class="t">Saldo inicial</div><div class="s">${esc(a.name)}</div></div><span class="amt neutral">${money(a.initial||0)}</span></div>`;
}
$("stmtAcc").onchange=()=>renderStatement(db.accounts||[]);
$("trForm").onsubmit=e=>{
  e.preventDefault();
  const from=$("trFrom").value,to=$("trTo").value,amount=Math.round((parseValor($("trAmt").value)||0)*100)/100;
  if(!from||!to||from===to){showToast("Escolha duas contas diferentes");return}
  if(!(amount>0)){showToast(MSG_VALOR);return}
  const date=$("trDate").value||today();
  db.tx.push({id:uid(),type:"transfer",desc:$("trDesc").value.trim()||"Transferência",amount,date,category:"Transferência",from,to,created:Date.now()});
  save();
  $("trAmt").value="";$("trDesc").value="";
  renderAll();
  showToast("Transferência registrada");
};
$("accForm").onsubmit=e=>{
  e.preventDefault();
  const name=$("accName").value.trim();
  if(!name)return;
  const ini=$("accInit").value.trim()?parseValor($("accInit").value,true):0;
  if(!Number.isFinite(ini)){showToast(MSG_VALOR);return}
  db.accounts=db.accounts||[];
  db.accounts.push({id:uid(),name,type:$("accType").value,initial:Math.round(ini*100)/100});
  save();
  e.target.reset();
  renderAll();
  showToast("Conta cadastrada");
};
async function delAcc(id){
  if(!(await ask("Excluir esta conta? Os lançamentos continuam no histórico, só que sem conta, e as transferências dela ficam com a outra ponta só.")))return;
  db.accounts=(db.accounts||[]).filter(a=>a.id!==id);
  db.tx.forEach(t=>{
    if(t.account===id)delete t.account;
    if(t.from===id)t.from=null;
    if(t.to===id)t.to=null;
  });
  save();renderAll();
}
function populateCardSelects(){
  const opts=`<option value="">Sem cartão</option>`+(db.cards||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  $("bCard").innerHTML=opts;
}
$("cardForm").onsubmit=e=>{
  e.preventDefault();
  db.cards=db.cards||[];
  db.cards.push({
    id:uid(),
    name:$("cName").value.trim(),
    closeDay:Math.min(31,Math.max(1,parseInt($("cClose").value,10))),
    dueDay:Math.min(31,Math.max(1,parseInt($("cDue").value,10))),
    paid:[]
  });
  save();
  e.target.reset();
  renderAll();
  showToast("Cartão cadastrado");
};

/* ---------- navegação ---------- */
let currentView="inicio";
function go(v){
  currentView=v;
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+v));
  document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("on",x.dataset.nav===v&&!x.classList.contains("sideNew")));
  $("pageTitle").textContent=TITLES[v]||"Início";
  $("month").hidden=v==="metas";   // Metas não depende do mês escolhido
  $("menu").hidden=true;
  window.scrollTo({top:0,behavior:"auto"});
  if(db)playEnter();
}
document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$("navMais").onclick=()=>{$("menu").hidden=false};
$("menuBtn").onclick=()=>{$("menu").hidden=false};
$("menuClose").onclick=()=>{$("menu").hidden=true};
$("menu").onclick=e=>{if(e.target.id==="menu")$("menu").hidden=true};

$("month").onchange=e=>{sel=e.target.value;replayAnim=true;renderAll()};
$("search").oninput=renderFeed;
$("filterType").onchange=renderFeed;


function syncBillForm(){
  const kind=document.querySelector('input[name="kind"]:checked').value;
  $("bDay").hidden=kind==="unica";$("bDay").required=kind!=="unica";
  $("bDate").hidden=kind!=="unica";$("bDate").required=kind==="unica";
  $("endBox").hidden=kind!=="mensal";
  const until=kind==="mensal"&&$("bEndType").value==="until";
  $("bEnd").hidden=!until;$("bEnd").required=until;
  if(!$("bEnd").value)$("bEnd").value=shiftMonth(mKey(today()),12);
  $("parcBox").hidden=kind!=="parcelada";
  $("bParcels").required=kind==="parcelada";$("bStart").required=kind==="parcelada";
  if(!$("bDate").value)$("bDate").value=today();
  if(!$("bStart").value)$("bStart").value=mKey(today());
  updateParcTotal();
}
function updateParcTotal(){
  const kind=document.querySelector('input[name="kind"]:checked').value;
  const a=parseValor($("bAmt").value)||0, n=parseInt($("bParcels").value,10)||0;
  const box=$("parcTotal");
  box.hidden=!(kind==="parcelada"&&a>0&&n>0);
  box.textContent=`Total da compra: ${money(a*n)} em ${n} parcelas de ${money(a)}`;
}
$("billForm").onsubmit=e=>{
  e.preventDefault();
  const kind=document.querySelector('input[name="kind"]:checked').value;
  const valorConta=parseValor($("bAmt").value);
  if(!(valorConta>0)){showToast(MSG_VALOR);return}
  const b={id:uid(),kind,name:$("bName").value.trim(),amount:valorConta,category:$("bCat").value,card:$("bCard").value||null,paid:[]};
  if(kind==="unica")b.date=$("bDate").value;
  else b.day=Math.min(31,Math.max(1,parseInt($("bDay").value,10)));
  if(kind==="parcelada"){b.parcels=Math.min(120,Math.max(2,parseInt($("bParcels").value,10)));b.start=$("bStart").value}
  if(kind==="mensal"){b.start=mKey(today());if($("bEndType").value==="until")b.end=$("bEnd").value}
  if(kind==="mensal"&&$("bSub").checked)b.sub=true;
  db.bills.push(b);
  save();
  e.target.reset();
  syncBillForm();
  renderAll();
  showToast(kind==="parcelada"?"Parcelamento cadastrado":"Conta cadastrada");
};

// Chave pública VAPID (não é segredo). Gerada com: npx web-push generate-vapid-keys
const VAPID_PUBLIC="BGGyVgDKPPa-kxNRAaaBdaP2JNTbLhcvbbETAfc_0Q0pbwKpYXkEFe2uPKQiGWWKQtvfz4NLzSgrMCfOdYqWeu4";
function b64ToBytes(s){
  const pad="=".repeat((4-s.length%4)%4);
  const raw=atob((s+pad).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone=window.matchMedia&&matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
$("notifBtn").onclick=async()=>{
  try{
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
      showToast(isIOS?"No iPhone, adicione o app à Tela de Início e ative por lá":"Este navegador não suporta notificações em segundo plano");
      return;
    }
    if(isIOS&&!isStandalone){
      showToast("No iPhone: Compartilhar → Adicionar à Tela de Início, depois ative pelo ícone do app");
      return;
    }
    if(VAPID_PUBLIC.startsWith("COLE_")){showToast("Notificações ainda não configuradas");return}
    const perm=await Notification.requestPermission();
    if(perm!=="granted"){showToast("Permissão de notificação não concedida");return}
    const reg=await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const key=b64ToBytes(VAPID_PUBLIC);
    let sub=await reg.pushManager.getSubscription();
    if(sub){
      // inscrição antiga criada com outra chave (ou sem chave conhecida): o serviço de push recusa os envios.
      const cur=sub.options&&sub.options.applicationServerKey;
      const same=cur&&cur.byteLength===key.length&&new Uint8Array(cur).every((v,i)=>v===key[i]);
      if(!same){
        try{await API.del("/api/push",{endpoint:sub.endpoint})}catch(e){}
        await sub.unsubscribe();
        sub=null;
      }
    }
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    const j=sub.toJSON();
    await API.post("/api/push",{endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth});
    showToast("Notificações ativadas neste aparelho");
    // aviso local de confirmação: se ele aparecer, o aparelho consegue mostrar notificações
    try{await reg.showNotification("Notificações ativadas",{body:"Os avisos de contas e cartões vão chegar aqui.",tag:"ativado"})}catch(e){}
  }catch(err){
    showToast("Não foi possível ativar as notificações");
  }
};

/* ---------- editar conta ou cartão: nome; no cartão, também os dias de fechamento e vencimento ---------- */
let eiAlvo=null;
function abrirEditar(tipo,id){
  const it=(tipo==="card"?(db.cards||[]):(db.accounts||[])).find(x=>x.id===id);if(!it)return;
  eiAlvo={tipo,id};
  $("eiTitulo").textContent=tipo==="card"?"Editar cartão":"Editar conta";
  $("eiNome").value=it.name;
  $("eiDias").hidden=tipo!=="card";
  if(tipo==="card"){$("eiFecha").value=it.closeDay;$("eiVence").value=it.dueDay}
  $("eiErro").textContent="";
  $("eiSheet").hidden=false;$("eiNome").focus();
}
$("eiFechar").onclick=()=>{$("eiSheet").hidden=true};
$("eiSheet").addEventListener("click",e=>{if(e.target===$("eiSheet"))$("eiSheet").hidden=true});
$("eiForm").onsubmit=e=>{
  e.preventDefault();
  if(!eiAlvo)return;
  const it=(eiAlvo.tipo==="card"?(db.cards||[]):(db.accounts||[])).find(x=>x.id===eiAlvo.id);if(!it)return;
  const nome=$("eiNome").value.trim();
  if(!nome){$("eiErro").textContent="Digite um nome.";$("eiNome").focus();return}
  if(eiAlvo.tipo==="card"){
    const f=parseInt($("eiFecha").value,10),v=parseInt($("eiVence").value,10);
    if(!(f>=1&&f<=31&&v>=1&&v<=31)){$("eiErro").textContent="Os dias precisam ficar entre 1 e 31.";return}
    it.closeDay=f;it.dueDay=v;
  }
  it.name=nome;
  save();$("eiSheet").hidden=true;renderAll();showToast("Salvo");
};

/* ---------- Lançamento Relâmpago ----------
   Abre por cima de qualquer tela pelo "+". Valor primeiro, "Pagou com" obrigatório (conta ou cartão: nada de
   lançamento sem origem, o "saldo fantasma"), categoria em um toque, descrição opcional.
   Compra no cartão não tira dinheiro da conta (sai quando a fatura é paga). Sem internet: o lançamento fica numa
   fila neste aparelho (só os lançamentos novos, ligados ao e-mail de quem lançou) e é enviado quando a conexão volta. */
const FILA="tv_fila";
function filaLer(){
  try{const f=JSON.parse(localStorage.getItem(FILA)||"null");return f&&sessionUser&&f.email===sessionUser.email&&Array.isArray(f.itens)?f.itens:[]}catch(e){return []}
}
function filaGravar(itens){
  try{itens.length?localStorage.setItem(FILA,JSON.stringify({email:sessionUser.email,itens})):localStorage.removeItem(FILA)}catch(e){}
}
function filaPor(item){filaGravar([...filaLer(),item])}
// tira da fila o que a gravação levou para a nuvem
function filaConfirmar(snap){
  const fila=filaLer();if(!fila.length)return;
  const ids=new Set([...(snap.tx||[]).map(t=>t.id),...(snap.bills||[]).map(b=>b.id)]);
  filaGravar(fila.filter(i=>!ids.has(i.obj.id)));
}
// ao entrar: o que ficou só no aparelho volta para os dados (sem duplicar)
function filaMesclar(){
  let n=0;
  filaLer().forEach(i=>{
    const lista=i.kind==="bill"?db.bills:db.tx;
    if(!lista.some(x=>x.id===i.obj.id)){lista.push(i.obj);n++}
  });
  return n;
}
window.addEventListener("online",()=>{if(db&&sessionUser&&!dbConflict&&filaLer().length)save()});

const RL={tipo:"expense",meio:"",cat:"",catLimpa:false};
function rlOpcoes(){
  const accs=(db.accounts||[]).map(a=>"a:"+a.id), cards=(db.cards||[]).map(c=>"c:"+c.id);
  return RL.tipo==="expense"?[...accs,...cards]:accs;
}
const ICO_CONTA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>';
const ICO_CARTAO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>';
const rlChip=(grupo,k,rot,sub,on,ico)=>`<button type="button" class="chip rl-chip" data-rl="${grupo}" data-v="${esc(k)}" aria-pressed="${on}">${ico||""}<span>${esc(rot)}</span>${sub?`<small>${esc(sub)}</small>`:""}</button>`;
function rlRender(){
  const t=RL.tipo;
  document.querySelectorAll('#rlSheet input[name="rlTipo"]').forEach(r=>{r.checked=r.value===t});
  $("rlParcBox").hidden=t!=="expense";
  $("rlUsados").hidden=t!=="expense"||!$("rlUsados").children.length;   // "mais usados" são despesas
  $("rlMeioLbl").textContent=t==="income"?"Recebeu em":"Pagou com";
  if(RL.meio&&!rlOpcoes().includes(RL.meio))RL.meio="";
  const accs=db.accounts||[], cards=t==="expense"?(db.cards||[]):[];
  let html="";
  if(accs.length)html+=`<div class="rl-grupo"><div class="rl-sub">${t==="income"?"Conta onde o dinheiro entrou":"Pix, débito ou dinheiro · sai da conta agora"}</div><div class="chips rl-meios">${accs.map(a=>rlChip("meio","a:"+a.id,a.name,"",RL.meio==="a:"+a.id,ICO_CONTA)).join("")}</div></div>`;
  if(cards.length)html+=`<div class="rl-grupo"><div class="rl-sub">Cartão de crédito · vai para a fatura</div><div class="chips rl-meios">${cards.map(c=>rlChip("meio","c:"+c.id,c.name,"fecha dia "+c.closeDay,RL.meio==="c:"+c.id,ICO_CARTAO)).join("")}</div></div>`;
  $("rlMeios").innerHTML=html||`<div class="rl-vazio">${t==="income"?"Cadastre a conta onde o dinheiro entra.":"Cadastre uma conta ou um cartão para lançar."} <button type="button" class="ghost" data-act="rlIrCarteira">Ir para Carteira</button></div>`;
  const cats=t==="income"?ICATS:CATS;
  if(RL.cat&&!cats.includes(RL.cat))RL.cat="";
  if(!RL.cat&&!RL.catLimpa)RL.cat=t==="income"?(db.settings.ultimaCatRec||ICATS[0]):(db.settings.ultimaCat||"");
  $("rlCats").innerHTML=cats.map(c=>rlChip("cat",c,c,"",RL.cat===c,catIcon(c))).join("");
  rlParcInfo();
}
function rlUsados(){
  const freq={};
  db.tx.filter(x=>x.type==="expense").forEach(x=>{const k=(x.desc||"").trim();if(!k)return;const f=freq[k]||{desc:k,n:0};f.n++;f.cat=x.category;f.amt=x.amount;f.meio=x.card?"c:"+x.card:(x.account?"a:"+x.account:"");freq[k]=f});
  const top=Object.values(freq).sort((a,b)=>b.n-a.n).slice(0,6);
  $("rlUsados").hidden=!top.length;
  $("rlUsados").innerHTML=top.map((f,i)=>`<button type="button" class="chip" data-usado="${i}">${esc(f.desc)}</button>`).join("");
  $("rlUsados").querySelectorAll("[data-usado]").forEach(b=>b.onclick=()=>{
    const f=top[+b.dataset.usado];
    RL.tipo="expense";RL.cat=f.cat;RL.catLimpa=false;if(f.meio)RL.meio=f.meio;
    $("rlDesc").value=f.desc;$("rlValor").value=fmtValor(f.amt);rlRender();$("rlValor").focus();
  });
}
function rlParcInfo(){
  const on=$("rlParc").checked;$("rlParcelas").hidden=!on;
  const n=parseInt($("rlParcelas").value,10)||0,v=parseValor($("rlValor").value)||0;
  $("rlParcInfo").textContent=on&&n>1&&v>0?`${n}x de ${money(v/n)}`:"";
}
function rlErro(msg,foco){$("rlErro").textContent=msg;if(foco)$(foco).focus()}
function abrirRelampago(){
  if(!db)return;
  $("menu").hidden=true;
  RL.tipo="expense";RL.cat="";RL.catLimpa=false;
  RL.meio=db.settings.ultimoMeio||"";
  $("rlValor").value="";$("rlDesc").value="";$("rlData").value=today();$("rlParc").checked=false;$("rlParcelas").value="";$("rlErro").textContent="";
  rlUsados();rlRender();
  $("rlSheet").hidden=false;
  $("rlValor").focus();   // dentro do toque: no celular o teclado numérico já abre
}
$("rlFechar").onclick=()=>{$("rlSheet").hidden=true};
$("rlSheet").addEventListener("click",e=>{
  if(e.target===$("rlSheet")){$("rlSheet").hidden=true;return}   // toque fora da janela fecha
  const b=e.target.closest("[data-rl]");if(!b)return;
  const g=b.dataset.rl,v=b.dataset.v;
  // tocar de novo na opção marcada desmarca
  if(g==="meio")RL.meio=RL.meio===v?"":v;
  else if(g==="cat"){RL.cat=RL.cat===v?"":v;RL.catLimpa=!RL.cat}
  $("rlErro").textContent="";rlRender();
});
document.querySelectorAll('#rlSheet input[name="rlTipo"]').forEach(r=>r.addEventListener("change",()=>{RL.tipo=r.value;RL.cat="";RL.catLimpa=false;$("rlErro").textContent="";rlRender()}));
$("rlParc").onchange=()=>{rlParcInfo();if($("rlParc").checked)$("rlParcelas").focus()};
$("rlParcelas").addEventListener("input",rlParcInfo);
$("rlValor").addEventListener("input",rlParcInfo);
$("rlValor").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("rlSalvar").click()}});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!$("rlSheet").hidden)$("rlSheet").hidden=true;if(!$("eiSheet").hidden)$("eiSheet").hidden=true});
$("rlSalvar").onclick=()=>{
  const t=RL.tipo,v=parseValor($("rlValor").value);
  if(!(v>0))return rlErro(MSG_VALOR,"rlValor");
  const valor=Math.round(v*100)/100,data=$("rlData").value||today(),desc=$("rlDesc").value.trim();
  let item,resumo;
  {
    if(!RL.meio)return rlErro(t==="income"?"Escolha em qual conta o dinheiro entrou.":"Escolha onde pagou: conta ou cartão.");
    const [k,id]=RL.meio.split(":");
    const card=k==="c"?id:null,account=k==="a"?id:null;
    const category=RL.cat||(t==="income"?ICATS[0]:"Outros");
    if(t==="expense"&&$("rlParc").checked){
      const n=parseInt($("rlParcelas").value,10);
      if(!(n>=2&&n<=120))return rlErro("Diga em quantas parcelas (de 2 a 120).","rlParcelas");
      const {p,last}=splitParcel(valor,n);
      const obj={id:uid(),kind:"parcelada",name:desc||category,amount:p,parcels:n,start:mKey(data),day:parseInt(data.slice(8,10),10),category,card,paid:[]};
      if(last!==p)obj.last=last;
      db.bills.push(obj);item={kind:"bill",obj};resumo=`Parcelado em ${n}x de ${money(p)}`;
    }else{
      const obj={id:uid(),type:t,desc:desc||category,amount:valor,date:data,category,card:t==="income"?null:card,created:Date.now()};
      if(account)obj.account=account;
      db.tx.push(obj);item={kind:"tx",obj};resumo=`${t==="income"?"Recebido":"Lançado"}: ${money(valor)} · ${category}`;
    }
    db.settings.ultimoMeio=RL.meio;
    if(t==="income")db.settings.ultimaCatRec=category;else db.settings.ultimaCat=category;
  }
  filaPor(item);
  save();
  $("rlSheet").hidden=true;
  sel=mKey(data);
  renderAll();
  showToast(resumo);
};

/* ---------- inicialização ---------- */
$("bCat").innerHTML=CATS.map(c=>`<option>${c}</option>`).join("");
$("trDate").value=today();
document.querySelectorAll('input[name="kind"]').forEach(r=>r.onchange=syncBillForm);
["bAmt","bParcels","bStart"].forEach(id=>$(id).addEventListener("input",updateParcTotal));
syncBillForm();
$("bEndType").onchange=syncBillForm;
/* ---------- v13: privacidade, atalhos, filtros, exportação/importação, metas, renda variável, assinaturas, gráficos ---------- */
const PAL=["#d6d6d6","#ff4d4d","#f5b33a","#3ecf8e","#5aa9e6","#a98bd9","#f08b8e","#8f99a3"];
const fCards=new Set();
function cardName(id){const c=(db.cards||[]).find(x=>x.id===id);return c?c.name:""}
function brDate(s){const[y,m,d]=parts(s);return `${pad(d)}/${pad(m)}/${y}`}

/* privacidade: ocultar valores */
try{privacy=localStorage.getItem("fin_priv")==="1"}catch(e){}
function setPrivacy(v){
  privacy=v;
  try{localStorage.setItem("fin_priv",v?"1":"0")}catch(e){}
  $("privBtn").setAttribute("aria-pressed",String(v));
  if(db)renderAll();
}
$("privBtn").onclick=()=>setPrivacy(!privacy);
$("privBtn").setAttribute("aria-pressed",String(privacy));

/* histórico com filtros */
function renderCardChips(){
  const opts=[["none","Sem cartão"],...(db.cards||[]).map(c=>[c.id,c.name])];
  $("fCards").innerHTML=opts.map(([id,name])=>`<button type="button" class="chip" aria-pressed="${fCards.has(id)}" data-fc="${esc(id)}">${esc(name)}</button>`).join("");
  $("fCards").querySelectorAll("[data-fc]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.fc;
    if(fCards.has(id))fCards.delete(id);else fCards.add(id);
    renderCardChips();
  });
}
function renderFeed(){
  const q=$("search").value.trim().toLowerCase();
  const ft=$("filterType").value;
  const from=$("fFrom").value, to=$("fTo").value, sort=$("fSort").value;
  let items=sortedTx().filter(t=>(ft==="all"||t.type===ft)&&(!q||t.desc.toLowerCase().includes(q)||t.category.toLowerCase().includes(q)));
  if(from)items=items.filter(t=>t.date>=from);
  if(to)items=items.filter(t=>t.date<=to);
  if(fCards.size)items=items.filter(t=>(t.card&&fCards.has(t.card))||(!t.card&&fCards.has("none")));
  if(sort==="high")items.sort((a,b)=>b.amount-a.amount);
  if(sort==="low")items.sort((a,b)=>a.amount-b.amount);
  if(!items.length){$("feed").innerHTML=`<div class="empty">Nada encontrado</div>`;return}
  let html="",last="";
  items.forEach(t=>{
    if(sort==="recent"&&t.date!==last){last=t.date;html+=`<div class="day">${fmtDate(t.date,true)}</div>`}
    html+=txRow(t);
  });
  $("feed").innerHTML=`<div class="list">${html}</div>`;
}
["fFrom","fTo","fSort"].forEach(id=>$(id).addEventListener("change",renderFeed));

/* renda variável */
function renderVar(){
  const on=!!(db.settings&&db.settings.variable);
  $("varIncome").checked=on;
  if(!on){$("varInfo").textContent="Ative se sua renda muda de mês. O app sugere um orçamento com base na sua menor renda recente.";return}
  const cur=mKey(today());
  const incs=[0,1,2,3,4,5].map(k=>totals(shiftMonth(cur,-k)).inc).filter(v=>v>0);
  if(incs.length<3){$("varInfo").textContent=`Registre receitas de pelo menos 3 meses para calcular (você tem ${incs.length}).`;return}
  const min=Math.min(...incs);
  $("varInfo").innerHTML=`Menor renda dos últimos ${incs.length} meses com receita: <b>${esc(money(min))}</b>. Planeje seus gastos fixos até esse valor; o que entrar acima dele vai para a reserva.`;
}
$("varIncome").onchange=e=>{
  db.settings={...(db.settings||{}),variable:e.target.checked};
  save();renderV13();
};

/* metas e caixinhas */
function renderGoals(){
  const cur=mKey(today());
  const list=db.goals||[];
  $("goalList").innerHTML=list.length?list.map(g=>{
    const pct=Math.min(100,g.target?g.saved/g.target*100:0);
    const left=monthDiff(cur,g.deadline);
    const done=g.saved>=g.target;
    const perMonth=Math.max(0,(g.target-g.saved)/Math.max(1,left));
    const info=done?"Meta alcançada":left<0?"Prazo vencido":`Faltam ${money(g.target-g.saved)} · guardar ${money(perMonth)} por mês até ${monthLabel(g.deadline)}`;
    return `<div class="goal">
      <div class="gh"><div style="min-width:0"><div class="t">${esc(g.name)}</div><div class="s">${money(g.saved)} de ${money(g.target)}</div></div><button class="ico" title="Excluir meta" data-gdel="${esc(g.id)}">×</button></div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="s">${info}</div>
      ${done?"":`<div class="gr"><input type="text" inputmode="decimal" autocomplete="off" data-money placeholder="Guardar agora (R$)" data-gin="${esc(g.id)}"><button class="ghost" type="button" data-gadd="${esc(g.id)}">Guardar</button></div>`}
    </div>`;
  }).join(""):`<div class="empty">Crie uma meta: reserva de emergência, viagem, troca de celular...</div>`;
}
$("goalForm").onsubmit=e=>{
  e.preventDefault();
  const name=$("gName").value.trim(), target=parseValor($("gTarget").value), deadline=$("gDeadline").value;
  if(!(target>0)){showToast(MSG_VALOR);return}
  if(!name||!deadline){showToast("Preencha nome, valor e prazo");return}
  db.goals=db.goals||[];
  db.goals.push({id:uid(),name,target,deadline,saved:0});
  save();e.target.reset();renderV13();
  showToast("Meta criada");
};
$("goalList").onclick=async e=>{
  const add=e.target.closest("[data-gadd]"), del=e.target.closest("[data-gdel]");
  if(add){
    const g=db.goals.find(x=>x.id===add.dataset.gadd);
    const input=document.querySelector(`[data-gin="${CSS.escape(g.id)}"]`);
    const v=parseValor(input.value);
    if(!(v>0)){showToast(MSG_VALOR);return}
    g.saved=Math.round((g.saved+v)*100)/100;
    save();renderV13();
    showToast(g.saved>=g.target?"Meta alcançada!":"Valor guardado");
  }else if(del){
    const g=db.goals.find(x=>x.id===del.dataset.gdel);
    if(!g)return;
    if(!(await ask(`Excluir a meta "${g.name}"?`)))return;
    db.goals=db.goals.filter(x=>x.id!==g.id);
    save();renderV13();
  }
};

/* assinaturas */
function renderSubs(){
  const subsAll=(db.bills||[]).filter(b=>b.sub);
  const monthSubs=occ(sel).filter(o=>o.b.sub);
  const monthTotal=monthSubs.reduce((s,o)=>s+o.amount,0);
  const annual=monthSubs.reduce((s,o)=>s+o.amount*12,0);
  let acc=0;
  for(let m=1;m<=parseInt(sel.slice(5,7),10);m++){
    const ym=`${sel.slice(0,4)}-${pad(m)}`;
    occ(ym).forEach(o=>{if(o.b.sub)acc+=o.amount});
  }
  $("subMonth").textContent=money(monthTotal);
  $("subYear").textContent=money(annual);
  $("subAcc").textContent=money(acc);
  $("subList").innerHTML=monthSubs.length
    ?monthSubs.map(o=>`<div class="row"><div class="rmain"><div class="t">${esc(o.b.name)}</div><div class="s">${esc(o.b.category)} · ${money(o.amount)} por mês</div></div></div>`).join("")
    :`<div class="empty">${subsAll.length?"Nenhuma assinatura ativa neste mês":"Em Contas, cadastre uma conta fixa e marque \"É assinatura\""}</div>`;
}

/* gráfico de rosca por categoria */
function renderDonut(){
  const t=totals(sel);
  const byCat={};
  t.items.filter(x=>x.type==="expense").forEach(x=>byCat[x.category]=(byCat[x.category]||0)+x.amount);
  t.bills.forEach(o=>byCat[o.b.category]=(byCat[o.b.category]||0)+o.amount);
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((s,[,v])=>s+v,0);
  if(!total){$("donut").innerHTML=`<div class="empty">Sem despesas neste mês</div>`;return}
  const R=62,C=2*Math.PI*R;
  let off=0;
  const segs=entries.map(([c,v],i)=>{
    const len=v/total*C;
    const s=`<circle r="${R}" cx="90" cy="90" fill="none" stroke="${PAL[i%PAL.length]}" stroke-width="26" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(c)}: ${money(v)}</title></circle>`;
    off+=len;return s;
  }).join("");
  $("donut").innerHTML=`<div class="donutWrap">
    <svg viewBox="0 0 180 180" role="img" aria-label="Distribuição das despesas por categoria">
      <circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--card2)" stroke-width="26"/>${segs}
      <text x="90" y="86" text-anchor="middle" fill="var(--muted)" font-size="11">Total</text>
      <text x="90" y="104" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="700">${esc(money(total))}</text>
    </svg>
    <div class="legend">${entries.map(([c,v],i)=>`<div><i style="background:${PAL[i%PAL.length]}"></i><span>${esc(c)}</span><b class="pct">${Math.round(v/total*100)}%</b></div>`).join("")}</div>
  </div>`;
}

/* comparação mês a mês */
function renderCmp(){
  const data=[5,4,3,2,1,0].map(k=>{const ym=shiftMonth(sel,-k);const t=totals(ym);return {ym,inc:t.inc,exp:t.exp}});
  const max=Math.max(1,...data.map(d=>Math.max(d.inc,d.exp)));
  $("cmp").innerHTML=data.map(d=>`<div class="col" title="${esc(monthLabel(d.ym))}: receitas ${esc(money(d.inc))}, despesas ${esc(money(d.exp))}">
    <div class="pair"><i style="height:${(d.inc/max*100).toFixed(1)}%;background:#3ecf8e"></i><i style="height:${(d.exp/max*100).toFixed(1)}%;background:#e5484d"></i></div>
    <span class="lb">${esc(monthLabel(d.ym).slice(0,3))}</span></div>`).join("");
}

function renderV13(){
  if(!db)return;
  renderDonut();
  renderCmp();
  renderVar();
  renderGoals();
  renderSubs();
}

/* ---------- editar conta fixa, parcelada ou única ---------- */
function openEdit(id){
  const b=db.bills.find(x=>x.id===id);
  if(!b)return;
  const kind=b.kind||"mensal";
  $("eId").value=b.id;
  $("eName").value=b.name;
  $("eAmt").value=fmtValor(b.amount);
  $("eCat").innerHTML=CATS.map(c=>`<option ${c===b.category?"selected":""}>${c}</option>`).join("");
  $("eCard").innerHTML=`<option value="">Sem cartão</option>`+(db.cards||[]).map(c=>`<option value="${esc(c.id)}" ${c.id===b.card?"selected":""}>${esc(c.name)}</option>`).join("");
  const isUnica=kind==="unica", isMensal=kind==="mensal";
  $("eDay").hidden=isUnica;$("eDay").required=!isUnica;
  $("eDay").value=b.day||"";
  $("eDate").hidden=!isUnica;$("eDate").required=isUnica;
  $("eDate").value=b.date||"";
  $("eEndType").hidden=!isMensal;
  $("eEnd").hidden=!(isMensal&&b.end);
  $("eEndType").value=isMensal&&b.end?"until":"forever";
  $("eEnd").value=b.end||"";
  $("eSubBox").hidden=!isMensal;
  $("eSub").checked=!!b.sub;
  $("eNote").hidden=!(kind==="parcelada"||hasHistory(b,sel));
  $("eNote").textContent=kind==="parcelada"
    ?"Parcelamento: dá para alterar nome, valor da parcela, dia, cartão e categoria. Número de parcelas e início não mudam."
    :hasHistory(b,sel)?`Se você mudar o valor, o novo valor vale a partir de ${monthLabel(sel)}. Os meses anteriores continuam como estavam.`:"";
  $("editSheet").hidden=false;
}
$("eEndType").onchange=()=>{$("eEnd").hidden=$("eEndType").value!=="until";if(!$("eEnd").value)$("eEnd").value=mKey(today())};
$("eClose").onclick=()=>{$("editSheet").hidden=true};
$("billsList").addEventListener("click",e=>{
  const btn=e.target.closest("[data-edit]");
  if(btn)openEdit(btn.dataset.edit);
});
$("editForm").onsubmit=e=>{
  e.preventDefault();
  let b=db.bills.find(x=>x.id===$("eId").value);
  if(!b)return;
  const kind=b.kind||"mensal";
  const novo=parseValor($("eAmt").value);
  if(!(novo>0)){showToast(MSG_VALOR);return}
  // Conta fixa com valor novo: o valor vale a partir do mês aberto. A conta antiga termina no mês anterior
  // e uma nova começa agora; os meses passados continuam com o valor que tinham.
  if(kind==="mensal"&&novo!==b.amount&&hasHistory(b,sel)){
    const old=b;
    b={...JSON.parse(JSON.stringify(old)),id:uid(),start:sel,paid:(old.paid||[]).filter(m=>m>=sel)};
    delete b.end;
    old.paid=(old.paid||[]).filter(m=>m<sel);
    old.end=shiftMonth(sel,-1);
    db.bills.push(b);
    db.tx.forEach(t=>{if(t.type==="payment"&&t.ref&&t.ref.kind==="bill"&&t.ref.id===old.id&&t.ref.ym>=sel)t.ref.id=b.id});
  }
  b.name=$("eName").value.trim();
  if(novo!==b.amount)delete b.last;   // valor da parcela mudou: o ajuste de centavos não vale mais
  b.amount=novo;
  b.category=$("eCat").value;
  b.card=$("eCard").value||null;
  if(kind==="unica"){b.date=$("eDate").value}
  else{b.day=Math.min(31,Math.max(1,parseInt($("eDay").value,10)))}
  if(kind==="mensal"){
    if($("eEndType").value==="until"&&$("eEnd").value)b.end=$("eEnd").value;
    else delete b.end;
    if($("eSub").checked)b.sub=true;else delete b.sub;
  }
  save();
  $("editSheet").hidden=true;
  renderAll();
  showToast("Conta atualizada");
};

(async()=>{
  let temDica=false;
  try{temDica=localStorage.getItem("mf_sessao")==="1"}catch(_){}
  if(!temDica){showLock();return}   // nunca entrou neste aparelho: tela de entrada direto
  $("lock").hidden=false;$("lockForm").hidden=true;$("lockSkel").hidden=false;
  try{await startSession();return}
  catch(err){
    if(err&&err.status===401){try{localStorage.removeItem("mf_sessao")}catch(_){}}   // sessão expirou ou foi encerrada
    showLock();
    $("lockErr").textContent=err&&err.status===403
      ?"Este e-mail ainda não tem acesso. Peça ao administrador para liberar."
      :(err&&err.status===401?"":"Não foi possível conectar à nuvem. Tente entrar de novo.");
  }
})();


/* ---------- ações dos botões (delegação; sem handlers inline, compatível com CSP sem unsafe-inline) ---------- */
const ACTIONS={
  delTx:d=>delTx(d.id),
  delBill:d=>delBill(d.id),
  delCard:d=>delCard(d.id),
  delAcc:d=>delAcc(d.id),
  togglePaid:d=>togglePaid(d.id,d.ym),
  abrirRelampago:()=>abrirRelampago(),
  editAcc:d=>abrirEditar("acc",d.id),
  editCard:d=>abrirEditar("card",d.id),
  rlIrCarteira:()=>{$("rlSheet").hidden=true;go("carteira")},
  markFaturaPaid:d=>markFaturaPaid(d.id,d.ym),
};
document.addEventListener("focusout",e=>{            // ao sair do campo de valor, deixa no formato 1.626,76
  const el=e.target;
  if(!el.matches||!el.matches("input[data-money]")||!el.value.trim())return;
  const v=parseValor(el.value,el.hasAttribute("data-neg"));
  if(Number.isFinite(v))el.value=fmtValor(v);
});
document.addEventListener("click",e=>{
  const el=e.target.closest("button[data-act]");
  if(!el)return;
  const fn=ACTIONS[el.dataset.act];
  if(fn)fn(el.dataset);
});
document.addEventListener("change",e=>{
  const el=e.target.closest("input[data-act='setBudget']");
  if(el)setBudget(el.dataset.cat,el.value);
});
