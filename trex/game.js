/* Kakao SDK 초기화 */
// Use the same initialization logic as app.js
if (!Kakao.isInitialized()) {
    Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);
}

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const authOverlay = document.getElementById('auth-overlay');
const loginMsg = document.getElementById('login-msg');
const startMsg = document.getElementById('start-msg');
const gameOverMsg = document.getElementById('game-over-msg');
const myBestScoreEl = document.getElementById('my-best-score');
const currentScoreEl = document.getElementById('current-score');
const leaderboardList = document.getElementById('leaderboard-list');

const top10Section = document.getElementById('top10-section');
const top10MessageInput = document.getElementById('top10-message');
const submitMsgBtn = document.getElementById('submit-msg-btn');
const kakaoLoginBtn = document.getElementById('kakao-login-btn');

// State
let accessToken = localStorage.getItem('kakao_token') ?? '';
let isPlaying = false;
let isGameOver = false;
let score = 0;
let animationFrameId;
let speed = 5;
let obstacles = [];
let gameTime = 0;

// Assets
const dinoImg = new Image();
dinoImg.src = './assets/zihwan.png'; 

// Player
const player = {
    x: 50,
    y: 0,
    width: 40,
    height: 40,
    dy: 0,
    jumpForce: 12,
    grounded: false,
    originalY: 0
};

// Utils
function resizeCanvas() {
    const container = document.getElementById('game-container');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        player.originalY = canvas.height - player.height - 10;
        if (!isPlaying) player.y = player.originalY;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Auth Logic
async function checkAuth() {
    if (!accessToken) {
        showLoginUI();
        return;
    }
    
    // Verify token & get personal score
    try {
        const res = await fetch('/api/game/myscore', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (res.ok) {
            const data = await res.json();
            myBestScoreEl.textContent = Math.floor(data.score);
            showStartUI();
        } else {
            // Token invalid or expired
            console.warn('Token invalid, logging out locally');
            localStorage.removeItem('kakao_token');
            accessToken = '';
            showLoginUI();
        }
    } catch (e) {
        console.error("Auth check failed:", e);
        // Don't log out immediately on network error, but show login UI if needed
        if (!accessToken) showLoginUI();
    }
}

function showLoginUI() {
    loginMsg.classList.remove('d-none');
    startMsg.classList.add('d-none');
    gameOverMsg.classList.add('d-none');
    authOverlay.classList.remove('d-none');
}

function showStartUI() {
    loginMsg.classList.add('d-none');
    startMsg.classList.remove('d-none');
    gameOverMsg.classList.add('d-none');
    authOverlay.classList.remove('d-none');
}

if (kakaoLoginBtn) {
    kakaoLoginBtn.addEventListener('click', () => {
        Kakao.Auth.login({
            scope: 'profile_nickname,profile_image',
            success: (authObj) => {
                accessToken = authObj.access_token;
                localStorage.setItem('kakao_token', accessToken);
                checkAuth();
            },
            fail: (err) => {
                console.error(err);
                alert('로그인에 실패했습니다.');
            }
        });
    });
}

// Leaderboard Logic
async function loadLeaderboard() {
    try {
        const res = await fetch('/api/game/leaderboard');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        
        if (data.length === 0) {
            leaderboardList.innerHTML = '<p class="text-center text-muted py-3">아직 기록이 없습니다.</p>';
            return;
        }
        
        leaderboardList.innerHTML = data.map((entry, index) => {
            let badgeColor = 'bg-secondary';
            if(index === 0) badgeColor = 'bg-warning text-dark';
            else if(index === 1) badgeColor = 'bg-secondary';
            else if(index === 2) badgeColor = 'bg-danger';
            
            const messageHtml = entry.message ? `<div class="small text-muted text-start w-100 ps-5 ms-2">💬 "${entry.message}"</div>` : '';

            return `
            <div class="score-item flex-wrap">
                <div class="d-flex align-items-center justify-content-between w-100">
                    <div class="user-info">
                        <div class="rank-badge ${badgeColor}">${index + 1}</div>
                        <img src="${entry.image || '../assets/default_avatar.png'}" class="user-avatar" alt="">
                        <span class="fw-semibold">${entry.name}</span>
                    </div>
                    <span class="fw-bold">${entry.score}</span>
                </div>
                ${messageHtml}
            </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Leaderboard load failed:", e);
        leaderboardList.innerHTML = `<div class="text-center py-3 text-danger">
            <p class="mb-1">랭킹 로딩 실패</p>
            <button id="retry-leaderboard" class="btn btn-sm btn-outline-dark">재시도</button>
        </div>`;
        document.getElementById('retry-leaderboard')?.addEventListener('click', loadLeaderboard);
    }
}

// Game Logic
function startGame() {
    if (!accessToken) return;
    isPlaying = true;
    isGameOver = false;
    score = 0;
    speed = 5;
    obstacles = [];
    gameTime = 0;
    
    player.y = player.originalY;
    player.dy = 0;
    
    authOverlay.classList.add('d-none');
    loop();
}

function update() {
    gameTime++;
    score += 0.1;
    speed = 5 + (score / 500); 
    
    // Jump
    if (player.grounded && (keys['Space'] || keys['ArrowUp'] || keys['Touch'])) {
        player.dy = -player.jumpForce;
        player.grounded = false;
    }
    
    player.dy += 0.8;
    player.y += player.dy;
    
    if (player.y > player.originalY) {
        player.y = player.originalY;
        player.dy = 0;
        player.grounded = true;
    }

    // Spawn Obstacles
    if (gameTime % Math.floor(100 + Math.random() * 60) === 0) {
        obstacles.push({
            x: canvas.width,
            y: canvas.height - 40,
            width: 20 + Math.random() * 30,
            height: 30 + Math.random() * 20
        });
    }

    // Move & Remove Obstacles
    obstacles.forEach(obs => obs.x -= speed);
    obstacles = obstacles.filter(obs => obs.x + obs.width > 0);

    // Collision
    for (let obs of obstacles) {
        if (
            player.x < obs.x + obs.width &&
            player.x + player.width > obs.x &&
            player.y < obs.y + obs.height &&
            player.y + player.height > obs.y
        ) {
            gameOver();
            return; // Stop update loop
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Ground
    ctx.strokeStyle = '#535353';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 10);
    ctx.lineTo(canvas.width, canvas.height - 10);
    ctx.stroke();

    // Player
    if (dinoImg.complete && dinoImg.naturalHeight !== 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height/2, player.width/2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(dinoImg, player.x, player.y, player.width, player.height);
        ctx.restore();
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }

    // Obstacles
    ctx.fillStyle = '#535353';
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    // Score
    ctx.fillStyle = '#535353';
    ctx.font = "20px Pretendard";
    ctx.fillText(`Score: ${Math.floor(score)}`, canvas.width - 120, 30);
}

function loop() {
    if (!isPlaying) return;
    update();
    draw();
    if (!isGameOver) requestAnimationFrame(loop);
}

function gameOver() {
    isGameOver = true;
    isPlaying = false;
    
    authOverlay.classList.remove('d-none');
    loginMsg.classList.add('d-none');
    startMsg.classList.add('d-none');
    gameOverMsg.classList.remove('d-none');
    
    top10Section.classList.add('d-none');
    top10MessageInput.value = '';

    currentScoreEl.innerText = Math.floor(score);
    saveScore(Math.floor(score));
}

async function saveScore(finalScore) {
    if (!accessToken) return;
    try {
        const res = await fetch('/api/game/score', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ score: finalScore })
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.isTop10) top10Section.classList.remove('d-none');
            if (data.newRecord) loadLeaderboard();
            checkAuth(); 
        }
    } catch (e) {
        console.error("Save score failed:", e);
    }
}

if (submitMsgBtn) {
    submitMsgBtn.addEventListener('click', async () => {
        const message = top10MessageInput.value.trim();
        if (!message) return alert('소감을 입력해주세요.');

        try {
            const res = await fetch('/api/game/message', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ message })
            });

            if (res.ok) {
                alert('소감이 등록되었습니다!');
                top10Section.classList.add('d-none');
                loadLeaderboard();
            } else {
                alert('등록 실패');
            }
        } catch (e) {
            console.error(e);
        }
    });
}

// Inputs
const keys = {};
window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        keys[e.code] = true;
        if (!isPlaying && !isGameOver && accessToken && !startMsg.classList.contains('d-none')) {
            startGame();
        }
    }
});
window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') keys[e.code] = false;
});
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys['Touch'] = true;
    if (!isPlaying && !isGameOver && accessToken && !startMsg.classList.contains('d-none')) {
        startGame();
    }
});
canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys['Touch'] = false;
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Initialization
loadLeaderboard();
checkAuth();