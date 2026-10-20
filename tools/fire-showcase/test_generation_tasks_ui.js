// The client interface owns local uploads, durable receipts and task recovery.
// All requests terminate at an in-memory local-server adapter; no provider exists.
const fs=require('node:fs'); const vm=require('node:vm'); const assert=require('node:assert/strict');
const webcrypto=require('node:crypto').webcrypto;
const source=fs.readFileSync('site/generation-tasks.js','utf8');
const storageMap=new Map(); const storage={getItem:k=>storageMap.get(k)||null,setItem:(k,v)=>storageMap.set(k,v),removeItem:k=>storageMap.delete(k)};
const assets=new Map(),tasks=new Map(),keys=new Map(),calls=[]; let nextTask=0,loseReceipt=false,failUpload=false,failHead=false,rejectCreate=false,aliasNext=false;
const response=(status,data)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
async function fetch(url,options={}){
 assert(url.startsWith('/api/assets')||url.startsWith('/api/generation-tasks'),'Only free local task and asset interfaces are allowed');
 const body=options.body?JSON.parse(options.body):null;calls.push({url,body,method:options.method||'GET'});
 if(options.method==='HEAD'){if(failHead){failHead=false;throw new Error('HEAD unavailable');}const id=url.split('/')[3];return response([...assets.values()].some(a=>a.id===id)?200:404,{});}
 if(url==='/api/assets'){
   if(failUpload){failUpload=false;throw new Error('local connection lost');}
   const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from(body.dataUrl.split(',')[1],'base64'))).toString('hex');
   if(!assets.has(hash))assets.set(hash,{id:`asset-${hash}`,name:body.name,mime:'image/jpeg',bytes:3,url:`/api/assets/asset-${hash}/content`});
   return response(201,{asset:assets.get(hash)});
 }
 if(url==='/api/generation-tasks'&&options.method==='POST'){
   if(rejectCreate){rejectCreate=false;return response(400,{error:'图片参数需要修正',code:'invalid_request'});}
   let task=keys.get(body.idempotencyKey);
   if(aliasNext){aliasNext=false;task=[...tasks.values()].find(t=>t.status==='queued');task.idempotencyKeys=[...(task.idempotencyKeys||[task.idempotencyKey]),body.idempotencyKey];keys.set(body.idempotencyKey,task);}
   if(!task){task={id:`task-${++nextTask}`,idempotencyKey:body.idempotencyKey,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),referenceCount:body.payload.images.length,modelChoice:body.payload.modelChoice};keys.set(body.idempotencyKey,task);tasks.set(task.id,task);}
   if(loseReceipt){loseReceipt=false;throw new Error('response lost after commit');}return response(202,{task});
 }
 if(url==='/api/generation-tasks')return response(200,{tasks:[...tasks.values()]});
 const match=url.match(/^\/api\/generation-tasks\/([^/]+)(?:\/(retry|cancel))?$/);const task=tasks.get(match?.[1]);
 if(!task)return response(404,{error:'not found'});
 if(match[2]==='cancel'){task.status='cancelled';return response(200,{task});}
 if(match[2]==='retry'){
   if(task.status!=='failed'||!task.canRetry)return response(409,{error:'not retryable'});
   let next=keys.get(body.idempotencyKey);if(!next){next={...task,id:`task-${++nextTask}`,idempotencyKey:body.idempotencyKey,status:'queued',retryOf:task.id,canRetry:false};keys.set(body.idempotencyKey,next);tasks.set(next.id,next);}return response(202,{task:next});
 }
 return response(200,{task});
}
const ctx=vm.createContext({window:{},fetch,localStorage:storage,crypto:webcrypto,atob,Uint8Array,TextEncoder,setInterval,clearInterval,console});vm.runInContext(source,ctx);
const client=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});
(async()=>{
 const first={name:'face.jpg',dataUrl:'data:image/jpeg;base64,AQID'};
 const [a,b]=await Promise.all([client.upload(first),client.upload({...first,name:'same-content.jpg'})]);
 assert.equal(a.id,b.id);assert.equal(calls.filter(c=>c.url==='/api/assets').length,1,'same photo uploads once even through simultaneous UI routes');
 const cached=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});await cached.upload(first);assert.equal(calls.filter(c=>c.method==='HEAD').length,1,'persistent cache checks local asset existence once in a new session');
 const uploadCount=calls.filter(c=>c.url==='/api/assets').length;await cached.upload(first);assert.equal(calls.filter(c=>c.url==='/api/assets').length,uploadCount);
 assets.clear();const missing=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});await missing.upload(first);assert.equal(calls.filter(c=>c.url==='/api/assets').length,uploadCount+1,'404 cache entry transparently uploads the photo again');
 failHead=true;const offlineCache=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});await assert.rejects(()=>offlineCache.upload(first));assert.equal(offlineCache.assetState(first).status,'failed');await offlineCache.upload(first,{retry:true});

 failUpload=true;const other={name:'new.jpg',dataUrl:'data:image/jpeg;base64,BAUG',assetId:a.id};
 await assert.rejects(()=>client.upload(other));assert.equal(client.assetState(other).status,'failed');assert.equal(client.assetState(other).asset,null,'replacement never inherits stale assetId');
 await client.upload(other,{retry:true});assert.notEqual(client.assetState(other).asset.id,a.id);
 const copy={name:'copied.png',dataUrl:'data:image/png;base64,BwgJ',uploadDataUrl:'data:image/png;base64,CgsM'};
 const copied=await client.upload(copy);assert.equal(calls.filter(c=>c.url==='/api/assets').at(-1).body.dataUrl,copy.dataUrl,'legacy transfer copies never replace original bytes');
 const newCopy={...copy,uploadDataUrl:'data:image/png;base64,DQ4P'};assert.equal(client.assetState(newCopy).status,'uploaded');assert.equal((await client.upload(newCopy)).id,copied.id,'changing an obsolete transfer copy cannot invalidate the original asset');
 const payload={modelChoice:'image25',images:[{id:'image-one',assetId:a.id,roles:['face']},{id:'image-two',assetId:client.assetState(other).asset.id,roles:['upper']}]};
 loseReceipt=true;await assert.rejects(()=>client.submit(payload));assert.equal(client.snapshot().pending.length,1);
 client.changed();const edited={...payload,poseStrict:false};const second=await client.submit(edited);assert.equal(tasks.size,2,'editing creates a new intent without overwriting the lost receipt');
 const originalPending=client.snapshot().pending[0];const recovered=await client.action(originalPending.key,'recover');assert.equal(recovered.id,'task-1');assert.equal(tasks.size,2,'lost receipt replays the original key, never creates another task');
 const same=await client.submit(edited);assert.equal(same.id,second.id);assert.equal(tasks.size,2,'repeated clicks share one task');
 tasks.get(second.id).status='succeeded';await client.refresh();const newAfterSuccess=await client.submit(edited);assert.notEqual(newAfterSuccess.id,second.id,'a new explicit click after success creates a new task');
 const repeatedRunning=await client.submit(edited);assert.equal(repeatedRunning.id,newAfterSuccess.id,'active duplicate click remains deduplicated');

 const reloaded=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});await reloaded.start();assert.equal(reloaded.snapshot().tasks.length,3,'server list restores all tasks without login or local task cache');
 tasks.get('task-1').status='unknown';tasks.get('task-1').canRetry=true;await reloaded.refresh();const before=calls.length;await assert.rejects(()=>reloaded.action('task-1','retry'),/未确认|重发|重试/);assert.equal(calls.length,before,'unknown is forbidden locally before any retry request');
 tasks.get('task-1').status='failed';tasks.get('task-1').canRetry=true;tasks.get('task-1').updatedAt='new-failure';await reloaded.refresh();const retry=await reloaded.action('task-1','retry');assert.equal(retry.retryOf,'task-1');assert.equal(retry.status,'queued');
 await reloaded.action(newAfterSuccess.id,'cancel');assert.equal(reloaded.snapshot().tasks.find(t=>t.id===newAfterSuccess.id).status,'cancelled');
 await client.refresh();const afterCancel=await client.submit(edited);assert.notEqual(afterCancel.id,newAfterSuccess.id,'cancelled intent can be explicitly generated again');
 // A reloaded pending receipt is matched from server authority without another POST.
 client.changed();loseReceipt=true;await assert.rejects(()=>client.submit({...payload,poseStrict:true}));const pendingReload=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});const posts=calls.filter(c=>c.method==='POST').length;await pendingReload.start();assert.equal(pendingReload.snapshot().pending.length,0);assert.equal(calls.filter(c=>c.method==='POST').length,posts);

 client.changed();rejectCreate=true;await assert.rejects(()=>client.submit({...payload,size:'1024x1024'}));const rejected=client.snapshot().pending.find(p=>p.status==='rejected');assert(rejected,'clear local 4xx is rejected, not an ambiguous receipt');const rejectCalls=calls.length;await assert.rejects(()=>client.action(rejected.key,'recover'));assert.equal(calls.length,rejectCalls);await client.action(rejected.key,'dismiss');
 client.changed();aliasNext=true;loseReceipt=true;await assert.rejects(()=>client.submit({...payload,size:'768x1024'}));const aliasReload=ctx.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0});const aliasPosts=calls.filter(c=>c.method==='POST').length;await aliasReload.start();assert.equal(aliasReload.snapshot().pending.length,0,'server alias keys confirm merged tasks after a lost receipt');assert.equal(calls.filter(c=>c.method==='POST').length,aliasPosts);

 const application=fs.readFileSync('site/script.js','utf8');const photoStart=application.indexOf('async function fileToStoredImage(');const photoEnd=application.indexOf('\n}',photoStart)+2;
 let photo={url:'data:image/jpeg;base64,AQID',width:600,height:800},compressions=[];
 const storePhoto=vm.runInNewContext('('+application.slice(photoStart,photoEnd)+')',{fileToDataUrl:async()=>photo.url,imageElementFromDataUrl:async()=>({naturalWidth:photo.width,naturalHeight:photo.height}),durableGenerationEnabled:()=>true,compressImageDataUrl:async(url,options)=>{compressions.push(options);return 'data:'+options.format+';base64,BAUG';}});
 const small=await storePhoto({name:'small.jpg',type:'image/jpeg',size:200000});assert.equal(small.dataUrl,photo.url);assert.equal(small.uploadDataUrl,photo.url);assert.equal(compressions.length,0,'small photos preserve original bytes without JPEG recompression');
 const largeBytes=Buffer.alloc(3*1024*1024,0x27);
 photo={url:'data:image/jpeg;base64,'+largeBytes.toString('base64'),width:5000,height:4000};const large=await storePhoto({name:'large.jpg',type:'image/jpeg',size:largeBytes.length});assert.equal(large.dataUrl,photo.url);assert.equal(large.uploadDataUrl,photo.url);assert.equal(large.name,'large.jpg');assert.equal(compressions.length,0,'large originals must not be resized or re-encoded');
 const largeAsset=await client.upload(large);const postedOriginal=calls.filter(c=>c.url==='/api/assets').at(-1).body;
 assert(Buffer.from(postedOriginal.dataUrl.split(',')[1],'base64').equals(largeBytes),'The real file preparation and upload client must send every original byte for a multi-MiB, >2048-pixel photo');
 assert.equal(largeAsset.id,'asset-'+require('node:crypto').createHash('sha256').update(largeBytes).digest('hex'),'The uploaded asset hash must represent the original bytes');
 photo={url:'data:image/png;base64,AQID',width:4000,height:3000};const png=await storePhoto({name:'alpha.png',type:'image/png',size:2000000});assert.equal(png.uploadDataUrl,photo.url);assert.equal(png.type,'image/png');
 photo={url:'data:image/webp;base64,AQID',width:4000,height:3000};const webp=await storePhoto({name:'alpha.webp',type:'image/webp',size:2000000});assert.equal(webp.uploadDataUrl,photo.url);assert.equal(compressions.length,0,'PNG and WebP originals also bypass canvas encoding');
 if(process.env.ALPHAI_TEST_DOM_MODULE) {
   const {parseHTML}=require(process.env.ALPHAI_TEST_DOM_MODULE);const {window}=parseHTML(fs.readFileSync('site/index.html','utf8'));const document=window.document;
   const ui=vm.createContext({window,document,console,Event:window.Event,Date});vm.runInContext(fs.readFileSync('site/workbench.js','utf8'),ui);
   const uiActions=[];const uiTasks=[{id:'queued',status:'queued',referenceCount:2},{id:'unknown',status:'unknown',canRetry:true,error:{message:'no receipt',requestId:'req-unknown'}},{id:'failed',status:'failed',canRetry:true,error:{message:'上游拒绝',providerMessage:'invalid parameter',providerParam:'image[]',requestId:'req-failed'}},{id:'local',status:'failed',canRetry:true,error:{localResultAvailable:true,message:'图片已生成，本地保存失败'}},{id:'success',status:'succeeded',result:{images:['/saved.png']}}];
   window.fireWorkbench.connect({getSiteConfig:()=>({durableGenerationEnabled:true,generationPaused:true}),getReferences:()=>[{slotId:'image-one',dataUrl:'data:image/png;base64,AQID',roles:['face']}],getRoles:()=>[{id:'face',label:'人物身份',allowMultipleSources:true}],getValidation:()=>({valid:true,errors:[]}),getReferenceUpload:()=>({status:'failed',error:'本机连接中断'}),retryReferenceUpload:id=>uiActions.push(['upload',id]),getTaskState:()=>({tasks:uiTasks,pending:[{key:'pending-key',status:'receipt_unknown'},{key:'rejected-key',status:'rejected',error:'素材需要重新保存'}],error:''}),taskAction:(id,action)=>uiActions.push([id,action]),showTaskResult:id=>uiActions.push([id,'view']),getResults:()=>[]});
   const click=selector=>document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true}));
   assert.equal(document.querySelector('#generation-tasks-panel').hidden,false);assert.equal(document.querySelector('#generation-task-count').textContent,'7');
   assert.equal(document.querySelector('[data-status="unknown"] [data-task-action="retry"]'),null,'unknown tasks expose query only, even if a malformed server says canRetry');
   assert.match(document.querySelector('[data-task-id="failed"]').textContent,/image\[\]/);assert.match(document.querySelector('[data-task-id="failed"]').textContent,/req-failed/);
   assert.match(document.querySelector('[data-task-id="local"] [data-task-action="retry"]').textContent,/恢复图片/);
   assert.equal(document.querySelector('[data-status="rejected"] [data-task-action="recover"]'),null);
   click('[data-upload-retry]');click('[data-task-id="pending-key"]');click('[data-task-id="queued"][data-task-action="cancel"]');click('[data-task-id="failed"][data-task-action="retry"]');click('[data-task-id="success"][data-task-action="view"]');
   assert.deepEqual(uiActions,[['upload','image-one'],['pending-key','recover'],['queued','cancel'],['failed','retry'],['success','view']]);
   assert.match(document.querySelector('#workbench-generation-state').textContent,/保存排队/);
   console.log('durable task UI: independent upload recovery, queued cancellation, specific provider reason/request id, retry/local-result recovery, unknown no-resend and same-receipt confirmation passed');
 }
 client.stop();reloaded.stop();pendingReload.stop();aliasReload.stop();console.log('durable generation client: content-safe uploads, separate upload retry, immutable lost receipts, new edited intents, click deduplication, server recovery, unknown guard, failed retry and queued cancellation passed; no provider requests');
})().catch(e=>{client.stop();console.error(e);process.exitCode=1});
