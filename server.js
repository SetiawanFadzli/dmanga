const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const archiver = require('archiver');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;

const net = require('net');

// Headless browser scraper for MangaFire chapters
async function scrapeMangaFireWithPuppeteer(targetUrl) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const operaPath = (process.env.LOCALAPPDATA || '') + '\\Programs\\Opera\\opera.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : (fs.existsSync(operaPath) ? operaPath : null);

  if (!executablePath) {
    throw new Error('Chrome atau Opera tidak ditemukan di sistem.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const capturedImages = new Set();

  page.on('response', (response) => {
    const url = response.url();
    if ((url.includes('mfcdn') || url.includes('/mf/')) && (url.includes('.jpg') || url.includes('.png') || url.includes('.webp') || url.includes('/h/p'))) {
      if (!url.includes('logo') && !url.includes('favicon') && !url.includes('avatar') && !url.includes('DSFSURjG')) {
        capturedImages.add(url);
      }
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));

    // Trigger Page-Turning (ArrowRight, PageDown, Space) & Auto-Scroll for Paged Reader Mode
    await page.evaluate(() => {
      window.focus();
      document.body.click();
    });

    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('PageDown');
      await page.keyboard.press('Space');

      await page.evaluate(() => {
        window.scrollBy(0, 1200);
      });

      await new Promise(r => setTimeout(r, 200));
    }

    await new Promise(r => setTimeout(r, 2000));

    // Also inspect all DOM img src & data-src attributes
    const domImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img, .page-img, [data-url], [data-src]'));
      return imgs.map(img => img.src || img.getAttribute('data-src') || img.getAttribute('data-url')).filter(Boolean);
    });

    domImages.forEach(url => {
      if ((url.includes('mfcdn') || url.includes('/mf/')) && !url.includes('logo') && !url.includes('avatar')) {
        capturedImages.add(url);
      }
    });

  } catch (e) {
    console.warn('Puppeteer scroll notice:', e.message);
  } finally {
    await browser.close();
  }

  return Array.from(capturedImages);
}

// Headless browser scraper for nhentai galleries (bypasses Cloudflare challenge)
async function scrapeNhentaiWithPuppeteer(galleryId) {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const operaPath = (process.env.LOCALAPPDATA || '') + '\\Programs\\Opera\\opera.exe';
  const executablePath = fs.existsSync(chromePath) ? chromePath : (fs.existsSync(operaPath) ? operaPath : null);

  if (!executablePath) {
    throw new Error('Chrome atau Opera tidak ditemukan di sistem.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--host-resolver-rules=MAP nhentai.net 172.67.74.203, MAP *.nhentai.net 77.247.178.1'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    const targetUrl = `https://nhentai.net/g/${galleryId}/`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate((gid) => {
      // 1. Try embedded SvelteKit JSON
      const jsonEl = document.querySelector('script[data-url*="/api/v2/galleries/"]');
      if (jsonEl) {
        try {
          const parsed = JSON.parse(jsonEl.textContent);
          const body = typeof parsed.body === 'string' ? JSON.parse(parsed.body) : parsed.body;
          if (body && body.pages && Array.isArray(body.pages) && body.pages.length > 0) {
            return {
              success: true,
              mangaTitle: body.title?.pretty || body.title?.english || body.title?.japanese || `Gallery ${gid}`,
              fullTitle: `${body.title?.english || body.title?.pretty || gid} (#${gid})`,
              pages: body.pages.map((p, i) => ({
                page: p.number || (i + 1),
                url: `https://i.nhentai.net/${p.path}`
              }))
            };
          }
        } catch (e) {}
      }

      // 2. Fallback: Parse DOM
      const titleEl = document.querySelector('h1');
      const mangaTitle = titleEl ? titleEl.textContent.trim() : `Gallery ${gid}`;
      
      const thumbs = Array.from(document.querySelectorAll('#thumbnail-container img, .thumbs img, .thumb-container img'));
      let mediaId = null;
      const pages = [];

      for (let i = 0; i < thumbs.length; i++) {
        const src = thumbs[i].getAttribute('data-src') || thumbs[i].src || '';
        const m = src.match(/\/galleries\/(\d+)\/(\d+)t\.(jpg|png|webp|gif)/);
        if (m) {
          mediaId = m[1];
          const pageNum = parseInt(m[2], 10);
          const ext = m[3];
          pages.push({
            page: pageNum,
            url: `https://i.nhentai.net/galleries/${mediaId}/${pageNum}.${ext}`
          });
        }
      }

      pages.sort((a, b) => a.page - b.page);

      return {
        success: pages.length > 0,
        mangaTitle,
        fullTitle: `${mangaTitle} (#${gid})`,
        pages
      };
    }, galleryId);

    return result;
  } finally {
    await browser.close();
  }
}

// DNS Cache & DoH Resolver for bypassing ISP blocks
const dnsCache = new Map();

function customLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const isAll = options && options.all;
  const wrap = (ip, family = 4) => isAll ? [{ address: ip, family }] : ip;

  // 0. If it's already an IP address, return immediately
  if (net.isIP(hostname)) {
    const fam = net.isIP(hostname);
    return callback(null, isAll ? [{ address: hostname, family: fam }] : hostname, fam);
  }

  // 1. Direct fast routes for blocked manga domains (uses Cloudflare Anycast / CDN nodes)
  if (hostname.includes('nhentai.net')) {
    const ip = '172.67.74.203';
    dnsCache.set(hostname, ip);
    return callback(null, wrap(ip, 4), 4);
  }
  if (hostname.includes('mangadex.org') || hostname.includes('mangadex.network')) {
    const ip = '45.129.229.1';
    dnsCache.set(hostname, ip);
    return callback(null, wrap(ip, 4), 4);
  }
  if (hostname.includes('mangafire') || hostname.includes('mfcdn')) {
    const ip = hostname.includes('mfcdn') ? '172.67.205.168' : '104.21.93.32';
    dnsCache.set(hostname, ip);
    return callback(null, wrap(ip, 4), 4);
  }

  // 2. Check cache
  if (dnsCache.has(hostname)) {
    return callback(null, wrap(dnsCache.get(hostname), 4), 4);
  }

  // 3. Try standard system DNS lookup
  dns.lookup(hostname, options, async (err, address, family) => {
    if (!err && address && address !== '127.0.0.1') {
      const targetIp = Array.isArray(address) ? address[0].address : address;
      dnsCache.set(hostname, targetIp);
      return callback(null, address, family || 4);
    }

    // 3. Perform DoH resolution via Cloudflare 1.1.1.1
    try {
      const dohRes = await axios.get(`https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
        headers: { 'Accept': 'application/dns-json' },
        timeout: 5000
      });

      if (dohRes.data && dohRes.data.Answer) {
        const aRecord = dohRes.data.Answer.find(a => a.type === 1);
        if (aRecord && aRecord.data) {
          dnsCache.set(hostname, aRecord.data);
          return callback(null, wrap(aRecord.data, 4), 4);
        }
      }
    } catch (e) {
      // DoH error
    }

    // 4. Hardcoded fallback IP for MangaDex & nhentai domains if everything else fails
    if (hostname.includes('mangadex.org') || hostname.includes('mangadex.network')) {
      const fallbackIp = '45.129.229.1';
      dnsCache.set(hostname, fallbackIp);
      return callback(null, wrap(fallbackIp, 4), 4);
    }
    if (hostname.includes('nhentai.net')) {
      const fallbackIp = (hostname.startsWith('i') || hostname.startsWith('t')) ? '77.247.178.1' : '172.67.74.203';
      dnsCache.set(hostname, fallbackIp);
      return callback(null, wrap(fallbackIp, 4), 4);
    }
    if (hostname.includes('mangafire') || hostname.includes('mfcdn')) {
      const fallbackIp = hostname.includes('mfcdn') ? '172.67.205.168' : '104.21.93.32';
      dnsCache.set(hostname, fallbackIp);
      return callback(null, wrap(fallbackIp, 4), 4);
    }

    return callback(err || new Error(`DNS lookup failed for ${hostname}`), null, null);
  });
}

const httpsAgent = new https.Agent({ lookup: customLookup, keepAlive: true });
const httpClient = axios.create({ httpsAgent, timeout: 30000 });


app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to extract info from MangaDex, nhentai, or MangaFire URL
function extractUrlInfo(urlStr) {
  try {
    // Check MangaFire pattern: /title/{slug}/chapter/{id} or /read/{slug}
    const mfMatch = urlStr.match(/mangafire\.to\/(?:title|read)\/([^\/]+)(?:\/chapter\/(\d+))?/i) || urlStr.match(/mangafire\.to\/.*chapter\/(\d+)/i);
    if (mfMatch) {
      const slug = mfMatch[1];
      const chapterId = mfMatch[2] || (urlStr.match(/chapter\/(\d+)/)?.[1]) || '1';
      return { type: 'mangafire', slug, chapterId, rawUrl: urlStr };
    }

    // Check nhentai pattern: /g/{id} or nhentai.net/g/{id}/...
    const nhMatch = urlStr.match(/nhentai\.net\/g\/(\d+)/i) || urlStr.match(/\/g\/(\d+)/i);
    if (nhMatch) {
      return { type: 'nhentai', galleryId: nhMatch[1] };
    }

    const parsed = new URL(urlStr);
    const parts = parsed.pathname.split('/').filter(Boolean);
    
    // Check MangaDex chapter pattern: /chapter/{uuid}
    const chapterIdx = parts.indexOf('chapter');
    if (chapterIdx !== -1 && parts[chapterIdx + 1]) {
      return { type: 'chapter', uuid: parts[chapterIdx + 1] };
    }
    
    // Check MangaDex title pattern: /title/{uuid}
    const titleIdx = parts.indexOf('title');
    if (titleIdx !== -1 && parts[titleIdx + 1]) {
      return { type: 'title', uuid: parts[titleIdx + 1] };
    }

    // Direct UUID regex match fallback
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = urlStr.match(uuidRegex);
    if (match) {
      if (urlStr.includes('title')) return { type: 'title', uuid: match[0] };
      return { type: 'chapter', uuid: match[0] };
    }
  } catch (e) {
    const mfMatch = urlStr.match(/mangafire\.to\/.*chapter\/(\d+)/i);
    if (mfMatch) return { type: 'mangafire', slug: 'mangafire', chapterId: mfMatch[1], rawUrl: urlStr };

    const nhMatch = urlStr.match(/\/g\/(\d+)/i);
    if (nhMatch) return { type: 'nhentai', galleryId: nhMatch[1] };

    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = urlStr.match(uuidRegex);
    if (match) return { type: 'chapter', uuid: match[0] };
  }
  return null;
}

// Format page number padding (1 -> 01, 10 -> 10, 100 -> 100)
function formatPageNum(index, total) {
  const digits = Math.max(2, String(total).length);
  return String(index + 1).padStart(digits, '0');
}

// 1. Parse URL Route
app.post('/api/parse', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const extracted = extractUrlInfo(url);
  if (!extracted) {
    return res.status(400).json({ error: 'Link tidak dikenali. Masukkan link MangaDex, nhentai, atau MangaFire yang valid' });
  }

  try {
    if (extracted.type === 'mangafire') {
      const { slug, chapterId, rawUrl } = extracted;
      
      const cleanSlug = slug.replace(/^[a-z0-9]+-/i, '').replace(/-/g, ' ');
      const mangaTitle = cleanSlug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'MangaFire';
      const chapterNum = chapterId ? `Ch.${chapterId}` : 'Single';
      const fullTitle = `${mangaTitle} ${chapterNum}`.trim();

      let imagePageUrls = [];

      try {
        console.log('Running Puppeteer headless browser for MangaFire:', rawUrl);
        imagePageUrls = await scrapeMangaFireWithPuppeteer(rawUrl);
        console.log('Puppeteer captured images count:', imagePageUrls.length);
      } catch (e) {
        console.warn('Puppeteer MangaFire scraper notice:', e.message);
      }

      const total = imagePageUrls.length;
      const pagesOriginal = imagePageUrls.map((imgUrl, i) => ({
        page: i + 1,
        url: imgUrl,
        filename: `${formatPageNum(i, total)}.jpg`
      }));

      return res.json({
        type: 'chapter',
        chapterId,
        mangaTitle,
        chapterNum,
        volume: null,
        fullTitle,
        language: 'EN',
        totalPages: total,
        pages: {
          original: pagesOriginal,
          saver: pagesOriginal
        },
        source: 'mangafire',
        rawUrl
      });
    }
    if (extracted.type === 'nhentai') {
      const galleryId = extracted.galleryId;
      let htmlData = null;

      try {
        const nhRes = await httpClient.get(`https://nhentai.net/g/${galleryId}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://nhentai.net/'
          }
        });
        htmlData = nhRes.data;
      } catch (axiosErr) {
        console.log(`nhentai axios error (${axiosErr.response?.status || axiosErr.message}), falling back to Puppeteer scraper...`);
      }

      if (!htmlData) {
        try {
          const pupResult = await scrapeNhentaiWithPuppeteer(galleryId);
          if (pupResult && pupResult.success && pupResult.pages && pupResult.pages.length > 0) {
            const total = pupResult.pages.length;
            const pagesOriginal = pupResult.pages.map((p, i) => ({
              page: p.page,
              url: p.url,
              filename: `${formatPageNum(i, total)}.jpg`
            }));

            return res.json({
              type: 'chapter',
              chapterId: galleryId,
              mangaTitle: pupResult.mangaTitle,
              chapterNum: `#${galleryId}`,
              volume: null,
              fullTitle: pupResult.fullTitle,
              language: 'ALL',
              totalPages: total,
              pages: {
                original: pagesOriginal,
                saver: pagesOriginal
              },
              source: 'nhentai'
            });
          }
        } catch (pupErr) {
          console.error('Puppeteer nhentai scrape error:', pupErr.message);
        }
        return res.status(500).json({ error: `Gagal mengambil data nhentai #${galleryId}. Pastikan server dapat mengakses browser.` });
      }

      // Try extracting from embedded SvelteKit API JSON tag first (100% exact)
      const jsonMatch = htmlData.match(/data-url="\/api\/v2\/galleries\/\d+[^"]*">([\s\S]*?)<\/script>/i);
      if (jsonMatch) {
        try {
          const jsonObj = JSON.parse(jsonMatch[1]);
          if (jsonObj.body) {
            const bodyObj = typeof jsonObj.body === 'string' ? JSON.parse(jsonObj.body) : jsonObj.body;
            if (bodyObj.pages && Array.isArray(bodyObj.pages)) {
              const total = bodyObj.pages.length;
              const pagesOriginal = bodyObj.pages.map((p, i) => ({
                page: p.number || (i + 1),
                url: `https://i.nhentai.net/${p.path}`,
                filename: `${formatPageNum(i, total)}.jpg`
              }));

              const mangaTitle = bodyObj.title?.pretty || bodyObj.title?.english || bodyObj.title?.japanese || `Gallery ${galleryId}`;
              const fullTitle = `${bodyObj.title?.english || mangaTitle} (#${galleryId})`;

              return res.json({
                type: 'chapter',
                chapterId: galleryId,
                mangaTitle,
                chapterNum: `#${galleryId}`,
                volume: null,
                fullTitle,
                language: 'ALL',
                totalPages: total,
                pages: {
                  original: pagesOriginal,
                  saver: pagesOriginal
                },
                source: 'nhentai'
              });
            }
          }
        } catch (e) {
          console.warn('JSON script parse notice:', e.message);
        }
      }

      // Extract Media ID specifically from cover or main gallery container
      let mediaId = null;

      const scriptMediaMatch = htmlData.match(/"media_id"\s*:\s*"?(\d+)"?/i);
      if (scriptMediaMatch) {
        mediaId = scriptMediaMatch[1];
      }

      if (!mediaId) {
        const coverMatch = htmlData.match(/id="cover"[\s\S]*?\/galleries\/(\d+)\//i) 
                        || htmlData.match(/class="cover"[\s\S]*?\/galleries\/(\d+)\//i)
                        || htmlData.match(/\/galleries\/(\d+)\/cover/i);
        if (coverMatch) {
          mediaId = coverMatch[1];
        }
      }

      if (!mediaId) {
        const thumbContainerMatch = htmlData.match(/id="thumbnail-container"[\s\S]*?\/galleries\/(\d+)\//i);
        if (thumbContainerMatch) {
          mediaId = thumbContainerMatch[1];
        }
      }

      if (!mediaId) {
        const mediaMatch = htmlData.match(/\/galleries\/(\d+)\//);
        if (mediaMatch) mediaId = mediaMatch[1];
      }

      if (!mediaId) {
        return res.status(404).json({ error: `Gallery nhentai #${galleryId} tidak ditemukan` });
      }

      // Extract Title
      const titleMatch = htmlData.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
      const mangaTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `Gallery ${galleryId}`;

      // Extract thumbnail image extensions from main container only
      const thumbsSectionMatch = htmlData.match(/<div[^>]*id="thumbnail-container"[\s\S]*?<\/div>\s*<\/div>/i);
      const thumbsSection = thumbsSectionMatch ? thumbsSectionMatch[0] : htmlData;

      const thumbRegex = /\/galleries\/\d+\/(\d+)t\.(jpg|png|webp|gif)/g;
      const rawPages = [];
      let match;
      const seenPages = new Set();

      while ((match = thumbRegex.exec(thumbsSection)) !== null) {
        const pageNum = parseInt(match[1], 10);
        const ext = match[2];
        if (!seenPages.has(pageNum)) {
          seenPages.add(pageNum);
          rawPages.push({ page: pageNum, ext });
        }
      }

      rawPages.sort((a, b) => a.page - b.page);
      const total = rawPages.length;

      const pagesOriginal = rawPages.map((p) => ({
        page: p.page,
        url: `https://i.nhentai.net/galleries/${mediaId}/${p.page}.${p.ext}`,
        filename: `${formatPageNum(p.page - 1, total)}.jpg`
      }));

      return res.json({
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
        },
        source: 'nhentai'
      });
    }

    if (extracted.type === 'chapter') {
      const chapterId = extracted.uuid;

      // Fetch chapter info
      const chapterRes = await httpClient.get(`https://api.mangadex.org/chapter/${chapterId}?includes[]=manga&includes[]=scanlation_group`, {
        headers: { 'User-Agent': 'MangaDownloaderApp/1.0' }
      });
      const chapterData = chapterRes.data.data;
      const attributes = chapterData.attributes;

      // Extract manga title if available
      let mangaTitle = 'Manga';
      const mangaRel = chapterData.relationships?.find(r => r.type === 'manga');
      if (mangaRel?.attributes?.title) {
        const titles = mangaRel.attributes.title;
        mangaTitle = titles.en || titles['ja-ro'] || Object.values(titles)[0] || 'Manga';
      }

      const chapterNum = attributes.chapter || 'Single';
      const chapterTitle = attributes.title ? `: ${attributes.title}` : '';
      const volume = attributes.volume ? `Vol. ${attributes.volume} ` : '';
      const fullChapterName = `${mangaTitle} ${volume}Ch.${chapterNum}${chapterTitle}`.trim();

      // Fetch server at-home info for image URLs
      const atHomeRes = await httpClient.get(`https://api.mangadex.org/at-home/server/${chapterId}`);
      const { baseUrl, chapter } = atHomeRes.data;

      const hash = chapter.hash;
      const originalFiles = chapter.data;
      const saverFiles = chapter.dataSaver;

      const pagesOriginal = originalFiles.map((filename, i) => ({
        page: i + 1,
        url: `${baseUrl}/data/${hash}/${filename}`,
        filename: `${formatPageNum(i, originalFiles.length)}.jpg`
      }));

      const pagesSaver = saverFiles.map((filename, i) => ({
        page: i + 1,
        url: `${baseUrl}/data-saver/${hash}/${filename}`,
        filename: `${formatPageNum(i, saverFiles.length)}.jpg`
      }));

      return res.json({
        type: 'chapter',
        chapterId,
        mangaTitle,
        chapterNum,
        volume: attributes.volume,
        fullTitle: fullChapterName,
        language: attributes.translatedLanguage,
        totalPages: pagesOriginal.length,
        pages: {
          original: pagesOriginal,
          saver: pagesSaver
        }
      });
    } else if (extracted.type === 'title') {
      const mangaId = extracted.uuid;
      const mangaRes = await httpClient.get(`https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art`);
      const mangaData = mangaRes.data.data;
      const titles = mangaData.attributes.title;
      const mangaTitle = titles.en || titles['ja-ro'] || Object.values(titles)[0] || 'Manga';

      // Fetch chapters list
      const feedRes = await httpClient.get(`https://api.mangadex.org/manga/${mangaId}/feed?limit=100&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`);
      
      const chapters = feedRes.data.data.map(ch => ({
        id: ch.id,
        chapter: ch.attributes.chapter || '0',
        title: ch.attributes.title || '',
        language: ch.attributes.translatedLanguage,
        pages: ch.attributes.pages
      }));

      return res.json({
        type: 'series',
        mangaId,
        mangaTitle,
        description: mangaData.attributes.description?.en || '',
        totalChapters: chapters.length,
        chapters
      });
    }
  } catch (err) {
    console.error('Error processing URL:', err.message);
    return res.status(500).json({ error: `Gagal memproses link: ${err.message}` });
  }
});

// 2. Proxy image route (bypass CORS & headers for browser preview)
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  let referer = 'https://mangadex.org/';
  if (url.includes('nhentai')) referer = 'https://nhentai.net/';
  if (url.includes('mangafire') || url.includes('mfcdn')) referer = 'https://mangafire.to/';

  try {
    const response = await httpClient({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(Buffer.from(response.data));
  } catch (err) {
    console.error('Proxy image error:', err.message);
    res.status(500).send('Error proxying image');
  }
});

// Helper function to download an image & convert to JPG buffer using sharp
async function fetchAndConvertToJpg(imageUrl, retries = 1) {
  let referer = 'https://mangadex.org/';
  if (imageUrl.includes('nhentai')) referer = 'https://nhentai.net/';
  if (imageUrl.includes('mangafire') || imageUrl.includes('mfcdn')) referer = 'https://mangafire.to/';

  try {
    const response = await httpClient({
      method: 'get',
      url: imageUrl,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
      },
      timeout: 20000
    });

    const rawBuffer = Buffer.from(response.data);
    const jpgBuffer = await sharp(rawBuffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return jpgBuffer;
  } catch (err) {
    if (retries > 0) {
      console.warn(`Retry downloading ${imageUrl} due to: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000));
      return fetchAndConvertToJpg(imageUrl, retries - 1);
    }
    throw err;
  }
}

// Background jobs tracking for real-time progress
const activeJobs = new Map();

// 3. Download ZIP route (Job-based with Real Progress)
app.post('/api/download-zip', async (req, res) => {
  const { pages, zipFilename } = req.body;

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'No pages specified' });
  }

  const jobId = 'zip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const safeZipName = (zipFilename || 'manga-chapter').replace(/[^a-zA-Z0-9_\-\.\s]/g, '_') + '.zip';
  const tempZipPath = path.join(__dirname, 'downloads', `${jobId}.zip`);

  const job = {
    id: jobId,
    type: 'zip',
    filename: safeZipName,
    filePath: tempZipPath,
    total: pages.length,
    completed: 0,
    status: 'processing',
    error: null
  };
  activeJobs.set(jobId, job);

  res.json({ success: true, jobId, total: pages.length });

  // Process asynchronously in background
  (async () => {
    try {
      const output = fs.createWriteStream(tempZipPath);
      const archive = archiver('zip', { zlib: { level: 4 } });

      const streamPromise = new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        output.on('error', reject);
      });

      archive.pipe(output);

      const chunkSize = 6;
      for (let i = 0; i < pages.length; i += chunkSize) {
        const chunk = pages.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (pageObj) => {
          try {
            const jpgBuffer = await fetchAndConvertToJpg(pageObj.url);
            archive.append(jpgBuffer, { name: pageObj.filename });
          } catch (err) {
            console.error(`Failed to download page ${pageObj.page}:`, err.message);
          } finally {
            job.completed++;
          }
        }));
      }

      await archive.finalize();
      await streamPromise;
      job.status = 'done';
    } catch (err) {
      console.error('Zip creation error:', err);
      job.status = 'error';
      job.error = err.message;
    }
  })();
});

// Progress status route for ZIP
app.get('/api/zip-progress/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });

  const percent = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  res.json({
    status: job.status,
    total: job.total,
    completed: job.completed,
    percent: Math.min(percent, 100),
    error: job.error
  });
});

// Download finalized ZIP file
app.get('/api/zip-download/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job || job.status !== 'done' || !fs.existsSync(job.filePath)) {
    return res.status(404).send('File ZIP belum siap atau sudah kedaluwarsa.');
  }

  res.download(job.filePath, job.filename, (err) => {
    // Clean up temporary zip file after 5 minutes
    setTimeout(() => {
      try {
        if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath);
        activeJobs.delete(job.id);
      } catch (e) {}
    }, 300000);
  });
});

// 4. Download to Local Folder route (Job-based with Real Progress)
app.post('/api/download-folder', async (req, res) => {
  const { pages, folderName, customPath } = req.body;

  if (!pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'No pages specified' });
  }

  const jobId = 'folder_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const sanitizeFolder = (name) => name.replace(/[^a-zA-Z0-9_\-\s]/g, '_').trim();
  const safeFolderName = sanitizeFolder(folderName || 'MangaChapter');

  let targetDir;
  if (customPath && customPath.trim()) {
    targetDir = path.resolve(customPath.trim(), safeFolderName);
  } else {
    targetDir = path.join(__dirname, 'downloads', safeFolderName);
  }

  const job = {
    id: jobId,
    type: 'folder',
    savedPath: targetDir,
    total: pages.length,
    completed: 0,
    status: 'processing',
    error: null
  };
  activeJobs.set(jobId, job);

  res.json({ success: true, jobId, total: pages.length, targetDir });

  // Process folder saving asynchronously
  (async () => {
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const chunkSize = 6;
      for (let i = 0; i < pages.length; i += chunkSize) {
        const chunk = pages.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (pageObj) => {
          try {
            const jpgBuffer = await fetchAndConvertToJpg(pageObj.url);
            const filePath = path.join(targetDir, pageObj.filename);
            fs.writeFileSync(filePath, jpgBuffer);
          } catch (err) {
            console.error(`Failed page ${pageObj.page}:`, err.message);
          } finally {
            job.completed++;
          }
        }));
      }

      job.status = 'done';
    } catch (err) {
      console.error('Folder download error:', err);
      job.status = 'error';
      job.error = err.message;
    }
  })();
});

// Progress status route for Folder
app.get('/api/folder-progress/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan' });

  const percent = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  res.json({
    status: job.status,
    total: job.total,
    completed: job.completed,
    percent: Math.min(percent, 100),
    savedPath: job.savedPath,
    error: job.error
  });
});

app.listen(PORT, () => {
  console.log(`Manga Downloader App running at http://localhost:${PORT}`);
});
