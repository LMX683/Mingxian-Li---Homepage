/* Read-only DOM replay. Imported scripts, forms and navigation never execute. */
(() => {
  const allowedTags=new Set('html head body title meta link style div span p a img header footer main nav section article aside h1 h2 h3 h4 h5 h6 ul ol li strong em b i br hr pre code blockquote table thead tbody tr th td button input textarea select option label details summary svg path circle g rect line polyline polygon text defs use'.split(' '));
  const allowedAttrs=new Set('id class title alt width height type rel href src style viewBox d fill stroke cx cy r x y x1 x2 y1 y2 points transform xmlns role aria-label aria-hidden data-theme data-private open'.split(' '));
  class SessionPlayer {
    constructor(frame,cursor,onTime=()=>{}) {this.frame=frame;this.cursor=cursor;this.onTime=onTime;this.speed=1;this.skip=false;this.time=0;this.index=0;this.playing=false;this.nodes=new Map();}
    safeURL(value) {try {const u=new URL(value,this.base);return ['https:','http:'].includes(u.protocol) ? u.href : null;} catch {return null;}}
    attribute(node,name,value) {
      if (!allowedAttrs.has(name) || /^on/i.test(name)) return;
      if (value===null) {node.removeAttribute(name);return;}
      if (['href','src'].includes(name)) {value=this.safeURL(value);if (!value) return;}
      if (name==='style' && /url\s*\(|@import|expression/i.test(value)) return;
      if (name==='type' && node.localName==='input') value='text';
      node.setAttribute(name,String(value));
    }
    build(data,depth=0) {
      if (depth>250 || !data || !Number.isInteger(data.id)) throw Error('Invalid or excessively deep snapshot');
      const doc=this.frame.contentDocument;
      if (data.type==='text') {const node=doc.createTextNode(String(data.text || ''));this.nodes.set(data.id,node);return node;}
      if (data.type==='document') {this.nodes.set(data.id,doc);const fragment=doc.createDocumentFragment();for (const c of data.children||[]) fragment.append(this.build(c,depth+1));return fragment;}
      const tag=String(data.tag||'').toLowerCase();
      if (!allowedTags.has(tag)) return doc.createComment('excluded');
      // SVG is rendered only with the small inert allowlist above.
      const svgTags=new Set('svg path circle g rect line polyline polygon text defs use'.split(' '));
      const node=svgTags.has(tag) ? doc.createElementNS('http://www.w3.org/2000/svg',tag) : doc.createElement(tag);
      this.nodes.set(data.id,node);
      for(const [name,value] of Object.entries(data.attrs||{})) this.attribute(node,name,value);
      if(tag==='meta') return doc.createComment('metadata excluded');
      if(tag==='link' && node.getAttribute('rel')!=='stylesheet') return doc.createComment('link excluded');
      for(const c of data.children||[]) node.append(this.build(c,depth+1));
      if(node.matches('input,textarea,select')) {node.value='***';node.disabled=true;}
      return node;
    }
    async load(session) {
      this.pause();
      const events=Array.isArray(session) ? session : session.events;
      if(!Array.isArray(events) || !events.length || events.length>20000 || events[0].type!=='snapshot') throw Error('Expected a snapshot followed by at most 20,000 events');
      let last=-1;
      for(const e of events) {if(!Number.isFinite(e.timestamp)||e.timestamp<last||e.timestamp<0) throw Error('Timestamps must be finite and ordered');last=e.timestamp;}
      this.events=events;this.base=this.safeURL(session.meta?.url) || location.href;this.duration=events.at(-1).timestamp;
      this.frame.setAttribute('sandbox','allow-same-origin');
      const loaded=new Promise(resolve=>this.frame.addEventListener('load',resolve,{once:true}));
      this.frame.srcdoc='<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;none&#39;; style-src &#39;unsafe-inline&#39; &#39;self&#39; https://lmx683.github.io https://fonts.googleapis.com https://cdnjs.cloudflare.com; img-src &#39;self&#39; https://lmx683.github.io; font-src &#39;self&#39; https://fonts.gstatic.com https://cdnjs.cloudflare.com; connect-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"></head><body></body></html>';
      await loaded;this.seek(0);
    }
    reset() {
      this.nodes.clear();const doc=this.frame.contentDocument;
      // Keep the original CSP element; reconstructed head is appended under it.
      const csp=doc.querySelector('meta[http-equiv]')?.cloneNode(true);
      const root=this.build(this.events[0].node);
      while(doc.firstChild) doc.removeChild(doc.firstChild);
      doc.append(doc.implementation.createDocumentType('html','',''));doc.append(root);
      if(!doc.documentElement || doc.documentElement.localName!=='html') throw Error('Missing HTML root');
      if(csp) doc.head.prepend(csp);
      doc.addEventListener('click',e=>e.preventDefault(),true);
      this.index=1;this.time=0;this.cursor.style.opacity='0';
      this.apply(this.events[0]);
    }
    apply(e) {
      const win=this.frame.contentWindow;
      if(e.type==='snapshot'||e.type==='resize') {
        this.width=e.viewport.width;this.height=e.viewport.height;this.frame.style.width=this.width+'px';this.frame.style.height=this.height+'px';this.fit();
        if(e.type==='snapshot') win.scrollTo(e.viewport.x,e.viewport.y);
      } else if(e.type==='scroll') {if(e.root) win.scrollTo(e.x,e.y);else this.nodes.get(e.target)?.scrollTo(e.x,e.y);}
      else if(e.type==='mousemove'||e.type==='click') {
        this.pointer(e.x,e.y);
        if(e.type==='click') {const ripple=document.createElement('span');ripple.className='ripple';ripple.style.left=(e.x*this.scale)+'px';ripple.style.top=(e.y*this.scale)+'px';this.frame.parentElement.append(ripple);setTimeout(()=>ripple.remove(),600);}
      } else if(e.type==='mutation') {
        const target=this.nodes.get(e.target);if(!target) return;
        if(e.kind==='text') target.textContent=e.text;
        else if(e.kind==='attribute') this.attribute(target,e.name,e.value);
        else if(e.kind==='replace') target.replaceWith(this.build(e.node));
        else if(e.kind==='childList') {
          for(const id of e.removed||[]) {const node=this.nodes.get(id);if(node?.parentNode===target) node.remove();}
          for(const data of e.added||[]) {
            this.nodes.get(data.id)?.remove();
            const node=this.build(data), next=this.nodes.get(e.next);target.insertBefore(node,next?.parentNode===target ? next : null);
          }
        }
      } else if(e.type==='input'||e.type==='change') {const target=this.nodes.get(e.target);if(target) target.value='***';}
    }
    fit() {if(!this.width) return;this.scale=Math.min(1,this.frame.parentElement.clientWidth/this.width);this.frame.style.transform=`scale(${this.scale})`;this.frame.parentElement.style.height=(this.height*this.scale)+'px';}
    pointer(x,y) {this.cursor.style.opacity='1';this.cursor.style.transform=`translate(${x*this.scale}px,${y*this.scale}px)`;}
    seek(targetTime) {
      if(!this.events) return;this.pause();this.reset();this.time=Math.max(0,Math.min(targetTime,this.duration));
      while(this.index<this.events.length && this.events[this.index].timestamp<=this.time) this.apply(this.events[this.index++]);
      this.onTime(this.time,this.duration);
    }
    play() {
      if(!this.events||this.playing) return;if(this.time>=this.duration) this.seek(0);
      this.playing=true;let previous=performance.now();
      const tick=now=>{
        if(!this.playing) return;
        this.time=Math.min(this.duration,this.time+(now-previous)*this.speed);previous=now;
        if(this.skip) {
          const nextInteraction=this.events.slice(this.index).find(e=>['mousemove','click','scroll','input','change','resize','visibilitychange'].includes(e.type));
          // Jump to the next interaction, but apply every intervening DOM mutation.
          if(nextInteraction && nextInteraction.timestamp-this.time>3000) this.time=nextInteraction.timestamp;
        }
        while(this.index<this.events.length && this.events[this.index].timestamp<=this.time) this.apply(this.events[this.index++]);
        const prev=this.events[this.index-1],next=this.events[this.index];
        if(prev?.type==='mousemove' && next?.type==='mousemove') {const t=(this.time-prev.timestamp)/(next.timestamp-prev.timestamp||1);this.pointer(prev.x+(next.x-prev.x)*t,prev.y+(next.y-prev.y)*t);}
        this.onTime(this.time,this.duration);
        if(this.time>=this.duration) this.pause();else this.raf=requestAnimationFrame(tick);
      };this.raf=requestAnimationFrame(tick);
    }
    pause() {this.playing=false;cancelAnimationFrame(this.raf);}
  }
  window.SessionPlayer=SessionPlayer;
})();
