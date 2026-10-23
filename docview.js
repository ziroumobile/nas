// Document preview: shows a PDF page by page (pdf.js, served from this site). Word / PowerPoint files are turned into a PDF by the NAS first.
// NASDoc.show(stage, {isCurrent, getPdf}) - getPdf() resolves to the PDF's URL (or throws); isCurrent() is false once the viewer has moved on.
(function () {
  const css = document.createElement('style');
  css.textContent = '.docbox{width:100%;height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:6px 0 96px;box-sizing:border-box}' +
    '.docpg{margin:0 auto 10px;background:#fff;border-radius:3px;box-shadow:0 2px 10px rgba(0,0,0,.35);overflow:hidden}' +
    '.docpg canvas{display:block}' +
    '.docbox .docst{color:#cfd2d8;text-align:center;padding:40px 16px;font-size:15px}';
  document.head.appendChild(css);
  let libP = null;
  const lib = () => libP || (libP = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'pdfjs/pdf.min.js';
    s.onload = () => { try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.min.js'; ok(pdfjsLib); } catch (e) { no(e); } };
    s.onerror = () => { libP = null; no(new Error('pdf.js not loaded')); };
    document.head.appendChild(s);
  }));
  async function show(stage, o) {
    const box = document.createElement('div'); box.className = 'docbox';
    const st = document.createElement('div'); st.className = 'docst'; st.textContent = '載入中…'; box.append(st); stage.append(box);
    const [pdfjs, url] = await Promise.all([lib(), o.getPdf(st)]);
    if (!url || !o.isCurrent()) return;
    const doc = await pdfjs.getDocument({ url, disableRange: true, disableStream: true, isEvalSupported: false, disableFontFace: true }).promise;
    if (!o.isCurrent()) { doc.destroy(); return; }
    st.remove();
    const pages = [], W = () => Math.max(200, Math.min(box.clientWidth - 16, 1000));
    const p1 = await doc.getPage(1), v1 = p1.getViewport({ scale: 1 }), ratio = v1.height / v1.width;
    for (let n = 1; n <= doc.numPages; n++) { const pg = document.createElement('div'); pg.className = 'docpg'; pg.dataset.n = n; pg.style.width = W() + 'px'; pg.style.height = Math.round(W() * ratio) + 'px'; box.append(pg); pages.push(pg); }
    const done = new Set();
    const draw = async pg => {
      const n = +pg.dataset.n; if (done.has(n)) return; done.add(n);
      try {
        const page = n === 1 ? p1 : await doc.getPage(n); if (!o.isCurrent()) return;
        const w = W(), vp0 = page.getViewport({ scale: 1 }), k = w / vp0.width, dpr = Math.min(2, window.devicePixelRatio || 1), vp = page.getViewport({ scale: k * dpr });
        const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        cv.style.width = w + 'px'; cv.style.height = Math.round(vp.height / dpr) + 'px';
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        if (!o.isCurrent()) return;
        pg.style.width = w + 'px'; pg.style.height = cv.style.height; pg.append(cv);
      } catch { done.delete(n); }
    };
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) draw(e.target); }, { root: box, rootMargin: '700px 0px' });
    pages.forEach(pg => io.observe(pg));
  }
  window.NASDoc = { show, OFFICE: /^(docx?|docm|rtf|odt|pptx?|pptm|ppsx|potx)$/i };
})();
