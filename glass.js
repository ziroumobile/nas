// iOS "Liquid Glass" segmented switch (列表 / 中圖示 / 小圖示): a glass lens sits over the chosen option, can be dragged with a finger,
// and magnifies the labels under it in real time. Only runs on iPhone / iPad (html.ios); everywhere else the buttons just work as buttons.
// Choosing still goes through the buttons' own click handlers, so nothing else in the page needs to know about the lens.
(function () {
  if (!document.documentElement.classList.contains('ios')) return;
  const switches = [];
  const GROW = 8, MAG = 1.22;                       // while held, the lens grows a little and magnifies what is under it
  const ease = 'cubic-bezier(.2,.9,.3,1.25)';

  function build(seg) {
    const btns = [...seg.querySelectorAll('button')];
    if (btns.length < 2) return;
    const thumb = document.createElement('span'); thumb.className = 'seg-thumb'; thumb.setAttribute('aria-hidden', 'true');
    const lens = document.createElement('span'); lens.className = 'seg-lens';
    thumb.append(lens); seg.append(thumb);
    const s = { seg, btns, thumb, lens, drag: null, down: false };
    switches.push(s);
    // build the lens copy of the labels (text only) and keep geometry in sync with the real buttons
    s.rebuild = () => {
      lens.style.width = seg.clientWidth + 'px'; lens.style.height = seg.clientHeight + 'px';
      lens.innerHTML = '';
      for (const b of btns) {
        const l = document.createElement('span'); l.className = 'll'; l.textContent = b.textContent.trim();
        Object.assign(l.style, { left: b.offsetLeft + 'px', top: b.offsetTop + 'px', width: b.offsetWidth + 'px', height: b.offsetHeight + 'px' });
        lens.append(l);
      }
    };
    wire(s);
    if ('ResizeObserver' in window) new ResizeObserver(() => {   // also fires when the (initially hidden) page appears
      if (s.drag && s.drag.active) return;                       // never re-lay-out under the finger
      const w = seg.clientWidth, h = seg.clientHeight;
      if (Math.abs(w - (s.lw || 0)) < 1 && Math.abs(h - (s.lh || 0)) < 1) return; // not a real size change
      relayout(s);
    }).observe(seg);
    relayout(s);
  }

  const geom = s => s.btns.map(b => ({ l: b.offsetLeft, w: b.offsetWidth, t: b.offsetTop, h: b.offsetHeight }));
  const selected = s => Math.max(0, s.btns.findIndex(b => b.classList.contains('on')));

  // put the lens at x (left edge), width w, over a button row at t/h; grow>0 inflates it, mag>1 magnifies the labels under it
  function place(s, x, w, t, h, grow, mag) {
    const gx = x - grow / 2, gt = t - grow / 2, cx = x + w / 2, cy = t + h / 2;
    const th = s.thumb.style, ls = s.lens.style;
    th.transform = `translate(${gx}px,${gt}px)`; th.width = (w + grow) + 'px'; th.height = (h + grow) + 'px';
    ls.transformOrigin = `${cx}px ${cy}px`;
    ls.transform = `translate(${-gx}px,${-gt}px) scale(${mag})`;   // cancels the lens's own movement, then magnifies about its centre
    th.setProperty('--glint', Math.round((cx / Math.max(1, s.seg.clientWidth)) * 100) + '%');
  }
  function snap(s, i, animate) {
    const g = geom(s)[i]; if (!g || !g.w) return;
    if (!animate) { s.thumb.classList.add('noanim'); }
    place(s, g.l, g.w, g.t, g.h, 0, 1);
    if (!animate) { s.thumb.getBoundingClientRect(); s.thumb.classList.remove('noanim'); }
  }
  function relayout(s) { s.lw = s.seg.clientWidth; s.lh = s.seg.clientHeight; s.rebuild(); snap(s, selected(s), false); }

  function wire(s) {
    const { seg, thumb } = s;
    const centres = () => geom(s).map(g => g.l + g.w / 2);
    const nearest = cx => { const c = centres(); let k = 0; c.forEach((v, i) => { if (Math.abs(v - cx) < Math.abs(c[k] - cx)) k = i; }); return k; };
    const hot = k => s.btns.forEach((b, i) => b.classList.toggle('glass-hot', i === k));

    seg.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      s.drag = { id: e.pointerId, x0: e.clientX, active: false };
    });
    seg.addEventListener('pointermove', e => {
      const d = s.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.active) {
        if (Math.abs(e.clientX - d.x0) < 5) return;
        d.active = true; try { seg.setPointerCapture(e.pointerId); } catch { }
        thumb.classList.remove('drag'); // first move glides to the finger, then it tracks 1:1
        s.glide = true; setTimeout(() => { s.glide = false; thumb.classList.add('drag'); }, 130);
      }
      const rect = seg.getBoundingClientRect(), g = geom(s), c = g.map(v => v.l + v.w / 2);
      const fx = Math.min(Math.max(e.clientX - rect.left - seg.clientLeft, c[0]), c[c.length - 1]); // lens centre follows the finger, kept inside the switch
      let i = 0; while (i < c.length - 2 && fx > c[i + 1]) i++;
      const t = (fx - c[i]) / ((c[i + 1] - c[i]) || 1);                // between two options: blend their widths so the lens stretches
      const w = g[i].w + (g[i + 1].w - g[i].w) * t;
      place(s, fx - w / 2, w, g[i].t, g[i].h, GROW, MAG);
      hot(nearest(fx));
    });
    const end = e => {
      const d = s.drag; if (!d || (e && e.pointerId !== d.id)) return;
      s.drag = null; thumb.classList.remove('drag'); s.glide = false;
      if (!d.active) return;                                          // a plain tap: the button's own click does the work
      const rect = seg.getBoundingClientRect();
      const k = e && e.type === 'pointerup' ? nearest(e.clientX - rect.left - seg.clientLeft) : selected(s);
      hot(-1);
      const changed = k !== selected(s);
      snap(s, k, true);                                               // settles into the slot with a little overshoot
      if (changed) s.btns[k].click();                                 // switches the view through the normal handler
      s.suppressClick = true; setTimeout(() => { s.suppressClick = false; }, 60); // the browser's own trailing click after a drag must not toggle anything
    };
    seg.addEventListener('pointerup', end); seg.addEventListener('pointercancel', end);
    seg.addEventListener('click', e => { if (s.suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // called by the page whenever the selected option changed (a tap, or any other code)
  window.glassSegSync = () => switches.forEach(s => { if (!s.drag || !s.drag.active) snap(s, selected(s), true); });

  const init = () => document.querySelectorAll('.seg').forEach(build);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  addEventListener('resize', () => switches.forEach(relayout));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => switches.forEach(relayout));
})();
