document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const leaderboardList = document.getElementById('leaderboard-list');
    const resultModal = document.getElementById('result-modal');
    const leaderboardForm = document.getElementById('leaderboard-form');
    const nameInput = document.getElementById('leaderboard-name');
    const messageInput = document.getElementById('leaderboard-message');
    const closeButton = document.getElementById('close-button');
    const gameColumn = document.querySelector('.game-column');
    const gameContainer = document.getElementById('game-container');

    const GAME_NATURAL_WIDTH = 850; // Approximate natural width of the game container

    // --- Functions ---
    async function fetchAndRenderLeaderboard() {
        if (!leaderboardList) return;

        try {
            const response = await fetch('/api/leaderboard');
            if (!response.ok) throw new Error('리더보드 데이터를 불러오는 데 실패했습니다.');
            
            const topScores = await response.json();

            if (topScores.length === 0) {
                leaderboardList.innerHTML = '<li>아직 등록된 기록이 없습니다.</li>';
                return;
            }

            leaderboardList.innerHTML = topScores.map((entry, index) => {
                let rank;
                switch (index) {
                    case 0: rank = '🥇'; break;
                    case 1: rank = '🥈'; break;
                    case 2: rank = '🥉'; break;
                    default: rank = `${index + 1}`;
                }
                return `
                    <li>
                        <span class="leaderboard-rank">${rank}</span>
                        <div class="leaderboard-details">
                            <span class="name">${escapeHTML(entry.name)}</span>
                            <span class="message">${escapeHTML(entry.message)}</span>
                        </div>
                        <span class="leaderboard-score">${entry.score}점</span>
                    </li>
                `;
            }).join('');
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            leaderboardList.innerHTML = '<li>리더보드를 불러올 수 없습니다.</li>';
        }
    }

    function escapeHTML(str) {
        return str.toString().replace(/[&<>'"/]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' }[m]));
    }

    function handleGameScaling() {
        if (!gameContainer || !gameColumn) return;
        const viewportWidth = window.innerWidth;
        if (viewportWidth < GAME_NATURAL_WIDTH) {
            const scale = viewportWidth / GAME_NATURAL_WIDTH;
            gameContainer.style.transform = `scale(${scale})`;
            const scaledHeight = gameContainer.getBoundingClientRect().height;
            gameColumn.style.height = `${scaledHeight}px`;
        } else {
            gameContainer.style.transform = 'none';
            gameColumn.style.height = 'auto';
        }
    }

    // --- Event Listeners ---
    leaderboardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        const message = messageInput.value.trim();
        const finalScoreDisplay = document.getElementById('final-score');
        const score = parseInt(finalScoreDisplay.textContent, 10);

        if (!name || !message) { return; }

        try {
            const response = await fetch('/api/leaderboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, score, message })
            });
            if (!response.ok) throw new Error('점수 등록에 실패했습니다.');

            // Hide form and refresh leaderboard
            leaderboardForm.style.display = 'none';
            closeButton.focus();
            await fetchAndRenderLeaderboard(); // Refresh the view

        } catch (error) {
            console.error('Error submitting score:', error);
            alert(error.message);
        }
    });

    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class' && !resultModal.classList.contains('hidden')) {
                leaderboardForm.style.display = 'block';
                nameInput.value = '';
                messageInput.value = '';
            }
        }
    });

    observer.observe(resultModal, { attributes: true });

    window.addEventListener('resize', handleGameScaling);

    // --- Initial Load ---
    fetchAndRenderLeaderboard();
    handleGameScaling();
});
