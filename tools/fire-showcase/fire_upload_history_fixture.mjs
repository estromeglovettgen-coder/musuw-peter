// Offline Chromium fixture using its standard DevTools protocol; no browser
// dependency, external account, provider request or user profile is involved.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(os.tmpdir(), 'fire-browser-fixture-'));
const chrome = spawn(process.env.FIRE_SHOWCASE_TEST_CHROME, ['--headless', '--disable-gpu',
  '--disable-background-networking', '--disable-component-update', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
  'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
chrome.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-4000); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(50); }
  }
  assert(port, 'private headless browser did not start: ' + browserLog);
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixtureErrors = []; window.fixtureHistoryReads = 0;
    window.addEventListener('error', event => fixtureErrors.push(event.message));
    const fixtureOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args) => { fixtureHistoryReads++; return fixtureOpen(...args); };
  ` });
  await call('Page.navigate', { url: process.argv[2] });
  const result = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `
(async () => {
 const wait=ms=>new Promise(r=>setTimeout(r,ms));let frame,w;
 for(let i=0;i<300;i++){frame=document.querySelector('iframe');w=frame?.contentWindow;if(w?.document.body?.dataset.fireHostState==='ready'&&!w.document.body.classList.contains('auth-pending'))break;if(i===299)throw Error('source never ready');await wait(20);}
 const run=code=>w.eval(code), hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const canvas=document.createElement('canvas');canvas.width=3;canvas.height=2;canvas.getContext('2d').fillRect(0,0,3,2);
 const bytes=type=>Uint8Array.from(atob(canvas.toDataURL(type).split(',')[1]),c=>c.charCodeAt(0));
 const jpg=bytes('image/jpeg'),png=bytes('image/png'),webp=bytes('image/webp');
 const avif=Uint8Array.from(atob('AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAD5bWV0YQAAAAAAAAAvaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAFBpY3R1cmVIYW5kbGVyAAAAAA5waXRtAAAAAAABAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAASEAAAAjAAAAKGlpbmYAAAAAAAEAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAAGppcHJwAAAAS2lwY28AAAAUaXNwZQAAAAAAAABAAAAAQAAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EADAAAAAATY29scm5jbHgAAgACAAIAAAAAF2lwbWEAAAAAAAAAAQABBAECgwQAAAArbWRhdAoKAAAAAq//iV8gCDIVEACsAgUUIIEAAAMlA6Iofx4PJCp0'),c=>c.charCodeAt(0));
 const gif=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),c=>c.charCodeAt(0));
 const bmp=new Uint8Array(58),view=new DataView(bmp.buffer);bmp.set([66,77]);view.setUint32(2,58,true);view.setUint32(10,54,true);view.setUint32(14,40,true);view.setInt32(18,1,true);view.setInt32(22,1,true);view.setUint16(26,1,true);view.setUint16(28,24,true);
 const heic=Uint8Array.from([0,0,0,24,102,116,121,112,104,101,105,99,0,0,0,0,104,101,105,99,109,105,102,49]);
 const checks={};
 w.fireWorkbench.navigate('free');const custom=w.document.querySelector('#prompt-output');custom.value='';custom.dispatchEvent(new w.Event('input',{bubbles:true}));checks.freeEmptyDisabled=w.document.querySelector('#generate-button').disabled&&/请先描述/.test(w.document.querySelector('#generate-button').textContent);custom.value='A synthetic text-only picture';custom.dispatchEvent(new w.Event('input',{bubbles:true}));checks.freeTextOnlyAllowed=!w.document.querySelector('#generate-button').disabled;w.fireWorkbench.navigate('studio');
 w.updateDurableGenerationControls();checks.emptyCompositionDisabled=w.document.querySelector('#generate-button').disabled;checks.emptyCompositionHint=/至少.*2/.test(w.document.querySelector('#generate-button').textContent);
 const codecFormats=${process.env.FIRE_SHOWCASE_TEST_CODECS === "1"} ? [
  ['phone.HEIC','image/heic',Uint8Array.from(atob('AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABfG1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAImlsb2MAAAAAREAAAQABAAAAAAGcAAEAAAAAAAAALgAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGh2YzEAAAAADnBpdG0AAAAAAAEAAAD8aXBycAAAANxpcGNvAAAAdWh2Y0MBA3AAAACQAAAAAAAe8AD8/fj4AAAPA2AAAQAYQAEMAf//A3AAAAMAkAAAAwAAAwAeugJAYQABAClCAQEDcAAAAwCQAAADAAADAB6gIIEFluqumubgIaDAgAAADIAAAAMAhGIAAQAGRAHBc8GJAAAAE2NvbHJuY2x4AAEADQAGgAAAABRpc3BlAAAAAAAAAEAAAABAAAAAKGNsYXAAAAADAAAAAQAAAAIAAAAB////wwAAAAL////CAAAAAgAAABBwaXhpAAAAAAMICAgAAAAYaXBtYQAAAAAAAAABAAEFgQIDBYQAAAA2bWRhdAAAACooAa8GshMdoJIpuGf9lw1Akf1eoehmxMld3YXnoGHy1fWcK2gh/J33/u8='),c=>c.charCodeAt(0))],
  ['scan.tiff','image/tiff',Uint8Array.from(atob('SUkqAAgAAAAKAAABBAABAAAAAwAAAAEBBAABAAAAAgAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAAAgAAABcBBAABAAAAEgAAABwBAwABAAAAAQAAAAAAAAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAA='),c=>c.charCodeAt(0))]
 ] : [];
 const uploadCount=()=>w.performance.getEntriesByType('resource').filter(entry=>new URL(entry.name).pathname==='/api/v1/fire-showcase/api/assets').length;
 const formats=[];
 for(let [name,type,content] of [['normal.jpg','image/jpeg',jpg],['blank.JPG','',jpg],['alias.jpeg','image/jpg',jpg],['opaque.jpeg','application/octet-stream',jpg],['image.png','image/png',png],['image.webp','image/webp',webp],['animated.gif','image/gif',gif],['bitmap.bmp','image/bmp',bmp],['still.avif','image/avif',avif],['invalid.heic','image/heic',heic],...codecFormats]){
  if(/jpe?g$/i.test(name)){canvas.getContext('2d').fillStyle='rgb('+formats.length*40+',30,90)';canvas.getContext('2d').fillRect(0,0,3,2);content=bytes('image/jpeg');}
  const beforeUploads=uploadCount();
  const before=run('currentReferenceSequence().length');await w.appendReferenceFiles([new w.File([content],name,{type})]);
  let current=run('currentReferenceSequence().at(-1)'), status='rejected',error='';
  if(run('currentReferenceSequence().length')>before){for(let i=0;i<200;i++){w.fixtureImage=current;const state=run('durableClient.assetState(window.fixtureImage)');status=state.status;error=state.error;if(status==='uploaded'||status==='failed')break;await wait(10);} }
  let sameBytes=false,storedBytes=false,converted=false,pixelsPreserved=false;
  if(status==='uploaded'){
   const expected=await hash(content);sameBytes=await hash(Uint8Array.from(w.atob(current.dataUrl.split(',')[1]),c=>c.charCodeAt(0)))===expected;
   w.fixtureImage=current;const asset=run('durableClient.assetState(window.fixtureImage).asset');
   const response=await w.fetch('/api/v1/fire-showcase/api/assets/'+asset.id+'/content',{headers:{Authorization:'Bearer fixture-native-token'},cache:'no-store'});
   const storedHash=response.ok?await hash(await response.arrayBuffer()):'';storedBytes=storedHash===expected;converted=/gif|bmp|avif|heic|tiff/.test(type)&&current.dataUrl.startsWith('data:image/png;')&&storedHash===await hash(Uint8Array.from(w.atob(current.dataUrl.split(',')[1]),c=>c.charCodeAt(0)));
   if(converted&&/heic|tiff/.test(type)){
    const image=await w.imageElementFromDataUrl(current.dataUrl),surface=document.createElement('canvas');surface.width=image.naturalWidth;surface.height=image.naturalHeight;const context=surface.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,surface.width,surface.height).data;pixelsPreserved=surface.width===3&&surface.height===2&&pixels.every((value,index)=>value===(index%4===3?255:0));
   } else if(converted){
    const originalImage=await w.imageElementFromDataUrl('data:'+type+';base64,'+btoa(String.fromCharCode(...content)));
    const savedImage=await w.imageElementFromDataUrl(current.dataUrl);
    const pixels=image=>{const surface=document.createElement('canvas');surface.width=image.naturalWidth;surface.height=image.naturalHeight;const context=surface.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,surface.width,surface.height).data;};
    const beforePixels=pixels(originalImage),afterPixels=pixels(savedImage);
    pixelsPreserved=originalImage.naturalWidth===savedImage.naturalWidth&&originalImage.naturalHeight===savedImage.naturalHeight&&beforePixels.length===afterPixels.length&&beforePixels.every((value,index)=>value===afterPixels[index]);
   }
  }
  if(name==='image.webp'){w.updateDurableGenerationControls();checks.emptyReferenceRolesDisabled=w.document.querySelector('#generate-button').disabled&&/请选择每张图参考/.test(w.document.querySelector('#generate-button').textContent);}
  if(name==='normal.jpg'){w.updateDurableGenerationControls();checks.oneReferenceDisabled=w.document.querySelector('#generate-button').disabled;}
  formats.push({name,type,status,error,sameBytes,storedBytes,converted,pixelsPreserved,uploadRequests:uploadCount()-beforeUploads,toast:[...w.document.querySelectorAll('.fire-toast')].at(-1)?.textContent||''});
 }
 const beforeConcurrent=run('currentReferenceSequence().length');
 canvas.getContext('2d').fillStyle='blue';canvas.getContext('2d').fillRect(0,0,3,2);const firstConcurrent=new w.File([bytes('image/png')],'concurrent-first.png',{type:'image/png'});
 canvas.getContext('2d').fillStyle='green';canvas.getContext('2d').fillRect(0,0,3,2);const secondConcurrent=new w.File([bytes('image/png')],'concurrent-second.png',{type:'image/png'});
 const originalReader=w.FileReader;w.FileReader=class extends originalReader {readAsDataURL(file){w.setTimeout(()=>super.readAsDataURL(file),80);}};
 const concurrent=Promise.all([w.appendReferenceFiles([firstConcurrent]),w.appendReferenceFiles([secondConcurrent])]);
 await wait(10);checks.referenceReadBlocksGeneration=w.document.querySelector('#generate-button').disabled;
 await concurrent;w.FileReader=originalReader;
 checks.concurrentUploadsRetained=run('currentReferenceSequence().length')===beforeConcurrent+2&&run('currentReferenceSequence().some(item=>item.name==="concurrent-first.png")')&&run('currentReferenceSequence().some(item=>item.name==="concurrent-second.png")');
 const focusTarget=w.document.querySelector('#add-reference-button');
 if(focusTarget){const beforePaste=run('currentReferenceSequence().length');focusTarget.focus();const event=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[firstConcurrent,secondConcurrent],items:[]}});focusTarget.dispatchEvent(event);await wait(200);checks.keyboardFocusedPaste=event.defaultPrevented;checks.multipleClipboardImages=run('currentReferenceSequence().length')===beforePaste+2;}
 const mobileRemove=w.document.querySelector('.delete-slot-button:not([hidden])').getBoundingClientRect();checks.mobileRemove44=mobileRemove.width>=44&&mobileRemove.height>=44;
 const editor=w.document.querySelector('textarea');editor.focus();const editorPaste=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(editorPaste,'clipboardData',{value:{files:[firstConcurrent],items:[]}});editor.dispatchEvent(editorPaste);checks.textareaPasteUntouched=!editorPaste.defaultPrevented;
 if(typeof w.confirmCollectionRemoval!=='function')throw new Error('collection removal must use the application dialog instead of native window.confirm');
 const removeWithDialog=async(selector,accepted)=>{const trigger=w.document.querySelector(selector);trigger.focus();trigger.click();const confirm=w.document.querySelector('#collection-removal-dialog');if(confirm?.tagName!=='DIALOG'||!confirm.open||!w.document.activeElement.matches('[data-cancel-removal]'))throw new Error('application confirmation dialog did not open with cancel focus');confirm.querySelector(accepted?'[data-confirm-removal]':'[data-cancel-removal]').click();await wait(0);};
 w.fireWorkbench.navigate('materials');
 const previewTrigger=w.document.querySelector('[data-material-preview]');previewTrigger.focus();previewTrigger.click();
 const dialog=w.document.querySelector('#image-lightbox'),dialogClose=w.document.querySelector('#lightbox-close');
 checks.previewDialogSemantics=dialog.getAttribute('role')==='dialog'&&dialog.getAttribute('aria-modal')==='true';
 checks.previewDialogFocus=w.document.activeElement===dialogClose;
 const tab=new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});dialogClose.dispatchEvent(tab);checks.previewDialogFocusTrap=tab.defaultPrevented&&dialog.contains(w.document.activeElement);
 w.fireWorkbench.refresh();dialogClose.click();checks.previewDialogReturnsFocus=w.document.activeElement?.matches('[data-material-preview]')&&w.document.activeElement.querySelector('img')?.src===previewTrigger.querySelector('img').src;
 const materialRemove=w.document.querySelector('[data-material-remove]');
 checks.materialControl=Boolean(materialRemove);checks.resultControl=false;
 if(materialRemove){
  const initial=run('materialHistoryItems().length'),draft=run('JSON.stringify(currentReferenceSequence())');
  await removeWithDialog('[data-material-remove]',false);checks.materialCancel=run('materialHistoryItems().length')===initial;
  checks.materialCancelFocus=w.document.activeElement.matches('[data-material-remove]');
  await removeWithDialog('[data-material-remove]',true);
  checks.materialConfirmFocus=w.document.activeElement.matches('[data-material-remove], [data-workbench-view]');
  checks.materialRemoved=run('materialHistoryItems().length')===initial-1;
  checks.materialDraftPreserved=run('JSON.stringify(currentReferenceSequence())')===draft;
  const active=run('currentReferenceSequence()[0]');w.fixtureImage=active;run("rememberImage('image-one',window.fixtureImage)");
  checks.materialUploadCallbackDoesNotRestore=run('materialHistoryItems().length')===initial-1;
  await run('state.historyWriteQueue');await run('loadAccountImageHistory()');run('restoreLastImages();renderImageHistory()');
  checks.materialPersistent=run('materialHistoryItems().length')===initial-1;
  w.document.querySelector('[data-material-restore]')?.click();run("rememberImage('image-one',currentReferenceSequence()[0])");checks.materialRestored=run('materialHistoryItems().length')===initial;
  for(let i=0;i<initial;i++)await removeWithDialog('[data-material-remove]',true);
  checks.emptyMaterialRecovery=run('materialHistoryItems().length')===0&&Boolean(w.document.querySelector('#materials-grid .fire-empty-state'))&&Boolean(w.document.querySelector('[data-material-restore]'));
  w.document.querySelector('[data-material-restore]')?.click();checks.allMaterialsRestored=run('materialHistoryItems().length')===initial;
 }
 w.fireWorkbench.navigate('history');
 const reuse=w.document.querySelector('[data-history-use]');if(!reuse)throw new Error('history work must offer 用作参考');
 const beforeReuse=run('currentReferenceSequence().length'),draftBeforeReuse=run('JSON.stringify(currentReferenceSequence())'),historyBeforeReuse=run('JSON.stringify(readResultHistory())');
 reuse.click();for(let i=0;i<100;i++){if(reuse.getAttribute('aria-busy')!=='true')break;await wait(10);}
 checks.historyReuseFailureRetryable=run('currentReferenceSequence().length')===beforeReuse&&!reuse.disabled&&!reuse.hasAttribute('aria-busy')&&/重试/.test([...w.document.querySelectorAll('.fire-toast')].at(-1)?.textContent||'');
 reuse.click();reuse.click();await wait(25);checks.historyReuseBusy=reuse.getAttribute('aria-busy')==='true'&&reuse.disabled&&w.document.querySelector('#generate-button').disabled;
 for(let i=0;i<150;i++){if(run('currentReferenceSequence().length')>beforeReuse&&!reuse.hasAttribute('aria-busy'))break;await wait(10);}
 const reused=run('currentReferenceSequence().at(-1)');
 checks.historyReuseAppends=run('currentReferenceSequence().length')===beforeReuse+1&&run('JSON.stringify(currentReferenceSequence().slice(0,-1))')===draftBeforeReuse;
 checks.historyReuseOriginalBytes=Boolean(reused)&&await hash(Uint8Array.from(w.atob(reused.dataUrl.split(',')[1]),c=>c.charCodeAt(0)))===await hash(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0)));
 w.fixtureImage=reused;for(let i=0;i<100&&run('durableClient.assetState(window.fixtureImage).status')==='uploading';i++)await wait(10);
 checks.historyReuseUsesUploadAndRoles=run('durableClient.assetState(window.fixtureImage).status')==='uploaded'&&Array.isArray(reused.roles)&&reused.roles.length===0&&!w.document.querySelector('#studio').hidden;
 checks.historyReusePreservesHistory=run('JSON.stringify(readResultHistory())')===historyBeforeReuse;
 checks.historyReuseSingleFlight=(await(await fetch('/fixture-history-stats')).json()).reads===2;
 w.fireWorkbench.navigate('history');const resultRemove=w.document.querySelector('[data-history-remove]');checks.resultControl=Boolean(resultRemove);
 if(resultRemove){
  checks.unknownUserCopy=[...w.document.querySelectorAll('.generation-task-card[data-status=unknown] > p')].some(item=>item.textContent==='结果尚未确认，先查询任务状态，请勿重复生成');
  const initial=run('readResultHistory().length');await removeWithDialog('[data-history-remove]',false);checks.resultCancel=run('readResultHistory().length')===initial;
  checks.resultCancelFocus=w.document.activeElement.matches('[data-history-remove]');await removeWithDialog('[data-history-remove]',true);checks.resultRemoved=run('readResultHistory().length')===initial-1;checks.resultConfirmFocus=w.document.activeElement.matches('[data-history-remove], [data-workbench-view]');
  checks.emptyResultRecovery=Boolean(w.document.querySelector('#history-grid .fire-empty-state'))&&Boolean(w.document.querySelector('[data-history-restore]'));
  await run('state.historyWriteQueue');await run('loadAccountImageHistory()');run('importedGenerationTasks.clear()');await run('durableClient.refresh()');
  checks.resultPersistentAcrossTaskRefresh=run('readResultHistory().length')===initial-1;
  const removedImage=run('(state.resultHistory||[]).find(item=>item.removedAt)?.image');
  run("rememberResults(Array.from({length:25},(_,i)=>({image:'data:image/png;base64,synthetic-'+i,meta:'fixture',savedAt:i})))");
  checks.resultHistoryRetained=run('readResultHistory().length')===25;checks.resultPage20=w.document.querySelectorAll('#history-grid .history-card').length===20&&Boolean(w.document.querySelector('[data-collection-more=history]'));w.document.querySelector('[data-collection-more=history]')?.click();checks.resultLoadMore=w.document.querySelectorAll('#history-grid .history-card').length===25;
  w.fixtureArchive=Array.from({length:25},(_,index)=>{canvas.getContext('2d').fillStyle='rgb('+index+',90,2)';canvas.getContext('2d').fillRect(0,0,3,2);return {name:'archive-'+index+'.png',dataUrl:canvas.toDataURL('image/png'),savedAt:index};});run("window.fixtureArchive.forEach(image=>rememberImage('fixture-archive',image))");checks.materialHistoryRetained=run("readImageHistory()['fixture-archive'].length")===25;checks.noHiddenSlotHistoryThumbnails=w.document.querySelectorAll('.image-history img').length===0;w.fireWorkbench.navigate('materials');checks.materialPage20=w.document.querySelectorAll('#materials-grid .material-card').length===20&&Boolean(w.document.querySelector('[data-collection-more=materials]'));w.document.querySelector('[data-collection-more=materials]')?.click();checks.materialLoadMore=w.document.querySelectorAll('#materials-grid .material-card').length>20;w.fireWorkbench.navigate('history');
  w.fixtureRemoved=removedImage;run('rememberResults([{image:window.fixtureRemoved,meta:"same server result"}])');
  checks.removalSurvivesRollingHistory=run('readResultHistory().every(item=>item.image!==window.fixtureRemoved)');
  checks.taskIntact=run('durableClient.snapshot().tasks.some(task=>task.status==="succeeded")');
  w.document.querySelector('[data-history-restore]')?.click();checks.resultRestored=run('readResultHistory().some(item=>item.image===window.fixtureRemoved)');
 }
 await run('state.historyWriteQueue');
 const downloadButton=w.document.querySelector('#download-current-button'),downloadLabel=downloadButton.querySelector('[data-button-label]'),originalLabel=downloadLabel.textContent;
 const previousFetch=w.fetch,downloadWaiters=[];w.fetch=(input,options)=>String(input).startsWith('data:image/png;')?new Promise(resolve=>downloadWaiters.push(resolve)):previousFetch(input,options);
 const firstDownload=w.downloadOriginalImage(canvas.toDataURL('image/png'),'offline-fixture',downloadButton),secondDownload=w.downloadOriginalImage(canvas.toDataURL('image/png'),'offline-fixture',downloadButton);
 await wait(0);checks.downloadSingleFlight=downloadWaiters.length===1;
 for(const resolve of downloadWaiters)resolve({ok:true,blob:async()=>new w.Blob([png],{type:'image/png'})});
 await Promise.all([firstDownload,secondDownload]);w.fetch=previousFetch;checks.downloadLabelRestored=downloadLabel.textContent===originalLabel&&!downloadButton.hasAttribute('aria-busy');
 const originalPut=w.IDBObjectStore.prototype.put;w.IDBObjectStore.prototype.put=function(){throw new w.DOMException('fixture_sensitive_payload_must_not_show','QuotaExceededError');};
 const saved=await w.historyDatabasePut('fixture-storage-failure',{});
 const legacyKey=w.accountStorageKey('aiShowcase.imageHistory');w.localStorage.setItem(legacyKey,JSON.stringify({legacy:[]}));await w.loadAccountImageHistory();checks.failedMigrationKeepsLegacyCopy=Boolean(w.localStorage.getItem(legacyKey));
 w.IDBObjectStore.prototype.put=originalPut;
 const warning=[...w.document.querySelectorAll('.fire-toast')].at(-1)?.textContent||'';
 checks.storageFailureReported=saved===false&&/刷新.*丢失/.test(warning)&&!/fixture_sensitive/.test(warning);
 let largeAssetBytes=0;
 if(${process.env.FIRE_SHOWCASE_TEST_CODECS === "1"}){
  const original=await (await fetch('/fixture-large-tiff')).arrayBuffer(),before=uploadCount();
  await w.appendReferenceFiles([new w.File([original],'large-noise.tiff',{type:'image/tiff'})]);
  const image=run('currentReferenceSequence().at(-1)');w.fixtureImage=image;const uploaded=run('durableClient.assetState(window.fixtureImage)');largeAssetBytes=uploaded.asset?.bytes||0;
  const dimensions=await w.imageElementFromDataUrl(image.dataUrl);checks.largePrivatePngOver8MiB=uploaded.status==='uploaded'&&largeAssetBytes>8*1024*1024&&dimensions.naturalWidth===1800&&dimensions.naturalHeight===1800&&uploadCount()===before+1;
 }
 w.fireWorkbench.navigate('history');w.fixtureEscapeCount=run('readResultHistory().length');const escapeTrigger=w.document.querySelector('[data-history-remove]');escapeTrigger.focus();escapeTrigger.click();checks.escapeDialogOpen=Boolean(w.document.querySelector('#collection-removal-dialog')?.open);
 return {ready:true,formats,checks,largeAssetBytes};
})()

` });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  assert.equal(result.result.value.ready, true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  const escaped=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{await new Promise(resolve=>setTimeout(resolve,25));const w=document.querySelector('iframe').contentWindow;return !w.document.querySelector('#collection-removal-dialog')?.open&&w.eval('readResultHistory().length')===w.fixtureEscapeCount&&w.document.activeElement.matches('[data-history-remove]');})()`});
  result.result.value.checks.escapeCancelledAndFocusRestored=escaped.result.value===true;
  console.log(JSON.stringify(result.result.value));
} finally {
  socket?.close(); chrome.kill('SIGTERM');
  await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(2000)]);
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
