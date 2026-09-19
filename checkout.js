const cfg=window.OYAG_CONFIG;
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const id=new URLSearchParams(location.search).get('id');
const statusEl=document.querySelector('#checkoutStatus');
const summaryEl=document.querySelector('#orderSummary');
const paymentMessage=document.querySelector('#paymentMessage');
const paymentActionEl=document.querySelector('#paymentAction');
const paymentSelector=document.querySelector('#paymentSelector');
const paymentProviderLabel=document.querySelector('#paymentProviderLabel');
const buyerDocumentInput=document.querySelector('#buyerDocument');
const buyerDocumentError=document.querySelector('#buyerDocumentError');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur||'BRL'}).format(Number(c||0)/100);
let session=null,guestToken=null,checkout=null,orders=[],items=[],shippingAddress=null;

function onlyDigits(v){return String(v||'').replace(/\D/g,'')}
function normalizeDocument(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,14)}
function formatDocument(v){
 const d=normalizeDocument(v);
 if(/^\d{0,11}$/.test(d)){
  return d.replace(/(\d{3})(\d)/,'$1.$2')
          .replace(/(\d{3})(\d)/,'$1.$2')
          .replace(/(\d{3})(\d{1,2})$/,'$1-$2');
 }
 return d.replace(/([A-Z0-9]{2})([A-Z0-9])/,'$1.$2')
         .replace(/([A-Z0-9]{3})([A-Z0-9])/,'$1.$2')
         .replace(/([A-Z0-9]{3})([A-Z0-9])/,'$1/$2')
         .replace(/([A-Z0-9]{4})(\d{1,2})$/,'$1-$2');
}
function validCPF(cpf){
 cpf=onlyDigits(cpf);
 if(cpf.length!==11||/^(\d)\1+$/.test(cpf))return false;
 let sum=0;for(let i=0;i<9;i++)sum+=Number(cpf[i])*(10-i);
 let d=(sum*10)%11;if(d===10)d=0;if(d!==Number(cpf[9]))return false;
 sum=0;for(let i=0;i<10;i++)sum+=Number(cpf[i])*(11-i);
 d=(sum*10)%11;if(d===10)d=0;return d===Number(cpf[10]);
}
function cnpjCharValue(ch){return ch.charCodeAt(0)-48}
function validCNPJ(cnpj){
 cnpj=normalizeDocument(cnpj);
 if(!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)||/^(\d)\1+$/.test(cnpj))return false;
 const calc=(base,weights)=>{
  const sum=[...base].reduce((a,ch,i)=>a+cnpjCharValue(ch)*weights[i],0);
  const r=sum%11;return r===0||r===1?0:11-r;
 };
 const d1=calc(cnpj.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
 const d2=calc(cnpj.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 return d1===Number(cnpj[12])&&d2===Number(cnpj[13]);
}
function getBuyerIdentification(showError=true){
 const raw=normalizeDocument(buyerDocumentInput?.value);
 const isCPF=/^\d{11}$/.test(raw);
 const isCNPJ=/^[A-Z0-9]{12}\d{2}$/.test(raw);
 const type=isCPF?'CPF':isCNPJ?'CNPJ':null;
 const valid=type==='CPF'?validCPF(raw):type==='CNPJ'?validCNPJ(raw):false;
 if(showError&&buyerDocumentError)buyerDocumentError.textContent=valid?'':'Informe um CPF ou CNPJ válido para continuar.';
 return valid?{type,number:raw}:null;
}
if(buyerDocumentInput){
 buyerDocumentInput.addEventListener('input',()=>{
  buyerDocumentInput.value=formatDocument(buyerDocumentInput.value);
  if(buyerDocumentError.textContent)getBuyerIdentification(true);
 });
}

function getStoredGuestToken(){
 if(!id)return null;
 try{
  const raw=sessionStorage.getItem('oyag_guest_checkout_'+id);
  const data=raw?JSON.parse(raw):null;
  return String(data?.guest_token||'').trim()||null;
 }catch{return null}
}

function renderSummary(){
 const byOrder=new Map(orders.map(o=>[o.id,[]]));
 items.forEach(i=>{if(byOrder.has(i.order_id))byOrder.get(i.order_id).push(i)});
 const addressHtml=shippingAddress
  ? '<div class="shipping-review"><div class="shipping-review-title">Endereço de entrega</div><span>Destinatário</span><strong>'+esc(shippingAddress.recipient_name||'')+'</strong><p>'+
      esc(shippingAddress.street||'')+', '+esc(shippingAddress.number||'')+
      (shippingAddress.complement?' · '+esc(shippingAddress.complement):'')+'<br>'+
      esc(shippingAddress.neighborhood||'')+' · '+esc(shippingAddress.city||'')+'/'+esc(shippingAddress.state||'')+
      ' · CEP '+esc(String(shippingAddress.postal_code||'').replace(/(\d{5})(\d{3})/,'$1-$2'))+
    '</p></div>'
  : '';
 summaryEl.innerHTML='<div class="section-title"><span>Resumo do pedido</span><b class="status-pill '+esc(orders[0]?.status||'')+'">'+esc(orders[0]?.status||checkout.status)+'</b></div>'+
 orders.map(o=>'<div class="seller-block"><div class="seller-name">'+esc(o.seller_name_snapshot||'Empresa OYAG')+'</div>'+
 (byOrder.get(o.id)||[]).map(i=>'<div class="order-line"><div><b>'+esc(i.name_snapshot)+'</b><small>'+esc(i.quantity)+' × '+esc(money(i.unit_price_cents,i.currency))+'</small></div><strong>'+esc(money(i.line_total_cents,i.currency))+'</strong></div>').join('')+
 '<div class="totals"><div><span>Subtotal</span><b>'+esc(money(o.subtotal_cents,o.currency))+'</b></div><div><span>Entrega</span><b>'+esc(money(o.shipping_cents,o.currency))+'</b></div><div class="grand"><span>Total</span><b>'+esc(money(o.total_cents,o.currency))+'</b></div></div></div>').join('')+
 addressHtml+
 '<div class="secure-note">Revise os dados antes de seguir para o pagamento. O preço exibido é o snapshot gravado no pedido.</div>';
}

async function loadAuthenticated(){
 const c=await sb.from('oyag_checkouts').select('id,status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,created_at,completed_at,payment_provider,payment_provider_status').eq('id',id).maybeSingle();
 if(c.error||!c.data)throw new Error('checkout_not_available');
 checkout=c.data;
 const o=await sb.from('oyag_orders').select('id,order_number,seller_organization_id,seller_name_snapshot,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,provider_order_id,provider_payment_id,metadata,created_at,paid_at').eq('checkout_id',id).order('order_number');
 if(o.error||!o.data?.length)throw new Error('orders_not_available');
 orders=o.data;
 const it=await sb.from('oyag_order_items').select('order_id,name_snapshot,description_snapshot,image_url_snapshot,unit_price_cents,quantity,line_total_cents,currency').in('order_id',orders.map(x=>x.id));
 if(it.error)throw new Error('items_not_available');
 items=it.data||[];
 const addr=await sb.from('oyag_checkout_shipping_addresses')
   .select('recipient_name,recipient_phone,postal_code,street,number,complement,neighborhood,city,state,country_code')
   .eq('checkout_id',id).maybeSingle();
 if(!addr.error)shippingAddress=addr.data||null;
}

async function loadGuest(){
 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-get-guest-checkout',{
  method:'POST',
  cache:'no-store',
  headers:{apikey:cfg.supabasePublishableKey,'content-type':'application/json'},
  body:JSON.stringify({checkout_id:id,guest_token:guestToken})
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw new Error(data?.error||'guest_checkout_not_available');
 checkout=data.checkout;
 orders=data.orders||[];
 items=data.items||[];
 shippingAddress=data.shipping_address||null;
 if(!checkout||!orders.length)throw new Error('guest_checkout_not_available');
}

async function tryAsaasCheckout(method,paymentWindow=null){
 const identification=getBuyerIdentification(true);
 if(!identification)return false;
 const attemptId=crypto.randomUUID();
 const headers={
  apikey:cfg.supabasePublishableKey,
  'content-type':'application/json',
  'x-idempotency-key':attemptId
 };
 if(session?.access_token)headers.authorization='Bearer '+session.access_token;
 const body={checkout_id:checkout.id,buyer_document:identification,payment_method:method};
 if(guestToken)body.guest_token=guestToken;

 const r=await fetch(cfg.supabaseUrl+'/functions/v1/asaas-create-checkout',{
  method:'POST',headers,body:JSON.stringify(body)
 });
 const data=await r.json().catch(()=>({}));

 if(r.ok&&data?.ok&&data?.checkout_url){
  paymentProviderLabel.textContent='Asaas';
  paymentMessage.className='payment-message ok';
  paymentMessage.textContent='Abrindo o pagamento seguro Asaas…';
  const url=String(data.checkout_url);
  if(paymentWindow&&!paymentWindow.closed){
   try{paymentWindow.opener=null}catch{}
   paymentWindow.location.replace(url);
  }else if(window.self===window.top){
   location.assign(url);
  }else{
   paymentActionEl.innerHTML='<a class="button primary" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Abrir pagamento seguro no Asaas</a>';
   paymentMessage.textContent='Abra o pagamento seguro do Asaas em uma nova aba.';
  }
  return true;
 }

 if(paymentWindow&&!paymentWindow.closed)paymentWindow.close();
 paymentMessage.className='payment-message error';

 if(data?.error==='asaas_card_minimum_amount'){
  paymentMessage.textContent='O valor deste pedido não atende ao mínimo exigido para cartão. Use Pix.';
 }else if(data?.error==='asaas_checkout_rejected'){
  const providerDescription=Array.isArray(data?.provider_errors)?data.provider_errors.map(x=>x?.description).filter(Boolean).join(' · '):'';
  paymentMessage.textContent=providerDescription?'O Asaas recusou o checkout: '+providerDescription:'O Asaas recusou a criação do checkout.';
 }else if(data?.error==='invalid_guest_token'||data?.error==='guest_token_required'){
  paymentMessage.textContent='A sessão desta compra expirou. Volte à vitrine e inicie uma nova compra.';
 }else{
  paymentMessage.textContent='Não foi possível iniciar o pagamento no Asaas. Tente novamente.';
 }
 return true;
}

async function renderPayment(){
 paymentProviderLabel.textContent='Asaas';
 const boleto=paymentSelector?.querySelector('[data-method="boleto"]');
 if(boleto)boleto.disabled=true;

 if(orders.length!==1){
  paymentMessage.textContent='O carrinho multiempresa será liberado quando as contas vendedoras estiverem prontas para split.';
  paymentSelector?.querySelectorAll('button').forEach(b=>b.disabled=true);
  return;
 }
 const order=orders[0];
 if(['paid','preparing','shipped','delivered','awaiting_confirmation','completed'].includes(order.status)||order.payment_status==='approved'){
  paymentMessage.className='payment-message ok';
  paymentMessage.textContent='Pagamento confirmado. O pedido já está registrado no OYAG.';
  paymentSelector?.querySelectorAll('button').forEach(b=>b.disabled=true);
  return;
 }

 paymentMessage.textContent='Informe CPF ou CNPJ e escolha Pix ou Cartão.';
 paymentSelector?.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-method]');
  if(!b||b.disabled)return;
  const method=b.dataset.method;
  if(!['pix','card'].includes(method))return;
  if(!getBuyerIdentification(true)){buyerDocumentInput?.focus();return}

  paymentSelector.querySelectorAll('button').forEach(btn=>btn.disabled=true);
  let paymentWindow=null;
  if(window.self!==window.top){
   paymentWindow=window.open('about:blank','oyag_asaas_checkout');
   if(paymentWindow){
    try{
     paymentWindow.document.title='OYAG · Pagamento seguro';
     paymentWindow.document.body.innerHTML='<div style="font-family:system-ui;padding:28px"><strong>OYAG Ecosystem</strong><p>Abrindo o pagamento seguro no Asaas…</p></div>';
    }catch{}
   }
  }
  await tryAsaasCheckout(method,paymentWindow);
  if(!location.href.includes('asaas'))paymentSelector.querySelectorAll('button').forEach(btn=>{btn.disabled=btn.dataset.method==='boleto'});
 });
}

async function init(){
 if(!id){statusEl.textContent='Pedido não informado.';return}
 guestToken=getStoredGuestToken();
 const auth=await sb.auth.getSession();
 session=auth?.data?.session||null;

 try{
  if(guestToken)await loadGuest();
  else if(session)await loadAuthenticated();
  else{
   statusEl.textContent='Esta sessão de compra não está disponível. Volte à vitrine e inicie uma nova compra.';
   paymentSelector?.querySelectorAll('button').forEach(b=>b.disabled=true);
   return;
  }
 }catch(e){
  console.error('OYAG_CHECKOUT_LOAD',e);
  statusEl.textContent='Não foi possível carregar este pedido. Volte à vitrine e tente novamente.';
  paymentSelector?.querySelectorAll('button').forEach(b=>b.disabled=true);
  return;
 }

 statusEl.textContent='Pedido #'+orders.map(x=>x.order_number).join(', #')+' · '+money(checkout.total_cents,checkout.currency);
 renderSummary();
 await renderPayment();
}
init().catch(e=>{console.error('OYAG_CHECKOUT',e);statusEl.textContent='Não foi possível iniciar o checkout.'});
