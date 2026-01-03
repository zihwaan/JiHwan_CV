// ==========================================
// Navbar & UI Logic (from scripts.js)
// ==========================================
window.addEventListener('DOMContentLoaded', event => {

    // Navbar shrink function
    var navbarShrink = function () {
        const navbarCollapsible = document.body.querySelector('#mainNav');
        if (!navbarCollapsible) {
            return;
        }
        if (window.scrollY === 0) {
            navbarCollapsible.classList.remove('navbar-shrink')
        } else {
            navbarCollapsible.classList.add('navbar-shrink')
        }

    };

    // Shrink the navbar 
    navbarShrink();

    // Shrink the navbar when page is scrolled
    document.addEventListener('scroll', navbarShrink);

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 72,
        });
    };

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    responsiveNavItems.map(function (responsiveNavItem) {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });

});

if (typeof gsap !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    Number.prototype.numberFormat = function(decimals, dec_point, thousands_sep) {
        dec_point = typeof dec_point !== 'undefined' ? dec_point : '.';
        thousands_sep = typeof thousands_sep !== 'undefined' ? thousands_sep : ',';

        var parts = this.toFixed(decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousands_sep);

        return parts.join(dec_point);
    }

    var startCount = {var: 0};

    gsap.to(startCount, {
      var: 51950000, duration: 3, ease:"none",
      onUpdate: changeNumber,
      scrollTrigger: {
        trigger: "#number",
      },
    })

    function changeNumber() {
      const numberEl = document.getElementById('number');
      if(numberEl) numberEl.innerHTML = ((startCount.var.numberFormat(0)) + "원");
    }
}

// ==========================================
// Guestbook & Admin Logic
// ==========================================

/* Kakao SDK 초기화 */
try {
    Kakao.init(window.KAKAO_JS_KEY || document.querySelector('meta[name="kakao-key"]').content);
} catch(e) { console.error("Kakao Init Error", e); }

/* ===== DOM ===== */
const $ = q => document.querySelector(q);
const loginBtn  = $('#kakao-login');
const logoutBtn = $('#kakao-logout');
const form      = $('#guestbook-form');
const list      = $('#guestbook-entries');
const adminForm = $('#admin-form');
const refreshLoginsBtn = $('#refresh-logins');
const mainAdminLogoutBtn = $('#main-admin-logout-btn');

let accessToken = localStorage.getItem('kakao_token') ?? '';
let adminToken  = localStorage.getItem('admin_token') ?? '';
let replyingTo  = null; 

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
      if (ul) {
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
    const adminDeleteButtons = list ? list.querySelectorAll('.admin-delete') : [];

    if (adminPanel) adminPanel.classList.toggle('d-none', !isAdminActive);
    if (adminForm) adminForm.classList.toggle('d-none', isAdminActive);
    document.body.classList.toggle('admin-mode', isAdminActive);
    adminDeleteButtons.forEach(btn => btn.classList.toggle('d-none', !isAdminActive));
}


/* ─────────── 방명록 목록 ─────────── */
let commentsMap = {};
let childrenMap = {};

function fetchComments() {
  fetch('/api/comments')
    .then(res => res.json())
    .then(data => {
      // Build maps
      commentsMap = {};
      childrenMap = {};
      
      data.forEach(c => {
          commentsMap[c.id] = c;
          const pid = c.parentId || 'ROOT';
          if (!childrenMap[pid]) childrenMap[pid] = [];
          childrenMap[pid].push(c);
      });

      if (list) {
        list.innerHTML = renderComments();
        updateAdminUI(!!adminToken);
      }
    }).catch(err => console.error("댓글 로드 실패:", err));
}

function renderComments() {
    const roots = childrenMap['ROOT'] || [];
    // Sort roots by time DESC (Newest first)
    roots.sort((a, b) => b.time - a.time);
    
    let html = '';
    roots.forEach(root => {
        html += renderCommentNode(root, 0);
    });
    return html;
}

function renderCommentNode(c, depth) {
    // Render current comment
    let html = createCommentHTML(c, depth);
    
    // Render children (replies)
    const children = childrenMap[c.id];
    if (children && children.length > 0) {
        // Sort children by time ASC (Oldest first - conversation flow)
        children.sort((a, b) => a.time - b.time);
        
        children.forEach(child => {
            html += renderCommentNode(child, depth + 1);
        });
    }
    return html;
}

function createCommentHTML(c, depth) {
    const isReply = depth > 0;
    // No indentation (margin-left: 0), but use visual cues
    // If it's a reply to a reply (depth > 1), show who they are replying to
    let replyIndicator = '';
    let targetName = '';
    
    if (isReply) {
        const parent = commentsMap[c.parentId];
        targetName = parent ? parent.name : 'Unknown';
        replyIndicator = `<span class="text-muted me-1"><i class="fas fa-turn-up fa-rotate-90"></i></span>`; 
        // Or fa-reply, fa-share... fa-turn-up rotated looks like L-shaped arrow
    }

    const deleteBtn = `<button class="btn btn-sm btn-link text-danger d-none admin-delete" data-id="${c.id}">삭제</button>`;

    // Style for reply: darker bg, maybe left border
    const itemStyle = isReply ? 'background-color: #fafafa;' : '';
    const wrapperClass = isReply ? 'ps-3 border-start border-3 border-light' : ''; 
    // ps-3 gives small padding, not full indentation. 
    // User said "remove shifting". 
    // If I use ps-3, it is shifting.
    // Let's use minimal padding and "To Name" logic.
    
    // STRICT "No Shift" request:
    // "답글을 달면 왼쪽이 좀 쉬프트돼서 여백이 생기는데... 밀리는걸없애고"
    // So NO margin-left / padding-left increasing with depth.
    // However, keeping distinct.
    
    // I will use a flat list look, but with a badge or icon.
    // And maybe grouped visually.
    
    return `
      <li data-id="${c.id}" class="py-2 border-bottom ${isReply ? 'bg-light' : ''}" style="${isReply ? 'padding-left: 10px;' : ''}">
        <div class="d-flex gap-2">
            <div style="width: 40px; text-align: center; flex-shrink: 0;">
                ${isReply ? '<i class="fas fa-reply text-muted fa-rotate-180"></i>' : ''}
                <img src="${c.image}" onerror="this.src='/assets/default_avatar.png'" class="avatar" alt="" style="${isReply ? 'width: 28px; height: 28px;' : ''}">
            </div>
            <div class="flex-grow-1">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${escapeHTML(c.name)}</strong>
                        ${isReply && depth > 1 ? `<small class="text-muted ms-1">To: ${escapeHTML(targetName)}</small>` : ''}
                    </div>
                    <small class="text-muted">${new Date(c.time).toLocaleString('ko-KR')}</small>
                </div>
                <p class="comment-text mb-0">${escapeHTML(c.text.trim())}</p>
                <div class="d-flex gap-2 mt-1">
                    <button class="btn btn-sm btn-light py-0 px-2 reply-btn" onclick="setReply('${c.id}', '${escapeHTML(c.name)}')">답글</button>
                </div>
            </div>
            ${deleteBtn}
        </div>
      </li>`;
}


window.setReply = (id, name) => {
    if (!accessToken) return alert('답글을 달려면 로그인이 필요합니다.');
    replyingTo = id;
    const input = $('#guestbook-content');
    const label = $('#reply-target-label');
    
    // Show reply indicator
    if (!label) {
        const div = document.createElement('div');
        div.id = 'reply-target-label';
        div.className = 'alert alert-info py-1 px-3 mb-2 d-flex justify-content-between align-items-center';
        div.innerHTML = `<small>To: <b>${name}</b></small> <button type="button" class="btn-close btn-close-white small" onclick="cancelReply()"></button>`;
        form.insertBefore(div, input);
    } else {
        label.innerHTML = `<small>To: <b>${name}</b></small> <button type="button" class="btn-close small" onclick="cancelReply()"></button>`;
        label.classList.remove('d-none');
    }
    input.placeholder = `${name}님에게 답글 작성...`;
    input.focus();
    form.scrollIntoView({behavior: "smooth", block: "center"});
};

window.cancelReply = () => {
    replyingTo = null;
    const label = $('#reply-target-label');
    if (label) label.classList.add('d-none');
    const input = $('#guestbook-content');
    if(input) {
        input.placeholder = "내용을 입력하세요…";
        input.value = '';
    }
};


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
          } catch(e) { console.warn(e); }
        },
        fail: () => alert('로그인에 실패했습니다.')
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
                alert('로그아웃 되었습니다.');
            });
        } else {
            accessToken = '';
            localStorage.removeItem('kakao_token');
            renderAuth();
            alert('로그아웃 되었습니다.');
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

      const payload = { text };
      if (replyingTo) payload.replyTo = replyingTo;

      fetch('/api/comments', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
        body:JSON.stringify(payload)
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('등록 실패')))
        .then(() => { 
            textInput.value = ''; 
            if(replyingTo) cancelReply();
            fetchComments(); 
        })
        .catch(err => alert(err.message));
    };
}

/* ─────────── 관리자 모드 ─────────── */
if (adminForm) {
    adminForm.onsubmit = async e => {
      e.preventDefault();
      const passInput = $('#admin-pass');
      const pass = passInput.value.trim();
      if (!pass) return alert('비밀번호를 입력하세요.');

      try {
        const res  = await fetch('/api/admin/login',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({password:pass})
        });
        const result = await res.json();

        if (!res.ok || !result.token) return alert('비밀번호가 일치하지 않습니다.');

        adminToken = result.token;
        localStorage.setItem('admin_token', adminToken);
        updateAdminUI(true);
        fetchLoginHistory();
        passInput.value = '';
        alert('관리자 모드로 전환되었습니다.');

      } catch (error) {
          console.error(error);
          alert("오류가 발생했습니다.");
      }
    };
}

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
      
      const id = deleteButton.dataset.id;

      if (confirm('정말 삭제하시겠습니까? (답글도 함께 삭제될 수 있습니다)')) {
          fetch('/api/comments/' + id,{
            method:'DELETE',
            headers:{'Authorization':'Bearer '+adminToken}
          }).then(r => {
              if (!r.ok) throw new Error('삭제 실패');
              return r.json();
          })
          .then(() => fetchComments())
          .catch(err => alert(err.message));
      }
    };
}

if (refreshLoginsBtn) {
    refreshLoginsBtn.addEventListener('click', () => {
        fetchLoginHistory();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderAuth();
    fetchComments();
    if (adminToken) {
      updateAdminUI(true);
      fetchLoginHistory();
    }
});