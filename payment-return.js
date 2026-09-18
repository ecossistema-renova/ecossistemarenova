const cfg=window.OYAG_CONFIG;
const legacySessionKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
if(!localStorage.getItem(legacySessionKey)&&sessionStorage.getItem(legacySessionKey)){
  localStorage.setItem(legacySessionKey,sessionStorage.getItem(legacySessionKey));
  sessionStorage.removeItem(legacySessionKey);
}
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const p=new URLSearchParams(location.search);
const checkoutId=p.get('checkout');
const navStatus=p.get('status')||'return';
const title=document.querySelector('#paymentReturnTitle');
const text=document.querySelector('#paymentReturnText');
const statusEl=document.querySelector('#paymentReturnStatus');
const back=document.querySelector('#returnCheckoutLink');
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur}).format(Number(c||0)/100);

if(checkoutId) back.href='./checkout.html?id='+encodeURIComponent(checkoutId);

async function refresh(){
  if(!checkoutId){statusEl.textContent='Checkout não informado.';return}
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
    statusEl.textContent='Entre na sua conta para acompanhar o pedido.';
    return;
  }
  const {data,error}=await sb.from('oyag_checkouts')
    .select('id,status,total_cents,currency,payment_provider,payment_provider_status,provider_payment_id')
    .eq('id',checkoutId).maybeSingle();
  if(error||!data){statusEl.textContent='Não foi possível consultar este checkout.';return}

  if(data.status==='paid'||data.status==='completed'){
    title.textContent='Pagamento confirmado.';
    text.textContent='O OYAG recebeu a confirmação financeira do provedor.';
    statusEl.textContent='Pagamento confirmado · '+money(data.total_cents,data.currency);
    return;
  }
  if(data.status==='failed'){
    title.textContent='O pagamento precisa de atenção.';
    text.textContent='O provedor informou falha, cancelamento, estorno ou outra situação que exige revisão.';
    statusEl.textContent='Status: '+String(data.payment_provider_status||data.status);
    return;
  }

  title.textContent=navStatus==='cancel'?'Pagamento não concluído.':navStatus==='expired'?'Checkout expirado.':'Aguardando confirmação.';
  text.textContent='A confirmação financeira será atualizada automaticamente pelo webhook do Asaas.';
  statusEl.textContent='Status atual: '+String(data.payment_provider_status||data.status);
}
refresh().catch(()=>{statusEl.textContent='Não foi possível consultar o pedido agora.'});