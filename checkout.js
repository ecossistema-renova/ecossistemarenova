const cfg=window.OYAG_CONFIG;
const legacySessionKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
if(!localStorage.getItem(legacySessionKey)&&sessionStorage.getItem(legacySessionKey)){
  localStorage.setItem(legacySessionKey,sessionStorage.getItem(legacySessionKey));
  sessionStorage.removeItem(legacySessionKey);
}
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const id=new URLSearchParams(location.search).get('id');
const statusEl=document.querySelector('#checkoutStatus');
const summaryEl=document.querySelector('#orderSummary');
const paymentMessage=document.querySelector('#paymentMessage');
const paymentActionEl=document.querySelector('#paymentAction');
const paymentSelector=document.querySelector('#paymentSelector');
let selectedMethod='card';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur||'BRL'}).format(Number(c||0)/100);
let session,checkout,orders=[],items=[];

function loginRedirect(){
 const next='./checkout.html?id='+encodeURIComponent(id||'');
 location.replace('./login.html?next='+encodeURIComponent(next));
}

function renderSummary(){
 const byOrder=new Map(orders.map(o=>[o.id,[]]));
 items.forEach(i=>{if(byOrder.has(i.order_id))byOrder.get(i.order_id).push(i)});
 summaryEl.innerHTML='<div class="section-title"><span>Resumo do pedido</span><b class="status-pill '+esc(orders[0]?.status||'')+'">'+esc(orders[0]?.status||checkout.status)+'</b></div>'+
 orders.map(o=>'<div class="seller-block"><div class="seller-name">'+esc(o.seller_name_snapshot||'Empresa OYAG')+'</div>'+
 (byOrder.get(o.id)||[]).map(i=>'<div class="order-line"><div><b>'+esc(i.name_snapshot)+'</b><small>'+esc(i.quantity)+' × '+esc(money(i.unit_price_cents,i.currency))+'</small></div><strong>'+esc(money(i.line_total_cents,i.currency))+'</strong></div>').join('')+
 '<div class="totals"><div><span>Subtotal</span><b>'+esc(money(o.subtotal_cents,o.currency))+'</b></div><div><span>Entrega</span><b>'+esc(money(o.shipping_cents,o.currency))+'</b></div><div class="grand"><span>Total</span><b>'+esc(money(o.total_cents,o.currency))+'</b></div></div></div>').join('')+
 '<div class="secure-note">O preço exibido aqui é o snapshot gravado no pedido. Alterações futuras no catálogo não mudam esta compra.</div>';
}

async function invokePayment(selectedPaymentMethod,formData){
 const attemptId=crypto.randomUUID();
 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-process-payment',{
  method:'POST',
  headers:{
   apikey:cfg.supabasePublishableKey,
   authorization:'Bearer '+session.access_token,
   'content-type':'application/json',
   'x-idempotency-key':attemptId
  },
  body:JSON.stringify({
   checkout_id:checkout.id,
   attempt_id:attemptId,
   selected_payment_method:selectedPaymentMethod,
   form_data:formData
  })
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw new Error(data?.provider?.message||data?.detail||data?.error||'Não foi possível processar o pagamento.');
 return data;
}

function renderPaymentAction(action){
 if(!paymentActionEl)return;
 if(!action){paymentActionEl.innerHTML='';return}
 if(action.type==='pix'){
  paymentActionEl.innerHTML='<div class="payment-action"><h3>Pix gerado</h3><p>Escaneie o QR Code ou copie o código Pix. O pedido será atualizado automaticamente após a confirmação.</p>'+
   (action.qr_code_base64?'<img class="pix-qr" src="data:image/png;base64,'+esc(action.qr_code_base64)+'" alt="QR Code Pix">':'')+
   (action.qr_code?'<textarea class="copy-code" readonly>'+esc(action.qr_code)+'</textarea><button class="button secondary" type="button" id="copyPix">Copiar código Pix</button>':'')+
   '<div class="payment-waiting">Aguardando confirmação do Mercado Pago.</div></div>';
  const b=document.querySelector('#copyPix');if(b)b.onclick=async()=>{await navigator.clipboard.writeText(action.qr_code);b.textContent='Código copiado ✓'};
  return;
 }
 if(action.type==='boleto'){
  paymentActionEl.innerHTML='<div class="payment-action"><h3>Boleto gerado</h3><p>O pedido ficará aguardando pagamento até a confirmação bancária.</p>'+
   (action.digitable_line?'<div class="boleto-line">'+esc(action.digitable_line)+'</div><button class="button secondary" type="button" id="copyBoleto">Copiar linha digitável</button>':'')+
   (action.ticket_url?'<a class="button primary" href="'+esc(action.ticket_url)+'" target="_blank" rel="noopener">Abrir boleto</a>':'')+
   '<div class="payment-waiting">A compensação pode levar algum tempo após o pagamento.</div></div>';
  const b=document.querySelector('#copyBoleto');if(b)b.onclick=async()=>{await navigator.clipboard.writeText(action.digitable_line);b.textContent='Linha copiada ✓'};
 }
}

async function mountPaymentBrick(method){
 if(window.paymentBrickController?.unmount){
  try{await window.paymentBrickController.unmount()}catch{}
 }
 const container=document.querySelector('#paymentBrick_container');
 container.innerHTML='';
 paymentActionEl.innerHTML='';
 selectedMethod=method;
 paymentSelector?.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.method===method));

 const methodLabels={pix:'Pix',card:'Cartão',boleto:'Boleto'};
 paymentMessage.className='payment-message';
 paymentMessage.textContent='Carregando '+methodLabels[method]+'…';

 const paymentMethods=method==='pix'
  ? {bankTransfer:'all'}
  : method==='boleto'
    ? {ticket:'all'}
    : {creditCard:'all',debitCard:'all',prepaidCard:'all'};

 const mp=new MercadoPago(cfg.mercadoPagoPublicKey,{locale:'pt-BR'});
 const bricksBuilder=mp.bricks();

 try{
  window.paymentBrickController=await bricksBuilder.create('payment','paymentBrick_container',{
   initialization:{amount:Number(checkout.total_cents)/100},
   customization:{paymentMethods},
   callbacks:{
    onReady:()=>{
     paymentMessage.textContent=method==='pix'
      ? 'Pague por Pix. O QR Code será gerado após confirmar os dados.'
      : method==='boleto'
        ? 'Pague por boleto. Preencha os dados solicitados para gerar o boleto.'
        : 'Pague com cartão de crédito ou débito.';
    },
    onSubmit:({selectedPaymentMethod,formData})=>new Promise(async(resolve,reject)=>{
     paymentMessage.className='payment-message';
     paymentMessage.textContent='Processando '+methodLabels[method]+'…';
     try{
      const result=await invokePayment(selectedPaymentMethod,formData);
      renderPaymentAction(result.payment_action||null);
      paymentMessage.className='payment-message ok';
      if(result.payment_status==='approved')paymentMessage.textContent='Pagamento aprovado. Pedido atualizado.';
      else if(result.payment_action?.type==='pix')paymentMessage.textContent='Pix gerado. Use o QR Code ou o código copia e cola.';
      else if(result.payment_action?.type==='boleto')paymentMessage.textContent='Boleto gerado. Use a linha digitável ou abra o boleto.';
      else paymentMessage.textContent='Pagamento enviado. Aguardando confirmação do Mercado Pago.';
      resolve();
     }catch(e){
      const code=String(e?.message||'');
      const friendly={
       payment_method_missing:'Não foi possível identificar a forma de pagamento. Selecione novamente.',
       payer_document_required:'Informe CPF/CNPJ para continuar com este pagamento.',
       boleto_address_required:'Preencha o endereço completo para gerar o boleto.',
       unsupported_payment_method:'Esta forma de pagamento não está habilitada para esta conta Mercado Pago.',
       mercado_pago_rejected:'O Mercado Pago não aceitou a solicitação. Revise os dados e tente novamente.'
      };
      paymentMessage.className='payment-message error';
      paymentMessage.textContent=friendly[code]||code||'Não foi possível processar o pagamento.';
      reject();
     }
    }),
    onError:(error)=>{
     console.error('OYAG_MP_BRICK',error);
     paymentMessage.className='payment-message error';
     paymentMessage.textContent='Este meio de pagamento não pôde ser carregado. Verifique se está habilitado na conta Mercado Pago.';
    }
   }
  });
 }catch(error){
  console.error('OYAG_MP_BRICK_CREATE',error);
  paymentMessage.className='payment-message error';
  paymentMessage.textContent='Não foi possível disponibilizar '+methodLabels[method]+' neste momento.';
 }
}

async function renderPayment(){
 if(orders.length!==1){
  paymentMessage.textContent='O processamento financeiro multiempresa será ativado após a conexão das contas vendedoras.';
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
 if(!cfg.mercadoPagoPublicKey){
  paymentMessage.className='payment-message error';
  paymentMessage.textContent='Checkout temporariamente indisponível.';
  return;
 }
 const existingAction=order.metadata?.payment_action||null;
 if(existingAction&&order.payment_status==='processing'){
  renderPaymentAction(existingAction);
  paymentMessage.className='payment-message ok';
  paymentMessage.textContent=existingAction.type==='pix'?'Pix aguardando pagamento.':'Boleto aguardando pagamento.';
  paymentSelector?.querySelectorAll('button').forEach(b=>b.disabled=true);
  return;
 }
 paymentSelector?.addEventListener('click',e=>{
  const b=e.target.closest('button[data-method]');
  if(b&&!b.disabled&&b.dataset.method!==selectedMethod)mountPaymentBrick(b.dataset.method);
 });
 await mountPaymentBrick('card');
}
async function init(){
 if(!id){statusEl.textContent='Pedido não informado.';return}
 const {data}=await sb.auth.getSession();
 session=data.session;
 if(!session){loginRedirect();return}

 const c=await sb.from('oyag_checkouts').select('id,status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,created_at').eq('id',id).maybeSingle();
 if(c.error||!c.data){statusEl.textContent='Este checkout não está disponível para sua conta.';return}
 checkout=c.data;

 const o=await sb.from('oyag_orders').select('id,order_number,seller_organization_id,seller_name_snapshot,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,provider_order_id,provider_payment_id,metadata,created_at').eq('checkout_id',id).order('order_number');
 if(o.error||!o.data?.length){statusEl.textContent='Não foi possível carregar os pedidos deste checkout.';return}
 orders=o.data;

 const it=await sb.from('oyag_order_items').select('order_id,name_snapshot,description_snapshot,image_url_snapshot,unit_price_cents,quantity,line_total_cents,currency').in('order_id',orders.map(x=>x.id));
 if(it.error){statusEl.textContent='Não foi possível carregar os itens do pedido.';return}
 items=it.data||[];

 statusEl.textContent='Pedido #'+orders.map(x=>x.order_number).join(', #')+' · '+money(checkout.total_cents,checkout.currency);
 renderSummary();
 await renderPayment();
}
init().catch(e=>{console.error('OYAG_CHECKOUT',e);statusEl.textContent='Não foi possível iniciar o checkout.'});