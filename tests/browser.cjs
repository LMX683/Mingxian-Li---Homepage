const {chromium}=require('playwright');const fs=require('fs'),os=require('os'),path=require('path');
const fixture=path.join(os.tmpdir(),'homepage-session-test-'+process.pid+'.json');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || undefined});const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/?owner-tools=1');
 await page.evaluate(()=>{
  const area=document.createElement('div');area.id='fixture';area.innerHTML='<input type="password" value="TOP_SECRET"><div data-private>PRIVATE_TEXT</div><div id="move">before</div><div id="other"></div>';document.body.append(area);
  window.testTracker=new SessionTracker();testTracker.start();
 });
 await page.evaluate(()=>{const node=document.getElementById('move');node.textContent='after';document.getElementById('other').append(node);document.documentElement.setAttribute('data-theme','dark');});
 await page.waitForTimeout(100);
 await page.mouse.move(400,300);await page.mouse.click(400,300);await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(150);
 const session=await page.evaluate(()=>{testTracker.stop();return testTracker.export();});
 if(JSON.stringify(session).includes('TOP_SECRET')||JSON.stringify(session).includes('PRIVATE_TEXT'))throw Error('Privacy failure');
 fs.writeFileSync(fixture,JSON.stringify(session));
 await page.goto('http://127.0.0.1:8765/session-player.html');
 await page.locator('#file').setInputFiles(fixture);await page.waitForFunction(()=>!document.getElementById('play').disabled);
 await page.evaluate(()=>player.seek(player.duration));
 const state=await page.evaluate(()=>({text:player.frame.contentDocument.getElementById('move')?.textContent,parent:player.frame.contentDocument.getElementById('move')?.parentElement.id,theme:player.frame.contentDocument.documentElement.getAttribute('data-theme'),scripts:player.frame.contentDocument.querySelectorAll('script').length}));
 if(state.text!=='after'||state.parent!=='other'||state.theme!=='dark'||state.scripts!==0)throw Error(JSON.stringify(state));
 await page.evaluate(()=>player.seek(0));
 if(await page.evaluate(()=>player.frame.contentDocument.getElementById('move').textContent)!=='before')throw Error('Seek reset failed');
 await page.locator('#play').click();await page.waitForTimeout(800);
 if(await page.evaluate(()=>player.time)<session.events.at(-1).timestamp)throw Error('Playback failed');
 
 // Malicious snapshot must be inert even when injected outside recorder's filters.
 const malicious=structuredClone(session);const html=malicious.events[0].node.children.find(x=>x.tag==='html'),body=html.children.find(x=>x.tag==='body');
 body.children.push({id:99999,type:'element',tag:'script',attrs:{},children:[{id:99998,type:'text',text:'parent.__executed=true'}]});
 body.children.push({id:99997,type:'element',tag:'img',attrs:{src:'javascript:parent.__executed=true',onerror:'parent.__executed=true'},children:[]});
 await page.evaluate(async s=>{await player.load(s);},malicious);await page.waitForTimeout(100);
 if(await page.evaluate(()=>window.__executed))throw Error('Imported script executed');
 // Event cap must stop without recursively adding session-end forever.
 await page.goto('http://127.0.0.1:8765/?owner-tools=1');
 const capped=await page.evaluate(()=>{const t=new SessionTracker({maxEvents:3});t.start();t.emit('click');t.emit('click');return {running:t.running,count:t.events.length};});
 if(capped.running||capped.count!==4)throw Error('Cap failed');
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: privacy, mutations, moves, seek, playback, script isolation, event cap; '+session.events.length+' events');
 fs.unlinkSync(fixture);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
