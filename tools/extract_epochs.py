"""Extract real 30-s Fpz-Cz EEG epochs (100 Hz) per sleep stage from Sleep-EDF SC4002E0.
Picks epochs from the middle of the night; for N2 prefers epochs with YASA-detected spindles.
Output: emd-sleep-explorer/data/epochs.json"""
import json, numpy as np, mne, yasa
psg = "data/SC4002E0-PSG.edf"; hyp = "data/SC4002EC-Hypnogram.edf"
raw = mne.io.read_raw_edf(psg, preload=True, verbose=False)
ann = mne.read_annotations(hyp)
raw.set_annotations(ann, emit_warning=False)
sf = raw.info["sfreq"]; assert sf == 100.0, sf
eeg = raw.get_data(picks=["EEG Fpz-Cz"], units="uV")[0]
eog = raw.get_data(picks=["EOG horizontal"], units="uV")[0]
emg = raw.get_data(picks=["EMG submental"], units="uV")[0]
print("channels", raw.ch_names, "len(h)", len(eeg)/sf/3600)
# per-epoch stage labels
n_ep = int(len(eeg) // (30*sf))
stage = np.full(n_ep, "", dtype=object)
mapping = {"Sleep stage W":"W","Sleep stage 1":"N1","Sleep stage 2":"N2","Sleep stage 3":"N3","Sleep stage 4":"N3","Sleep stage R":"REM"}
for a in ann:
    if a["description"] not in mapping: continue
    s = int(round(a["onset"]/30)); e = int(round((a["onset"]+a["duration"])/30))
    stage[s:min(e,n_ep)] = mapping[a["description"]]
# lights-off/on window: first and last non-W epoch
sleep_idx = np.where(np.isin(stage, ["N1","N2","N3","REM"]))[0]
first, last = sleep_idx[0], sleep_idx[-1]
print("sleep window epochs", first, last, "hours", first/120, last/120)
rng = np.random.default_rng(42)
def clean(i):
    x = eeg[i*3000:(i+1)*3000]
    return np.max(np.abs(x)) < 150 and np.std(x) > 1.0   # reject artefacts / flat
# spindle detection on N2 epochs within window (single channel)
sub = raw.copy().pick(["EEG Fpz-Cz"])
hyp_per_sample = None
sp = yasa.spindles_detect(sub, hypno=None, verbose=False)
sp_df = sp.summary() if sp is not None else None
sp_counts = np.zeros(n_ep, int)
if sp_df is not None:
    for _, r in sp_df.iterrows():
        sp_counts[int(r["Start"]//30)] += 1
print("total spindles", 0 if sp_df is None else len(sp_df))
sel = {}
for st, k in [("W",3),("N1",3),("N2",4),("N3",3),("REM",3)]:
    cand = [i for i in range(first+20, last-20) if stage[i]==st and clean(i)]
    # avoid stage boundaries: require neighbours same stage
    cand = [i for i in cand if stage[i-1]==st and stage[i+1]==st]
    if st=="N2":
        cand = sorted(cand, key=lambda i: -sp_counts[i])
        top = cand[:40]; pick = list(rng.choice(top, size=min(k,len(top)), replace=False))
    elif st=="W":
        # wake after sleep onset: exclude epochs dominated by slow eye-movement / sweat drift (>80 uV peaks)
        cand = [i for i in cand if np.max(np.abs(eeg[i*3000:(i+1)*3000])) < 80]
        pick = list(rng.choice(cand, size=k, replace=False))
    else:
        pick = list(rng.choice(cand, size=k, replace=False))
    sel[st] = sorted(int(i) for i in pick)
    print(st, "candidates", len(cand), "picked", sel[st], "spindles", [int(sp_counts[i]) for i in sel[st]])
out = {"source":"PhysioNet Sleep-EDF Expanded (sleep-cassette) SC4002E0, channel EEG Fpz-Cz, 100 Hz, 30-s epochs, unit µV; hypnogram from SC4002EC (expert R&K scoring, S3+S4 merged as N3)",
       "license":"Open Data Commons Attribution License v1.0 (PhysioNet)",
       "fs":100, "epoch_sec":30, "epochs":[]}
for st, idxs in sel.items():
    for i in idxs:
        x = eeg[i*3000:(i+1)*3000]
        out["epochs"].append({"id":f"{st}-{i}","stage":st,"epoch":i,"clock_h":round(i/120,2),
                              "spindles":int(sp_counts[i]),
                              "eeg":[round(float(v),1) for v in x]})
json.dump(out, open("/Users/linyiping/sandbox/emd-sleep-explorer/data/epochs.json","w"), separators=(",",":"))
import os; print("written", os.path.getsize("/Users/linyiping/sandbox/emd-sleep-explorer/data/epochs.json")/1024, "KB", len(out["epochs"]), "epochs")
