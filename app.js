// Kakao SDK 초기화
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

// DOM 요소 선택
const loginBtn = document.getElementById('kakao-login');
const logoutBtn = document.getElementById('kakao-logout');
const form = document.getElementById('guestbook-form');
const list = document.getElementById('guestbook-entries');
const adminForm = document.getElementById('admin-form');
const adminPanel = document.getElementById('admin-panel');
const loginHistory = document.getElementById('login-history');
const refreshLoginsBtn = document.getElementById('refresh-logins');

// 상태 변수
let accessToken = '';
let adminToken = '';

// ─────────────────── Helper Functions ───────────────────

/**
 * 로그인 상태에 따라 버튼 표시/숨김 처리
 */
function renderAuth() {
    if (accessToken) {
        loginBtn.classList.add('d-none');
        logoutBtn.classList.remove('d-none');
    } else {
        loginBtn.classList.remove('d-none');
        logoutBtn.classList.add('d-none');
    }
}

/**
 * HTML 이스케이프 처리
 * @param {string} str - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
}

/**
 * 댓글 목록 가져오기 및 렌더링
 */
function fetchComments() {
    fetch('/api/comments')
        .then(r => r.json())
        .then(data => {
            list.innerHTML = data.map(c => `
                <li data-id="${c.id}" class="border-bottom pb-3 mb-3">
                    <div class="d-flex gap-3">
                        <img src="${c.image}"
                             onerror="this.src='/assets/default_avatar.png'"
                             alt="avatar" class="avatar flex-shrink-0">
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                    <strong class="d-block">${escapeHTML(c.name)}</strong>
                                    <small class="text-muted">
                                        ${new Date(c.time).toLocaleString()}
                                    </small>
                                </div>
                                <button class="btn btn-sm btn-outline-danger d-none admin-delete ms-2" 
                                        title="댓글 삭제">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="comment-text">
                                ${escapeHTML(c.text.trim()).replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    </div>
                </li>
            `).join('');
            
            // 관리자 모드일 때 삭제 버튼 표시
            if (adminToken) {
                document.querySelectorAll('.admin-delete')
                    .forEach(btn => btn.classList.remove('d-none'));
            }
        })
        .catch(err => console.error('댓글 불러오기 실패:', err));
}

/**
 * 로그인 이력 가져오기 및 렌더링
 */
function fetchLoginHistory() {
    if (!adminToken) return;
    
    fetch('/api/admin/logins', {
        headers: { 'Authorization': 'Bearer ' + adminToken }
    })
        .then(r => r.json())
        .then(data => {
            loginHistory.innerHTML = data.map(login => `
                <li class="border-bottom pb-3 mb-3">
                    <div class="d-flex gap-3">
                        <img src="${login.image}"
                             onerror="this.src='/assets/default_avatar.png'"
                             alt="avatar" class="avatar flex-shrink-0">
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                    <strong class="d-block">${escapeHTML(login.name)}</strong>
                                    <small class="text-muted">
                                        ${new Date(login.time).toLocaleString()}
                                    </small>
                                </div>
                                <span class="badge bg-success">로그인</span>
                            </div>
                            <p class="text-muted mb-0">${escapeHTML(login.msg)}</p>
                        </div>
                    </div>
                </li>
            `).join('');
        })
        .catch(err => console.error('로그인 이력 조회 실패:', err));
}

/**
 * 로그인 이력 기록
 */
function recordLogin() {
    if (!accessToken) return;
    
    fetch('/api/logins', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    })
        .then(r => r.json())
        .then(() => {
            console.log('로그인 이력이 기록되었습니다.');
            // 관리자 모드가 활성화되어 있다면 이력 새로고침
            if (adminToken) {
                fetchLoginHistory();
            }
        })
        .catch(err => console.error('로그인 이력 기록 실패:', err));
}

// ─────────────────── Event Listeners ───────────────────

/**
 * 카카오 로그인 버튼 클릭
 */
loginBtn.addEventListener('click', () => {
    Kakao.Auth.login({
        scope: 'profile_nickname, profile_image',
        success: res => {
            accessToken = res.access_token;
            renderAuth();
            recordLogin();
        },
        fail: err => {
            console.error('로그인 실패:', err);
            alert('로그인 실패');
        }
    });
});

/**
 * 로그아웃 버튼 클릭
 */
logoutBtn.addEventListener('click', () => {
    Kakao.Auth.logout(() => {
        accessToken = '';
        renderAuth();
    });
});

/**
 * 댓글 등록 폼 제출
 */
form.addEventListener('submit', e => {
    e.preventDefault();
    
    if (!accessToken) {
        alert('로그인이 필요합니다');
        return;
    }
    
    const text = document.getElementById('guestbook-content').value.trim();
    if (!text) return;

    fetch('/api/comments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify({ text })
    })
        .then(res => {
            if (!res.ok) throw new Error('등록 실패');
            return res.json();
        })
        .then(() => {
            form.reset();
            fetchComments();
        })
        .catch(err => {
            console.error('댓글 등록 실패:', err);
            alert('등록 실패');
        });
});

/**
 * 관리자 모드 로그인 폼 제출
 */
adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pass = document.getElementById('admin-pass').value.trim();
    if (!pass) {
        alert('비밀번호를 입력하세요');
        return;
    }

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
        });
        
        const data = await res.json();

        if (!data.token) {
            alert('❌ 비밀번호 불일치');
            return;
        }

        // 관리자 로그인 성공
        adminToken = data.token;

        // 삭제 버튼 즉시 노출
        document.querySelectorAll('.admin-delete')
            .forEach(btn => btn.classList.remove('d-none'));

        // 관리자 패널 표시
        adminPanel.classList.remove('d-none');
        adminForm.classList.add('d-none');

        // 로그인 이력 불러오기
        fetchLoginHistory();

        // 성공 알림
        alert('✅ 관리자 모드로 전환되었습니다.');
    } catch (err) {
        console.error('관리자 로그인 실패:', err);
        alert('관리자 로그인 실패');
    }
});

/**
 * 댓글 삭제 버튼 클릭 (이벤트 위임)
 */
list.addEventListener('click', e => {
    if (!e.target.closest('.admin-delete')) return;
    
    const id = e.target.closest('li').dataset.id;
    if (!id) return;
    
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    fetch('/api/comments/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + adminToken }
    })
        .then(res => {
            if (!res.ok) throw new Error('삭제 실패');
            fetchComments();
        })
        .catch(err => {
            console.error('댓글 삭제 실패:', err);
            alert('삭제 실패');
        });
});

/**
 * 로그인 이력 새로고침 버튼 클릭
 */
refreshLoginsBtn.addEventListener('click', () => {
    fetchLoginHistory();
});

// ─────────────────── Initialization ─────────────────

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    renderAuth();
    fetchComments();
});