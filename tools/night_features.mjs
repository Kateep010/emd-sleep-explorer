// Run:  node tools/night_features.mjs <night.f32> <night_meta.json>
// Computes EMD/Hilbert features for every 30-s epoch of the night (using js/emd.js) → data/night.js
import '../js/emd.js'; import fs from 'node:fs';
const E = globalThis.EMD, FS = 100, N = 3000;
const [,, f32Path, metaPath] = process.argv;
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const buf = fs.readFileSync(f32Path); const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const out = []; const t0 = Date.now(); const jsImfs = {};
for (let k = 0; k < meta.n_epochs; k++) {
  const x = Float64Array.from(all.subarray(k * N, (k + 1) * N));
  const dec = E.emd(x), d = E.describeImfs(dec, FS);
  const share = (lo, hi) => d.filter(o => o.meanFreq >= lo && o.meanFreq < hi).reduce((s, o) => s + o.energyShare, 0);
  const dom = d.reduce((a, b) => (b.energyShare > a.energyShare ? b : a), d[0]);
  const r3 = v => Math.round(v * 1000) / 1000;
  out.push({ e: meta.first_epoch + k, s: meta.stages[k], d: r3(share(0, 4)), t: r3(share(4, 8)), a: r3(share(8, 12)), g: r3(share(12, 16)), b: r3(share(16, 1e9)),
    f1: r3(d[0].meanFreq), fd: r3(dom.meanFreq), r: r3(Math.sqrt(E.stats.energy(x) / N)), n: dec.imfs.length, k1: r3(d[0].kurtosis) });
  const id = `${meta.stages[k]}-${meta.first_epoch + k}`; if (process.env.DUMP_IDS && process.env.DUMP_IDS.split(',').includes(id)) jsImfs[id] = dec.imfs.map(m => Array.from(m, v => Math.round(v * 1e4) / 1e4));
}
const night = { source: 'Sleep-EDF SC4002E0, EEG Fpz-Cz, 100 Hz; per-epoch EMD features computed with js/emd.js', first_epoch: meta.first_epoch, start_clock_h: meta.start_clock_h, epochs: out };
fs.writeFileSync(new URL('../data/night.js', import.meta.url), 'window.SLEEP_NIGHT = ' + JSON.stringify(night) + ';\n');
fs.writeFileSync(new URL('../data/night.json', import.meta.url), JSON.stringify(night));
if (process.env.DUMP_OUT) fs.writeFileSync(process.env.DUMP_OUT, JSON.stringify(jsImfs));
console.log(`epochs ${out.length}, ${(Date.now() - t0)} ms, night.js ${(fs.statSync(new URL('../data/night.js', import.meta.url)).size / 1024).toFixed(0)} KB`);
const by = {}; for (const o of out) { (by[o.s] = by[o.s] || []).push(o); }
for (const s of ['W', 'N1', 'N2', 'N3', 'REM']) { const a = by[s] || []; const med = k => { const v = a.map(o => o[k]).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : NaN; }; console.log(s.padEnd(4), 'n=' + a.length, 'δ', med('d'), 'θ', med('t'), 'α', med('a'), 'σ', med('g'), 'β', med('b'), 'IF1', med('f1'), 'RMS', med('r'), 'nIMF', med('n')); }
