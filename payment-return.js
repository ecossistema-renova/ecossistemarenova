const cfg=window.OYAG_CONFIG;
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});

const p=new URLSearchParams(location.search);
const checkoutId=p.get('checkout');
const navStatus=p.get('status')||'return';
const returnToken=p.get('rt')||'';

const title=document.querySelector('#paymentReturnTitle');
const text=document.querySelector('#paymentReturnText');
const statusEl=document.querySelector('#paymentReturnStatus');
const back=document.querySelector('#returnCheckoutLink');
const track=document.querySelector('#trackOrderLink');
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur}).format(Number(c||0)/100);

if(checkoutId)back.href='./checkout.html?id='+encodeURIComponent(checkoutId);

let trackingToken=checkoutId
  ? (sessionStorage.getItem('oyag_tracking_'+checkoutId)||localStorage.getItem('oyag_tracking_'+checkoutId))
  : null;

function applyTrackingLink(){
 if(!track||!trackingToken)return;
 track.hidden=false;
 track.href='./order-tracking.html#token='+encodeURIComponent(trackingToken);
}

async function exchangeReturnAccess(){
 if(trackingToken){applyTrackingLink();return true}
 if(!checkoutId||!returnToken)return false;

 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-order-tracking',{
  method:'POST',
  headers:{apikey:cfg.supabasePublishableKey,'content-type':'application/json'},
  body:JSON.stringify({
   action:'exchange_return',
   checkout_id:checkoutId,
   return_token:returnToken
  })
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data?.ok||!data?.tracking_token)return false;

 trackingToken=String(data.tracking_token);
 sessionStorage.setItem('oyag_tracking_'+checkoutId,trackingToken);
 localStorage.setItem('oyag_tracking_'+checkoutId,trackingToken);
 applyTrackingLink();

 // Remove o token transitório da barra de endereço assim que ele é trocado.
 const clean=new URL(location.href);
 clean.searchParams.delete('rt');
 history.replaceState({},'',clean.pathname+clean.search);
 return true;
}

async function publicTrackingStatus(){
 if(!trackingToken)return null;
 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-order-tracking',{
  method:'POST',
  headers:{apikey:cfg.supabasePublishableKey,'content-type':'application/json'},
  body:JSON.stringify({token:trackingToken})
 });
 const data=await r.json().catch(()=>null);
 if(!r.ok||!data?.ok)return null;
 return data;
}

async function authenticatedStatus(){
 if(!checkoutId)return null;
 const {data:{session}}=await sb.auth.getSession();
 if(!session)return null;
 const {data,error}=await sb.from('oyag_checkouts')
   .select('id,status,total_cents,currency,payment_provider,payment_provider_status,provider_payment_id')
   .eq('id',checkoutId).maybeSingle();
 return error?null:data;
}

async function refresh(){
 if(!checkoutId){
  title.textContent='Não foi possível identificar o pedido.';
  statusEl.textContent='Checkout não informado.';
  return false;
 }

 await exchangeReturnAccess();

 const tracked=await publicTrackingStatus();
 if(tracked?.orders?.length){
   const orders=tracked.orders;
   const paid=orders.every(o=>o.payment_status==='approved'||['paid','preparing','shipped','delivered','awaiting_confirmation','completed'].includes(o.status));
   if(paid){
     const total=orders.reduce((a,o)=>a+Number(o.total_cents||0),0);
     title.textContent='Pagamento confirmado.';
     text.textContent='O OYAG recebeu a confirmação financeira. Você já pode acompanhar a preparação e a entrega do pedido.';
     statusEl.textContent='Pagamento confirmado · '+money(total,orders[0]?.currency||'BRL');
     applyTrackingLink();
     return true;
   }
 }

 const data=await authenticatedStatus();
 if(data){
   if(data.status==='paid'||data.status==='completed'){
     title.textContent='Pagamento confirmado.';
     text.textContent='O OYAG recebeu a confirmação financeira do provedor.';
     statusEl.textContent='Pagamento confirmado · '+money(data.total_cents,data.currency);
     if(!trackingToken){
       track.hidden=true;
     }
     return true;
   }
   if(data.status==='failed'){
     title.textContent='O pagamento precisa de atenção.';
     text.textContent='O provedor informou falha, cancelamento, estorno ou outra situação que exige revisão.';
     statusEl.textContent='Status: '+String(data.payment_provider_status||data.status);
     return false;
   }
 }

 title.textContent=navStatus==='cancel'
  ?'Pagamento não concluído.'
  :navStatus==='expired'
   ?'Checkout expirado.'
   :'Aguardando confirmação.';
 text.textContent='A confirmação financeira será atualizada automaticamente pelo webhook do Asaas.';
 statusEl.textContent='Aguardando atualização do pagamento…';
 return false;
}

async function poll(){
 for(let i=0;i<10;i++){
   const done=await refresh();
   if(done)return;
   await new Promise(r=>setTimeout(r,1800));
 }
}

poll().catch(err=>{
 console.error('OYAG_PAYMENT_RETURN',err);
 statusEl.textContent='Não foi possível consultar o pedido agora.';
});