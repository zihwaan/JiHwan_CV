document.addEventListener('DOMContentLoaded', () => {
    // 1. Init Kakao
    if (typeof Kakao !== 'undefined' && !Kakao.isInitialized()) {
        Kakao.init(window.KAKAO_JS_KEY);
    }

    const chatBox = document.getElementById('chat-box');
    const form = document.getElementById('command-form');
    const input = document.getElementById('command-input');
    const sendBtn = document.getElementById('send-btn');
    const authBtn = document.getElementById('auth-btn');
    const authModal = new bootstrap.Modal(document.getElementById('authModal'));
    
    let accessToken = localStorage.getItem('kakao_token');
    let userProfile = null;

    // Check Auth on Load
    if (!accessToken) {
        authModal.show();
    } else {
        verifyUser(accessToken);
    }

    // Kakao Login Handler
    document.getElementById('kakao-login-btn').addEventListener('click', () => {
        Kakao.Auth.login({
            scope: 'profile_nickname,profile_image',
            success: (authObj) => {
                accessToken = authObj.access_token;
                localStorage.setItem('kakao_token', accessToken);
                verifyUser(accessToken);
            },
            fail: (err) => {
                alert('로그인 실패');
            }
        });
    });

    // Admin Code Verification (Optional layer if Kakao ID not in .env yet)
    document.getElementById('verify-admin-btn').addEventListener('click', async () => {
        const code = document.getElementById('admin-code').value;
        if(!code) return;
        
        try {
            const res = await fetch('/api/fix/verify-admin', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ code })
            });
            if(res.ok) {
                authModal.hide();
                enableInterface();
                addMessage('system', '관리자 권한이 확인되었습니다.');
            } else {
                alert('관리자 코드가 올바르지 않습니다.');
            }
        } catch(e) {
            console.error(e);
        }
    });

    async function verifyUser(token) {
        try {
            // Simply check against server if this user is allowed to use /fix
            const res = await fetch('/api/fix/check-auth', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                userProfile = data.user;
                authModal.hide();
                enableInterface();
                authBtn.textContent = `${userProfile.name} (Admin)`;
                authBtn.classList.replace('btn-outline-warning', 'btn-success');
                addMessage('system', `환영합니다, ${userProfile.name}님. Agent가 대기 중입니다.`);
            } else {
                // Not authorized yet
                document.getElementById('admin-code-section').classList.remove('d-none');
                authBtn.textContent = '미승인 사용자';
            }
        } catch (e) {
            console.error(e);
            authModal.show();
        }
    }

    function enableInterface() {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }

    function addMessage(type, text, isHtml = false) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        if(isHtml) div.innerHTML = text;
        else div.textContent = text;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Command Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cmd = input.value.trim();
        if(!cmd) return;

        addMessage('user', cmd);
        input.value = '';
        input.focus();
        
        const loaderId = 'loader-' + Date.now();
        addMessage('agent', '작업을 시작합니다... (다소 시간이 소요될 수 있습니다)');
        
        // Optimistic UI for loader
        const loaderDiv = chatBox.lastElementChild;
        loaderDiv.innerHTML += ` <span id="${loaderId}" class="spinner-border spinner-border-sm"></span>`;

        try {
            const res = await fetch('/api/fix/run', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ prompt: cmd })
            });

            const data = await res.json();
            document.getElementById(loaderId)?.remove();

            if (res.ok) {
                addMessage('agent', `✅ 작업 완료!`);
                if(data.output) {
                    addMessage('agent', `<div class="terminal-log">${data.output}</div>`, true);
                }
                if(data.gitResult) {
                     addMessage('system', `Git Push Status:
${data.gitResult}`);
                }
            } else {
                addMessage('agent', `❌ 오류 발생: ${data.error}`);
                if(data.details) addMessage('agent', `<div class="terminal-log text-danger">${data.details}</div>`, true);
            }

        } catch (e) {
            document.getElementById(loaderId)?.remove();
            addMessage('agent', `❌ 네트워크/서버 오류: ${e.message}`);
        } finally {
            input.disabled = false;
            input.focus();
        }
    });

});