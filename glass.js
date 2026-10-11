// iOS "Liquid Glass" segmented switch (列表 / 中圖示 / 小圖示).
// At rest the chosen option has a glass pill under its label. When you press and drag, a real refracting glass lens is rendered in WebGL:
// a fragment shader bends the content under the lens (what is outside its edge is pulled in, with a little colour dispersion), magnifies it,
// adds a lit rim and a drop shadow, and the lens follows the finger on a spring. The lens is opaque and draws its own copy of the switch
// beneath it (a texture painted from the real labels), so nothing is stacked twice. Releasing springs it into the nearest option, which is then
// chosen through the buttons' own click handlers. Only runs on iPhone / iPad (html.ios); without WebGL the pill just follows the finger.
(function () {
  if (!document.documentElement.classList.contains('ios')) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  const GROW = 22, MAG = 1.18, SPAD = 24, TPAD = 28, BEZEL = 15;     // lens grows while held; shadow padding; texture padding; width of the curved edge (css px)
  const raf = fn => (document.hidden ? setTimeout(() => fn(performance.now()), 16) : requestAnimationFrame(fn));

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `precision highp float;
uniform vec2 u_cssRes;uniform float u_dpr;uniform vec4 u_rect;uniform vec2 u_org;uniform vec2 u_texSize;uniform float u_pad;
uniform sampler2D u_tex;uniform float u_mag;uniform float u_bezel;uniform float u_lift;uniform vec3 u_tint;uniform float u_dark;
float sdRR(vec2 p,vec2 hs,float r){vec2 q=abs(p)-hs+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec3 tex(vec2 seg){vec2 uv=(seg+vec2(u_pad))/u_texSize;return texture2D(u_tex,vec2(uv.x,1.-uv.y)).rgb;}
void main(){
  vec2 px=vec2(gl_FragCoord.x,u_cssRes.y*u_dpr-gl_FragCoord.y)/u_dpr;      // css pixels, origin top-left of the canvas
  vec2 hs=u_rect.zw*.5;vec2 c=u_rect.xy+hs;float r=min(hs.x,hs.y);
  vec2 p=px-c;float d=sdRR(p,hs,r);                                         // signed distance to the lens shape (<0 inside)
  float aa=1./u_dpr;
  float inside=1.-smoothstep(-aa,aa,d);
  float shadow=exp(-max(d,0.)/8.)*.42*u_lift*(1.-inside);                   // soft drop shadow outside the lens
  if(d>SPADCUT){gl_FragColor=vec4(0.);return;}
  vec2 e=vec2(.75,0.);
  vec2 g=vec2(sdRR(p+e.xy,hs,r)-sdRR(p-e.xy,hs,r),sdRR(p+e.yx,hs,r)-sdRR(p-e.yx,hs,r));g=g/(length(g)+1e-4);   // outward direction
  float t=clamp(-d/u_bezel,0.,1.);float s=1.-t;                             // s=1 at the very edge, 0 once inside the flat middle
  float slope=s*s*(1.+.5*s);                                                // the surface bends mostly near the edge, the middle stays flat
  vec2 centre=u_org+c;vec2 segPos=u_org+px;
  vec2 mp=centre+(segPos-centre)/u_mag;                                     // magnification about the lens centre
  vec2 refr=-g*slope*u_bezel*.50*u_lift;                                    // refraction: content from outside the edge is pulled inwards
  vec3 col;col.r=tex(mp+refr).r;col.g=tex(mp+refr*1.05).g;col.b=tex(mp+refr*1.10).b;   // slight dispersion
  // lighting: bright rim where the light hits (top-left) and the opposite edge, a faint glow inside, a soft sheen on the upper half
  float lightDir=clamp(dot(g,normalize(vec2(-.55,-.83))),-1.,1.);
  float rim=pow(s,3.)*(.30+.70*abs(lightDir))*u_lift;
  float edge=(1.-smoothstep(0.,1.6,-d))*(.55+.45*lightDir)*u_lift;          // hairline highlight right at the edge
  float sheen=smoothstep(.2,-.9,p.y/hs.y)*(1.-s)*.07*u_lift;
  if(u_dark>.5){
    col=col*(1.+.04*u_lift)+u_tint*(.02*u_lift)+vec3(rim*.50+edge*.55+sheen);            // dark page: light rim on the glass
  }else{
    float lit=max(lightDir,0.),shade=max(-lightDir,0.),r3=pow(s,3.);                     // light page: white highlight on the lit side, a soft shade on the other
    col=col*(1.-.22*r3*shade*u_lift-.03*s*u_lift)+vec3(r3*lit*.60*u_lift+edge*lit*.35*u_lift);
    col-=vec3(.10)*(1.-smoothstep(0.,1.3,-d))*u_lift;                                    // hairline so the lens reads against a white page
  }
  gl_FragColor=vec4(col*inside+vec3(0.)*shadow,inside+shadow);
}`.replace('SPADCUT', (SPAD * 0.95).toFixed(1));

  const switches = [];
  const geom = s => s.btns.map(b => ({ l: b.offsetLeft, w: b.offsetWidth, t: b.offsetTop, h: b.offsetHeight }));
  const selected = s => Math.max(0, s.btns.findIndex(b => b.classList.contains('on')));
  const rrect = (x, X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); };
  const rgb = css => { const m = css.match(/[\d.]+/g) || [0, 0, 0]; return [m[0] / 255, m[1] / 255, m[2] / 255]; };

  function build(seg) {
    const btns = [...seg.querySelectorAll('button')];
    if (btns.length < 2) return;
    const pill = document.createElement('span'); pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas'); canvas.className = 'seg-gl'; canvas.setAttribute('aria-hidden', 'true');
    seg.append(pill, canvas);
    const s = { seg, btns, pill, canvas, drag: null, active: false, lens: null, gl: null, running: false, lw: 0, lh: 0, hot: -1 };
    s.nearest = cx => { const c = geom(s).map(g => g.l + g.w / 2); let k = 0; c.forEach((v, i) => { if (Math.abs(v - cx) < Math.abs(c[k] - cx)) k = i; }); return k; };
    s.gl = initGL(s);
    switches.push(s); wire(s);
    if ('ResizeObserver' in window) new ResizeObserver(() => {   // also fires when the (initially hidden) page appears
      if (s.active) return;                                       // never re-lay-out under the finger
      const w = seg.clientWidth, h = seg.clientHeight;
      if (Math.abs(w - s.lw) < 1 && Math.abs(h - s.lh) < 1) return;
      relayout(s);
    }).observe(seg);
    relayout(s);
    return s;
  }

  // ---------- WebGL ----------
  function initGL(s) {
    let gl = null;
    try { gl = s.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }) || s.canvas.getContext('experimental-webgl'); } catch { }
    if (!gl) return null;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn('glass shader:', gl.getShaderInfoLog(o)); return null; } return o; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {}; for (const n of ['u_cssRes', 'u_dpr', 'u_rect', 'u_org', 'u_texSize', 'u_pad', 'u_tex', 'u_mag', 'u_bezel', 'u_lift', 'u_tint', 'u_dark']) u[n] = gl.getUniformLocation(pr, n);
    const tex = gl.createTexture();
    s.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); s.gl = null; });
    return { gl, u, tex };
  }

  // paint what the switch looks like (page, capsule, labels) so the lens can refract it
  function makeTexture(s) {
    const g = s.gl; if (!g) return;
    const W = s.seg.clientWidth, H = s.seg.clientHeight, T = TPAD;
    const c = s.tex2d || (s.tex2d = document.createElement('canvas'));
    c.width = Math.ceil((W + 2 * T) * DPR); c.height = Math.ceil((H + 2 * T) * DPR);
    const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0);
    x.fillStyle = getComputedStyle(document.body).backgroundColor || '#111318'; x.fillRect(0, 0, W + 2 * T, H + 2 * T);
    const sc = getComputedStyle(s.seg);
    x.fillStyle = sc.backgroundColor; rrect(x, T, T, W, H, H / 2); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; rrect(x, T + .5, T + .5, W - 1, H - 1, H / 2); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    // colours come straight from the CSS variables (not from the buttons' animated colour): white, except the blue one = the option the lens is over
    const root = getComputedStyle(document.documentElement);
    const white = root.getPropertyValue('--seg-fg').trim() || '#fff', blue = root.getPropertyValue('--seg-blue').trim() || '#0a84ff';
    const blueIdx = s.active && s.hot >= 0 ? s.hot : selected(s);
    s.btns.forEach((b, i) => {
      const cs = getComputedStyle(b);
      x.font = `500 ${cs.fontSize} ${cs.fontFamily}`;
      x.fillStyle = i === blueIdx ? blue : white;
      x.fillText(b.textContent.trim(), T + b.offsetLeft + b.offsetWidth / 2, T + b.offsetTop + b.offsetHeight / 2 + 1);
    });
    const { gl, tex } = g;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    s.texW = W + 2 * T; s.texH = H + 2 * T;
  }

  // draw the lens for the current state (cx = centre x, w = width, grow = extra size while held, mag, lift = strength 0..1)
  function draw(s) {
    const g = s.gl, L = s.lens; if (!g || !L) return;
    const r = geom(s)[selected(s)], H = r.h + GROW, t = r.t - GROW / 2;
    const cssW = Math.ceil(s.maxW + GROW + 2 * SPAD), cssH = Math.ceil(H + 2 * SPAD);
    const cv = s.canvas;
    if (cv.width !== Math.round(cssW * DPR) || cv.height !== Math.round(cssH * DPR)) { cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR); cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; }
    const ox = L.cx - (L.w + L.grow) / 2 - SPAD, oy = t - SPAD;          // canvas origin in switch coordinates
    cv.style.transform = `translate(${ox}px,${oy}px)`;
    const { gl, u } = g;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_cssRes, cssW, cssH); gl.uniform1f(u.u_dpr, DPR);
    gl.uniform4f(u.u_rect, SPAD, SPAD, L.w + L.grow, H);
    gl.uniform2f(u.u_org, ox, oy); gl.uniform2f(u.u_texSize, s.texW, s.texH); gl.uniform1f(u.u_pad, TPAD);
    gl.uniform1f(u.u_mag, L.mag); gl.uniform1f(u.u_bezel, BEZEL); gl.uniform1f(u.u_lift, Math.min(1, L.grow / GROW));
    gl.uniform3f(u.u_tint, 1, 1, 1);
    gl.uniform1f(u.u_dark, window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.uniform1i(u.u_tex, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------- layout / pill ----------
  function placePill(s, i, animate) {
    const r = geom(s)[i]; if (!r || !r.w) return;
    const p = s.pill; if (!animate) p.classList.add('noanim');
    p.style.transform = `translate(${r.l}px,${r.t}px)`; p.style.width = r.w + 'px'; p.style.height = r.h + 'px';
    if (!animate) { p.getBoundingClientRect(); p.classList.remove('noanim'); }
  }
  function relayout(s) {
    s.lw = s.seg.clientWidth; s.lh = s.seg.clientHeight;
    s.maxW = Math.max(...geom(s).map(g => g.w));
    placePill(s, selected(s), false);
    makeTexture(s);
  }

  // ---------- the lens: springs ----------
  const spring = (cur, vel, target, dt, k, c) => { const a = k * (target - cur) - c * vel; vel += a * dt; return [cur + vel * dt, vel]; };
  function startLens(s) {
    const r = geom(s)[selected(s)];
    s.lens = { cx: r.l + r.w / 2, w: r.w, grow: 0, mag: 1, vx: 0, vw: 0, vg: 0, vm: 0, tx: r.l + r.w / 2, tw: r.w, tg: GROW, tm: MAG };
    s.active = true; s.hot = selected(s); s.seg.classList.add('dragging'); setHot(s, s.hot, true);
    makeTexture(s);                                                  // labels as they look right now
    s.pill.classList.add('hidden'); s.canvas.classList.add('on');
    draw(s); loop(s);
  }
  // the option the lens is over turns blue (the others stay white); the lens's own copy of the labels is repainted to match
  function setHot(s, k, quiet) {
    s.hot = k; s.btns.forEach((b, i) => b.classList.toggle('glass-hot', i === k));
    if (!quiet && s.gl) makeTexture(s);
  }
  function trackHot(s, cx) { const k = s.nearest(cx); if (k !== s.hot) setHot(s, k); }
  function step(s, dt) {
    const L = s.lens; let moving = false;
    for (const [k, v, t, kk, cc] of [['cx', 'vx', 'tx', 520, 38], ['w', 'vw', 'tw', 520, 38], ['grow', 'vg', 'tg', 900, 48], ['mag', 'vm', 'tm', 900, 48]]) {
      [L[k], L[v]] = spring(L[k], L[v], L[t], dt, kk, cc);
      if (Math.abs(L[t] - L[k]) > (k === 'mag' ? 0.002 : 0.25) || Math.abs(L[v]) > (k === 'mag' ? 0.02 : 4)) moving = true;
    }
    L.grow = Math.max(0, L.grow); return moving;
  }
  function loop(s) {
    if (s.running) return; s.running = true; let last = performance.now();
    const frame = now => {
      const dt = Math.min(0.034, Math.max(0.001, (now - last) / 1000)); last = now;
      const moving = step(s, dt); trackHot(s, s.lens.cx); draw(s);
      if (moving || s.drag || s.hold) raf(frame); else { s.running = false; finishLens(s); }
    };
    raf(frame);
  }
  function finishLens(s) {                                           // lens has settled into its option: swap back to the resting pill
    s.canvas.classList.remove('on'); s.active = false; s.lens = null;
    s.seg.classList.remove('dragging'); setHot(s, -1, true);
    placePill(s, selected(s), false); s.pill.classList.remove('hidden');
    makeTexture(s);
  }

  // ---------- interaction ----------
  function wire(s) {
    const { seg } = s;
    const centres = () => geom(s).map(g => g.l + g.w / 2);
    const nearest = cx => { const c = centres(); let k = 0; c.forEach((v, i) => { if (Math.abs(v - cx) < Math.abs(c[k] - cx)) k = i; }); return k; };
    const target = e => {                                            // where the lens should be for this finger position
      const rect = seg.getBoundingClientRect(), g = geom(s), c = g.map(v => v.l + v.w / 2);
      const fx = Math.min(Math.max(e.clientX - rect.left - seg.clientLeft, c[0]), c[c.length - 1]);
      let i = 0; while (i < c.length - 2 && fx > c[i + 1]) i++;
      const t = (fx - c[i]) / ((c[i + 1] - c[i]) || 1);
      return { cx: fx, w: g[i].w + (g[i + 1].w - g[i].w) * t };      // between two options the lens stretches to blend their widths
    };
    seg.addEventListener('pointerdown', e => {
      if (e.button > 0) return; s.drag = { id: e.pointerId, x0: e.clientX, started: false, t0: Date.now() };
      if (!s.gl) return;
      s.drag.started = true;   // the lens swells the moment it is touched, no drag needed
      if (!s.active) startLens(s);
      const t = target(e); s.lens.tx = t.cx; s.lens.tw = t.w; s.lens.tg = GROW; s.lens.tm = MAG; if (!s.running) loop(s);
    });
    seg.addEventListener('pointermove', e => {
      const d = s.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.started) {
        if (Math.abs(e.clientX - d.x0) < 5) return;
        d.started = true; try { seg.setPointerCapture(e.pointerId); } catch { }
        if (s.gl) { if (!s.active) startLens(s); else if (s.lens) { s.lens.tg = GROW; s.lens.tm = MAG; } }
        else { s.active = true; s.pill.classList.add('noanim'); seg.classList.add('dragging'); }
      }
      const t = target(e);
      if (s.gl && s.lens) { s.lens.tx = t.cx; s.lens.tw = t.w; s.lens.tg = GROW; s.lens.tm = MAG; if (!s.running) loop(s); }
      else { const r = geom(s)[0]; s.pill.style.transform = `translate(${t.cx - t.w / 2}px,${r.t}px)`; s.pill.style.width = t.w + 'px'; trackHot(s, t.cx); }  // no WebGL: the pill follows the finger
    });
    const end = e => {
      const d = s.drag; if (!d || (e && e.pointerId !== d.id)) return;
      s.drag = null;
      if (!d.started) return;                                        // a plain tap: the button's own click does the work
      const rect = seg.getBoundingClientRect();
      const k = e && e.type === 'pointerup' ? nearest(e.clientX - rect.left - seg.clientLeft) : selected(s);
      const wait = s.gl && s.lens ? Math.max(0, 170 - (Date.now() - d.t0)) : 0;   // a quick tap still shows the lens swelling before it lands
      s.suppressClick = true; setTimeout(() => { s.suppressClick = false; }, wait + 80);
      if (wait) { const t = e ? target(e) : null; if (t && s.lens) { s.lens.tx = t.cx; s.lens.tw = t.w; } s.hold = true; setTimeout(() => { s.hold = false; release(k); }, wait); } else release(k);
    };
    const release = k => {
      const changed = k !== selected(s), g = geom(s)[k];
      if (s.gl && s.lens) { s.lens.tx = g.l + g.w / 2; s.lens.tw = g.w; s.lens.tg = 0; s.lens.tm = 1; loop(s); }   // spring into the slot, then finishLens
      else { s.active = false; s.pill.classList.remove('noanim'); seg.classList.remove('dragging'); setHot(s, -1, true); }
      if (changed) s.btns[k].click();                                // choose through the normal handler
      if (!s.lens) placePill(s, selected(s), true);
    };
    seg.addEventListener('pointerup', end); seg.addEventListener('pointercancel', end);
    seg.addEventListener('click', e => { if (s.suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // called by the page whenever the selected option changed (a tap, or any other code)
  window.glassSegSync = () => switches.forEach(s => { if (s.active) return; placePill(s, selected(s), true); makeTexture(s); });

  const init = () => document.querySelectorAll('.seg').forEach(build);
  // ---------- drop-down menus (replace the native <select> list, which iOS draws far from the button) ----------
  let gm = null;
  function closeMenu() { if (!gm) return; const m = gm; gm = null; m.classList.add('out'); setTimeout(() => m.remove(), 170); }
  function openMenu(sel) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'gmenu'; gm = m;
    [...sel.options].forEach(o => {
      const d = document.createElement('div'); d.textContent = o.textContent; if (o.value === sel.value) d.className = 'cur';
      d.addEventListener('click', e => { e.stopPropagation(); if (sel.value !== o.value) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } closeMenu(); });
      m.appendChild(d);
    });
    document.body.appendChild(m);
    const r = sel.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    let top = r.bottom + 6, up = false; if (top + h > innerHeight - 8 && r.top - h - 6 > 8) { top = r.top - h - 6; up = true; }
    m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.transformOrigin = (up ? 'bottom ' : 'top ') + Math.max(20, r.left + r.width / 2 - left) + 'px';
  }
  if (document.documentElement.classList.contains('ios')) {
    document.addEventListener('pointerdown', e => {                  // grey flash on touch, long enough to see even on a quick tap
      const b = e.target.closest && e.target.closest('button,a.btn,select'); if (!b || b.closest('.seg')) return;
      b.classList.add('gpress'); const t0 = Date.now();
      const off = () => { document.removeEventListener('pointerup', off, true); document.removeEventListener('pointercancel', off, true); setTimeout(() => b.classList.remove('gpress'), Math.max(0, 180 - (Date.now() - t0))); };
      document.addEventListener('pointerup', off, true); document.addEventListener('pointercancel', off, true);
    }, true);
    const stop = e => { const t = e.target.closest && e.target.closest('select'); if (t) { e.preventDefault(); if (e.type === 'click') { e.stopPropagation(); gm ? closeMenu() : openMenu(t); } } };
    ['mousedown', 'click'].forEach(ev => document.addEventListener(ev, stop, { capture: true, passive: false }));   // (not touchstart/pointerdown: cancelling those would swallow the click)
    document.addEventListener('pointerdown', e => { if (gm && !e.target.closest('.gmenu') && !e.target.closest('select')) closeMenu(); }, true);
    addEventListener('scroll', closeMenu, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  addEventListener('resize', () => switches.forEach(s => { if (!s.active) relayout(s); }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => switches.forEach(s => { if (!s.active) relayout(s); }));
  window.__glass = { switches, step: (dt, n = 1) => switches.forEach(s => { if (s.lens) for (let i = 0; i < n; i++) { step(s, dt); } if (s.lens) draw(s); }), draw: () => switches.forEach(draw), geom }; // test hooks
})();
