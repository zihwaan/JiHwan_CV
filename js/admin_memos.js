document.addEventListener('DOMContentLoaded', () => {
    const adminToken = localStorage.getItem('admin_token');

    // DOM Elements
    const logoutBtn = document.getElementById('admin-logout-btn');
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
        alert('Admin access required. Please log in.');
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
                alert('Session expired or invalid. Please log in again.');
                localStorage.removeItem('admin_token');
                window.location.href = 'index.html';
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch memos');
            }

            const memos = await response.json();
            memosContainer.innerHTML = ''; // Clear existing memos

            if (memos.length === 0) {
                memosContainer.innerHTML = '<p>No memos found. Create one!</p>';
                return;
            }

            memos.forEach(memo => {
                const memoBox = document.createElement('div');
                memoBox.className = 'memo-box card';
                memoBox.style.backgroundColor = escapeHTML(memo.color || '#FFFFCC');

                const cardBody = document.createElement('div');
                cardBody.className = 'card-body';

                const title = document.createElement('h5');
                title.className = 'card-title';
                title.textContent = escapeHTML(memo.title);

                const timestamp = document.createElement('p');
                timestamp.className = 'timestamp card-subtitle mb-2 text-muted';
                timestamp.textContent = new Date(memo.time).toLocaleString();

                const content = document.createElement('p');
                content.className = 'card-text';
                content.textContent = escapeHTML(memo.content); // Use textContent for security

                const actions = document.createElement('div');
                actions.className = 'memo-actions';

                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-sm btn-warning edit-memo-btn';
                editBtn.textContent = 'Edit';
                editBtn.dataset.id = memo.id;
                editBtn.dataset.title = memo.title;
                editBtn.dataset.content = memo.content;
                editBtn.dataset.color = memo.color;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm btn-danger delete-memo-btn ms-2';
                deleteBtn.textContent = 'Delete';
                deleteBtn.dataset.id = memo.id;

                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);

                cardBody.appendChild(title);
                cardBody.appendChild(timestamp);
                cardBody.appendChild(content);
                cardBody.appendChild(actions);
                memoBox.appendChild(cardBody);
                memosContainer.appendChild(memoBox);
            });

        } catch (error) {
            console.error('Error fetching memos:', error);
            alert(`Error: ${error.message}`);
            memosContainer.innerHTML = `<p class="text-danger">Could not load memos: ${error.message}</p>`;
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
                alert('Title and content are required.');
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
                    throw new Error(errorData.error || 'Failed to create memo');
                }

                createMemoForm.reset(); // Reset form
                memoColorInput.value = '#FFFFCC'; // Reset color to default
                await fetchAndRenderMemos(); // Refresh list
            } catch (error) {
                console.error('Error creating memo:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }

    // 4. Edit Memo & 5. Delete Memo (Event Delegation)
    if (memosContainer) {
        memosContainer.addEventListener('click', async (event) => {
            const target = event.target;

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
                if (confirm('Are you sure you want to delete this memo?')) {
                    try {
                        const response = await fetch(`/api/admin/memos/${memoId}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${adminToken}`
                            }
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to delete memo');
                        }
                        await fetchAndRenderMemos(); // Refresh list
                    } catch (error) {
                        console.error('Error deleting memo:', error);
                        alert(`Error: ${error.message}`);
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
                alert('Title and content are required for editing.');
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
                    throw new Error(errorData.error || 'Failed to update memo');
                }
                
                if (editMemoModal) {
                    editMemoModal.hide();
                }
                await fetchAndRenderMemos(); // Refresh list
            } catch (error) {
                console.error('Error updating memo:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }


    // 6. Admin Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('admin_token');
            alert('You have been logged out.');
            window.location.href = 'index.html';
        });
    }

    // Initial fetch of memos
    fetchAndRenderMemos();
});
