#!/bin/zsh
# Zeabur 部署腳本（純靜態站）。前提：
#   1) npx zeabur@latest auth login  已登入
#   2) 帳號已有一台伺服器（Zeabur 2026-09 起共享叢集停用，建立專案必須指定 server-XXXX 當 region）：
#        npx zeabur@latest server catalog        # 看方案與價格
#        npx zeabur@latest server rent --provider <PROVIDER> --region <REGION> --plan <PLAN>
# 用法：tools/deploy_zeabur.sh [專案名稱] [子網域]
set -e
NAME=${1:-yeyeye-ya}; SUB=${2:-yeyeye-ya}
cd "$(dirname "$0")/.."
SERVER_ID=$(npx --yes zeabur@latest server list --json 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);s=d if isinstance(d,list) else d.get("servers",d.get("items",[]));print(s[0]["_id"] if s and "_id" in s[0] else (s[0].get("id","") if s else ""))')
if [ -z "$SERVER_ID" ]; then echo "尚無伺服器：請先 npx zeabur@latest server rent ...（見本檔開頭）"; exit 1; fi
echo "使用伺服器 $SERVER_ID"
PROJECT_ID=$(npx --yes zeabur@latest project list --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin) or [];p=[x for x in d if x.get('name')=='$NAME'];print(p[0]['_id'] if p else '')")
if [ -z "$PROJECT_ID" ]; then
  npx --yes zeabur@latest project create -n "$NAME" -r "server-$SERVER_ID" -i=false
  PROJECT_ID=$(npx --yes zeabur@latest project list --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin) or [];p=[x for x in d if x.get('name')=='$NAME'];print(p[0]['_id'] if p else '')")
fi
echo "專案 $PROJECT_ID"
# 上傳本目錄（靜態站，zeabur.json 指定輸出為根目錄），建立服務並綁 .zeabur.app 子網域
npx --yes zeabur@latest deploy --create --name "$NAME" --project-id "$PROJECT_ID" --domain "$SUB" -i=false
echo "完成：https://$SUB.zeabur.app"
