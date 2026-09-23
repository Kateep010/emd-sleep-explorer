/* app.js — wires the EMD library and charts to the page sections. */
(function () {
  'use strict';
  const FS = 100;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const EPOCHS = window.SLEEP_EPOCHS.epochs;
  const STAGES = {
    W: { label: '清醒 W', color: '--s1', shape: 'circle' }, N1: { label: 'N1', color: '--s2', shape: 'square' },
    N2: { label: 'N2', color: '--s3', shape: 'triangle' }, N3: { label: 'N3', color: '--s4', shape: 'diamond' }, REM: { label: 'REM', color: '--s5', shape: 'cross' },
  };
  const BAND_LABEL = { slow: '< 0.5 Hz', delta: 'δ 0.5–4', theta: 'θ 4–8', alpha: 'α 8–12', sigma: 'σ 12–16', beta: 'β 16–30', gamma: '> 30 Hz' };
  const tAxis = n => Float64Array.from({ length: n }, (_, i) => i / FS);
  const fmt1 = v => v.toFixed(1), fmt2 = v => v.toFixed(2), pct = v => (100 * v).toFixed(1) + ' %';
  const sub = (x, n) => x.subarray ? x.subarray(0, n) : x.slice(0, n);

  /* ---------------- theme ---------------- */
  try { const saved = localStorage.getItem('theme'); if (saved) document.documentElement.dataset.theme = saved; } catch (e) { /* private mode */ }
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
    Charts.redrawAll(); document.dispatchEvent(new Event('themechange'));
  });

  /* ---------------- hero wave (real N2 epoch + first 3 IMFs, scrolling) ---------------- */
  (function () {
    const cv = $('#hero-wave'); if (!cv) return; const ctx = cv.getContext('2d');
    const ep = EPOCHS.find(e => e.stage === 'N2') || EPOCHS[0]; const x = Float64Array.from(ep.eeg); const dec = EMD.emd(x);
    const layers = [{ y: x, color: '--s1', w: 1.6, a: .9 }, { y: dec.imfs[0], color: '--s3', w: 1.2, a: .7 }, { y: dec.imfs[1], color: '--s2', w: 1.2, a: .7 }, { y: dec.imfs[2], color: '--s7', w: 1.2, a: .7 }];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; let off = 0, raf = 0;
    function draw() {
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const n = x.length, span = 1200, base = [0.42, 0.62, 0.74, 0.86], amp = [0.16, 0.06, 0.06, 0.06];
      layers.forEach((L, li) => { let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(L.y[i])); const sc = amp[li] * H / (mx || 1);
        ctx.strokeStyle = Charts.tok(L.color); ctx.globalAlpha = L.a; ctx.lineWidth = L.w; ctx.beginPath();
        for (let px = 0; px <= W; px += 2) { const i = (Math.floor(off + px / W * span) % n + n) % n; const yy = base[li] * H - L.y[i] * sc; px === 0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy); } ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    function loop() { off += 0.6; draw(); raf = requestAnimationFrame(loop); }
    draw(); if (!reduce) { const io = new IntersectionObserver(en => { if (en[0].isIntersecting) { if (!raf) raf = requestAnimationFrame(loop); } else { cancelAnimationFrame(raf); raf = 0; } }); io.observe(cv); }
    window.addEventListener('resize', draw); document.addEventListener('themechange', draw);
  })();

  /* ---------------- 01 why ---------------- */
  const whySig = new Charts.LineChart($('#why-signal'), { height: 150 });
  const whySpec = new Charts.LineChart($('#why-spectrum'), { height: 170 });
  const whyIF = new Charts.LineChart($('#why-if'), { height: 170 });
  function drawWhy() {
    const eps = +$('#why-eps').value; $('#why-eps-val').textContent = eps.toFixed(2);
    const n = 2000, t = tAxis(n);
    const x = Float64Array.from(t, tt => Math.cos(2 * Math.PI * tt + eps * Math.sin(2 * Math.PI * tt)));
    whySig.setData({ series: [{ x: sub(t, 500), y: sub(x, 500), color: '--s1', label: 'x(t)' }], xLabel: '時間 (s)', yLabel: '振幅', xName: 't', xUnit: ' s', ylim: [-1.3, 1.3], yFmt: fmt2 });
    const ps = EMD.powerSpectrum(x, FS, 5); let pmax = 0; for (const v of ps.power) pmax = Math.max(pmax, v);
    whySpec.setData({ series: [{ x: ps.freq, y: Float64Array.from(ps.power, v => Math.max(-60, 10 * Math.log10(v / pmax + 1e-12))), color: '--s2', label: '相對功率' }], xLabel: '頻率 (Hz)', yLabel: 'dB', xName: 'f', xUnit: ' Hz', unit: ' dB', ylim: [-60, 3], yFmt: v => v.toFixed(0), xFmt: fmt1, zeroLine: false });
    const h = EMD.hilbert(x, FS); const a = 100, b = n - 100;
    whyIF.setData({ series: [{ x: t.slice(a, b), y: h.freq.slice(a, b), color: '--s7', label: '瞬時頻率' }, { x: t.slice(a, b), y: Float64Array.from({ length: b - a }, () => 1), color: '--muted', label: '標稱 1 Hz', width: 1 }], xLabel: '時間 (s)', yLabel: 'Hz', xName: 't', xUnit: ' s', ylim: [0, 2.2], yFmt: fmt2, xlim: [1, 6] });
  }
  $('#why-eps').addEventListener('input', drawWhy); drawWhy();

  /* ---------------- 02 sifting demo ---------------- */
  const siftMain = new Charts.LineChart($('#sift-main'), { height: 230 });
  const siftH = new Charts.LineChart($('#sift-h'), { height: 150 });
  const S = { x: null, r: null, h: null, imfs: [], phase: 0, iter: 0, env: null, hNew: null, sd: NaN, imfNo: 1, done: false, timer: null, charts: [] };
  function siftSignal() {
    const v = $('#sift-source').value, n = 600, t = tAxis(n);
    if (v === 'synthetic') return Float64Array.from(t, tt => 40 * Math.sin(2 * Math.PI * 1 * tt) + 12 * Math.sin(2 * Math.PI * 6 * tt + 1) + 6 * Math.sin(2 * Math.PI * 13 * tt));
    const ep = EPOCHS.find(e => e.stage === v); return Float64Array.from(ep.eeg.slice(0, n));
  }
  function siftReset() {
    clearInterval(S.timer); S.timer = null; $('#sift-auto').textContent = '自動播放';
    S.x = siftSignal(); S.r = Float64Array.from(S.x); S.h = Float64Array.from(S.x); S.imfs = []; S.phase = 0; S.iter = 0; S.env = null; S.hNew = null; S.imfNo = 1; S.done = false;
    for (const c of S.charts) c.destroy(); S.charts = []; $('#sift-imfs').replaceChildren();
    siftStatus('–', '–', '–'); $('#sift-msg').textContent = '按「下一步」開始：先找出目前訊號的局部極大值與極小值。';
    siftDraw(); siftH.setData({ series: [{ x: tAxis(S.h.length), y: S.h, color: '--s8' }], xLabel: '時間 (s)', yLabel: 'µV', xName: 't', xUnit: ' s', symmetric: true, yFmt: fmt1 });
  }
  function siftStatus(nExt, nZc, sd) { $('#sift-imf-no').textContent = S.imfNo; $('#sift-iter').textContent = S.iter; $('#sift-next').textContent = nExt; $('#sift-nzc').textContent = nZc; $('#sift-sd-val').textContent = sd; }
  function siftDraw() {
    const t = tAxis(S.h.length), series = [{ x: t, y: S.h, color: '--s1', label: 'h(t)' }], markers = [];
    if (S.env && S.phase >= 1) { for (const i of S.env.maxIdx) markers.push({ x: t[i], y: S.h[i], color: '--s2' }); for (const i of S.env.minIdx) markers.push({ x: t[i], y: S.h[i], color: '--s3' }); }
    if (S.env && S.phase >= 2) { series.push({ x: t, y: S.env.upper, color: '--s2', label: '上包絡線' }); series.push({ x: t, y: S.env.lower, color: '--s3', label: '下包絡線' }); }
    if (S.env && S.phase >= 3) series.push({ x: t, y: S.env.mean, color: '--s7', label: '包絡線平均 m(t)', width: 2.5 });
    siftMain.setData({ series, markers, xLabel: '時間 (s)', yLabel: 'µV', xName: 't', xUnit: ' s', symmetric: true, yFmt: fmt1 });
  }
  function siftStep() {
    if (S.done) return;
    const thr = +$('#sift-sd').value;
    if (S.phase === 0) { // find extrema
      S.env = EMD.envelopes(S.h, 2);
      if (!S.env) { finishAll('殘差已經沒有足夠的極值可以畫包絡線（單調趨勢）——分解結束。'); return; }
      S.phase = 1; siftDraw(); siftStatus(S.env.maxIdx.length + S.env.minIdx.length, EMD.countZeroCrossings(S.h), S.iter ? S.sd.toFixed(3) : '–');
      $('#sift-msg').textContent = `IMF ${S.imfNo}，第 ${S.iter + 1} 次篩選：找到 ${S.env.maxIdx.length} 個局部極大值（橘）與 ${S.env.minIdx.length} 個局部極小值（綠）。`;
    } else if (S.phase === 1) { S.phase = 2; siftDraw(); $('#sift-msg').textContent = '用三次樣條分別通過所有極大值與極小值，得到上、下包絡線（兩端以鏡像延伸的極值固定）。'; }
    else if (S.phase === 2) { S.phase = 3; siftDraw(); $('#sift-msg').textContent = '取上下包絡線的平均 m(t)（紫線）。若 h(t) 已是 IMF，m(t) 應處處接近 0。'; }
    else if (S.phase === 3) {
      S.hNew = new Float64Array(S.h.length); for (let i = 0; i < S.h.length; i++) S.hNew[i] = S.h[i] - S.env.mean[i];
      S.sd = EMD.siftSD(S.h, S.hNew); S.iter++;
      const nExt = S.env.maxIdx.length + S.env.minIdx.length, nZc = EMD.countZeroCrossings(S.hNew), ok = Math.abs(nExt - nZc) <= 1;
      siftH.setData({ series: [{ x: tAxis(S.hNew.length), y: S.hNew, color: '--s8', label: 'h − m' }], xLabel: '時間 (s)', yLabel: 'µV', xName: 't', xUnit: ' s', symmetric: true, yFmt: fmt1 });
      siftStatus(nExt, nZc, S.sd.toFixed(3));
      const accept = (S.sd < thr && ok) || S.iter >= 50;
      if (accept) {
        $('#sift-msg').textContent = `h − m：SD = ${S.sd.toFixed(3)} < ${thr}，極值 ${nExt} 與零交越 ${nZc} 相差 ≤ 1 → 接受為 IMF ${S.imfNo}（共 ${S.iter} 次篩選）。下一步：從殘差中繼續。`;
        acceptImf();
      } else {
        $('#sift-msg').textContent = `h − m：SD = ${S.sd.toFixed(3)}${S.sd >= thr ? ' ≥ ' + thr : ''}${ok ? '' : '，極值 ' + nExt + ' 與零交越 ' + nZc + ' 相差 > 1'} → 還不是 IMF，把它當成新的 h(t) 再篩一次。`;
        S.h = S.hNew; S.phase = 0;
      }
    }
  }
  function acceptImf() {
    const imf = S.hNew; S.imfs.push(imf);
    const row = document.createElement('div'); row.className = 'imf-row';
    const lbl = document.createElement('div'); lbl.className = 'lbl'; const b = document.createElement('b'); b.textContent = `IMF ${S.imfNo}`; lbl.appendChild(b);
    const hh = EMD.hilbert(imf, FS); lbl.appendChild(document.createTextNode(`平均瞬時頻率 ${hh.meanFreq.toFixed(1)} Hz · ${S.iter} 次篩選`));
    const cv = document.createElement('canvas'); cv.className = 'viz'; row.appendChild(lbl); row.appendChild(cv); $('#sift-imfs').appendChild(row);
    const ch = new Charts.LineChart(cv, { height: 80, margin: { l: 52, r: 14, t: 6, b: 18 } }); S.charts.push(ch);
    ch.setData({ series: [{ x: tAxis(imf.length), y: imf, color: '--s6' }], symmetric: true, yFmt: fmt1, xName: 't', xUnit: ' s' });
    const nr = new Float64Array(S.r.length); for (let i = 0; i < nr.length; i++) nr[i] = S.r[i] - imf[i]; S.r = nr; S.h = Float64Array.from(nr);
    S.imfNo++; S.iter = 0; S.phase = 0; S.env = null;
    if (EMD.findExtrema(S.r).maxIdx.length + EMD.findExtrema(S.r).minIdx.length < 2) finishAll(`IMF ${S.imfNo - 1} 抽出後殘差已是單調趨勢——分解完成，共 ${S.imfs.length} 個 IMF；IMF 總和 + 殘差 = 原訊號。`);
  }
  function finishAll(msg) {
    S.done = true; clearInterval(S.timer); S.timer = null; $('#sift-auto').textContent = '自動播放'; $('#sift-msg').textContent = msg;
    const row = document.createElement('div'); row.className = 'imf-row'; const lbl = document.createElement('div'); lbl.className = 'lbl'; const b = document.createElement('b'); b.textContent = '殘差 r(t)'; lbl.appendChild(b); lbl.appendChild(document.createTextNode('單調趨勢'));
    const cv = document.createElement('canvas'); cv.className = 'viz'; row.appendChild(lbl); row.appendChild(cv); $('#sift-imfs').appendChild(row);
    const ch = new Charts.LineChart(cv, { height: 80, margin: { l: 52, r: 14, t: 6, b: 18 } }); S.charts.push(ch); ch.setData({ series: [{ x: tAxis(S.r.length), y: S.r, color: '--muted' }], yFmt: fmt1, xName: 't', xUnit: ' s' });
  }
  $('#sift-step').addEventListener('click', siftStep);
  $('#sift-reset').addEventListener('click', siftReset);
  $('#sift-source').addEventListener('change', siftReset); $('#sift-sd').addEventListener('change', siftReset);
  $('#sift-auto').addEventListener('click', () => { if (S.timer) { clearInterval(S.timer); S.timer = null; $('#sift-auto').textContent = '自動播放'; } else { $('#sift-auto').textContent = '暫停'; S.timer = setInterval(() => { siftStep(); if (S.done) { clearInterval(S.timer); S.timer = null; $('#sift-auto').textContent = '自動播放'; } }, 650); } });
  siftReset();

  /* ---------------- 03 real EEG + 04 Hilbert ---------------- */
  const realSig = new Charts.LineChart($('#real-signal'), { height: 170 });
  const realRes = new Charts.LineChart($('#real-residue'), { height: 100, margin: { l: 52, r: 14, t: 6, b: 32 } });
  const hsHil = new Charts.Heatmap($('#hs-hilbert'), { height: 260, margin: { l: 44, r: 16, t: 8, b: 30 } });
  const hsStft = new Charts.Heatmap($('#hs-stft'), { height: 260, margin: { l: 44, r: 16, t: 8, b: 30 } });
  const hsMarg = new Charts.LineChart($('#hs-marginal'), { height: 190 });
  const R = { stage: 'N2', epoch: null, dec: null, desc: null, charts: [], running: false, token: 0 };
  const STAGE_NOTE = {
    W: '清醒（閉眼）時的主節律是 8–12 Hz 的 α 波，通常落在 IMF 1–2；額葉導程也容易混入眼動與肌電。',
    N1: '入睡期：α 波消失，轉為 4–7 Hz 的低振幅混合頻率活動。N1 是人工判讀一致性最低的階段。',
    N2: '注意 IMF 1–2 裡間歇出現的 11–16 Hz 紡錘波（sleep spindle）與偶發的 K 複合波；能量開始往較慢的 IMF 移動。',
    N3: '深睡期：0.5–2 Hz、振幅 >75 µV 的慢波主導，能量集中在平均瞬時頻率 <2 Hz 的 IMF；高頻 IMF 的能量占比很小。',
    REM: '快速動眼期：低振幅、混合頻率，類似清醒但沒有 α 主節律；θ 範圍的 IMF 相對明顯，Fpz-Cz 可能混入眼動。',
  };
  function fillEpochs() { const sel = $('#real-epoch'); sel.replaceChildren(); for (const e of EPOCHS.filter(e => e.stage === R.stage)) { const o = document.createElement('option'); o.value = e.id; o.textContent = `${e.id}（第 ${e.epoch} 個 epoch，${e.clock_h.toFixed(1)} h${e.spindles ? '，' + e.spindles + ' 個紡錘波' : ''}）`; sel.appendChild(o); } }
  $$('#real-stage button').forEach(b => b.addEventListener('click', () => { $$('#real-stage button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); R.stage = b.dataset.stage; fillEpochs(); runReal(); }));
  $('#real-epoch').addEventListener('change', runReal);
  $$('input[name=real-method]').forEach(r => r.addEventListener('change', runReal));
  $('#real-ens').addEventListener('input', () => { $('#real-ens-val').textContent = $('#real-ens').value; }); $('#real-ens').addEventListener('change', runReal);
  $('#real-noise').addEventListener('input', () => { $('#real-noise-val').textContent = (+$('#real-noise').value).toFixed(2); }); $('#real-noise').addEventListener('change', runReal);
  $('#real-samescale').addEventListener('change', () => renderImfs());
  $('#hs-decades').addEventListener('change', () => renderHS());

  async function runReal() {
    const id = $('#real-epoch').value; const ep = EPOCHS.find(e => e.id === id); if (!ep) return;
    const x = Float64Array.from(ep.eeg), method = $('input[name=real-method]:checked').value, token = ++R.token;
    R.epoch = ep; R.x = x;
    realSig.setData({ series: [{ x: tAxis(x.length), y: x, color: STAGES[ep.stage].color, label: `${STAGES[ep.stage].label} · ${ep.id}` }], xLabel: '時間 (s)', yLabel: 'µV', xName: 't', xUnit: ' s', symmetric: true, yFmt: fmt1 });
    $('#real-note').textContent = STAGE_NOTE[ep.stage];
    let dec;
    if (method === 'eemd') {
      const prog = $('#real-progress'); prog.hidden = false; prog.value = 0;
      const nModes = EMD.emd(x).imfs.length;
      try { dec = await EMD.eemdAsync(x, { ensembles: +$('#real-ens').value, noiseStd: +$('#real-noise').value, nModes, seed: 7, onProgress: (k, n) => { prog.value = k / n; } }); }
      finally { prog.hidden = true; }
      if (token !== R.token) return; // superseded
    } else dec = EMD.emd(x);
    R.dec = dec; R.desc = EMD.describeImfs(dec, FS); R.method = method;
    renderImfs(); renderTable(); renderBands(); renderHS();
  }
  function renderImfs() {
    const dec = R.dec; if (!dec) return; const box = $('#real-imfs'); for (const c of R.charts) c.destroy(); R.charts = []; box.replaceChildren();
    const same = $('#real-samescale').checked; let gmax = 0; if (same) for (const m of dec.imfs) for (const v of m) gmax = Math.max(gmax, Math.abs(v));
    const t = tAxis(R.x.length);
    dec.imfs.forEach((imf, i) => {
      const d = R.desc[i]; const row = document.createElement('div'); row.className = 'imf-row';
      const lbl = document.createElement('div'); lbl.className = 'lbl'; const b = document.createElement('b'); b.textContent = `IMF ${i + 1}`; lbl.appendChild(b);
      lbl.appendChild(document.createTextNode(`${d.meanFreq.toFixed(1)} Hz · 能量 ${(100 * d.energyShare).toFixed(1)} % `)); const tag = document.createElement('span'); tag.className = 'band-tag'; tag.textContent = BAND_LABEL[d.band]; lbl.appendChild(tag);
      const cv = document.createElement('canvas'); cv.className = 'viz'; cv.setAttribute('aria-label', `IMF ${i + 1}`); row.appendChild(lbl); row.appendChild(cv); box.appendChild(row);
      const last = i === dec.imfs.length - 1; const ch = new Charts.LineChart(cv, { height: last ? 96 : 70, margin: { l: 52, r: 14, t: 4, b: last ? 32 : 6 } }); R.charts.push(ch);
      ch.setData({ series: [{ x: t, y: imf, color: '--s6' }], symmetric: true, ylim: same ? [-gmax * 1.05, gmax * 1.05] : undefined, yFmt: fmt1, xName: 't', xUnit: ' s', xLabel: last ? '時間 (s)' : undefined, xFmt: last ? undefined : () => '' });
    });
    realRes.setData({ series: [{ x: t, y: dec.residue, color: '--muted' }], yFmt: fmt1, xName: 't', xUnit: ' s', xLabel: '時間 (s)' });
  }
  function renderTable() {
    const tb = $('#real-table'); tb.replaceChildren();
    for (const d of R.desc) { const tr = document.createElement('tr'); for (const v of [`IMF ${d.index}`, d.meanFreq.toFixed(2), BAND_LABEL[d.band], pct(d.energyShare), d.rms.toFixed(1), d.iterations == null ? '（EEMD 平均）' : d.iterations]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); } tb.appendChild(tr); }
  }
  function renderBands() {
    const box = $('#real-bands'); box.replaceChildren(); const share = {}; for (const k of Object.keys(BAND_LABEL)) share[k] = 0;
    for (const d of R.desc) share[d.band] += d.energyShare;
    for (const k of ['slow', 'delta', 'theta', 'alpha', 'sigma', 'beta', 'gamma']) {
      const row = document.createElement('div'); row.className = 'bar'; const l = document.createElement('span'); l.textContent = BAND_LABEL[k]; const tr = document.createElement('div'); tr.className = 'track'; const f = document.createElement('div'); f.className = 'fill'; f.style.width = (100 * share[k]).toFixed(1) + '%'; tr.appendChild(f); const v = document.createElement('span'); v.className = 'v'; v.textContent = pct(share[k]); row.append(l, tr, v); box.appendChild(row);
    }
  }
  function renderHS() {
    if (!R.dec) return; const decades = +$('#hs-decades').value;
    const hs = EMD.hilbertSpectrum(R.dec.imfs, FS, { fMax: 30, nF: 120, nT: 150 });
    hsHil.setData({ grid: hs.grid, nT: hs.nT, nF: hs.nF, fMax: hs.fMax, dt: hs.dt, df: hs.df, decades, xLabel: '時間 (s)', yLabel: '頻率 (Hz)', smooth: false });
    const st = EMD.stftSpectrogram(R.x, FS, { fMax: 30, win: 2, nT: 150 });
    hsStft.setData({ grid: st.grid, nT: st.nT, nF: st.nF, fMax: st.fMax, dt: st.dt, df: st.df, decades, xLabel: '時間 (s)', yLabel: '頻率 (Hz)', smooth: true });
    // marginal spectra
    const hm = new Float64Array(hs.nF); for (let t = 0; t < hs.nT; t++) for (let f = 0; f < hs.nF; f++) hm[f] += hs.grid[t * hs.nF + f];
    let m1 = 0; for (const v of hm) m1 = Math.max(m1, v); const hf = Float64Array.from({ length: hs.nF }, (_, i) => (i + 0.5) * hs.df);
    const ps = EMD.powerSpectrum(R.x, FS, 30); let m2 = 0; for (const v of ps.power) m2 = Math.max(m2, v);
    hsMarg.setData({ series: [{ x: hf, y: Float64Array.from(hm, v => v / m1), color: '--s1', label: 'Hilbert 邊際譜' }, { x: ps.freq, y: Float64Array.from(ps.power, v => v / m2), color: '--s2', label: '傅立葉功率譜' }], xLabel: '頻率 (Hz)', yLabel: '相對能量', xName: 'f', xUnit: ' Hz', ylim: [0, 1.05], yFmt: fmt2, xFmt: fmt1 });
    $('#hs-caption').textContent = `片段 ${R.epoch.id}（${STAGES[R.epoch.stage].label}），${R.method === 'eemd' ? 'EEMD' : 'EMD'}，${R.dec.imfs.length} 個 IMF`;
  }
  fillEpochs(); runReal();

  /* ---------------- 05 mode mixing ---------------- */
  const mixSig = new Charts.LineChart($('#mix-signal'), { height: 150 });
  const M = { charts: [], token: 0 };
  ['amp', 'noise', 'ens'].forEach(k => $('#mix-' + k).addEventListener('input', () => { const v = +$('#mix-' + k).value; $('#mix-' + k + '-val').textContent = k === 'ens' ? v : v.toFixed(2); }));
  $('#mix-run').addEventListener('click', runMix);
  async function runMix() {
    const amp = +$('#mix-amp').value, noise = +$('#mix-noise').value, ens = +$('#mix-ens').value, token = ++M.token;
    const n = 1500, t = tAxis(n), x = new Float64Array(n), tone = new Float64Array(n), burst = new Float64Array(n);
    for (let i = 0; i < n; i++) { tone[i] = Math.sin(2 * Math.PI * 1 * t[i]); const inB = (t[i] > 3 && t[i] < 4.5) || (t[i] > 9 && t[i] < 10.5); burst[i] = inB ? amp * Math.sin(2 * Math.PI * 14 * t[i]) * Math.sin(Math.PI * ((t[i] - (t[i] < 6 ? 3 : 9)) / 1.5)) : 0; x[i] = tone[i] + burst[i]; }
    mixSig.setData({ series: [{ x: t, y: x, color: '--s1', label: 'x(t)' }], xLabel: '時間 (s)', yLabel: '振幅', xName: 't', xUnit: ' s', symmetric: true, yFmt: fmt2, bands: [{ x0: 3, x1: 4.5, color: '--s2' }, { x0: 9, x1: 10.5, color: '--s2' }] });
    $('#mix-run').disabled = true; $('#mix-metrics').textContent = 'EEMD 計算中…';
    const dEmd = EMD.emd(x); let dEemd;
    try { dEemd = await EMD.eemdAsync(x, { ensembles: ens, noiseStd: noise, nModes: 4, seed: 3 }); } finally { $('#mix-run').disabled = false; }
    if (token !== M.token) return;
    for (const c of M.charts) c.destroy(); M.charts = [];
    const corr = (a, b) => { let sa = 0, sb = 0, sab = 0; for (let i = 100; i < n - 100; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i]; } return sab / Math.sqrt(sa * sb); };
    const show = (box, dec) => {
      box.replaceChildren();
      dec.imfs.slice(0, 3).forEach((imf, i) => {
        const row = document.createElement('div'); row.className = 'imf-row'; const lbl = document.createElement('div'); lbl.className = 'lbl'; const b = document.createElement('b'); b.textContent = `IMF ${i + 1}`; lbl.appendChild(b);
        lbl.appendChild(document.createTextNode(`與 1 Hz 慢波相關 ${corr(imf, tone).toFixed(2)} · 與短暫振盪相關 ${corr(imf, burst).toFixed(2)}`));
        const cv = document.createElement('canvas'); cv.className = 'viz'; row.append(lbl, cv); box.appendChild(row);
        const ch = new Charts.LineChart(cv, { height: i === 2 ? 92 : 78, margin: { l: 44, r: 10, t: 4, b: i === 2 ? 30 : 6 } }); M.charts.push(ch);
        ch.setData({ series: [{ x: t, y: imf, color: '--s6' }], symmetric: true, yFmt: fmt2, xName: 't', xUnit: ' s', xFmt: i === 2 ? undefined : () => '' });
      });
    };
    show($('#mix-emd'), dEmd); show($('#mix-eemd'), dEemd);
    const best = dec => Math.max(...dec.imfs.map(m => corr(m, tone)));
    $('#mix-metrics').textContent = `最能代表 1 Hz 慢波的 IMF 與真值的相關係數：EMD ${best(dEmd).toFixed(3)} → EEMD ${best(dEemd).toFixed(3)}（${ens} 次集成、雜訊 ${noise.toFixed(2)} σ）。EMD 共 ${dEmd.imfs.length} 個 IMF；EEMD 固定 4 個模態。`;
  }
  { const sec = $('#mixing'); const io = new IntersectionObserver(en => { if (en[0].isIntersecting) { io.disconnect(); runMix(); } }, { rootMargin: '400px' }); io.observe(sec); }

  /* ---------------- 06 staging features ---------------- */
  const FEATS = {
    E_delta: { label: 'δ 頻帶 IMF 能量占比（<4 Hz）', fn: f => f.E_delta, fmt: pct },
    E_theta: { label: 'θ 頻帶 IMF 能量占比（4–8 Hz）', fn: f => f.E_theta, fmt: pct },
    E_alpha: { label: 'α 頻帶 IMF 能量占比（8–12 Hz）', fn: f => f.E_alpha, fmt: pct },
    E_sigma: { label: 'σ 頻帶 IMF 能量占比（12–16 Hz）', fn: f => f.E_sigma, fmt: pct },
    E_beta: { label: 'β 以上 IMF 能量占比（>16 Hz）', fn: f => f.E_beta, fmt: pct },
    IF1: { label: 'IMF1 平均瞬時頻率 (Hz)', fn: f => f.IF1, fmt: fmt1 },
    IF2: { label: 'IMF2 平均瞬時頻率 (Hz)', fn: f => f.IF2, fmt: fmt1 },
    IFdom: { label: '能量最大 IMF 的平均瞬時頻率 (Hz)', fn: f => f.IFdom, fmt: fmt1 },
    RMS: { label: '訊號 RMS (µV)', fn: f => f.RMS, fmt: fmt1 },
    KURT1: { label: 'IMF1 峰度', fn: f => f.KURT1, fmt: fmt2 },
  };
  const feats = EPOCHS.map(ep => {
    const x = Float64Array.from(ep.eeg), dec = EMD.emd(x), d = EMD.describeImfs(dec, FS);
    const share = (lo, hi) => d.filter(o => o.meanFreq >= lo && o.meanFreq < hi).reduce((s, o) => s + o.energyShare, 0);
    const dom = d.reduce((a, b) => (b.energyShare > a.energyShare ? b : a));
    return { id: ep.id, stage: ep.stage, E_delta: share(0, 4), E_theta: share(4, 8), E_alpha: share(8, 12), E_sigma: share(12, 16), E_beta: share(16, 1e9), IF1: d[0].meanFreq, IF2: d[1] ? d[1].meanFreq : 0, IFdom: dom.meanFreq, RMS: Math.sqrt(EMD.stats.energy(x) / x.length), KURT1: d[0].kurtosis };
  });
  const stgScatter = new Charts.Scatter($('#stg-scatter'), { height: 340, margin: { l: 56, r: 14, t: 10, b: 32 } });
  for (const id of ['stg-x', 'stg-y']) { const sel = $('#' + id); for (const [k, f] of Object.entries(FEATS)) { const o = document.createElement('option'); o.value = k; o.textContent = f.label; sel.appendChild(o); } }
  $('#stg-x').value = 'E_delta'; $('#stg-y').value = 'IF1';
  $('#stg-x').addEventListener('change', renderStaging); $('#stg-y').addEventListener('change', renderStaging);
  function renderStaging() {
    const kx = $('#stg-x').value, ky = $('#stg-y').value, fx = FEATS[kx], fy = FEATS[ky];
    const pts = feats.map(f => ({ x: fx.fn(f), y: fy.fn(f), group: f.stage, label: f.id }));
    // leave-one-out nearest centroid on standardised features
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const sx = Math.sqrt(pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) / pts.length) || 1, sy = Math.sqrt(pts.reduce((s, p) => s + (p.y - my) ** 2, 0) / pts.length) || 1;
    let correct = 0;
    pts.forEach((p, i) => {
      const cent = {}; pts.forEach((q, j) => { if (j === i) return; (cent[q.group] = cent[q.group] || { x: 0, y: 0, n: 0 }); cent[q.group].x += (q.x - mx) / sx; cent[q.group].y += (q.y - my) / sy; cent[q.group].n++; });
      let best = null, bd = Infinity; for (const [g, c] of Object.entries(cent)) { const d = ((p.x - mx) / sx - c.x / c.n) ** 2 + ((p.y - my) / sy - c.y / c.n) ** 2; if (d < bd) { bd = d; best = g; } }
      if (best === p.group) correct++;
    });
    const cents = Object.keys(STAGES).map(g => { const ps = pts.filter(p => p.group === g); return { group: g, x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length }; });
    stgScatter.setData({ points: pts, groups: STAGES, centroids: cents, xLabel: fx.label, yLabel: fy.label, xFmt: fx.fmt, yFmt: fy.fmt });
    $('#stg-acc').textContent = `留一法最近質心分類準確率：${correct}/${pts.length} = ${(100 * correct / pts.length).toFixed(0)} %（空心符號為各階段質心）。試試 δ 能量 × IMF1 頻率，或 σ 能量 × RMS。`;
  }
  const tb = $('#stg-table');
  for (const f of feats) { const tr = document.createElement('tr'); for (const v of [f.id, STAGES[f.stage].label, pct(f.E_delta), pct(f.E_theta), pct(f.E_alpha), pct(f.E_sigma), pct(f.E_beta), fmt1(f.IF1), fmt1(f.IF2), fmt1(f.IFdom), fmt1(f.RMS), fmt2(f.KURT1)]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); } tb.appendChild(tr); }
  renderStaging();

  /* ---------------- 07 whole night ---------------- */
  (function () {
    const NIGHT = window.SLEEP_NIGHT; if (!NIGHT) return; const NE = NIGHT.epochs, n = NE.length;
    const ORDER = { N3: 0, N2: 1, N1: 2, REM: 3, W: 4 }, LBL = ['N3', 'N2', 'N1', 'REM', 'W'];
    const NF = { d: 'δ 頻帶 IMF 能量占比（<4 Hz）', t: 'θ 頻帶 IMF 能量占比（4–8 Hz）', a: 'α 頻帶 IMF 能量占比（8–12 Hz）', g: 'σ 頻帶 IMF 能量占比（12–16 Hz）', b: 'β 以上 IMF 能量占比（>16 Hz）', f1: 'IMF1 平均瞬時頻率 (Hz)', fd: '能量最大 IMF 的平均瞬時頻率 (Hz)', r: '訊號 RMS (µV)', n: 'IMF 個數', k1: 'IMF1 峰度' };
    const NFMT = { d: pct, t: pct, a: pct, g: pct, b: pct, f1: fmt1, fd: fmt1, r: fmt1, n: v => v.toFixed(0), k1: fmt2 };
    const hrs = i => i * 30 / 3600;
    let last = 'W'; const hx = [], hy = [];
    NE.forEach((o, i) => { const st = ORDER[o.s] == null ? last : o.s; last = st; hx.push(hrs(i), hrs(i + 1)); hy.push(ORDER[st], ORDER[st]); });
    const hyp = new Charts.LineChart($('#night-hypno'), { height: 215 });
    hyp.setData({ series: [{ x: Float64Array.from(hx), y: Float64Array.from(hy), color: '--s7', label: '睡眠階段', width: 1.5 }], ylim: [-0.4, 4.4], yFmt: v => Number.isInteger(v) ? (LBL[v] || '') : '', xLabel: '自熄燈前 30 分鐘起算 (h)', xName: 't', xUnit: ' h', xFmt: fmt1, zeroLine: false, xlim: [0, hrs(n)] });
    const bands = []; let cur = null;
    NE.forEach((o, i) => { const key = o.s === 'N3' ? '--s4' : o.s === 'REM' ? '--s5' : null; if (cur && cur.color === key) cur.x1 = hrs(i + 1); else { if (cur) bands.push(cur); cur = key ? { x0: hrs(i), x1: hrs(i + 1), color: key } : null; } }); if (cur) bands.push(cur);
    const fch = new Charts.LineChart($('#night-feat-chart'), { height: 210 });
    for (const [k, l] of Object.entries(NF)) for (const id of ['night-feat', 'night-x', 'night-y']) { const o = document.createElement('option'); o.value = k; o.textContent = l; $('#' + id).appendChild(o); }
    $('#night-feat').value = 'd'; $('#night-x').value = 'd'; $('#night-y').value = 'r';
    function movingMedian(arr, w) { if (w <= 1) return arr; const h = Math.floor(w / 2); return arr.map((_, i) => { const s = arr.slice(Math.max(0, i - h), Math.min(arr.length, i + h + 1)).slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; }); }
    function drawFeat() {
      const k = $('#night-feat').value, w = +$('#night-smooth').value; const raw = NE.map(o => o[k]); const sm = movingMedian(raw, w);
      const x = Float64Array.from(NE, (_, i) => hrs(i) + 30 / 7200);
      const series = [{ x, y: Float64Array.from(raw), color: '--s1', label: NF[k], width: w > 1 ? 1 : 2, alpha: w > 1 ? 0.35 : 1 }];
      if (w > 1) series.push({ x, y: Float64Array.from(sm), color: '--s1', label: `移動中位數（${w} 個 epoch）`, width: 2 });
      fch.setData({ series, bands, xLabel: '自熄燈前 30 分鐘起算 (h)', yLabel: '', xName: 't', xUnit: ' h', xFmt: fmt1, yFmt: NFMT[k], xlim: [0, hrs(n)], zeroLine: false, legend: w > 1 });
    }
    $('#night-feat').addEventListener('change', drawFeat); $('#night-smooth').addEventListener('change', drawFeat); drawFeat();
    const tb = $('#night-table'); const by = {}; for (const o of NE) (by[o.s] = by[o.s] || []).push(o);
    const med = (arr, k) => { const v = arr.map(o => o[k]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
    for (const [k, l] of Object.entries(NF)) { const tr = document.createElement('tr'); const td0 = document.createElement('td'); td0.textContent = l; tr.appendChild(td0); for (const st of ['W', 'N1', 'N2', 'N3', 'REM']) { const td = document.createElement('td'); td.textContent = NFMT[k](med(by[st], k)); tr.appendChild(td); } tb.appendChild(tr); }
    let EEMD_DATA = null, loadingEemd = false;
    function featVec(o, fs) { const base = fs === 'two' ? [o[$('#night-x').value], o[$('#night-y').value]] : [o.d, o.t, o.a, o.g, o.b, o.f1, o.fd, o.r, o.k1, Math.log(o.r)]; if (fs === 'modes' && o.m) return base.concat(o.m.flatMap(m => [m[0], m[1]])); return base; }
    function classify() {
      const src = $('#night-src').value, fs = $('#night-fs').value, clf = $('#night-clf').value;
      $('#night-x').disabled = $('#night-y').disabled = fs !== 'two';
      if (src === 'eemd' && !EEMD_DATA) { if (!loadingEemd) { loadingEemd = true; $('#night-acc').textContent = '載入 EEMD 特徵中…'; const sc = document.createElement('script'); sc.src = 'data/night_eemd.js'; sc.onload = () => { EEMD_DATA = window.SLEEP_NIGHT_EEMD.epochs; loadingEemd = false; classify(); }; sc.onerror = () => { loadingEemd = false; $('#night-acc').textContent = 'EEMD 特徵載入失敗。'; }; document.body.appendChild(sc); } return; }
      const data = src === 'eemd' ? EEMD_DATA : NE; const fsUse = (fs === 'modes' && src !== 'eemd') ? 'all' : fs;
      const stages = ['W', 'N1', 'N2', 'N3', 'REM']; const pts = data.filter(o => ORDER[o.s] != null); const X = pts.map(o => featVec(o, fsUse)); const D = X[0].length;
      const mu = new Array(D).fill(0), sd = new Array(D).fill(0); for (const x of X) for (let j = 0; j < D; j++) mu[j] += x[j] / X.length; for (const x of X) for (let j = 0; j < D; j++) sd[j] += (x[j] - mu[j]) ** 2 / X.length;
      const Z = X.map(x => x.map((v, j) => (v - mu[j]) / (Math.sqrt(sd[j]) || 1)));
      const cm = {}; for (const a of stages) { cm[a] = {}; for (const b of stages) cm[a][b] = 0; } let correct = 0;
      if (clf === 'nc') {
        const sum = {}; pts.forEach((o, i) => { const c = sum[o.s] = sum[o.s] || { v: new Array(D).fill(0), n: 0 }; for (let j = 0; j < D; j++) c.v[j] += Z[i][j]; c.n++; });
        pts.forEach((o, i) => { let best = null, bd = Infinity; for (const st of stages) { const c = sum[st]; const nn = c.n - (st === o.s ? 1 : 0); if (nn <= 0) continue; let d = 0; for (let j = 0; j < D; j++) { const cj = (c.v[j] - (st === o.s ? Z[i][j] : 0)) / nn; d += (Z[i][j] - cj) ** 2; } if (d < bd) { bd = d; best = st; } } cm[o.s][best]++; if (best === o.s) correct++; });
      } else {
        const k = 7;
        pts.forEach((o, i) => { const ds = []; for (let q = 0; q < Z.length; q++) { if (q === i) continue; let d = 0; for (let j = 0; j < D; j++) d += (Z[i][j] - Z[q][j]) ** 2; ds.push([d, pts[q].s]); } ds.sort((p, q) => p[0] - q[0]); const votes = {}; for (let t = 0; t < k; t++) votes[ds[t][1]] = (votes[ds[t][1]] || 0) + 1; const best = Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0]; cm[o.s][best]++; if (best === o.s) correct++; });
      }
      const N = pts.length; const po = correct / N; let pe = 0; for (const st of stages) { const row = stages.reduce((s, b) => s + cm[st][b], 0), col = stages.reduce((s, a) => s + cm[a][st], 0); pe += (row / N) * (col / N); } const kappa = (po - pe) / (1 - pe);
      $('#night-acc').textContent = `${src === 'eemd' ? 'EEMD' : 'EMD'} 特徵 · ${D} 個特徵 · ${clf === 'nc' ? '最近質心' : 'k-NN (k=7)'}：準確率 ${(100 * po).toFixed(1)} %（${correct}/${N}）· Cohen's κ = ${kappa.toFixed(2)}`;
      const body = $('#night-cm tbody'); body.replaceChildren();
      for (const a of stages) { const tr = document.createElement('tr'); const td0 = document.createElement('td'); td0.textContent = a; tr.appendChild(td0); for (const b of stages) { const td = document.createElement('td'); td.textContent = cm[a][b]; if (a === b) td.style.fontWeight = '700'; tr.appendChild(td); } body.appendChild(tr); }
    }
    for (const id of ['night-src', 'night-fs', 'night-clf']) $('#' + id).addEventListener('change', classify);
    $('#night-x').addEventListener('change', classify); $('#night-y').addEventListener('change', classify); classify();
  })();

  /* ---------------- 08 paper filter ---------------- */
  $$('#paper-filter button').forEach(b => b.addEventListener('click', () => {
    $$('#paper-filter button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true');
    const tag = b.dataset.tag; $$('.paper').forEach(p => { p.hidden = tag !== 'all' && !p.dataset.tags.split(' ').includes(tag); });
  }));
})();
