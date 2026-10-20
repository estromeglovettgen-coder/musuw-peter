// UI routing and hidden prompt behavior; runs offline, never calls generation.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {parseHTML} = require(process.env.ALPHAI_TEST_DOM_MODULE || 'linkedom');
const {window} = parseHTML(fs.readFileSync('site/index.html','utf8'));
assert(window.document.body.classList.contains('fire-workbench'),'new branded workbench must be the application entry');
assert(window.document.querySelector('#legacy-workspace-state')?.hidden,'legacy prompt controls must have a hidden ancestor');
assert.equal(window.document.querySelectorAll('[data-workbench-view]').length,4,'one sidebar owns all four routes');
assert.equal(window.document.querySelector('.topbar'),null,'there is no duplicate top navigation');
assert.equal(window.document.querySelector('#pose-fidelity-control'),null,'pose settings have been removed');
assert.equal(window.document.querySelector('.recent-results'),null,'recent results do not occupy the preview');
assert.equal(window.document.querySelector('link[href*="styles.css"]'),null,'legacy light-theme CSS is isolated from the new shell');
const location={hash:'',hostname:'127.0.0.1',search:'',origin:'http://127.0.0.1:5173',href:'http://127.0.0.1:5173/',protocol:'http:'};
window.location=location;
const ctx=vm.createContext({window,document:window.document,location,URL,console,Event:window.Event,CustomEvent:window.CustomEvent});
vm.runInContext(fs.readFileSync('site/workbench.js','utf8'),ctx);
const calls=[];
const modes=[];
const references=[{slotId:'image-one',name:'portrait.jpg',dataUrl:'data:image/jpeg;base64,AA==',roles:['face']},{slotId:'image-two',name:'outfit.jpg',dataUrl:'data:image/jpeg;base64,AB==',roles:['upper']}];
const materials=[{name:'saved.jpg',dataUrl:'data:image/jpeg;base64,AC==',roles:['face']}];
const results=[{image:'data:image/png;base64,AA==',meta:'之前的生成结果',savedAt:1}];
const config={generationPaused:true,modelOptions:[{id:'image25',label:'Image 2.5'}]};
window.fireWorkbench.connect({
 getReferences:()=>references,getRoles:()=>[{id:'face',label:'脸',allowMultipleSources:true},{id:'upper',label:'上半身穿搭'}],getMaterials:()=>materials,getResults:()=>results,
 getActiveResult:()=>results[0],getSiteConfig:()=>config,getValidation:()=>({valid:true,errors:[]}),
 setCreationMode:mode=>modes.push(mode),
 useMaterial:item=>calls.push(['material',item.name]),showResult:item=>calls.push(['result',item.meta]),previewResult:item=>calls.push(['preview',item.meta]),downloadResult:item=>calls.push(['download',item.meta]),uploadFiles:files=>calls.push(['upload',files.length]),
 notify:message=>calls.push(['notice',message])
});
const click=selector=>window.document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
click('[data-workbench-view="free"]');
assert.equal(window.document.querySelector('#studio').hidden,false,'free creation uses the real live editor and preview');
assert.equal(window.document.querySelector('#free-create-panel').hidden,false,'free creation exposes its description input');
assert.equal(window.document.body.dataset.creationMode,'free');
assert.equal(modes.at(-1),'custom','explicit free creation uses the existing custom pipeline');
assert.equal(window.document.querySelector('#reference-guidance').hidden,true,'free references do not require composition roles');
click('[data-workbench-view="studio"]');
assert.equal(window.document.querySelector('#free-create-panel').hidden,true,'composition hides free creation text');
assert.equal(window.document.body.dataset.creationMode,'compose');
assert.equal(modes.at(-1),'default','composition restores reference-driven compilation');
click('[data-workbench-view="materials"]');
assert.equal(window.document.querySelector('#materials-view').hidden,false);
assert.equal(window.document.querySelector('#studio').hidden,true);
assert.equal(window.document.querySelectorAll('[data-workbench-view="materials"][aria-current="page"]').length,1,'the sidebar has one active navigation state');
click('[data-material-use]');
assert.deepEqual(calls[0],['material','saved.jpg']);
click('[data-workbench-view="history"]');
assert.equal(window.document.querySelector('#history-view').hidden,false);
click('[data-history-open]');
assert.deepEqual(calls[1],['result','之前的生成结果']);
assert.equal(window.document.querySelector('#studio').hidden,false,'using a result returns to the live preview');
click('#preview-expand-button');
assert.deepEqual(calls[2],['preview','之前的生成结果']);
click('#download-current-button');
assert.deepEqual(calls[3],['download','之前的生成结果']);
assert.match(window.document.querySelector('#selection-summary').textContent,/脸/);
assert.equal(window.document.querySelectorAll('#selected-reference-thumbs img').length,2);
assert.match(window.document.querySelector('#workbench-generation-state').textContent,/暂停/);
for (const status of ['unknown','failed']) { config.generationPaused=false;config.generationSubmitted=true;config.generationStatus=status;window.fireWorkbench.refresh();assert.match(window.document.querySelector('#workbench-generation-state').textContent,/请求已提交/);assert.doesNotMatch(window.document.querySelector('#workbench-generation-state').textContent,/完成|成功/);assert.doesNotMatch(window.document.querySelector('#settings-generation-status').textContent,/完成|成功/);}
results.length=0;materials.length=0;window.fireWorkbench.navigate("history");
assert(window.document.querySelector('#history-view .fire-empty-state'),'history has an actionable empty state');
window.fireWorkbench.navigate('materials');
assert(window.document.querySelector('#materials-view .fire-empty-state'),'materials has an actionable empty state');
console.log('fire workbench offline UI: single sidebar, free creation, removed controls, material reuse, history preview, download, summaries, pause status and empty states passed');
