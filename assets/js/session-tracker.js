/* SessionTracker v1: opt-in recording; no network destination by default. */
(() => {
  const PRIVATE = '[data-private],.sensitive,.private,input,textarea,select,[contenteditable]';
  const cleanURL = value => { try { const u = new URL(value, location.href); return ['http:', 'https:'].includes(u.protocol) ? u.origin + u.pathname : ''; } catch { return ''; } };
  class SessionTracker {
    constructor({onFlush = () => {}, endpoint = null, maxEvents = 10000} = {}) {
      this.onFlush = onFlush; this.endpoint = endpoint; this.maxEvents = maxEvents;
      this.ids = new WeakMap(); this.nextID = 1; this.buffer = []; this.events = []; this.listeners = [];
    }
    id(node) { if (!this.ids.has(node)) this.ids.set(node, this.nextID++); return this.ids.get(node); }
    private(node) { const el = node.nodeType === 1 ? node : node.parentElement; return !!el?.closest(PRIVATE); }
    attrs(el) {
      const result = {};
      for (const a of el.attributes) {
        if (/^on/i.test(a.name) || /^(value|srcdoc|nonce|integrity|action|formaction)$/i.test(a.name)) continue;
        if (this.private(el) && !['class','type','data-private'].includes(a.name)) continue;
        if (a.name.startsWith('data-') && !['data-private','data-theme'].includes(a.name)) continue;
        result[a.name] = /^(href|src|poster)$/i.test(a.name) ? cleanURL(a.value) : a.value;
      }
      return result;
    }
    serialize(node) {
      if (node.nodeType === 10) return null;
      if (node.nodeType === 1 && node.matches('script,noscript,iframe,object,embed,[data-session-ignore]')) return null;
      const id = this.id(node);
      if (node.nodeType === 3) return {id, type: 'text', text: this.private(node) ? '***' : node.textContent};
      if (![1,9].includes(node.nodeType)) return null;
      return {id, type: node.nodeType === 9 ? 'document' : 'element', tag: node.localName,
        attrs: node.nodeType === 1 ? this.attrs(node) : {},
        children: Array.from(node.childNodes, n => this.serialize(n)).filter(Boolean)};
    }
    emit(type, data = {}) {
      if (!this.running) return;
      const event = {type, timestamp: performance.now() - this.startTime, ...data};
      this.buffer.push(event); this.events.push(event);
      if (this.buffer.length >= 50) this.flush();
      if (this.events.length >= this.maxEvents) this.stop('event-limit');
    }
    listen(target, type, handler) { target.addEventListener(type, handler, {capture:true, passive:true}); this.listeners.push(() => target.removeEventListener(type, handler, true)); }
    throttle(fn, ms) { let last = -Infinity; return e => { const now = performance.now(); if (now-last >= ms) { last=now; fn(e); } }; }
    dimensions() { return {width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,x:scrollX,y:scrollY}; }
    start() {
      if (this.running) return;
      this.startTime = performance.now(); this.running = true;
      this.meta = {schemaVersion:1, sessionID:crypto.randomUUID(), startedAt:new Date().toISOString(), url:cleanURL(location.href), referrer:cleanURL(document.referrer), userAgent: 'omitted'};
      this.emit('snapshot', {node:this.serialize(document),viewport:this.dimensions(),visibility:document.visibilityState});
      this.observer = new MutationObserver(records => {
        // Determine intermediate values from the next mutation's oldValue.
        records.forEach((r, i) => {
          if ((r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest('script,[data-session-ignore]')) return;
          const target = this.id(r.target);
          if (r.type === 'childList') this.emit('mutation', {kind:'childList',target,removed:Array.from(r.removedNodes,n=>this.id(n)),added:Array.from(r.addedNodes,n=>this.serialize(n)).filter(Boolean),next:r.nextSibling ? this.id(r.nextSibling) : null});
          else if (r.type === 'characterData') {
            const later = records.slice(i+1).find(x => x.type === r.type && x.target === r.target);
            this.emit('mutation', {kind:'text',target,text:this.private(r.target) ? '***' : later ? later.oldValue : r.target.textContent});
          } else {
            // Serialize filtered attributes rather than leaking attribute oldValue.
            const safe = this.attrs(r.target), later = records.slice(i+1).find(x=>x.type===r.type && x.target===r.target && x.attributeName===r.attributeName);
            const name=r.attributeName;
            if (/^on/i.test(name) || /^(value|srcdoc|nonce|integrity|action|formaction)$/i.test(name) || (name.startsWith('data-') && !['data-private','data-theme'].includes(name))) return;
            if (this.private(r.target)) { this.emit('mutation',{kind:'replace',target,node:this.serialize(r.target)}); return; }
            const raw = later ? later.oldValue : r.target.getAttribute(name);
            this.emit('mutation', {kind:'attribute',target,name,value:raw===null ? null : /^(href|src|poster)$/i.test(name) ? cleanURL(raw) : safe[name] === undefined ? null : raw,
              oldValue:r.oldValue===null ? null : /^(href|src|poster)$/i.test(name) ? cleanURL(r.oldValue) : r.oldValue});
          }
        });
      });
      this.observer.observe(document,{subtree:true,childList:true,attributes:true,characterData:true,attributeOldValue:true,characterDataOldValue:true});
      const pointer = e => ({x:e.clientX,y:e.clientY,target:this.id(e.target)});
      this.listen(document,'mousemove',this.throttle(e=>this.emit('mousemove',pointer(e)),50));
      this.listen(document,'click', e => {
        if (e.target.closest?.('[data-session-ignore]')) return;
        const link = e.target.closest?.('a[href]');
        this.emit('click',{...pointer(e),link:link ? cleanURL(link.href) : null,section:e.target.closest?.('section[id]')?.id || null});
      });
      this.listen(document,'scroll',this.throttle(e=>{ const root=e.target===document; this.emit('scroll',root ? {root:true,...this.dimensions()} : {root:false,target:this.id(e.target),x:e.target.scrollLeft,y:e.target.scrollTop}); },100));
      this.listen(window,'resize',()=>this.emit('resize',{viewport:this.dimensions()}));
      this.listen(document,'visibilitychange',()=>this.emit('visibilitychange',{state:document.visibilityState}));
      for (const type of ['input','change']) this.listen(document,type,e=>{
        if (!e.target.matches?.('input,textarea,select,[contenteditable]')) return;
        this.emit(type,{target:this.id(e.target),value:'***',masked:true});
      });
      this.listen(window,'pagehide',()=>{this.emit('session-end',{reason:'pagehide'});this.flush(true);});
      this.listen(window,'beforeunload',()=>this.flush(true));
      this.timer=setInterval(()=>{this.emit('heartbeat');this.flush();},5000);
    }
    flush(unloading=false) {
      if (!this.buffer.length) return;
      const batch=this.buffer.splice(0);
      try { this.onFlush({meta:this.meta,events:batch}); } catch (error) { console.error('Session export failed',error); }
      if (unloading && this.endpoint) navigator.sendBeacon(this.endpoint,new Blob([JSON.stringify({meta:this.meta,events:batch})],{type:'application/json'}));
    }
    stop(reason='user') { if (!this.running || this.stopping) return; this.stopping=true; this.emit('session-end',{reason}); this.running=false;this.observer.disconnect();this.listeners.forEach(fn=>fn());this.listeners=[];clearInterval(this.timer);this.flush();this.stopping=false; }
    export() { return {meta:this.meta,events:this.events}; }
  }
  window.SessionTracker=SessionTracker;
})();
