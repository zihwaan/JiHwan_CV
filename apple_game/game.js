// Initialize Kakao
if (typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
    Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);
}

// Mobile Check
function checkMobile() {
    // Basic check: Width < 768 or specific UA. 
    // Allowing wider screens if touch is present might be good, but prompt said "Mobile Only".
    // Let's stick to width for simplicity + touch capability check?
    const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
    
    if (!isMobile) {
        document.getElementById('desktop-warning').classList.remove('d-none');
        document.getElementById('game-wrapper').style.display = 'none';
        return false;
    }
    return true;
}

if (!checkMobile()) throw new Error("Desktop detected");

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
const leaderboardOverlay = document.getElementById('leaderboard-overlay');

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
// ... (previous checkAuth)

function startGame() {
    score = 0;
    timeLeft = GAME_TIME;
    scoreEl.textContent = 0;
    timerEl.textContent = GAME_TIME;
    timeBar.style.width = '100%';
    
    initGrid();
    showOverlay(null); // Clear overlays
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

// Mouse support for testing (optional, but good for dev)
gridContainer.addEventListener('mousedown', (e) => {
    // Only if not touch
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
    if (e.cancelable) e.preventDefault(); // Prevent scroll
    
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
    // Get selection box rect relative to viewport to compare with elements
    const selRect = selectionBox.getBoundingClientRect();
    
    selectedApples = [];
    allApples.forEach(apple => {
        if (apple.classList.contains('removed')) return;
        
        const appleRect = apple.getBoundingClientRect();
        
        // Check intersection
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
        // Success
        score += selectedApples.length; // 1 point per apple? Or simple 10?
        // Let's do 10 points fixed? Or dynamic?
        // User said "Total 10", "Collect score".
        // Let's give score = count of apples. Removing more apples at once is harder? Not really.
        // Let's simply add the count of apples removed to the score.
        scoreEl.textContent = score;
        
        selectedApples.forEach(apple => {
            apple.classList.remove('selected');
            apple.classList.add('removed');
            apple.textContent = '';
        });
        
        // Optional: play sound
    } else {
        // Fail
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
        
        if (data.isTop10) {
            // Mandatory Input Mode
            document.getElementById('top10-form').classList.remove('d-none');
            document.getElementById('normal-actions').classList.add('d-none'); // Hide normal buttons
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
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="spinner-border text-primary"></div>';
    
    try {
        const res = await fetch('/api/game/leaderboard');
        const data = await res.json();
        
        if (data.length === 0) {
            list.innerHTML = '<p class="text-center text-muted">기록이 없습니다.</p>';
            return;
        }

        list.innerHTML = data.map((entry, index) => {
            let badge = index < 3 ? ['🥇','🥈','🥉'][index] : `<span class="badge bg-secondary">${index+1}</span>`;
            return `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div class="d-flex align-items-center gap-2">
                    <div style="width:25px;text-align:center;">${badge}</div>
                    <img src="${entry.image}" style="width:30px;height:30px;border-radius:50%;">
                    <div class="d-flex flex-column">
                        <span class="fw-bold small">${entry.name}</span>
                        ${entry.message ? `<span class="text-muted" style="font-size:0.75rem;">"${entry.message}"</span>` : ''}
                    </div>
                </div>
                <span class="fw-bold text-primary">${entry.score}</span>
            </div>
            `;
        }).join('');
    } catch (e) {
        list.innerHTML = '로드 실패';
    }
}

document.getElementById('show-rank-btn').addEventListener('click', () => {
    showOverlay(leaderboardOverlay);
    loadLeaderboard();
});
document.getElementById('result-rank-btn').addEventListener('click', () => {
    showOverlay(leaderboardOverlay);
    loadLeaderboard();
});
document.getElementById('close-rank-btn').addEventListener('click', () => {
    showOverlay(startOverlay); // Go back to start
});

document.getElementById('game-start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Init
checkMobile();
checkAuth();
