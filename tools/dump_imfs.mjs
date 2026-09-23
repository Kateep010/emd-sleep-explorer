// node tools/dump_imfs.mjs <out.json> [strict]  — dump js/emd.js IMFs for the 16 epochs in data/epochs.json
import '../js/emd.js'; import fs from 'node:fs';
const E = globalThis.EMD; const strict = process.argv[3] === 'strict';
const d = JSON.parse(fs.readFileSync(new URL('../data/epochs.json', import.meta.url))); const out = {};
for (const ep of d.epochs) { const dec = E.emd(Float64Array.from(ep.eeg), { strictExtrema: strict }); out[ep.id] = dec.imfs.map(m => Array.from(m, v => Math.round(v * 1e4) / 1e4)); }
fs.writeFileSync(process.argv[2], JSON.stringify(out)); console.log('dumped', Object.keys(out).length, 'epochs', strict ? '(strict)' : '(Huang 1998)');
