document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       GLOBAL CONFIGURATION
       ========================================= */
    const CONFIG = {
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        effectId: 'phototo3d',
        model: 'image-effects',
        toolType: 'image-effects'
    };
    
    // Store the uploaded URL globally
    let currentUploadedUrl = null;

    /* =========================================
       API HELPER FUNCTIONS
       ========================================= */

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        // Endpoint: https://api.chromastudio.ai/get-emd-upload-url?fileName=...
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        // Domain: contents.maxstudio.ai
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const isVideo = CONFIG.model === 'video-effects';
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        // Headers
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };
    
        // Construct payload
        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: CONFIG.effectId,
                userId: CONFIG.userId,
                removeWatermark: true,
                model: CONFIG.model,
                isPrivate: true
            };
        } else {
            body = {
                model: CONFIG.model,
                toolType: CONFIG.toolType,
                effectId: CONFIG.effectId,
                imageUrl: imageUrl,
                userId: CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }
    
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // Poll job status until completed or failed
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 60; // Max 2 minutes
    
    async function pollJobStatus(jobId) {
        const isVideo = CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                console.log('Job completed!');
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    /* =========================================
       UI HELPERS
       ========================================= */
    const previewImg = document.getElementById('preview-image');
    const resultImg = document.getElementById('result-final');
    const loadingState = document.getElementById('loading-state');
    const downloadBtn = document.getElementById('download-btn');
    const uploadContent = document.querySelector('.upload-content');
    const placeholderContent = document.querySelector('.placeholder-content');
    const generateBtn = document.getElementById('generate-btn');

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
        if (placeholderContent) placeholderContent.classList.add('hidden');
        if (resultImg) resultImg.classList.add('hidden');
        
        // Ensure result video is hidden if it exists
        const video = document.getElementById('result-video');
        if (video) video.style.display = 'none';
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
    }

    function updateStatus(text) {
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate';
            } else if (text === 'COMPLETE') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Again';
            } else if (text === 'ERROR') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Try Again';
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg);
        updateStatus('ERROR');
    }

    function showPreview(url) {
        if (previewImg) {
            previewImg.src = url;
            previewImg.classList.remove('hidden');
        }
        if (uploadContent) uploadContent.classList.add('hidden');
        if (placeholderContent) placeholderContent.classList.remove('hidden');
        
        // Hide result initially
        if (resultImg) resultImg.classList.add('hidden');
        if (downloadBtn) downloadBtn.classList.add('hidden');
    }

    function showResultMedia(url) {
        const container = resultImg ? resultImg.parentElement : document.querySelector('.result-area');
        if (!container) return;
        
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            // Hide image
            if (resultImg) resultImg.classList.add('hidden');
            
            // Show/Create video
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImg ? resultImg.className : 'w-full h-auto rounded-lg';
                video.style.maxWidth = '100%';
                container.appendChild(video);
            }
            video.src = url;
            video.style.display = 'block';
            video.classList.remove('hidden');
        } else {
            // Hide video
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            // Show image
            if (resultImg) {
                resultImg.classList.remove('hidden');
                resultImg.src = url + '?t=' + new Date().getTime();
            }
        }
        
        // Hide placeholder
        if (placeholderContent) placeholderContent.classList.add('hidden');
    }

    function showDownloadButton(url) {
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.classList.remove('hidden');
        }
    }

    /* =========================================
       CORE LOGIC HANDLERS
       ========================================= */

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        try {
            // Reset states
            updateStatus('UPLOADING...');
            
            // Show local preview immediately if it's an image
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (previewImg) {
                        previewImg.src = e.target.result;
                        previewImg.classList.remove('hidden');
                    }
                    if (uploadContent) uploadContent.classList.add('hidden');
                };
                reader.readAsDataURL(file);
            }

            // Upload to API
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Ensure preview is set to the uploaded URL (better for consistency)
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            
        } catch (error) {
            console.error(error);
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first.');
            return;
        }
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Extract result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                throw new Error('No output URL in response');
            }
            
            console.log('Result URL:', resultUrl);
            
            // Step 4: Display result
            showResultMedia(resultUrl);
            updateStatus('COMPLETE');
            hideLoading();
            showDownloadButton(resultUrl);
            
        } catch (error) {
            hideLoading();
            console.error(error);
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    /* =========================================
       EVENT WIRING
       ========================================= */
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resetBtn = document.getElementById('reset-btn');

    // 1. File Input & Drop Zone
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
            dropZone.style.borderColor = 'var(--primary)';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            dropZone.style.borderColor = '';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            dropZone.style.borderColor = '';
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // 2. Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // 3. Download Button (Robust Strategy)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                // Strategy 1: Proxy
                const proxyUrl = 'https://api.chromastudio.ai/download-proxy?url=' + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error('Proxy failed');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine extension
                const contentType = response.headers.get('content-type') || '';
                let extension = 'png';
                if (contentType.includes('jpeg') || url.match(/\.jpe?g/i)) extension = 'jpg';
                else if (contentType.includes('webp') || url.match(/\.webp/i)) extension = 'webp';
                else if (contentType.includes('mp4') || url.match(/\.mp4/i)) extension = 'mp4';
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'result_' + generateNanoId(8) + '.' + extension;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (proxyErr) {
                console.warn('Proxy download failed, trying direct:', proxyErr);
                
                // Strategy 2: Direct Fetch
                try {
                    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                    const response = await fetch(fetchUrl);
                    if (response.ok) {
                        const blob = await response.blob();
                        const blobUrl = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = 'result_' + generateNanoId(8) + '.png';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                        return;
                    }
                } catch (fetchErr) {
                    console.warn('Direct fetch failed:', fetchErr);
                }

                // Strategy 3: Direct Link Fallback
                const link = document.createElement('a');
                link.href = url;
                link.download = 'result.png';
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // 4. Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            if (fileInput) fileInput.value = '';
            
            if (previewImg) {
                previewImg.src = '';
                previewImg.classList.add('hidden');
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            if (placeholderContent) placeholderContent.classList.add('hidden'); // Initially hidden
            if (resultImg) {
                resultImg.src = '';
                resultImg.classList.add('hidden');
            }
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            if (downloadBtn) downloadBtn.classList.add('hidden');
            hideLoading();
            
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generate';
            }
        });
    }

    /* =========================================
       NAVIGATION (Kept from original)
       ========================================= */
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });

        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    /* =========================================
       SCROLL ANIMATIONS (Kept from original)
       ========================================= */
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-on-scroll').forEach(section => {
        observer.observe(section);
    });

    /* =========================================
       FAQ ACCORDION (Kept from original)
       ========================================= */
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const answer = btn.nextElementSibling;
            const isOpen = btn.classList.contains('active');
            
            document.querySelectorAll('.faq-question').forEach(b => {
                b.classList.remove('active');
                b.nextElementSibling.style.maxHeight = null;
            });

            if (!isOpen) {
                btn.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    /* =========================================
       MODALS (Kept from original)
       ========================================= */
    const openModal = (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeModal = (id) => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    };

    document.querySelectorAll('[data-modal-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-modal-target');
            openModal(targetId);
        });
    });

    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-modal-close');
            closeModal(targetId);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
});