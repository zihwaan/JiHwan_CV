# AWS 서버 배포 및 수동 데이터 이전 가이드

이 문서는 **AWS EC2 (Ubuntu)** 환경에 프로젝트를 배포하고, 기존 방명록 데이터를 **수동으로 선별하여 이전**하며, **도메인(zihwan.com)**을 연결하는 전체 과정을 다룹니다.

---

## 1. AWS EC2 인스턴스 생성 및 설정

### 1-1. 인스턴스 생성
1.  **AWS Console** 로그인 → **EC2** → **인스턴스 시작**.
2.  **이름**: `JiHwan_CV_Server` (원하는 대로).
3.  **OS 이미지**: **Ubuntu Server 22.04 LTS** (또는 24.04) 선택.
4.  **인스턴스 유형**: `t2.micro` (프리티어 가능) 또는 `t3.small` (권장).
5.  **키 페어**: 새 키 페어 생성(`.pem`) 후 다운로드 (잃어버리면 안 됨!).
6.  **네트워크 설정 (보안 그룹)**:
    *   SSH (22): 내 IP에서만 허용 (권장) 또는 위치 무관.
    *   HTTP (80): 위치 무관 (Anywhere).
    *   HTTPS (443): 위치 무관 (Anywhere).
    *   사용자 지정 TCP (8080): 테스트용으로 열어두면 좋음 (나중에 닫아도 됨).

### 1-2. 서버 접속
터미널(맥/리눅스) 또는 Putty/Termius(윈도우)를 사용해 접속합니다.
```bash
# 키 권한 설정 (최초 1회)
chmod 400 your-key-pair.pem

# 접속
ssh -i "your-key-pair.pem" ubuntu@퍼블릭IPv4주소
```

---

## 2. 서버 환경 구축 (Docker 설치)

서버에 접속한 상태에서 아래 명령어들을 한 줄씩 입력하여 Docker를 설치합니다.

```bash
# 패키지 업데이트
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Docker GPG 키 추가
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 리포지토리 설정
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker 엔진 설치
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 권한 설정 (재로그인 필요)
sudo usermod -aG docker $USER
exit
# (다시 ssh 접속하세요)
```

---

## 3. 프로젝트 업로드 및 실행

### 3-1. 파일 업로드
내 컴퓨터의 프로젝트 폴더를 서버로 옮깁니다. `scp` 명령어를 쓰거나 FileZilla 같은 FTP 프로그램을 사용하세요.

**[FileZilla 사용 시]**
*   호스트: `sftp://퍼블릭IP`
*   사용자: `ubuntu`
*   키 파일: 다운로드 받은 `.pem` 파일 선택
*   업로드 위치: `/home/ubuntu/JiHwan_CV` (폴더 생성 후 통째로 업로드)

### 3-2. 환경 변수 설정
서버의 프로젝트 폴더로 이동해 `.env` 파일을 만듭니다.

```bash
cd ~/JiHwan_CV
nano .env
```
**내용 붙여넣기:**
```env
PORT=8080
MONGODB_URI=mongodb://mongo:27017/jihwan_cv
ADMIN_PASS=원하는관리자비번
DOMAIN=zihwan.com
KAKAO_JS_KEY=카카오자바스크립트키
```
(`Ctrl+O` 엔터로 저장, `Ctrl+X` 로 종료)

### 3-3. 서버 실행
```bash
docker compose up -d --build
```
이제 `http://퍼블릭IP:8080` 으로 접속되는지 확인합니다.

---

## 4. [중요] 데이터 수동 이전 가이드 (방명록 & 사진)

기존 방명록 데이터를 수동으로 입력하는 단계입니다. **사진 파일 위치**와 **코드 입력**이 정확해야 합니다.

### 4-1. 사진 파일 준비 (이미지 업로드)
방명록 작성자의 프로필 사진이 있다면, 해당 사진 파일들을 서버의 `assets` 폴더에 넣어야 합니다.

1.  **PC에서 준비:** 예전 프로필 사진 파일들 (예: `user1.jpg`, `friend.png`)을 준비합니다.
2.  **업로드:** FileZilla 등을 이용해 서버의 `/home/ubuntu/JiHwan_CV/assets/` 폴더 안으로 사진들을 업로드합니다.
    *   업로드 경로 예시: `/home/ubuntu/JiHwan_CV/assets/user1.jpg`

### 4-2. 데이터 입력 스크립트 작성
`manual_insert_comments.js` 파일을 열어 데이터를 채워 넣습니다.

```javascript
// manual_insert_comments.js 예시

const manualData = [
  {
    // 1번: 사진이 있는 경우
    name: "김철수",
    text: "서버 이전 축하해! (사진 있음)",
    // 중요: 위에서 업로드한 파일명을 정확히 적으세요. 경로는 /assets/파일명
    image: "/assets/user1.jpg", 
    date: "2024-01-15 14:30:00"
  },
  {
    // 2번: 사진이 없는 경우 (기본 이미지 사용)
    name: "익명",
    text: "나는 사진이 없어요.",
    image: "", // 비워두면 자동으로 기본 로봇 이미지 적용됨
    date: "2023-12-25 09:00:00"
  }
];
```

### 4-3. 스크립트 실행 (DB 저장)
작성한 스크립트를 실행 중인 컨테이너 안으로 넣고 실행합니다.

```bash
# 1. 수정한 파일을 컨테이너 내부로 복사
docker cp manual_insert_comments.js jihwan_cv-app-1:/usr/src/app/

# 2. 실행 (데이터 삽입)
docker exec -it jihwan_cv-app-1 node manual_insert_comments.js
```
*   `🎉 총 N개의 방명록을 성공적으로 저장했습니다!` 메시지가 뜨면 성공입니다.
*   웹사이트를 새로고침하여 글과 **사진**이 잘 나오는지 확인하세요.

---

## 5. 도메인 연결 (Nginx & HTTPS)

`zihwan.com`으로 접속하도록 설정합니다.

### 5-1. 가비아 DNS 설정
가비아 관리 페이지에서 `A 레코드`를 추가합니다.
*   호스트: `@` (값: AWS 퍼블릭 IP)
*   호스트: `www` (값: AWS 퍼블릭 IP)

### 5-2. Nginx 설치 및 설정
```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/zihwan.com
```

**설정 내용:**
```nginx
server {
    listen 80;
    server_name zihwan.com www.zihwan.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**적용:**
```bash
sudo ln -s /etc/nginx/sites-available/zihwan.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5-3. HTTPS (SSL) 자동 적용
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d zihwan.com -d www.zihwan.com
```
*   이메일 입력 -> 약관 동의(Y) -> Redirect 설정(2번 선택 권장)

이제 `https://zihwan.com`으로 접속됩니다! 🎉
