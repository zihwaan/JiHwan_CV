/* Kakao SDK 초기화 */
Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);

/* ===== DOM ===== */
const $ = q => document.querySelector(q);
const loginBtn  = $('#kakao-login');
const logoutBtn = $('#kakao-logout'); // User logout
const form      = $('#guestbook-form');
const list      = $('#guestbook-entries');
const adminForm = $('#admin-form');
const refreshLoginsBtn = $('#refresh-logins');
const mainAdminLogoutBtn = $('#main-admin-logout-btn'); // Admin logout from admin panel

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
      if (ul) { // Check if element exists
        ul.innerHTML = data.map(l => `
          <li class="d-flex gap-2 py-1">
            <img src="${l.image}" class="avatar" alt="">
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between">
                <strong>${escapeHTML(l.name)}</strong>
                <small class="text-muted">${new Date(l.time).toLocaleString('ko-KR')}</small>
              </div>
              <span class="text-muted">${l.msg}</span>
            </div>
          </li>`).join('');
      }
    }).catch(err => console.error("로그인 이력 로드 실패:", err));
}

/* ─────────── UI helpers ─────────── */
function renderAuth() {
  if (loginBtn) loginBtn.classList.toggle('d-none', !!accessToken);
  if (logoutBtn) logoutBtn.classList.toggle('d-none', !accessToken);
}

function updateAdminUI(isAdminActive) {
    const adminPanel = $('#admin-panel');
    const adminDeleteButtons = list.querySelectorAll('.admin-delete');

    if (adminPanel) adminPanel.classList.toggle('d-none', !isAdminActive);
    if (adminForm) adminForm.classList.toggle('d-none', isAdminActive);
    document.body.classList.toggle('admin-mode', isAdminActive);
    adminDeleteButtons.forEach(btn => btn.classList.toggle('d-none', !isAdminActive));
}


/* ─────────── 방명록 목록 ─────────── */
function fetchComments() {
  fetch('/api/comments')
    .then(res => res.json())
    .then(data => {
      if (list) { // Check if element exists
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
        updateAdminUI(!!adminToken); // Ensure delete buttons visibility is correct
      }
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
                } catch(e) {
                  console.warn('⚠️ 로그인 이력 저장 실패', e);
                }
        },
        fail: () => alert('로그인에 실패했습니다. 다시 시도해주세요.')
      });
    };
}

if (logoutBtn) {
    logoutBtn.onclick = () => {
        if (Kakao.Auth.getAccessToken()) {
            Kakao.Auth.logout(() => {
                accessToken = '';
                localStorage.removeItem('kakao_token');
                renderAuth();
                alert('카카오 로그아웃 되었습니다.');
            });
        } else {
            accessToken = '';
            localStorage.removeItem('kakao_token');
            renderAuth();
            alert('카카오 로그아웃 되었습니다.');
        }
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
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
        body:JSON.stringify({text})
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('댓글 등록에 실패했습니다.')))
        .then(() => { form.reset(); fetchComments(); })
        .catch(err => alert(err.message));
    };
}

/* ─────────── 관리자 모드 ─────────── */
if (adminForm) {
    adminForm.onsubmit = async e => {
      e.preventDefault();
      const passInput = $('#admin-pass');
      const pass = passInput.value.trim();
      if (!pass) return alert('관리자 비밀번호를 입력하세요.');

      try {
        const res  = await fetch('/api/admin/login',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({password:pass})
        });
        
        const result = await res.json();

        if (!res.ok || !result.token) {
            passInput.value = ''; // Clear password field on failure
            return alert('❌ 비밀번호가 일치하지 않습니다.');
        }

        adminToken = result.token;
        localStorage.setItem('admin_token', adminToken);
        updateAdminUI(true);
        
        alert('✅ 관리자 모드로 전환되었습니다.');
        const adminToastEl = $('#adminToast');
        if (adminToastEl && bootstrap.Toast) { // Check if bootstrap is loaded
            new bootstrap.Toast(adminToastEl).show();
        }
        fetchLoginHistory();
        passInput.value = ''; // Clear password field on success

      } catch (error) {
          console.error("관리자 로그인 오류:", error);
          alert("관리자 로그인 중 오류가 발생했습니다.");
      }
    };
}

// Admin Logout from Admin Panel
if (mainAdminLogoutBtn) {
    mainAdminLogoutBtn.onclick = () => {
        adminToken = '';
        localStorage.removeItem('admin_token');
        updateAdminUI(false);
        alert('관리자 모드에서 로그아웃되었습니다.');
    };
}


/* ─────────── 댓글 삭제 (위임) ─────────── */
if (list) {
    list.onclick = e => {
      const deleteButton = e.target.closest('.admin-delete');
      if (!deleteButton || !adminToken) return;
      
      const listItem = deleteButton.closest('li');
      if (!listItem) return;

      const id = listItem.dataset.id;
      if (confirm('이 댓글을 정말 삭제하시겠습니까?')) {
          fetch('/api/comments/'+id,{
            method:'DELETE',
            headers:{'Authorization':'Bearer '+adminToken}
          }).then(r => {
              if (!r.ok) throw new Error('댓글 삭제에 실패했습니다.');
              return r.json();
          })
          .then(() => fetchComments())
          .catch(err => alert(err.message));
      }
    };
}


/**
 * 로그인 이력 새로고침 버튼 클릭
 */
if (refreshLoginsBtn) {
    refreshLoginsBtn.addEventListener('click', () => {
        fetchLoginHistory();
    });
}

// ─────────────────── Initialization ─────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderAuth();
    fetchComments();
    if (adminToken) {
      updateAdminUI(true);
      fetchLoginHistory(); // Fetch login history if already in admin mode
    }
});