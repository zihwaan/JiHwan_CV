/* Kakao SDK 초기화 */
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

/* ===== DOM ===== */
const $ = q => document.querySelector(q);
const loginBtn  = $('#kakao-login');
const logoutBtn = $('#kakao-logout');
const form      = $('#guestbook-form');
const list      = $('#guestbook-entries');

let accessToken = localStorage.getItem('kakao_token') ?? '';
let adminToken  = localStorage.getItem('admin_token') ?? '';

/* ===== 공통 ===== */
const escapeHTML = s =>
  s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ─────────── UI helpers ─────────── */
function renderAuth() {
  if (loginBtn)  loginBtn.classList.toggle('d-none', !!accessToken);
  if (logoutBtn) logoutBtn.classList.toggle('d-none', !accessToken);
}

function renderAdminDeleteButtons() {
    // Only the delete buttons on guestbook entries need to toggle.
    const buttons = list ? list.querySelectorAll('.admin-delete') : [];
    buttons.forEach(btn => btn.classList.toggle('d-none', !adminToken));
    document.body.classList.toggle('admin-mode', !!adminToken);
}

/* ─────────── 방명록 목록 ─────────── */
function fetchComments() {
  fetch('/api/comments')
    .then(res => res.json())
    .then(data => {
      if (!list) return;
      list.innerHTML = data.map(c => `
        <li data-id="${c.id}" class="d-flex gap-2 py-2 border-bottom">
          <img src="${c.image}" onerror="this.src='/assets/default_avatar.png'" class="avatar" alt="">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between">
              <strong>${escapeHTML(c.name)}</strong>
              <small class="text-muted">${new Date(c.time).toLocaleString('ko-KR')}</small>
            </div>
            <p class="comment-text mb-0">${escapeHTML(c.text.trim())}</p>
          </div>
          <button class="btn btn-sm btn-link text-danger d-none admin-delete">삭제</button>
        </li>`).join('');
      renderAdminDeleteButtons();
    }).catch(err => console.error("댓글 로드 실패:", err));
}

/* ─────────── 인증 ─────────── */
renderAuth();
fetchComments();

if (loginBtn) {
  loginBtn.onclick = () => {
    Kakao.Auth.login({
      scope: 'profile_nickname,profile_image',
      success: async r => {
        accessToken = r.access_token;
        localStorage.setItem('kakao_token', accessToken);
        renderAuth();
        try {
          await fetch('/api/logins', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + accessToken }
          });
        } catch (e) {
          console.warn('⚠️ 로그인 이력 저장 실패', e);
        }
      },
      fail: () => alert('로그인에 실패했습니다. 다시 시도해주세요.')
    });
  };
}

if (logoutBtn) {
  logoutBtn.onclick = () => {
    const clear = () => {
      accessToken = '';
      localStorage.removeItem('kakao_token');
      renderAuth();
      alert('카카오 로그아웃 되었습니다.');
    };
    if (Kakao.Auth.getAccessToken()) Kakao.Auth.logout(clear);
    else clear();
  };
}

/* ─────────── 댓글 등록 ─────────── */
if (form) {
  form.onsubmit = e => {
    e.preventDefault();
    if (!accessToken) return alert('댓글을 작성하려면 로그인이 필요합니다.');
    const textInput = $('#guestbook-content');
    const text = textInput.value.trim();
    if (!text) return alert('댓글 내용을 입력해주세요.');

    fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
      body: JSON.stringify({ text })
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('댓글 등록에 실패했습니다.')))
      .then(() => { form.reset(); fetchComments(); })
      .catch(err => alert(err.message));
  };
}

/* ─────────── 비공개 카드 잠금 해제 (비밀번호 모달) ─────────── */
// Two auth flavors share one modal:
//   data-auth="admin-jwt"  → POST /api/admin/login (Express), save admin JWT
//   data-auth="wm-pin"     → probe /wealthmate/api/auth/gate_status with
//                             x-wm-pin header, save PIN to localStorage
// On success: navigate to the card's href.
const passModalEl   = $('#adminPassModal');
const passModal     = passModalEl && window.bootstrap ? new bootstrap.Modal(passModalEl) : null;
const passForm      = $('#admin-pass-form');
const passInput     = $('#admin-pass-input');
const passError     = $('#admin-pass-error');
const passLabel     = $('#admin-pass-target-label');
const passModalTitle = $('#adminPassModalLabel');
const passSubmitBtn = $('#admin-pass-submit');

const WM_PIN_STORAGE_KEY = 'wm:access_pin';
let pendingHref  = null;
let pendingTitle = null;
let pendingAuth  = null; // 'admin-jwt' | 'wm-pin'

function openLockModal({ href, title, auth }) {
  pendingHref = href;
  pendingTitle = title || '비공개 페이지';
  pendingAuth = auth;
  if (passInput) {
    passInput.value = '';
    passInput.placeholder = auth === 'wm-pin' ? 'PIN' : '비밀번호';
    passInput.setAttribute('autocomplete', auth === 'wm-pin' ? 'off' : 'current-password');
  }
  if (passLabel) {
    passLabel.textContent = auth === 'wm-pin'
      ? `"${pendingTitle}" 접속에 PIN 이 필요합니다.`
      : `"${pendingTitle}" 접속에 비밀번호가 필요합니다.`;
  }
  if (passModalTitle) {
    passModalTitle.innerHTML = auth === 'wm-pin'
      ? '<i class="fas fa-lock me-1"></i> PIN 입력'
      : '<i class="fas fa-lock me-1"></i> 비밀번호 확인';
  }
  if (passError) passError.classList.add('d-none');
  if (passModal) passModal.show();
  setTimeout(() => passInput?.focus(), 150);
}

document.querySelectorAll('a[data-auth]').forEach((card) => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    const href = card.getAttribute('href');
    const title = (card.querySelector('h5')?.textContent || '').trim();
    const auth = card.getAttribute('data-auth');

    // If we already have the matching credential, navigate immediately.
    // Server will 401 if stale and the SPA will bounce back to the hub.
    if (auth === 'admin-jwt' && adminToken) {
      window.location.href = href;
      return;
    }
    if (auth === 'wm-pin' && localStorage.getItem(WM_PIN_STORAGE_KEY)) {
      window.location.href = href;
      return;
    }
    openLockModal({ href, title, auth });
  });
});

async function verifyAdminPassword(pass) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return { ok: false };
  adminToken = data.token;
  localStorage.setItem('admin_token', adminToken);
  renderAdminDeleteButtons();
  return { ok: true };
}

async function verifyWealthmatePin(pin) {
  const res = await fetch('/wealthmate/api/auth/gate_status', {
    headers: { 'x-wm-pin': pin },
  });
  if (!res.ok) return { ok: false };
  const data = await res.json().catch(() => ({}));
  if (!data.ok) return { ok: false };
  localStorage.setItem(WM_PIN_STORAGE_KEY, pin);
  return { ok: true };
}

if (passForm) {
  passForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const secret = (passInput?.value || '').trim();
    if (!secret) return;
    passSubmitBtn.disabled = true;
    passError.classList.add('d-none');
    try {
      const result = pendingAuth === 'wm-pin'
        ? await verifyWealthmatePin(secret)
        : await verifyAdminPassword(secret);
      if (!result.ok) {
        passError.textContent = pendingAuth === 'wm-pin'
          ? 'PIN 이 맞지 않습니다.'
          : '비밀번호가 맞지 않습니다.';
        passError.classList.remove('d-none');
        passInput.value = '';
        passInput.focus();
        return;
      }
      if (passModal) passModal.hide();
      if (pendingHref) window.location.href = pendingHref;
    } catch (err) {
      passError.textContent = '네트워크 오류: ' + (err.message || String(err));
      passError.classList.remove('d-none');
    } finally {
      passSubmitBtn.disabled = false;
    }
  });
}

// If the SPA kicked us back here with ?locked=wm (stale PIN), auto-open.
(function handleLockedRedirect() {
  const sp = new URLSearchParams(window.location.search);
  if (sp.get('locked') === 'wm') {
    openLockModal({
      href: '/wealthmate/',
      title: 'WealthMate',
      auth: 'wm-pin',
    });
    // clean URL so reload doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

/* ─────────── 댓글 삭제 (위임) ─────────── */
if (list) {
  list.onclick = e => {
    const deleteButton = e.target.closest('.admin-delete');
    if (!deleteButton || !adminToken) return;

    const listItem = deleteButton.closest('li');
    if (!listItem) return;

    const id = listItem.dataset.id;
    if (!confirm('이 댓글을 정말 삭제하시겠습니까?')) return;

    fetch('/api/comments/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    }).then(r => {
      if (!r.ok) throw new Error('댓글 삭제에 실패했습니다.');
      return r.json();
    })
      .then(() => fetchComments())
      .catch(err => alert(err.message));
  };
}

/* ─────────── Initialization ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderAuth();
  fetchComments();
  renderAdminDeleteButtons();
});
