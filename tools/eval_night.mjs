import fs from 'node:fs';
const load = f => { const s = fs.readFileSync(f, 'utf8'); return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, '')); };
// Run from the repo root:  node tools/eval_night.mjs
const emd = load('data/night.js').epochs, eemd = load('data/night_eemd.js').epochs;
const ST = ['W', 'N1', 'N2', 'N3', 'REM'];
function feats(o, mode) { const base = mode === 'two' ? [o.d, o.r] : [o.d, o.t, o.a, o.g, o.b, o.f1, o.fd, o.r, o.k1, Math.log(o.r)]; if (mode === 'modes' && o.m) return base.concat(o.m.flatMap(m => [m[0], m[1]])); return base; }
function evalSet(data, mode, clf, k = 5) {
  const pts = data.filter(o => ST.includes(o.s)); const X = pts.map(o => feats(o, mode)); const D = X[0].length;
  const mu = Array(D).fill(0), sd = Array(D).fill(0); for (const x of X) x.forEach((v, j) => mu[j] += v / X.length); for (const x of X) x.forEach((v, j) => sd[j] += (v - mu[j]) ** 2 / X.length); const Z = X.map(x => x.map((v, j) => (v - mu[j]) / (Math.sqrt(sd[j]) || 1)));
  let correct = 0; const cm = {}; for (const a of ST) { cm[a] = {}; for (const b of ST) cm[a][b] = 0; }
  if (clf === 'nc') { const sum = {}; pts.forEach((o, i) => { const c = sum[o.s] = sum[o.s] || { v: Array(D).fill(0), n: 0 }; Z[i].forEach((v, j) => c.v[j] += v); c.n++; });
    pts.forEach((o, i) => { let best = null, bd = Infinity; for (const st of ST) { const c = sum[st]; const nn = c.n - (st === o.s ? 1 : 0); if (nn <= 0) continue; let d = 0; for (let j = 0; j < D; j++) { const cj = (c.v[j] - (st === o.s ? Z[i][j] : 0)) / nn; d += (Z[i][j] - cj) ** 2; } if (d < bd) { bd = d; best = st; } } cm[o.s][best]++; if (best === o.s) correct++; }); }
  else { pts.forEach((o, i) => { const ds = []; for (let q = 0; q < Z.length; q++) { if (q === i) continue; let d = 0; for (let j = 0; j < D; j++) d += (Z[i][j] - Z[q][j]) ** 2; ds.push([d, pts[q].s]); } ds.sort((a, b) => a[0] - b[0]); const votes = {}; for (let t = 0; t < k; t++) votes[ds[t][1]] = (votes[ds[t][1]] || 0) + 1; const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0]; cm[o.s][best]++; if (best === o.s) correct++; }); }
  const N = pts.length, po = correct / N; let pe = 0; for (const st of ST) { const row = ST.reduce((s, b) => s + cm[st][b], 0), col = ST.reduce((s, a) => s + cm[a][st], 0); pe += (row / N) * (col / N); }
  return { acc: po, kappa: (po - pe) / (1 - pe), D };
}
for (const [name, data] of [['EMD', emd], ['EEMD', eemd]]) for (const mode of ['two', 'all', 'modes']) for (const clf of ['nc', 'knn']) { if (mode === 'modes' && name === 'EMD') continue; const r = evalSet(data, mode, clf, 7); console.log(name.padEnd(5), mode.padEnd(6), clf.padEnd(4), `D=${r.D}`, `acc ${(100 * r.acc).toFixed(1)}%`, `κ ${r.kappa.toFixed(2)}`); }
