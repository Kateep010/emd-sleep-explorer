#!/bin/zsh
# Cloudflare Workers（static assets）部署。前提：npx wrangler login（瀏覽器授權一次）
set -e
cd "$(dirname "$0")/.."
npx --yes wrangler@latest deploy
echo "完成：網址見上方輸出（https://emd-sleep-explorer.<你的子網域>.workers.dev）"
