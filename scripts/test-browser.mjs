import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(process.argv[2] || 'dist'), baseline=process.argv[3]==='baseline';
const modelOrigin=process.env.NOOR_MODEL_URL ? new URL(process.env.NOOR_MODEL_URL).origin : null;
const nextStepEndpoint=process.env.NOOR_TEST_NEXT_STEP_ENDPOINT;
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
const outageResponses=new WeakSet();
page.on('pageerror',e=>failures.push(e.message));
page.on('response',r=>{if(r.status()>=400 && !outageResponses.has(r.request())) failures.push(r.status()+' '+r.url());});
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
    const add = async (button, option) => {
      await page.getByRole('button', { name: button, exact: true }).click();
      await page.getByRole('option', { name: option }).click();
    };
    await add('Add lane', /^Head of Compliance/);
    await add('Add stage', /^Stage 1 \(Gather evidence\)/);
    await add('Add stage', /^Stage 2 \(Review\)/);
    await add('Add escalation', /^Head of Compliance/);
    await add('Add gateway', /^Exit Gateway/);
    await add('Add rule', /^four-eyes/);
    await add('Add constraint', /^Compliance/);
    await add('Add constraint', /^Residency/);
    await page.getByRole('button', { name: /^▶ Compile/ }).click();
    await page.getByText(/Compiled · 1 case/).waitFor();
    assert.match(await source(), /Roles: \[HITM_APPROVER, CODE_OWNER\]/);
    assert.equal(await page.locator('.cm-lintRange-error').count(), 0);
    await page.getByRole('tab', { name: 'IR', exact: true }).click();
    const [manifest] = JSON.parse(await page.locator('pre.code-out').innerText()).cases;
    assert.deepEqual(manifest.stages.map(stage => [stage.name, stage.when, stage.milestone, stage.escalate_to]), [
      ['Gather evidence', 'Request received', 'EvidenceReady', null],
      ['Review', 'Milestone EvidenceReady is achieved', 'ReviewComplete', 'Head of Compliance'],
    ]);
    assert.match(manifest.stages[1].exit_gateway.thenText, /ReviewComplete/);
    assert.equal(manifest.rules[0].milestone, 'ReviewComplete');
    assert.match(manifest.rules[0].text, /reviewer 1 != reviewer 2/);
    assert.deepEqual(manifest.constraints.map(constraint => constraint.facet), ['Compliance', 'Residency']);
    const authored = await source();
    await go('#/sandbox');
    await page.getByRole('spinbutton', {name: 'reviewer1Id'}).fill('41');
    await page.getByRole('spinbutton', {name: 'reviewer2Id'}).fill('41');
    const failedReview = await query(questions[0][0]);
    assert.match(failedReview.status, /Contract breached.*Escalated to Head of Compliance/s);
    assert.equal(await page.locator('.sb-answer').count(), 0);
    await page.getByRole('spinbutton', {name: 'reviewer2Id'}).fill('42');
    // Use a different question so the result must come from this run.
    const independentReview = await query(questions[1][0]);
    assert.match(independentReview.status, /Verified answer/);
    assert.match(independentReview.answer, /Branch Manager/);
    await page.locator('.sb-cite').first().click();
    assert.match(await page.locator('.sb-quote').innerText(), /page \d+.*chunk/i);
    console.log('Authoring workflow sandbox ms', {breach: failedReview.ms, verified: independentReview.ms});
    checks.push('two stages, separate reviewer lane, milestone rule, escalation, gateway, and constraints authored using only suggestions and exercised in Sandbox');

    await go('#/studio');
    const editor = page.locator('.cm-content[contenteditable=true]');
    const replaceSpec = async text => {
      await editor.focus();
      await editor.press('ControlOrMeta+a');
      await page.keyboard.insertText(text);
      await page.waitForFunction(text => localStorage.getItem('noor.casespine.spec.v1') === text, text);
    };
    const setFragment = async (fragment, tail = '') => {
      await replaceSpec('Case: Policy review\n' + fragment + (tail ? '\n' + tail : ''));
      if (tail) {
        const line = page.locator('.cm-line').filter({hasText: fragment}).first();
        await line.click();
        await editor.press('End');
      }
    };
    const compileInStudio = async () => {
      await page.getByRole('button', {name: /^▶ Compile/}).click();
      await page.getByRole('tab', {name: 'Lean 4', exact: true, selected: true}).waitFor();
    };
    const readCase = async () => {
      await page.getByRole('tab', {name: 'IR', exact: true}).click();
      return JSON.parse(await page.locator('pre.code-out').innerText()).cases[0];
    };
    const completionMenu = page.locator('.cm-tooltip-autocomplete');
    const visual = page.getByRole('region', {name: 'Visual program'});
    const existingLanes = 'Lanes:\n  Branch Compliance Officer:\n    Roles: [HITM_APPROVER]';
    await setFragment('', existingLanes);
    await editor.press('ControlOrMeta+Home');
    await editor.press('ArrowDown');
    await page.keyboard.type('La', {delay: 80});
    await page.locator('.cm-ghost').getByText(/nes:.*Case Owner:/s).waitFor();
    await completionMenu.getByRole('option',{name:/Insert new Lanes block/}).waitFor();
    assert.match(await completionMenu.getByRole('option').first().innerText(), /Insert new Lanes block/);
    assert.equal(await completionMenu.getByRole('option',{name:/Population Segment/}).count(),0);
    await editor.press('ArrowRight');
    assert.match(await source(), /\nLanes:\n  Case Owner:/);
    assert.ok((await source()).endsWith(existingLanes));
    await visual.getByRole('button', {name: 'Case Owner', exact: true}).waitFor();
    await visual.getByRole('button', {name: 'Branch Compliance Officer', exact: true}).waitFor();
    await compileInStudio();
    assert.deepEqual((await readCase()).lanes.map(lane => lane.name), ['Case Owner', 'Branch Compliance Officer']);

    for (const fragment of ['Lanes:', 'Lane:', 'Lanes or what', 'Please add another Lanes block']) {
      await setFragment(fragment, existingLanes);
      const expected = fragment === 'Lanes:' ? /Case Owner:/ : /Lanes:.*Case Owner:/s;
      await page.locator('.cm-ghost').getByText(expected).waitFor();
      assert.equal(await source(), 'Case: Policy review\n' + fragment + '\n' + existingLanes);
      await editor.press('Tab');
      assert.match(await source(),/\nLanes:\n  Case Owner:\n    SSO Provider: Microsoft Entra ID\n    Roles: \[HITM_APPROVER\]/);
      assert.ok((await source()).endsWith(existingLanes));
    }
    for (const fragment of ['Lane:', 'Lanes or what']) {
      await setFragment(fragment);
      await page.locator('.cm-ghost-rewrite').getByText(/Lanes:.*Case Owner:/s).waitFor();
      await editor.press(fragment === 'Lane:' ? 'ArrowRight' : 'Tab');
      assert.match(await source(),/\nLanes:\n  Case Owner:/);
    }
    await setFragment('Lanes:', existingLanes);
    await page.locator('.cm-ghost').getByText(/Case Owner:/).waitFor();
    await editor.press('Enter');
    await page.keyboard.type('Risk Review:');
    assert.equal(await source(), 'Case: Policy review\nLanes:\n  Risk Review:\n' + existingLanes);
    await compileInStudio();
    assert.deepEqual((await readCase()).lanes.map(lane => lane.name), ['Risk Review', 'Branch Compliance Officer']);

    await setFragment('La', existingLanes);
    await editor.press('Control+Space');
    await completionMenu.getByRole('option', {name: /Go to existing Lanes/}).waitFor();
    await page.waitForTimeout(80); // CodeMirror's deliberate keyboard interaction delay.
    await editor.press('ArrowDown');
    await completionMenu.getByRole('option', {name: /Go to existing Lanes/, selected: true}).waitFor();
    await editor.press('Tab');
    assert.equal(await source(), 'Case: Policy review\nLa\n' + existingLanes);
    assert.equal(await page.locator('.cm-activeLine').innerText(), 'Lanes:');

    await setFragment('Lane:', existingLanes);
    await page.locator('.cm-ghost-rewrite').getByText(/Lanes:.*Case Owner:/s).waitFor();
    await editor.press('Escape');
    await page.locator('.cs-unfinished').filter({hasText:'Lane:'}).first().hover();
    await page.getByRole('button',{name:/Insert new Lanes block/}).click();
    assert.match(await source(), /\nLanes:\n  Case Owner:/);
    assert.ok((await source()).endsWith(existingLanes));

    const repeated = [
      ['Case File:', 'Case File:\n  Documents:\n    Source: pdf("wire.pdf")', /Policy Documents:/],
      ['Business & Product Constraints:', 'Business & Product Constraints:\n  Compliance: Review every release.', /Risk:/],
      ['Process Flow:', 'Process Flow:\n  - Stage 1 (Screen):\n      Steps:\n        - Screen incoming transfers\n      Reach Milestone: Screened', /Stage 2 \(Review\)/],
    ];
    for (const [fragment, existing, preview] of repeated) {
      await setFragment(fragment, existing);
      await page.locator('.cm-ghost').getByText(preview).waitFor();
      await editor.press('ArrowRight');
      assert.ok((await source()).endsWith(existing));
      await compileInStudio();
    }
    assert.deepEqual((await readCase()).stages.map(stage => stage.name), ['Review', 'Screen']);
    await editor.press('ControlOrMeta+End');
    await add('Add section', /^Process Flow/);
    await compileInStudio();
    assert.deepEqual((await readCase()).stages.map(stage => [stage.name, stage.when]), [
      ['Review', 'Request received'], ['Screen', 'Immediate'], ['Review', 'Milestone Screened is achieved'],
    ]);

    await setFragment('Deployment:', 'Deployment:\n  Residency: UAE');
    assert.equal(await page.locator('.cm-ghost').count(), 0);
    await page.getByRole('button', {name: /^▶ Compile/}).click();
    assert.equal(await page.getByRole('button', {name: /⬇ .csar/}).isDisabled(), true);
    checks.push('repeatable blocks insert in place, preserve existing entries and compile, with opt-in navigation and singleton validation');

    await setFragment('Lanes: Branch Compliance');
    await page.locator('.cm-ghost-rewrite').getByText(/Lanes:.*Branch Compliance:/s).waitFor();
    await editor.press('Tab');
    assert.match(await source(),/Lanes:\n  Branch Compliance:$/);
    await setFragment('Porcess Flow:');
    await page.locator('.cm-ghost-rewrite').getByText(/Stage 1 \(Gather evidence\)/).waitFor();
    await editor.press('Tab');
    assert.match(await source(),/Process Flow:\n  - Stage 1/);
    await replaceSpec('Case: Policy review\nConfig:\n  Retriever:\n    Tp K: 4');
    await page.locator('.cm-ghost-rewrite').getByText('Top K: 4',{exact:false}).waitFor();
    await editor.press('ArrowRight');
    assert.match(await source(),/Top K: 4$/);
    await replaceSpec('Case: Policy review\nLane:\n  Compliance:\n    Roles: [HITM_APPROVER]');
    await page.getByRole('button',{name:/^▶ Compile/}).click();
    await page.getByRole('tab',{name:/Diagnostics/}).getAttribute('aria-selected').then(selected=>assert.equal(selected,'true'));
    assert.equal(await page.getByRole('button',{name:/⬇ .csar/}).isDisabled(),true);
    await go('#/sandbox');
    await page.getByText(/Resolve the source errors before running this case/).waitFor();
    await go('#/studio');
    await replaceSpec('Case: Policy review');
    const recommendation = nextStepEndpoint ? page.waitForResponse((response) => response.url() === nextStepEndpoint && response.request().method() === 'POST') : null;
    await page.getByRole('button',{name:'Suggest next step',exact:true}).click();
    if (recommendation) {
      const response = await recommendation;
      assert.equal(response.status(), 200);
      const { choice } = await response.json();
      assert.equal(typeof choice, 'string');
      const sent = response.request().postDataJSON();
      assert.deepEqual(Object.keys(sent).sort(), ['context', 'options']);
      assert.deepEqual(sent.context, { position: 'top', state: 'ready' });
      assert.ok(sent.options.some(option => option.id === choice));
      assert.doesNotMatch(JSON.stringify(sent), /Policy review/);
      await page.getByText('Model recommendation available').waitFor();
      await page.getByRole('button',{name:/ · Recommended$/}).waitFor();
      checks.push('real contextual model recommendation returns an offered edit and receives no case source');
    }
    await page.getByRole('button',{name:/Set up the missing workflow blocks/}).click();
    await page.locator('.cm-ghost-rewrite').getByText(/Lanes:.*Case File:.*Process Flow:/s).waitFor();
    assert.equal(await source(),'Case: Policy review');
    await editor.press('ArrowRight');
    assert.match(await source(),/Lanes:[\s\S]*Case File:[\s\S]*Process Flow:/);
    await page.getByRole('button',{name:/^▶ Compile/}).click();
    await page.getByText(/Compiled · 1 case/).waitFor();
    checks.push('contextual keyword ranking, in-place fixes, existing blocks, strict syntax gating, related block previews, and Tab/Right Arrow');

    await replaceSpec('Case: Policy review\nBusiness & Product Constraints: ');
    await page.locator('.cm-ghost').getByText(/Compliance:/).waitFor();
    await editor.press('Tab');
    assert.match(await source(), /\n  Compliance: Record the policy source/);
    await replaceSpec('Case: Policy review\nBusiness & Product Constraints:\n  Qua');
    await page.locator('.cm-ghost').getByText(/lity: Target at least 90%/).waitFor();
    await editor.press('Tab');
    assert.match(await source(), /\n  Quality: Target at least 90%/);
    await replaceSpec('Case: Policy review\nProcess Flow:\n  - Stage 1 (Screen inbound transfers):\n      When: Files received\n      Steps:\n      Reach Milestone:');
    await editor.press('Escape');
    await page.locator('.cs-unfinished').filter({hasText: /Stage 1/}).first().hover();
    await page.getByRole('button', {name: /Complete this stage/}).first().click();
    assert.match(await source(), /Stage 1 \(Screen inbound transfers\):\n      When: Files received\n      Steps:\n        - Review the case evidence\n      Reach Milestone: Stage1Complete/);
    assert.equal((await source()).match(/\bSteps:/g).length, 1);
    await replaceSpec('Case: Policy review\nLanes:\n  Review:\n    Roles: [HITM_APPROVER');
    await editor.press('Escape');
    await page.locator('.cs-unfinished').filter({hasText: 'HITM_APPROVER'}).first().hover();
    await page.getByRole('button', {name: /Close list with/}).first().click();
    assert.match(await source(), /Roles: \[HITM_APPROVER\]$/);
    await replaceSpec(authored + '\nblorp coffee xyz');
    await editor.press('Escape');
    await page.locator('.cs-unrecognized').getByText('blorp coffee xyz').hover();
    await page.getByRole('button', {name: /Keep as a # comment/}).click();
    assert.equal(await source(), authored + '\n# blorp coffee xyz');
    await page.getByRole('button', { name: /^▶ Compile/ }).click();
    await page.getByText(/Compiled · 1 case/).waitFor();
    checks.push('constraint ghost text, section repair preserving intent, list repair, and comment fallback');

    const canvas = page.getByRole('region', {name: 'Visual program'});
    const programSource = page.getByRole('region', {name: 'CaseSpine source'});
    assert.ok((await canvas.boundingBox()).x > (await programSource.boundingBox()).x);
    const laneRequest = 'Hey, add the lane with the requirements X, Y, Z';
    await replaceSpec('Case: Policy review\n' + laneRequest);
    const rewrite = page.locator('.cm-ghost-rewrite');
    await rewrite.getByText(/New Lane:/).waitFor();
    await canvas.getByRole('button', {name: 'New Lane', exact: true}).waitFor();
    assert.match(await source(), new RegExp(laneRequest));
    await page.getByRole('button', {name: 'Dismiss draft'}).click();
    await rewrite.waitFor({state: 'hidden'});
    await canvas.getByRole('button', {name: 'New Lane', exact: true}).waitFor({state: 'hidden'});
    assert.match(await source(), new RegExp(laneRequest));
    await editor.press('End');
    await page.keyboard.insertText('!');
    await rewrite.waitFor();
    await editor.press('Tab');
    assert.match(await source(), /Lanes:\n  New Lane:\n    Roles: \[X, Y, Z\]/);
    assert.doesNotMatch(await source(), /Hey, add/);
    await replaceSpec((await source()) + '\nPlease add a stage called Screen transfers with a step Check the policy');
    await canvas.getByRole('button', {name: 'Stage 1 · Screen transfers', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Accept draft'}).click();
    assert.match(await source(), /Stage 1 \(Screen transfers\):/);
    await canvas.getByRole('searchbox', {name: 'Find a widget'}).fill('PII Redactor');
    await canvas.getByRole('button', {name: /PII Redactor/}).first().click();
    assert.match(await source(), /Curation: redact \[UAE_IBAN, EMIRATES_ID, EMAIL\]/);
    await page.locator('.cm-line').filter({hasText: /Curation: redact/}).waitFor();
    checks.push('plain-language lane and stage previews, accept and dismiss, and immediate canvas-to-source edits');

    await page.getByRole('button', {name: 'Start blank'}).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button', {name: 'Sketch workflow', exact: true}).click();
    const drawing = await page.locator('canvas[aria-label="Draw stage boxes"]').boundingBox();
    assert.ok(drawing && drawing.x >= 0 && drawing.x + drawing.width <= 390);
    const drawBox = async (x, y) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 88, y, {steps: 8});
      await page.mouse.move(x + 88, y + 42, {steps: 8});
      await page.mouse.move(x, y + 42, {steps: 8});
      await page.mouse.move(x, y, {steps: 8});
      await page.mouse.up();
    };
    await drawBox(drawing.x + 18, drawing.y + 18);
    await drawBox(drawing.x + 18, drawing.y + 84);
    await page.getByRole('button', {name: 'Read sketch'}).click();
    await page.getByRole('textbox', {name: 'Stage 1'}).fill('Intake');
    await page.getByRole('textbox', {name: 'Stage 2'}).fill('Release review');
    await page.getByRole('button', {name: 'Preview stages'}).click();
    await canvas.getByRole('button', {name: 'Stage 2 · Release review', exact: true}).waitFor();
    assert.equal(await source(), '');
    await page.getByRole('button', {name: 'Accept draft'}).click();
    assert.match(await source(), /Stage 2 \(Release review\):\n      When: Milestone EvidenceReady is achieved/);
    checks.push('mobile-size hand-drawn stage boxes become a linked workflow in source and canvas');
    await page.setViewportSize({width:1440,height:1000});
    if (modelOrigin) {
      let failuresSimulated=0;
      const intercept=modelOrigin+'/**';
      const outage=route=>{
        failuresSimulated++;
        outageResponses.add(route.request());
        return route.fulfill({status:503,contentType:'text/plain',body:'Model temporarily offline',headers:{
          'Access-Control-Allow-Origin':new URL(url).origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type',
        }});
      };
      await page.route(intercept,outage);
      await go('#/compliance');
      assert.equal(await page.getByLabel('Answer mode').inputValue(),'live');
      const policy=page.getByTestId('policy-result');
      await page.getByRole('button',{name:/Who approves a transfer/}).click();
      await policy.getByRole('heading',{name:'Matching policy passages'}).waitFor();
      await policy.getByText('Live answer unavailable. Searched the local policy index.').waitFor();
      assert.match(await policy.innerText(),/Retail Wire Policy §3.*Branch Manager/s);
      assert.equal(await page.getByRole('alert').count(),0);
      await page.getByRole('button',{name:/How often must/}).click();
      await policy.getByText(/four hours/).first().waitFor();
      assert.equal(failuresSimulated,1,'second lookup should use the local index during the retry pause');

      await page.locator('header nav').getByRole('link',{name:'Studio',exact:true}).click();
      const review='Need two independent reviewers before release';
      await replaceSpec('Case: Policy review\nBinding Lean Contract:\n  Rules:\n    - '+review);
      await editor.press('Escape');
      await page.locator('.cs-unrecognized').filter({hasText:review}).first().hover();
      await page.getByRole('button',{name:'Ask AI about this line'}).click();
      await page.getByText('Live model unavailable. Local draft.').waitFor();
      await page.getByRole('button',{name:'Accept draft'}).click();
      assert.match(await source(),/reviewer 1 != reviewer 2/);
      const unrelated='broccoli guitar wizard 947';
      await replaceSpec('Case: Policy review\n'+unrelated);
      await editor.press('Escape');
      await page.locator('.cs-unrecognized').filter({hasText:unrelated}).first().hover();
      await page.getByRole('button',{name:'Ask AI about this line'}).click();
      await page.getByText('Live model unavailable. You can keep this line as a comment.').waitFor();
      await page.getByRole('button',{name:/Keep as a # comment/}).click();
      assert.match(await source(),/# broccoli guitar wizard 947/);
      assert.equal(failuresSimulated,1,'both features should reuse the same origin’s retry pause');
      await page.unroute(intercept,outage);
      checks.push('model outage uses local passages, a validated local Studio draft, and the comment action');
    }
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
