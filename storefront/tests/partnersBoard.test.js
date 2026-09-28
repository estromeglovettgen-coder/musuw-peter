import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import test from 'node:test';
import {handleRequest} from '../worker/index.js';

function assetsEnv(calls) {
  return {ASSETS: {async fetch(request) {
    calls.push(request);
    const path = new URL(request.url).pathname;
    const file = path === '/partner-board/' ? 'index.html' : path.slice('/partner-board/'.length);
    const body = fs.readFileSync(new URL('../public/partner-board/'+file,import.meta.url));
    return new Response(request.method === 'HEAD' ? null : body, {headers: {
      'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'image/png',
      'etag': 'asset-version',
    }});
  }}};
}

test('partner custom domain serves the reviewed page and locale without forwarding credentials',async()=>{
  for (const [lang,expected,title] of [['zh','zh-CN','Musuw 推广榜单'],['en','en','Musuw Partner Leaderboard']]) {
    const calls=[];
    const response=await handleRequest(new Request('https://partners.musuw.com/?lang='+lang,{headers:{cookie:'session=private',authorization:'Bearer private'}}),assetsEnv(calls));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-language'),expected);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('etag'),null);
    assert.equal(calls[0].headers.get('cookie'),null);
    assert.equal(calls[0].headers.get('authorization'),null);
    assert.equal(new URL(calls[0].url).pathname,'/partner-board/');
    const html=await response.text();
    assert.match(html,new RegExp('<html lang="'+expected+'">'));
    assert.match(html,new RegExp('<title>'+title+'</title>'));
    assert.doesNotMatch(html,/<title>[^<]*(?:模拟|Simulated)[^<]*<\/title>/);
    assert.match(html,/id="commission-form"/);
    assert.match(html,/数据为合成记录，仅用于功能与口径展示，不代表真实订单或收益/);
  }
});

test('partner origin has only public GET and HEAD static assets, with no API or account routes',async()=>{
  const calls=[],env=assetsEnv(calls);
  for (const path of ['/api/v1/partners/leaderboard','/api/checkout','/auth/start','/partner-board/','/missing','/%61pp.js']) {
    const response=await handleRequest(new Request('https://partners.musuw.com'+path),env);
    assert.equal(response.status,404,path);
  }
  assert.equal(calls.length,0);
  assert.equal((await handleRequest(new Request('https://partners.musuw.com/',{method:'POST'}),env)).status,405);
  assert.equal(calls.length,0);
  for (const path of ['/app.js','/data.js','/style.css','/musuw-logo.png']) {
    const response=await handleRequest(new Request('https://partners.musuw.com'+path),env);
    assert.equal(response.status,200);
    assert.equal(new URL(calls.at(-1).url).pathname,'/partner-board'+path);
    assert.match(response.headers.get('cache-control'),/must-revalidate/);
  }
  const head=await handleRequest(new Request('https://partners.musuw.com/',{method:'HEAD'}),env);
  assert.equal(head.status,200);assert.equal(await head.text(),'');
});

test('the partner asset directory is not an entry point on marketing domains',async()=>{
  const calls=[];
  for (const host of ['musuw.com','www.musuw.com']) for (const path of ['/partner-board','/partner-board/','/partner-board/data.js','/%70artner-board/']) {
    assert.equal((await handleRequest(new Request('https://'+host+path),assetsEnv(calls))).status,404);
  }
  assert.equal(calls.length,0);
});

test('partner scenario preserves billing totals, lookup, language and monthly attribution',()=>{
const nodes=new Map();
const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',dataset:{},events:{},setAttribute(k,v){this[k]=v},addEventListener(k,fn){this.events[k]=fn},scrollIntoView(){}});return nodes.get(s)};
const buttons=['zh','en'].map(lang=>{const b=node('language-'+lang);b.dataset.lang=lang;return b});
const document={documentElement:{lang:''},title:'',querySelector:node,querySelectorAll:s=>s==='[data-lang]'?buttons:[]};
const location={search:'',href:'http://127.0.0.1:5177/'};
const ctx={window:{},document,location,history:{replaceState(a,b,url){location.href=String(url)}},URL,URLSearchParams,Intl,Date,Math};vm.createContext(ctx);
for(const f of ['data.js','app.js'])vm.runInContext(fs.readFileSync(new URL('../public/partner-board/'+f,import.meta.url),'utf8'),ctx);
const d=ctx.window.PARTNER_SIMULATION;const summarize=ctx.window.summarizePartnerSimulation;
const all=summarize('all');const months=['2026-06','2026-07','2026-08','2026-09'].map(summarize);
assert.equal(d.codes.length,1128);assert.equal(new Set(d.codes).size,1128);
assert.equal(all.current.length,12575);assert.equal(all.lifetimeCustomers,5588);assert.equal(all.gross,111365800);assert.equal(all.commission,60739440);
assert.equal(months.reduce((s,m)=>s+m.gross,0),all.gross);assert.equal(months.reduce((s,m)=>s+m.commission,0),all.commission);assert.equal(months.reduce((s,m)=>s+m.customers,0),all.customers);
const customers=new Map();for(const o of d.orders){const list=customers.get(o.customer)||[];list.push(o);customers.set(o.customer,list)}
for(const list of customers.values()){
 assert.equal(new Set(list.map(o=>o.code)).size,1);assert.equal(list.filter(o=>o.first).length,1);
 assert.equal([...list].sort((a,b)=>a.date.localeCompare(b.date))[0].first,true);
}
for(const m of [all,...months]){
 assert.equal(m.partners.reduce((s,p)=>s+p.commission,0),m.commission);assert.equal(m.partners.reduce((s,p)=>s+p.customers,0),m.customers);
 for(const o of m.current)assert.equal(o.commissionCny,(o.first?o.net:Math.floor(o.net/5))*(o.currency==='CNY'?1:7.2));
}
const maxMonth=Math.max(...months.flatMap(m=>m.partners.map(p=>p.commission)));assert.ok(maxMonth>0&&maxMonth<=4000000);
assert.equal(new Set(months.map(m=>m.partners[0].code)).size,4);
for(const m of months)assert.ok(m.partners[0].customers/m.partners[24].customers<=8);
assert.match(node('#totals').innerHTML,/¥1,113,658.00/);assert.match(node('#meta').textContent,/1,128/);assert.match(node('#totals').innerHTML,/5,588/);
buttons[1].events.click();assert.equal(document.documentElement.lang,'en');assert.match(node('#totals').innerHTML,/\$154,674.72/);assert.match(node('#totals').innerHTML,/\$84,360.33/);assert.doesNotMatch(node('#totals').innerHTML,/¥/);assert.match(location.href,/lang=en/);
node('#month-select').events.change({target:{value:'2026-08'}});assert.match(node('#totals').innerHTML,/Monthly referral revenue/);
node('#board-pages').events.click({target:{closest(){return {disabled:false,dataset:{boardPage:'1'}}}}});assert.match(node('#board-pages').innerHTML,/Page 2 of 46/);
// Top lookup finds exact codes, accepts lowercase and whitespace, and leaves the board intact.
const submit=()=>node('#commission-form').events.submit({preventDefault(){}});
node('#commission-code').value='  '+d.codes[900].toLowerCase()+'  ';submit();
assert.equal(node('#lookup-result').hidden,false);assert.match(node('#lookup-result').innerHTML,new RegExp(d.codes[900]));
const expected=summarize('2026-08').partners.find(p=>p.code===d.codes[900]);
const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100/7.2);
assert.ok(node('#lookup-result').innerHTML.includes(usd(expected.commission)));
node('#lookup-result').events.click({target:{closest(){return {}}}});
assert.match(node('#ranking').innerHTML,new RegExp(d.codes[900]+' · Order details'));
node('#month-select').events.change({target:{value:'2026-07'}});assert.match(node('#lookup-result').innerHTML,/July 2026/);
buttons[0].events.click();assert.equal(document.documentElement.lang,'zh-CN');assert.match(node('#lookup-result').innerHTML,/查看订单/);assert.match(node('#lookup-result').innerHTML,/¥/);
node('#commission-code').value='no-such-code';submit();assert.match(node('#lookup-result').innerHTML,/未找到这个折扣码/);assert.equal(node('#commission-code')['aria-invalid'],'true');
buttons[1].events.click();assert.match(node('#lookup-result').innerHTML,/Discount code not found/);
node('#commission-code').value=' ';submit();assert.match(node('#lookup-result').innerHTML,/Enter your full discount code/);
node('#commission-code').events.input();assert.equal(node('#lookup-result').hidden,true);

});
