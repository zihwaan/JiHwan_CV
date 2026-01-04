// Main Entry Point
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Kakao SDK
    try {
        if (typeof Kakao === 'undefined') {
            console.error('Kakao SDK not loaded');
        } else if (!Kakao.isInitialized()) {
            Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);
            console.log("Kakao Initialized");
        }
    } catch (e) {
        console.error("Kakao Init Error:", e);
    }

    // 3. Init Auth Check
    checkAuth();
    
    // 4. Load Leaderboard & Stats (Initial load)
    loadLeaderboard();
});

// DOM Elements
const gridContainer = document.getElementById('grid-container');
const selectionBox = document.getElementById('selection-box');
const timerEl = document.getElementById('timer');
const timeBar = document.getElementById('time-bar');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');
const myBestScoreEl = document.getElementById('my-best-score');

// Overlays
const loginOverlay = document.getElementById('login-overlay');
const startOverlay = document.getElementById('start-overlay');
const resultOverlay = document.getElementById('result-overlay');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownText = document.getElementById('countdown-text');

// Auth & Game State
let accessToken = localStorage.getItem('kakao_token');
let score = 0;
let timeLeft = 35;
let gameInterval;
let isPlaying = false;
let startX, startY;
let isDragging = false;
let selectedApples = [];
let allApples = [];

// Config
const ROWS = 17;
const COLS = 10;
const TOTAL_APPLES = ROWS * COLS;
const GAME_TIME = 35;

// Auth Functions
async function checkAuth() {
    if (!accessToken) {
        showOverlay(loginOverlay);
        return;
    }
    try {
        const res = await fetch('/api/game/myscore', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            myBestScoreEl.textContent = data.score;
            showOverlay(startOverlay);
        } else {
            console.warn("Token invalid");
            localStorage.removeItem('kakao_token');
            accessToken = null;
            showOverlay(loginOverlay);
        }
    } catch (e) {
        console.error("Auth check failed:", e);
        if(!accessToken) showOverlay(loginOverlay);
    }
}

function showOverlay(el) {
    [loginOverlay, startOverlay, resultOverlay, countdownOverlay].forEach(o => o.classList.add('d-none'));
    if(el) el.classList.remove('d-none');
}

const kakaoBtn = document.getElementById('kakao-login-btn');
if (kakaoBtn) {
    kakaoBtn.addEventListener('click', () => {
        if (typeof Kakao === 'undefined') {
             alert('카카오 SDK 로드 실패. 새로고침 해주세요.');
             return;
        }
        if (!Kakao.isInitialized()) {
             try {
                Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);
             } catch(e) {
                alert('카카오 SDK 초기화 실패: ' + e.message);
                return;
             }
        }
        
        Kakao.Auth.login({
            scope: 'profile_nickname,profile_image',
            success: (authObj) => {
                accessToken = authObj.access_token;
                localStorage.setItem('kakao_token', accessToken);
                checkAuth();
            },
            fail: (err) => {
                console.error(err);
                alert('로그인에 실패했습니다: ' + JSON.stringify(err));
            }
        });
    });
}

// Game Logic
function initGrid() {
    gridContainer.innerHTML = '';
    gridContainer.appendChild(selectionBox);
    allApples = [];
    
    for (let i = 0; i < TOTAL_APPLES; i++) {
        const num = Math.floor(Math.random() * 9) + 1; // 1-9
        const apple = document.createElement('div');
        apple.classList.add('apple');
        apple.textContent = num;
        apple.dataset.value = num;
        apple.dataset.index = i;
        
        gridContainer.appendChild(apple);
        allApples.push(apple);
    }
}

async function startGame() {
    showOverlay(null); // Clear overlays
    
    await runCountdown();

    score = 0;
    timeLeft = GAME_TIME;
    scoreEl.textContent = 0;
    timerEl.textContent = GAME_TIME;
    timeBar.style.width = '100%';
    
    initGrid();
    isPlaying = true;
    
    gameInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        timeBar.style.width = `${(timeLeft / GAME_TIME) * 100}%`;
        
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

function spawnBubbles() {
    const overlay = document.getElementById('countdown-overlay');
    const colors = ['#ff6b6b', '#ff9f43', '#feca57', '#48dbfb', '#ff9ff3'];
    
    for(let i=0; i<15; i++) {
        const bubble = document.createElement('i');
        bubble.className = 'fas fa-apple-whole bubble-apple';
        
        // Random Position
        const left = Math.random() * 80 + 10; // 10% - 90%
        const delay = Math.random() * 0.5;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const tx = (Math.random() - 0.5) * 100; // Random drift X
        
        bubble.style.left = `${left}%`;
        bubble.style.bottom = '10%';
        bubble.style.color = color;
        bubble.style.animationDelay = `${delay}s`;
        bubble.style.setProperty('--tx', `${tx}px`);
        
        overlay.appendChild(bubble);
        
        // Cleanup
        setTimeout(() => {
            if(bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, 2000);
    }
}

function runCountdown() {
    return new Promise(resolve => {
        countdownOverlay.classList.remove('d-none');
        const container = document.querySelector('.countdown-container');
        const icon = document.getElementById('countdown-icon');
        
        let count = 3;
        const colors = {
            3: '#ff6b6b', // Red
            2: '#ff9f43', // Orange
            1: '#feca57', // Yellow
            0: '#1dd1a1'  // Green
        };
        
        // Initial setup
        countdownText.textContent = count;
        if(icon) icon.style.color = colors[3];
        countdownText.style.fontSize = ''; 
        
        // Helper to trigger animation
        const triggerAnim = () => {
            if(!container) return;
            container.classList.remove('animate-pop');
            void container.offsetWidth; // trigger reflow
            container.classList.add('animate-pop');
        };
        
        triggerAnim();

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownText.textContent = count;
                if(icon) icon.style.color = colors[count];
                triggerAnim();
                
                // Spawn bubbles on last seconds
                if(count === 1) spawnBubbles();
                
            } else if (count === 0) {
                 countdownText.textContent = 'GO!';
                 countdownText.style.fontSize = '3.5rem';
                 if(icon) icon.style.color = colors[0];
                 triggerAnim();
                 spawnBubbles(); // More bubbles!
            } else {
                clearInterval(interval);
                if(container) container.classList.add('animate-exit');
                
                setTimeout(() => {
                    countdownOverlay.classList.add('d-none');
                    if(container) container.classList.remove('animate-exit', 'animate-pop');
                    countdownText.style.fontSize = '';
                    if(icon) icon.style.color = '';
                    resolve();
                }, 300);
            }
        }, 1000);
    });
}

function endGame() {
    clearInterval(gameInterval);
    isPlaying = false;
    finalScoreEl.textContent = score;
    
    // Save Score
    saveScore(score);
    showOverlay(resultOverlay);

    // Reset UI states in result overlay
    document.getElementById('top10-form').classList.add('d-none');
    document.getElementById('normal-actions').classList.remove('d-none');
}

// Drag Logic
gridContainer.addEventListener('touchstart', handleStart, {passive: false});
gridContainer.addEventListener('touchmove', handleMove, {passive: false});
gridContainer.addEventListener('touchend', handleEnd);

gridContainer.addEventListener('mousedown', (e) => {
    if(e.type === 'touchstart') return;
    handleStart(e);
});
window.addEventListener('mousemove', (e) => {
    if(!isDragging) return;
    handleMove(e);
});
window.addEventListener('mouseup', handleEnd);


function handleStart(e) {
    if (!isPlaying) return;
    if (e.cancelable) e.preventDefault();
    
    const point = e.touches ? e.touches[0] : e;
    const rect = gridContainer.getBoundingClientRect();
    
    startX = point.clientX - rect.left;
    startY = point.clientY - rect.top;
    
    isDragging = true;
    updateSelectionBox(startX, startY, 0, 0);
    selectionBox.style.display = 'block';
}

function handleMove(e) {
    if (!isDragging || !isPlaying) return;
    if (e.cancelable) e.preventDefault();

    const point = e.touches ? e.touches[0] : e;
    const rect = gridContainer.getBoundingClientRect();
    
    const currentX = point.clientX - rect.left;
    const currentY = point.clientY - rect.top;
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    updateSelectionBox(startX, startY, width, height);
    highlightSelection(rect);
}

function handleEnd(e) {
    if (!isDragging || !isPlaying) return;
    isDragging = false;
    selectionBox.style.display = 'none';
    
    checkSum();
}

function updateSelectionBox(x, y, w, h) {
    const left = w < 0 ? x + w : x;
    const top = h < 0 ? y + h : y;
    const width = Math.abs(w);
    const height = Math.abs(h);
    
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
}

function highlightSelection(containerRect) {
    const selRect = selectionBox.getBoundingClientRect();
    
    selectedApples = [];
    allApples.forEach(apple => {
        if (apple.classList.contains('removed')) return;
        
        const appleRect = apple.getBoundingClientRect();
        
        const intersects = !(selRect.right < appleRect.left || 
                             selRect.left > appleRect.right || 
                             selRect.bottom < appleRect.top || 
                             selRect.top > appleRect.bottom);
                             
        if (intersects) {
            apple.classList.add('selected');
            selectedApples.push(apple);
        } else {
            apple.classList.remove('selected');
        }
    });
}

function checkSum() {
    const sum = selectedApples.reduce((acc, el) => acc + parseInt(el.dataset.value), 0);
    
    if (sum === 10) {
        score += selectedApples.length; 
        scoreEl.textContent = score;
        
        selectedApples.forEach(apple => {
            apple.classList.remove('selected');
            apple.classList.add('removed');
            apple.textContent = '';
        });
        
    } else {
        selectedApples.forEach(apple => apple.classList.remove('selected'));
    }
    selectedApples = [];
}


// Score & Leaderboard
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
        const data = await res.json();
        
        // isTop10 variable from server now implies Top 15
        if (data.isTop10 && data.newRecord) {
            const btn = document.getElementById('submit-score-btn');
            if(btn) {
                btn.disabled = false;
                btn.textContent = '등록하기';
            }
            const msgInput = document.getElementById('top10-msg');
            if(msgInput) msgInput.value = '';

            document.getElementById('top10-form').classList.remove('d-none');
            document.getElementById('normal-actions').classList.add('d-none');
        } else {
            if(data.newRecord) loadLeaderboard();
        }
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('submit-score-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    const msg = document.getElementById('top10-msg').value.trim();
    if (!msg) {
        alert('명예의 전당 등록을 위해 소감을 꼭 입력해주세요!');
        return;
    }
    
    btn.disabled = true;
    btn.textContent = '등록 중...';
    
    try {
        const res = await fetch('/api/game/message', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ message: msg })
        });
        
        if (res.ok) {
            alert('성공적으로 등록되었습니다!');
            document.getElementById('top10-form').classList.add('d-none');
            document.getElementById('normal-actions').classList.remove('d-none');
            
            btn.disabled = false;
            btn.textContent = '등록하기';
            
            loadLeaderboard();
        } else {
            const err = await res.json();
            alert('등록 실패: ' + (err.message || '알 수 없는 오류'));
            btn.disabled = false;
            btn.textContent = '등록하기';
        }
    } catch (e) {
        console.error(e);
        alert('서버와 통신 중 오류가 발생했습니다.');
        btn.disabled = false;
        btn.textContent = '등록하기';
    }
});


// Ranking UI
async function loadLeaderboard() {
    const listLogin = document.getElementById('leaderboard-list-login');
    const listStart = document.getElementById('leaderboard-list-start');
    const lists = [listLogin, listStart];
    
    lists.forEach(l => { if(l) l.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary"></div></div>'; });
    
    try {
        const res = await fetch('/api/game/leaderboard');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        let htmlContent = '';

        if (data.length === 0) {
            htmlContent = '<p class="text-center text-muted py-3 small">아직 기록이 없습니다.</p>';
        } else {
            htmlContent = data.map((entry, index) => {
                let badge = index < 3 ? ['🥇','🥈','🥉'][index] : `<span class="badge bg-secondary rounded-pill">${index+1}</span>`;
                
                const date = new Date(entry.time || Date.now());
                const year = date.getFullYear().toString().slice(-2);
                const dateStr = `${year}.${date.getMonth()+1}.${date.getDate()}`;

                return `
                <div class="d-flex justify-content-between align-items-center border-bottom px-3 py-2 bg-white">
                    <div class="d-flex align-items-center gap-2" style="min-width: 0;">
                        <div style="width:25px;text-align:center;flex-shrink:0;">${badge}</div>
                        <img src="${entry.image}" style="width:28px;height:28px;border-radius:50%;flex-shrink:0;object-fit:cover;">
                        <div class="d-flex flex-column text-truncate">
                            <div class="d-flex align-items-center gap-1">
                                <span class="fw-bold small text-truncate">${entry.name}</span>
                                <span class="text-muted" style="font-size:0.6rem;">${dateStr}</span>
                            </div>
                            ${entry.message ? `<span class="text-muted text-truncate" style="font-size:0.7rem;">"${entry.message}"</span>` : ''}
                        </div>
                    </div>
                    <span class="fw-bold text-primary small flex-shrink-0 ms-2">${entry.score}</span>
                </div>
                `;
            }).join('');
        }
        
        lists.forEach(l => { if(l) l.innerHTML = htmlContent; });

    } catch (e) {
        lists.forEach(l => { if(l) l.innerHTML = '<p class="text-center text-danger small py-3">로드 실패</p>'; });
    }
}



document.getElementById('game-start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('go-home-btn')?.addEventListener('click', () => {
    showOverlay(startOverlay);
    loadLeaderboard();
});

// Init
checkAuth();
