document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewImg = document.getElementById('preview-img');
    const placeholder = document.getElementById('upload-placeholder');
    const form = document.getElementById('banana-form');
    const loading = document.getElementById('loading-spinner');
    const resultBox = document.getElementById('result-box');
    const svgContainer = document.getElementById('svg-container');

    // Handle Drag & Drop / Click
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                previewImg.style.display = 'block';
                placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }
    }

    // Client-side Resize to avoid huge payload
    function resizeImage(file, maxWidth = 800) {
        return new Promise((resolve) => {
            if (!file) resolve(null);
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // Compress
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            alert('사진을 업로드해주세요!');
            return;
        }

        const gender = document.getElementById('gender').value;
        const mbti = document.getElementById('mbti').value;
        const personality = document.getElementById('personality').value;

        // Show loading
        loading.style.display = 'flex';
        resultBox.style.display = 'none';

        try {
            const base64Image = await resizeImage(file);

            const res = await fetch('/api/nano/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Image,
                    gender,
                    mbti,
                    personality
                })
            });

            const data = await res.json();

            if (res.ok) {
                // Success
                svgContainer.innerHTML = data.svg;
                form.style.display = 'none';
                resultBox.style.display = 'block';
            } else {
                alert('오류가 발생했습니다: ' + (data.error || 'Unknown Error'));
            }

        } catch (err) {
            console.error(err);
            alert('서버 통신 중 오류가 발생했습니다.');
        } finally {
            loading.style.display = 'none';
        }
    });
});
