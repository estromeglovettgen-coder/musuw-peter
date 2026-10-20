// Offline shared-component consumer checks; no browser or provider calls.
const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const {parseHTML}=require(process.env.ALPHAI_TEST_DOM_MODULE || 'linkedom');const CSSOM=require(process.env.ALPHAI_TEST_CSS_MODULE || 'cssom');
const root=require('node:path').join(__dirname,'site')+require('node:path').sep;
for(const file of ['components.css','workbench.css']){const ast=CSSOM.parse(fs.readFileSync(root+file,'utf8'));assert(ast.cssRules.length>30);console.log(file,ast.cssRules.length,'CSS rules parsed');}
const html=fs.readFileSync(root+'component-library.html','utf8');const {window}=parseHTML(html);const timers=[];window.setTimeout=(fn)=>{timers.push(fn);return timers.length};let objectURL=0;const urls={createObjectURL:()=>`blob:demo-${++objectURL}`,revokeObjectURL:()=>{}};
// linkedom has no mutable select.value; model the browser property explicitly.
const modelSelect=select=>{let value=select.querySelector('option[selected]')?.value??select.querySelector('option')?.value??'';Object.defineProperty(select,'value',{configurable:true,get:()=>value,set:next=>{value=String(next)}});};
window.document.querySelectorAll('select').forEach(modelSelect);
window.document.querySelectorAll('dialog').forEach(d=>{d.showModal=()=>{d.open=true};d.close=()=>{d.open=false};});
const ctx=vm.createContext({window,document:window.document,console,URL:urls,Blob,getComputedStyle:()=>({getPropertyValue:name=>'value-'+name}),Number,WeakMap,Object,String});
vm.runInContext(fs.readFileSync(root+'fire-components.js','utf8'),ctx);ctx.FireUI=window.FireUI;
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'),ctx);window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
let checks=0;const ok=(condition,msg)=>{assert(condition,msg);checks++};const click=id=>window.document.querySelector(id).dispatchEvent(new window.Event('click',{bubbles:true}));
ok(window.document.querySelectorAll('[data-fire-icon] svg').length===window.document.querySelectorAll('[data-fire-icon]').length,'hydrate every static icon');
ok(window.FireUI.icon('missing')==='','unknown icon cannot inject arbitrary markup');
ok(window.FireUI.icon('<svg>')==='','reject arbitrary names');
ok(window.FireUI.icon('x',{size:100}).includes('width="64"'),'clamp icon size');
const demoRatio=window.document.querySelector('[data-fire-choices-for="demo-ratio"]');ok(demoRatio.querySelectorAll('.fire-choice-shape').length===4,'actual catalog ratio consumer draws four proportional tiles');demoRatio.querySelectorAll('[role="radio"]')[2].dispatchEvent(new window.Event('click',{bubbles:true}));ok(window.document.querySelector('#demo-ratio-help').textContent==='当前：横版 16:9','catalog ratio choices update real change consumer');
window.document.querySelector('[data-fire-choices-for="demo-model"] [role="radio"]:nth-child(2)').dispatchEvent(new window.Event('click',{bubbles:true}));ok(window.document.querySelector('#demo-model-help').textContent==='当前：GPT Image 2','catalog model card updates real change consumer');
const busy=window.document.querySelector('#demo-busy');click('#demo-busy');ok(busy.disabled,'busy disables button');ok(busy.getAttribute('aria-busy')==='true','busy state accessible');ok(busy.textContent==='演示处理中','busy label updates');timers.shift()();ok(!busy.disabled&&busy.textContent==='点击体验处理中','busy restores label and enabled state');
const previous=window.document.querySelector('button[disabled]');previous.disabled=true;window.FireUI.setBusy(previous,true);window.FireUI.setBusy(previous,true);window.FireUI.setBusy(previous,false);ok(previous.disabled,'busy restores previously disabled state');
click('[data-demo-chip="发型"]');ok(window.document.querySelector('[data-demo-chip="发型"]').getAttribute('aria-pressed')==='true','chip pressed toggles');ok(window.document.querySelector('#demo-chip-status').textContent.includes('发型'),'chip summary updates');
click('#demo-tab-history');ok(window.document.querySelector('#demo-panel-studio').hidden,'inactive panel hidden');ok(!window.document.querySelector('#demo-panel-history').hidden,'active panel visible');ok(window.document.querySelector('#demo-tab-history').getAttribute('tabindex')==='0','tab roving focus');
const endEvent=new window.Event('keydown',{bubbles:true,cancelable:true});endEvent.key='Home';window.document.querySelector('#demo-tab-history').dispatchEvent(endEvent);ok(window.document.querySelector('#demo-tab-studio').getAttribute('aria-selected')==='true','Home selects first tab');
click('#open-settings-demo');ok(window.document.querySelector('#settings-demo').open,'dialog opens');click('#settings-demo [data-dialog-close]');ok(!window.document.querySelector('#settings-demo').open,'dialog close delegates');
click('#demo-success-toast');ok(window.document.querySelector('.fire-toast[data-tone="success"]'),'success notice renders');
const required=window.document.querySelector('#demo-required');required.value='已填写';required.dispatchEvent(new window.Event('input'));ok(required.getAttribute('aria-invalid')==='false','input validation clears aria-invalid');ok(window.document.querySelector('#demo-field-error').hidden,'validation message clears');
window.FireUI.toast('<img src=x onerror=bad()>');ok(!window.document.querySelector('.fire-toast:last-child img'),'notification does not parse markup');
const upload=window.document.querySelector('#demo-upload');Object.defineProperty(upload,'files',{value:[{type:'image/png',name:'face.png'}]});upload.dispatchEvent(new window.Event('change'));ok(window.document.querySelector('#demo-upload-preview').getAttribute('src')==='blob:demo-1','upload uses local object URL');ok(window.document.querySelector('#demo-upload-status').textContent==='face.png','upload label updates');
click('#download-tokens');ok(objectURL===2,'token download creates local artifact');
async function verifyChoices(){
  const document=window.document;
  const fixture=document.createElement('div');fixture.innerHTML='<select id="test-choices"><option value="3:4">竖版</option><option value="1:1">方图</option><option value="9:16" disabled>不可用</option></select><div data-fire-choices-for="test-choices" data-choice-variant="ratio" aria-label="比例"></div>';document.body.append(fixture);
  const select=fixture.querySelector('select');modelSelect(select);const group=fixture.querySelector('[data-fire-choices-for]');let changes=0;select.addEventListener('change',()=>{changes++});
  window.FireUI.enhanceChoices(fixture);const radios=()=>[...group.querySelectorAll('[role="radio"]')];
  ok(select.hidden&&select.getAttribute('tabindex')==='-1'&&select.getAttribute('aria-hidden')==='true','underlying select stays authoritative and out of the focus tree');
  ok(group.getAttribute('role')==='radiogroup'&&radios().length===3,'choice group exposes all ratio radio tiles');
  ok(radios()[0].getAttribute('aria-checked')==='true'&&radios()[0].getAttribute('tabindex')==='0','selected ratio is the sole tab stop');
  ok(radios()[2].disabled&&radios()[2].getAttribute('tabindex')==='-1','disabled option is not focusable');
  radios()[1].dispatchEvent(new window.Event('click',{bubbles:true}));ok(select.value==='1:1'&&changes===1&&radios()[1].getAttribute('aria-checked')==='true','choice click updates original select and emits one change');
  window.FireUI.enhanceChoices(fixture);window.FireUI.hydrate(fixture);radios()[0].dispatchEvent(new window.Event('click',{bubbles:true}));ok(changes===2&&radios().length===3,'repeated hydration does not duplicate listeners or choices');
  const firstButton=radios()[0];let focused;radios().forEach(button=>{button.focus=()=>{focused=button}});const move=new window.Event('keydown',{bubbles:true,cancelable:true});move.key='ArrowRight';firstButton.dispatchEvent(move);ok(select.value==='1:1'&&focused===radios()[1]&&move.defaultPrevented,'arrow keys select and focus enabled choices');
  const end=new window.Event('keydown',{bubbles:true,cancelable:true});end.key='End';radios()[0].dispatchEvent(end);ok(select.value==='1:1','End skips unavailable last option');
  const home=new window.Event('keydown',{bubbles:true,cancelable:true});home.key='Home';radios()[1].dispatchEvent(home);ok(select.value==='3:4','Home selects first enabled option');
  select.value='1:1';select.dispatchEvent(new window.Event('change',{bubbles:true}));ok(radios()[1].getAttribute('aria-checked')==='true','external select changes refresh choice state');
  const newOption=document.createElement('option');newOption.value='16:9';newOption.textContent='<img src=x onerror=bad()> 横版';newOption.dataset.description='可用模型说明';select.append(newOption);await new Promise(resolve=>setImmediate(resolve));
  ok(radios().length===4&&radios()[0]===firstButton,'option mutations automatically refresh while preserving existing button identity');
  ok(!group.querySelector('img')&&radios()[3].textContent.includes('<img'),'untrusted option text never becomes markup');
  select.innerHTML='<option value="3:4">竖版更新</option><option value="1:1">方图</option><option value="9:16" disabled>不可用</option><option value="16:9" data-description="可用模型说明">横版</option>';await new Promise(resolve=>setImmediate(resolve));ok(radios()[0]===firstButton,'configuration option replacement preserves matching button nodes and keyboard focus');
  select.disabled=true;await new Promise(resolve=>setImmediate(resolve));ok(radios().every(button=>button.disabled&&button.getAttribute('tabindex')==='-1'),'disabled select automatically disables entire choice group');
  select.disabled=false;select.querySelector('option[value="1:1"]').textContent='方形照片';await new Promise(resolve=>setImmediate(resolve));ok(radios()[1].textContent.includes('方形照片')&&!radios()[0].disabled,'label and disabled mutations refresh without manual work');
  group.dataset.choiceVariant='model';window.FireUI.enhanceChoices(fixture);ok(radios()[3].querySelector('.fire-choice-description')?.textContent==='可用模型说明','model cards consume optional safe description');
  const disabledChoice=radios()[2];disabledChoice.dispatchEvent(new window.Event('click',{bubbles:true}));ok(select.value==='1:1','synthetic clicks cannot select disabled choices');
  console.log('PASS:',checks,'component interactions; no network or provider API calls');
}
verifyChoices().catch(error=>{console.error(error);process.exitCode=1;});
