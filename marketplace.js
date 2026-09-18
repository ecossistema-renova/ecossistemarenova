const cfg=window.OYAG_CONFIG;
const legacySessionKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
if(!localStorage.getItem(legacySessionKey)&&sessionStorage.getItem(legacySessionKey)){
  localStorage.setItem(legacySessionKey,sessionStorage.getItem(legacySessionKey));
  sessionStorage.removeItem(legacySessionKey);
}
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const grid=document.querySelector('#marketGrid'),statusEl=document.querySelector('#marketStatus'),searchEl=document.querySelector('#search'),catEl=document.querySelector('#category'),orderEl=document.querySelector('#order');
let items=[],buying=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(c,cur)=>c==null?'Consulte':new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur||'BRL'}).format(Number(c)/100);

function render(){
 const q=searchEl.value.trim().toLowerCase(),c=catEl.value;
 let list=items.filter(x=>(!q||[x.name,x.description,x.organization_name].some(v=>String(v||'').toLowerCase().includes(q)))&&(!c||x.category===c));
 if(orderEl.value==='price_asc')list.sort((a,b)=>(a.price_cents??Infinity)-(b.price_cents??Infinity));
 else if(orderEl.value==='price_desc')list.sort((a,b)=>(b.price_cents??-1)-(a.price_cents??-1));
 else list.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 statusEl.textContent=list.length?list.length+' oferta(s) encontrada(s)':'Nenhuma oferta publicada no momento.';
 grid.innerHTML=list.map(x=>'<article class="market-card">'+
  (x.image_url?'<img src="'+esc(x.image_url)+'" alt="">':'<div class="market-placeholder">OYAG</div>')+
  '<div><small>'+esc(x.category||x.item_type)+'</small><h2>'+esc(x.name)+'</h2><p>'+esc(x.description||'Oferta disponível no OYAG Ecosystem.')+
  '</p><span>'+esc(x.organization_name)+'</span><strong>'+esc(money(x.price_cents,x.currency))+'</strong>'+
  (x.commercial_condition?'<em>'+esc(x.commercial_condition)+'</em>':'')+
  '<button class="button primary buy-button" type="button" data-buy="'+esc(x.id)+'">Comprar</button></div></article>').join('');
}

const leadModal=document.querySelector('#leadModal');
const leadForm=document.querySelector('#leadForm');
const leadProduct=document.querySelector('#leadProduct');
const leadName=document.querySelector('#leadName');
const leadEmail=document.querySelector('#leadEmail');
const leadWhatsapp=document.querySelector('#leadWhatsapp');
const leadEmailOptIn=document.querySelector('#leadEmailOptIn');
const leadWhatsappOptIn=document.querySelector('#leadWhatsappOptIn');
const leadWebsite=document.querySelector('#leadWebsite');
const leadError=document.querySelector('#leadError');
const leadContinue=document.querySelector('#leadContinue');
let pendingItemId=null;

function phoneMask(value){
 const d=String(value||'').replace(/\D/g,'').slice(0,11);
 if(d.length<=2)return d;
 if(d.length<=6)return '('+d.slice(0,2)+') '+d.slice(2);
 if(d.length<=10)return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);
 return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);
}
leadWhatsapp?.addEventListener('input',()=>{leadWhatsapp.value=phoneMask(leadWhatsapp.value)});

async function openLeadModal(itemId){
 const item=items.find(x=>x.id===itemId);
 if(!item)return;
 pendingItemId=itemId;
 leadProduct.textContent=item.name+' · '+money(item.price_cents,item.currency);
 leadError.textContent='';
 const {data:{session}}=await sb.auth.getSession();
 if(session?.user?.email&&!leadEmail.value)leadEmail.value=session.user.email;
 leadModal.hidden=false;
 document.body.style.overflow='hidden';
 setTimeout(()=>leadName?.focus(),50);
}
function closeLeadModal(){
 if(buying)return;
 leadModal.hidden=true;
 document.body.style.overflow='';
 pendingItemId=null;
}
leadModal?.querySelectorAll('[data-lead-close]').forEach(el=>el.addEventListener('click',closeLeadModal));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!leadModal.hidden)closeLeadModal()});

function currentUtm(){
 const p=new URLSearchParams(location.search),out={};
 ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k=>{if(p.get(k))out[k]=p.get(k).slice(0,200)});
 return out;
}

async function startBuy(itemId){
 if(buying)return;
 const item=items.find(x=>x.id===itemId);
 if(!item){statusEl.textContent='Este produto não está disponível agora.';return}
 await openLeadModal(itemId);
}

leadForm?.addEventListener('submit',async e=>{
 e.preventDefault();
 if(buying||!pendingItemId)return;
 const fullName=leadName.value.trim();
 const email=leadEmail.value.trim().toLowerCase();
 const whatsapp=leadWhatsapp.value.replace(/\D/g,'');
 if(fullName.length<2){leadError.textContent='Informe seu nome completo.';leadName.focus();return}
 if(!/^\S+@\S+\.\S+$/.test(email)){leadError.textContent='Informe um e-mail válido.';leadEmail.focus();return}
 if(whatsapp.length<10){leadError.textContent='Informe um WhatsApp válido com DDD.';leadWhatsapp.focus();return}

 buying=true;
 leadContinue.disabled=true;
 leadContinue.textContent='Preparando pagamento…';
 leadError.textContent='';
 statusEl.textContent='Salvando seus dados e preparando o checkout…';

 const idem=crypto.randomUUID();
 try{
  const {data:{session}}=await sb.auth.getSession();
  const headers={
   apikey:cfg.supabasePublishableKey,
   'content-type':'application/json',
   'x-idempotency-key':idem
  };
  if(session?.access_token)headers.authorization='Bearer '+session.access_token;

  const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-start-public-purchase',{
   method:'POST',
   headers,
   body:JSON.stringify({
    full_name:fullName,
    email,
    whatsapp,
    catalog_item_id:pendingItemId,
    email_marketing_opt_in:leadEmailOptIn.checked,
    whatsapp_marketing_opt_in:leadWhatsappOptIn.checked,
    idempotency_key:idem,
    utm:currentUtm(),
    page:'marketplace',
    referrer:document.referrer||'',
    website:leadWebsite.value||''
   })
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.ok)throw new Error(data?.detail||data?.error||'Não foi possível iniciar a compra.');

  const checkoutId=data.checkout?.checkout_id;
  if(!checkoutId)throw new Error('Checkout não retornado.');

  if(data.buyer_mode==='guest'&&data.guest_token){
   sessionStorage.setItem('oyag_guest_checkout_'+checkoutId,JSON.stringify({
    guest_token:data.guest_token,
    guest_session_id:data.guest_session_id,
    lead_id:data.lead_id,
    created_at:new Date().toISOString()
   }));
  }

  if(data.tracking_token){
   sessionStorage.setItem('oyag_tracking_'+checkoutId,data.tracking_token);
   localStorage.setItem('oyag_tracking_'+checkoutId,data.tracking_token);
  }

  sessionStorage.setItem('oyag_last_lead',JSON.stringify({
   lead_id:data.lead_id,
   email,
   whatsapp,
   full_name:fullName
  }));

  location.assign('./checkout.html?id='+encodeURIComponent(checkoutId));
 }catch(err){
  console.error('OYAG_LEAD_PURCHASE',err);
  leadError.textContent='Não foi possível continuar agora. Tente novamente.';
  statusEl.textContent='A compra não foi iniciada.';
  buying=false;
  leadContinue.disabled=false;
  leadContinue.textContent='Continuar para o pagamento';
 }
});

async function load(){
 statusEl.textContent='Carregando vitrine…';
 const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/oyag_public_marketplace_list',{
  method:'POST',
  headers:{apikey:cfg.supabasePublishableKey,'content-type':'application/json'},
  body:'{}'
 });
 const data=await r.json().catch(()=>null);
 if(!r.ok||!Array.isArray(data)){
  console.error('OYAG_MARKETPLACE',data);
  statusEl.textContent='Não foi possível carregar a vitrine agora. Tente novamente.';
  return;
 }
 items=data;
 catEl.innerHTML='<option value="">Todas as categorias</option>';
 [...new Set(items.map(x=>x.category).filter(Boolean))].sort().forEach(c=>catEl.insertAdjacentHTML('beforeend','<option>'+esc(c)+'</option>'));
 render();
 const params=new URLSearchParams(location.search),pending=params.get('buy');
 if(pending&&items.some(x=>x.id===pending)){
  params.delete('buy');
  history.replaceState({},'',location.pathname+(params.toString()?'?'+params.toString():'')+location.hash);
  await startBuy(pending);
 }
}
grid.addEventListener('click',e=>{const b=e.target.closest('[data-buy]');if(b)startBuy(b.dataset.buy)});
[searchEl,catEl,orderEl].forEach(x=>x.addEventListener('input',render));
load();