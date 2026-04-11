#!/bin/bash
# setup_zihwan_com.sh

echo "1. Cloudflare에 로그인합니다 (브라우저가 열리면 승인해주세요)..."
cloudflared tunnel login

echo "2. 'zihwan-cv'라는 이름의 터널을 생성합니다..."
cloudflared tunnel create zihwan-cv

echo "3. zihwan.com 도메인을 이 터널로 연결합니다..."
cloudflared tunnel route dns zihwan-cv zihwan.com

echo "4. PM2를 사용하여 터널을 백그라운드에서 실행합니다..."
pm2 start "cloudflared tunnel run --url http://localhost:8080 zihwan-cv" --name zihwan-tunnel
pm2 save

echo "완료되었습니다! 이제 https://zihwan.com 에서 접속이 가능합니다."
