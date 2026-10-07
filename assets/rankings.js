(() => {
'use strict';
const root=document.getElementById('records'); if(!root)return;
const BASE='https://juukbnkjboiazqggqcyv.supabase.co/rest/v1';
const KEY='sb_publishable_l5cHUHrGHoFzGqmUyfQKSA_d3VjWksB';
const HEAD={'apikey':KEY,'Content-Type':'application/json'};
const REFRESH_MS=300000, STALE_MS=20*60000;
const CAR_ASSET='https://raw.githubusercontent.com/almaprintes/TopdownCraftrace/dev-first-update/public/assets/cars/lobby/';
const select=document.getElementById('rankingTrack'),body=document.getElementById('rankingRows'),status=document.getElementById('rankingStatus'),empty=document.getElementById('rankingEmpty'),table=document.getElementById('rankingTable');
const comments=document.getElementById('trackComments'),form=document.getElementById('commentForm'),commentStatus=document.getElementById('commentStatus');
const names={'circuito-atlantico':'Circuito Atlántico','karting-canarias':'Karting Canarias','karting-tenerife':'Karting Tenerife','santa-cruz':'Santa Cruz'};
const msg={es:{loading:'Cargando los tiempos…',updated:'Actualizado',stale:'La actualización se está retrasando. Últimos datos:',error:'No se han podido cargar los tiempos.',empty:'Todavía no hay tiempos publicados en este circuito.',noComments:'Aún no hay comentarios. Sé el primero.',sent:'Comentario publicado.',sending:'Publicando…',commentError:'No se pudo publicar. Inténtalo de nuevo.',rate:'Espera un minuto antes de publicar otro comentario.',reserved:'Ese nick está reservado por el creador de TDR.'},en:{loading:'Loading lap times…',updated:'Updated',stale:'Update delayed. Latest data:',error:'Lap times could not be loaded.',empty:'No published times on this track yet.',noComments:'No comments yet. Be the first.',sent:'Comment posted.',sending:'Posting…',commentError:'Could not post. Try again.',rate:'Wait one minute before posting another comment.',reserved:'That nickname is reserved by the TDR creator.'},it:{loading:'Caricamento dei tempi…',updated:'Aggiornato',stale:'Aggiornamento in ritardo. Ultimi dati:',error:'Impossibile caricare i tempi.',empty:'Nessun tempo pubblicato su questo circuito.',noComments:'Ancora nessun commento. Scrivi il primo.',sent:'Commento pubblicato.',sending:'Pubblicazione…',commentError:'Impossibile pubblicare. Riprova.',rate:'Attendi un minuto prima di pubblicare un altro commento.',reserved:'Questo nickname è riservato dal creatore di TDR.'}};
let snapshot=null,loading=false,visible=false,lastAttempt=0;
const lang=()=>msg[document.documentElement.lang]?document.documentElement.lang:'es';
const fmt=ms=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
function valid(d){return d?.version===1&&Array.isArray(d.tracks)&&Number.isFinite(Date.parse(d.generated_at));}
function render(){
 const t=msg[lang()]; if(!snapshot){status.textContent=t.loading;return;}
 const selected=select.value;
 select.replaceChildren(...snapshot.tracks.map(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=names[x.id]||x.id;return o;}));
 if(snapshot.tracks.some(x=>x.id===selected))select.value=selected;
 const entries=snapshot.tracks.find(x=>x.id===select.value)?.entries||[];
 body.replaceChildren(...entries.map(e=>{const r=document.createElement('tr');r.dataset.rank=e.rank;[String(e.rank).padStart(2,'0'),e.nick,fmt(e.best_time_ms)].forEach(v=>{const c=document.createElement('td');c.textContent=v;r.append(c)});if(e.rank<=3&&/^[a-z0-9_]+$/.test(e.car_id||'')){const img=document.createElement('img');img.className='podiumCar';img.src=CAR_ASSET+e.car_id+'.webp';img.alt='';img.loading='lazy';img.decoding='async';r.children[1].append(img);}return r;}));
 table.hidden=!entries.length;empty.hidden=!!entries.length;empty.textContent=t.empty;select.disabled=false;
 const g=new Date(snapshot.generated_at),stale=Date.now()-g.getTime()>STALE_MS;status.dataset.state=stale?'stale':'ready';
 status.textContent=`${stale?t.stale:t.updated} ${new Intl.DateTimeFormat(lang(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(g)}`;
}
async function refresh(force=false){
 if(loading||document.hidden||(!visible&&!force)||(!force&&Date.now()-lastAttempt<REFRESH_MS))return;
 loading=true;lastAttempt=Date.now();
 try{const r=await fetch(BASE+'/web_leaderboard_snapshot?select=payload&id=eq.true',{headers:HEAD,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw 0;const rows=await r.json();const d=rows[0]?.payload;if(!valid(d))throw 0;snapshot=d;render();await loadComments();}
 catch{status.dataset.state='error';status.textContent=msg[lang()].error;} finally{loading=false;}
}
async function loadComments(){
 if(!comments||!select.value)return;
 try{const q=encodeURIComponent(select.value);const r=await fetch(BASE+`/web_track_comments?select=id,display_name,message,created_at&track_id=eq.${q}&order=created_at.desc&limit=30`,{headers:HEAD,cache:'no-store'});if(!r.ok)throw 0;const rows=await r.json();
 comments.replaceChildren(...(rows.length?rows.map(x=>{const a=document.createElement('article');a.className='trackComment';const h=document.createElement('div');h.className='commentMeta';const n=document.createElement('strong');n.textContent=x.display_name;if(x.display_name.toUpperCase().replace(/[^A-Z0-9]/g,'')==='JUANFRIKAZODEV'){const b=document.createElement('span');b.className='creatorBadge';b.textContent='CREADOR ✓';n.append(' ',b);}const d=document.createElement('time');d.dateTime=x.created_at;d.textContent=new Intl.DateTimeFormat(lang(),{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(x.created_at));h.append(n,d);const p=document.createElement('p');p.textContent=x.message;a.append(h,p);return a;}):[Object.assign(document.createElement('p'),{className:'commentEmpty',textContent:msg[lang()].noComments})]));}
 catch{comments.replaceChildren();}
}
function token(){let t=localStorage.getItem('tdr:web:comment-token');if(!t){t=crypto.randomUUID();localStorage.setItem('tdr:web:comment-token',t)}return t;}
form?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),button=form.querySelector('button');button.disabled=true;commentStatus.textContent=msg[lang()].sending;
 try{const r=await fetch(BASE+'/rpc/post_web_track_comment',{method:'POST',headers:HEAD,body:JSON.stringify({p_track_id:select.value,p_display_name:String(fd.get('name')||'').trim(),p_message:String(fd.get('message')||'').trim(),p_client_token:token()})});if(!r.ok){const x=await r.text();if(x.includes('rate_limited'))throw new Error('rate');if(x.includes('reserved_name'))throw new Error('reserved');throw new Error('post');}form.querySelector('textarea').value='';commentStatus.textContent=msg[lang()].sent;await loadComments();}
 catch(err){commentStatus.textContent=msg[lang()][err.message==='rate'?'rate':err.message==='reserved'?'reserved':'commentError'];}finally{button.disabled=false;}});
select.addEventListener('change',()=>{render();loadComments();});
document.getElementById('lang')?.addEventListener('change',()=>{render();loadComments();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
if('IntersectionObserver'in window)new IntersectionObserver(es=>{visible=es.some(e=>e.isIntersecting);if(visible)refresh(true)},{rootMargin:'200px'}).observe(root);else{visible=true;refresh(true)}
setInterval(()=>refresh(),REFRESH_MS);render();
})();