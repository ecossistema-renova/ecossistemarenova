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
const paymentProviderLabel=document.querySelector('#paymentProviderLabel');
const buyerDocumentInput=document.querySelector('#buyerDocument');
const buyerDocumentError=document.querySelector('#buyerDocumentError');
let selectedMethod=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur||'BRL'}).format(Number(c||0)/100);
let session,checkout,orders=[],items=[];

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
 if(showError&&buyerDocumentError){
  buyerDocumentError.textContent=valid?'':'Informe um CPF ou CNPJ válido para continuar.';
 }
 return valid?{type,number:raw}:null;
}
if(buyerDocumentInput){
 buyerDocumentInput.addEventListener('input',()=>{
  buyerDocumentInput.value=formatDocument(buyerDocumentInput.value);
  if(buyerDocumentError.textContent)getBuyerIdentification(true);
 });
}

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
 const identification=getBuyerIdentification(true);
 if(!identification)throw new Error('buyer_document_invalid');
 formData=formData&&typeof formData==='object'?structuredClone(formData):{};
 formData.payer=formData.payer&&typeof formData.payer==='object'?formData.payer:{};
 formData.payer.identification=identification;
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
 if(paymentProviderLabel)paymentProviderLabel.textContent='Mercado Pago';
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
       payer_document_required:'Informe CPF ou CNPJ para continuar com este pagamento.',
       buyer_document_invalid:'Informe um CPF ou CNPJ válido para continuar.',
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

async function tryAsaasCheckout(method){
  const identification=getBuyerIdentification(true);
  if(!identification)return false;
  const attemptId=crypto.randomUUID();
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/asaas-create-checkout',{
    method:'POST',
    headers:{
      apikey:cfg.supabasePublishableKey,
      authorization:'Bearer '+session.access_token,
      'content-type':'application/json',
      'x-idempotency-key':attemptId
    },
    body:JSON.stringify({checkout_id:checkout.id,buyer_document:identification,payment_method:method})
  });
  const data=await r.json().catch(()=>({}));
  if(r.ok&&data?.ok&&data?.checkout_url){
    if(paymentProviderLabel)paymentProviderLabel.textContent='Asaas';
    paymentMessage.className='payment-message ok';
    paymentMessage.textContent='Abrindo o checkout seguro Asaas…';
    location.assign(data.checkout_url);
    return true;
  }
  if(['asaas_not_activated','asaas_credentials_required','asaas_parent_account_not_active','asaas_checkout_not_ready','asaas_parent_account_missing'].includes(data?.error)){
    paymentMessage.className='payment-message error';
    paymentMessage.textContent='O checkout Asaas ainda não está liberado para esta conta. Nenhuma cobrança será enviada ao Mercado Pago.';
    if(paymentSelector) paymentSelector.style.display='none';
    const mpContainer=document.querySelector('#paymentBrick_container');
    if(mpContainer) mpContainer.innerHTML='';
    return true;
  }
  if(data?.error==='asaas_marketplace_not_ready'){
    paymentMessage.className='payment-message error';
    paymentMessage.textContent='Este carrinho possui mais de uma empresa. O checkout comum está disponível, mas o split multiempresa ainda aguarda liberação da conta-pai empresarial.';
    if(paymentSelector) paymentSelector.style.display='none';
    const mpContainer=document.querySelector('#paymentBrick_container');
    if(mpContainer) mpContainer.innerHTML='';
    return true;
  }
  if(data?.error==='asaas_card_minimum_amount'){
    paymentMessage.className='payment-message error';
    paymentMessage.textContent='Para este pedido de R$ 1,00 use Pix. O cartão exige valor mínimo compatível com as regras da operadora.';
    return true;
  }
  if(data?.error==='asaas_checkout_rejected'){
    const providerDescription=Array.isArray(data?.provider_errors)
      ? data.provider_errors.map(x=>x?.description).filter(Boolean).join(' · ')
      : '';
    paymentMessage.className='payment-message error';
    paymentMessage.textContent=providerDescription
      ? 'O Asaas recusou a criação do checkout: '+providerDescription
      : 'O Asaas recusou a criação do checkout. O erro foi registrado para diagnóstico.';
    return true;
  }
  if(data?.error){
    paymentMessage.className='payment-message error';
    paymentMessage.textContent='Não foi possível iniciar o pagamento Asaas: '+data.error;
    return true;
  }
  return false;
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
 paymentMessage.textContent='Informe CPF ou CNPJ e escolha a forma de pagamento.';
 paymentSelector?.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-method]');
  if(!b||b.disabled)return;
  const method=b.dataset.method;
  if(!getBuyerIdentification(true)){
   buyerDocumentInput?.focus();
   return;
  }
  if(['pix','card'].includes(method)){
   const asaasStarted=await tryAsaasCheckout(method);
   if(asaasStarted)return;
  }
  if(method==='boleto'){
   paymentMessage.className='payment-message error';
   paymentMessage.textContent='Boleto Asaas será habilitado pelo fluxo de cobrança próprio. Ele não será enviado ao Mercado Pago.';
   return;
  }
  paymentMessage.className='payment-message error';
  paymentMessage.textContent='Forma de pagamento temporariamente indisponível.';
 });
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