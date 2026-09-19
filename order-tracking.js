const cfg=window.OYAG_CONFIG;
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const C=document.querySelector('#trackingContent');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=(c,cur='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur||'BRL'}).format(Number(c||0)/100);
const dt=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return '—'}};
const statusLabel=s=>({
 pending_payment:'Aguardando pagamento',paid:'Pagamento confirmado',preparing:'Em preparação',
 shipped:'Enviado',delivered:'Entregue',awaiting_confirmation:'Aguardando confirmação',
 completed:'Concluído',canceled:'Cancelado',failed:'Falha',
 posted:'Postado',in_transit:'Em trânsito',out_for_delivery:'Saiu para entrega',
 delivery_failed:'Tentativa de entrega',returned:'Devolvido'
}[s]||String(s||'—'));

function tokenFromHash(){
 const raw=location.hash.replace(/^#/,'');
 const p=new URLSearchParams(raw);
 const token=p.get('token');
 if(token)history.replaceState({},'',location.pathname);
 return token;
}
const token=tokenFromHash();
const checkoutId=new URLSearchParams(location.search).get('checkout');

function orderCard(order){
 const shipments=Array.isArray(order.shipments)?order.shipments:[];
 const items=Array.isArray(order.items)?order.items:[];
 const paid=order.payment_status==='approved'||['paid','preparing','shipped','delivered','awaiting_confirmation','completed'].includes(order.status);
 const hasDeliveredShipment=shipments.some(s=>s.status==='delivered');
 const canConfirm=order.status==='awaiting_confirmation'&&hasDeliveredShipment&&order.payment_status==='approved';
 const shipHtml=shipments.length?shipments.map(s=>{
  const events=Array.isArray(s.events)?s.events:[];
  return '<div class="shipment-box">'+
   '<div class="tracking-order-head"><div><p class="eyebrow">ENTREGA</p><h2>'+esc(statusLabel(s.status))+'</h2></div><span class="tracking-pill">'+esc(statusLabel(s.status))+'</span></div>'+
   '<div class="shipment-meta">'+
    (s.carrier_name?'<span>Transportadora: <b>'+esc(s.carrier_name)+'</b></span>':'')+
    (s.tracking_code?'<span>Código: <b>'+esc(s.tracking_code)+'</b></span>':'')+
    (s.estimated_delivery_at?'<span>Previsão: <b>'+esc(dt(s.estimated_delivery_at))+'</b></span>':'')+
   '</div>'+
   (events.length?'<div class="tracking-timeline">'+events.map(e=>'<div class="tracking-event"><h3>'+esc(e.title||statusLabel(e.status))+'</h3><p>'+esc(e.description||'')+(e.location?' · '+esc(e.location):'')+'</p><time>'+esc(dt(e.occurred_at))+'</time></div>').join('')+'</div>':
    '<div class="tracking-note">A transportadora ainda não enviou novos eventos para este pedido.</div>')+
   (s.tracking_url?'<div class="tracking-actions"><a class="button secondary" href="'+esc(s.tracking_url)+'" target="_blank" rel="noopener noreferrer">Rastrear na transportadora</a></div>':'')+
  '</div>';
 }).join(''):'<div class="shipment-box"><p class="eyebrow">ENTREGA</p><div class="tracking-note">'+
   (paid?'Pagamento confirmado. O vendedor ainda está preparando a postagem do pedido.':'A entrega será exibida aqui depois da confirmação do pagamento.')+
   '</div></div>';

 return '<article class="tracking-card">'+
  '<div class="tracking-order-head"><div><p class="eyebrow">PEDIDO #'+esc(order.order_number)+'</p><h2>'+esc(statusLabel(order.status))+'</h2><p>'+esc(order.seller_name||'OYAG Ecosystem')+'</p></div>'+
  '<span class="tracking-pill '+(!paid?'warn':'')+'">'+esc(paid?'Pagamento confirmado':statusLabel(order.payment_status))+'</span></div>'+
  '<div class="tracking-grid">'+
   '<div><span>Total</span><strong>'+esc(money(order.total_cents,order.currency))+'</strong></div>'+
   '<div><span>Compra</span><strong>'+esc(dt(order.created_at))+'</strong></div>'+
   '<div><span>Pagamento</span><strong>'+esc(order.paid_at?dt(order.paid_at):statusLabel(order.payment_status))+'</strong></div>'+
  '</div>'+
  '<div class="tracking-items"><p class="eyebrow">ITENS</p>'+items.map(i=>'<div class="tracking-item"><strong>'+esc(i.name)+'</strong><span>'+esc(i.quantity)+' un.</span></div>').join('')+'</div>'+
  shipHtml+
  (canConfirm?'<div class="receipt-confirm-box"><strong>Você recebeu este pedido?</strong><p>Confirme somente depois que o produto estiver em suas mãos. A confirmação autoriza o OYAG a liberar o valor retido para a etapa de distribuição financeira.</p><button class="button primary" type="button" data-confirm-receipt="'+esc(order.id)+'">Confirmar recebimento</button></div>':'')+
  (order.status==='completed'?'<div class="tracking-note receipt-ok"><strong>Recebimento confirmado.</strong> Este pedido foi concluído no OYAG.</div>':'')+
 '</article>';
}

async function load(){
 if(!token&&!checkoutId){C.innerHTML='<div class="tracking-empty"><h2>Link de acompanhamento inválido.</h2><p>Abra o link enviado pelo OYAG ou volte ao Marketplace.</p></div>';return}
 const headers={apikey:cfg.supabasePublishableKey,'content-type':'application/json'};
 const body={};
 if(token)body.token=token;
 else{
   const {data:{session}}=await sb.auth.getSession();
   if(!session){C.innerHTML='<div class="tracking-empty"><h2>Entre na sua conta para acompanhar este pedido.</h2><p>Este link está associado à sua conta OYAG.</p></div>';return}
   headers.authorization='Bearer '+session.access_token;
   body.checkout_id=checkoutId;
 }
 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-order-tracking',{
  method:'POST',
  headers,
  body:JSON.stringify(body)
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok){C.innerHTML='<div class="tracking-empty"><h2>Não foi possível localizar o pedido.</h2><p>O link pode ter expirado ou sido substituído.</p></div>';return}
 const orders=Array.isArray(data.orders)?data.orders:[];
 C.innerHTML=orders.length?orders.map(orderCard).join(''):'<div class="tracking-empty">Nenhum pedido foi encontrado.</div>';
 C.querySelectorAll('[data-confirm-receipt]').forEach(btn=>{
   btn.addEventListener('click',()=>confirmReceipt(btn.dataset.confirmReceipt));
 });
}

async function confirmReceipt(orderId){
 if(!orderId)return;
 if(!confirm('Confirma que você recebeu este pedido? Depois da confirmação, o valor retido será autorizado para a etapa de distribuição financeira.'))return;

 const btn=C.querySelector('[data-confirm-receipt="'+CSS.escape(orderId)+'"]');
 if(btn){btn.disabled=true;btn.textContent='Confirmando…'}

 const headers={apikey:cfg.supabasePublishableKey,'content-type':'application/json'};
 const body={action:'confirm_receipt',order_id:orderId};

 if(token){
   body.token=token;
 }else{
   const {data:{session}}=await sb.auth.getSession();
   if(!session){
     alert('Sua sessão expirou. Entre novamente para confirmar o recebimento.');
     if(btn){btn.disabled=false;btn.textContent='Confirmar recebimento'}
     return;
   }
   headers.authorization='Bearer '+session.access_token;
   body.checkout_id=checkoutId;
 }

 const r=await fetch(cfg.supabaseUrl+'/functions/v1/oyag-order-tracking',{
   method:'POST',
   headers,
   body:JSON.stringify(body)
 });
 const data=await r.json().catch(()=>({}));

 if(!r.ok||!data.ok){
   console.error('OYAG_RECEIPT_CONFIRM',data);
   alert(data?.detail?.includes('financial_event_not_found')
     ? 'A confirmação ainda não pode ser concluída porque o registro financeiro deste pedido precisa ser conciliado.'
     : 'Não foi possível confirmar o recebimento agora. Tente novamente.');
   if(btn){btn.disabled=false;btn.textContent='Confirmar recebimento'}
   return;
 }

 await load();
}

load().catch(()=>{C.innerHTML='<div class="tracking-empty">Não foi possível consultar o pedido agora.</div>'});