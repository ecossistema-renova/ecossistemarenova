const cfg=window.OYAG_CONFIG;
const oyagStorage=localStorage.getItem('oyag_remember')!=='0'?localStorage:sessionStorage;
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,storage:oyagStorage}});
const id=new URLSearchParams(location.search).get('id');
const statusEl=document.querySelector('#checkoutStatus');
const summaryEl=document.querySelector('#orderSummary');
const paymentMessage=document.querySelector('#paymentMessage');
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

async function invokePayment(formData,additionalData){
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
   token:formData.token,
   payment_method_id:formData.payment_method_id,
   payment_type_id:additionalData?.paymentTypeId||formData.payment_type_id||'credit_card',
   installments:Number(formData.installments||1),
   identification:formData.payer?.identification||null
  })
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw new Error(data?.provider?.message||data?.detail||data?.error||'Não foi possível processar o pagamento.');
 return data;
}

async function renderPayment(){
 if(orders.length!==1){
  paymentMessage.textContent='O carrinho já está preparado para separar pedidos por empresa. O processamento financeiro multiempresa será ativado na etapa de conexão das contas vendedoras.';
  return;
 }
 const order=orders[0];
 if(['paid','preparing','shipped','delivered','awaiting_confirmation','completed'].includes(order.status)||order.payment_status==='approved'){
  paymentMessage.className='payment-message ok';
  paymentMessage.textContent='Pagamento confirmado. O pedido já está registrado no OYAG.';
  return;
 }
 if(!cfg.mercadoPagoPublicKey){
  paymentMessage.className='payment-message error';
  paymentMessage.textContent='Checkout temporariamente indisponível: credencial pública de pagamento não configurada.';
  return;
 }
 paymentMessage.textContent='Preencha os dados abaixo. O OYAG não recebe os dados brutos do cartão; a tokenização é realizada pelo Mercado Pago.';
 const mp=new MercadoPago(cfg.mercadoPagoPublicKey);
 const bricksBuilder=mp.bricks();
 await bricksBuilder.create('cardPayment','cardPaymentBrick_container',{
  initialization:{amount:Number(checkout.total_cents)/100},
  callbacks:{
   onReady:()=>{paymentMessage.textContent='Pagamento pronto para preenchimento.'},
   onSubmit:(formData,additionalData)=>new Promise(async(resolve,reject)=>{
    paymentMessage.className='payment-message';
    paymentMessage.textContent='Processando pagamento…';
    try{
     const result=await invokePayment(formData,additionalData);
     paymentMessage.className='payment-message ok';
     paymentMessage.textContent=result.payment_status==='approved'?'Pagamento aprovado. Atualizando pedido…':'Pagamento enviado. Aguardando confirmação do Mercado Pago…';
     resolve();
     setTimeout(()=>location.reload(),1200);
    }catch(e){
     paymentMessage.className='payment-message error';
     paymentMessage.textContent=e.message||'Não foi possível processar o pagamento.';
     reject();
    }
   }),
   onError:(error)=>{
    console.error('OYAG_MP_BRICK',error);
    paymentMessage.className='payment-message error';
    paymentMessage.textContent='O formulário de pagamento encontrou um erro. Tente novamente.';
   }
  }
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

 const o=await sb.from('oyag_orders').select('id,order_number,seller_organization_id,seller_name_snapshot,status,payment_status,currency,subtotal_cents,discount_cents,shipping_cents,total_cents,provider_order_id,provider_payment_id,created_at').eq('checkout_id',id).order('order_number');
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