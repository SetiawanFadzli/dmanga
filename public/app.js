document.addEventListener('DOMContentLoaded', () => {
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const parseBtn = document.getElementById('parseBtn');
  const sampleBtns = document.querySelectorAll('.sample-btn');

  const loadingSection = document.getElementById('loadingSection');
  const errorSection = document.getElementById('errorSection');
  const errorMessage = document.getElementById('errorMessage');
  const resultSection = document.getElementById('resultSection');

  const chapterTitle = document.getElementById('chapterTitle');
  const chapterSub = document.getElementById('chapterSub');
  const badgeLang = document.getElementById('badgeLang');
  const totalPages = document.getElementById('totalPages');

  const qualityOriginal = document.getElementById('qualityOriginal');
  const qualitySaver = document.getElementById('qualitySaver');

  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const downloadFolderBtn = document.getElementById('downloadFolderBtn');
  const folderInputGroup = document.getElementById('folderInputGroup');
  const customFolderPath = document.getElementById('customFolderPath');
  const confirmFolderBtn = document.getElementById('confirmFolderBtn');

  const progressSection = document.getElementById('progressSection');
  const progressStatusText = document.getElementById('progressStatusText');
  const progressPercentText = document.getElementById('progressPercentText');
  const progressBarFill = document.getElementById('progressBarFill');

  const pagesGrid = document.getElementById('pagesGrid');
  const pageCountSpan = document.getElementById('pageCountSpan');

  let currentChapterData = null;
  let selectedQuality = 'original'; // 'original' or 'saver'

  // Clipboard Paste helper
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text;
      }
    } catch (err) {
      console.warn('Could not read clipboard:', err);
    }
  });

  // Sample link buttons
  sampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      urlInput.value = btn.dataset.url;
      urlForm.dispatchEvent(new Event('submit'));
    });
  });

  // Quality Toggle handler
  qualityOriginal.addEventListener('click', () => {
    qualityOriginal.classList.add('active');
    qualitySaver.classList.remove('active');
    selectedQuality = 'original';
    renderGallery();
  });

  qualitySaver.addEventListener('click', () => {
    qualitySaver.classList.add('active');
    qualityOriginal.classList.remove('active');
    selectedQuality = 'saver';
    renderGallery();
  });

  // Toggle local folder custom path input
  downloadFolderBtn.addEventListener('click', () => {
    folderInputGroup.classList.toggle('hidden');
    if (!folderInputGroup.classList.contains('hidden')) {
      customFolderPath.focus();
    }
  });

  const batchImageSection = document.getElementById('batchImageSection');
  const batchImageInput = document.getElementById('batchImageInput');
  const processBatchBtn = document.getElementById('processBatchBtn');
  const autoPageCount = document.getElementById('autoPageCount');
  const autoGenerateBtn = document.getElementById('autoGenerateBtn');

  // 1-Click Auto Generator for MangaFire & CDN sequences
  autoGenerateBtn.addEventListener('click', () => {
    const count = parseInt(autoPageCount.value, 10) || 25;
    const slug = currentChapterData?.slug || '703y6-perfect-life-system-double-cash-for-her-favor';
    const cleanId = slug.split('-')[0] || '703y6';
    const chapterId = currentChapterData?.chapterId || '9345287';

    const urls = [];
    for (let i = 1; i <= count; i++) {
      urls.push(`https://s.mfcdn.nl/manga/${cleanId}/${chapterId}/${i}.jpg`);
    }

    batchImageInput.value = urls.join('\n');
    processBatchBtn.click();
  });

  // Process Batch Image Links Input
  processBatchBtn.addEventListener('click', () => {
    const text = batchImageInput.value.trim();
    if (!text) return;

    const urls = text.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) {
      showError('Tidak ada URL gambar valid yang ditemukan. Masukkan URL yang dimulai dengan http:// atau https://');
      return;
    }

    hideError();
    const total = urls.length;
    const formatNum = (idx, tot) => String(idx + 1).padStart(Math.max(2, String(tot).length), '0');

    const pagesOriginal = urls.map((imgUrl, i) => ({
      page: i + 1,
      url: imgUrl,
      filename: `${formatNum(i, total)}.jpg`
    }));

    const chapterData = {
      type: 'chapter',
      chapterId: currentChapterData?.chapterId || 'Batch',
      mangaTitle: currentChapterData?.mangaTitle || 'Custom Manga Batch',
      chapterNum: currentChapterData?.chapterNum || 'Batch',
      volume: null,
      fullTitle: (currentChapterData?.mangaTitle || 'Custom Manga Batch') + ' (Converted .JPG)',
      language: 'ALL',
      totalPages: total,
      pages: {
        original: pagesOriginal,
        saver: pagesOriginal
      }
    };

    currentChapterData = chapterData;
    displayChapterInfo(chapterData);
    renderGallery();
    resultSection.classList.remove('hidden');
  });

  // Submit URL Form
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    showLoading(true, 'Mengambil data metadata chapter...');
    hideError();
    resultSection.classList.add('hidden');
    progressSection.classList.add('hidden');
    folderInputGroup.classList.add('hidden');
    batchImageSection.classList.add('hidden');

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      showLoading(false);

      if (!response.ok) {
        showError(data.error || 'Gagal memproses link.');
        return;
      }

      if (data.type === 'chapter') {
        currentChapterData = data;
        displayChapterInfo(data);

        if (data.totalPages === 0) {
          batchImageSection.classList.remove('hidden');
          pagesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #a5b4fc; background: rgba(15, 23, 42, 0.6); border-radius: 10px;"><i class="fa-solid fa-circle-info" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; color: var(--primary);"></i><b>Chapter ' + (data.mangaTitle || 'Manga') + ' Terdeteksi!</b><br><small style="display:block; margin-top:0.4rem; color: var(--text-muted);">MangaFire memerlukan input URL gambar direct. Tempel link URL gambar halaman (1 per baris) pada kotak di atas lalu klik <b>Process & Convert to .JPG</b>.</small></div>';
        } else {
          batchImageSection.classList.add('hidden');
          renderGallery();
        }

        resultSection.classList.remove('hidden');
      } else if (data.type === 'nhentai_client_fallback') {
        await handleNhentaiClientFallback(data.galleryId);
      } else {
        showError('Link series/manga terdeteksi. Silakan pilih link chapter tertentu untuk didownload.');
      }
    } catch (err) {
      showLoading(false);
      showError('Terjadi kesalahan jaringan atau server: ' + err.message);
    }
  });

  // Client-side fallback fetcher for nhentai via Opera VPN
  async function handleNhentaiClientFallback(galleryId) {
    showLoading(true, 'Memproses metadata nhentai via koneksi Opera VPN...');
    try {
      const res = await fetch(`https://nhentai.net/api/gallery/${galleryId}`);
      if (!res.ok) throw new Error('Gagal mengambil data dari nhentai via browser Opera');
      
      const data = await res.json();
      const mediaId = data.media_id;
      const titleObj = data.title || {};
      const mangaTitle = titleObj.pretty || titleObj.english || titleObj.japanese || `Gallery ${galleryId}`;

      const extMap = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' };
      const rawPages = data.images?.pages || [];
      const total = rawPages.length;

      const formatNum = (idx, tot) => String(idx + 1).padStart(Math.max(2, String(tot).length), '0');

      const pagesOriginal = rawPages.map((p, i) => {
        const ext = extMap[p.t] || 'jpg';
        return {
          page: i + 1,
          url: `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
          filename: `${formatNum(i, total)}.jpg`
        };
      });

      const parsedData = {
        type: 'chapter',
        chapterId: galleryId,
        mangaTitle,
        chapterNum: `#${galleryId}`,
        volume: null,
        fullTitle: `${mangaTitle} (#${galleryId})`,
        language: 'ALL',
        totalPages: total,
        pages: {
          original: pagesOriginal,
          saver: pagesOriginal
        }
      };

      currentChapterData = parsedData;
      showLoading(false);
      displayChapterInfo(parsedData);
      renderGallery();
      resultSection.classList.remove('hidden');
    } catch (err) {
      showLoading(false);
      showError('Gagal mengambil data nhentai: ' + err.message + '. Pastikan koneksi Opera VPN Anda telah aktif.');
    }
  }

  // Display Chapter Info
  function displayChapterInfo(data) {
    chapterTitle.textContent = data.mangaTitle || 'Manga Chapter';
    const volumeStr = data.volume ? `Volume ${data.volume} • ` : '';
    const chapterStr = data.chapterNum ? `Chapter ${data.chapterNum}` : '';
    chapterSub.textContent = `${volumeStr}${chapterStr}`.trim();
    
    badgeLang.textContent = (data.language || 'EN').toUpperCase();
    totalPages.textContent = `${data.totalPages} Halaman`;
    pageCountSpan.textContent = data.totalPages;
  }

  // Render Image Gallery Preview
  function renderGallery() {
    if (!currentChapterData) return;
    const pagesList = currentChapterData.pages[selectedQuality];
    pagesGrid.innerHTML = '';

    pagesList.forEach((pageObj) => {
      const card = document.createElement('div');
      card.className = 'page-card';

      const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(pageObj.url)}&_t=${Date.now()}`;

      card.innerHTML = `
        <div class="page-thumb-wrapper">
          <img src="${proxiedUrl}" alt="Page ${pageObj.page}" class="page-thumb" loading="lazy" />
        </div>
        <div class="page-info">
          <span>Hal. ${pageObj.page}</span>
          <span class="page-tag">.JPG</span>
        </div>
      `;

      pagesGrid.appendChild(card);
    });
  }

  // Download ZIP
  downloadZipBtn.addEventListener('click', async () => {
    if (!currentChapterData) return;

    const pages = currentChapterData.pages[selectedQuality];
    const zipName = `${currentChapterData.mangaTitle}-Ch${currentChapterData.chapterNum}`.trim();

    updateProgress(0, 'Menyiapkan proses download & konversi...');
    progressSection.classList.remove('hidden');

    try {
      const initRes = await fetch('/api/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages, zipFilename: zipName })
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || 'Gagal memulai pembuatan ZIP');
      }

      const { jobId } = await initRes.json();

      // Poll real progress from server
      await new Promise((resolve, reject) => {
        const pollTimer = setInterval(async () => {
          try {
            const pRes = await fetch(`/api/zip-progress/${jobId}`);
            if (!pRes.ok) return;
            const pData = await pRes.json();

            if (pData.status === 'processing') {
              updateProgress(pData.percent, `Mengunduh & mengonversi halaman ${pData.completed}/${pData.total} (${pData.percent}%)...`);
            } else if (pData.status === 'done') {
              clearInterval(pollTimer);
              updateProgress(100, `Semua ${pData.total} halaman selesai dikonversi! Mengunduh file ZIP...`);
              
              // Direct download finalized zip file
              const a = document.createElement('a');
              a.href = `/api/zip-download/${jobId}`;
              a.download = `${zipName}.zip`;
              document.body.appendChild(a);
              a.click();
              a.remove();

              setTimeout(() => {
                updateProgress(100, `Berhasil didownload sebagai file ZIP (${pData.total} halaman .jpg)!`);
                resolve();
              }, 1200);
            } else if (pData.status === 'error') {
              clearInterval(pollTimer);
              reject(new Error(pData.error || 'Gagal memproses file ZIP'));
            }
          } catch (e) {
            clearInterval(pollTimer);
            reject(e);
          }
        }, 400);
      });
    } catch (err) {
      updateProgress(0, 'Error: ' + err.message);
      showError('Gagal mendownload ZIP: ' + err.message);
    }
  });

  // Confirm Save to Folder (Real Progress)
  confirmFolderBtn.addEventListener('click', async () => {
    if (!currentChapterData) return;

    const pages = currentChapterData.pages[selectedQuality];
    const folderName = `${currentChapterData.mangaTitle}-Ch${currentChapterData.chapterNum}`.trim();
    const customPath = customFolderPath.value.trim();

    updateProgress(0, 'Menyiapkan penyimpanan ke folder lokal...');
    progressSection.classList.remove('hidden');

    try {
      const initRes = await fetch('/api/download-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages, folderName, customPath })
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || 'Gagal memulai penyimpanan ke folder');
      }

      const { jobId } = await initRes.json();

      await new Promise((resolve, reject) => {
        const pollTimer = setInterval(async () => {
          try {
            const pRes = await fetch(`/api/folder-progress/${jobId}`);
            if (!pRes.ok) return;
            const pData = await pRes.json();

            if (pData.status === 'processing') {
              updateProgress(pData.percent, `Menyimpan gambar ${pData.completed}/${pData.total} (${pData.percent}%)...`);
            } else if (pData.status === 'done') {
              clearInterval(pollTimer);
              updateProgress(100, `Berhasil disimpan ${pData.total} file .jpg di: ${pData.savedPath}`);
              resolve();
            } else if (pData.status === 'error') {
              clearInterval(pollTimer);
              reject(new Error(pData.error || 'Gagal menyimpan ke folder'));
            }
          } catch (e) {
            clearInterval(pollTimer);
            reject(e);
          }
        }, 400);
      });
    } catch (err) {
      updateProgress(0, 'Error: ' + err.message);
      showError('Gagal menyimpan ke folder: ' + err.message);
    }
  });

  // Helpers
  function showLoading(show, text = '') {
    if (show) {
      loadingSection.classList.remove('hidden');
      if (text) document.getElementById('loadingText').textContent = text;
    } else {
      loadingSection.classList.add('hidden');
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorSection.classList.remove('hidden');
  }

  function hideError() {
    errorSection.classList.add('hidden');
  }

  function updateProgress(percent, statusText) {
    progressBarFill.style.width = `${percent}%`;
    progressPercentText.textContent = `${percent}%`;
    progressStatusText.innerHTML = statusText;
  }
});
