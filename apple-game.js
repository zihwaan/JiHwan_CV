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

    // --- Drag robustness: forward events outside grid ---
    // The original game only listens on #grid, so when the pointer leaves it,
    // dragging can feel "eaten". We forward window mouse events back to #grid.
    try {
        const gridEl = document.getElementById('grid');
        const selectionBox = document.getElementById('selection-box');
        let forwarding = false;

        if (gridEl && selectionBox) {
            gridEl.addEventListener('mousedown', () => {
                forwarding = true;
            });

            window.addEventListener('mouseup', (e) => {
                if (!forwarding) return;
                forwarding = false;
                // If selection is active, ensure the game receives the mouseup
                if (!selectionBox.classList.contains('hidden')) {
                    const evt = new MouseEvent('mouseup', {
                        bubbles: true,
                        cancelable: true,
                        clientX: e.clientX,
                        clientY: e.clientY,
                    });
                    gridEl.dispatchEvent(evt);
                }
            }, true);

            window.addEventListener('mousemove', (e) => {
                if (!forwarding) return;
                if (!selectionBox.classList.contains('hidden')) {
                    // Avoid duplicating if pointer is already over the grid
                    if (e.target && (e.target === gridEl || gridEl.contains(e.target))) return;
                    const evt = new MouseEvent('mousemove', {
                        bubbles: true,
                        cancelable: false,
                        clientX: e.clientX,
                        clientY: e.clientY,
                    });
                    gridEl.dispatchEvent(evt);
                }
            }, true);
        }
    } catch (err) {
        console.warn('Drag forwarding setup failed:', err);
    }

    // --- Mobile touch support: translate Pointer/Touch -> Mouse events ---
    try {
        const gridEl = document.getElementById('grid');
        if (gridEl) {
            let activePointerId = null;
            let bridging = false;

            function dispatchMouse(type, srcEvent) {
                const evt = new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX: srcEvent.clientX,
                    clientY: srcEvent.clientY,
                    screenX: srcEvent.screenX || 0,
                    screenY: srcEvent.screenY || 0,
                });
                gridEl.dispatchEvent(evt);
            }

            function setupPointerBridge() {
                gridEl.addEventListener('pointerdown', (e) => {
                    if (e.pointerType === 'mouse') return; // native mouse already works
                    activePointerId = e.pointerId;
                    bridging = true;
                    try { gridEl.setPointerCapture(activePointerId); } catch {}
                    dispatchMouse('mousedown', e);
                    e.preventDefault();
                }, { passive: false });

                gridEl.addEventListener('pointermove', (e) => {
                    if (!bridging || e.pointerId !== activePointerId) return;
                    dispatchMouse('mousemove', e);
                    e.preventDefault();
                }, { passive: false });

                const endPointer = (e) => {
                    if (!bridging || e.pointerId !== activePointerId) return;
                    dispatchMouse('mouseup', e);
                    try { gridEl.releasePointerCapture(activePointerId); } catch {}
                    activePointerId = null;
                    bridging = false;
                    e.preventDefault();
                };

                gridEl.addEventListener('pointerup', endPointer, { passive: false });
                gridEl.addEventListener('pointercancel', endPointer, { passive: false });
            }

            function setupTouchBridge() {
                // Fallback for very old browsers without Pointer Events
                const getTouch = (e) => e.touches[0] || e.changedTouches[0];
                gridEl.addEventListener('touchstart', (e) => {
                    const t = getTouch(e); if (!t) return;
                    bridging = true;
                    dispatchMouse('mousedown', t);
                    e.preventDefault();
                }, { passive: false });
                gridEl.addEventListener('touchmove', (e) => {
                    if (!bridging) return;
                    const t = getTouch(e); if (!t) return;
                    dispatchMouse('mousemove', t);
                    e.preventDefault();
                }, { passive: false });
                const end = (e) => {
                    if (!bridging) return;
                    const t = getTouch(e); if (!t) return;
                    dispatchMouse('mouseup', t);
                    bridging = false;
                    e.preventDefault();
                };
                gridEl.addEventListener('touchend', end, { passive: false });
                gridEl.addEventListener('touchcancel', end, { passive: false });
            }

            if (window.PointerEvent) {
                setupPointerBridge();
            } else {
                setupTouchBridge();
            }
        }
    } catch (err) {
        console.warn('Touch bridge setup failed:', err);
    }

    // --- Secret password: reveal hint overlays for sum 10 ---
    // Shows on-screen rectangles where dragging forms a valid 10 sum.
    (function setupSecretHint() {
        const SECRET = '변지환최고';
        let buffer = '';

        // Hidden input to better support IME (Korean) composition
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'text';
        hiddenInput.id = 'secret-capture';
        hiddenInput.setAttribute('aria-hidden', 'true');
        hiddenInput.autocomplete = 'off';
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.left = '-9999px';
        hiddenInput.style.top = '-9999px';
        document.body.appendChild(hiddenInput);

        function checkSecretFrom(str) {
            buffer = (buffer + str).slice(-SECRET.length);
            if (buffer.includes(SECRET)) {
                buffer = '';
                revealTenOverlays();
                showHintToast('힌트 활성화: 합이 10인 영역 표시');
            }
        }

        // Focus hidden input on general typing to capture IME text
        document.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            const isTypingField = tag === 'input' || tag === 'textarea' || e.isComposing;
            if (!isTypingField) {
                hiddenInput.focus({ preventScroll: true });
            }
            // Fallback for single-char keys (non-IME)
            if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                checkSecretFrom(e.key);
            }
            if (e.key === 'Escape') {
                buffer = '';
                const prev = document.getElementById('auto-solve-container');
                if (prev) prev.remove();
            }
        });

        hiddenInput.addEventListener('input', () => {
            const val = hiddenInput.value || '';
            // Only keep last SECRET.length characters to bound memory
            if (val.length > SECRET.length) {
                hiddenInput.value = val.slice(-SECRET.length);
            }
            checkSecretFrom(hiddenInput.value.slice(-1));
        });

        // Core: replicate the auto-solve overlay logic to show valid 10-sum rectangles
        function revealTenOverlays() {
            const grid = document.getElementById('grid');
            const gridContainer = document.getElementById('grid-container');
            if (!grid || !gridContainer) return;

            // Remove existing overlays if any
            const prev = document.getElementById('auto-solve-container');
            if (prev) prev.remove();

            const overlayRoot = document.createElement('div');
            overlayRoot.id = 'auto-solve-container';
            overlayRoot.style.position = 'absolute';
            overlayRoot.style.top = '0';
            overlayRoot.style.left = '0';
            overlayRoot.style.width = '100%';
            overlayRoot.style.height = '100%';
            overlayRoot.style.pointerEvents = 'none';
            gridContainer.appendChild(overlayRoot);

            // The original game uses 10 rows (p) and 17 cols (d)
            const ROWS = 10;
            const COLS = 17;

            // Build prefix sums for values and non-empty counts
            const sum = Array.from({ length: ROWS + 1 }, () => new Array(COLS + 1).fill(0));
            const count = Array.from({ length: ROWS + 1 }, () => new Array(COLS + 1).fill(0));

            for (let r = 0; r < ROWS; r++) {
                for (let cIdx = 0; cIdx < COLS; cIdx++) {
                    const idx = r * COLS + cIdx;
                    const cell = grid.children[idx];
                    const value = parseInt(cell?.dataset?.value || '0', 10) || 0;
                    const occupied = (!cell?.classList?.contains('empty') && value > 0) ? 1 : 0;
                    sum[r + 1][cIdx + 1] = sum[r + 1][cIdx] + sum[r][cIdx + 1] - sum[r][cIdx] + value;
                    count[r + 1][cIdx + 1] = count[r + 1][cIdx] + count[r][cIdx + 1] - count[r][cIdx] + occupied;
                }
            }

            // Enumerate rectangles and draw overlays for those summing to 10
            const gcRect = gridContainer.getBoundingClientRect();
            for (let r0 = 0; r0 < ROWS; r0++) {
                for (let r1 = r0; r1 < ROWS; r1++) {
                    for (let c0 = 0; c0 < COLS; c0++) {
                        for (let c1 = c0; c1 < COLS; c1++) {
                            const rectSum = sum[r1 + 1][c1 + 1] - sum[r0][c1 + 1] - sum[r1 + 1][c0] + sum[r0][c0];
                            const rectCount = count[r1 + 1][c1 + 1] - count[r0][c1 + 1] - count[r1 + 1][c0] + count[r0][c0];
                            if (rectSum === 10 && rectCount > 0) {
                                const topLeft = grid.children[r0 * COLS + c0].getBoundingClientRect();
                                const bottomRight = grid.children[r1 * COLS + c1].getBoundingClientRect();
                                const left = topLeft.left - gcRect.left;
                                const top = topLeft.top - gcRect.top;
                                const width = (bottomRight.right - topLeft.left);
                                const height = (bottomRight.bottom - topLeft.top);
                                const box = document.createElement('div');
                                box.className = 'auto-solve-overlay';
                                box.style.position = 'absolute';
                                box.style.left = left + 'px';
                                box.style.top = top + 'px';
                                box.style.width = width + 'px';
                                box.style.height = height + 'px';
                                overlayRoot.appendChild(box);
                            }
                        }
                    }
                }
            }
        }

        function showHintToast(msg) {
            try {
                const el = document.createElement('div');
                el.className = 'hint-toast';
                el.textContent = msg;
                document.body.appendChild(el);
                setTimeout(() => {
                    el.style.transition = 'opacity 300ms ease';
                    el.style.opacity = '0';
                    setTimeout(() => el.remove(), 400);
                }, 1400);
            } catch {}
        }
    })();
});
