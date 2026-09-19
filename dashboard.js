const cfg=window.OYAG_CONFIG;
const legacySessionKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
if(!localStorage.getItem(legacySessionKey)&&sessionStorage.getItem(legacySessionKey)){
  localStorage.setItem(legacySessionKey,sessionStorage.getItem(legacySessionKey));
  sessionStorage.removeItem(legacySessionKey);
}
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});let session,role=null;const C=document.querySelector('#content'),title=document.querySelector('#viewTitle'),shell=document.querySelector('.shell'),mobileMenuToggle=document.querySelector('#mobileMenuToggle'),mobileMenuBackdrop=document.querySelector('#mobileMenuBackdrop');const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));function closeMobileMenu(){
 if(!shell)return;
 shell.classList.remove('mobile-menu-open');
 mobileMenuToggle?.setAttribute('aria-expanded','false');
}
mobileMenuToggle?.addEventListener('click',()=>{
 if(!shell)return;
 const open=shell.classList.toggle('mobile-menu-open');
 mobileMenuToggle.setAttribute('aria-expanded',String(open));
});
mobileMenuBackdrop?.addEventListener('click',closeMobileMenu);
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenu()});
window.addEventListener('resize',()=>{if(window.innerWidth>800)closeMobileMenu()});
async function init(){const {data}=await sb.auth.getSession();session=data.session;if(!session){location.replace('./login.html');return}document.querySelector('#userEmail').textContent=session.user.email;const {data:r}=await sb.from('platform_roles').select('role').eq('user_id',session.user.id).maybeSingle();role=r?.role||'usuário';document.querySelector('#role').textContent=role==='owner'?'Conta Dono':role;const internal=document.querySelector('#internalProjectNav');if(internal&&!['owner','platform_admin'].includes(role))internal.remove();await loadUserProjects();show('overview')}document.querySelector('#logout').onclick=async()=>{await sb.auth.signOut();location.replace('./')};const dev=document.querySelector('#developerInfo');if(dev)dev.onclick=()=>{C.innerHTML='<div class="panel developer-profile"><p class="eyebrow">DESENVOLVIMENTO</p><h2>OYAG Ecosystem</h2><p><b>Cledemilson Oliveira de Assis</b></p><p class="muted">Responsável pelo produto e desenvolvimento do ecossistema.</p></div>';title.textContent='Desenvolvedor'};function activateView(v){document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));closeMobileMenu();show(v)}
document.querySelector('#nav').onclick=e=>{const b=e.target.closest('button[data-view]');if(!b)return;activateView(b.dataset.view)};
const mobileBottomNav=document.querySelector('#mobileBottomNav');
if(mobileBottomNav)mobileBottomNav.onclick=e=>{const more=e.target.closest('[data-more]');if(more){openMobileMenu();return}const b=e.target.closest('button[data-view]');if(b)activateView(b.dataset.view)};const cards=(items)=>'<div class="grid">'+items.map(x=>'<article class="metric"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2]||'')+'</small></article>').join('')+'</div>';async function count(table,filter){let q=sb.from(table).select('*',{count:'exact',head:true});if(filter)q=filter(q);const {count,error}=await q;return error?'—':count}async function showFinance(){
 C.innerHTML='<div class="loading">Carregando financeiro…</div>';
 const [overviewRes,bal,rec]=await Promise.all([
  sb.rpc('oyag_admin_financial_overview',{p_limit:50}),
  sb.from('oyag_ledger_account_balances').select('*').limit(100),
  sb.from('oyag_owner_reconciliation_overview').select('*').order('reconciled_at',{ascending:false}).limit(50)
 ]);
 if(overviewRes.error||bal.error||rec.error){
  C.innerHTML=statePanel('Não foi possível carregar o financeiro','Tente novamente.');
  return;
 }
 const fin=overviewRes.data||{},k=fin.kpis||{},sales=Array.isArray(fin.recent_sales)?fin.recent_sales:[];
 const balances=bal.data||[],recs=rec.data||[],div=recs.filter(x=>x.reconciliation_status==='divergent');
 C.innerHTML=
 cards([
  ['Vendas brutas',formatMoney(k.gross_sales_cents||0),'mês atual'],
  ['Entradas líquidas',formatMoney(k.entries_net_cents||0),'recebido pelo provedor'],
  ['Taxas',formatMoney(k.provider_fees_cents||0),'gateway'],
  ['Retido',formatMoney(k.retained_cents||0),'aguardando cliente'],
  ['Liberado',formatMoney(k.released_cents||0),'autorizado após recebimento'],
  ['Checkouts pendentes',formatMoney(k.pending_checkout_cents||0),'ainda não pagos'],
  ['Contas internas',balances.length,'ledger OYAG'],
  ['Divergências',Number(k.reconciliation_divergences||div.length),'conciliação']
 ])+
 '<div class="panel"><div class="panel-heading"><div><p class="eyebrow">VENDAS</p><h2>Movimentação financeira recente</h2></div></div>'+
 (sales.length?domainTable('Pedidos pagos',['Pedido','Vendedor','Bruto','Líquido','Taxa','Status'],sales.map(x=>[
   '#'+x.order_number,
   x.seller_name_snapshot||'—',
   formatMoney(x.total_cents),
   formatMoney(x.net_cents),
   formatMoney(x.fee_cents),
   x.status
 ])):statePanel('Nenhuma venda paga no período','As vendas confirmadas aparecerão aqui.'))+'</div>'+
 '<div class="panel"><div class="panel-heading"><div><p class="eyebrow">CONCILIAÇÃO</p><h2>Ledger interno × provedor de pagamento</h2></div></div>'+
 (recs.length?domainTable('Movimentações conciliadas',['Status','Origem','Referência','Interno','Externo','Diferença'],recs.map(x=>[
   x.reconciliation_status,x.provider||x.source_system,x.provider_payment_id||x.source_reference,
   formatMoney(x.internal_amount_cents),formatMoney(x.external_amount_cents),formatMoney(x.difference_cents)
 ])):statePanel('Nenhuma conciliação registrada','Quando movimentações reais forem recebidas do provedor, a conciliação aparecerá aqui.'))+'</div>'+
 '<div class="panel"><p class="muted">“Liberado” significa autorização interna para distribuição após a confirmação de recebimento. Não representa transferência bancária já executada.</p></div>';
}

async function overview(){
 const [o,u,a,alerts,projects,tasks,ledger]=await Promise.all([
  sb.from('organizations').select('id,name,status').limit(100),
  sb.from('oyag_units').select('id,name,status,health_state').limit(100),
  sb.from('oyag_affiliate_memberships').select('id,status').eq('status','active').limit(1000),
  sb.from('oyag_operational_alerts').select('id,status,severity,reason,created_at').eq('status','open').order('created_at',{ascending:false}).limit(8),
  sb.from('oyag_user_projects').select('id,status').eq('status','active').limit(1000),
  sb.from('oyag_user_project_tasks').select('id,status,due_date,updated_at').limit(1000),
  sb.from('oyag_ledger_account_balances').select('*').limit(100)
 ]);
 const orgs=o.data||[],units=u.data||[],aff=a.data||[],als=alerts.data||[],ps=projects.data||[],ts=tasks.data||[],balances=ledger.data||[],now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const open=ts.filter(x=>x.status!=='done'),overdue=open.filter(x=>x.due_date&&new Date(x.due_date)<today),blocked=open.filter(x=>x.status==='blocked');
 C.innerHTML='<div class="welcome-row"><div><p class="eyebrow">SEU DIA NO OYAG</p><h2>Seu negócio em movimento.</h2><p class="muted">Acompanhe resultados, resolva pendências e encontre o próximo passo para crescer.</p></div><div class="quick-actions"><button data-go="catalog">Cadastrar produto</button><button data-go="orders">Ver pedidos</button><button data-go="finance">Abrir financeiro</button></div></div>'+
 cards([['Empresas',orgs.length,'cadastradas'],['Unidades',units.length,'em sua estrutura'],['Conexões ativas',aff.length,'na Rede OYAG'],['Projetos ativos',ps.length,'em andamento'],['Tarefas abertas',open.length,'para avançar'],['Tarefas atrasadas',overdue.length,'precisam de atenção'],['Bloqueadas',blocked.length,'aguardando solução'],['Pendências',als.length,'para revisar']])+
 '<div class="dashboard-columns"><div class="panel"><div class="panel-heading"><div><p class="eyebrow">ATIVIDADE CENTRAL</p><h2>Pontos recentes</h2></div></div>'+(als.length?als.map(x=>'<div class="activity-row"><b>'+esc(x.reason||'Alerta operacional')+'</b><span>'+esc(x.severity||'atenção')+'</span></div>').join(''):statePanel('Nenhuma atenção crítica agora','Os alertas operacionais aparecerão aqui quando houver necessidade de acompanhamento.'))+'</div>'+
 '<div class="panel"><div class="panel-heading"><div><p class="eyebrow">OPERAÇÃO</p><h2>Atenção agora</h2></div></div><div class="operation-stack"><div class="operation-row"><span>Tarefas abertas</span><strong>'+open.length+'</strong></div><div class="operation-row"><span>Tarefas atrasadas</span><strong>'+overdue.length+'</strong></div><div class="operation-row"><span>Tarefas bloqueadas</span><strong>'+blocked.length+'</strong></div><div class="operation-row"><span>Alertas abertos</span><strong>'+als.length+'</strong></div></div></div></div>'+notice()
}
async function showOrders(){
 C.innerHTML='<div class="loading">Carregando pedidos e entregas…</div>';
 const {data,error}=await sb.rpc('oyag_admin_orders_overview',{p_limit:150});
 if(error){C.innerHTML=statePanel('Não foi possível carregar os pedidos',error.message);return}
 const rows=Array.isArray(data)?data:[];
 const counts={
  paid:rows.filter(x=>x.payment_status==='approved').length,
  preparing:rows.filter(x=>x.shipment_status==='preparing'||x.status==='preparing').length,
  transit:rows.filter(x=>['posted','in_transit','out_for_delivery'].includes(x.shipment_status)).length,
  awaiting:rows.filter(x=>x.status==='awaiting_confirmation').length,
  completed:rows.filter(x=>x.status==='completed').length
 };
 C.innerHTML=cards([
  ['Pagos',counts.paid,'pedidos confirmados'],
  ['Em preparação',counts.preparing,'aguardando postagem'],
  ['Em transporte',counts.transit,'postados / em trânsito'],
  ['Aguardando confirmação',counts.awaiting,'entrega informada'],
  ['Concluídos',counts.completed,'recebimento confirmado']
 ])+
 '<div class="panel"><div class="panel-heading"><div><p class="eyebrow">CRM DE PEDIDOS</p><h2>Pedidos & Entregas</h2></div></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Destino</th><th>Entrega</th><th>Rastreamento</th><th>Ação</th></tr></thead><tbody>'+
 (rows.length?rows.map(x=>'<tr>'+
  '<td><strong>#'+esc(x.order_number)+'</strong><br><small>'+esc(formatDate(x.created_at))+'</small></td>'+
  '<td><strong>'+esc(x.customer_name||'—')+'</strong><br><small>'+esc(x.customer_email||'')+(x.customer_whatsapp?' · '+esc(x.customer_whatsapp):'')+'</small></td>'+
  '<td>'+esc(x.items_summary||'—')+'</td>'+
  '<td>'+esc(x.payment_status==='approved'?'Pago':x.payment_status||'—')+'<br><small>'+esc(formatMoney(x.total_cents,x.currency))+'</small></td>'+
  '<td>'+(x.street?esc(x.city||'')+'/'+esc(x.state||'')+'<br><small>'+esc(x.street)+', '+esc(x.address_number||'')+(x.neighborhood?' · '+esc(x.neighborhood):'')+'</small>':'—')+'</td>'+
  '<td>'+esc(x.shipment_status?shipmentLabel(x.shipment_status):'Ainda não iniciado')+'</td>'+
  '<td>'+esc(x.carrier_name||'—')+(x.tracking_code?'<br><small>'+esc(x.tracking_code)+'</small>':'')+'</td>'+
  '<td>'+(x.status==='completed'?'<span class="delivery-done">Concluído</span>':'<button class="catalog-primary" data-ship-order="'+esc(x.id)+'">Gerenciar entrega</button>')+'</td>'+
 '</tr>').join(''):'<tr><td colspan="8">Nenhum pedido encontrado.</td></tr>')+
 '</tbody></table></div></div>';
 C.querySelectorAll('[data-ship-order]').forEach(b=>b.onclick=()=>updateShipment(rows.find(x=>x.id===b.dataset.shipOrder)));
}

function shipmentLabel(s){
 return ({
  preparing:'Em preparação',
  posted:'Postado',
  in_transit:'Em trânsito',
  out_for_delivery:'Saiu para entrega',
  delivered:'Entregue',
  delivery_failed:'Tentativa de entrega',
  returned:'Devolvido',
  canceled:'Cancelado'
 }[s]||s||'—');
}

function deliveryHelp(status){
 return ({
  preparing:'Pedido sendo separado ou embalado.',
  posted:'Pedido entregue à transportadora ou coletado por um entregador.',
  in_transit:'Pedido a caminho do destino.',
  out_for_delivery:'Entregador na etapa final da entrega.',
  delivered:'Entrega realizada; o cliente precisará confirmar o recebimento.',
  delivery_failed:'Houve uma tentativa de entrega sem sucesso.',
  returned:'Pedido retornando ao vendedor.',
  canceled:'Entrega cancelada.'
 }[status]||'Selecione o estágio atual da entrega.');
}

async function updateShipment(order){
 if(!order)return;

 const modal=document.querySelector('#deliveryManagerModal');
 const form=document.querySelector('#deliveryManagerForm');
 const statusEl=document.querySelector('#deliveryStatus');
 const errorEl=document.querySelector('#deliveryFormError');
 const save=document.querySelector('#deliverySave');
 if(!modal||!form||!statusEl)return;

 document.querySelector('#deliveryModalTitle').textContent='Pedido #'+order.order_number;
 document.querySelector('#deliveryModalCustomer').textContent=(order.customer_name||'Cliente')+(order.city?' · '+order.city+(order.state?'/'+order.state:''):'');
 document.querySelector('#deliveryCurrentStatus').textContent=shipmentLabel(order.shipment_status||'preparing');
 document.querySelector('#deliveryCarrier').value=order.carrier_name||'';
 document.querySelector('#deliveryTrackingCode').value=order.tracking_code||'';
 document.querySelector('#deliveryTrackingUrl').value=order.tracking_url||'';
 document.querySelector('#deliveryEstimate').value=order.estimated_delivery_at?String(order.estimated_delivery_at).slice(0,10):'';
 document.querySelector('#deliveryLocation').value='';
 document.querySelector('#deliveryMessage').value='';
 errorEl.textContent='';
 save.disabled=false;
 save.textContent='Salvar atualização';
 statusEl.value=order.shipment_status||'preparing';

 const refreshPreview=()=>{
  const label=shipmentLabel(statusEl.value);
  const help=deliveryHelp(statusEl.value);
  document.querySelector('#deliveryStatusHelp').textContent=help;
  document.querySelector('#deliveryPreviewLabel').textContent=label;
  document.querySelector('#deliveryPreviewText').textContent=help;
 };
 refreshPreview();
 statusEl.onchange=refreshPreview;

 const close=()=>{
  modal.hidden=true;
  document.body.classList.remove('delivery-modal-open');
 };
 modal.querySelectorAll('[data-delivery-close]').forEach(x=>x.onclick=close);

 form.onsubmit=async e=>{
  e.preventDefault();
  errorEl.textContent='';

  const status=statusEl.value;
  const carrier=document.querySelector('#deliveryCarrier').value.trim()||null;
  const code=document.querySelector('#deliveryTrackingCode').value.trim()||null;
  const url=document.querySelector('#deliveryTrackingUrl').value.trim()||null;
  const estimate=document.querySelector('#deliveryEstimate').value||null;
  const location=document.querySelector('#deliveryLocation').value.trim()||null;
  const description=document.querySelector('#deliveryMessage').value.trim()||null;

  if(['posted','in_transit','out_for_delivery'].includes(status)&&!carrier){
   errorEl.textContent='Informe a transportadora ou o responsável pela entrega.';
   return;
  }

  save.disabled=true;
  save.textContent='Salvando…';

  const {error}=await sb.rpc('oyag_admin_upsert_shipment',{
   p_order_id:order.id,
   p_status:status,
   p_carrier_name:carrier,
   p_tracking_code:code,
   p_tracking_url:url,
   p_estimated_delivery_at:estimate?estimate+'T12:00:00-03:00':null,
   p_event_title:null,
   p_event_description:description,
   p_location:location
  });

  if(error){
   errorEl.textContent='Não foi possível atualizar a entrega: '+error.message;
   save.disabled=false;
   save.textContent='Salvar atualização';
   return;
  }

  close();
  await showOrders();
 };

 modal.hidden=false;
 document.body.classList.add('delivery-modal-open');
}

async function show(v){
 C.innerHTML='<div class="loading">Consultando dados do OYAG…</div>';
 const names={overview:'Início',companies:'Empresas',catalog:'Produtos e serviços',units:'Unidades',network:'Rede OYAG',performance:'Resultados',finance:'Financeiro',orders:'Pedidos e entregas',alerts:'Pendências',project:'Projetos',admin:'Configurações'};
 title.textContent=names[v]||'OYAG Ecosystem';
 if(v==='catalog'){await showCatalog();return}
 if(v==='project'){await showProject();return}
 if(v==='performance'){await showPerformance();return}
 if(v==='finance'){await showFinance();return}
 if(v==='orders'){await showOrders();return}
 if(v==='admin'){await showAdmin();return}
 if(v==='overview'){await overview();return}
 const map={companies:'organizations',units:'oyag_owner_unit_overview',network:'oyag_affiliate_memberships',alerts:'oyag_operational_alerts'};
 const table=map[v];
 if(!table){C.innerHTML=statePanel('Área disponível','Os dados desta área estão sendo preparados.');return}
 const {data,error}=await sb.from(table).select('*').limit(50);
 if(error){C.innerHTML=statePanel('Não foi possível carregar esta área','Tente novamente. Se o problema continuar, procure o suporte.');return}
 C.innerHTML=renderDomain(v,data||[]);
}async function showProject(){
 const [{data:tasks,error},{data:phases}]=await Promise.all([sb.from('oyag_project_tasks').select('id,title,description,status,priority,sector,phase_id,blocked_reason,completed_at,position,due_date').order('position'),sb.from('oyag_project_phases').select('id,name,position').order('position')]);
 if(error){C.innerHTML=statePanel('Não foi possível carregar o Projeto OYAG','Tente novamente.');return}
 const statuses=[['backlog','Backlog'],['todo','A Fazer'],['in_progress','Em andamento'],['blocked','Bloqueado'],['review','Revisão'],['done','Concluído']],total=tasks.length,done=tasks.filter(t=>t.status==='done').length,pct=total?Math.round(done*100/total):0;
 C.innerHTML='<div class="project-actions"><button class="primary" id="newInternalTask">+ Nova tarefa</button></div><div class="project-head">'+cards([['Progresso',pct+'%','conclusão geral'],['Concluídas',done,total+' tarefas'],['Em andamento',tasks.filter(t=>t.status==='in_progress').length,'execução atual'],['Bloqueadas',tasks.filter(t=>t.status==='blocked').length,'dependências']])+'<div class="progress"><i style="width:'+pct+'%"></i></div></div><div class="kanban">'+statuses.map(([key,label])=>'<section class="kanban-col" data-internal-status="'+key+'"><header><b>'+label+'</b><span>'+tasks.filter(t=>t.status===key).length+'</span></header><div>'+tasks.filter(t=>t.status===key).map(t=>'<article class="task priority-'+esc(t.priority)+'" draggable="true" tabindex="0" data-internal-task="'+t.id+'"><div class="task-top"><span>'+esc(t.sector||'OYAG')+'</span><b>'+esc(t.priority)+'</b></div><h3>'+esc(t.title)+'</h3><p>'+esc((phases||[]).find(p=>p.id===t.phase_id)?.name||'Sem fase')+'</p>'+(t.due_date?'<small>Prazo: '+esc(t.due_date)+'</small>':'')+(t.blocked_reason?'<small>⚠ '+esc(t.blocked_reason)+'</small>':'')+'<div class="task-actions"><button data-internal-edit="'+t.id+'">Editar</button><button data-internal-move="'+t.id+'">Mover</button><button data-internal-archive="'+t.id+'">Concluir</button></div></article>').join('')+'</div></section>').join('')+'</div>';
 document.querySelector('#newInternalTask').onclick=()=>internalTaskCreate();
 C.querySelectorAll('[data-internal-edit]').forEach(x=>x.onclick=()=>internalTaskEdit(tasks.find(t=>t.id===x.dataset.internalEdit)));
 C.querySelectorAll('[data-internal-move]').forEach(x=>x.onclick=()=>internalTaskMove(x.dataset.internalMove));
 C.querySelectorAll('[data-internal-archive]').forEach(x=>x.onclick=()=>internalTaskAction('archive',x.dataset.internalArchive));
 C.querySelectorAll('[data-internal-task]').forEach(card=>card.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',card.dataset.internalTask)));
 C.querySelectorAll('[data-internal-status]').forEach(col=>{col.addEventListener('dragover',e=>e.preventDefault());col.addEventListener('drop',e=>{e.preventDefault();internalTaskAction('move',e.dataTransfer.getData('text/plain'),col.dataset.internalStatus)})});
}
async function internalTaskCreate(){const title=prompt('Título da tarefa:');if(!title?.trim())return;const description=prompt('Descrição (opcional):')||null,priority=(prompt('Prioridade: low, medium, high ou critical','medium')||'medium').toLowerCase(),due=prompt('Prazo opcional (AAAA-MM-DD):')||null;const {error}=await sb.rpc('oyag_manage_internal_task',{p_action:'create',p_title:title.trim(),p_description:description,p_priority:priority,p_status:'todo',p_due_date:due});if(error)alert('Não foi possível criar a tarefa.');else showProject()}
async function internalTaskEdit(t){const title=prompt('Título:',t.title);if(!title?.trim())return;const description=prompt('Descrição:',t.description||'')||null,priority=(prompt('Prioridade:',t.priority)||t.priority).toLowerCase(),due=prompt('Prazo (AAAA-MM-DD):',t.due_date||'')||null;const {error}=await sb.rpc('oyag_manage_internal_task',{p_action:'update',p_task_id:t.id,p_title:title.trim(),p_description:description,p_priority:priority,p_due_date:due});if(error)alert('Não foi possível editar a tarefa.');else showProject()}
async function internalTaskMove(id){const status=(prompt('Mover para: backlog, todo, in_progress, blocked, review ou done','in_progress')||'').trim();if(!status)return;internalTaskAction('move',id,status)}
async function internalTaskAction(action,id,status=null){const {error}=await sb.rpc('oyag_manage_internal_task',{p_action:action,p_task_id:id,p_status:status});if(error)alert('A alteração não pôde ser salva.');else showProject()}
async function loadUserProjects(){
 const nav=document.querySelector('#nav');
 nav.querySelectorAll('.user-project-nav').forEach(x=>x.remove());
 if(role==='owner')return;
 const {data,error}=await sb.from('oyag_user_projects').select('id,name').eq('status','active').order('created_at');
 if(error)return;
 const add=document.createElement('button');add.className='user-project-create';add.textContent='+ Novo projeto';add.onclick=createUserProject;nav.insertBefore(add,nav.querySelector('[data-view="admin"]'));
 (data||[]).forEach(p=>{
  const b=document.createElement('button');b.className='user-project-nav';b.dataset.userProject=p.id;b.textContent=p.name;
  nav.insertBefore(b,nav.querySelector('[data-view="admin"]'));
 });
}
async function createUserProject(){
 const name=prompt('Nome do novo projeto:');if(!name||!name.trim())return;
 const description=prompt('Descrição do projeto (opcional):')||null;
 const {data,error}=await sb.rpc('oyag_create_user_project',{p_name:name.trim(),p_description:description});
 if(error){alert('Não foi possível criar o projeto: '+error.message);return}
 await loadUserProjects();
 const b=[...document.querySelectorAll('#nav button[data-user-project]')].find(x=>x.dataset.userProject===data);
 if(b){document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');await showUserProject(data,b.textContent)}
}
document.querySelector('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-user-project]');if(!b)return;document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');closeMobileMenu();showUserProject(b.dataset.userProject,b.textContent)});
async function showUserProject(id,name){
 title.textContent=name;C.innerHTML='<div class="loading">Carregando projeto…</div>';
 const {data:tasks,error}=await sb.from('oyag_user_project_tasks').select('id,title,description,status,priority,blocked_reason,position,due_date').eq('project_id',id).order('position');
 if(error){C.innerHTML='<div class="panel"><h2>'+esc(name)+'</h2><p>'+esc(error.message)+'</p></div>';return}
 const statuses=[['backlog','Backlog'],['todo','A Fazer'],['in_progress','Em andamento'],['blocked','Bloqueado'],['review','Revisão'],['done','Concluído']];
 const total=tasks.length,done=tasks.filter(t=>t.status==='done').length,pct=total?Math.round(done*100/total):0;
 C.innerHTML='<div class="project-actions"><button class="primary" id="newTask">+ Nova tarefa</button><button id="archiveProject">Arquivar projeto</button></div><div class="project-head">'+cards([['Progresso',pct+'%','conclusão geral'],['Concluídas',done,total+' tarefas'],['Em andamento',tasks.filter(t=>t.status==='in_progress').length,'execução atual'],['Bloqueadas',tasks.filter(t=>t.status==='blocked').length,'dependências']])+'<div class="progress"><i style="width:'+pct+'%"></i></div></div><div class="kanban">'+statuses.map(([key,label])=>'<section class="kanban-col" data-status="'+key+'"><header><b>'+label+'</b><span>'+tasks.filter(t=>t.status===key).length+'</span></header><div>'+tasks.filter(t=>t.status===key).map(t=>'<article class="task priority-'+esc(t.priority)+'" draggable="true" data-task="'+t.id+'"><div class="task-top"><span>MEU PROJETO</span><b>'+esc(t.priority)+'</b></div><h3>'+esc(t.title)+'</h3>'+(t.description?'<p>'+esc(t.description)+'</p>':'')+(t.due_date?'<small>Prazo: '+esc(t.due_date)+'</small>':'')+(t.blocked_reason?'<small>⚠ '+esc(t.blocked_reason)+'</small>':'')+'<div class="task-actions"><button data-edit="'+t.id+'">Editar</button><button data-delete="'+t.id+'">Excluir</button></div></article>').join('')+'</div></section>').join('')+'</div>';
 document.querySelector('#newTask').onclick=()=>createUserTask(id,name);
 document.querySelector('#archiveProject').onclick=()=>archiveUserProject(id,name);
 C.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editUserTask(tasks.find(t=>t.id===b.dataset.edit),id,name));
 C.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteUserTask(b.dataset.delete,id,name));
 C.querySelectorAll('.task').forEach(card=>card.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',card.dataset.task)));
 C.querySelectorAll('.kanban-col').forEach(col=>{col.addEventListener('dragover',e=>e.preventDefault());col.addEventListener('drop',async e=>{e.preventDefault();const taskId=e.dataTransfer.getData('text/plain');const {error}=await sb.rpc('oyag_move_user_task',{p_task_id:taskId,p_status:col.dataset.status});if(error)alert(error.message);else showUserProject(id,name)})});
}
async function createUserTask(projectId,projectName){
 const title=prompt('Título da tarefa:');if(!title||!title.trim())return;
 const description=prompt('Descrição (opcional):')||null;
 const priority=(prompt('Prioridade: low, medium, high ou critical','medium')||'medium').toLowerCase();
 const due=prompt('Prazo opcional (AAAA-MM-DD):')||null;
 const {error}=await sb.rpc('oyag_create_user_task',{p_project_id:projectId,p_title:title.trim(),p_description:description,p_priority:priority,p_due_date:due});
 if(error)alert('Erro ao criar tarefa: '+error.message);else showUserProject(projectId,projectName);
}
async function editUserTask(task,projectId,projectName){
 const title=prompt('Título:',task.title);if(!title||!title.trim())return;
 const description=prompt('Descrição:',task.description||'')||null;
 const priority=(prompt('Prioridade: low, medium, high ou critical',task.priority)||task.priority).toLowerCase();
 const due=prompt('Prazo (AAAA-MM-DD):',task.due_date||'')||null;
 const blocked=prompt('Motivo do bloqueio (opcional):',task.blocked_reason||'')||null;
 const {error}=await sb.rpc('oyag_update_user_task',{p_task_id:task.id,p_title:title.trim(),p_description:description,p_priority:priority,p_due_date:due,p_blocked_reason:blocked});
 if(error)alert('Erro ao editar: '+error.message);else showUserProject(projectId,projectName);
}
async function deleteUserTask(taskId,projectId,projectName){
 if(!confirm('Excluir esta tarefa?'))return;
 const {error}=await sb.rpc('oyag_delete_user_task',{p_task_id:taskId});
 if(error)alert('Erro ao excluir: '+error.message);else showUserProject(projectId,projectName);
}
async function archiveUserProject(projectId,projectName){
 if(!confirm('Arquivar o projeto "'+projectName+'"? As informações permanecerão armazenadas.'))return;
 const {error}=await sb.rpc('oyag_archive_user_project',{p_project_id:projectId});
 if(error){alert('Erro ao arquivar: '+error.message);return}
 await loadUserProjects();show('overview');
}
async function showPerformance(){
 const [{data:units,error:uerr},{data:dims,error:derr}]=await Promise.all([
  sb.from('oyag_owner_performance_dashboard').select('*').order('unit_name'),
  sb.from('oyag_owner_performance_dimensions').select('*').order('dimension')
 ]);
 if(uerr||derr){C.innerHTML='<div class="panel"><h2>Performance</h2><p>'+esc((uerr||derr).message)+'</p></div>';return}
 const open=(units||[]).reduce((a,x)=>a+Number(x.open_alerts||0),0),inter=(units||[]).reduce((a,x)=>a+Number(x.active_interventions||0),0);
 C.innerHTML=cards([['Unidades',(units||[]).length,'monitoradas'],['Dimensões',new Set((dims||[]).map(x=>x.dimension)).size,'aquisição · retenção · economia · rede · qualidade'],['Alertas abertos',open,'atenção operacional'],['Intervenções ativas',inter,'continuidade']])+
 '<div class="panel"><h2>Performance multidimensional</h2><div class="perf-grid">'+(dims||[]).map(x=>'<article><b>'+esc(x.dimension||'—')+'</b><span>'+esc(x.scope_type||'—')+'</span><strong>'+esc(x.metrics)+'</strong><small>métricas · '+esc(x.snapshots)+' snapshots</small></article>').join('')+'</div></div>'+
 '<div class="panel"><h2>Saúde das Unidades</h2><div class="table-wrap"><table><thead><tr><th>Unidade</th><th>Saúde</th><th>Eventos</th><th>Snapshots</th><th>Alertas</th><th>Intervenções</th></tr></thead><tbody>'+(units||[]).map(x=>'<tr><td>'+esc(x.unit_name)+'</td><td>'+esc(x.health_state||'normal')+'</td><td>'+esc(x.performance_events)+'</td><td>'+esc(x.snapshots)+'</td><td>'+esc(x.open_alerts)+'</td><td>'+esc(x.active_interventions)+'</td></tr>').join('')+'</tbody></table></div></div>';
}
function statePanel(h,p){return '<div class="panel empty"><h2>'+esc(h)+'</h2><p>'+esc(p)+'</p></div>'}
function renderDomain(v,data){
 if(!data.length){const empty={companies:['Nenhuma empresa cadastrada','Quando uma empresa estiver disponível para sua conta, ela aparecerá aqui.'],units:['Nenhuma unidade disponível','As unidades vinculadas aparecerão aqui.'],network:['Sua rede ainda está vazia','Afiliados e relacionamentos ativos aparecerão nesta área.'],finance:['Nenhuma movimentação disponível','Os registros financeiros aparecerão conforme houver movimentações elegíveis.'],alerts:['Tudo tranquilo por aqui','Não há alertas operacionais visíveis neste momento.'],admin:['Nenhum registro administrativo','Não há registros administrativos disponíveis para seu perfil.']};return statePanel(...empty[v])}
 if(v==='companies')return domainTable('Empresas',['Nome','Situação'],data.map(x=>[x.name,x.status]));
 if(v==='units')return domainTable('Unidades OYAG',['Unidade','Situação','Saúde'],data.map(x=>[x.name||x.unit_name,x.status||x.unit_status,x.health_state||'—']));
 if(v==='network')return domainTable('Afiliados & Rede',['Situação','Início'],data.map(x=>[x.status,formatDate(x.starts_at)]));
 if(v==='finance')return domainTable('Financeiro & Ledger',['Conta','Tipo','Saldo'],data.map(x=>[x.account_code||'Conta',x.account_type||'—',formatMoney(x.balance_cents||0,x.currency)]));
 if(v==='alerts')return domainTable('Alertas & Intervenções',['Severidade','Situação','Motivo'],data.map(x=>[x.severity,x.status,x.reason||'—']));
 if(v==='admin'){if(!['owner','platform_admin'].includes(role))return statePanel('Acesso administrativo restrito','Esta área está disponível apenas para perfis autorizados.');return domainTable('Administração',['Papel'],data.map(x=>[x.role]))}
 return statePanel('Área disponível','Os dados desta área estão sendo preparados.');
}
function domainTable(h,heads,rows){return '<div class="panel"><h2>'+esc(h)+'</h2><div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></div>'}
function formatDate(v){if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(v))}catch{return '—'}}
function formatMoney(cents,currency='BRL'){try{return new Intl.NumberFormat('pt-BR',{style:'currency',currency:currency||'BRL'}).format(Number(cents||0)/100)}catch{return '—'}}
function notice(){return '<div class="panel"><h2>Ambiente protegido</h2><p>Ambiente protegido e preparado para centralizar a gestão do seu negócio com segurança, organização e controle.</p></div>'}
window.addEventListener('error',()=>{if(C&&/Carregando|Consultando/.test(C.textContent))C.innerHTML=statePanel('Não foi possível iniciar o painel','Recarregue a página. Se continuar, o erro será tratado no ambiente publicado.')});
init().catch(err=>{console.error('OYAG_INIT',err);C.innerHTML=statePanel('Não foi possível iniciar o painel','O ambiente encontrou uma falha de inicialização. Tente novamente.')});

async function catalogOrganizations(){
 const {data,error}=await sb.from('organizations').select('id,name,status').eq('status','active').order('name');
 if(error)throw error; return data||[];
}
async function showCatalog(){
 C.innerHTML='<div class="loading">Carregando catálogo…</div>';
 const [orgsRes,itemsRes]=await Promise.all([catalogOrganizations(),sb.from('oyag_catalog_items').select('id,organization_id,item_type,fulfillment_type,shipping_mode,shipping_fixed_cents,name,description,image_url,category,price_cents,currency,commercial_condition,status,updated_at').neq('status','archived').order('updated_at',{ascending:false})]);
 if(itemsRes.error){C.innerHTML=statePanel('Não foi possível carregar o catálogo',itemsRes.error.message);return}
 const orgs=orgsRes,items=itemsRes.data||[];
 C.innerHTML='<div class="catalog-toolbar"><div><p class="eyebrow">CATÁLOGO</p><h2>Produtos & Serviços</h2><p class="muted">Cadastre e publique ofertas no Marketplace OYAG.</p></div><button class="catalog-primary" id="newCatalogItem">+ Novo produto ou serviço</button></div>'+
 (items.length?'<div class="catalog-grid">'+items.map(x=>'<article class="catalog-card">'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="">':'<div class="catalog-image">OYAG</div>')+'<div class="catalog-body"><div class="catalog-meta"><span>'+esc(x.item_type==='service'?'Serviço':'Produto')+'</span><b class="status-'+esc(x.status)+'">'+esc(x.status)+'</b></div><h3>'+esc(x.name)+'</h3><p>'+esc(x.description||'Sem descrição')+'</p><strong>'+formatMoney(x.price_cents,x.currency)+'</strong><small>'+esc(orgs.find(o=>o.id===x.organization_id)?.name||'Empresa')+'</small><div class="catalog-actions"><button data-edit-catalog="'+x.id+'">Editar</button><button data-archive-catalog="'+x.id+'">Arquivar</button></div></div></article>').join('')+'</div>':statePanel('Seu catálogo está vazio','Cadastre o primeiro produto ou serviço.'));
 document.querySelector('#newCatalogItem').onclick=()=>catalogForm(null,orgs);
 C.querySelectorAll('[data-edit-catalog]').forEach(b=>b.onclick=()=>catalogForm(items.find(x=>x.id===b.dataset.editCatalog),orgs));
 C.querySelectorAll('[data-archive-catalog]').forEach(b=>b.onclick=()=>archiveCatalog(b.dataset.archiveCatalog));
}
async function catalogForm(item,orgs){
 if(!orgs.length){alert('Cadastre uma empresa antes de criar produtos.');return}
 const org=item?.organization_id||orgs[0].id;
 const type=(prompt('Tipo: product para produto ou service para serviço',item?.item_type||'product')||'').trim().toLowerCase();if(!type)return;
 const fulfillment=type==='service'
  ? 'service'
  : (prompt('Entrega: physical para produto físico ou digital para produto digital',item?.fulfillment_type||'physical')||'').trim().toLowerCase();
 if(!fulfillment)return;
 let shippingMode='free',shippingFixedCents=0;
 if(fulfillment==='physical'){
  shippingMode=(prompt('Frete: free para grátis ou fixed para valor fixo',item?.shipping_mode||'free')||'').trim().toLowerCase();
  if(!['free','fixed'].includes(shippingMode)){alert('Use free ou fixed para o frete nesta etapa.');return}
  if(shippingMode==='fixed'){
   const freightText=prompt('Valor do frete fixo em reais (ex.: 12,90):',item?.shipping_fixed_cents!=null?(Number(item.shipping_fixed_cents)/100).toFixed(2).replace('.',','):'');
   if(freightText===null)return;
   const freightParsed=Number(freightText.replace('.','').replace(',','.'));
   if(!Number.isFinite(freightParsed)||freightParsed<=0){alert('Valor de frete inválido.');return}
   shippingFixedCents=Math.round(freightParsed*100);
  }
 }
 const name=prompt('Nome:',item?.name||'');if(!name?.trim())return;
 const description=prompt('Descrição:',item?.description||'')||'';
 const category=prompt('Categoria:',item?.category||'')||'';
 const priceText=prompt('Preço em reais (ex.: 49,90):',item?.price_cents!=null?(Number(item.price_cents)/100).toFixed(2).replace('.',','):'');
 if(priceText===null)return;
 const parsed=Number(priceText.replace('.','').replace(',','.'));if(!Number.isFinite(parsed)||parsed<0){alert('Preço inválido.');return}
 const image=prompt('URL da imagem (opcional):',item?.image_url||'')||'';
 const condition=prompt('Condição comercial:',item?.commercial_condition||'Pagamento único')||'';
 const status=(prompt('Status: draft, published ou paused',item?.status||'draft')||'').trim().toLowerCase();if(!status)return;
 const args={p_action:item?'update':'create',p_item_id:item?.id||null,p_organization_id:org,p_item_type:type,p_name:name.trim(),p_description:description,p_image_url:image,p_category:category,p_price_cents:Math.round(parsed*100),p_commercial_condition:condition,p_status:status,p_fulfillment_type:fulfillment,p_shipping_mode:shippingMode,p_shipping_fixed_cents:shippingFixedCents};
 const {error}=await sb.rpc('oyag_manage_catalog_item',args);if(error){alert('Não foi possível salvar: '+error.message);return}await showCatalog();
}
async function archiveCatalog(id){
 if(!confirm('Arquivar este item? Ele deixará de aparecer no Marketplace.'))return;
 const {error}=await sb.rpc('oyag_manage_catalog_item',{p_action:'archive',p_item_id:id});
 if(error)alert('Não foi possível arquivar: '+error.message);else showCatalog();
}

async function showAdmin(){
 if(!['owner','platform_admin'].includes(role)){C.innerHTML=statePanel('Acesso administrativo restrito','Esta área está disponível apenas para perfis autorizados.');return}
 C.innerHTML='<div class="loading">Validando integrações administrativas…</div>';
 let validation=null;
 try{
  const r=await fetch(cfg.supabaseUrl+'/functions/v1/asaas-validate-connection',{
   method:'POST',
   headers:{
    apikey:cfg.supabasePublishableKey,
    authorization:'Bearer '+session.access_token,
    'content-type':'application/json'
   },
   body:'{}'
  });
  validation=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
 }catch(e){validation={ok:false,error:'connection_error'}}
 const nextMap={
  activate_asaas_checkout:'Integração apta para ativação do checkout Asaas.',
  activate_asaas_marketplace:'Checkout e marketplace Asaas aptos para ativação.',
  checkout_ready_marketplace_requires_cnpj:'Checkout comum liberado. O carrinho multiempresa com split exige conta-pai empresarial/CNPJ.',
  complete_asaas_account_approval:'A conta Asaas ainda precisa concluir a aprovação cadastral.',
  confirm_marketplace_subaccount_access:'A API está válida, mas o acesso de marketplace/subcontas precisa ser confirmado.',
  review_credentials:'Revise as credenciais/configuração Asaas.'
 };
 const ok=validation?.ok===true;
 const status=esc(validation?.activation_status||validation?.error||'não validado');
 C.innerHTML='<div class="admin-integrations"><div class="panel integration-card"><div class="panel-heading"><div><p class="eyebrow">PAGAMENTOS</p><h2>Asaas · Marketplace multiempresa</h2></div><span class="integration-status '+(ok?'ready':'attention')+'">'+status+'</span></div>'+
 '<div class="integration-grid">'+
 '<div><span>API Key</span><strong>'+(validation?.api_key_present===false?'Ausente':validation?.ok?'Validada':'Configurada')+'</strong></div>'+
 '<div><span>Webhook Token</span><strong>'+(validation?.webhook_token_present===false?'Ausente':'Configurado')+'</strong></div>'+
 '<div><span>Checkout Asaas</span><strong>'+esc(validation?.checkout_activation_status||validation?.activation_status||'—')+'</strong></div>'+
 '<div><span>Marketplace / split</span><strong>'+esc(validation?.marketplace_activation_status||'—')+'</strong></div>'+
 '<div><span>Conta Asaas</span><strong>'+esc(validation?.account_general_status||'—')+'</strong></div>'+
 '<div><span>Tipo da conta-pai</span><strong>'+esc(validation?.parent_person_type||'—')+'</strong></div>'+
 '<div><span>Wallet da conta-pai</span><strong>'+(validation?.parent_wallet_detected?'Identificada':'—')+'</strong></div>'+
 '<div><span>API de subcontas</span><strong>'+(validation?.subaccount_api_reachable?'Disponível':'Não confirmada')+'</strong></div>'+
 '</div>'+
 '<div class="integration-message '+(ok?'ok':'warn')+'">'+esc(nextMap[validation?.next_step]||'Validação concluída. Verifique o status acima.')+'</div>'+
 '<div class="integration-actions"><button class="catalog-primary" id="validateAsaas">Validar novamente</button></div></div>'+
 '<div class="panel"><p class="muted">A conta-pai nunca será usada como recebedora do próprio split. Sellers serão vinculados por subconta e walletId, com escrow configurado quando aplicável.</p></div></div>';
 const b=document.querySelector('#validateAsaas');if(b)b.onclick=()=>showAdmin();
}

// Navegação contextual do painel
C.addEventListener('click',function(e){const action=e.target.closest('[data-go]');if(action)activateView(action.dataset.go)});
