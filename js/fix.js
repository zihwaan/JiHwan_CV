// js/fix.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Kakao Init
    if (typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
        Kakao.init(window.KAKAO_JS_KEY);
    }

    const termContainer = document.getElementById('terminal-container');
    const authBtn = document.getElementById('auth-btn');
    const statusBadge = document.getElementById('status-badge');
    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    const adminCodeSection = document.getElementById('admin-code-section');

    let socket;
    let term;
    let fitAddon;
    let accessToken = localStorage.getItem('kakao_token');
    
    // Initial Auth Check
    if (!accessToken) {
        authModal.show();
    } else {
        checkAuthAndConnect();
    }

    // Kakao Login
    document.getElementById('kakao-login-btn').addEventListener('click', () => {
        Kakao.Auth.login({
            scope: 'profile_nickname,profile_image',
            success: (authObj) => {
                accessToken = authObj.access_token;
                localStorage.setItem('kakao_token', accessToken);
                checkAuthAndConnect();
            },
            fail: () => alert('로그인 실패')
        });
    });

    // Admin Code Submit
    document.getElementById('admin-code-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = document.getElementById('admin-code').value;
        if (!code) return;

        try {
            const res = await fetch('/api/fix/verify-admin', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ code })
            });
            if (res.ok) {
                authModal.hide();
                connectSocket(); // Connect after verifying
            } else {
                alert('잘못된 코드입니다.');
            }
        } catch (e) {
            alert('서버 오류');
        }
    });

    async function checkAuthAndConnect() {
        try {
            const res = await fetch('/api/fix/check-auth', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (res.ok) {
                const data = await res.json();
                authBtn.textContent = data.user.name;
                authBtn.classList.replace('btn-outline-warning', 'btn-success');
                authModal.hide();
                connectSocket();
            } else {
                // Not authorized yet, show admin code input
                adminCodeSection.classList.remove('d-none');
                if(!authModal._isShown) authModal.show();
            }
        } catch (e) {
            console.error(e);
            authModal.show();
        }
    }

    function connectSocket() {
        if (socket && socket.connected) return;

        // Initialize Xterm
        if (!term) {
            term = new Terminal({
                cursorBlink: true,
                fontSize: 14,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                theme: {
                    background: '#000000',
                    foreground: '#f0f0f0'
                }
            });
            fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
            term.open(termContainer);
            fitAddon.fit();

            window.addEventListener('resize', () => {
                fitAddon.fit();
                if(socket) socket.emit('resize', { cols: term.cols, rows: term.rows });
            });
        }

        statusBadge.textContent = 'Connecting...';
        statusBadge.className = 'badge bg-warning';

        // Connect Socket.io
        socket = io({
            auth: {
                token: accessToken
            }
        });

        socket.on('connect', () => {
            statusBadge.textContent = 'Connected';
            statusBadge.className = 'badge bg-success';
            term.write('\r\n\x1b[32m✅ Connected to Server Terminal\x1b[0m\r\n');
            socket.emit('resize', { cols: term.cols, rows: term.rows });
        });

        socket.on('disconnect', () => {
            statusBadge.textContent = 'Disconnected';
            statusBadge.className = 'badge bg-danger';
            term.write('\r\n\x1b[31m❌ Connection Lost\x1b[0m\r\n');
        });

        socket.on('connect_error', (err) => {
            statusBadge.textContent = 'Auth Failed';
            statusBadge.className = 'badge bg-danger';
            term.write(`\r\n\x1b[31m❌ Connection Error: ${err.message}\x1b[0m\r\n`);
        });

        // Receive Data
        socket.on('data', (data) => {
            term.write(data);
        });

        // Send Data
        term.onData((data) => {
            socket.emit('input', data);
        });
    }
});
