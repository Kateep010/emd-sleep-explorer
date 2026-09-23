import json, numpy as np, time
from PyEMD import EMD
d=json.load(open('/Users/linyiping/sandbox/emd-sleep-explorer/data/epochs.json'))
out={}
for ep in d['epochs']:
    x=np.array(ep['eeg'],dtype=float)
    emd=EMD(spline_kind='cubic', extrema_detection='simple', nbsym=2)
    emd.FIXE=0; emd.FIXE_H=0; emd.MAX_ITERATION=50
    # make PyEMD's stopping rule as close as possible to Huang's SD<0.2: disable its svar/std tests, keep energy-ratio (= Huang SD) at 0.2
    emd.svar_thr=0.0; emd.std_thr=0.0; emd.energy_ratio_thr=0.2
    t0=time.time(); imfs=emd.emd(x, max_imf=-1); dt=time.time()-t0
    # PyEMD returns IMFs + residue as last row
    out[ep['id']]={'imfs':[np.round(r,4).tolist() for r in imfs[:-1]],'residue':np.round(imfs[-1],4).tolist(),'ms':round(dt*1000,1)}
    print(ep['id'], 'PyEMD nIMF', len(imfs)-1, f'{dt*1000:.0f} ms')
json.dump(out,open('/private/tmp/claude-501/-Users-linyiping-sandbox/b43abba6-61fd-46d1-ba0d-716f87fb65a3/scratchpad/py_imfs.json','w'))
