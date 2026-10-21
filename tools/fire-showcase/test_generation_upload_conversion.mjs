// The real generation client accepts converted assets only from its own API call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
const source = fs.readFileSync(new URL('site/generation-tasks.js', import.meta.url), 'utf8');
const normalizedDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=';
const id = 'sha256_' + createHash('sha256').update(Buffer.from(normalizedDataUrl.split(',')[1], 'base64')).digest('hex');
const original = { name: 'phone.HEIC', dataUrl: 'data:image/heic;base64,AAAAAGZ0eXBoZWlj' };
function setup(reply = { asset: { id, name: original.name, mimeType: 'image/png', url: '/api/assets/'+id+'/content' }, normalized: true }, status = 201) {
  const calls=[], values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const fetch=async (url, options={})=>{calls.push({url,...options});return options.method==='POST'?{ok:status>=200&&status<300,status,text:async()=>JSON.stringify(reply)}:{ok:true,status:200,blob:async()=>new Blob([Buffer.from(normalizedDataUrl.split(',')[1],'base64')],{type:'image/png'})};};
  const context=vm.createContext({window:{location:{href:'http://127.0.0.1/',origin:'http://127.0.0.1'}},URL,FileReader:class {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();});}},fetch,localStorage:storage,crypto:webcrypto,atob,setInterval,clearInterval});
  vm.runInContext(source,context);
  return {calls,client:context.window.GenerationTasks.create({fetch,storage,crypto:webcrypto,pollInterval:0})};
}
test('HEIC conversion posts the original once and seeds the normalized photo without another PNG upload', async()=>{
  const {client,calls}=setup();
  const result=await client.uploadConvertedImage(original);
  assert.equal(result.normalizedDataUrl,normalizedDataUrl);
  assert.equal(client.assetState({dataUrl:normalizedDataUrl}).status,'uploaded');
  assert.equal((await client.upload({name:original.name,dataUrl:normalizedDataUrl})).id,id);
  assert.equal(calls.length,2);assert.equal(calls[1].method,'GET');assert.equal(calls[1].cache,'no-store');
  assert.equal(calls[0].url,'/api/assets');
  assert.equal(JSON.parse(calls[0].body).dataUrl,original.dataUrl);
  assert.equal(JSON.parse(calls[0].body).name,original.name);
});
for (const [name,reply,status] of [
 ['failed API',{asset:{id},normalizedDataUrl},403],
 ['missing normalization acknowledgement',{asset:{id,url:'/api/assets/'+id+'/content'}},201],
 ['mismatched asset hash',{asset:{id:'sha256_'+'0'.repeat(64),url:'/api/assets/sha256_'+ '0'.repeat(64)+'/content'},normalized:true},201],
 ['foreign normalized URL',{asset:{id,url:'https://foreign.invalid/api/assets/'+id+'/content'},normalized:true},201]
]) test(`${name} cannot seed an uploaded asset`,async()=>{
 const {client}=setup(reply,status);
 await assert.rejects(()=>client.uploadConvertedImage(original));
 assert.equal(client.assetState({dataUrl:normalizedDataUrl}).status,'idle');
});
