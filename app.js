const editor=document.querySelector('#codeEditor');
const runButton=document.querySelector('#runButton');
const hintButton=document.querySelector('#hintButton');
const feedback=document.querySelector('#feedback');
const nextButton=document.querySelector('#nextButton');
const requirements={
  syntax:document.querySelector('#reqSyntax'),
  operator:document.querySelector('#reqOperator'),
  result:document.querySelector('#reqResult'),
  hidden:document.querySelector('#reqHidden')
};

function reset(){
  Object.values(requirements).forEach(item=>item.classList.remove('done'));
  nextButton.disabled=true;
  nextButton.classList.remove('unlocked');
  nextButton.textContent='Próxima fase bloqueada 🔒';
  document.querySelector('#progressBar').style.width='0%';
  document.querySelector('#progressText').textContent='0%';
}

function mark(name){ requirements[name].classList.add('done'); }

function evaluate(){
  reset();
  const source=editor.value;
  const usesMultiplication=/valorPorServico\s*\*\s*quantidade/.test(source);
  if(usesMultiplication) mark('operator');

  let total;
  try{
    const calculation=source.match(/const\s+total\s*=\s*([^;]+);/);
    if(!calculation) throw new Error('A variável total não foi encontrada.');
    const expression=calculation[1]
      .replaceAll('valorPorServico','53.99')
      .replaceAll('quantidade','8');
    if(!/^[\d\s.+*/()-]+$/.test(expression)) throw new Error('Expressão não permitida.');
    total=Function('"use strict";return ('+expression+')')();
    mark('syntax');
  }catch(error){
    feedback.className='feedback error';
    feedback.innerHTML='<strong>O código ainda não executou.</strong><span>'+error.message+' Revise a linha que calcula o total.</span>';
    return;
  }

  if(Math.abs(total-431.92)<0.000001) mark('result');
  const hiddenPass=usesMultiplication && [2,5,11].every(quantity=>{
    const computed=53.99*quantity;
    return Number.isFinite(computed) && computed===53.99*quantity;
  });
  if(hiddenPass) mark('hidden');

  const passed=Object.values(requirements).every(item=>item.classList.contains('done'));
  const score=Object.values(requirements).filter(item=>item.classList.contains('done')).length*25;
  document.querySelector('#progressBar').style.width=score+'%';
  document.querySelector('#progressText').textContent=score+'%';

  if(passed){
    feedback.className='feedback success';
    feedback.innerHTML='<strong>Fase aprovada: domínio comprovado!</strong><span>Seu código passou pelos requisitos essenciais e pelo teste oculto.</span>';
    nextButton.disabled=false;
    nextButton.classList.add('unlocked');
    nextButton.textContent='Avançar para a fase 2 →';
  }else{
    feedback.className='feedback error';
    feedback.innerHTML='<strong>Você alcançou '+score+'% dos requisitos.</strong><span>A fase exige 100%. Veja a dica, revise o operador e tente novamente.</span>';
  }
}

runButton.addEventListener('click',evaluate);
hintButton.addEventListener('click',()=>{
  feedback.className='feedback neutral';
  feedback.innerHTML='<strong>Dica do Mentor RENOVA</strong><span>Em JavaScript, o símbolo usado para multiplicar é um asterisco. Experimente substituir os três traços por ele.</span>';
});
nextButton.addEventListener('click',()=>{
  document.querySelector('[data-phase="2"]').disabled=false;
  document.querySelector('[data-phase="2"]').classList.remove('locked');
  document.querySelector('[data-phase="2"] small').textContent='Liberada';
  nextButton.textContent='Fase 2 liberada ✓';
});
reset();