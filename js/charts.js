/*
 * charts.js — tiny dependency-free canvas charts (line, heatmap, scatter)
 * with crosshair/tooltip hover, HiDPI scaling and light/dark theme tokens
 * read from CSS custom properties. Written for the EMD × sleep site.
 */
(function (root) {
  'use strict';
  const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const C = col => (col && col.startsWith('--')) ? tok(col) : col;
  const FONT = '12px system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif';

  /* ---------- shared tooltip ---------- */
  let tip = null;
  function tooltip() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'viz-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    return tip;
  }
  function showTip(rows, clientX, clientY) {
    const el = tooltip(); el.replaceChildren();
    for (const r of rows) {
      const line = document.createElement('div'); line.className = 'viz-tip-row';
      if (r.color) { const key = document.createElement('span'); key.className = 'viz-tip-key'; key.style.background = C(r.color); line.appendChild(key); }
      const v = document.createElement('strong'); v.textContent = r.value; line.appendChild(v);
      const l = document.createElement('span'); l.textContent = r.label; line.appendChild(l);
      el.appendChild(line);
    }
    el.style.display = 'block';
    const pad = 14, w = el.offsetWidth, h = el.offsetHeight;
    let x = clientX + pad, y = clientY + pad;
    if (x + w > window.innerWidth - 8) x = clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = clientY - h - pad;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function hideTip() { if (tip) tip.style.display = 'none'; }

  /* ---------- base ---------- */
  class Base {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.opts = Object.assign({ height: 180, margin: { l: 52, r: 14, t: 10, b: 30 } }, opts);
      this.data = null; this.hover = null;
      this._lastW = -1;
      this._ro = new ResizeObserver(() => { const w = (canvas.parentElement || canvas).clientWidth; if (w !== this._lastW) this.draw(); }); this._ro.observe(canvas.parentElement || canvas);
      canvas.addEventListener('pointermove', e => this.onMove(e)); canvas.addEventListener('pointerleave', () => { this.hover = null; hideTip(); this.draw(); });
      canvas.tabIndex = 0; canvas.addEventListener('blur', () => { this.hover = null; hideTip(); this.draw(); });
      canvas.addEventListener('keydown', e => this.onKey && this.onKey(e));
      Base.all.add(this);
    }
    size() {
      const dpr = window.devicePixelRatio || 1, w = Math.max(200, (this.canvas.parentElement || this.canvas).clientWidth), h = this.opts.height;
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.canvas.style.height = h + 'px'; }
      this._lastW = w; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.w = w; this.h = h;
      const m = this.opts.margin; this.plot = { x: m.l, y: m.t, w: w - m.l - m.r, h: h - m.t - m.b };
    }
    clear() { const c = this.ctx; c.fillStyle = tok('--surface'); c.fillRect(0, 0, this.w, this.h); }
    axes(xlim, ylim, xLabel, yLabel, xFmt, yFmt) {
      const c = this.ctx, p = this.plot; c.font = FONT; c.textBaseline = 'middle';
      const xt = ticks(xlim[0], xlim[1], Math.max(3, Math.floor(p.w / 80))), yt = ticks(ylim[0], ylim[1], Math.max(3, Math.floor(p.h / 36)));
      c.strokeStyle = tok('--grid'); c.lineWidth = 1;
      for (const v of yt) { const y = Math.round(this.sy(v)) + 0.5; c.beginPath(); c.moveTo(p.x, y); c.lineTo(p.x + p.w, y); c.stroke(); }
      c.fillStyle = tok('--muted'); c.textAlign = 'right';
      for (const v of yt) c.fillText(yFmt ? yFmt(v) : fmt(v), p.x - 6, this.sy(v));
      c.textAlign = 'center'; c.textBaseline = 'top';
      for (const v of xt) { const x = this.sx(v); if (x < p.x - 1 || x > p.x + p.w + 1) continue; c.fillText(xFmt ? xFmt(v) : fmt(v), x, p.y + p.h + 5); }
      c.strokeStyle = tok('--axis'); c.beginPath(); c.moveTo(p.x, p.y + p.h + 0.5); c.lineTo(p.x + p.w, p.y + p.h + 0.5); c.stroke();
      if (xLabel) { c.textAlign = 'right'; c.fillText(xLabel, p.x + p.w, p.y + p.h + 17); }
      if (yLabel) { c.save(); c.translate(12, p.y); c.rotate(-Math.PI / 2); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(yLabel, 0, 0); c.restore(); }
    }
    sx(v) { const p = this.plot, [a, b] = this.xlim; return p.x + (v - a) / (b - a) * p.w; }
    sy(v) { const p = this.plot, [a, b] = this.ylim; return p.y + p.h - (v - a) / (b - a) * p.h; }
    ix(px) { const p = this.plot, [a, b] = this.xlim; return a + (px - p.x) / p.w * (b - a); }
    onMove() {}
    destroy() { this._ro.disconnect(); Base.all.delete(this); }
  }
  Base.all = new Set();
  function ticks(a, b, n) {
    const span = b - a; if (!(span > 0)) return [a];
    const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }
  function fmt(v) { return Math.abs(v) >= 1000 ? v.toLocaleString() : (Math.round(v * 100) / 100).toString(); }
  function nice(lo, hi) { if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.06; return [lo - pad, hi + pad]; }

  /* ---------- line chart ---------- */
  class LineChart extends Base {
    /** data = { series: [{x, y, color, label, width, dash, points, alpha}], xlim, ylim, markers: [{x, y, color, label}], bands: [{x0, x1, color}] } */
    setData(d) { this.data = d; this.draw(); }
    draw() {
      this.size(); this.clear(); const d = this.data; if (!d || !d.series.length) return;
      const c = this.ctx, p = this.plot;
      let xlim = d.xlim, ylim = d.ylim;
      if (!xlim) { let lo = Infinity, hi = -Infinity; for (const s of d.series) { lo = Math.min(lo, s.x[0]); hi = Math.max(hi, s.x[s.x.length - 1]); } xlim = [lo, hi]; }
      if (!ylim) { let lo = Infinity, hi = -Infinity; for (const s of d.series) for (let i = 0; i < s.y.length; i++) { const v = s.y[i]; if (v < lo) lo = v; if (v > hi) hi = v; } if (d.symmetric) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; } ylim = nice(lo, hi); }
      this.xlim = xlim; this.ylim = ylim;
      if (d.bands) for (const b of d.bands) { c.fillStyle = C(b.color); c.globalAlpha = 0.12; c.fillRect(this.sx(b.x0), p.y, this.sx(b.x1) - this.sx(b.x0), p.h); c.globalAlpha = 1; }
      this.axes(xlim, ylim, d.xLabel, d.yLabel, d.xFmt, d.yFmt);
      c.save(); c.beginPath(); c.rect(p.x, p.y, p.w, p.h); c.clip();
      if (d.zeroLine !== false && ylim[0] < 0 && ylim[1] > 0) { c.strokeStyle = tok('--axis'); c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, Math.round(this.sy(0)) + 0.5); c.lineTo(p.x + p.w, Math.round(this.sy(0)) + 0.5); c.stroke(); }
      for (const s of d.series) {
        c.strokeStyle = C(s.color); c.lineWidth = s.width || 2; c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = s.alpha == null ? 1 : s.alpha;
        c.setLineDash(s.dash || []);
        c.beginPath(); const n = s.x.length, step = Math.max(1, Math.floor(n / (p.w * 3)));
        for (let i = 0; i < n; i += step) { const x = this.sx(s.x[i]), y = this.sy(s.y[i]); i === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        if (s.points) for (let i = 0; i < n; i++) dot(c, this.sx(s.x[i]), this.sy(s.y[i]), C(s.color), 4);
      }
      if (d.markers) for (const m of d.markers) dot(c, this.sx(m.x), this.sy(m.y), C(m.color), m.r || 4);
      c.restore();
      // legend (only for ≥ 2 labelled series)
      const labelled = d.series.filter(s => s.label);
      if (labelled.length >= 2 && d.legend !== false) {
        c.font = FONT; c.textBaseline = 'middle'; c.textAlign = 'left'; let x = p.x + 8, y = p.y + 10;
        for (const s of labelled) { const w = 19 + c.measureText(s.label).width + 16; if (x + w > p.x + p.w && x > p.x + 8) { x = p.x + 8; y += 16; } c.strokeStyle = C(s.color); c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14, y); c.stroke(); c.fillStyle = tok('--ink-2'); c.fillText(s.label, x + 19, y); x += w; }
      }
      // crosshair
      if (this.hover != null) {
        const hx = this.sx(this.hover); c.strokeStyle = tok('--muted'); c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(hx) + 0.5, p.y); c.lineTo(Math.round(hx) + 0.5, p.y + p.h); c.stroke();
        for (const s of d.series) { const i = nearestIndex(s.x, this.hover); if (i >= 0) dot(c, this.sx(s.x[i]), this.sy(s.y[i]), C(s.color), 4); }
      }
    }
    onMove(e) {
      if (!this.data) return; const r = this.canvas.getBoundingClientRect(); const px = e.clientX - r.left;
      if (px < this.plot.x || px > this.plot.x + this.plot.w) { this.hover = null; hideTip(); this.draw(); return; }
      const xv = this.ix(px); this.hover = xv; this.draw();
      const d = this.data, rows = [];
      let xs = null;
      for (const s of d.series) { const i = nearestIndex(s.x, xv); if (i < 0) continue; if (xs == null) xs = s.x[i]; rows.push({ color: C(s.color), value: (d.yFmt ? d.yFmt(s.y[i]) : s.y[i].toFixed(1)) + (d.unit || ''), label: s.label || '' }); }
      if (xs != null) rows.unshift({ value: (d.xFmt ? d.xFmt(xs) : xs.toFixed(2)) + (d.xUnit || ''), label: d.xName || '' });
      showTip(rows, e.clientX, e.clientY);
    }
    onKey(e) {
      if (!this.data) return; const s = this.data.series[0]; const stepv = (this.xlim[1] - this.xlim[0]) / 100;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.hover = Math.min(this.xlim[1], Math.max(this.xlim[0], (this.hover == null ? this.xlim[0] : this.hover) + (e.key === 'ArrowRight' ? stepv : -stepv))); this.draw(); const r = this.canvas.getBoundingClientRect(); this.onMove({ clientX: r.left + this.sx(this.hover), clientY: r.top + this.plot.y + 10 }); }
    }
  }
  function nearestIndex(xs, v) { let lo = 0, hi = xs.length - 1; if (v < xs[0] || v > xs[hi]) return -1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < v) lo = m; else hi = m; } return (v - xs[lo] < xs[hi] - v) ? lo : hi; }
  function dot(c, x, y, color, r) { c.beginPath(); c.arc(x, y, r + 2, 0, Math.PI * 2); c.fillStyle = tok('--surface'); c.fill(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }

  /* ---------- heatmap (time × frequency) ---------- */
  const RAMP_LIGHT = ['#fcfcfb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  const RAMP_DARK = ['#1a1a19', '#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
  function rampColor(t, dark) { const R = dark ? RAMP_DARK : RAMP_LIGHT; const k = Math.min(R.length - 1.0001, Math.max(0, t * (R.length - 1))); const i = Math.floor(k), f = k - i; const a = hex(R[i]), b = hex(R[i + 1]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  class Heatmap extends Base {
    /** data = { grid (nT*nF, row-major by time), nT, nF, fMax, dt, df, decades } */
    setData(d) { this.data = d; this.draw(); }
    draw() {
      this.size(); this.clear(); const d = this.data; if (!d) return; const c = this.ctx, p = this.plot;
      const dur = d.nT * d.dt; this.xlim = [0, dur]; this.ylim = [0, d.fMax];
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      let vmax = 0; for (let i = 0; i < d.grid.length; i++) if (d.grid[i] > vmax) vmax = d.grid[i];
      const dec = d.decades || 2;
      const off = document.createElement('canvas'); off.width = d.nT; off.height = d.nF; const oc = off.getContext('2d'); const img = oc.createImageData(d.nT, d.nF);
      for (let t = 0; t < d.nT; t++) for (let f = 0; f < d.nF; f++) {
        const v = d.grid[t * d.nF + f]; const norm = v <= 0 || vmax <= 0 ? 0 : Math.max(0, 1 + Math.log10(v / vmax) / dec);
        const col = rampColor(norm, dark); const k = ((d.nF - 1 - f) * d.nT + t) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
      }
      oc.putImageData(img, 0, 0);
      c.imageSmoothingEnabled = d.smooth !== false; c.drawImage(off, p.x, p.y, p.w, p.h);
      this.axes(this.xlim, this.ylim, d.xLabel, d.yLabel, v => v.toFixed(0), v => v.toFixed(0));
      // colour bar legend (right)
      const bx = p.x + p.w + 2, bw = 6; for (let i = 0; i < p.h; i++) { const col = rampColor(1 - i / p.h, dark); c.fillStyle = `rgb(${col[0]|0},${col[1]|0},${col[2]|0})`; c.fillRect(bx, p.y + i, bw, 1); }
      if (this.hover) { const [hx, hy] = this.hover; c.strokeStyle = tok('--ink'); c.lineWidth = 1; c.strokeRect(Math.round(this.sx(hx * d.dt)) + 0.5, Math.round(this.sy((hy + 1) * d.df)) + 0.5, Math.max(2, p.w / d.nT), Math.max(2, p.h / d.nF)); }
    }
    onMove(e) {
      if (!this.data) return; const r = this.canvas.getBoundingClientRect(), d = this.data; const px = e.clientX - r.left, py = e.clientY - r.top;
      if (px < this.plot.x || px > this.plot.x + this.plot.w || py < this.plot.y || py > this.plot.y + this.plot.h) { this.hover = null; hideTip(); this.draw(); return; }
      const t = Math.min(d.nT - 1, Math.floor((px - this.plot.x) / this.plot.w * d.nT)), f = Math.min(d.nF - 1, Math.floor((this.plot.y + this.plot.h - py) / this.plot.h * d.nF));
      this.hover = [t, f]; this.draw();
      let vmax = 0; for (let i = 0; i < d.grid.length; i++) if (d.grid[i] > vmax) vmax = d.grid[i];
      const v = d.grid[t * d.nF + f]; const db = v > 0 ? (10 * Math.log10(v / vmax)).toFixed(1) + ' dB' : '—';
      showTip([{ value: `${(t * d.dt).toFixed(1)}–${((t + 1) * d.dt).toFixed(1)} s`, label: '時間' }, { value: `${(f * d.df).toFixed(1)}–${((f + 1) * d.df).toFixed(1)} Hz`, label: '頻率' }, { value: db, label: '相對能量（0 dB = 最大）' }], e.clientX, e.clientY);
    }
  }

  /* ---------- scatter (identity by colour × shape) ---------- */
  const SHAPES = {
    circle: (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); },
    square: (c, x, y, r) => { c.beginPath(); c.rect(x - r, y - r, 2 * r, 2 * r); },
    triangle: (c, x, y, r) => { c.beginPath(); c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.1, y + r * 0.8); c.lineTo(x - r * 1.1, y + r * 0.8); c.closePath(); },
    diamond: (c, x, y, r) => { c.beginPath(); c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.2, y); c.lineTo(x, y + r * 1.2); c.lineTo(x - r * 1.2, y); c.closePath(); },
    cross: (c, x, y, r) => { c.beginPath(); c.moveTo(x - r, y - r * 0.35); c.lineTo(x - r * 0.35, y - r * 0.35); c.lineTo(x - r * 0.35, y - r); c.lineTo(x + r * 0.35, y - r); c.lineTo(x + r * 0.35, y - r * 0.35); c.lineTo(x + r, y - r * 0.35); c.lineTo(x + r, y + r * 0.35); c.lineTo(x + r * 0.35, y + r * 0.35); c.lineTo(x + r * 0.35, y + r); c.lineTo(x - r * 0.35, y + r); c.lineTo(x - r * 0.35, y + r * 0.35); c.lineTo(x - r, y + r * 0.35); c.closePath(); },
  };
  class Scatter extends Base {
    /** data = { points: [{x, y, group, label, extra}], groups: {key: {label, color, shape}}, centroids: [{x, y, group}], xLabel, yLabel } */
    setData(d) { this.data = d; this.draw(); }
    draw() {
      this.size(); this.clear(); const d = this.data; if (!d) return; const c = this.ctx, p = this.plot;
      let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
      for (const q of d.points) { xlo = Math.min(xlo, q.x); xhi = Math.max(xhi, q.x); ylo = Math.min(ylo, q.y); yhi = Math.max(yhi, q.y); }
      this.xlim = d.xlim || nice(xlo, xhi); this.ylim = d.ylim || nice(ylo, yhi);
      this.axes(this.xlim, this.ylim, d.xLabel, d.yLabel, d.xFmt, d.yFmt);
      if (d.centroids) for (const q of d.centroids) { const g = d.groups[q.group]; c.strokeStyle = C(g.color); c.lineWidth = 2; SHAPES[g.shape](c, this.sx(q.x), this.sy(q.y), 11); c.stroke(); }
      d.points.forEach((q, i) => { const g = d.groups[q.group]; const x = this.sx(q.x), y = this.sy(q.y); SHAPES[g.shape](c, x, y, 7.5); c.fillStyle = tok('--surface'); c.fill(); SHAPES[g.shape](c, x, y, 5.5); c.fillStyle = C(g.color); c.fill(); if (this.hover === i) { c.strokeStyle = tok('--ink'); c.lineWidth = 1.5; SHAPES[g.shape](c, x, y, 8); c.stroke(); } });
      // legend row
      c.font = FONT; c.textBaseline = 'middle'; c.textAlign = 'left'; let lx = p.x + 6; const ly = p.y + 10;
      let lyy = ly;
      for (const k of Object.keys(d.groups)) { const g = d.groups[k]; const w = 15 + c.measureText(g.label).width + 14; if (lx + w > p.x + p.w && lx > p.x + 6) { lx = p.x + 6; lyy += 16; } SHAPES[g.shape](c, lx + 5, lyy, 5); c.fillStyle = C(g.color); c.fill(); c.fillStyle = tok('--ink-2'); c.fillText(g.label, lx + 15, lyy); lx += w; }
    }
    onMove(e) {
      if (!this.data) return; const r = this.canvas.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      let best = -1, bd = 24 * 24; this.data.points.forEach((q, i) => { const dx = this.sx(q.x) - px, dy = this.sy(q.y) - py; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } });
      this.hover = best < 0 ? null : best; this.draw();
      if (best < 0) { hideTip(); return; }
      const q = this.data.points[best], g = this.data.groups[q.group], d = this.data;
      const rows = [{ color: C(g.color), value: g.label, label: q.label || '' }, { value: d.xFmt ? d.xFmt(q.x) : q.x.toFixed(3), label: d.xLabel }, { value: d.yFmt ? d.yFmt(q.y) : q.y.toFixed(3), label: d.yLabel }];
      if (q.extra) for (const [k, v] of Object.entries(q.extra)) rows.push({ value: v, label: k });
      showTip(rows, e.clientX, e.clientY);
    }
  }

  function redrawAll() { for (const ch of Base.all) ch.draw(); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redrawAll);
  root.Charts = { LineChart, Heatmap, Scatter, redrawAll, tok, ticks };
})(window);
