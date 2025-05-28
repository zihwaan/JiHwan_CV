// Kakao SDK 초기화
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

const loginBtn  = document.getElementById('kakao-login');
const logoutBtn = document.getElementById('kakao-logout');
const form      = document.getElementById('guestbook-form');
const list      = document.getElementById('guestbook-entries');
const adminForm = document.getElementById('admin-form');
let   accessToken = localStorage.getItem('kakao_token');
let   adminToken  = localStorage.getItem('admin_token');

// ─────────────────── Helpers ───────────────────
function renderAuth() {
  if (accessToken) { loginBtn.classList.add('d-none'); logoutBtn.classList.remove('d-none'); }
  else             { loginBtn.classList.remove('d-none'); logoutBtn.classList.add('d-none'); }
}

function fetchComments() {
  fetch('/api/comments')
    .then(r => r.json())
    .then(data => {
      list.innerHTML = data.map(c => `
        <li data-id="${c.id}">
          <b>${c.name}</b> <small class="text-muted">${new Date(c.time).toLocaleString()}</small><br>
          ${c.text}
          <button class="btn btn-sm btn-link text-danger d-none admin-delete">삭제</button>
        </li>`).join('');
      if (adminToken) document.querySelectorAll('.admin-delete').forEach(b => b.classList.remove('d-none'));
    });
}

// ─────────────────── Auth / UI ─────────────────
renderAuth();
fetchComments();

loginBtn.addEventListener('click', () => {
  Kakao.Auth.login({
    scope: 'profile_nickname',
    success: res => {
      accessToken = res.access_token;
      localStorage.setItem('kakao_token', accessToken);
      renderAuth();
    },
    fail: err => alert('로그인 실패')
  });
});

logoutBtn.addEventListener('click', () => {
  Kakao.Auth.logout(() => {
    localStorage.removeItem('kakao_token');
    accessToken = null;
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
adminForm.addEventListener('submit', e => {
  e.preventDefault();
  fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('admin-pass').value })
  })
    .then(r => r.json())
    .then(({ token }) => {
      if (!token) return alert('비밀번호 불일치');
      adminToken = token;
      localStorage.setItem('admin_token', token);
      document.querySelectorAll('.admin-delete').forEach(b => b.classList.remove('d-none'));
    });
});

list.addEventListener('click', e => {
  if (!e.target.matches('.admin-delete')) return;
  const id = e.target.closest('li').dataset.id;
  fetch('/api/comments/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + adminToken }
  }).then(() => fetchComments());
});