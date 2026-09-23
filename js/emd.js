/*
 * emd.js — Empirical Mode Decomposition (EMD), Ensemble EMD (EEMD) and
 * Hilbert spectral analysis, written from scratch in plain JavaScript for
 * an interactive teaching website about EMD in sleep research.
 *
 * Algorithms follow:
 *   Huang et al. (1998) Proc. R. Soc. Lond. A 454:903–995  — EMD / sifting / SD criterion
 *   Huang et al. (2003) Proc. R. Soc. Lond. A 459:2317–2345 — S-number stopping criterion
 *   Wu & Huang (2009) Adv. Adapt. Data Anal. 1:1–41        — EEMD
 *   Rilling, Flandrin & Gonçalvès (2003)                    — mirror-symmetric boundary extension
 *
 * No dependencies. Exposes `globalThis.EMD`.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Small numeric helpers                                               */
  /* ------------------------------------------------------------------ */
  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function std(a) { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; } return Math.sqrt(s / a.length); }
  function energy(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return s; }
  function skewness(a) { const m = mean(a), s = std(a); if (s === 0) return 0; let t = 0; for (let i = 0; i < a.length; i++) t += Math.pow((a[i] - m) / s, 3); return t / a.length; }
  function kurtosis(a) { const m = mean(a), s = std(a); if (s === 0) return 0; let t = 0; for (let i = 0; i < a.length; i++) t += Math.pow((a[i] - m) / s, 4); return t / a.length; }

  /* Seeded PRNG (mulberry32) + Box–Muller Gaussian, so EEMD demos are reproducible. */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null;
    const gauss = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u = 0, v = 0; while (u === 0) u = next(); v = next();
      const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
      spare = r * Math.sin(th); return r * Math.cos(th);
    };
    return { uniform: next, gauss };
  }

  /* ------------------------------------------------------------------ */
  /* 1. Local extrema and zero crossings                                 */
  /* ------------------------------------------------------------------ */
  /** Indices of strict local maxima / minima (one index per plateau). */
  function findExtrema(x) {
    const maxIdx = [], minIdx = [], n = x.length;
    for (let i = 1; i < n - 1; i++) {
      if (x[i] > x[i - 1] && x[i] >= x[i + 1]) maxIdx.push(i);
      else if (x[i] < x[i - 1] && x[i] <= x[i + 1]) minIdx.push(i);
    }
    return { maxIdx, minIdx };
  }

  function countZeroCrossings(x) {
    let c = 0, prev = 0;
    for (let i = 0; i < x.length; i++) {
      const s = x[i] > 0 ? 1 : x[i] < 0 ? -1 : 0;
      if (s !== 0) { if (prev !== 0 && s !== prev) c++; prev = s; }
    }
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Natural cubic spline (tridiagonal / Thomas algorithm)            */
  /* ------------------------------------------------------------------ */
  /** Evaluate the natural cubic spline through knots (xs, ys) at integer sample positions 0..n-1. */
  function splineEvalGrid(xs, ys, n) {
    const m = xs.length, out = new Float64Array(n);
    if (m === 0) return out;
    if (m === 1) { out.fill(ys[0]); return out; }
    if (m === 2) { // linear
      const a = (ys[1] - ys[0]) / (xs[1] - xs[0]);
      for (let i = 0; i < n; i++) out[i] = ys[0] + a * (i - xs[0]);
      return out;
    }
    const h = new Float64Array(m - 1);
    for (let i = 0; i < m - 1; i++) h[i] = xs[i + 1] - xs[i];
    // second derivatives M via tridiagonal system (natural: M0 = Mm-1 = 0)
    const M = new Float64Array(m), c = new Float64Array(m), d = new Float64Array(m);
    // rows 1..m-2:  h[i-1]*M[i-1] + 2(h[i-1]+h[i])*M[i] + h[i]*M[i+1] = 6*(...)
    for (let i = 1; i < m - 1; i++) {
      const b = 2 * (h[i - 1] + h[i]);
      const r = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
      // forward sweep
      if (i === 1) { c[i] = h[i] / b; d[i] = r / b; }
      else { const denom = b - h[i - 1] * c[i - 1]; c[i] = h[i] / denom; d[i] = (r - h[i - 1] * d[i - 1]) / denom; }
    }
    for (let i = m - 2; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
    // evaluate
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const t = i;
      while (seg < m - 2 && t > xs[seg + 1]) seg++;
      while (seg > 0 && t < xs[seg]) seg--;
      const x0 = xs[seg], x1 = xs[seg + 1], hh = x1 - x0;
      const A = (x1 - t) / hh, B = (t - x0) / hh;
      out[i] = A * ys[seg] + B * ys[seg + 1] + ((A * A * A - A) * M[seg] + (B * B * B - B) * M[seg + 1]) * (hh * hh) / 6;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 3. Mirror-symmetric boundary extension (Rilling et al. 2003)        */
  /* ------------------------------------------------------------------ */
  /**
   * Extend the extrema lists beyond both ends so the spline envelopes do not
   * "swing" at the borders. Returns {tmin, zmin, tmax, zmax} as knot arrays.
   */
  function boundaryConditions(minIdx, maxIdx, x, nbsym) {
    nbsym = nbsym || 2;
    const n = x.length, last = n - 1;
    const rev = a => a.slice().reverse();
    const head = (a, k) => a.slice(0, Math.min(a.length, k));
    const tail = (a, k) => a.slice(Math.max(a.length - k, 0));
    let lmax, lmin, lsym, rmax, rmin, rsym;

    // ---- left end
    if (maxIdx[0] < minIdx[0]) {
      if (x[0] > x[minIdx[0]]) { lmax = rev(maxIdx.slice(1, nbsym + 1)); lmin = rev(head(minIdx, nbsym)); lsym = maxIdx[0]; }
      else { lmax = rev(head(maxIdx, nbsym)); lmin = rev(head(minIdx, nbsym - 1)).concat([0]); lsym = 0; }
    } else {
      if (x[0] < x[maxIdx[0]]) { lmax = rev(head(maxIdx, nbsym)); lmin = rev(minIdx.slice(1, nbsym + 1)); lsym = minIdx[0]; }
      else { lmax = rev(head(maxIdx, nbsym - 1)).concat([0]); lmin = rev(head(minIdx, nbsym)); lsym = 0; }
    }
    // ---- right end
    const mxL = maxIdx[maxIdx.length - 1], mnL = minIdx[minIdx.length - 1];
    if (mxL < mnL) {
      if (x[last] < x[mxL]) { rmax = rev(tail(maxIdx, nbsym)); rmin = rev(tail(minIdx.slice(0, -1), nbsym)); rsym = mnL; }
      else { rmax = [last].concat(rev(tail(maxIdx, nbsym - 1))); rmin = rev(tail(minIdx, nbsym)); rsym = last; }
    } else {
      if (x[last] > x[mnL]) { rmax = rev(tail(maxIdx.slice(0, -1), nbsym)); rmin = rev(tail(minIdx, nbsym)); rsym = mxL; }
      else { rmax = rev(tail(maxIdx, nbsym)); rmin = [last].concat(rev(tail(minIdx, nbsym - 1))); rsym = last; }
    }
    let tlmin = lmin.map(i => 2 * lsym - i), tlmax = lmax.map(i => 2 * lsym - i);
    let trmin = rmin.map(i => 2 * rsym - i), trmax = rmax.map(i => 2 * rsym - i);
    // in case the symmetrised parts do not extend far enough, reflect about the end point instead
    if ((tlmin.length && tlmin[0] > 0) || (tlmax.length && tlmax[0] > 0)) {
      if (lsym === maxIdx[0]) lmax = rev(head(maxIdx, nbsym)); else lmin = rev(head(minIdx, nbsym));
      lsym = 0; tlmin = lmin.map(i => 2 * lsym - i); tlmax = lmax.map(i => 2 * lsym - i);
    }
    if ((trmin.length && trmin[trmin.length - 1] < last) || (trmax.length && trmax[trmax.length - 1] < last)) {
      if (rsym === mxL) rmax = rev(tail(maxIdx, nbsym)); else rmin = rev(tail(minIdx, nbsym));
      rsym = last; trmin = rmin.map(i => 2 * rsym - i); trmax = rmax.map(i => 2 * rsym - i);
    }
    const tmin = tlmin.concat(minIdx, trmin), tmax = tlmax.concat(maxIdx, trmax);
    const zmin = lmin.map(i => x[i]).concat(minIdx.map(i => x[i]), rmin.map(i => x[i]));
    const zmax = lmax.map(i => x[i]).concat(maxIdx.map(i => x[i]), rmax.map(i => x[i]));
    return { tmin, zmin, tmax, zmax };
  }

  /** Upper / lower envelopes and their mean for one sifting step. */
  function envelopes(x, nbsym) {
    const { maxIdx, minIdx } = findExtrema(x);
    if (maxIdx.length + minIdx.length < 3 || maxIdx.length < 2 || minIdx.length < 2) return null;
    const bc = boundaryConditions(minIdx, maxIdx, x, nbsym);
    const upper = splineEvalGrid(bc.tmax, bc.zmax, x.length);
    const lower = splineEvalGrid(bc.tmin, bc.zmin, x.length);
    const meanEnv = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) meanEnv[i] = 0.5 * (upper[i] + lower[i]);
    return { maxIdx, minIdx, upper, lower, mean: meanEnv, knots: bc };
  }

  /* ------------------------------------------------------------------ */
  /* 4. Sifting and EMD                                                  */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = {
    sdThreshold: 0.2,   // Huang et al. 1998 suggest 0.2–0.3
    sNumber: 0,         // >0 enables the S-number criterion (Huang et al. 2003) instead of SD
    maxSift: 50,        // safety cap against over-sifting
    maxImf: 12,
    nbsym: 2,
  };

  /** Huang's standard-deviation criterion between successive sifts. */
  function siftSD(hPrev, hNew) {
    let num = 0, den = 0;
    for (let i = 0; i < hPrev.length; i++) { const d = hPrev[i] - hNew[i]; num += d * d; den += hPrev[i] * hPrev[i]; }
    return den === 0 ? 0 : num / den;
  }

  /**
   * Extract one IMF from `r` by sifting. Returns {imf, iterations, trace}.
   * `trace` (optional, when opts.trace) keeps every intermediate step for animation.
   */
  function siftIMF(r, opts) {
    opts = Object.assign({}, DEFAULTS, opts);
    let h = Float64Array.from(r), iter = 0, sCount = 0, lastSD = NaN;
    const trace = opts.trace ? [] : null;
    while (iter < opts.maxSift) {
      const env = envelopes(h, opts.nbsym);
      if (!env) break;
      const hNew = new Float64Array(h.length);
      for (let i = 0; i < h.length; i++) hNew[i] = h[i] - env.mean[i];
      const nExt = env.maxIdx.length + env.minIdx.length, nZc = countZeroCrossings(hNew);
      const sd = siftSD(h, hNew);
      iter++;
      if (trace) trace.push({ h: h, env, hNew, sd, nExt, nZc, iteration: iter });
      h = hNew; lastSD = sd;
      const imfLike = Math.abs(nExt - nZc) <= 1;
      if (opts.sNumber > 0) { sCount = imfLike ? sCount + 1 : 0; if (sCount >= opts.sNumber) break; }
      else if (sd < opts.sdThreshold && imfLike) break;
    }
    return { imf: h, iterations: iter, sd: lastSD, trace };
  }

  function isMonotonicOrFlat(r) {
    const { maxIdx, minIdx } = findExtrema(r);
    return maxIdx.length + minIdx.length < 2;
  }

  /**
   * Full EMD. Returns {imfs: Float64Array[], residue: Float64Array, iterations: number[]}.
   * The sum of all IMFs plus the residue reconstructs the input exactly (up to float error).
   */
  function emd(signal, opts) {
    opts = Object.assign({}, DEFAULTS, opts);
    let r = Float64Array.from(signal);
    const imfs = [], iterations = [];
    while (imfs.length < opts.maxImf && !isMonotonicOrFlat(r)) {
      const res = siftIMF(r, opts);
      if (res.iterations === 0) break;
      imfs.push(res.imf); iterations.push(res.iterations);
      const nr = new Float64Array(r.length);
      for (let i = 0; i < r.length; i++) nr[i] = r[i] - res.imf[i];
      r = nr;
    }
    return { imfs, residue: r, iterations };
  }

  /* ------------------------------------------------------------------ */
  /* 5. EEMD (Wu & Huang 2009)                                           */
  /* ------------------------------------------------------------------ */
  /**
   * Ensemble EMD. Adds white noise of amplitude `noiseStd` × std(x) in each of
   * `ensembles` trials, decomposes to a fixed number of modes `nModes`, averages.
   * `onProgress(k, total)` is called after each trial. Synchronous; for big
   * ensembles wrap in eemdAsync so the UI stays responsive.
   */
  function eemd(signal, opts) {
    opts = Object.assign({ ensembles: 50, noiseStd: 0.2, seed: 1, nModes: 0 }, DEFAULTS, opts);
    const n = signal.length, sig = std(signal);
    const nModes = opts.nModes || Math.max(1, Math.floor(Math.log2(n)) - 1);
    const acc = Array.from({ length: nModes }, () => new Float64Array(n));
    const accRes = new Float64Array(n);
    const rng = makeRng(opts.seed);
    for (let k = 0; k < opts.ensembles; k++) {
      const noisy = new Float64Array(n);
      for (let i = 0; i < n; i++) noisy[i] = signal[i] + opts.noiseStd * sig * rng.gauss();
      const d = emd(noisy, Object.assign({}, opts, { maxImf: nModes }));
      for (let m = 0; m < nModes; m++) {
        const src = d.imfs[m];
        if (src) { const a = acc[m]; for (let i = 0; i < n; i++) a[i] += src[i]; }
      }
      // whatever is left (residue + missing modes) goes to residue
      const rem = new Float64Array(n);
      for (let i = 0; i < n; i++) rem[i] = noisy[i];
      for (let m = 0; m < d.imfs.length && m < nModes; m++) for (let i = 0; i < n; i++) rem[i] -= d.imfs[m][i];
      for (let i = 0; i < n; i++) accRes[i] += rem[i];
      if (opts.onProgress) opts.onProgress(k + 1, opts.ensembles);
    }
    const inv = 1 / opts.ensembles;
    return { imfs: acc.map(a => a.map(v => v * inv)), residue: accRes.map(v => v * inv), ensembles: opts.ensembles, nModes };
  }

  /** Same as eemd but yields to the event loop every `chunk` trials. */
  async function eemdAsync(signal, opts) {
    opts = Object.assign({ ensembles: 50, noiseStd: 0.2, seed: 1, nModes: 0, chunk: 4 }, DEFAULTS, opts);
    const n = signal.length, sig = std(signal);
    const nModes = opts.nModes || Math.max(1, Math.floor(Math.log2(n)) - 1);
    const acc = Array.from({ length: nModes }, () => new Float64Array(n));
    const accRes = new Float64Array(n);
    const rng = makeRng(opts.seed);
    for (let k = 0; k < opts.ensembles; k++) {
      const noisy = new Float64Array(n);
      for (let i = 0; i < n; i++) noisy[i] = signal[i] + opts.noiseStd * sig * rng.gauss();
      const d = emd(noisy, Object.assign({}, opts, { maxImf: nModes }));
      const rem = Float64Array.from(noisy);
      for (let m = 0; m < nModes; m++) {
        const src = d.imfs[m]; if (!src) continue;
        const a = acc[m]; for (let i = 0; i < n; i++) { a[i] += src[i]; rem[i] -= src[i]; }
      }
      for (let i = 0; i < n; i++) accRes[i] += rem[i];
      if (opts.onProgress) opts.onProgress(k + 1, opts.ensembles);
      if ((k + 1) % opts.chunk === 0) await new Promise(res => setTimeout(res, 0));
      if (opts.signal && opts.signal.aborted) throw new Error('aborted');
    }
    const inv = 1 / opts.ensembles;
    return { imfs: acc.map(a => a.map(v => v * inv)), residue: accRes.map(v => v * inv), ensembles: opts.ensembles, nModes };
  }

  /* ------------------------------------------------------------------ */
  /* 6. FFT (radix-2 + Bluestein for arbitrary length) and Hilbert       */
  /* ------------------------------------------------------------------ */
  function fftRadix2(re, im) { // in place, length must be power of 2
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const ur = re[i + j], ui = im[i + j];
          const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
          const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  /** Forward DFT of arbitrary length n via Bluestein's chirp-z algorithm. Returns {re, im}. */
  function fft(reIn, imIn) {
    const n = reIn.length;
    imIn = imIn || new Float64Array(n);
    if ((n & (n - 1)) === 0) { const re = Float64Array.from(reIn), im = Float64Array.from(imIn); fftRadix2(re, im); return { re, im }; }
    let m = 1; while (m < 2 * n - 1) m <<= 1;
    const wr = new Float64Array(n), wi = new Float64Array(n);
    for (let k = 0; k < n; k++) { const ang = Math.PI * ((k * k) % (2 * n)) / n; wr[k] = Math.cos(ang); wi[k] = -Math.sin(ang); }
    const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
    for (let k = 0; k < n; k++) { ar[k] = reIn[k] * wr[k] - imIn[k] * wi[k]; ai[k] = reIn[k] * wi[k] + imIn[k] * wr[k]; }
    br[0] = wr[0]; bi[0] = -wi[0];
    for (let k = 1; k < n; k++) { br[k] = br[m - k] = wr[k]; bi[k] = bi[m - k] = -wi[k]; }
    fftRadix2(ar, ai); fftRadix2(br, bi);
    for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; }
    // inverse FFT of size m
    for (let k = 0; k < m; k++) ai[k] = -ai[k];
    fftRadix2(ar, ai);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k < n; k++) { const cr = ar[k] / m, ci = -ai[k] / m; re[k] = cr * wr[k] - ci * wi[k]; im[k] = cr * wi[k] + ci * wr[k]; }
    return { re, im };
  }

  function ifft(re, im) {
    const n = re.length, imc = Float64Array.from(im, v => -v);
    const out = fft(re, imc);
    return { re: out.re.map(v => v / n), im: out.im.map(v => -v / n) };
  }

  /** Analytic signal z = x + i·H[x] through the FFT (Marple 1999). */
  function analytic(x) {
    const n = x.length, X = fft(Float64Array.from(x));
    const h = new Float64Array(n);
    if (n % 2 === 0) { h[0] = 1; h[n / 2] = 1; for (let i = 1; i < n / 2; i++) h[i] = 2; }
    else { h[0] = 1; for (let i = 1; i <= (n - 1) / 2; i++) h[i] = 2; }
    for (let i = 0; i < n; i++) { X.re[i] *= h[i]; X.im[i] *= h[i]; }
    return ifft(X.re, X.im);
  }

  /**
   * Hilbert spectral analysis of one IMF: instantaneous amplitude and
   * frequency (Hz). Phase is unwrapped and differentiated by central differences.
   */
  function hilbert(imf, fs) {
    const z = analytic(imf), n = imf.length;
    const amp = new Float64Array(n), phase = new Float64Array(n);
    for (let i = 0; i < n; i++) { amp[i] = Math.hypot(z.re[i], z.im[i]); phase[i] = Math.atan2(z.im[i], z.re[i]); }
    // unwrap
    for (let i = 1; i < n; i++) { let d = phase[i] - phase[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; phase[i] = phase[i - 1] + d; }
    const freq = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? phase[1] - phase[0] : i === n - 1 ? phase[n - 1] - phase[n - 2] : (phase[i + 1] - phase[i - 1]) / 2;
      freq[i] = a * fs / (2 * Math.PI);
    }
    // energy-weighted mean frequency (ignore the 5 % borders where the Hilbert transform is least reliable)
    let num = 0, den = 0; const b = Math.floor(n * 0.05);
    for (let i = b; i < n - b; i++) { const w = amp[i] * amp[i]; num += w * freq[i]; den += w; }
    return { amp, freq, phase, meanFreq: den > 0 ? num / den : 0 };
  }

  /**
   * Hilbert spectrum H(t, f): accumulate a² of every IMF into a time×frequency grid.
   * Returns {grid: Float64Array[nT][nF] flattened as rows, nT, nF, fMax, dt, df}.
   */
  function hilbertSpectrum(imfs, fs, opts) {
    opts = Object.assign({ fMax: 30, nF: 120, nT: 150 }, opts);
    const n = imfs[0].length, dur = n / fs;
    const grid = new Float64Array(opts.nT * opts.nF);
    const dt = dur / opts.nT, df = opts.fMax / opts.nF;
    const perImf = [];
    for (const imf of imfs) {
      const h = hilbert(imf, fs); perImf.push(h);
      for (let i = 0; i < n; i++) {
        const f = h.freq[i]; if (!(f >= 0) || f >= opts.fMax) continue;
        const ti = Math.min(opts.nT - 1, Math.floor((i / fs) / dt)), fi = Math.floor(f / df);
        grid[ti * opts.nF + fi] += h.amp[i] * h.amp[i];
      }
    }
    return { grid, nT: opts.nT, nF: opts.nF, fMax: opts.fMax, dt, df, perImf };
  }

  /** Short-time Fourier power spectrogram (Hann window) on the same grid for comparison. */
  function stftSpectrogram(x, fs, opts) {
    opts = Object.assign({ fMax: 30, win: 2.0, nT: 150 }, opts);
    const n = x.length, dur = n / fs, W = Math.round(opts.win * fs);
    let nfft = 1; while (nfft < W * 2) nfft <<= 1; // zero-pad for smoother frequency axis
    const df = fs / nfft, nF = Math.floor(opts.fMax / df);
    const grid = new Float64Array(opts.nT * nF);
    const hann = new Float64Array(W); for (let i = 0; i < W; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (W - 1));
    for (let t = 0; t < opts.nT; t++) {
      const center = Math.round((t + 0.5) / opts.nT * n);
      const re = new Float64Array(nfft), im = new Float64Array(nfft);
      for (let i = 0; i < W; i++) { const k = center - Math.floor(W / 2) + i; re[i] = (k >= 0 && k < n) ? x[k] * hann[i] : 0; }
      fftRadix2(re, im);
      for (let f = 0; f < nF; f++) grid[t * nF + f] = (re[f] * re[f] + im[f] * im[f]) / W;
    }
    return { grid, nT: opts.nT, nF, fMax: nF * df, dt: dur / opts.nT, df };
  }

  /** Welch-free simple periodogram (Hann) returning {freq, power} up to fMax. */
  function powerSpectrum(x, fs, fMax) {
    const n = x.length; let nfft = 1; while (nfft < n) nfft <<= 1;
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    const m = mean(x);
    for (let i = 0; i < n; i++) re[i] = (x[i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    fftRadix2(re, im);
    const df = fs / nfft, k = Math.floor((fMax || fs / 2) / df);
    const freq = new Float64Array(k), power = new Float64Array(k);
    for (let i = 0; i < k; i++) { freq[i] = i * df; power[i] = (re[i] * re[i] + im[i] * im[i]) / n; }
    return { freq, power };
  }

  /* ------------------------------------------------------------------ */
  /* 7. Feature helpers for the sleep-staging demo                       */
  /* ------------------------------------------------------------------ */
  const BANDS = [
    { key: 'delta', label: 'δ 0.5–4 Hz', lo: 0.5, hi: 4 },
    { key: 'theta', label: 'θ 4–8 Hz', lo: 4, hi: 8 },
    { key: 'alpha', label: 'α 8–12 Hz', lo: 8, hi: 12 },
    { key: 'sigma', label: 'σ 12–16 Hz', lo: 12, hi: 16 },
    { key: 'beta', label: 'β 16–30 Hz', lo: 16, hi: 30 },
  ];
  function bandOf(f) { if (f < 0.5) return 'slow'; for (const b of BANDS) if (f < b.hi) return b.key; return 'gamma'; }

  /** Per-IMF descriptors: energy share, mean instantaneous frequency, band, statistics. */
  function describeImfs(dec, fs) {
    const all = dec.imfs.concat([dec.residue]);
    const total = all.reduce((s, a) => s + energy(a), 0) || 1;
    return dec.imfs.map((imf, i) => {
      const h = hilbert(imf, fs);
      return { index: i + 1, energyShare: energy(imf) / total, meanFreq: h.meanFreq, band: bandOf(h.meanFreq),
        rms: Math.sqrt(energy(imf) / imf.length), skewness: skewness(imf), kurtosis: kurtosis(imf), iterations: dec.iterations ? dec.iterations[i] : undefined };
    });
  }

  root.EMD = {
    findExtrema, countZeroCrossings, splineEvalGrid, boundaryConditions, envelopes,
    siftIMF, emd, eemd, eemdAsync, siftSD, DEFAULTS,
    fft, ifft, analytic, hilbert, hilbertSpectrum, stftSpectrogram, powerSpectrum,
    describeImfs, BANDS, bandOf, makeRng, stats: { mean, std, energy, skewness, kurtosis },
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
