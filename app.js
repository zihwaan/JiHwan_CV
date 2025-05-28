/* Kakao SDK 초기화 */
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

/* ===== DOM ===== */
const $ = q => document.querySelector(q);
const loginBtn  = $('#kakao-login');
const logoutBtn = $('#kakao-logout');
const form      = $('#guestbook-form');
const list      = $('#guestbook-entries');
const adminForm = $('#admin-form');
const refreshLoginsBtn = $('#refresh-logins');

let accessToken = localStorage.getItem('kakao_token') ?? '';
let adminToken  = localStorage.getItem('admin_token') ?? '';

/* ===== 공통 ===== */
const escapeHTML = s =>
  s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function fetchLoginHistory() {
  if (!adminToken) return;
  fetch('/api/admin/logins', {
    headers: { 'Authorization': 'Bearer ' + adminToken }
  })
    .then(r => r.json())
    .then(data => {
      const ul = $('#login-history');
      ul.innerHTML = data.map(l => `
        <li class="d-flex gap-2 py-1">
          <img src="${l.image}" class="avatar" alt="">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <strong>${escapeHTML(l.name)}</strong>
              <small class="text-muted">${new Date(l.time).toLocaleString()}</small>
            </div>
            <span class="text-muted">${l.msg}</span>
          </div>
        </li>`).join('');
    });
}

/* ─────────── UI helpers ─────────── */
function renderAuth() {
  loginBtn.classList.toggle('d-none', !!accessToken);
  logoutBtn.classList.toggle('d-none', !accessToken);
}

/* ─────────── 방명록 목록 ─────────── */
function fetchComments() {
  fetch('/api/comments')
    .then(res => res.json())
    .then(data => {
      list.innerHTML = data.map(c => `
        <li data-id="${c.id}" class="d-flex gap-2 py-2 border-bottom">
          <img src="${c.image}" onerror="this.src='/assets/default_avatar.png'" class="avatar" alt="">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <strong>${escapeHTML(c.name)}</strong>
              <small class="text-muted">${new Date(c.time).toLocaleString()}</small>
            </div>
            <p class="comment-text mb-0">${escapeHTML(c.text.trim())}</p>
          </div>
          <button class="btn btn-sm btn-link text-danger d-none admin-delete">삭제</button>
        </li>`).join('');

      if (adminToken) list.querySelectorAll('.admin-delete').forEach(b => b.classList.remove('d-none'));
    });
}

/* ─────────── 인증 ─────────── */
renderAuth();
fetchComments();

loginBtn.onclick = () => {
  Kakao.Auth.login({
    scope: 'profile_nickname,profile_image',
    success: r => {
      accessToken = r.access_token;
      localStorage.setItem('kakao_token', accessToken);
      renderAuth();
    },
    fail: () => alert('로그인 실패')
  });
};

logoutBtn.onclick = () => {
  Kakao.Auth.logout(() => {
    accessToken = '';
    localStorage.removeItem('kakao_token');
    renderAuth();
  });
};

/* ─────────── 댓글 등록 ─────────── */
form.onsubmit = e => {
  e.preventDefault();
  if (!accessToken) return alert('로그인이 필요합니다');
  const text = $('#guestbook-content').value.trim();
  if (!text) return;

  fetch('/api/comments', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
    body:JSON.stringify({text})
  })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(() => { form.reset(); fetchComments(); })
    .catch(() => alert('등록 실패'));
};

/* ─────────── 관리자 모드 ─────────── */
adminForm.onsubmit = async e => {
  e.preventDefault();
  const pass = $('#admin-pass').value.trim();
  if (!pass) return alert('비밀번호를 입력하세요');

  const res  = await fetch('/api/admin/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({password:pass})
  }).then(r => r.json());

  if (!res.token) return alert('❌ 비밀번호 불일치');

  adminToken = res.token;
  localStorage.setItem('admin_token', adminToken);
  $('#admin-panel').classList.remove('d-none');
  list.querySelectorAll('.admin-delete').forEach(btn => btn.classList.remove('d-none'));
  adminForm.classList.add('d-none');
  document.body.classList.add('admin-mode');
  alert('✅ 관리자 모드로 전환되었습니다.');
  new bootstrap.Toast($('#adminToast')).show();
};

/* ─────────── 댓글 삭제 (위임) ─────────── */
list.onclick = e => {
  if (!e.target.closest('.admin-delete')) return;
  const id = e.target.closest('li').dataset.id;
  fetch('/api/comments/'+id,{
    method:'DELETE',
    headers:{'Authorization':'Bearer '+adminToken}
  }).then(() => fetchComments());
};


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
    if (adminToken) {
      $('#admin-panel').classList.remove('d-none');
      adminForm.classList.add('d-none');
      document.body.classList.add('admin-mode');
    }
    
});
