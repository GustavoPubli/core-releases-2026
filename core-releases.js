const catalogResponse=await fetch(new URL("releases.json",document.baseURI));
if(!catalogResponse.ok)throw new Error("Falha ao carregar o catálogo: "+catalogResponse.status);
const CATALOG=await catalogResponse.json();
const CATALOG_META=Object.freeze({...CATALOG.meta});
const RAW_RELEASES=CATALOG.releases;



const MESES=["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
const CURTOS=["","JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

/* ---------- helpers ---------- */
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const clean=s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[×✕✖]/g,"x").replace(/\$/g,"s").replace(/&/g," and ");
const norm=s=>clean(s).replace(/[^a-z0-9]+/g,"");
const normA=s=>norm(s).replace(/^the/,"");
const toks=s=>clean(s).split(/[^a-z0-9]+/).filter(w=>w.length>1);
const reEsc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOB=matchMedia("(hover:none)").matches; /* app mobile do Spotify não entende o sufixo /albums no deep-link */
const finePtr=matchMedia("(hover:hover) and (pointer:fine)").matches;
const AUDIT=/[?&]audit/.test(location.search);

function overlapScore(cand,target){
  const T=new Set(toks(target));if(!T.size)return 0;
  const C=new Set(toks(cand));let hit=0;T.forEach(w=>{if(C.has(w))hit++});
  return hit/T.size;
}
function titleStrict(cand,target){
  const c=norm(cand),t=norm(target);
  if(!c||!t)return false;
  if(c===t)return true;
  if(t.length>=4&&c.includes(t))return true;
  if(c.length>=4&&t.includes(c))return true;
  return false;
}
function titleLoose(cand,target){
  if(titleStrict(cand,target))return true;
  return overlapScore(cand,target)>=0.6;
}
function artistOk(cand,target){return normA(cand)===normA(target);}
function legacyKey(r){return norm(r.a)+"|"+norm(r.t)}
const R=Object.freeze(RAW_RELEASES.map((record,i)=>Object.freeze({...record,id:record.id||legacyKey(record),i,m:parseInt(record.d.slice(3),10)})));
function key(r){return r.id}
const CACHE_KEY="core-releases-runtime-cache-v1",CACHE_TTL=7*24*60*60*1000;
const validHttps=value=>{try{return new URL(value).protocol==="https:"}catch(e){return false}};
function loadRuntimeCache(){
  if(AUDIT)return Object.create(null);
  try{
    const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
    if(!parsed||parsed.expires<Date.now()||!parsed.entries||typeof parsed.entries!=="object")return Object.create(null);
    return parsed.entries;
  }catch(e){return Object.create(null)}
}
const cachedRuntime=loadRuntimeCache();
const runtimeState=new Map(R.map(r=>{
  const cached=cachedRuntime[r.id]||{},state={artState:0};
  for(const field of ["cover","link","seed","sp","yt","deezer"]){if(validHttps(cached[field]))state[field]=cached[field]}
  return[r.id,state];
}));
const stateOf=r=>runtimeState.get(r.id);
let cacheWriteTimer=0;
function persistRuntimeSoon(){
  if(AUDIT)return;
  clearTimeout(cacheWriteTimer);
  cacheWriteTimer=setTimeout(()=>{
    const entries=Object.create(null);
    R.forEach(r=>{
      const state=stateOf(r),saved={};
      for(const field of ["cover","link","seed","sp","yt","deezer"]){if(validHttps(state[field]))saved[field]=state[field]}
      if(Object.keys(saved).length)entries[r.id]=saved;
    });
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({expires:Date.now()+CACHE_TTL,entries}))}catch(e){}
  },250);
}
const dateBits=String(CATALOG_META.updated||"").split("-");
const cutoffDisplay=dateBits.length===3?dateBits[2]+"."+dateBits[1]+"."+dateBits[0]:"";
const versionDisplay=dateBits.length===3?"v"+dateBits[2]+"."+dateBits[1]+"."+dateBits[0].slice(-2)+" · atualizado":"";
if(versionDisplay)document.getElementById("version-marker").textContent=versionDisplay;
if(cutoffDisplay)document.getElementById("cutoff-date").textContent=cutoffDisplay;
const USER_STATE_KEY="core-releases-user-state-v1";
function emptyUserState(){
  return {listened:Object.create(null),ratings:Object.create(null),filters:{format:"all",listened:"all",rating:"all"}};
}
function loadUserState(){
  const state=emptyUserState();
  try{
    const parsed=JSON.parse(localStorage.getItem(USER_STATE_KEY)||"null");
    if(!parsed||typeof parsed!=="object")return state;
    if(parsed.listened&&typeof parsed.listened==="object")Object.entries(parsed.listened).forEach(([k,v])=>{if(v===true)state.listened[k]=true});
    if(parsed.ratings&&typeof parsed.ratings==="object")Object.entries(parsed.ratings).forEach(([k,v])=>{const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=5)state.ratings[k]=n});
    const f=parsed.filters&&typeof parsed.filters==="object"?parsed.filters:{};
    if(["all","alb","ep","oth"].includes(f.format))state.filters.format=f.format;
    if(["all","listened","unlistened"].includes(f.listened))state.filters.listened=f.listened;
    if(["all","unrated","1","2","3","4","5"].includes(String(f.rating)))state.filters.rating=String(f.rating);
  }catch(e){}
  return state;
}
let userState=loadUserState();
function saveUserState(){try{localStorage.setItem(USER_STATE_KEY,JSON.stringify(userState))}catch(e){}}
function isListened(r){return userState.listened[key(r)]===true}
function releaseRating(r){return Number(userState.ratings[key(r)])||0}
function deezerReleaseLink(r){
  const direct=r.deezer||stateOf(r).deezer;
  if(direct)return direct;
  return deezerDirectLink(r.sourceLink);
}
/* ---------- icons ---------- */
const IC={
sp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M7.4 9.7c3.1-.9 6.6-.7 9.4.8"/><path d="M8 12.5c2.5-.7 5.3-.5 7.6.7"/><path d="M8.6 15.2c2-.5 4-.4 5.8.5"/></svg>',
dz:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="17.2" y="3.5" width="4.2" height="3"/><rect x="17.2" y="8" width="4.2" height="3"/><rect x="10.2" y="8" width="4.2" height="3"/><rect x="17.2" y="12.5" width="4.2" height="3"/><rect x="10.2" y="12.5" width="4.2" height="3"/><rect x="3.2" y="12.5" width="4.2" height="3"/><rect x="17.2" y="17" width="4.2" height="3"/><rect x="10.2" y="17" width="4.2" height="3"/><rect x="3.2" y="17" width="4.2" height="3"/></svg>',
yt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.9" stroke-width="1.3"/><path d="M10.6 9.9l3.6 2.1-3.6 2.1z" fill="currentColor" stroke="none"/></svg>'
};

/* ---------- render ---------- */
const app=document.getElementById("app");
const groups={};
R.forEach(r=>{
  (groups[r.m]=groups[r.m]||[]).push(r);
});
Object.values(groups).forEach(list=>list.sort((a,b)=>dateKey(a)-dateKey(b)||a.i-b.i));
const months=Object.keys(groups).map(Number).sort((a,b)=>a-b);
const SORT_KEY="core-releases-sort-order";
let sortDir="asc";
try{
  const savedSort=localStorage.getItem(SORT_KEY);
  if(savedSort==="asc"||savedSort==="desc")sortDir=savedSort;
}catch(e){}
function dateKey(r){
  const p=r.d.split("/").map(Number);
  return (p[1]||0)*100+(p[0]||0);
}
function monthOrder(){
  return months.slice().sort((a,b)=>sortDir==="desc"?b-a:a-b);
}
function compareReleaseNodes(a,b){
  const ra=R[+a.dataset.i],rb=R[+b.dataset.i];
  const d=dateKey(ra)-dateKey(rb);
  return sortDir==="desc"?(d? -d:ra.i-rb.i):(d?d:ra.i-rb.i);
}
function syncDockOrder(){
  const d=document.getElementById("dock");if(!d)return;
  const keep=t=>d.querySelector(t);
  const top=keep('[data-target="#top0"]'),sep=keep(".sep"),sug=keep('[data-target="#sugira"]'),ig=keep('[data-url]');
  if(top)d.appendChild(top);
  monthOrder().forEach(m=>{const b=keep('[data-target="#m'+m+'"]');if(b)d.appendChild(b)});
  [sep,sug,ig].forEach(x=>{if(x)d.appendChild(x)});
}
function applySortOrder(){
  monthOrder().forEach(m=>{
    const sec=document.getElementById("m"+m);if(!sec)return;
    const grid=sec.querySelector(".grid");
    if(grid)[...grid.querySelectorAll(".card")].sort(compareReleaseNodes).forEach(el=>grid.appendChild(el));
    app.appendChild(sec);
  });
  syncDockOrder();
}

function platHTML(r){
  const enc=encodeURIComponent((r.a+" "+r.t.replace(/[|]/g," ")).replace(/\s+/g," ").trim());
  const dz=deezerReleaseLink(r),state=stateOf(r);
  const spotify=state.sp||("https://open.spotify.com/search/"+enc+(MOB?"":"/albums"));
  const youtube=state.yt||("https://music.youtube.com/search?q="+enc);
  return '<div class="plat">'
    +'<a class="p-sp" target="_blank" rel="noopener" href="'+spotify+'" title="'+(state.sp?"Abrir álbum no Spotify":"Buscar no Spotify")+'" aria-label="Spotify: '+esc(r.a+" "+r.t)+'">'+IC.sp+"</a>"
    +'<a class="p-dz" target="_blank" rel="noopener" href="'+(dz||"https://www.deezer.com/search/"+enc+"/album")+'" title="'+(dz?"Abrir álbum no Deezer":"Buscar no Deezer")+'" aria-label="Deezer: '+esc(r.a+" "+r.t)+'">'+IC.dz+"</a>"
    +'<a class="p-yt" target="_blank" rel="noopener" href="'+youtube+'" title="'+(state.yt?"Abrir no YouTube Music":"Buscar no YouTube Music")+'" aria-label="YouTube Music: '+esc(r.a+" "+r.t)+'">'+IC.yt+"</a>"
  +"</div>";
}
function preferenceControlsHTML(r){
  const listened=isListened(r),rating=releaseRating(r),label=esc(r.a+" · "+r.t);
  const stars=[1,2,3,4,5].map(n=>'<button type="button" class="rating-star'+(n<=rating?' is-on':'')+'" data-rating="'+n+'" role="radio" aria-checked="'+(n===rating)+'" tabindex="'+((rating===n)||(!rating&&n===1)?0:-1)+'" aria-label="'+n+' de 5 estrelas para '+label+'" title="'+n+' de 5 estrelas"><span aria-hidden="true">★</span></button>').join("");
  return '<button type="button" class="listen-toggle" aria-pressed="'+listened+'" aria-label="'+(listened?'Marcar como não escutado: ':'Marcar como escutado: ')+label+'" title="'+(listened?'Escutado':'Marcar como escutado')+'"><span class="checkmark" aria-hidden="true">✓</span></button>'
    +'<div class="rating-control" role="radiogroup" aria-label="Avaliação de '+label+'">'+stars+'</div>';
}
function cardHTML(r){
  return '<article class="card rv'+(isListened(r)?' is-listened':'')+'" data-i="'+r.i+'" data-user-key="'+esc(key(r))+'">'
    +'<div class="discwrap" title="'+esc(r.a+" — "+r.t)+'">'
      +'<div class="vpos"><div class="vinyl"><span class="vlabel"></span></div></div>'
      +'<div class="sleeve loading"><span class="shim"></span>'
        +(r.note?'<span class="chip">'+esc(r.note)+"</span>":"")
        +preferenceControlsHTML(r)
        +'<img alt="Capa de '+esc(r.t)+' — '+esc(r.a)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
      +"</div>"
    +"</div>"
    +'<div class="info">'
      +'<div class="dline"><span class="dt">'+r.d.replace("/",".")+'</span><span class="rule"></span><span class="ktag">'+esc(r.k)+"</span></div>"
      +'<h3 class="artist">'+esc(r.a)+"</h3>"
      +'<p class="album">'+esc(r.t)+"</p>"
      +'<p class="genre">'+esc(r.g)+"</p>"
      +platHTML(r)
    +"</div>"
  +"</article>";
}
let html="";
for(const m of months){
  const list=groups[m];
  html+='<section class="mo" id="m'+m+'" data-m="'+m+'">'
    +'<div class="mh"><span class="ghost" aria-hidden="true">'+String(m).padStart(2,"0")+"</span>"
    +'<h2>'+MESES[m]+'<span class="mcount">· '+list.length+" registros</span></h2></div>"
    +'<div class="grid">'+list.map(cardHTML).join("")+"</div></section>";
}
app.innerHTML=html;

function syncCardPreference(card,r){
  const listened=isListened(r),rating=releaseRating(r),label=r.a+" · "+r.t;
  card.classList.toggle("is-listened",listened);
  const listen=card.querySelector(".listen-toggle");
  if(listen){
    listen.setAttribute("aria-pressed",listened);
    listen.setAttribute("aria-label",(listened?"Marcar como não escutado: ":"Marcar como escutado: ")+label);
    listen.title=listened?"Escutado":"Marcar como escutado";
  }
  card.querySelectorAll(".rating-star").forEach(star=>{
    const value=Number(star.dataset.rating);
    star.classList.toggle("is-on",value<=rating);
    star.setAttribute("aria-checked",value===rating);
    star.tabIndex=(value===rating||(!rating&&value===1))?0:-1;
  });
}
function setReleaseRating(card,r,value){
  const k=key(r);
  if(value)userState.ratings[k]=value;else delete userState.ratings[k];
  saveUserState();syncCardPreference(card,r);applyFilters();
}
app.addEventListener("click",e=>{
  const listen=e.target.closest(".listen-toggle");
  if(listen){
    e.preventDefault();e.stopPropagation();
    const card=listen.closest(".card"),r=R[+card.dataset.i],k=key(r);
    if(isListened(r))delete userState.listened[k];else userState.listened[k]=true;
    saveUserState();syncCardPreference(card,r);applyFilters();return;
  }
  const star=e.target.closest(".rating-star");
  if(star){
    e.preventDefault();e.stopPropagation();
    const card=star.closest(".card"),r=R[+card.dataset.i],value=Number(star.dataset.rating);
    setReleaseRating(card,r,releaseRating(r)===value?0:value);
  }
});
app.addEventListener("keydown",e=>{
  const star=e.target.closest(".rating-star");if(!star||!["ArrowLeft","ArrowDown","ArrowRight","ArrowUp","Home","End"].includes(e.key))return;
  e.preventDefault();e.stopPropagation();
  const card=star.closest(".card"),r=R[+card.dataset.i];
  let value=releaseRating(r)||1;
  if(e.key==="Home")value=1;else if(e.key==="End")value=5;else value=Math.max(1,Math.min(5,value+(["ArrowRight","ArrowUp"].includes(e.key)?1:-1)));
  setReleaseRating(card,r,value);
  card.querySelector('.rating-star[data-rating="'+value+'"]').focus();
});

/* marquee */
(function(){
  const genres=[...new Set(R.flatMap(r=>(r.g||"")
    .split("/")
    .map(x=>x.trim())
    .filter(Boolean)))];
  const seq=genres.join(" ✚ ").toUpperCase()+" ✚ ";
  const mqin=document.getElementById("mqin");
  mqin.innerHTML="<span>"+esc(seq.repeat(3))+"</span><span aria-hidden='true'>"+esc(seq.repeat(3))+"</span>";
  const baseLen=107; // mantém a velocidade visual da versão anterior
  const duration=Math.max(26,Math.round(26*(seq.length/baseLen)));
  mqin.style.animationDuration=duration+"s";
})();

/* stats + filtros */
const FORMAT_GROUPS={
  alb:new Set(["ÁLBUM","ÁLBUM AO VIVO","ÁLBUM DE ARQUIVO","ÁLBUM REIMAGINADO","ÁLBUM REGRAVADO"]),
  ep:new Set(["EP","EP AO VIVO","EP DE COVERS"]),
  oth:new Set(["DELUXE","REISSUE","REEDIÇÃO","COMPILAÇÃO"])
};
const KNOWN_FORMATS=new Set([...FORMAT_GROUPS.alb,...FORMAT_GROUPS.ep,...FORMAT_GROUPS.oth]);
const unknownFormats=R.filter(r=>!KNOWN_FORMATS.has(r.k));
if(AUDIT&&unknownFormats.length)console.warn("[AUDIT] Formatos desconhecidos:",unknownFormats.map(r=>r.a+" | "+r.t+" | "+r.k));
const PRED={
  all:()=>true,
  alb:r=>FORMAT_GROUPS.alb.has(r.k),
  ep:r=>FORMAT_GROUPS.ep.has(r.k),
  oth:r=>FORMAT_GROUPS.oth.has(r.k)
};
const nAll=R.length,nAlb=R.filter(PRED.alb).length,nEp=R.filter(PRED.ep).length,nOth=R.filter(PRED.oth).length;
document.getElementById("stats").innerHTML=
  '<div class="stat"><b>'+nAll+'</b><span>registros</span></div>'
 +'<div class="stat"><b>'+nAlb+'</b><span>álbuns</span></div>'
 +'<div class="stat"><b>'+nEp+'</b><span>EPs</span></div>'
 +'<div class="stat"><b>'+nOth+'</b><span>outros</span></div>';
const FL=[["all","Todos",nAll],["alb","Álbuns",nAlb],["ep","EPs",nEp],["oth","Outros",nOth]];
const filtersEl=document.getElementById("filters");
filtersEl.innerHTML=FL.map(f=>
  '<button type="button" class="fbtn" data-f="'+f[0]+'" aria-pressed="'+(f[0]===userState.filters.format)+'">'+f[1]+"<small>"+f[2]+"</small></button>").join("")
  +'<label class="sortCtl" for="listen-filter"><span>Ouvidos</span><select id="listen-filter" aria-label="Filtrar por ouvidos"><option value="all">Todos</option><option value="listened">Sim</option><option value="unlistened">Não</option></select></label>'
  +'<label class="sortCtl" for="rating-filter"><span>Nota</span><select id="rating-filter" aria-label="Filtrar por avaliação"><option value="all">Todas</option><option value="unrated">Sem nota</option><option value="1">1 estrela</option><option value="2">2 estrelas</option><option value="3">3 estrelas</option><option value="4">4 estrelas</option><option value="5">5 estrelas</option></select></label>'
  +'<label class="sortCtl" for="sort-order"><span>Ordem</span><select id="sort-order" aria-label="Ordenar registros"><option value="asc">Antigos primeiro</option><option value="desc">Recentes primeiro</option></select></label>';

const sortOrder=document.getElementById("sort-order");
const listenedFilter=document.getElementById("listen-filter");
const ratingFilter=document.getElementById("rating-filter");
sortOrder.value=sortDir;
listenedFilter.value=userState.filters.listened;
ratingFilter.value=userState.filters.rating;
applySortOrder();
sortOrder.addEventListener("change",e=>{
  sortDir=e.target.value;
  try{localStorage.setItem(SORT_KEY,sortDir)}catch(err){}
  applySortOrder();
});

function applyFilters(){
  const formatPred=PRED[userState.filters.format]||PRED.all;
  filtersEl.querySelectorAll(".fbtn[data-f]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.f===userState.filters.format));
  document.querySelectorAll(".card").forEach(card=>{
    const r=R[+card.dataset.i],listened=isListened(r),rating=releaseRating(r);
    const listenedPass=userState.filters.listened==="all"||(userState.filters.listened==="listened"?listened:!listened);
    const ratingPass=userState.filters.rating==="all"||(userState.filters.rating==="unrated"?!rating:rating===Number(userState.filters.rating));
    card.classList.toggle("hide",!(formatPred(r)&&listenedPass&&ratingPass));
  });
  document.querySelectorAll("section.mo").forEach(s=>{
    const n=s.querySelectorAll(".card:not(.hide)").length;
    s.style.display=n?"":"none";
    s.querySelector(".mcount").textContent="· "+n+" registro"+(n===1?"":"s");
    const dk=document.querySelector('.dki[data-target="#'+s.id+'"]');
    if(dk)dk.style.display=n?"":"none";
  });
}

filtersEl.addEventListener("click",e=>{
  const b=e.target.closest(".fbtn[data-f]");if(!b)return;
  userState.filters.format=b.dataset.f;saveUserState();applyFilters();
});
listenedFilter.addEventListener("change",e=>{userState.filters.listened=e.target.value;saveUserState();applyFilters()});
ratingFilter.addEventListener("change",e=>{userState.filters.rating=e.target.value;saveUserState();applyFilters()});

/* ============================================================
   DOCK (port vanilla do React Bits Dock) — navegação rápida
============================================================ */
const dock=document.getElementById("dock");
const dockItems=[{g:"↑",l:"Topo",t:"#top0"}]
  .concat(months.map(m=>({g:String(m).padStart(2,"0"),l:MESES[m],t:"#m"+m})))
  .concat([{sep:1},{g:"＋",l:"Sugerir",t:"#sugira"},{g:"IG",l:"@gustpires13",u:"https://instagram.com/gustpires13"}]);
dock.innerHTML=dockItems.map(it=>it.sep?'<span class="dki sep" aria-hidden="true"></span>'
  :'<button class="dki" '+(it.t?'data-target="'+it.t+'"':'data-url="'+it.u+'"')+' aria-label="'+esc(it.l)+'">'+it.g+'<span class="lb">'+esc(it.l)+"</span></button>").join("");
applyFilters();
dock.addEventListener("click",e=>{
  const b=e.target.closest(".dki");if(!b||b.classList.contains("sep"))return;
  if(b.dataset.url){window.open(b.dataset.url,"_blank","noopener");return}
  const t=b.dataset.target;
  if(t==="#top0"){scrollTo({top:0,behavior:reduced?"auto":"smooth"});return}
  const el=document.querySelector(t);if(el)el.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
});
/* magnificação (desktop) */
if(finePtr&&!reduced){
  const its=[...dock.querySelectorAll(".dki:not(.sep)")];
  const BASE=42,MAG=64,DIST=130;let mx=Infinity,raf=0;
  const cur=its.map(()=>BASE);
  function tick(){
    let done=true;
    its.forEach((el,ix)=>{
      const r=el.getBoundingClientRect();
      const c=r.left+r.width/2;
      const d=Math.abs(mx-c);
      const target=mx===Infinity?BASE:BASE+(MAG-BASE)*Math.max(0,1-d/DIST);
      cur[ix]+= (target-cur[ix])*0.24;
      if(Math.abs(target-cur[ix])>0.4)done=false;
      const s=Math.round(cur[ix]);
      el.style.width=s+"px";el.style.height=s+"px";
      el.style.fontSize=(12*s/BASE).toFixed(1)+"px";
    });
    raf=done?0:requestAnimationFrame(tick);
  }
  const kick=()=>{if(!raf)raf=requestAnimationFrame(tick)};
  dock.addEventListener("mousemove",e=>{mx=e.clientX;kick()});
  dock.addEventListener("mouseleave",()=>{mx=Infinity;kick()});
}

/* seção atual → dock */
const dmap={};document.querySelectorAll(".dki[data-target]").forEach(b=>dmap[b.dataset.target]=b);
const io=new IntersectionObserver(es=>{
  es.forEach(e=>{if(e.isIntersecting){
    Object.values(dmap).forEach(b=>b.classList.remove("cur"));
    const b=dmap["#"+e.target.id];if(b){b.classList.add("cur");b.scrollIntoView({inline:"nearest",block:"nearest"})}
  }});
},{rootMargin:"-30% 0px -60% 0px"});
document.querySelectorAll("section.mo").forEach(s=>io.observe(s));

/* reveal */
const rio=new IntersectionObserver(es=>{
  es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");rio.unobserve(e.target)}});
},{threshold:.12,rootMargin:"0px 0px -4% 0px"});
document.querySelectorAll(".rv").forEach(el=>rio.observe(el));

/* ============================================================
   BRILHO NA CAPA — realce de luz que segue o mouse (sem P&B)
============================================================ */
if(finePtr&&!reduced){
  let shineFrame=0,shineTarget=null,shineX=0,shineY=0;
  app.addEventListener("pointermove",e=>{
    const sl=e.target.closest(".sleeve");if(!sl)return;
    shineTarget=sl;shineX=e.clientX;shineY=e.clientY;
    if(shineFrame)return;
    shineFrame=requestAnimationFrame(()=>{
      const r=shineTarget.getBoundingClientRect();
      shineTarget.style.setProperty("--mx",((shineX-r.left)/r.width*100).toFixed(1)+"%");
      shineTarget.style.setProperty("--my",((shineY-r.top)/r.height*100).toFixed(1)+"%");
      shineFrame=0;
    });
  });
}

/* ============================================================
   GRAINIENT (port vanilla WebGL2 do React Bits Grainient)
============================================================ */
(function(){
  const cv=document.getElementById("grain"),hero=document.querySelector(".hero");
  const gl=cv.getContext("webgl2",{alpha:true,antialias:false});
  if(!gl){hero.classList.add("noGL");return}
  let raf=0,contextLost=false;
  cv.addEventListener("webglcontextlost",e=>{
    e.preventDefault();contextLost=true;if(raf){cancelAnimationFrame(raf);raf=0}hero.classList.add("noGL");
  },{once:true});
  const VS="#version 300 es\nin vec2 position;void main(){gl_Position=vec4(position,0.,1.);}";
  const FS="#version 300 es\nprecision highp float;uniform vec2 iResolution;uniform float iTime;uniform float uTimeSpeed;uniform float uColorBalance;uniform float uWarpStrength;uniform float uWarpFrequency;uniform float uWarpSpeed;uniform float uWarpAmplitude;uniform float uBlendAngle;uniform float uBlendSoftness;uniform float uRotationAmount;uniform float uNoiseScale;uniform float uGrainAmount;uniform float uGrainScale;uniform float uContrast;uniform float uGamma;uniform float uSaturation;uniform vec2 uCenterOffset;uniform float uZoom;uniform vec3 uColor1;uniform vec3 uColor2;uniform vec3 uColor3;out vec4 fragColor;\n#define S(a,b,t) smoothstep(a,b,t)\nmat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.,0.)),f-vec2(0.,0.)),dot(-1.0+2.0*hash(i+vec2(1.,0.)),f-vec2(1.,0.)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.,1.)),f-vec2(0.,1.)),dot(-1.0+2.0*hash(i+vec2(1.,1.)),f-vec2(1.,1.)),u.x),u.y);return .5+.5*n;}\nvoid main(){float t=iTime*uTimeSpeed;vec2 uv=gl_FragCoord.xy/iResolution.xy;float ratio=iResolution.x/iResolution.y;vec2 tuv=uv-.5+uCenterOffset;tuv/=max(uZoom,.001);float degree=noise(vec2(t*.1,tuv.x*tuv.y)*uNoiseScale);tuv.y*=1./ratio;tuv*=Rot(radians((degree-.5)*uRotationAmount+180.));tuv.y*=ratio;float frequency=uWarpFrequency;float ws=max(uWarpStrength,.001);float amplitude=uWarpAmplitude/ws;float warpTime=t*uWarpSpeed;tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*.5);vec3 colLav=uColor1;vec3 colOrg=uColor2;vec3 colDark=uColor3;float b=uColorBalance;float s=max(uBlendSoftness,0.);mat2 blendRot=Rot(radians(uBlendAngle));float blendX=(tuv*blendRot).x;float edge0=-.3-b-s;float edge1=.2-b+s;float v0=.5-b+s;float v1=-.3-b-s;vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));vec2 grainUv=uv*max(uGrainScale,.001);float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);col+=(grain-.5)*uGrainAmount;col=(col-.5)*uContrast+.5;float luma=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(luma),col,uSaturation);col=pow(max(col,0.),vec3(1./max(uGamma,.001)));col=clamp(col,0.,1.);fragColor=vec4(col,1.);}";
  function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn(gl.getShaderInfoLog(s));return null}return s}
  const vs=sh(gl.VERTEX_SHADER,VS),fs=sh(gl.FRAGMENT_SHADER,FS);
  if(!vs||!fs){hero.classList.add("noGL");return}
  const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){hero.classList.add("noGL");return}
  gl.useProgram(pr);
  const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(pr,"position");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const U=n=>gl.getUniformLocation(pr,n);
  const hx=h=>{const m=/^#?(..)(..)(..)$/.exec(h);return[parseInt(m[1],16)/255,parseInt(m[2],16)/255,parseInt(m[3],16)/255]};
  const cfg={uTimeSpeed:.18,uColorBalance:0,uWarpStrength:1,uWarpFrequency:4,uWarpSpeed:1.4,uWarpAmplitude:55,uBlendAngle:12,uBlendSoftness:.07,uRotationAmount:420,uNoiseScale:2,uGrainAmount:.12,uGrainScale:2.4,uContrast:1.35,uGamma:1,uSaturation:0,uZoom:.85};
  for(const k in cfg)gl.uniform1f(U(k),cfg[k]);
  gl.uniform2f(U("uCenterOffset"),0,0);
  gl.uniform3fv(U("uColor1"),hx("#96989b"));
  gl.uniform3fv(U("uColor2"),hx("#0a0a0c"));
  gl.uniform3fv(U("uColor3"),hx("#5b5e63"));
  const uT=U("iTime"),uR=U("iResolution");
  function size(){
    if(contextLost)return;
    const r=hero.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    cv.width=Math.max(1,r.width*dpr|0);cv.height=Math.max(1,r.height*dpr|0);
    gl.viewport(0,0,cv.width,cv.height);gl.uniform2f(uR,cv.width,cv.height);
    gl.uniform1f(uT,0);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  new ResizeObserver(size).observe(hero);size();
  if(reduced)return; /* frame estático */
  let vis=true,pvis=!document.hidden;const t0=performance.now();
  function loop(t){if(contextLost)return;gl.uniform1f(uT,(t-t0)*.001);gl.drawArrays(gl.TRIANGLES,0,3);raf=requestAnimationFrame(loop)}
  const start=()=>{if(!contextLost&&vis&&pvis&&!raf)raf=requestAnimationFrame(loop)};
  const stop=()=>{if(raf){cancelAnimationFrame(raf);raf=0}};
  new IntersectionObserver(([e])=>{vis=e.isIntersecting;vis?start():stop()},{threshold:0}).observe(hero);
  document.addEventListener("visibilitychange",()=>{pvis=!document.hidden;pvis?start():stop()});
  start();
})();

/* toque/clique na capa puxa o vinil; links ficam apenas nos botoes das plataformas */
document.addEventListener("click",e=>{
  if(e.target.closest(".listen-toggle,.rating-control"))return;
  const dw=e.target.closest(".discwrap");
  if(!dw){document.querySelectorAll(".card.active").forEach(c=>c.classList.remove("active"));return}
  const card=dw.closest(".card");
  const was=card.classList.contains("active");
  document.querySelectorAll(".card.active").forEach(c=>c.classList.remove("active"));
  if(!was)card.classList.add("active");
});

if(reduced)document.documentElement.classList.add("rm");

/* ============================================================
   FORMULÁRIO — abre e-mail pronto (endereço nunca exibido)
============================================================ */
function suggestionData(){
  const v=id=>document.getElementById(id).value.trim();
  const art=v("f-art"),alb=v("f-alb"),mes=v("f-mes"),ano=v("f-ano"),link=v("f-link");
  const msg=document.getElementById("fmsg");
  if(!art||!alb){msg.textContent="[ ! ] Preencha pelo menos artista e álbum.";return null}
  if(link){
    try{const url=new URL(link);if(!["http:","https:"].includes(url.protocol))throw new Error("protocol")}
    catch(e){msg.textContent="[ ! ] Informe um link completo começando com http:// ou https://.";return null}
  }
  const body="Sugestão de release para o CORE RELEASES:\n\n"
    +"Artista: "+art+"\n"
    +"Álbum / EP: "+alb+"\n"
    +"Mês: "+(mes||"Não informado")+"\n"
    +"Ano: "+(ano||"Não informado")+"\n"
    +"Link: "+(link||"Não informado")+"\n\n"
    +"Enviado pelo site CORE RELEASES.";
  return{art,alb,body,msg};
}
document.getElementById("sform").addEventListener("submit",e=>{
  e.preventDefault();
  const data=suggestionData();if(!data)return;
  const addr=["gustpires13","gmail","com"];
  const to=addr[0]+"\u0040"+addr[1]+"."+addr[2];
  const subject=encodeURIComponent("Sugestão CORE RELEASES: "+data.art+" | "+data.alb);
  data.msg.textContent="Tentando abrir seu aplicativo de e-mail.";
  window.location.href="mailto:"+to+"?subject="+subject+"&body="+encodeURIComponent(data.body);
});

/* ============================================================
   CAPAS — pipeline de 4 camadas · artista sempre verificado
   L0 override oficial · L1 Deezer estrito · L2 iTunes estrito
   L3 MusicBrainz + Cover Art Archive
============================================================ */
const AUD=[];
const DEEZER_PROXY=location.hostname.endsWith("gustpires13.chatgpt.site")||location.hostname==="localhost"?"/api/deezer":"https://core-releases-2026.gustpires13.chatgpt.site/api/deezer";
async function deezerApi(params){
  const url=new URL(DEEZER_PROXY,location.href);
  Object.entries(params).forEach(([name,value])=>url.searchParams.set(name,value));
  const res=await fetch(url,{headers:{Accept:"application/json"}});
  if(!res.ok)throw new Error("deezer proxy "+res.status);
  return res.json();
}
const dzCoverOf=al=>al.cover_big||al.cover_xl||al.cover_medium||null;
function deezerDirectLink(link){
  if(!link)return null;
  try{
    const host=new URL(link,location.href).hostname.toLowerCase();
    return host==="deezer.com"||host.endsWith(".deezer.com")||host==="deezer.page.link"?link:null;
  }catch(e){return null}
}
async function dzAlbumById(id){
  const d=await deezerApi({album:String(id)});
  if(d&&!d.error&&dzCoverOf(d))return{cover:dzCoverOf(d),link:d.link||null};
  return null;
}
async function dzSearch(r,loose){
  const q=r.q||(r.a+" "+r.t);
  const d=await deezerApi({search:q});
  const tgt=r.q?r.q.replace(new RegExp(reEsc(r.a),"i"),""):r.t;
  const list=(d&&d.data||[]).filter(x=>x.artist&&artistOk(x.artist.name,r.a));
  const hit=list.find(x=>loose?titleLoose(x.title,tgt):titleStrict(x.title,tgt));
  if(!hit)return null;
  return{cover:dzCoverOf(hit),link:hit.link||null};
}
async function itSearch(r,loose){
  const q=r.q||(r.a+" "+r.t);
  const tgt=r.q?r.q.replace(new RegExp(reEsc(r.a),"i"),""):r.t;
  for(const country of ["","BR"]){
    const url="https://itunes.apple.com/search?media=music&entity=album&limit=12&term="+encodeURIComponent(q)+(country?"&country="+country:"");
    const res=await fetch(url);if(!res.ok)throw new Error("itunes");
    const d=await res.json();
    const list=(d.results||[]).filter(x=>artistOk(x.artistName||"",r.a));
    const hit=list.find(x=>loose?titleLoose(x.collectionName||"",tgt):titleStrict(x.collectionName||"",tgt));
    if(hit&&hit.artworkUrl100)return{cover:hit.artworkUrl100.replace(/100x100bb/,"500x500bb"),link:hit.collectionViewUrl||null,itlink:true};
  }
  return null;
}
let mbLast=0;
async function mbCAA(r){
  const wait=Math.max(0,mbLast+1100-Date.now());if(wait)await sleep(wait);mbLast=Date.now();
  const q='artist:"'+r.a.replace(/"/g,"")+'" AND releasegroup:"'+r.t.replace(/"/g,"")+'"';
  const res=await fetch("https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query="+encodeURIComponent(q));
  if(!res.ok)throw new Error("mb");
  const d=await res.json();
  const hit=(d["release-groups"]||[]).find(x=>{
    const ac=(x["artist-credit"]||[]).map(c=>c.name||(c.artist&&c.artist.name)||"").join(" ");
    return artistOk(ac,r.a)&&titleLoose(x.title||"",r.t);
  });
  if(!hit)return null;
  return{cover:"https://coverartarchive.org/release-group/"+hit.id+"/front-500",link:null};
}
function cardCover(url){
  return String(url||"")
    .replace(/\/1000x1000bb(?=\.[a-z]+(?:\?|$))/i,"/500x500bb")
    .replace(/\/1000x1000-(?=[^/]+$)/i,"/500x500-")
    .replace(/\/front-1200(?=\?|$)/i,"/front-500")
    .replace(/([?&]width=)1200(?=&|$)/i,(_,prefix)=>prefix+"500");
}
function applyArt(card,r,got,src){
  const state=stateOf(r),cover=cardCover(got.cover),alt=cardCover(got.alt);
  const sleeve=card.querySelector(".sleeve"),img=sleeve.querySelector("img");
  img.onload=()=>{sleeve.classList.remove("loading");sleeve.classList.add("ok");const s=sleeve.querySelector(".shim");if(s)s.remove()};
  img.onerror=()=>{
    if(alt&&img.src!==alt){img.src=alt;return}
    placeholder(card,r,"erro de imagem ("+src+")");
  };
  img.src=cover;
  card.querySelector(".vlabel").style.setProperty("--art",'url("'+cover+'")');
  state.cover=cover;
  const dzLink=deezerReleaseLink(r)||(!got.itlink&&deezerDirectLink(got.link));
  if(dzLink){const a=card.querySelector(".p-dz");a.href=dzLink;a.title="Abrir álbum no Deezer";state.deezer=dzLink;state.link=dzLink;state.seed=dzLink}
  else if(validHttps(got.link)){state.link=state.link||got.link;state.seed=state.seed||got.link}
  if(state.seed)queueLink(r);
  persistRuntimeSoon();
  if(!["CACHE","L0","L1"].includes(src))AUD.push({r,src});
}
function placeholder(card,r,why){
  const sleeve=card.querySelector(".sleeve");
  sleeve.classList.remove("loading");const s=sleeve.querySelector(".shim");if(s)s.remove();
  const img=sleeve.querySelector("img");if(img)img.remove();
  if(!sleeve.querySelector(".ph")){
    const ph=document.createElement("div");ph.className="ph";
    ph.innerHTML="<b>"+esc(r.a)+"</b><i>"+esc(r.t)+"</i><em>SEM CAPA — REPORTAR</em>";
    sleeve.appendChild(ph);
  }
  AUD.push({r,src:"FALHOU",why});
  console.warn("[COVER FAIL]",r.a,"—",r.t,why||"");
}
async function resolveArt(r){
  const card=document.querySelector('.card[data-i="'+r.i+'"]');
  if(!card)return;
  const state=stateOf(r);
  if(r.cover){applyArt(card,r,{cover:r.cover,link:r.sourceLink||null},"L0");return}
  if(state.cover){applyArt(card,r,{cover:state.cover,link:state.link||null},"CACHE");return}
  const searchRelease=r.q?{...r,q:r.q}:r;
  const layers=[
    ["L0",async()=>r.deezerId?dzAlbumById(r.deezerId):null],
    ["L1",()=>dzSearch(searchRelease,false)],
    ["L2",()=>itSearch(searchRelease,false)],
    ["L3",()=>mbCAA(searchRelease)]
  ];
  for(const[name,fn]of layers){
    try{
      const got=await fn();
      if(got&&got.cover){applyArt(card,r,got,name);return}
    }catch(e){}
  }
  placeholder(card,r,"todas as camadas");
}
/* ============================================================
   LINKS DIRETOS SPOTIFY / YT MUSIC — via song.link (Odesli)
   Sem chave: ~10 req/min → preenchimento progressivo em fundo
   + resolução instantânea no clique (fallback: busca exata)
============================================================ */
const odCache={};let odCooldown=0;
function odesli(seed){
  if(Date.now()<odCooldown)return Promise.reject(new Error("cooldown"));
  if(odCache[seed])return odCache[seed];
  const pr=(async()=>{
    const res=await fetch("https://api.song.link/v1-alpha.1/links?url="+encodeURIComponent(seed));
    if(res.status===429){odCooldown=Date.now()+70000;throw new Error("429")}
    if(!res.ok)throw new Error("od "+res.status);
    const d=await res.json();
    const L=d.linksByPlatform||{};
    return{sp:(L.spotify||{}).url||null,yt:(L.youtubeMusic||L.youtube||{}).url||null};
  })();
  odCache[seed]=pr;
  pr.catch(()=>{delete odCache[seed]});
  return pr;
}
async function ensureSeed(r){
  const state=stateOf(r);
  if(state.seed)return state.seed;
  try{
    let got=await dzSearch(r,false);
    if(!got)got=await dzSearch(r,true);
    if(got&&validHttps(got.link)){
      state.seed=got.link;state.link=got.link;
      const direct=deezerDirectLink(got.link);if(direct)state.deezer=direct;
      persistRuntimeSoon();queueLink(r);return state.seed;
    }
  }catch(e){}
  return null;
}
function upgradeLinks(r){
  const host=document.querySelector('.card[data-i="'+r.i+'"]'),state=stateOf(r);
  if(!host)return;
  if(state.sp){const a=host.querySelector(".p-sp");if(a){a.href=state.sp;a.title="Abrir álbum no Spotify"}}
  if(state.yt){const a=host.querySelector(".p-yt");if(a){a.href=state.yt;a.title="Abrir no YouTube Music"}}
}
async function resolveStream(r){
  const state=stateOf(r);if(state.sp)return;
  const seed=await ensureSeed(r);
  if(!seed)return;
  const got=await odesli(seed);
  if(validHttps(got.sp))state.sp=got.sp;
  if(validHttps(got.yt))state.yt=got.yt;
  persistRuntimeSoon();upgradeLinks(r);
}
/* prioridade no hover: pré-resolve o link direto antes do clique */
function prioritizeLink(r){return resolveStream(r)}
const hoverBusy=new Set();
app.addEventListener("pointerover",e=>{
  const host=e.target.closest("[data-i]");if(!host)return;
  const r=R[+host.dataset.i];
  if(stateOf(r).sp||hoverBusy.has(r.i))return;
  hoverBusy.add(r.i);
  Promise.resolve(prioritizeLink(r)).catch(()=>{}).finally(()=>hoverBusy.delete(r.i));
});
const linkQueue=[],linkQueued=new Set();let linkTrickleStarted=false,linkTimer=0;
function queueLink(r){
  const state=stateOf(r);
  if(!state.seed||state.sp||linkQueued.has(r.id))return;
  linkQueued.add(r.id);linkQueue.push(r);
  if(linkTrickleStarted&&!linkTimer)scheduleLinkStep(100);
}
function scheduleLinkStep(delay){
  if(linkTimer)return;
  linkTimer=setTimeout(runLinkStep,delay);
}
async function runLinkStep(){
  linkTimer=0;
  const r=linkQueue.shift();
  if(!r){if(artFinished<R.length)scheduleLinkStep(3000);return}
  linkQueued.delete(r.id);
  try{await resolveStream(r)}catch(e){}
  if(linkQueue.length||artFinished<R.length)scheduleLinkStep(7000);
}
function startLinkTrickle(){
  if(linkTrickleStarted)return;
  linkTrickleStarted=true;R.forEach(queueLink);scheduleLinkStep(0);
}

/* Capas sob demanda: evita consultar a discografia inteira na abertura. */
const artQueue=[];let artActive=0,artFinished=0,artAuditShown=false;
function showCoverAudit(){
  if(artAuditShown)return;artAuditShown=true;
  const box=document.createElement("div");
  box.style.cssText="position:fixed;left:12px;bottom:90px;z-index:99;max-width:420px;max-height:50vh;overflow:auto;background:#0e0e11;border:1.5px solid #e8e8e8;box-shadow:5px 5px 0 #000;padding:14px;font:11px/1.7 'JetBrains Mono',monospace;color:#ddd";
  box.innerHTML="<b>AUDIT · "+AUD.length+" itens fora de L0/L1</b><br>"+(AUD.map(x=>"["+x.src+"] "+esc(x.r.a)+" — "+esc(x.r.t)).join("<br>")||"— tudo resolvido em L0/L1");
  document.body.appendChild(box);
}
function pumpArt(){
  while(artActive<3&&artQueue.length){
    const r=artQueue.shift();artActive++;
    Promise.resolve(resolveArt(r)).catch(()=>{}).finally(()=>{
      stateOf(r).artState=2;artActive--;artFinished++;
      if(AUDIT&&artFinished===R.length)showCoverAudit();
      pumpArt();
    });
  }
}
function enqueueArt(r){
  if(!r||stateOf(r).artState)return;
  stateOf(r).artState=1;artQueue.push(r);pumpArt();
}
(function initArtLoading(){
  const cards=[...document.querySelectorAll(".card[data-i]")];
  if(AUDIT||!("IntersectionObserver" in window)){
    cards.forEach(c=>enqueueArt(R[+c.dataset.i]));return;
  }
  const artIO=new IntersectionObserver(es=>{
    es.forEach(e=>{if(e.isIntersecting){artIO.unobserve(e.target);enqueueArt(R[+e.target.dataset.i])}});
  },{rootMargin:"900px 0px",threshold:0});
  cards.forEach(c=>artIO.observe(c));
})();
const idleLinks=()=>startLinkTrickle();
"requestIdleCallback" in window?requestIdleCallback(idleLinks,{timeout:5000}):setTimeout(idleLinks,5000);
