document.addEventListener('DOMContentLoaded', () => {
    const adminToken = localStorage.getItem('admin_token');

    // DOM Elements
    const createMemoForm = document.getElementById('create-memo-form');
    const memoTitleInput = document.getElementById('memo-title');
    const memoContentInput = document.getElementById('memo-content');
    const memoColorInput = document.getElementById('memo-color');
    const memosContainer = document.getElementById('memos-container');

    const editMemoModalElement = document.getElementById('editMemoModal');
    const editMemoModal = editMemoModalElement ? new bootstrap.Modal(editMemoModalElement) : null;
    const editMemoForm = document.getElementById('edit-memo-form');
    const editMemoIdInput = document.getElementById('edit-memo-id');
    const editMemoTitleInput = document.getElementById('edit-memo-title');
    const editMemoContentInput = document.getElementById('edit-memo-content');
    const editMemoColorInput = document.getElementById('edit-memo-color');
    const saveMemoChangesBtn = document.getElementById('save-memo-changes-btn');

    // Helper function to escape HTML (basic XSS prevention)
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, function (match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    }

    // 1. Admin Authentication Check
    if (!adminToken) {
        alert('관리자 접근 권한이 필요합니다. 먼저 로그인해주세요.');
        window.location.href = 'index.html';
        return; // Stop script execution
    }

    // 2. Fetch and Display Memos
    async function fetchAndRenderMemos() {
        if (!memosContainer) return;
        try {
            const response = await fetch('/api/admin/memos', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${adminToken}`
                }
            });

            if (response.status === 401) {
                alert('세션이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.');
                localStorage.removeItem('admin_token');
                window.location.href = 'index.html';
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '메모를 불러오는데 실패했습니다.');
            }

            const memos = await response.json();
            memosContainer.innerHTML = ''; // Clear existing memos

            if (memos.length === 0) {
                const noMemoMessage = document.createElement('div');
                noMemoMessage.className = 'col-12 text-center text-muted mt-3';
                noMemoMessage.innerHTML = '<p><i class="fas fa-folder-open fa-2x mb-2"></i><br>메모가 없습니다. 새 메모를 작성해보세요!</p>';
                memosContainer.appendChild(noMemoMessage);
                return;
            }

            memos.forEach(memo => {
                const memoCol = document.createElement('div');
                memoCol.className = 'col'; // For Bootstrap grid

                const memoBox = document.createElement('div');
                memoBox.className = 'memo-box h-100 d-flex flex-column'; // Added h-100 and flex classes
                memoBox.style.backgroundColor = escapeHTML(memo.color || '#e9ecef');

                const cardBody = document.createElement('div');
                cardBody.className = 'card-body d-flex flex-column flex-grow-1'; // Added flex-grow-1

                const title = document.createElement('h5');
                title.className = 'card-title';
                title.textContent = escapeHTML(memo.title);

                const timestamp = document.createElement('p');
                timestamp.className = 'timestamp card-subtitle mb-2 text-muted';
                timestamp.textContent = new Date(memo.time).toLocaleString('ko-KR');

                const content = document.createElement('p');
                content.className = 'card-text flex-grow-1'; // Allow content to take available space
                content.textContent = escapeHTML(memo.content);

                const actions = document.createElement('div');
                actions.className = 'memo-actions mt-auto'; // Push actions to the bottom

                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-sm btn-outline-primary edit-memo-btn';
                editBtn.innerHTML = '<i class="fas fa-edit"></i> 수정';
                editBtn.dataset.id = memo.id;
                editBtn.dataset.title = memo.title;
                editBtn.dataset.content = memo.content;
                editBtn.dataset.color = memo.color;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm btn-outline-danger delete-memo-btn ms-2';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> 삭제';
                deleteBtn.dataset.id = memo.id;

                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);

                cardBody.appendChild(title);
                cardBody.appendChild(timestamp);
                cardBody.appendChild(content);
                cardBody.appendChild(actions);
                memoBox.appendChild(cardBody);
                memoCol.appendChild(memoBox);
                memosContainer.appendChild(memoCol);
            });

        } catch (error) {
            console.error('메모 불러오기 오류:', error);
            // alert(`오류: ${error.message}`);
            memosContainer.innerHTML = `<div class="col-12"><p class="text-danger text-center mt-3">메모를 불러올 수 없습니다: ${error.message}</p></div>`;
        }
    }

    // 3. Create Memo
    if (createMemoForm) {
        createMemoForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const title = memoTitleInput.value.trim();
            const content = memoContentInput.value.trim();
            const color = memoColorInput.value;

            if (!title || !content) {
                alert('제목과 내용은 필수입니다.');
                return;
            }

            try {
                const response = await fetch('/api/admin/memos', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ title, content, color })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '메모 생성에 실패했습니다.');
                }

                createMemoForm.reset(); 
                memoColorInput.value = '#e9ecef'; // Reset color to new default
                await fetchAndRenderMemos(); 
            } catch (error) {
                console.error('메모 생성 오류:', error);
                alert(`오류: ${error.message}`);
            }
        });
    }

    // 4. Edit Memo & 5. Delete Memo (Event Delegation)
    if (memosContainer) {
        memosContainer.addEventListener('click', async (event) => {
            const target = event.target.closest('button'); // Get the button element itself
            if (!target) return;


            // Edit Memo
            if (target.classList.contains('edit-memo-btn')) {
                if (!editMemoModal || !editMemoForm) return;
                editMemoIdInput.value = target.dataset.id;
                editMemoTitleInput.value = target.dataset.title;
                editMemoContentInput.value = target.dataset.content;
                editMemoColorInput.value = target.dataset.color;
                editMemoModal.show();
            }

            // Delete Memo
            if (target.classList.contains('delete-memo-btn')) {
                const memoId = target.dataset.id;
                if (confirm('이 메모를 정말 삭제하시겠습니까?')) {
                    try {
                        const response = await fetch(`/api/admin/memos/${memoId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${adminToken}`
                            }
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || '메모 삭제에 실패했습니다.');
                        }
                        await fetchAndRenderMemos();
                    } catch (error) {
                        console.error('메모 삭제 오류:', error);
                        alert(`오류: ${error.message}`);
                    }
                }
            }
        });
    }
    
    // Save Changes (Edit Memo Form Submission)
    if (saveMemoChangesBtn && editMemoForm) {
        saveMemoChangesBtn.addEventListener('click', async () => {
            const id = editMemoIdInput.value;
            const title = editMemoTitleInput.value.trim();
            const content = editMemoContentInput.value.trim();
            const color = editMemoColorInput.value;

            if (!title || !content) {
                alert('제목과 내용은 수정을 위해 필수입니다.');
                return;
            }

            try {
                const response = await fetch(`/api/admin/memos/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ title, content, color })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '메모 업데이트에 실패했습니다.');
                }
                
                if (editMemoModal) {
                    editMemoModal.hide();
                }
                await fetchAndRenderMemos();
            } catch (error) {
                console.error('메모 업데이트 오류:', error);
                alert(`오류: ${error.message}`);
            }
        });
    }

    // Initial fetch of memos
    fetchAndRenderMemos();
});