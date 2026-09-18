const cfg=window.OYAG_CONFIG,sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);let session,role=null;const C=document.querySelector('#content'),title=document.querySelector('#viewTitle');const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));async function init(){const {data}=await sb.auth.getSession();session=data.session;if(!session){location.replace('./login.html');return}document.querySelector('#userEmail').textContent=session.user.email;const {data:r}=await sb.from('platform_roles').select('role').eq('user_id',session.user.id).maybeSingle();role=r?.role||'usuário';document.querySelector('#role').textContent=role==='owner'?'Conta Dono':role;const internal=document.querySelector('#internalProjectNav');if(internal&&!['owner','platform_admin'].includes(role))internal.remove();await loadUserProjects();show('overview')}document.querySelector('#logout').onclick=async()=>{await sb.auth.signOut();location.replace('./')};document.querySelector('#nav').onclick=e=>{const b=e.target.closest('button[data-view]');if(!b)return;document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');show(b.dataset.view)};const cards=(items)=>'<div class="grid">'+items.map(x=>'<article class="metric"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2]||'')+'</small></article>').join('')+'</div>';async function count(table,filter){let q=sb.from(table).select('*',{count:'exact',head:true});if(filter)q=filter(q);const {count,error}=await q;return error?'—':count}async function show(v){C.innerHTML='<div class="loading">Consultando dados do OYAG…</div>';const names={overview:'Visão geral',companies:'Empresas',units:'Unidades OYAG',network:'Afiliados & Rede',performance:'Performance',finance:'Financeiro & Ledger',alerts:'Alertas & Intervenções',project:'Projeto OYAG',admin:'Administração'};title.textContent=names[v];if(v==='project'){await showProject();return}if(v==='performance'){await showPerformance();return}if(v==='overview'){const vals=await Promise.all([count('organizations'),count('oyag_units'),count('oyag_affiliate_memberships',q=>q.eq('status','active')),count('oyag_operational_alerts',q=>q.eq('status','open'))]);C.innerHTML=cards([['Empresas',vals[0],'organizações visíveis'],['Unidades',vals[1],'estrutura OYAG'],['Afiliados ativos',vals[2],'rede atual'],['Alertas abertos',vals[3],'continuidade operacional']])+notice();return}const map={companies:'organizations',units:'oyag_owner_unit_overview',network:'oyag_affiliate_memberships',finance:'oyag_ledger_account_balances',alerts:'oyag_operational_alerts',admin:'platform_roles'};const {data,error}=await sb.from(map[v]).select('*').limit(50);if(error){C.innerHTML=statePanel('Não foi possível carregar esta área','Tente novamente. Se o problema continuar, procure o suporte.');return}C.innerHTML=renderDomain(v,data||[])}async function showProject(){
 const [{data:tasks,error},{data:phases}]=await Promise.all([
  sb.from('oyag_project_tasks').select('id,title,description,status,priority,sector,phase_id,blocked_reason,completed_at,position').order('position'),
  sb.from('oyag_project_phases').select('id,name,position').order('position')
 ]);
 if(error){C.innerHTML='<div class="panel"><h2>Projeto OYAG</h2><p>'+esc(error.message)+'</p></div>';return}
 const statuses=[['backlog','Backlog'],['todo','A Fazer'],['in_progress','Em andamento'],['blocked','Bloqueado'],['review','Revisão'],['done','Concluído']];
 const total=tasks.length,done=tasks.filter(t=>t.status==='done').length,pct=total?Math.round(done*100/total):0;
 C.innerHTML='<div class="project-head">'+cards([['Progresso',pct+'%','conclusão geral'],['Concluídas',done,total+' tarefas'],['Em andamento',tasks.filter(t=>t.status==='in_progress').length,'execução atual'],['Bloqueadas',tasks.filter(t=>t.status==='blocked').length,'dependências']])+
 '<div class="progress"><i style="width:'+pct+'%"></i></div></div>'+
 '<div class="kanban">'+statuses.map(([key,label])=>'<section class="kanban-col"><header><b>'+label+'</b><span>'+tasks.filter(t=>t.status===key).length+'</span></header><div>'+
 tasks.filter(t=>t.status===key).map(t=>'<article class="task priority-'+esc(t.priority)+'"><div class="task-top"><span>'+esc(t.sector||'OYAG')+'</span><b>'+esc(t.priority)+'</b></div><h3>'+esc(t.title)+'</h3>'+
 '<p>'+esc((phases||[]).find(p=>p.id===t.phase_id)?.name||'Sem fase')+'</p>'+(t.blocked_reason?'<small>⚠ '+esc(t.blocked_reason)+'</small>':'')+'</article>').join('')+
 '</div></section>').join('')+'</div>';
}
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
document.querySelector('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-user-project]');if(!b)return;document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');showUserProject(b.dataset.userProject,b.textContent)});
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
function notice(){return '<div class="panel"><h2>Ambiente protegido</h2><p>Ambiente protegido e preparado para centralizar a gestão do seu negócio com segurança, organização e controle.</p></div>'}init();