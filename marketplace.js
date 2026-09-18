const cfg=window.OYAG_CONFIG;
const oyagStorage={
 getItem(key){
  const remember=localStorage.getItem('oyag_remember')!=='0',primary=remember?localStorage:sessionStorage,secondary=remember?sessionStorage:localStorage;
  return primary.getItem(key)??secondary.getItem(key);
 },
 setItem(key,value){
  const remember=localStorage.getItem('oyag_remember')!=='0',primary=remember?localStorage:sessionStorage,secondary=remember?sessionStorage:localStorage;
  primary.setItem(key,value);secondary.removeItem(key);
 },
 removeItem(key){localStorage.removeItem(key);sessionStorage.removeItem(key)}
};
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,storage:oyagStorage}});
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

async function startBuy(itemId){
 if(buying)return;
 const item=items.find(x=>x.id===itemId);
 if(!item){statusEl.textContent='Este produto não está disponível agora.';return}
 const {data}=await sb.auth.getSession();
 const session=data.session;
 if(!session){
  const next='./marketplace.html?buy='+encodeURIComponent(itemId);
  location.href='./login.html?next='+encodeURIComponent(next);
  return;
 }
 buying=true;
 statusEl.textContent='Criando seu pedido com o preço confirmado no servidor…';
 grid.querySelectorAll('[data-buy]').forEach(b=>b.disabled=true);
 const idem=crypto.randomUUID();
 try{
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-create-checkout',{
   method:'POST',
   headers:{
    apikey:cfg.supabasePublishableKey,
    authorization:'Bearer '+session.access_token,
    'content-type':'application/json',
    'x-idempotency-key':idem
   },
   body:JSON.stringify({items:[{catalog_item_id:itemId,quantity:1}],idempotency_key:idem})
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||!data.ok)throw new Error(data?.detail||data?.error||'Não foi possível criar o pedido.');
  const checkoutId=data.checkout?.checkout_id;
  if(!checkoutId)throw new Error('Checkout não retornado.');
  location.assign('./checkout.html?id='+encodeURIComponent(checkoutId));
 }catch(e){
  console.error('OYAG_BUY',e);
  statusEl.textContent='Não foi possível iniciar a compra. Tente novamente.';
  buying=false;
  grid.querySelectorAll('[data-buy]').forEach(b=>b.disabled=false);
 }
}

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