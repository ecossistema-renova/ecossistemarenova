(async()=>{
const guard=document.querySelector('#guard'),checkout=document.querySelector('#checkout'),result=document.querySelector('#result');
const show=(msg,kind='')=>{guard.textContent=msg;guard.className='notice '+kind};
try{
 const cfg=window.OYAG_CONFIG,mpCfg=window.OYAG_MP_TEST_CONFIG;
 if(!cfg||!mpCfg) throw new Error('Configuração OYAG indisponível.');
 const sb=supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
 const {data:{session},error}=await sb.auth.getSession();
 if(error||!session){show('Entre na sua conta OYAG antes de abrir este checkout de teste.','err');return}
 show('Sessão OYAG validada. Use somente os dados oficiais de teste do Mercado Pago.','ok');
 checkout.hidden=false;
 const mp=new MercadoPago(mpCfg.publicKey,{locale:'pt-BR'});
 const bricks=mp.bricks();
 window.cardPaymentBrickController=await bricks.create('cardPayment','cardPaymentBrick_container',{
   initialization:{amount:10},
   callbacks:{
     onReady:()=>{},
     onSubmit:(formData,additionalData)=>new Promise(async(resolve,reject)=>{
       result.hidden=false;result.textContent='Processando Order de teste…';
       try{
         const submitData={
           type:'online',
           total_amount:String(formData.transaction_amount),
           processing_mode:'automatic',
           payer:{email:formData.payer.email,identification:formData.payer.identification},
           transactions:{payments:[{amount:String(formData.transaction_amount),payment_method:{
             id:formData.payment_method_id,
             type:additionalData.paymentTypeId,
             token:formData.token,
             installments:formData.installments
           }}]}
         };
         const {data,error}=await sb.functions.invoke('mercado-pago-test-orders',{body:submitData});
         if(error) throw error;
         result.textContent=JSON.stringify(data,null,2);
         if(data?.ok){show('Order de teste enviada ao Mercado Pago. Confira o resultado abaixo.','ok');resolve()}
         else{show('O Mercado Pago não aprovou a solicitação. Confira o retorno abaixo.','err');reject(new Error(data?.error||'Falha'))}
       }catch(e){result.textContent='Falha ao processar o teste: '+(e?.message||String(e));show('A compra de teste não foi concluída.','err');reject(e)}
     }),
     onError:(error)=>{result.hidden=false;result.textContent='Erro do Brick: '+JSON.stringify(error,null,2)}
   }
 });
}catch(e){show('Não foi possível carregar o checkout de teste: '+(e?.message||String(e)),'err')}
})();