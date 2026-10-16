// iOS "Liquid Glass" segmented switch (列表 / 中圖示 / 小圖示).
// At rest the chosen option has a glass pill under its label. When you press and drag, a real refracting glass lens is rendered in WebGL:
// a fragment shader bends the content under the lens (what is outside its edge is pulled in, with a little colour dispersion), magnifies it,
// adds a lit rim and a drop shadow, and the lens follows the finger on a spring. The lens is opaque and draws its own copy of the switch
// beneath it (a texture painted from the real labels), so nothing is stacked twice. Releasing springs it into the nearest option, which is then
// chosen through the buttons' own click handlers. Only runs on iPhone / iPad (html.ios); without WebGL the pill just follows the finger.
(function () {
  // (runs on every platform; the iOS-only touches are guarded where they differ)
  const DPR = Math.min(window.devicePixelRatio || 1, 2);   // (2 is plenty for a lens this small and keeps the per-frame cost down)
  const GROW = 22, MAG = 1.18, SPAD = 24, TPAD = 28, BEZEL = 15, STMAX = 30;     // lens grows while held; shadow padding; texture padding; width of the curved edge (css px)
  const raf = fn => (document.hidden ? setTimeout(() => fn(performance.now()), 16) : requestAnimationFrame(fn));

  const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  const FS = `precision highp float;
uniform vec2 u_cssRes;uniform float u_dpr;uniform vec4 u_rect;uniform vec2 u_org;uniform vec2 u_texSize;uniform float u_pad;
uniform sampler2D u_tex;uniform float u_mag;uniform float u_bezel;uniform float u_lift;uniform vec3 u_tint;uniform float u_dark;uniform float u_clear;
float sdRR(vec2 p,vec2 hs,float r){vec2 q=abs(p)-hs+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec3 bgSim(vec2 p){   // stand-in for what is behind the bar: the bar itself (dark, with light top/bottom edges) over a lighter page
  float H=u_texSize.y-2.*u_pad;
  float inBar=smoothstep(-1.,1.,p.y)*(1.-smoothstep(H-1.,H+1.,p.y));
  vec3 page=vec3(.30,.31,.34)+vec3(.08)*sin(p.x*.05+1.3);
  vec3 bar=vec3(.15,.16,.18);
  float rimT=exp(-abs(p.y)*.8)*.30,rimB=exp(-abs(p.y-H)*.8)*.22;
  return mix(page,bar,inBar)+vec3(rimT+rimB);
}
float bandf(float dd){float tt=clamp(-dd/u_bezel,0.,1.);float ss=1.-tt;return pow(ss,3.)*u_lift;}
float texA(vec2 seg){vec2 uv=(seg+vec2(u_pad))/u_texSize;return texture2D(u_tex,vec2(uv.x,1.-uv.y)).a;}
vec4 tex4(vec2 seg){vec2 uv=(seg+vec2(u_pad))/u_texSize;return texture2D(u_tex,vec2(uv.x,1.-uv.y));}
vec3 tex(vec2 seg){vec2 uv=(seg+vec2(u_pad))/u_texSize;return texture2D(u_tex,vec2(uv.x,1.-uv.y)).rgb;}
void main(){
  vec2 px=vec2(gl_FragCoord.x,u_cssRes.y*u_dpr-gl_FragCoord.y)/u_dpr;      // css pixels, origin top-left of the canvas
  vec2 hs=u_rect.zw*.5;vec2 c=u_rect.xy+hs;float r=min(hs.x,hs.y);
  vec2 p=px-c;float d=sdRR(p,hs,r);                                         // signed distance to the lens shape (<0 inside)
  float aa=1./u_dpr;
  float inside=1.-smoothstep(-aa,aa,d);
  float shadow=exp(-max(d,0.)/8.)*.30*u_lift*(1.-inside);                   // soft drop shadow outside the lens
  vec4 b4=tex4(u_org+px);vec4 basePre=vec4(b4.rgb*b4.a,b4.a);                // the bar's own labels, drawn here while the lens is up (the DOM ones are hidden)
  if(d>SPADCUT){gl_FragColor=basePre;return;}
  vec2 e=vec2(.75,0.);
  vec2 g=vec2(sdRR(p+e.xy,hs,r)-sdRR(p-e.xy,hs,r),sdRR(p+e.yx,hs,r)-sdRR(p-e.yx,hs,r));g=g/(length(g)+1e-4);   // outward direction
  float t=clamp(-d/u_bezel,0.,1.);float s=1.-t;                             // s=1 at the very edge, 0 once inside the flat middle
  float slope=s*s*(1.+.5*s);                                                // the surface bends mostly near the edge, the middle stays flat
  vec2 centre=u_org+c;vec2 segPos=u_org+px;
  vec2 mp=centre+(segPos-centre)/u_mag;                                     // magnification about the lens centre
  vec2 refr=-g*slope*u_bezel*.50*u_lift;                                    // refraction: content from outside the edge is pulled inwards
  vec3 col;col.r=tex(mp+refr).r;col.g=tex(mp+refr*1.05).g;col.b=tex(mp+refr*1.10).b;   // slight dispersion
  float lightDir0=clamp(dot(g,normalize(vec2(-.55,-.83))),-1.,1.);
  if(u_clear>.5){   // clear glass (dock / switch): a transparent body. The colour comes from the labels themselves being bent and split into R/G/B by the curved edge (like the reference)
    vec2 r1=refr*1.6,r2=refr*1.95,r3=refr*2.4;                                  // the bevel bends content strongly; each colour channel a bit differently
    vec4 cR=tex4(mp+r1),cG=tex4(mp+r2),cB=tex4(mp+r3);
    vec3 body=vec3(cR.r*cR.a,cG.g*cG.a,cB.b*cB.a);
    float ca=max(cR.a,max(cG.a,cB.a));
    float topbot=abs(g.y);
    float darkA=pow(s,2.2)*(.10+.90*topbot)*.34*u_lift;                          // soft dark crescents just inside the top and bottom edge
    float outline=(1.-smoothstep(0.,1.2,-d))*.34*u_lift;                         // thin dark outline
    float edgeL=(1.-smoothstep(0.,1.2,-d))*(.5+.5*lightDir0)*u_lift*.10;          // hairline of light
    float dep=max(-d,0.);
    vec3 rb=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+dep*.08+.22*sin(p.x*.085)));
    float tint=pow(s,2.8)*topbot*u_lift*.14;                                    // a faint green/violet cast along the top and bottom, as on the reference
    vec3 pr=rb*tint+vec3(edgeL);
    float oa=clamp(ca+tint+edgeL+darkA*(1.-ca)+outline*(1.-ca),0.,1.);
    body=body+pr;
    vec4 pre=vec4(body,oa)*inside+basePre*(1.-inside);pre.a=pre.a+shadow*(1.-pre.a);gl_FragColor=pre;return;
  }
  // lighting: bright rim where the light hits (top-left) and the opposite edge, a faint glow inside, a soft sheen on the upper half
  float lightDir=clamp(dot(g,normalize(vec2(-.55,-.83))),-1.,1.);
  float rim=pow(s,3.)*(.30+.70*abs(lightDir))*u_lift;
  float edge=(1.-smoothstep(0.,1.6,-d))*(.55+.45*lightDir)*u_lift;          // hairline highlight right at the edge
  float sheen=smoothstep(.2,-.9,p.y/hs.y)*(1.-s)*.07*u_lift;
  if(u_dark>.5){
    col=col*(1.+.06*u_lift)+vec3(.075*u_lift)                                   // a clearer, lighter body than the page around it
        +vec3((1.-smoothstep(0.,1.7,-d))*(.30+.22*abs(lightDir))*u_lift)        // bright hairline rim, strongest where the light hits
        +vec3(rim*.20);                                                           // soft inner glow where the surface bends
  }else{
    float lit=max(lightDir,0.),shade=max(-lightDir,0.),r3=pow(s,3.);                     // light page: white highlight on the lit side, a soft shade on the other
    col=col*(1.-.22*r3*shade*u_lift-.03*s*u_lift)+vec3(r3*lit*.60*u_lift+edge*lit*.35*u_lift);
    col-=vec3(.10)*(1.-smoothstep(0.,1.3,-d))*u_lift;                                    // hairline so the lens reads against a white page
  }
  gl_FragColor=vec4(col*inside+vec3(0.)*shadow,inside+shadow);
}`.replace('SPADCUT', (SPAD * 0.95).toFixed(1));

  const switches = [];
  const geom = s => (s.active && s.gc) ? s.gc : (s.gc = s.btns.map(b => ({ l: b.offsetLeft, w: b.offsetWidth, t: b.offsetTop, h: b.offsetHeight })));   // cached while the lens is moving: no layout reads per frame
  const selected = s => Math.max(0, s.btns.findIndex(b => b.classList.contains('on')));
  const rrect = (x, X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); };
  const rgb = css => { const m = css.match(/[\d.]+/g) || [0, 0, 0]; return [m[0] / 255, m[1] / 255, m[2] / 255]; };

  function build(seg, isDock) {
    const btns = [...seg.querySelectorAll('button')];
    if (btns.length < 2) return;
    const pill = document.createElement('span'); pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas'); canvas.className = 'seg-gl'; canvas.setAttribute('aria-hidden', 'true');
    seg.append(pill, canvas);
    const s = { seg, btns, pill, canvas, drag: null, active: false, lens: null, gl: null, running: false, lw: 0, lh: 0, hot: -1, dock: !!isDock };
    if (isDock) Object.defineProperty(s, 'btns', { get: () => s._b || (s._b = [...seg.querySelectorAll('button')].filter(b => b.offsetWidth > 0)) });   // admin-only buttons come and go
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
    const u = {}; for (const n of ['u_cssRes', 'u_dpr', 'u_rect', 'u_org', 'u_texSize', 'u_pad', 'u_tex', 'u_mag', 'u_bezel', 'u_lift', 'u_tint', 'u_dark', 'u_clear']) u[n] = gl.getUniformLocation(pr, n);
    const tex = gl.createTexture();
    s.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); s.gl = null; });
    return { gl, u, tex };
  }

  // the dock's labels are SVG icons: render each one (in the wanted colour) to an image once, then reuse it for the lens texture
  function iconImg(s, b, color) {
    const c = b._ic || (b._ic = {}), hit = c[color]; if (hit) return hit.ok ? hit.img : null;
    const cl = b.querySelector('svg').cloneNode(true); cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); cl.setAttribute('width', '27'); cl.setAttribute('height', '27');
    const img = new Image(), e = c[color] = { img, ok: false };
    img.onload = () => { e.ok = true; s.tc = null; makeTexture(s); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(cl).replace(/currentColor/g, color));
    return null;
  }
  // paint what the switch looks like (page, capsule, labels) so the lens can refract it
  function makeTexture(s, force) {
    const g = s.gl; if (!g) return;
    const W = s.seg.clientWidth, H = s.seg.clientHeight, T = TPAD;
    let ckey = null;
    const bi = force != null ? force : (s.active && s.hot >= 0 ? s.hot : selected(s));
    { ckey = bi + '|' + W + 'x' + H + '|' + s.btns.length; s.tc = s.tc || {}; if (s.tc[ckey]) { if (force == null) g.tex = s.tc[ckey]; s.texW = W + 2 * T; s.texH = H + 2 * T; return; } }
    const c = s.tex2d || (s.tex2d = document.createElement('canvas'));
    const cw = Math.ceil((W + 2 * T) * DPR), ch = Math.ceil((H + 2 * T) * DPR); if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (true) x.clearRect(0, 0, W + 2 * T, H + 2 * T);
    else {
      x.fillStyle = getComputedStyle(document.body).backgroundColor || '#111318'; x.fillRect(0, 0, W + 2 * T, H + 2 * T);
      const sc = getComputedStyle(s.seg);
      x.fillStyle = sc.backgroundColor; rrect(x, T, T, W, H, H / 2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; rrect(x, T + .5, T + .5, W - 1, H - 1, H / 2); x.stroke();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    // colours come straight from the CSS variables (not from the buttons' animated colour): white, except the blue one = the option the lens is over
    const root = getComputedStyle(document.documentElement);
    const white = root.getPropertyValue('--seg-fg').trim() || '#fff', blue = root.getPropertyValue('--seg-blue').trim() || '#0a84ff';
    const blueIdx = bi;
    s.btns.forEach((b, i) => {
      const ic = s.dock && b.querySelector('svg');
      if (ic) {
        const col = i === blueIdx ? blue : white, im = iconImg(s, b, col), mx = T + b.offsetLeft + b.offsetWidth / 2, my = T + b.offsetTop + b.offsetHeight / 2, dl = b.querySelector('.dl');
        if (im) x.drawImage(im, mx - 12, my - (dl ? 23 : 12), 24, 24);
        if (dl) { x.font = '600 11px ' + getComputedStyle(dl).fontFamily; x.fillStyle = col; x.fillText(dl.textContent, mx, my + 16); }
        return;
      }
      const cs = getComputedStyle(b);
      x.font = `500 ${cs.fontSize} ${cs.fontFamily}`;
      x.fillStyle = i === blueIdx ? blue : white;
      x.fillText(b.textContent.trim(), T + b.offsetLeft + b.offsetWidth / 2, T + b.offsetTop + b.offsetHeight / 2 + 1);
    });
    const { gl } = g; let tex = g.tex;
    if (ckey) { tex = gl.createTexture(); s.tc[ckey] = tex; if (force == null) g.tex = tex; }
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
    const r = geom(s)[selected(s)], H = r.h + GROW, t = r.t - GROW / 2, segW = s.seg.clientWidth, segH = s.seg.clientHeight;
    const ox = -SPAD, oy = Math.min(t, 0) - SPAD, cssW = Math.ceil(segW + 2 * SPAD), cssH = Math.ceil(Math.max(t + H, segH) - Math.min(t, 0) + 2 * SPAD);   // fixed canvas over the whole bar
    const cv = s.canvas;
    if (cv.width !== Math.round(cssW * DPR) || cv.height !== Math.round(cssH * DPR)) { cv.width = Math.round(cssW * DPR); cv.height = Math.round(cssH * DPR); cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; }
    const st = Math.max(0, L.st || 0), lw = L.w + L.grow + st;
    cv.style.transform = `translate(${ox}px,${oy}px)`;
    const { gl, u } = g;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_cssRes, cssW, cssH); gl.uniform1f(u.u_dpr, DPR);
    gl.uniform4f(u.u_rect, L.cx - lw / 2 - ox, t - oy, lw, H);
    gl.uniform2f(u.u_org, ox, oy); gl.uniform2f(u.u_texSize, s.texW, s.texH); gl.uniform1f(u.u_pad, TPAD);
    gl.uniform1f(u.u_mag, L.mag); gl.uniform1f(u.u_bezel, BEZEL); gl.uniform1f(u.u_lift, Math.min(1, L.grow / GROW));
    gl.uniform3f(u.u_tint, 1, 1, 1);
    gl.uniform1f(u.u_dark, 1); gl.uniform1f(u.u_clear, 1);
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
    s.tc = null; s._b = null; s.gc = null;
    s.lw = s.seg.clientWidth; s.lh = s.seg.clientHeight;
    s.maxW = Math.max(...geom(s).map(g => g.w));
    placePill(s, selected(s), false);
    makeTexture(s);
  }

  // ---------- the lens: springs ----------
  const spring = (cur, vel, target, dt, k, c) => { const a = k * (target - cur) - c * vel; vel += a * dt; return [cur + vel * dt, vel]; };
  function startLens(s) {
    s.gc = null; s.active = false; const r = geom(s)[selected(s)];
    for (let i = 0; i < s.btns.length; i++) makeTexture(s, i);   // all highlight variants are painted/uploaded once, up front
    s.lens = { cx: r.l + r.w / 2, w: r.w, grow: 0, mag: 1, vx: 0, vw: 0, vg: 0, vm: 0, tx: r.l + r.w / 2, tw: r.w, tg: GROW, tm: MAG, st: 0, vst: 0, tst: 0 };
    s.active = true; s.hot = selected(s); s.seg.classList.add('dragging', 'pressing', 'lensing'); setHot(s, s.hot, true);
    makeTexture(s);                                                  // labels as they look right now
    s.pill.classList.add('hidden'); s.canvas.classList.add('on');
    draw(s); loop(s);
  }
  // the option the lens is over turns blue (the others stay white); the lens's own copy of the labels is repainted to match
  function setHot(s, k, quiet) {
    s.hot = k; s.btns.forEach((b, i) => b.classList.toggle('glass-hot', i === k));
    if (!quiet && s.gl) makeTexture(s);
  }
  function trackHot(s, cx) {
    const k = s.nearest(cx); if (k === s.hot) return; setHot(s, k);
    if (s.drag && s.drag.started) {   // dock: the page switches as soon as the lens has rested on a button for a moment, no need to lift the finger
      clearTimeout(s.liveT);
      s.liveT = setTimeout(() => { if (!(s.active && s.hot === k && k !== selected(s))) return;
        raf(() => setTimeout(() => { if (!(s.active && s.hot === k)) return; s.liveK = k; const sc = s.suppressClick; s.suppressClick = false; s.btns[k].click(); s.suppressClick = sc; }, 0));   // the (heavy) page build starts right after a frame has been drawn, not inside it
      }, 120);
    }
  }
  function step(s, dt) {
    const L = s.lens; let moving = false;
    L.tst = (s.drag && s.drag.started) ? Math.min(STMAX, Math.abs(s.vel || 0) * 0.018) : 0; s.vel = (s.vel || 0) * Math.pow(0.03, dt);
    for (const [k, v, t, kk, cc] of [['cx', 'vx', 'tx', 1000, 42], ['w', 'vw', 'tw', 1000, 46], ['grow', 'vg', 'tg', 900, 48], ['mag', 'vm', 'tm', 900, 48], ['st', 'vst', 'tst', 700, 36]]) {
      if (s.drag && s.drag.started && (k === 'cx' || k === 'w')) { L[k] = L[t]; L[v] = 0; continue; }   // follows the finger 1:1 while dragging
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
    s.gc = null; s.seg.classList.remove('pressing', 'lensing'); s.btns.forEach(b => { b._lh = false; b.classList.remove('lens-hide'); });
    const pk = s.pendingK; s.pendingK = null;                        // the (heavy) view switch runs only now, after the lens has landed, so it can't stutter the animation
    if (pk == null) { s.seg.classList.remove('dragging'); setHot(s, -1, true); }
    placePill(s, pk == null ? selected(s) : pk, false); s.pill.classList.remove('hidden');
    if (pk == null) makeTexture(s);
    else { s.seg.classList.remove('dragging'); setHot(s, -1, true); setTimeout(() => { const sc = s.suppressClick; s.suppressClick = false; s.btns[pk].click(); s.suppressClick = sc; }, 90); }
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
      if (e.button > 0) return; s.liveK = null; s.drag = { id: e.pointerId, x0: e.clientX, started: false, t0: Date.now() };
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
      { const now = performance.now(); if (d.lt && now > d.lt) s.vel = .55 * (s.vel || 0) + .45 * ((e.clientX - d.lx) / (now - d.lt) * 1000); d.lx = e.clientX; d.lt = now; }
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
      const wait = s.gl && s.lens ? Math.max(0, 110 - (Date.now() - d.t0)) : 0;   // a quick tap still shows the lens swelling before it lands
      s.suppressClick = true; setTimeout(() => { s.suppressClick = false; }, wait + 80);
      if (wait) { const t = e ? target(e) : null; if (t && s.lens) { s.lens.tx = t.cx; s.lens.tw = t.w; } s.hold = true; setTimeout(() => { s.hold = false; release(k); }, wait); } else release(k);
    };
    const release = k => {
      const changed = k !== selected(s), g = geom(s)[k];
      if (s.gl && s.lens) { s.lens.tx = g.l + g.w / 2; s.lens.tw = g.w; s.lens.tg = 0; s.lens.tm = 1; loop(s); }   // spring into the slot, then finishLens
      else { s.active = false; s.pill.classList.remove('noanim'); seg.classList.remove('dragging'); setHot(s, -1, true); }
      clearTimeout(s.liveT);
      if ((changed || s.dock) && s.liveK !== k) { if (s.lens) s.pendingK = k; else { const sc = s.suppressClick; s.suppressClick = false; s.btns[k].click(); s.suppressClick = sc; } }                                // choose through the normal handler
      if (!s.lens) placePill(s, selected(s), true);
    };
    seg.addEventListener('pointerup', end); seg.addEventListener('pointercancel', end);
    setInterval(() => { if (!s.active && !s.drag) seg.classList.remove('lensing'); }, 400);   // safety net: a hidden icon can never stay hidden
    seg.addEventListener('click', e => { if (s.suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // called by the page whenever the selected option changed (a tap, or any other code)
  window.glassSegSync = () => switches.forEach(s => { if (s.active) return; placePill(s, selected(s), true); makeTexture(s); });

  const init = () => {
    document.querySelectorAll('.seg').forEach(x => build(x));
    const dk = document.getElementById('dock');
    if (dk) {
      const s = build(dk, true);
      if (s) { const root = getComputedStyle(document.documentElement); for (const col of [root.getPropertyValue('--seg-fg').trim() || '#fff', root.getPropertyValue('--seg-blue').trim() || '#0a84ff']) s.btns.forEach(b => b.querySelector('svg') && iconImg(s, b, col));   // decode the icons ahead of time so the lens never shows an empty frame
      }
      if (s) { let t = 0; new MutationObserver(() => { if (s.active || t) return; t = setTimeout(() => { t = 0; if (!s.active) { s._b = null; s.gc = null; s.tc = null; s.btns.forEach(b => { b._lh = false; b.classList.remove('lens-hide'); }); placePill(s, selected(s), true); makeTexture(s); } }, 0); }).observe(dk, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] }); }
    }
  };
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
    const below = innerHeight - r.bottom - 14, above = r.top - 14;   // a long list is capped to the room on the roomier side and scrolls inside itself
    let up = h > below && above > below, room = up ? above : below;
    m.style.maxHeight = Math.max(120, room) + 'px'; m.style.overflowY = 'auto'; m.style.overscrollBehavior = 'contain'; m.style.touchAction = 'pan-y'; m.style.webkitOverflowScrolling = 'touch';
    const h2 = m.offsetHeight, top = up ? r.top - h2 - 6 : r.bottom + 6;
    m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.transformOrigin = (up ? 'bottom ' : 'top ') + Math.max(20, r.left + r.width / 2 - left) + 'px';
  }
  {   // dark drop-down menus on every platform (the native list is white on Windows)
    document.addEventListener('pointerdown', e => {                  // grey flash on touch, long enough to see even on a quick tap
      if (!document.documentElement.classList.contains('ios')) return;
      const b = e.target.closest && e.target.closest('button,a.btn,select'); if (!b || b.closest('.seg')) return;
      b.classList.add('gpress'); const t0 = Date.now();
      const off = () => { document.removeEventListener('pointerup', off, true); document.removeEventListener('pointercancel', off, true); setTimeout(() => b.classList.remove('gpress'), Math.max(0, 180 - (Date.now() - t0))); };
      document.addEventListener('pointerup', off, true); document.addEventListener('pointercancel', off, true);
    }, true);
    const stop = e => { const t = e.target.closest && e.target.closest('select'); if (t) { e.preventDefault(); if (e.type === 'click') { e.stopPropagation(); gm ? closeMenu() : openMenu(t); } } };
    ['mousedown', 'click'].forEach(ev => document.addEventListener(ev, stop, { capture: true, passive: false }));   // (not touchstart/pointerdown: cancelling those would swallow the click)
    document.addEventListener('pointerdown', e => { if (gm && !e.target.closest('.gmenu') && !e.target.closest('select')) closeMenu(); }, true);
    addEventListener('scroll', e => { if (e.target && e.target.closest && e.target.closest('.gmenu')) return; closeMenu(); }, true);   // scrolling the menu itself must not close it
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  addEventListener('resize', () => switches.forEach(s => { if (!s.active) relayout(s); }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => switches.forEach(s => { if (!s.active) relayout(s); }));
  window.__glass = { switches, step: (dt, n = 1) => switches.forEach(s => { if (s.lens) for (let i = 0; i < n; i++) { step(s, dt); } if (s.lens) draw(s); }), draw: () => switches.forEach(draw), geom }; // test hooks
})();
