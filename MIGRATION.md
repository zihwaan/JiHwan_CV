# AWS 서버 배포 및 수동 데이터 이전 가이드 (YUM/Amazon Linux 환경)

이 문서는 **AWS EC2 (Amazon Linux/CentOS)** 환경에 GitHub 리포지토리(`aws` 브랜치)를 클론하여 배포하고, 데이터를 **수동으로 이전**하며, **도메인(zihwan.com)**을 연결하는 과정을 다룹니다.

---

## 1. AWS EC2 인스턴스 생성 및 접속

### 1-1. 인스턴스 생성
*   **OS 이미지**: **Amazon Linux 2023** 또는 **Amazon Linux 2** 선택 (YUM 사용 환경).
*   **보안 그룹**: SSH(22), HTTP(80), HTTPS(443) 포트 개방.

### 1-2. 서버 접속
```bash
ssh -i "your-key-pair.pem" ec2-user@퍼블릭IPv4주소
```
*(Amazon Linux의 기본 사용자 이름은 `ec2-user`입니다.)*

---

## 2. 서버 환경 구축 (Docker 및 Git 설치)

<<<<<<< Updated upstream
Amazon Linux에서는 Docker 엔진과 **Docker Compose**를 각각 설치해야 합니다.
=======
`yum`을 사용하여 필수 도구들을 설치합니다.
>>>>>>> Stashed changes

```bash
# 1. 시스템 업데이트
sudo yum update -y

# 2. Docker 및 Git 설치
sudo yum install -y docker git

<<<<<<< Updated upstream
# 3. Docker 서비스 시작
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER

# 4. Docker Compose 설치 (필수)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# 5. Docker Buildx 설치 (필수 - 최신 버전 사용)
mkdir -p ~/.docker/cli-plugins/
curl -SL https://github.com/docker/buildx/releases/download/v0.19.3/buildx-v0.19.3.linux-amd64 -o ~/.docker/cli-plugins/docker-buildx
chmod +x ~/.docker/cli-plugins/docker-buildx

# 6. 적용을 위해 재로그인
exit
# (다시 ssh 접속)
=======
# 3. Docker 서비스 시작 및 자동 실행 설정
sudo systemctl start docker
sudo systemctl enable docker

# 4. 권한 설정 (현재 사용자를 docker 그룹에 추가)
sudo usermod -aG docker $USER

# 5. 변경 사항 적용을 위해 로그아웃 후 재접속
exit
# (다시 접속하세요)
>>>>>>> Stashed changes
```

---

## 3. GitHub 코드 가져오기 및 실행

### 3-1. AWS 브랜치 클론 (Clone)
```bash
cd ~
git clone -b aws https://github.com/zihwaan/JiHwan_CV.git
cd JiHwan_CV
```

### 3-2. 환경 변수 설정
```bash
nano .env
```
**내용 입력:**
```env
PORT=8080
MONGODB_URI=mongodb://mongo:27017/jihwan_cv
ADMIN_PASS=원하는관리자비번
DOMAIN=zihwan.com
KAKAO_JS_KEY=카카오자바스크립트키
```
(`Ctrl+O` 엔터, `Ctrl+X` 종료)

### 3-3. 서비스 실행
<<<<<<< Updated upstream
`docker-compose` 명령어를 사용합니다.
=======
Amazon Linux에서는 최신 Docker 설치 시 `docker compose` 명령어를 기본 지원합니다.
>>>>>>> Stashed changes
```bash
docker-compose up -d --build
```

---

## 4. [중요] 데이터 수동 이전 (방명록 & 사진)

### 4-1. 사진 업로드
*   PC에 있는 사진들을 서버의 `/home/ec2-user/JiHwan_CV/assets/` 폴더로 업로드합니다. (FileZilla 권장)

### 4-2. 데이터 입력 스크립트 수정
```bash
nano manual_insert_comments.js
```
*   `manualData` 배열에 이름, 내용, 사진 경로(`/assets/파일명`), 날짜를 직접 입력합니다.

### 4-3. DB 저장 실행
```bash
# 컨테이너로 파일 복사
docker cp manual_insert_comments.js jihwan_cv-app-1:/usr/src/app/

# 스크립트 실행
docker exec -it jihwan_cv-app-1 node manual_insert_comments.js
```

---

## 5. 도메인 및 HTTPS 연결 (Nginx)

### 5-1. Nginx 설치
```bash
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 5-2. Nginx 설정 (리버스 프록시)
YUM 기반 시스템은 보통 `/etc/nginx/conf.d/` 폴더의 설정 파일을 읽습니다.

```bash
sudo nano /etc/nginx/conf.d/zihwan.com.conf
```

**내용 입력:**
```nginx
server {
    listen 80;
    server_name zihwan.com www.zihwan.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

설정 적용:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### 5-3. SSL 인증서 설치 (Certbot)
Amazon Linux 2023 등에서는 `python3-certbot-nginx` 패키지를 사용합니다.

```bash
# Certbot 설치
sudo yum install -y certbot python3-certbot-nginx

# 인증서 발급
sudo certbot --nginx -d zihwan.com -d www.zihwan.com
```

---

## 6. 유지보수 명령어
*   **로그 확인**: `docker compose logs -f`
*   **앱 재시작**: `docker compose restart app`
*   **컨테이너 중지**: `docker compose down`

---

## 7. 자동 배포 설정 (CI/CD)

GitHub의 `aws` 브랜치에 코드를 푸시(Push)하면, 자동으로 서버에 반영되도록 설정되어 있습니다. 이를 작동시키려면 **GitHub Secrets** 설정이 필요합니다.

### 7-1. GitHub Secrets 등록
GitHub 리포지토리의 **Settings > Secrets and variables > Actions** 메뉴에서 다음 3개의 시크릿을 등록하세요.

| Name | 값 (Value) |
| :--- | :--- |
| `HOST` | AWS 서버의 퍼블릭 IP (예: 13.210.xx.xx) |
| `USERNAME` | `ec2-user` |
| `KEY` | `.pem` 키 파일의 내용을 메모장으로 열어서 전체 복사/붙여넣기 |

### 7-2. 작동 방식
1.  로컬에서 코드 수정 후 `git push origin aws` 실행.
2.  GitHub Actions가 자동으로 감지하여 서버에 SSH 접속.
3.  `git pull` -> `docker-compose up -d --build` 순차 실행.
4.  약 1~2분 후 서버에 변경 사항이 자동 반영됨.

