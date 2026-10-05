(() => {
  const button=document.getElementById('session-toggle'), save=document.getElementById('session-export'), status=document.getElementById('session-status');
  let tracker;
  const key='homepage-session-v1';
  const saved=()=>{try{return sessionStorage.getItem(key);}catch{return null;}};
  save.hidden=!saved();
  button.addEventListener('click',()=>{
    if (tracker?.running) { tracker.stop();button.textContent='Start recording';status.textContent='Stopped. Export your session or clear it.';return; }
    if (!confirm('Record this visit locally? Mouse positions, clicks, scrolling and page changes will be stored in this tab. Form values are masked. Nothing is uploaded.')) return;
    tracker=new SessionTracker({onFlush:()=>{
      try { sessionStorage.setItem(key,JSON.stringify(tracker.export()));save.hidden=false; }
      catch { status.textContent='Tab storage is full. Export the current recording now.';save.hidden=false; }
    }});
    tracker.start();button.textContent='Stop recording';status.textContent='Recording locally · no upload';save.hidden=false;
  });
  save.addEventListener('click',()=>{
    const data=tracker ? JSON.stringify(tracker.export()) : saved();
    if (!data) return;
    const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='homepage-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  document.getElementById('session-clear').addEventListener('click',()=>{tracker?.stop();tracker=null;try{sessionStorage.removeItem(key);}catch{}save.hidden=true;button.textContent='Start recording';status.textContent='Recording off · no upload';});
})();
