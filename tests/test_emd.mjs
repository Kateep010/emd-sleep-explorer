// Run: node tests/test_emd.mjs  — sanity tests for js/emd.js (no dependencies)
import '../js/emd.js';
const E = globalThis.EMD;
let failed = 0;
function check(name, ok, detail = '') { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!ok) failed++; }

// 1. spline reproduces a cubic exactly at the knots and smoothly between
{ const xs = [0, 10, 20, 35, 50], ys = xs.map(v => Math.sin(v / 8)); const y = E.splineEvalGrid(xs, ys, 51);
  check('spline hits knots', xs.every((x, i) => Math.abs(y[x] - ys[i]) < 1e-9)); }

// 2. FFT: Bluestein vs direct DFT on odd length
{ const n = 37, x = Float64Array.from({ length: n }, (_, i) => Math.cos(0.3 * i) + 0.1 * i);
  const F = E.fft(x); let err = 0;
  for (let k = 0; k < n; k++) { let re = 0, im = 0; for (let t = 0; t < n; t++) { re += x[t] * Math.cos(-2 * Math.PI * k * t / n); im += x[t] * Math.sin(-2 * Math.PI * k * t / n); } err = Math.max(err, Math.abs(re - F.re[k]), Math.abs(im - F.im[k])); }
  check('Bluestein FFT matches DFT (n=37)', err < 1e-8, 'max err ' + err.toExponential(2)); }

// 3. Hilbert transform of a pure tone gives constant amplitude and correct frequency
{ const fs = 100, n = 3000, f0 = 7; const x = Float64Array.from({ length: n }, (_, i) => 3 * Math.sin(2 * Math.PI * f0 * i / fs));
  const h = E.hilbert(x, fs); const mid = h.freq.slice(300, 2700), amp = h.amp.slice(300, 2700);
  const fMean = mid.reduce((a, b) => a + b) / mid.length, aMean = amp.reduce((a, b) => a + b) / amp.length;
  check('Hilbert IF of 7 Hz tone', Math.abs(fMean - f0) < 0.02, 'mean IF ' + fMean.toFixed(3));
  check('Hilbert amplitude of tone = 3', Math.abs(aMean - 3) < 0.02, 'mean amp ' + aMean.toFixed(3)); }

// 4. EMD reconstruction: sum(IMFs)+residue == signal
{ const fs = 100, n = 3000; const rng = E.makeRng(7);
  const x = Float64Array.from({ length: n }, (_, i) => 20 * Math.sin(2 * Math.PI * 1.5 * i / fs) + 5 * Math.sin(2 * Math.PI * 12 * i / fs) + 0.01 * i + 2 * rng.gauss());
  const t0 = performance.now(); const d = E.emd(x); const ms = performance.now() - t0;
  let err = 0; for (let i = 0; i < n; i++) { let s = d.residue[i]; for (const m of d.imfs) s += m[i]; err = Math.max(err, Math.abs(s - x[i])); }
  check('EMD reconstruction exact', err < 1e-9, `nIMF=${d.imfs.length} sifts=${d.iterations.join(',')} err=${err.toExponential(1)} time=${ms.toFixed(0)} ms`);
  const desc = E.describeImfs(d, fs);
  console.log('   IMF mean freqs (Hz):', desc.map(o => o.meanFreq.toFixed(2)).join(' '), ' energy%:', desc.map(o => (100 * o.energyShare).toFixed(1)).join(' '));
  // the 12 Hz and 1.5 Hz components should show up as dominant IMFs
  const near = f => desc.some(o => Math.abs(o.meanFreq - f) < 0.4 && o.energyShare > 0.05);
  check('1.5 Hz component recovered as an IMF', near(1.5));
  // with white noise the weak 12 Hz tone is spread over the first two IMFs (mode mixing) — their sum must still track it
  const tone12 = Float64Array.from({ length: n }, (_, i) => 5 * Math.sin(2 * Math.PI * 12 * i / fs));
  const hiSum = new Float64Array(n); for (let i = 0; i < n; i++) hiSum[i] = d.imfs[0][i] + (d.imfs[1] ? d.imfs[1][i] : 0);
  let sa = 0, sb = 0, sab = 0; for (let i = 100; i < n - 100; i++) { sa += hiSum[i] ** 2; sb += tone12[i] ** 2; sab += hiSum[i] * tone12[i]; }
  const c = sab / Math.sqrt(sa * sb);
  // expected ceiling ≈ sqrt(SNR/(1+SNR)) = sqrt(12.5/16.5) ≈ 0.87 because the white noise also lands in these IMFs
  check('12 Hz tone captured by IMF1+IMF2 (corr > 0.8)', c > 0.8, 'corr ' + c.toFixed(3)); }

// 5. Two-tone separation without noise (classic EMD test; ratio 0.15 is well inside the separable region)
{ const fs = 100, n = 2000; const x = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 10 * i / fs) + Math.sin(2 * Math.PI * 1.5 * i / fs));
  const d = E.emd(x); const desc = E.describeImfs(d, fs);
  check('two-tone: IMF1 ≈ 10 Hz', Math.abs(desc[0].meanFreq - 10) < 0.3, desc[0].meanFreq.toFixed(2));
  check('two-tone: IMF2 ≈ 1.5 Hz', desc.length > 1 && Math.abs(desc[1].meanFreq - 1.5) < 0.3, desc[1] ? desc[1].meanFreq.toFixed(2) : 'none');
  let err = 0; const hi = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 10 * i / fs));
  for (let i = 100; i < n - 100; i++) err = Math.max(err, Math.abs(d.imfs[0][i] - hi[i]));
  check('two-tone: IMF1 tracks the 10 Hz tone (interior max err < 0.05)', err < 0.05, err.toFixed(4)); }

// 6. Mode mixing demo: intermittent burst + low tone → EMD mixes, EEMD separates
{ const fs = 100, n = 1500; const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = Math.sin(2 * Math.PI * 1 * i / fs); if ((i > 300 && i < 450) || (i > 900 && i < 1050)) x[i] += 0.4 * Math.sin(2 * Math.PI * 14 * i / fs); }
  const d = E.emd(x); const e = E.eemd(x, { ensembles: 30, noiseStd: 0.2, nModes: 5, seed: 3 });
  const lowTone = Float64Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * 1 * i / fs));
  const corr = (a, b) => { let sa = 0, sb = 0, sab = 0; for (let i = 100; i < n - 100; i++) { sa += a[i] * a[i]; sb += b[i] * b[i]; sab += a[i] * b[i]; } return sab / Math.sqrt(sa * sb); };
  // In plain EMD the 1 Hz tone leaks into IMF1 where the burst is absent; find best-matching IMF for the tone
  const bestEmd = Math.max(...d.imfs.map(m => corr(m, lowTone)));
  const bestEemd = Math.max(...e.imfs.map(m => corr(m, lowTone)));
  console.log(`   mode-mixing: best corr with 1 Hz tone  EMD=${bestEmd.toFixed(3)}  EEMD=${bestEemd.toFixed(3)}  (EMD nIMF=${d.imfs.length})`);
  check('EEMD recovers the 1 Hz tone at least as well as EMD', bestEemd >= bestEmd - 0.02); }

// 7. Real sleep EEG epochs decompose and reconstruct; report timing
{ const fs = 100; const data = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/epochs.json', import.meta.url)));
  let worst = 0, tsum = 0;
  for (const ep of data.epochs) { const x = Float64Array.from(ep.eeg); const t0 = performance.now(); const d = E.emd(x); tsum += performance.now() - t0;
    let err = 0; for (let i = 0; i < x.length; i++) { let s = d.residue[i]; for (const m of d.imfs) s += m[i]; err = Math.max(err, Math.abs(s - x[i])); } worst = Math.max(worst, err);
    const desc = E.describeImfs(d, fs); console.log(`   ${ep.id.padEnd(9)} nIMF=${d.imfs.length}  meanIF=${desc.slice(0, 6).map(o => o.meanFreq.toFixed(1)).join('/')}  E%=${desc.slice(0, 6).map(o => (100 * o.energyShare).toFixed(0)).join('/')}`); }
  check('all 16 real epochs reconstruct exactly', worst < 1e-8, `worst err ${worst.toExponential(1)}, mean time ${(tsum / data.epochs.length).toFixed(0)} ms/epoch`); }

console.log(failed ? `\n${failed} test(s) FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
