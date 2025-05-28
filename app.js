// Kakao SDK 초기화
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

const loginBtn  = document.getElementById('kakao-login');
const logoutBtn = document.getElementById('kakao-logout');
const form      = document.getElementById('guestbook-form');
const list      = document.getElementById('guestbook-entries');
const adminForm = document.getElementById('admin-form');
const adminPanel = document.getElementById('admin-panel');
const loginHistory = document.getElementById('login-history');
const refreshLoginsBtn = document.getElementById('refresh-logins');

let accessToken = '';
let adminToken  = '';

// ─────────────────── Helpers ───────────────────
function renderAuth() {
  if (accessToken) { 
    loginBtn.classList.add('d-none'); 
    logoutBtn.classList.remove('d-none'); 
  } else { 
    loginBtn.classList.remove('d-none'); 
    logoutBtn.classList.add('d-none'); 
  }
}

function fetchComments() {
  fetch('/api/comments')
    .then(r => r.json())
    .then(data => {
        list.innerHTML = data.map(c => `<li data-id="${c.id}" class="border-bottom pb-3 mb-3"><div class="d-flex gap-3"><img src="${c.image}" onerror="this.src='/assets/default_avatar.png'" alt="avatar" class="avatar flex-shrink-0"><div class="flex-grow-1"><div class="d-flex justify-content-between align-items-start mb-2"><div><strong class="d-block">${escapeHTML(c.name)}</strong><small class="text-muted">${new Date(c.time).toLocaleString()}</small></div><button class="btn btn-sm btn-outline-danger d-none admin-delete ms-2" title="댓글 삭제"><i class="fas fa-trash-alt"></i></button></div><pre class="comment-text mb-0">${escapeHTML(c.text)}</pre></div></div></li>`).join('');
      if (adminToken) document.querySelectorAll('.admin-delete').forEach(b => b.classList.remove('d-none'));
    });
}

function fetchLoginHistory() {
  if (!adminToken) return;
  
  fetch('/api/admin/logins', {
    headers: { 'Authorization': 'Bearer ' + adminToken }
  })
    .then(r => r.json())
    .then(data => {
      loginHistory.innerHTML = data.map(login => `<li class="border-bottom pb-3 mb-3"><div class="d-flex gap-3"><img src="${login.image}" onerror="this.src='/assets/default_avatar.png'" alt="avatar" class="avatar flex-shrink-0"><div class="flex-grow-1"><div class="d-flex justify-content-between align-items-start mb-2"><div><strong class="d-block">${escapeHTML(login.name)}</strong><small class="text-muted">${new Date(login.time).toLocaleString()}</small></div><span class="badge bg-success">로그인</span></div><p class="text-muted mb-0">${escapeHTML(login.msg)}</p></div></div></li>`).join('');
    })
    .catch(err => console.error('로그인 이력 조회 실패:', err));
}

function escapeHTML(str){
    return str.replace(/[&<>"']/g,m=>(
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// 로그인 이력 기록 함수
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
  
// ─────────────────── Auth / UI ─────────────────
renderAuth();
fetchComments();

loginBtn.addEventListener('click', () => {
  Kakao.Auth.login({
    scope: 'profile_nickname, profile_image',
    success: res => {
      accessToken = res.access_token;
      renderAuth();
      
      // 로그인 성공 후 이력 기록
      recordLogin();
    },
    fail: err => alert('로그인 실패')
  });
});

logoutBtn.addEventListener('click', () => {
  Kakao.Auth.logout(() => {
    accessToken = '';
    renderAuth();
  });
});

// ─────────────────── 댓글 등록 ──────────────────
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!accessToken) return alert('로그인이 필요합니다');
  const text = document.getElementById('guestbook-content').value.trim();
  if (!text) return;

  fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
    body: JSON.stringify({ text })
  })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(() => { form.reset(); fetchComments(); })
    .catch(() => alert('등록 실패'));
});

// ─────────────────── 관리자 모드 ────────────────
adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
  
    const pass = document.getElementById('admin-pass').value.trim();
    if (!pass) return alert('비밀번호를 입력하세요');
  
    const res   = await fetch('/api/admin/login', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ password: pass })
    });
    const data  = await res.json();
  
    if (!data.token) {
      alert('❌ 비밀번호 불일치');
      return;
    }
  
    /* ───────── 로그인 성공 ───────── */
    adminToken = data.token;
  
    // ① 삭제 버튼 즉시 노출
    document.querySelectorAll('.admin-delete')
            .forEach(btn => btn.classList.remove('d-none'));
  
    // ② 관리자 패널 표시
    adminPanel.classList.remove('d-none');
    adminForm.classList.add('d-none');
  
    // ③ 로그인 이력 불러오기
    fetchLoginHistory();
  
    // ④ 알림
    alert('✅ 관리자 모드로 전환되었습니다.');
});

// 댓글 삭제
list.addEventListener('click', e => {
  if (!e.target.matches('.admin-delete')) return;
  const id = e.target.closest('li').dataset.id;
  fetch('/api/comments/' + id, {    
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  }).then(() => fetchComments());
});

// 로그인 이력 새로고침
refreshLoginsBtn.addEventListener('click', () => {
  fetchLoginHistory();
});