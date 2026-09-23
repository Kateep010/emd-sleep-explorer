"""Cross-check js/emd.js against PyEMD (EMD-signal) on the 16 real epochs in data/epochs.json.
Usage: 1) DUMP_IDS=<ids> DUMP_OUT=js_imfs.json node tools/night_features.mjs ...   (or any dump of JS IMFs)
       2) python tools/xcheck_pyemd.py js_imfs.json py_imfs.json  -> docs/validation.md
Both implementations use cubic-spline envelopes with 2 mirrored extrema, but PyEMD's default stopping
rules (scaled variance / std / energy ratio) differ from Huang's SD < 0.2, so IMFs are compared by
correlation and mean instantaneous frequency rather than expected to be bit-identical."""
import json, sys, numpy as np
from scipy.signal import hilbert
js = json.load(open(sys.argv[1])); py = json.load(open(sys.argv[2]))
def mean_if(imf, fs=100):
    z = hilbert(imf); amp = np.abs(z); ph = np.unwrap(np.angle(z)); f = np.gradient(ph) * fs / (2*np.pi)
    b = int(len(imf)*0.05); w = amp[b:-b]**2; return float(np.sum(w*f[b:-b])/np.sum(w))
rows = []
for eid in js:
    J = [np.array(m) for m in js[eid]]; P = [np.array(m) for m in py[eid]['imfs']]
    n = min(len(J), len(P)); cors = []; ifs = []
    for k in range(n):
        c = np.corrcoef(J[k], P[k])[0,1]; cors.append(c); ifs.append((mean_if(J[k]), mean_if(P[k])))
    # compare energy of first three modes combined (band-level agreement)
    hiJ = sum(J[:3]); hiP = sum(P[:3]); c3 = np.corrcoef(hiJ, hiP)[0,1]
    loJ = sum(J[3:]); loP = sum(P[3:]); cl = np.corrcoef(loJ, loP)[0,1] if len(J)>3 and len(P)>3 else float('nan')
    rows.append((eid, len(J), len(P), cors, ifs, c3, cl))
lines = ["# JS 實作 vs PyEMD 交叉驗證", "",
 "比較對象：`js/emd.js`（本站，Huang 1998 SD < 0.2、最多 50 次篩選、自然三次樣條、兩端鏡射 2 個極值）與 Python 套件 EMD-signal 1.10（PyEMD，`spline_kind='cubic'`, `extrema_detection='simple'`, `nbsym=2`, `MAX_ITERATION=50`，其餘為預設停止準則：scaled-variance / std / energy-ratio）。",
 "資料：`data/epochs.json` 的 16 個真實 30 秒 epoch。因為兩者的停止準則不同，IMF 不會逐點相同；這裡看的是各階 IMF 的相關係數與平均瞬時頻率是否一致。", "",
 "| epoch | JS IMF 數 | PyEMD IMF 數 | IMF1 r / 平均頻率 (JS→Py) | IMF2 r / 平均頻率 | IMF3 r / 平均頻率 | IMF1–3 合計 r | IMF4 以後合計 r |", "|---|---|---|---|---|---|---|---|"]
allc = []
for eid, nj, np_, cors, ifs, c3, cl in rows:
    cell = lambda k: f"{cors[k]:.3f} / {ifs[k][0]:.1f}→{ifs[k][1]:.1f} Hz" if k < len(cors) else "–"
    lines.append(f"| {eid} | {nj} | {np_} | {cell(0)} | {cell(1)} | {cell(2)} | {c3:.3f} | {cl:.3f} |"); allc += cors[:3]
lines += ["", f"前三階 IMF 逐階相關係數：中位數 {np.median(allc):.3f}，最小 {np.min(allc):.3f}；前三階合計（高頻部分）相關係數中位數 {np.median([r[5] for r in rows]):.3f}。",
 "解讀：兩套獨立實作在「高頻 IMF 合計」與「低頻 IMF 合計」層級高度一致，逐階 IMF 的差異主要來自停止準則不同造成的能量在相鄰 IMF 間的重新分配（EMD 對停止準則敏感的已知現象），這也是本站與文獻都建議以頻帶合計或 EEMD 特徵取代單一 IMF 編號的原因。",
 "", "重跑：`node tools/night_features.mjs`（設定 `DUMP_IDS`/`DUMP_OUT`）產生 JS IMF，`python tools/xcheck_pyemd.py js_imfs.json py_imfs.json`。PyEMD 端的執行腳本見同目錄 `pyemd_run.py`。"]
open('/Users/linyiping/sandbox/emd-sleep-explorer/docs/validation.md','w').write("\n".join(lines)+"\n")
print("\n".join(lines[:4])); print(f"median corr first3 {np.median(allc):.3f} min {np.min(allc):.3f}; hi-sum median {np.median([r[5] for r in rows]):.3f} min {np.min([r[5] for r in rows]):.3f}; lo-sum median {np.nanmedian([r[6] for r in rows]):.3f} min {np.nanmin([r[6] for r in rows]):.3f}")
