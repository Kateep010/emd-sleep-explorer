import json, numpy as np, mne
psg="data/SC4002E0-PSG.edf"; hyp="data/SC4002EC-Hypnogram.edf"
raw=mne.io.read_raw_edf(psg,preload=True,verbose=False); ann=mne.read_annotations(hyp)
eeg=raw.get_data(picks=["EEG Fpz-Cz"],units="uV")[0].astype(np.float32); sf=100
n_ep=int(len(eeg)//3000); stage=np.full(n_ep,"?",dtype=object)
mp={"Sleep stage W":"W","Sleep stage 1":"N1","Sleep stage 2":"N2","Sleep stage 3":"N3","Sleep stage 4":"N3","Sleep stage R":"REM"}
for a in ann:
    if a["description"] in mp:
        s=int(round(a["onset"]/30)); e=int(round((a["onset"]+a["duration"])/30)); stage[s:min(e,n_ep)]=mp[a["description"]]
sl=np.where(np.isin(stage,["N1","N2","N3","REM"]))[0]; first=max(0,sl[0]-60); last=min(n_ep-1,sl[-1]+60)
idx=np.arange(first,last+1); seg=eeg[first*3000:(last+1)*3000]
seg.tofile("/private/tmp/claude-501/-Users-linyiping-sandbox/b43abba6-61fd-46d1-ba0d-716f87fb65a3/scratchpad/night.f32")
meas=raw.info["meas_date"]; start_clock=(meas.hour+meas.minute/60+ (first*30)/3600) if meas else None
json.dump({"first_epoch":int(first),"n_epochs":int(len(idx)),"stages":[str(s) for s in stage[idx]],"start_clock_h":start_clock,"meas_date":str(meas)},
          open("/private/tmp/claude-501/-Users-linyiping-sandbox/b43abba6-61fd-46d1-ba0d-716f87fb65a3/scratchpad/night_meta.json","w"))
print("epochs",first,last,len(idx),"start clock",start_clock, "counts",{k:int((stage[idx]==k).sum()) for k in ["W","N1","N2","N3","REM","?"]})
