import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the browser event lifecycle without a microphone or speech service.
function harness() {
  const states = [], effects = [], instances = [];
  const react = {
    useState(value) { const index=states.length; states.push(value); return [value,next=>{states[index]=next}]; },
    useRef(value) { return {current:value}; },
    useEffect(effect) { effects.push(effect()); },
  };
  class Recognition {
    constructor() { instances.push(this); }
    start() {}
    stop() { this.onend?.(); }
    abort() { this.aborted=true; this.onend?.(); }
  }
  let timeout;
  const context = {exports:{}, require:name=>{assert.equal(name,'react');return react}, window:{SpeechRecognition:Recognition,speechSynthesis:{cancel(){}}}, setTimeout:fn=>{timeout=fn;return 1}, clearTimeout:()=>{timeout=null}};
  const source = ts.transpileModule(readFileSync(new URL('./useSpeechInput.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,context);
  const results=[];
  const hook=context.exports.useSpeechInput(text=>results.push(text));
  return {hook,states,instances,results,finish:()=>effects.forEach(fn=>fn?.()),timeout:()=>timeout?.()};
}
test('dictado entrega una sola frase completa al terminar, sin duplicar resultados',()=>{
  const h=harness();h.hook.toggle();const recognition=h.instances[0];recognition.onstart();
  recognition.onresult({results:[{isFinal:true,0:{transcript:'quiero cardiología'}}]});
  recognition.onresult({results:[{isFinal:true,0:{transcript:'quiero cardiología'}},{isFinal:true,0:{transcript:'el viernes en la mañana'}}]});
  assert.deepEqual(h.results,[]);recognition.onend();
  assert.deepEqual(h.results,['quiero cardiología el viernes en la mañana']);assert.equal(h.states[0],'idle');
});
test('denegar micrófono permite reintentar y no genera una reserva',()=>{
  const h=harness();h.hook.toggle();h.instances[0].onerror({error:'not-allowed'});
  assert.equal(h.states[0],'idle');assert.match(h.states[1],/bloqueado/);assert.deepEqual(h.results,[]);
  h.hook.toggle();assert.equal(h.instances.length,2);h.finish();
});
test('inicio bloqueado tiene tiempo límite y se libera',()=>{
  const h=harness();h.hook.toggle();h.timeout();assert.equal(h.states[0],'idle');assert.equal(h.instances[0].aborted,true);assert.deepEqual(h.results,[]);
});
test('cerrar la pantalla cancela eventos pendientes',()=>{
  const h=harness();h.hook.toggle();h.finish();assert.equal(h.instances[0].aborted,true);assert.equal(h.instances[0].onresult,null);assert.deepEqual(h.results,[]);
});
