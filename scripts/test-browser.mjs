import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(process.argv[2] || 'dist'), baseline=process.argv[3]==='baseline';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.pdf':'application/pdf'};
const server=createServer(async(req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));
  try {
    if (!path.startsWith(root+sep)) throw Error();
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});
    res.end(data);
  } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=process.env.NOOR_AUDIT_URL || 'http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({executablePath: process.env.CHROME_BIN, headless: true});
const timings={}, checks=[];
const routes=[['How it works','walkthrough','main .sd'],['Studio','studio','main h1'],['RAG Sandbox','sandbox','main h1'],['Services','services','main h1'],['Trust & Compliance','trust','main h1'],['About','about','main h1']];
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();
page.setDefaultTimeout(6500);
const failures=[];
page.on('pageerror',e=>failures.push(e.message));
page.on('response',r=>{if(r.status()>=400) failures.push(r.status()+' '+r.url());});
await page.addInitScript(()=>{
  window.loadingFrames=0;
  const observer=new MutationObserver(()=>{
    if ([...document.querySelectorAll('main > div')].some(e=>e.textContent.trim()==='Loading…')) window.loadingFrames++;
  });
  observer.observe(document,{subtree:true,childList:true});
});
const go=async(path,locator='main h1')=>{
  await page.goto(url+path);
  await page.locator(locator).first().waitFor();
};
const cdp=await context.newCDPSession(page);
try {
  for(const [label,path,locator] of routes){
    await go('?navigation='+path);
    const before=await page.evaluate(()=>window.loadingFrames);
    await cdp.send('Network.emulateNetworkConditions', {offline:false, latency:100, downloadThroughput:2_000_000, uploadThroughput:500_000});
    await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    const previous = await page.locator('main > *').first().evaluate(el => el.className);
    const started=performance.now();
    await page.locator('header nav').getByRole('link',{name:label,exact:true}).evaluate(a=>a.click());
    await page.waitForFunction(({path,locator,previous})=>location.hash==='#/'+path && !!document.querySelector('header nav a[href="#/'+path+'"][aria-current=page]') && !!document.querySelector(locator) && document.querySelector('main > *')?.className !== previous && !document.querySelector('main .paper.muted.sans'),{path,locator,previous}).catch(async (error) => {
      throw new Error(path + ': ' + (await page.locator('main').innerText()).slice(0, 200), { cause: error });
    });
    timings[path]={ms:Math.round(performance.now()-started),loadingMutations:await page.evaluate(()=>window.loadingFrames)-before};
    await cdp.send('Network.emulateNetworkConditions', {offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1});
  }
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
  console.log('Cold navigation with 100ms simulated network latency',JSON.stringify(timings));
  if(!baseline) assert.ok(Object.values(timings).every(x=>x.loadingMutations===0));
  if(!baseline) {
  await go('#/sandbox');
  const input=page.getByRole('textbox',{name:'Question'});
  const ask=page.getByRole('button',{name:'Ask',exact:true});
  const outcome=page.locator('.sb-outcome');
  async function query(q){
    await input.fill(q);
    const start=performance.now();
    await ask.evaluate(b=>b.click());
    if (!baseline) await page.waitForFunction(q=>document.querySelector('.sb-outcome')?.previousElementSibling?.textContent==='Question: '+q,q);
    await outcome.waitFor();
    return {ms:Math.round(performance.now()-start),status:await outcome.innerText(),answer:await page.locator('.sb-answer > p').first().textContent({timeout:1000}).catch(()=>'' )};
  }
  const questions=[
    ['What is the cut-off time for domestic AED transfers?',/14:00/],
    ['Who must approve a transfer above AED 200,000?',/Branch Manager/],
    ['How often must the sanctions list feed be refreshed?',/four hours/],
    ['Can the bank sell the commodity before it owns it?',/ownership|own the commodity/i],
    ['What happens when screening produces a potential match?',/held|escalat/i],
  ];
  const results=[];
  for (const [q,pattern] of questions){
    const r=await query(q);
    assert.match(r.answer,pattern,q);
    results.push(r);
  }
  assert.equal(new Set(results.map(r=>r.answer)).size,questions.length);
  console.log('Sample question timings', results.map(r=>r.ms));
  if (baseline) { console.log('Baseline sample questions varied'); } else {
    assert.ok(results.every(r=>r.ms<500));
    await page.locator('.sb-cite').first().click();
    assert.match(await page.locator('.sb-quote').innerText(),/page \d+.*chunk/i);
    for(const q of ['Which crypto coin should I buy for investment advice?','asdasd asdasd','What is the best football team in Dubai?']) assert.match((await query(q)).status,/Blocked at 0 tokens/i);
    await page.getByText('Simulate isolation breach',{exact:false}).click();
    assert.match((await query(questions[0][0])).status,/Contract breached/);
    assert.equal(await page.locator('.sb-answer').count(),0);
    await page.getByRole('button',{name:'Reject',exact:true}).click();
    await page.getByText('Rejected — output quarantined').waitFor();
    await page.getByRole('button',{name:'Try tampering'}).click();
    await page.getByText(/broken at #/).waitFor();
    await page.getByRole('button',{name:'Restore',exact:true}).click();
    await page.getByText(/intact · \d+ events/).waitFor();
    const audit=page.waitForEvent('download');
    await page.getByRole('button',{name:'Export PROV-O JSON-LD'}).click();
    const auditFile=await audit;
    assert.ok(JSON.parse(await readFile(await auditFile.path(),'utf8'))['@graph'].length);
    checks.push('sample answers, citations, blocked inputs, isolation, review, ledger and export');
    await page.getByText('Simulate isolation breach',{exact:false}).click();
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    const upload=page.locator('input[type=file]');
    const uploadStart=performance.now();
    await upload.setInputFiles(resolve('public/samples/demo_bank_card_disputes.pdf'));
    await page.getByText('Chunks indexed',{exact:true}).waitFor();
    console.log('PDF ingestion ms', Math.round(performance.now()-uploadStart));
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    const sentinel='The reserve vault requires a sapphire access badge. Supervisors maintain the sapphire badge register and approve replacements.';
    const docxDir=await mkdtemp(tmpdir()+'/noor-docx-');
    const docxPath=docxDir+'/audit.docx';
    execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("word/document.xml","<w:document><w:body><w:p><w:r><w:t>"+sys.argv[2]+"</w:t></w:r></w:p></w:body></w:document>"); z.close()',docxPath,sentinel]);
    for(const ext of ['txt','md','html','docx']){
      await upload.setInputFiles(ext==='docx'?docxPath:{name:'audit.'+ext,mimeType:'text/plain',buffer:Buffer.from(ext==='html'?'<p>'+sentinel+'</p><img src="/must-never-fetch.png">':sentinel)});
      await page.getByText('Chunks indexed',{exact:true}).waitFor();
      const result=await query('What sapphire access badge does the reserve vault require?');
      assert.match(result.answer,/sapphire access badge/i);
      await page.getByRole('button',{name:'Clear',exact:true}).click();
    }
    await upload.setInputFiles({name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid PDF')});
    await page.getByRole('alert').getByText(/Could not read invalid.pdf/).waitFor();
    checks.push('PDF, TXT, MD, HTML and DOCX ingestion, invalid PDF feedback, inert HTML resources');
    await go('#/studio');
    const examples=page.getByRole('combobox',{name:/example/i});
    const exampleSelect=(await examples.count())?examples:page.locator('select').first();
    for(const example of ['card-dispute','retail-ar','sovereign','coldchain','devops','retail-en']){
      await exampleSelect.selectOption(example);
      await page.getByText(/Live-compiled/).waitFor();
    }
    const compileStart=performance.now();
    await page.getByRole('button',{name:/^▶ Compile/}).evaluate(b=>b.click());
    await page.getByText(/Compiled · 1 case/).waitFor();
    console.log('Studio Compile ms',Math.round(performance.now()-compileStart));
    for(const tab of await page.getByRole('tab').all()){
      await tab.click();
      assert.equal(await tab.getAttribute('aria-selected'),'true');
    }
    const archive=page.waitForEvent('download');
    await page.getByRole('button',{name:/⬇ .csar/}).click();
    const file=await archive;
    assert.match(execFileSync('python3',[await file.path(),'verify'],{encoding:'utf8'}),/OK|verified/i);
    await page.getByRole('button',{name:/Start from plain words/}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Our branch staff need a policy assistant to check card disputes using our card dispute procedures. Never reveal IBANs. Escalate to the Head of Card Operations.');
    await dialog.getByRole('button',{name:/Open in Studio|Use this|Use draft|Compile/i}).click();
    await dialog.waitFor({state:'hidden'});
    checks.push('Studio examples, outputs, executable archive, and Copilot draft');
    await page.getByRole('button', { name: 'Start blank' }).click();
    await page.reload();
    const source = () => page.evaluate(() => localStorage.getItem('noor.casespine.spec.v1'));
    assert.equal(await source(), '');
    await page.getByRole('button', { name: 'Suggest first line' }).click();
    await page.getByRole('option', { name: /^Case/ }).click();
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByRole('option', { name: /^Lanes/ }).click();
    await page.getByRole('button', { name: 'Show options for Roles' }).click();
    await page.getByRole('option', { name: /CODE_OWNER/ }).click();
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByRole('option', { name: /^Process Flow/ }).click();
    await page.getByRole('button', { name: /^▶ Compile/ }).click();
    await page.getByText(/Compiled · 1 case/).waitFor();
    assert.match(await source(), /Roles: \[HITM_APPROVER, CODE_OWNER\]/);
    assert.match(await source(), /Process Flow:\n  - Stage 1/);
    assert.match(await source(), /Reach Milestone: CaseResolved/);
    assert.equal(await page.locator('.cm-lintRange-error').count(), 0);
    checks.push('blank Studio case assembled and compiled using only visible suggestions');
    await go('');
    await page.getByRole('button',{name:'2. Add a draft'}).click();
    await page.getByText('Sample exception goes to the Card Operations Lead.').waitFor();
    await page.getByRole('button',{name:'3. Propose 72 hours'}).click();
    await page.getByText('Sample review packet is ready for human review.').waitFor();
    await page.getByLabel('Business brief language').selectOption('ar');
    await page.locator('#case-demo [lang=ar]').waitFor();
    await go('#/walkthrough#6','main h3');
    await page.getByRole('link',{name:'Ask a sample policy question'}).waitFor();
    await page.getByRole('button',{name:'Next step'}).click();
    assert.match(await page.locator('main').innerText(),/Deploy inside your walls/);
    await go('#/about#careem');
    await page.locator('#careem').waitFor();
    assert.ok(await page.locator('#careem').evaluate(el=>el.getBoundingClientRect().top>=0 && el.getBoundingClientRect().top<innerHeight));
    await go('#/brief');
    await go('#/services');
    await page.getByRole('heading',{name:'For regulated institutions'}).waitFor();
    await page.getByRole('link',{name:'Discuss an assessment'}).waitFor();
    await page.getByRole('button',{name:'Compliance & AML',exact:true}).click();
    await page.getByLabel('Segment',{exact:true}).selectOption('Corporate');
    await page.getByRole('button',{name:'Mock interview',exact:true}).click();
    await page.getByRole('button',{name:'Reveal what good looks like'}).click();
    await page.getByRole('button',{name:'Start timer',exact:true}).click();
    await page.getByRole('button',{name:'Pause',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open in Studio',exact:false}).click();
    await page.getByRole('heading',{name:'CaseSpine Studio',exact:true}).waitFor();
    await go('#/trust');
    await page.locator('main').getByRole('link',{name:'RAG sandbox',exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.locator('header nav').getByRole('link',{name:'About',exact:true}).click();
    await page.getByRole('heading',{name:/Build AI your team/}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Menu',exact:true}).getAttribute('aria-expanded'),'false');
    checks.push('home demo, walkthrough controls, direct anchors, brief, services, trust and mobile navigation');
    console.log('Passed:',checks);
  }
  }
  assert.deepEqual(failures,[]);
} finally {await browser.close(); server.close();}
