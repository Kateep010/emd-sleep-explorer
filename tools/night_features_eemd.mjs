// node tools/night_features_eemd.mjs <night.f32> <night_meta.json> [ensembles] [noise]
// Same as night_features.mjs but with EEMD (fixed 8 modes) → data/night_eemd.js
import '../js/emd.js'; import fs from 'node:fs';
const E = globalThis.EMD, FS = 100, N = 3000;
const [,, f32Path, metaPath, ensArg, noiseArg] = process.argv; const ens = +(ensArg || 50), noise = +(noiseArg || 0.2);
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const buf = fs.readFileSync(f32Path); const all = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const out = []; const t0 = Date.now();
for (let k = 0; k < meta.n_epochs; k++) {
  const x = Float64Array.from(all.subarray(k * N, (k + 1) * N));
  const dec = E.eemd(x, { ensembles: ens, noiseStd: noise, nModes: 8, seed: 11 + k }), d = E.describeImfs(dec, FS);
  const share = (lo, hi) => d.filter(o => o.meanFreq >= lo && o.meanFreq < hi).reduce((s, o) => s + o.energyShare, 0);
  const dom = d.reduce((a, b) => (b.energyShare > a.energyShare ? b : a), d[0]);
  const r3 = v => Math.round(v * 1000) / 1000;
  out.push({ e: meta.first_epoch + k, s: meta.stages[k], d: r3(share(0, 4)), t: r3(share(4, 8)), a: r3(share(8, 12)), g: r3(share(12, 16)), b: r3(share(16, 1e9)),
    f1: r3(d[0].meanFreq), fd: r3(dom.meanFreq), r: r3(Math.sqrt(E.stats.energy(x) / N)), n: 8, k1: r3(d[0].kurtosis),
    m: d.map(o => [r3(o.meanFreq), r3(o.energyShare)]) });
  if (k % 100 === 0) console.log(k, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
const night = { source: `Sleep-EDF SC4002E0, EEG Fpz-Cz, 100 Hz; per-epoch EEMD (${ens} ensembles, noise ${noise} σ, 8 modes) features computed with js/emd.js`, first_epoch: meta.first_epoch, start_clock_h: meta.start_clock_h, epochs: out };
fs.writeFileSync(new URL('../data/night_eemd.js', import.meta.url), 'window.SLEEP_NIGHT_EEMD = ' + JSON.stringify(night) + ';\n');
console.log(`done ${out.length} epochs in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
