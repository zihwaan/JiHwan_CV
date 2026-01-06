# 로컬 서버 도메인 연결 및 유지보수 가이드 (zihwan.com)

이 문서는 로컬 맥북에서 실행 중인 서버를 외부 도메인(`zihwan.com`)과 안전하게 연결하는 방법과 추가적인 유지보수 명령어를 설명합니다.

---

## 1. 도메인 연결 (Cloudflare Tunnel 권장)

로컬 PC(맥북)는 IP가 유동적이거나 공유기 뒤에 있어 직접 포트포워딩하기 까다롭습니다. **Cloudflare Tunnel**을 사용하면 별도의 포트 개방 없이 안전하게 외부에서 로컬 서버로 접속할 수 있습니다.

### 1-1. Cloudflare Tunnel 설치 (macOS)
Homebrew를 사용하여 `cloudflared`를 설치합니다.

```bash
brew install cloudflared
```

### 1-2. Cloudflare 로그인
터미널에서 다음 명령어를 입력하여 브라우저를 통해 인증합니다.
```bash
cloudflared tunnel login
```

### 1-3. 터널 생성 및 연결
터널을 생성하고 `zihwan.com` 도메인과 연결합니다. (Cloudflare 대시보드에서 도메인이 이미 등록되어 있어야 합니다.)

```bash
# 1. 터널 생성 (이름: local-server)
cloudflared tunnel create local-server

# 2. 도메인 라우팅 (zihwan.com -> 터널)
cloudflared tunnel route dns local-server zihwan.com
```

### 1-4. 터널 실행
로컬 서버(localhost:8080)와 터널을 연결하여 실행합니다.
```bash
cloudflared tunnel run --url http://localhost:8080 local-server
```
이 명령어가 실행되는 동안 `https://zihwan.com`으로 접속하면 맥북의 서버로 연결됩니다.

---

## 2. 사과게임 데이터 수동 마이그레이션 (완료됨)

기존 서버의 사과게임 기록이 누락되어 수동 복구 스크립트(`manual_insert_scores.js`)를 생성 및 실행했습니다.
만약 데이터를 다시 초기화하거나 수정해야 한다면 다음 명령어를 사용하세요.

```bash
# 데이터 수정 후 다시 실행 (기존 데이터 삭제 후 재입력됨)
docker cp manual_insert_scores.js jihwan_cv-app-1:/usr/src/app/
docker exec -it jihwan_cv-app-1 node manual_insert_scores.js
```

---

## 3. 주요 명령어 모음

### 서버 관리
*   **서버 시작 (백그라운드)**: `docker compose up -d`
*   **서버 중지**: `docker compose down`
*   **로그 확인**: `docker compose logs -f app`
*   **서버 재시작 (코드 수정 후)**: `docker compose restart app` 또는 `docker compose up -d --build`

### 데이터베이스 관리
*   **MongoDB 접속**:
    ```bash
    docker exec -it jihwan_cv-mongo-1 mongosh jihwan_cv
    ```
    (접속 후 `db.comments.find()` 등으로 데이터 확인 가능)
