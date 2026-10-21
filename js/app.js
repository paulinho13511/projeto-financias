const CATS=["Alimentação","Moradia","Transporte","Lazer","Saúde","Contas","Educação","Outros"];
const ICATS=["Salário","Freelance","Investimentos"];
const KEY="financas_v2";
const TITLES={inicio:"Início",subs:"Assinaturas",lanc:"Lançamentos",contas:"Contas",cal:"Calendário",rev:"Categorias",ins:"Insights",dicas:"Dicas",metas:"Metas"};
const BRL=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const mKey=s=>s.slice(0,7);
const parts=s=>s.split("-").map(Number);
let privacy=false;
const money=v=>privacy?"R$ ****":BRL.format(v);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const dim=ym=>{const[y,m]=parts(ym);return new Date(y,m,0).getDate()};
const dueOf=(b,ym)=>{
  if(b.kind==="unica")return b.date;
  const[y,m]=parts(ym);return ymd(new Date(y,m-1,Math.min(b.day,dim(ym))));
};
const monthDiff=(a,b)=>{const[ay,am]=parts(a),[by,bm]=parts(b);return (by-ay)*12+(bm-am)};
// Ocorrências de contas num mês: mensal (sempre), parcelada (1/12, 2/12...) ou única (uma vez)
function occ(ym){
  const out=[];
  db.bills.forEach(b=>{
    const kind=b.kind||"mensal";
    if(kind==="unica"){if(mKey(b.date)===ym)out.push({b,amount:b.amount,label:"Única"});return}
    if(kind==="parcelada"){
      const i=monthDiff(b.start,ym);
      if(i>=0&&i<b.parcels)out.push({b,amount:b.amount,label:`${i+1}/${b.parcels}`});
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
const daysBetween=(a,b)=>{const[ay,am,ad]=parts(a),[by,bm,bd]=parts(b);return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/864e5)};
const monthLabel=ym=>{const[y,m]=parts(ym);return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})};
const shiftMonth=(ym,delta)=>{const[y,m]=parts(ym);return ymd(new Date(y,m-1+delta,1)).slice(0,7)};
const fmtDate=(s,long)=>{const[y,m,d]=parts(s);return new Date(y,m-1,d).toLocaleDateString("pt-BR",long?{weekday:"long",day:"numeric",month:"long"}:{day:"2-digit",month:"2-digit"})};

/* ---------- nuvem: Supabase (login por e-mail + acesso controlado no banco) ---------- */
const SB_URL="https://htkrdndcbfnngzlghcjj.supabase.co";
const SB_KEY="sb_publishable_RCdmuHeF4RFa3eoYO-NdNQ_Tr-yhnRo";
const sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
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
  const email=sessionUser.email;
  writeChain=writeChain
    .then(async()=>{
      const expected=dbUpdatedAt;   // lido aqui, dentro da fila, para refletir a gravação anterior
      const nowIso=new Date().toISOString();
      const {data,error}=await sb.from("app_data")
        .update({data:snapshot,updated_by:email,updated_at:nowIso})
        .eq("id",1)
        .eq("updated_at",expected)
        .select("updated_at");
      if(error)throw error;
      if(!data||!data.length){dbConflict=true;throw new Error("conflito")}
      dbUpdatedAt=data[0].updated_at;
    })
    .catch(err=>{
      const now=Date.now();
      if(now-lastSaveErr>4000){
        lastSaveErr=now;
        showToast(dbConflict
          ? "Dados alterados em outro aparelho. Recarregue a página; a última alteração não foi salva."
          : "Não foi possível salvar na nuvem. Verifique a conexão.");
      }
    });
}
async function fetchAccess(email){
  const {data,error}=await sb.from("allowed_emails").select("email,is_admin").eq("email",email).maybeSingle();
  if(error)throw error;
  return data; // null = este e-mail não tem acesso
}
async function fetchData(){
  const {data,error}=await sb.from("app_data").select("data,updated_at").eq("id",1).single();
  if(error)throw error;
  dbUpdatedAt=data.updated_at;dbConflict=false;
  const d=data.data||{};
  d.tx=d.tx||[];d.bills=d.bills||[];d.budgets=d.budgets||{};d.cards=d.cards||[];d.goals=d.goals||[];d.settings=d.settings||{};
  return d;
}

/* ---------- tela de entrada (somente login: contas são criadas pelo administrador) ---------- */
let fails=0,lockedUntil=0;
function showLock(){
  $("lock").hidden=false;
  $("lockForm").hidden=false;$("lockSkel").hidden=true;
  $("pw").value="";
  $("lockErr").textContent="";
}
async function startSession(user){
  const access=await fetchAccess(user.email.toLowerCase());
  if(!access)throw new Error("sem-acesso");
  const data=await fetchData();
  db=data;sessionUser=user;isAdmin=!!access.is_admin;
  enterApp();
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
  document.body.classList.add("locked");
  try{await sb.auth.signOut()}catch(e){}
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
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
    if(error)throw error;
    await startSession(data.user);
    fails=0;
  }catch(err){
    const msg=(err&&err.message)||"";
    if(msg==="sem-acesso"){
      try{await sb.auth.signOut()}catch(_){}
      $("lockErr").textContent="Este e-mail ainda não tem acesso. Peça ao administrador para liberar.";
    }
    else{
      fails++;
      if(fails>=5){lockedUntil=Date.now()+30000;fails=0;$("lockErr").textContent="Muitas tentativas. Aguarde 30 s."}
      else $("lockErr").textContent="E-mail ou senha incorretos.";
    }
  }finally{
    $("lockBtn").disabled=false;
    $("pw").value="";
  }
};
$("lockNow").onclick=()=>lockApp();

/* ---------- chamadas de administrador (função segura no Supabase) ---------- */
async function adminCall(body){
  const {data,error}=await sb.functions.invoke("hyper-api",{body});
  if(error){
    let msg="Não foi possível concluir";
    try{const j=await error.context.json();if(j&&j.error)msg=j.error}catch(e){}
    throw new Error(msg);
  }
  return data;
}

/* ---------- acesso de usuários (somente administrador) ---------- */
function openAcl(){
  $("menu").hidden=true;
  $("aclSheet").hidden=false;
  loadAcl();
}
async function loadAcl(){
  const list=$("aclList");
  list.innerHTML=`<div class="empty">Carregando…</div>`;
  const {data,error}=await sb.from("allowed_emails").select("email,is_admin").order("email");
  if(error){list.innerHTML=`<div class="empty">Não foi possível carregar a lista.</div>`;return}
  list.innerHTML=data.length?data.map(r=>`
    <div class="row"><div class="rmain"><div class="t">${esc(r.email)}</div>
    <div class="s">${r.is_admin?"Administrador":"Pode usar o app"}</div></div>
    ${r.is_admin?"":`<button class="ico" title="Remover acesso" data-rm="${esc(r.email)}">×</button>`}</div>`).join("")
    :`<div class="empty">Nenhum outro e-mail liberado</div>`;
  list.querySelectorAll("[data-rm]").forEach(b=>b.onclick=async()=>{
    const em=b.dataset.rm;
    if(!(await ask(`Remover o acesso de ${em}?`)))return;
    const {error}=await sb.from("allowed_emails").delete().eq("email",em);
    if(error){showToast("Não foi possível remover o acesso");return}
    showToast("Acesso removido");
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
    await adminCall({action:"create",email,password});
    $("aclEmail").value="";$("aclPw").value="";
    showToast("Acesso criado. Envie o e-mail e a senha para a pessoa.");
    loadAcl();
  }catch(err){showToast(err.message||"Não foi possível criar o acesso")}
};

/* ---------- troca de senha pelo próprio usuário ---------- */
$("pwBtn").onclick=()=>{
  $("menu").hidden=true;
  $("newPw").value="";$("newPw2").value="";
  $("pwSheet").hidden=false;
};
$("pwClose").onclick=()=>{$("pwSheet").hidden=true};
$("pwForm").onsubmit=async e=>{
  e.preventDefault();
  const a=$("newPw").value,b=$("newPw2").value;
  if(a.length<10){showToast("A senha precisa ter pelo menos 10 caracteres");return}
  if(a!==b){showToast("As senhas não conferem");return}
  const {error}=await sb.auth.updateUser({password:a});
  if(error){showToast("Não foi possível trocar a senha");return}
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
const sortedTx=()=>[...db.tx].sort((a,b)=>b.date.localeCompare(a.date)||(b.created||0)-(a.created||0));
function totals(ym){
  const items=txOf(ym);
  const bills=occ(ym);
  const inc=items.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const exp=items.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)+bills.reduce((s,o)=>s+o.amount,0);
  return{inc,exp,bal:inc-exp,items,bills};
}
function billStatus(b,ym){
  const paid=(b.paid||[]).includes(ym);
  const due=dueOf(b,ym);
  const d=daysBetween(today(),due);
  if(paid)return{key:"paid",label:"Paga",cls:"ok",due,d};
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
      if(d>prevClose&&d<=close)items.push({desc:`${o.b.name} (${o.label})`,amount:o.amount,date:d});
    });
  });
  return{close,closeYm,due:dueDateOfFatura(card,closeYm),total:items.reduce((s,i)=>s+i.amount,0),items};
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
      if((c.paid||[]).includes(ym))return;
      const f=faturaOf(c,ym);
      if(f.total<=0)return;
      const d=daysBetween(today(),f.due);
      const base={cardId:c.id,closeYm:ym,paidable:true};
      if(d<0)out.push({...base,title:`${c.name}: fatura vencida`,body:`${money(f.total)} venceu em ${fmtDate(f.due)}. Pague logo para evitar juros e multa.`,level:"late"});
      else if(d===0)out.push({...base,title:`${c.name}: fatura vence hoje`,body:`${money(f.total)}. Pague hoje para evitar juros.`,level:"late"});
      else if(d<=3)out.push({...base,title:`${c.name}: fatura vence em ${d} dia(s)`,body:`${money(f.total)} até ${fmtDate(f.due)}`,level:"soon"});
    });
  });
  return out;
}
function markFaturaPaid(cardId,closeYm){
  const c=(db.cards||[]).find(x=>x.id===cardId);if(!c)return;
  c.paid=c.paid||[];
  if(!c.paid.includes(closeYm))c.paid.push(closeYm);
  save();renderAll();showToast("Fatura marcada como paga");
}
async function delCard(id){
  if(!(await ask("Excluir este cartão? As compras já lançadas continuam no histórico.")))return;
  db.cards=(db.cards||[]).filter(c=>c.id!==id);save();renderAll();
}
window.markFaturaPaid=markFaturaPaid;window.delCard=delCard;

function txRow(t){
  const inc=t.type==="income";
  return `<div class="row"><div class="ic ${inc?"":"out"}">${esc(t.category.charAt(0))}</div><div class="rmain"><div class="t">${esc(t.desc)}</div><div class="s">${esc(t.category)} · ${fmtDate(t.date)}</div></div><div class="actions"><span class="amt ${inc?"income":"expense"}">${inc?"+":"−"} ${money(t.amount)}</span><button class="ico" title="Remover" data-act="delTx" data-id="${t.id}">×</button></div></div>`;
}

/* ---------- confirmação própria (o visualizador bloqueia a caixa padrão) ---------- */
function ask(msg){
  return new Promise(resolve=>{
    $("modalMsg").textContent=msg;
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
function animateBars(){
  if(reduceMotion)return;
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
  [...el.children].forEach((child,i)=>{
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
function togglePaid(id,ym){
  const b=db.bills.find(x=>x.id===id);if(!b)return;
  b.paid=b.paid||[];
  const marcou=!b.paid.includes(ym);
  b.paid=b.paid.includes(ym)?b.paid.filter(x=>x!==ym):[...b.paid,ym];
  save();renderAll();
  if(marcou)showToast("Conta marcada como paga");
}
async function delBill(id){
  if(!(await ask("Excluir esta conta? Todas as parcelas dela também serão removidas.")))return;
  db.bills=db.bills.filter(b=>b.id!==id);save();renderAll();
}
async function delTx(id){
  if(!(await ask("Remover este lançamento?")))return;
  db.tx=db.tx.filter(t=>t.id!==id);save();renderAll();
}
function setBudget(cat,val){
  const v=parseFloat(val);
  if(!v||v<=0)delete db.budgets[cat];else db.budgets[cat]=v;
  save();renderAll();
}
window.togglePaid=togglePaid;window.delBill=delBill;window.delTx=delTx;window.setBudget=setBudget;

/* ---------- renderização ---------- */
function populateMonths(){
  const now=mKey(today());
  const set=new Set([now,shiftMonth(now,1),shiftMonth(now,2),sel]);
  db.tx.forEach(t=>set.add(mKey(t.date)));
  const list=[...set].sort().reverse();
  $("month").innerHTML=list.map(k=>`<option value="${k}" ${k===sel?"selected":""}>${monthLabel(k)}</option>`).join("");
}

function renderInicio(){
  const t=totals(sel);
  countUp($("balance"),t.bal);
  $("balance").className="big "+(t.bal<0?"expense":"");
  countUp($("inc"),t.inc);
  countUp($("exp"),t.exp);

  const cur=mKey(today());
  const rem=occ(cur).map(o=>({...o,st:billStatus(o.b,cur)}))
    .filter(x=>x.st.key!=="paid"&&x.st.d<=7)
    .sort((a,b)=>a.st.d-b.st.d);
  const cards=cardAlerts();
  const billRows=rem.map(({b,st,amount,label})=>`
    <div class="row">
      <div class="rmain"><div class="t">${esc(b.name)}<span class="tag">${label}</span><span class="tag ${st.cls}">${st.label}</span></div>
      <div class="s">Vence em ${fmtDate(st.due,true)} · ${money(amount)}</div></div>
      <button class="ghost" data-act="togglePaid" data-id="${b.id}" data-ym="${cur}">Marcar paga</button>
    </div>`).join("");
  const cardRows=cards.map(c=>`
    <div class="row">
      <div class="rmain"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.body)}</div></div>
      ${c.paidable?`<button class="ghost" data-act="markFaturaPaid" data-id="${c.cardId}" data-ym="${c.closeYm}">Marcar paga</button>`:""}
    </div>`).join("");
  $("reminders").innerHTML=(billRows+cardRows)||`<div class="empty">Nenhum lembrete nos próximos dias</div>`;

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
    <div class="notif"><div class="app-n">Minhas Finanças · agora</div>
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
  const dot=`<line x1="${xs(idx).toFixed(1)}" y1="${P}" x2="${xs(idx).toFixed(1)}" y2="${H-P}" stroke="#ffffff40" stroke-dasharray="3 3"/><circle cx="${xs(idx).toFixed(1)}" cy="${ys(cum[idx]).toFixed(1)}" r="6" fill="#8b5cf6" stroke="#13151c" stroke-width="3"/>`;
  $("spendChart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos acumulados no mês">
    <defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".42"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#gArea)"/>
    <path d="${line}" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
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


function renderNext(){
  const cur=mKey(today());
  const list=occ(cur).map(o=>({...o,st:billStatus(o.b,cur)}))
    .filter(x=>x.st.key!=="paid").sort((a,b)=>a.st.d-b.st.d);
  const el=$("nextBill");
  if(!list.length){
    el.innerHTML=`<div class="muted">Próxima conta</div><div class="nx-empty">Nenhuma conta em aberto neste mês</div>`;
    return;
  }
  const {b,st,amount,label}=list[0];
  el.innerHTML=`<div class="muted">Próxima conta</div>
    <div class="nx-title">${esc(b.name)} <span class="tag">${label}</span></div>
    <div class="nx-row"><span class="nx-amt">${money(amount)}</span><span class="tag ${st.cls}">${st.label}</span></div>
    <div class="muted">Vence em ${fmtDate(st.due,true)}</div>`;
}


function renderContas(){
  $("billMonthLabel").textContent=monthLabel(sel);
  let total=0,paid=0;
  const rows=occ(sel).map(({b,amount,label})=>{
    const st=billStatus(b,sel);
    total+=amount;if(st.key==="paid")paid+=amount;
    const compra=b.kind==="parcelada"?` · compra de ${money(b.amount*b.parcels)}`:"";
    return `<div class="row">
      <div class="rmain"><div class="t">${esc(b.name)}<span class="tag">${label}</span><span class="tag ${st.cls}">${st.label}</span></div>
      <div class="s">${money(amount)} · vence ${fmtDate(st.due)}${compra} · ${esc(b.category)}</div></div>
      <div class="actions">
        <button class="ghost" data-act="togglePaid" data-id="${b.id}" data-ym="${sel}">${st.key==="paid"?"Desfazer":"Marcar paga"}</button>
        <button class="ico" title="Editar" data-edit="${esc(b.id)}" aria-label="Editar conta">✎</button>
        <button class="ico" title="Excluir" data-act="delBill" data-id="${b.id}">×</button>
      </div></div>`;
  }).join("");
  const debt=db.bills.reduce((s,b)=>s+remainingAfter(b,sel)*b.amount,0);
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
    <input type="number" min="0" step="50" style="width:140px;text-align:right" value="${db.budgets[c]||""}" placeholder="sem limite" data-act="setBudget" data-cat="${esc(c)}"></div>`).join("");

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

function renderIns(){
  const cur=totals(sel);
  const prevK=shiftMonth(sel,-1);
  const prev=totals(prevK);
  const diff=prev.exp?((cur.exp-prev.exp)/prev.exp)*100:null;
  const now=mKey(today());
  const days=sel===now?Math.max(1,parseInt(today().slice(8,10),10)):dim(sel);
  const avg=cur.exp/days;
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
    <div class="card"><h2>Insights</h2>
      ${tips.map(x=>`<div class="tip"><p>${esc(x)}</p></div>`).join("")}
    </div>`;
}

function renderAll(){
  populateMonths();
  renderCardChips();
  renderInicio();
  renderChart();
  renderNext();
  renderFeed();
  renderContas();
  renderCal();
  renderRev();
  renderHist();
  renderIns();
  renderCards();
  populateCardSelects();
  renderV13();
  stagger($("reminders"));
  stagger($("notifs"));
  stagger($("recent"));
  stagger($("billsList"));
  stagger($("catList"));
  stagger($("top"));
  stagger($("insBody"),80);
  stagger($("calGrid"),10);
}

function renderCards(){
  const cards=db.cards||[];
  $("cardList").innerHTML=cards.length?cards.map(c=>{
    const cy=currentCloseYm(c), open=faturaOf(c,cy);
    const pendingYm=shiftMonth(cy,-1), pend=faturaOf(c,pendingYm);
    const pendingOpen=!(c.paid||[]).includes(pendingYm)&&pend.total>0;
    return `<div class="row"><div class="rmain">
      <div class="t">${esc(c.name)}</div>
      <div class="s">Fatura aberta: ${money(open.total)} · fecha ${fmtDate(open.close)} · vence ${fmtDate(open.due)}</div>
      ${pendingOpen?`<div class="s warn">Fatura fechada: ${money(pend.total)} · vence ${fmtDate(pend.due)}</div>`:""}
      </div><div class="actions">
      ${pendingOpen?`<button class="ghost" data-act="markFaturaPaid" data-id="${c.id}" data-ym="${pendingYm}">Marcar paga</button>`:""}
      <button class="ico" title="Excluir cartão" data-act="delCard" data-id="${c.id}">×</button></div></div>`;
  }).join(""):`<div class="empty">Cadastre seus cartões para acompanhar as faturas</div>`;
}
function populateCardSelects(){
  const opts=`<option value="">Sem cartão</option>`+(db.cards||[]).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("txCard").innerHTML=opts;
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
  const view=v==="metas"?"ins":v;   // Metas fica dentro de Insights (card "Metas e caixinhas")
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="v-"+view));
  document.querySelectorAll("[data-nav]").forEach(x=>x.classList.toggle("on",x.dataset.nav===v&&!x.classList.contains("sideNew")));
  $("pageTitle").textContent=TITLES[v]||"Início";
  $("menu").hidden=true;
  window.scrollTo({top:0,behavior:"auto"});
  if(v==="metas")requestAnimationFrame(()=>$("goalCard").scrollIntoView({block:"start",behavior:"smooth"}));
}
document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$("navMais").onclick=()=>{$("menu").hidden=false};
$("menuBtn").onclick=()=>{$("menu").hidden=false};
$("menuClose").onclick=()=>{$("menu").hidden=true};
$("menu").onclick=e=>{if(e.target.id==="menu")$("menu").hidden=true};

$("month").onchange=e=>{sel=e.target.value;renderAll()};
$("search").oninput=renderFeed;
$("filterType").onchange=renderFeed;

function updateTxParc(){
  const parc=$("txParc").value==="parc";
  $("txParcBox").hidden=!parc;
  $("txParcels").required=parc;
  const n=parseInt($("txParcels").value,10)||0, a=parseFloat($("txAmt").value)||0;
  $("txParcInfo").textContent=parc&&n>0&&a>0?`${n}x de ${money(a/n)}`:"";
}
$("txForm").onsubmit=e=>{
  e.preventDefault();
  const type=document.querySelector('input[name="type"]:checked').value;
  const date=$("txDate").value;
  const desc=$("txDesc").value.trim(), amount=parseFloat($("txAmt").value);
  const category=$("txCat").value, card=$("txCard").value||null;
  if($("txParc").value==="parc"){
    if(type==="income"){showToast("Parcelamento só vale para despesas");return}
    const n=Math.min(120,Math.max(2,parseInt($("txParcels").value,10)));
    db.bills.push({id:uid(),kind:"parcelada",name:desc,amount:Math.round(amount/n*100)/100,parcels:n,start:mKey(date),day:parseInt(date.slice(8,10),10),category,card,paid:[]});
    showToast(`Compra parcelada em ${n}x cadastrada`);
  }else{
    db.tx.push({id:uid(),type,desc,amount,date,category,card,created:Date.now()});
    showToast("Lançamento adicionado");
  }
  save();
  e.target.reset();
  $("txDate").value=today();
  updateTxParc();
  sel=mKey(date);
  renderAll();
};

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
  const a=parseFloat($("bAmt").value)||0, n=parseInt($("bParcels").value,10)||0;
  const box=$("parcTotal");
  box.hidden=!(kind==="parcelada"&&a>0&&n>0);
  box.textContent=`Total da compra: ${money(a*n)} em ${n} parcelas de ${money(a)}`;
}
$("billForm").onsubmit=e=>{
  e.preventDefault();
  const kind=document.querySelector('input[name="kind"]:checked').value;
  const b={id:uid(),kind,name:$("bName").value.trim(),amount:parseFloat($("bAmt").value),category:$("bCat").value,card:$("bCard").value||null,paid:[]};
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
const VAPID_PUBLIC="BHf5RmIEowZkC5Nb8ONCW1N57VtopLk-PjE6FePRKvIlfpgCKN1WatRQY9OmDDVhAylk_wRhp-Srfsh6cJyeQMo";
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
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(VAPID_PUBLIC)});
    const j=sub.toJSON();
    const {error}=await sb.from("push_subscriptions").upsert({
      endpoint:j.endpoint,
      email:sessionUser.email.toLowerCase(),
      p256dh:j.keys.p256dh,
      auth:j.keys.auth
    },{onConflict:"endpoint"});
    if(error)throw error;
    showToast("Notificações ativadas neste aparelho");
  }catch(err){
    showToast("Não foi possível ativar as notificações");
  }
};

/* ---------- inicialização ---------- */
$("txCat").innerHTML=[...new Set([...CATS,...ICATS])].map(c=>`<option>${c}</option>`).join("");
$("bCat").innerHTML=CATS.map(c=>`<option>${c}</option>`).join("");
$("txDate").value=today();
document.querySelectorAll('input[name="kind"]').forEach(r=>r.onchange=syncBillForm);
["bAmt","bParcels","bStart"].forEach(id=>$(id).addEventListener("input",updateParcTotal));
syncBillForm();
$("bEndType").onchange=syncBillForm;
$("txParc").onchange=updateTxParc;
$("txParcels").addEventListener("input",updateTxParc);
$("txAmt").addEventListener("input",updateTxParc);
/* ---------- v13: privacidade, atalhos, filtros, exportação/importação, metas, renda variável, assinaturas, gráficos ---------- */
const PAL=["#8b5cf6","#a78bfa","#ffb86b","#f87171","#b58cff","#7bd389","#fbbf24","#8a8fa3"];
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

/* atalhos: lançamentos mais usados */
function renderQuick(){
  const freq={};
  db.tx.filter(t=>t.type==="expense").forEach(t=>{
    const k=t.desc.trim();if(!k)return;
    const f=freq[k]||{desc:k,cat:t.category,amt:t.amount,n:0};
    f.n++;f.cat=t.category;f.amt=t.amount;freq[k]=f;
  });
  const top=Object.values(freq).sort((a,b)=>b.n-a.n).slice(0,6);
  $("quick").innerHTML=top.length
    ?top.map((f,i)=>`<button type="button" class="chip" data-q="${i}">${esc(f.desc)}</button>`).join("")
    :`<span class="muted" style="font-size:13px">Seus lançamentos mais usados aparecem aqui</span>`;
  $("quick").querySelectorAll("[data-q]").forEach(b=>b.onclick=()=>{
    const f=top[+b.dataset.q];
    $("txDesc").value=f.desc;
    if([...$("txCat").options].some(o=>o.value===f.cat))$("txCat").value=f.cat;
    $("txAmt").value=f.amt;
    $("txAmt").focus();
  });
}

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

/* exportação: CSV e PDF do mês */
function monthRows(ym){
  return [
    ...txOf(ym).map(t=>({date:t.date,desc:t.desc,cat:t.category,type:t.type,amount:t.amount,card:cardName(t.card)})),
    ...occ(ym).map(o=>({date:dueOf(o.b,ym),desc:`${o.b.name} (${o.label})`,cat:o.b.category,type:"expense",amount:o.amount,card:cardName(o.b.card)}))
  ].sort((a,b)=>a.date.localeCompare(b.date));
}
$("csvBtn").onclick=()=>{
  const q=v=>{let s=String(v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};
  const lines=["Data;Descrição;Categoria;Tipo;Valor;Cartão",
    ...monthRows(sel).map(r=>[brDate(r.date),q(r.desc),q(r.cat),r.type==="income"?"Receita":"Despesa",r.amount.toFixed(2).replace(".",","),q(r.card)].join(";"))];
  const blob=new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`financas-${sel}.csv`;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
};
$("pdfBtn").onclick=()=>{
  const t=totals(sel);
  const body=monthRows(sel).map(r=>`<tr><td>${brDate(r.date)}</td><td>${esc(r.desc)}</td><td>${esc(r.cat)}</td><td>${r.type==="income"?"Receita":"Despesa"}</td><td class="n">${BRL.format(r.amount)}</td></tr>`).join("");
  $("printArea").innerHTML=`<h2>Extrato de ${esc(monthLabel(sel))}</h2>
    <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th class="n">Valor</th></tr></thead>
    <tbody>${body||'<tr><td colspan="5">Sem lançamentos</td></tr>'}</tbody></table>
    <p style="margin-top:14px"><b>Receitas:</b> ${BRL.format(t.inc)} · <b>Despesas:</b> ${BRL.format(t.exp)} · <b>Saldo:</b> ${BRL.format(t.bal)}</p>`;
  window.print();
};

/* importação de extrato: OFX ou CSV, com revisão antes de salvar */
function parseOFX(text){
  const out=[];
  const blocks=text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)||[];
  blocks.forEach(b=>{
    const g=tag=>{const m=b.match(new RegExp("<"+tag+">([^<\\r\\n]*)","i"));return m?m[1].trim():""};
    const d=g("DTPOSTED"), amt=parseFloat(g("TRNAMT").replace(",","."));
    const desc=(g("MEMO")||g("NAME")||"Transação").replace(/\s+/g," ");
    if(!/^\d{8}/.test(d)||isNaN(amt))return;
    out.push({date:`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`,desc,amount:Math.abs(amt),type:amt<0?"expense":"income"});
  });
  return out;
}
function parseDateBR(s){
  let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(m)return `${m[3]}-${m[2]}-${m[1]}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
function parseMoneyBR(s){
  let v=s.replace(/[R$\s]/g,"");
  if(v.includes(","))v=v.replace(/\./g,"").replace(",",".");
  return parseFloat(v);
}
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length)return [];
  const delim=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?";":",";
  const cells=l=>l.split(delim).map(c=>c.trim().replace(/^"|"$/g,""));
  const head=cells(lines[0]).map(h=>h.toLowerCase());
  const iD=head.findIndex(h=>/data|date/.test(h));
  const iDesc=head.findIndex(h=>/descri|hist|memo|nome|name/.test(h));
  const iV=head.findIndex(h=>/valor|amount|value/.test(h));
  if(iD<0||iV<0)return null;
  return lines.slice(1).map(l=>{
    const c=cells(l);
    const date=parseDateBR(c[iD]||""), amt=parseMoneyBR(c[iV]||"");
    return date&&!isNaN(amt)?{date,desc:(c[iDesc]||"Transação"),amount:Math.abs(amt),type:amt<0?"expense":"income"}:null;
  }).filter(Boolean);
}
let impRows=[];
$("impFile").onchange=async e=>{
  const f=e.target.files[0];
  if(!f)return;
  const text=await f.text();
  const rows=/<STMTTRN>/i.test(text)?parseOFX(text):parseCSV(text);
  if(!rows||!rows.length){
    showToast("Não encontrei lançamentos neste arquivo");
    $("impBox").hidden=true;impRows=[];return;
  }
  impRows=rows.map(r=>({...r,on:true}));
  renderImport();
};
function renderImport(){
  const box=$("impBox");
  box.hidden=false;
  box.innerHTML=`<p class="muted" style="font-size:13px;margin:12px 0 8px">${impRows.length} lançamentos encontrados. Desmarque o que não quer importar.</p>
    <div class="list">${impRows.map((r,i)=>`<label class="row imp"><input type="checkbox" data-i="${i}" ${r.on?"checked":""}><div class="rmain"><div class="t">${esc(r.desc)}</div><div class="s">${brDate(r.date)} · ${r.type==="income"?"Receita":"Despesa"}</div></div><div class="amt ${r.type==="income"?"income":"expense"}">${money(r.amount)}</div></label>`).join("")}</div>
    <div class="btnrow" style="margin-top:12px"><button class="ghost" id="impCancel" type="button">Cancelar</button><button class="primary" id="impOk" type="button">Importar selecionados</button></div>`;
  box.querySelectorAll("[data-i]").forEach(c=>c.onchange=()=>{impRows[+c.dataset.i].on=c.checked});
  $("impCancel").onclick=()=>{box.hidden=true;impRows=[];$("impFile").value=""};
  $("impOk").onclick=()=>{
    let added=0,skipped=0;
    impRows.filter(r=>r.on).forEach(r=>{
      const dup=db.tx.some(t=>t.date===r.date&&Math.abs(t.amount-r.amount)<0.005&&t.desc===r.desc);
      if(dup){skipped++;return}
      db.tx.push({id:uid(),type:r.type,desc:r.desc,amount:r.amount,date:r.date,category:"Outros",card:null,created:Date.now()});
      added++;
    });
    save();
    box.hidden=true;impRows=[];$("impFile").value="";
    renderAll();
    showToast(`${added} importados${skipped?`, ${skipped} já existiam`:""}`);
  };
}

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
      ${done?"":`<div class="gr"><input type="number" step="0.01" min="0.01" placeholder="Guardar agora (R$)" data-gin="${esc(g.id)}"><button class="ghost" type="button" data-gadd="${esc(g.id)}">Guardar</button></div>`}
    </div>`;
  }).join(""):`<div class="empty">Crie uma meta: reserva de emergência, viagem, troca de celular...</div>`;
}
$("goalForm").onsubmit=e=>{
  e.preventDefault();
  const name=$("gName").value.trim(), target=parseFloat($("gTarget").value), deadline=$("gDeadline").value;
  if(!name||!(target>0)||!deadline){showToast("Preencha nome, valor e prazo");return}
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
    const v=parseFloat(input.value);
    if(!(v>0)){showToast("Digite um valor");return}
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
    ?monthSubs.map(o=>`<div class="row"><div class="rmain"><div class="t">${esc(o.b.name)}</div><div class="s">${esc(o.b.category)} · ${money(o.amount)} por mês · ${money(o.amount*12)} por ano</div></div></div>`).join("")
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
    <div class="pair"><i style="height:${(d.inc/max*100).toFixed(1)}%;background:#8b5cf6"></i><i style="height:${(d.exp/max*100).toFixed(1)}%;background:#f87171"></i></div>
    <span class="lb">${esc(monthLabel(d.ym).slice(0,3))}</span></div>`).join("");
}

function renderV13(){
  if(!db)return;
  renderQuick();
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
  $("eAmt").value=b.amount;
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
  $("eNote").hidden=kind!=="parcelada";
  $("eNote").textContent=kind==="parcelada"?"Parcelamento: dá para alterar nome, valor da parcela, dia, cartão e categoria. Número de parcelas e início não mudam.":"";
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
  const b=db.bills.find(x=>x.id===$("eId").value);
  if(!b)return;
  const kind=b.kind||"mensal";
  b.name=$("eName").value.trim();
  b.amount=parseFloat($("eAmt").value);
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
  let session=null;
  try{session=(await sb.auth.getSession()).data.session}catch(e){}
  if(session){
    $("lock").hidden=false;$("lockForm").hidden=true;$("lockSkel").hidden=false;
    try{await startSession(session.user);return}
    catch(err){
      if(err&&err.message==="sem-acesso"){try{await sb.auth.signOut()}catch(_){}}
      showLock();
      $("lockErr").textContent=err&&err.message==="sem-acesso"
        ?"Este e-mail ainda não tem acesso. Peça ao administrador para liberar."
        :"Não foi possível conectar à nuvem. Tente entrar de novo.";
      return;
    }
  }
  showLock();
})();


/* ---------- ações dos botões (delegação; sem handlers inline, compatível com CSP sem unsafe-inline) ---------- */
const ACTIONS={
  delTx:d=>delTx(d.id),
  delBill:d=>delBill(d.id),
  delCard:d=>delCard(d.id),
  togglePaid:d=>togglePaid(d.id,d.ym),
  markFaturaPaid:d=>markFaturaPaid(d.id,d.ym),
};
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
