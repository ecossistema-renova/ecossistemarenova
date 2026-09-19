const cfg=window.OYAG_CONFIG;
const legacySessionKey='sb-'+new URL(cfg.supabaseUrl).hostname.split('.')[0]+'-auth-token';
if(!localStorage.getItem(legacySessionKey)&&sessionStorage.getItem(legacySessionKey)){
  localStorage.setItem(legacySessionKey,sessionStorage.getItem(legacySessionKey));
  sessionStorage.removeItem(legacySessionKey);
}
const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
 auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:localStorage}
});
const params=new URLSearchParams(location.search);
let signup=params.get('mode')==='signup';
const accountCreated=params.get('created')==='1';
const needsEmailConfirmation=params.get('confirm')==='1';
const prefillEmail=params.get('email')||'';
const requestedNext=params.get('next');
function safeNext(){
 if(!requestedNext)return './dashboard.html';
 try{
  const u=new URL(requestedNext,location.href);
  if(u.origin!==location.origin)return './dashboard.html';
  return u.pathname+u.search+u.hash;
 }catch{return './dashboard.html'}
}
const afterAuth=safeNext();
const f=document.querySelector('#authForm'),t=document.querySelector('#title'),s=document.querySelector('#submit'),toggle=document.querySelector('#toggle'),msg=document.querySelector('#msg'),signupFields=document.querySelector('#signupFields'),consents=document.querySelector('#consents'),password=document.querySelector('#password'),togglePassword=document.querySelector('#togglePassword'),forgot=document.querySelector('#forgotPassword');
function render(){t.textContent=signup?'Criar conta':'Entrar';s.textContent=signup?'Criar conta':'Entrar';toggle.textContent=signup?'Já tenho conta':'Ainda não tenho conta';signupFields.hidden=!signup;consents.hidden=!signup;forgot.hidden=signup;password.autocomplete=signup?'new-password':'current-password'}
render();
if(prefillEmail)document.querySelector('#email').value=prefillEmail;
if(accountCreated&&!signup){
 msg.textContent=needsEmailConfirmation
  ?'Conta criada. Confirme seu e-mail pelo link enviado e depois entre com sua senha.'
  :'Conta criada com sucesso. Agora entre com seu e-mail e senha.';
 msg.classList.add('ok');
}
toggle.onclick=()=>{signup=!signup;render();msg.textContent='';msg.classList.remove('ok')};
togglePassword.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';togglePassword.textContent=show?'🙈':'👁';togglePassword.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha')};
forgot.onclick=async()=>{const email=document.querySelector('#email').value.trim();if(!email){msg.textContent='Informe seu e-mail para recuperar a senha.';return}msg.textContent='Enviando link de recuperação…';const redirectTo=new URL('./reset-password.html',location.href).href;const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});msg.textContent=error?'Não foi possível enviar o link agora. Tente novamente.':'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.'};
const normalizePhone=v=>v.replace(/[^\d+]/g,'');
f.onsubmit=async e=>{e.preventDefault();msg.textContent='Processando…';const email=document.querySelector('#email').value.trim(),pass=password.value;
 if(signup){const fullName=document.querySelector('#fullName').value.trim(),phone=normalizePhone(document.querySelector('#phone').value),terms=document.querySelector('#terms').checked,marketing=document.querySelector('#marketing').checked;if(fullName.length<3){msg.textContent='Informe seu nome completo.';return}if(!/^\+\d{10,15}$/.test(phone)){msg.textContent='Informe o WhatsApp com código do país. Exemplo: +55 11 99999-9999.';return}if(!terms){msg.textContent='Para criar a conta, é necessário aceitar os Termos de Uso e a Política de Privacidade.';return}const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:fullName,phone,terms_accepted_at:new Date().toISOString(),marketing_consent:marketing,marketing_consent_at:marketing?new Date().toISOString():null}}});
 if(error){
  console.error('OYAG_SIGNUP',error);
  msg.textContent=error.code==='email_address_invalid'
   ?'Informe um e-mail válido.'
   :error.code==='weak_password'
    ?'Use uma senha mais forte, com pelo menos 8 caracteres.'
    :'Não foi possível criar a conta agora. Confira os dados e tente novamente.';
  return
 }
 const identities=Array.isArray(data?.user?.identities)?data.user.identities:[];
 if(!data?.user||identities.length===0){
  signup=false;
  render();
  document.querySelector('#email').value=email;
  msg.classList.remove('ok');
  msg.textContent='Este e-mail já está vinculado a uma conta. Entre com sua senha ou use “Esqueci minha senha”.';
  return
 }
 if(data.session){await sb.auth.signOut()}
 const loginUrl=new URL('./login.html',location.href);
 loginUrl.searchParams.set('created','1');
 loginUrl.searchParams.set('email',email);
 if(!data.session)loginUrl.searchParams.set('confirm','1');
 if(requestedNext)loginUrl.searchParams.set('next',requestedNext);
 location.replace(loginUrl.pathname+loginUrl.search);
 return}
 const {error}=await sb.auth.signInWithPassword({email,password:pass});if(error){
  console.error('OYAG_LOGIN',error);
  msg.classList.remove('ok');
  msg.textContent=error.code==='email_not_confirmed'
   ?'Seu e-mail ainda não foi confirmado. Abra a mensagem enviada pelo OYAG e confirme o cadastro antes de entrar.'
   :error.code==='invalid_credentials'
    ?'E-mail ou senha incorretos. Confira os dados ou use “Esqueci minha senha”.'
    :'Não foi possível entrar agora. Tente novamente.';
  return
 }location.replace(afterAuth)
};
(async()=>{const {data}=await sb.auth.getSession();if(data.session&&!accountCreated)location.replace(afterAuth)})();