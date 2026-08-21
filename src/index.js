#!/usr/bin/env node
/**
 * DramaBox Player - Single File Server (Enhanced UX/UI - Split Layout)
 * Usage: node index.js [port]
 * Then open http://localhost:3000/?bookId=42000023820
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const API_BASE = 'https://api.sansekai.my.id/api/dramabox';

function randomIP() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
}

const CDN_REFERER = 'https://www.dramaboxdb.com/';
const CDN_ORIGIN = 'https://www.dramaboxdb.com';

// ============================================================
// HELPERS (unchanged)
// ============================================================

function apiHeaders(extra = {}) {
  const FAKE_IP = randomIP()
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Forwarded-For': FAKE_IP,
    'X-Real-IP': FAKE_IP,
    'Accept': '*/*',
    ...extra,
  };
}

function cdnHeaders(extra = {}) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': CDN_REFERER,
    'Origin': CDN_ORIGIN,
    ...extra,
  };
}

function httpsRequest(targetUrl, headers, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(targetUrl); } catch (e) { return reject(e); }
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request({
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      headers,
      timeout: options.timeout || 20000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ============================================================
// API HANDLERS (unchanged)
// ============================================================

async function testUrl(targetUrl) {
  try {
    const r = await httpsRequest(targetUrl, cdnHeaders({ 'Range': 'bytes=0-63' }), { timeout: 10000 });
    if (r.status !== 200 && r.status !== 206) {
      return { ok: false, reason: `HTTP ${r.status}` };
    }
    const ct = r.headers['content-type'] || '';
    if (!ct.startsWith('video/') && !ct.startsWith('application/octet-stream')) {
      return { ok: false, reason: `Bad content-type: ${ct}` };
    }
    if (r.body.length < 8) return { ok: false, reason: 'Too small' };
    const b = r.body;
    if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) {
      return { ok: false, reason: 'Not MP4 (no ftyp)' };
    }
    return { ok: true, size: parseInt(r.headers['content-length'] || '0', 10) };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function annotateEpisodes(episodes) {
  const out = [];
  for (let i = 0; i < episodes.length; i++) {
    const ch = episodes[i];
    const cands = [];
    for (const cdn of (ch.cdnList || [])) {
      for (const v of (cdn.videoPathList || [])) {
        let score = 0;
        const q = parseInt(v.quality, 10);
        if (q === 720) score += 100;
        else if (q === 540) score += 80;
        else if (q === 360) score += 60;
        else if (q === 1080) score += 40;
        else if (q === 144) score += 20;
        if (!v.isVipEquity) score += 50;
        if (v.isDefault) score += 10;
        cands.push({ score, url: v.videoPath, cdn: cdn.cdnDomain, quality: v.quality, isVip: v.isVipEquity === 1 });
      }
    }
    cands.sort((a, b) => b.score - a.score);

    let playable = null;
    for (const c of cands) {
      const t = await testUrl(c.url);
      if (t.ok) {
        playable = { url: c.url, cdn: c.cdn, quality: c.quality, isVip: c.isVip, size: t.size };
        break;
      }
    }
    out.push({ ...ch, _playable: playable });
  }
  return out;
}

async function handleFetchEpisodes(bookId, res) {
  if (!/^\d{10,20}$/.test(bookId)) {
    return sendJson(res, 400, { error: 'bookId không hợp lệ' });
  }
  const url = `${API_BASE}/allepisode?bookId=${bookId}`;
  try {
    const r = await httpsRequest(url, apiHeaders());
    if (r.status !== 200) {
      return sendJson(res, r.status, { error: `Sansekai trả ${r.status}`, body: r.body.toString('utf8').slice(0, 500) });
    }
    const data = JSON.parse(r.body.toString('utf8'));
    if (!Array.isArray(data)) {
      return sendJson(res, 502, { error: 'Response không phải array', raw: data });
    }
    const annotated = await annotateEpisodes(data);
    const playableCount = annotated.filter(c => c._playable).length;
    sendJson(res, 200, {
      ok: true,
      bookId,
      count: data.length,
      playableCount,
      episodes: annotated,
    });
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleDecryptStream(targetUrl, res) {
  if (!targetUrl) return sendJson(res, 400, { error: 'Thiếu param url' });
  const proxyUrl = `${API_BASE}/decrypt-stream?url=${encodeURIComponent(targetUrl)}`;
  try {
    const r = await httpsRequest(proxyUrl, apiHeaders());
    res.writeHead(r.status, {
      'Content-Type': r.headers['content-type'] || 'video/mp4',
      'Content-Length': r.body.length,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(r.body);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

async function handleVideoProxy(targetUrl, res, req) {
  if (!targetUrl) return sendJson(res, 400, { error: 'Thiếu param url' });
  const extraHeaders = {};
  if (req.headers.range) extraHeaders['Range'] = req.headers.range;

  try {
    const r = await httpsRequest(targetUrl, cdnHeaders(extraHeaders), { timeout: 60000 });
    res.writeHead(r.status, {
      'Content-Type': r.headers['content-type'] || 'video/mp4',
      'Content-Length': r.headers['content-length'],
      'Content-Range': r.headers['content-range'],
      'Accept-Ranges': r.headers['accept-ranges'] || 'bytes',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(r.body);
  } catch (e) {
    sendJson(res, 500, { error: e.message });
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

// ============================================================
// HTML PLAYER - REDESIGNED (LEFT: PLAYER, RIGHT: CONTROLS)
// ============================================================

const HTML = `<!DOCTYPE html>
<html lang="vi" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>DramaBox Player · Premium</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎬</text></svg>" />

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

<!-- Tailwind -->
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
          mono: ['JetBrains Mono', 'monospace'],
        },
        colors: {
          brand: {
            50:  '#fff0f3',
            100: '#ffd9e3',
            200: '#ffb3c7',
            300: '#ff7aa0',
            400: '#ff3d77',
            500: '#f8155b',
            600: '#e0064a',
            700: '#be003f',
            800: '#9a0539',
            900: '#820a37',
          },
          surface: {
            900: '#0a0612',
            800: '#120a1f',
            700: '#1a1129',
            600: '#231736',
            500: '#2d1d43',
          }
        },
        animation: {
          'fade-in': 'fadeIn 0.4s ease-out',
          'slide-up': 'slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          'shimmer': 'shimmer 2s linear infinite',
          'bounce-in': 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        },
        keyframes: {
          fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
          slideUp: { '0%': { opacity: 0, transform: 'translateY(20px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
          bounceIn: {
            '0%': { opacity: 0, transform: 'scale(0.3)' },
            '50%': { opacity: 1, transform: 'scale(1.05)' },
            '70%': { transform: 'scale(0.95)' },
            '100%': { transform: 'scale(1)' }
          },
          shimmer: {
            '0%': { backgroundPosition: '-1000px 0' },
            '100%': { backgroundPosition: '1000px 0' }
          }
        }
      }
    }
  }
</script>

<!-- Font Awesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

<style>
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
  ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #f8155b, #a855f7); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #ff3d77, #c084fc); }

  body {
    background: #0a0612;
    background-image:
      radial-gradient(at 20% 10%, rgba(248, 21, 91, 0.18) 0px, transparent 50%),
      radial-gradient(at 80% 20%, rgba(168, 85, 247, 0.15) 0px, transparent 50%),
      radial-gradient(at 50% 90%, rgba(59, 130, 246, 0.12) 0px, transparent 50%);
    background-attachment: fixed;
    min-height: 100vh;
    font-family: 'Inter', system-ui, sans-serif;
  }

  .glass {
    background: rgba(23, 17, 40, 0.55);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .glass-strong {
    background: rgba(18, 10, 31, 0.75);
    backdrop-filter: blur(24px) saturate(200%);
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .gradient-text {
    background: linear-gradient(135deg, #ff3d77 0%, #a855f7 50%, #3b82f6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .gradient-border {
    position: relative;
  }
  .gradient-border::before {
    content: '';
    position: absolute;
    inset: 0;
    padding: 1px;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255, 61, 119, 0.5), rgba(168, 85, 247, 0.5), rgba(59, 130, 246, 0.5));
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  .btn-glow {
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-glow::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }
  .btn-glow:hover::after { width: 300px; height: 300px; }
  .btn-glow:hover { transform: translateY(-2px); box-shadow: 0 10px 30px -10px rgba(248, 21, 91, 0.5); }
  .btn-glow:active { transform: translateY(0); }

  .ep-btn {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ep-btn:hover { transform: translateY(-3px) scale(1.05); }
  .ep-btn.current {
    background: linear-gradient(135deg, #f8155b, #a855f7);
    box-shadow: 0 8px 20px -5px rgba(248, 21, 91, 0.6);
    border-color: transparent;
  }

  .skeleton {
    background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%);
    background-size: 1000px 100%;
    animation: shimmer 2s linear infinite;
  }

  #player::-webkit-media-controls { display: none !important; }
  #player::-webkit-media-controls-enclosure { display: none !important; }
  video::-webkit-media-controls-panel { display: none !important; }

  .video-overlay {
    transition: opacity 0.3s ease;
  }
  .video-overlay.hide { opacity: 0; pointer-events: none; }

  .progress-bar {
    transition: width 0.1s linear;
    background: linear-gradient(90deg, #ff3d77, #a855f7);
  }

  .toast-enter {
    animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  }

  .tab-item { position: relative; }
  .tab-item.active::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 20%;
    right: 20%;
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(90deg, #ff3d77, #a855f7);
    animation: slideUp 0.3s ease-out;
  }

  .quality-btn.active {
    background: linear-gradient(135deg, #ff3d77, #a855f7);
    box-shadow: 0 6px 16px -4px rgba(248, 21, 91, 0.5);
  }

  button:focus-visible, input:focus-visible {
    outline: 2px solid #ff3d77;
    outline-offset: 2px;
  }
</style>
</head>
<body class="text-slate-100 antialiased selection:bg-brand-500/30 selection:text-white">

<!-- Toast Container -->
<div id="toasts" class="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm pointer-events-none"></div>

<div class="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 animate-fade-in">

  <!-- HEADER (Full Width) -->
  <header class="mb-6 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-brand-500/30"
           style="background: linear-gradient(135deg, #f8155b, #a855f7);">
        <i class="fa-solid fa-film text-white"></i>
      </div>
      <div>
        <h1 class="text-xl sm:text-2xl font-extrabold gradient-text tracking-tight">DramaBox</h1>
        <p class="text-xs text-slate-400 font-medium">Premium Player · v2.0 Split Layout</p>
      </div>
    </div>
    <a href="https://www.dramaboxdb.com/" target="_blank" rel="noopener"
       class="text-slate-400 hover:text-white transition p-2 rounded-lg hover:bg-white/5">
      <i class="fa-solid fa-arrow-up-right-from-square text-sm"></i>
    </a>
  </header>

  <!-- SEARCH BAR (Full Width) -->
  <div class="glass rounded-2xl p-4 mb-6 shadow-2xl shadow-black/40">
    <div class="flex flex-col sm:flex-row gap-3">
      <div class="relative flex-1">
        <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm"></i>
        <input id="bookIdInput" type="text"
               placeholder="Nhập Book ID (VD: 42000023820)"
               class="w-full pl-11 pr-4 py-3.5 bg-surface-900/80 border border-white/5 rounded-xl text-sm font-medium placeholder-slate-500 focus:border-brand-500/50 focus:bg-surface-900 transition-all" />
      </div>
      <button id="loadBtn"
              class="btn-glow px-7 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 text-white shadow-lg"
              style="background: linear-gradient(135deg, #f8155b, #be003f);">
        <i class="fa-solid fa-bolt"></i>
        <span>Load Series</span>
      </button>
    </div>
    <div class="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-400">
      <span class="flex items-center gap-1.5">
        <i class="fa-solid fa-lightbulb text-amber-400"></i>
        <span>Tip:</span>
      </span>
      <code class="px-2 py-0.5 bg-surface-900/80 rounded-md text-pink-300 font-mono text-[11px]">?bookId=42000023820</code>
      <span>để auto-load</span>
      <span class="mx-2 text-slate-600">·</span>
      <span class="flex items-center gap-1.5">
        <kbd class="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-mono">Space</kbd>
        <span>Play/Pause</span>
      </span>
      <span class="mx-1 text-slate-600">·</span>
      <span class="flex items-center gap-1.5">
        <kbd class="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-mono">← →</kbd>
        <span>Prev/Next</span>
      </span>
    </div>
  </div>

  <!-- MAIN GRID: LEFT (PLAYER) & RIGHT (CONTROLS) -->
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    
    <!-- LEFT COLUMN: PLAYER & CHAPTER INFO -->
    <div class="lg:col-span-8 lg:sticky lg:top-6 space-y-4">
      
      <!-- VIDEO PLAYER -->
      <div id="playerWrap" class="relative w-full max-h-[85vh] mx-auto lg:mx-0 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 gradient-border animate-slide-up bg-black"
           style="aspect-ratio: 9/16;">
        <video id="player" class="w-full h-full object-contain bg-black" playsinline webkit-playsinline></video>

        <!-- Custom Overlay Controls -->
        <div id="videoOverlay" class="video-overlay absolute inset-0 flex flex-col justify-between pointer-events-none">
          <div class="pointer-events-auto p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <div class="flex items-center justify-between">
              <div class="min-w-0">
                <p class="text-[11px] text-white/60 font-medium uppercase tracking-wider">Đang phát</p>
                <h2 id="overlayTitle" class="text-sm font-bold text-white truncate max-w-[220px]">—</h2>
              </div>
              <button onclick="document.getElementById('playerWrap')?.requestFullscreen?.()"
                      class="pointer-events-auto w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition">
                <i class="fa-solid fa-expand text-xs"></i>
              </button>
            </div>
          </div>

          <div id="centerPlay" class="pointer-events-auto flex-1 flex items-center justify-center opacity-0 transition-opacity hover:opacity-100">
            <button onclick="togglePlay()"
                    class="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
                    style="background: linear-gradient(135deg, rgba(248,21,91,0.8), rgba(168,85,247,0.8)); box-shadow: 0 10px 40px rgba(248,21,91,0.4);">
              <i id="centerIcon" class="fa-solid fa-play"></i>
            </button>
          </div>

          <div class="pointer-events-auto p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
            <div class="group mb-3 cursor-pointer" onclick="seekFromClick(event)">
              <div class="h-1 group-hover:h-1.5 bg-white/20 rounded-full overflow-hidden transition-all relative">
                <div id="progressBar" class="progress-bar h-full" style="width: 0%"></div>
                <div id="progressDot" class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition" style="left: 0%"></div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1">
                <button onclick="togglePlay()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-sm">
                  <i id="playIcon" class="fa-solid fa-play"></i>
                </button>
                <button onclick="prev()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-xs">
                  <i class="fa-solid fa-backward-step"></i>
                </button>
                <button onclick="next()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-xs">
                  <i class="fa-solid fa-forward-step"></i>
                </button>
                <button onclick="toggleMute()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-sm">
                  <i id="muteIcon" class="fa-solid fa-volume-high"></i>
                </button>
                <span id="timeDisplay" class="text-xs font-mono text-white/80 px-2">00:00 / 00:00</span>
              </div>
              <div class="flex items-center gap-1">
                <button onclick="downloadCurrent()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-xs" title="Download">
                  <i class="fa-solid fa-download"></i>
                </button>
                <button onclick="togglePiP()" class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur text-white flex items-center justify-center transition text-xs" title="Picture-in-Picture">
                  <i class="fa-solid fa-clone"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div id="loadingSpinner" class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity">
          <div class="w-14 h-14 rounded-full border-4 border-white/20 border-t-brand-500 animate-spin"></div>
        </div>

        <div id="emptyState" class="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pointer-events-none">
          <div class="w-20 h-20 rounded-full flex items-center justify-center mb-4"
               style="background: linear-gradient(135deg, rgba(248,21,91,0.2), rgba(168,85,247,0.2));">
            <i class="fa-solid fa-clapperboard text-3xl text-brand-400"></i>
          </div>
          <p class="text-sm text-slate-300 font-semibold mb-1">Sẵn sàng phát</p>
          <p class="text-xs text-slate-500">Nhập Book ID để bắt đầu xem</p>
        </div>
      </div>

      <!-- CHAPTER INFO (Moved under player for better UX) -->
      <div class="glass-strong rounded-2xl p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2 id="chName" class="text-base sm:text-lg font-bold text-white mb-1">—</h2>
            <div class="flex items-center flex-wrap gap-2">
              <span id="chStatus" class="text-xs"></span>
              <span id="chSource" class="text-[11px] font-mono text-slate-400 truncate max-w-full"></span>
            </div>
          </div>
          <button onclick="refreshLinks()" class="btn-glow flex-shrink-0 w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white flex items-center justify-center transition" title="Refresh Signature">
            <i class="fa-solid fa-arrows-rotate text-sm"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN: CONTROLS, QUALITY, EPISODES -->
    <div class="lg:col-span-4 flex flex-col gap-4">
      
      <!-- META BAR -->
      <div id="meta" class="glass-strong rounded-xl px-4 py-3 text-xs font-medium text-slate-300 flex items-center justify-between min-h-[44px]">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-slate-500"></div>
          <span>Chưa có dữ liệu · Nhập Book ID</span>
        </div>
        <div class="hidden sm:flex items-center gap-3 text-slate-500">
          <span id="metaRight"></span>
        </div>
      </div>

      <!-- SOURCE MODE TABS -->
      <div class="glass-strong rounded-2xl p-4">
        <p class="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i class="fa-solid fa-server"></i> Chế độ nguồn
        </p>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button data-mode="signed" class="tab-item active flex-shrink-0 px-4 py-2 rounded-lg bg-surface-900/80 hover:bg-surface-700/80 text-xs font-semibold text-white transition-all flex items-center gap-1.5">
            <i class="fa-solid fa-bolt text-amber-400"></i>
            <span>Signed</span>
          </button>
          <button data-mode="decrypt" class="tab-item flex-shrink-0 px-4 py-2 rounded-lg bg-surface-900/80 hover:bg-surface-700/80 text-xs font-semibold text-slate-300 transition-all flex items-center gap-1.5">
            <i class="fa-solid fa-unlock text-emerald-400"></i>
            <span>Decrypt</span>
          </button>
          <button data-mode="proxy" class="tab-item flex-shrink-0 px-4 py-2 rounded-lg bg-surface-900/80 hover:bg-surface-700/80 text-xs font-semibold text-slate-300 transition-all flex items-center gap-1.5">
            <i class="fa-solid fa-tower-broadcast text-sky-400"></i>
            <span>Proxy</span>
          </button>
        </div>
      </div>

      <!-- QUALITY -->
      <div class="glass-strong rounded-2xl p-4">
        <p class="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i class="fa-solid fa-sliders"></i> Chất lượng
        </p>
        <div id="quality" class="grid grid-cols-4 gap-2"></div>
      </div>

      <!-- NAVIGATION -->
      <div class="grid grid-cols-3 gap-3">
        <button onclick="prev()" class="btn-glow py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-semibold text-sm flex items-center justify-center gap-2">
          <i class="fa-solid fa-chevron-left text-xs"></i> Trước
        </button>
        <button id="playBtn" onclick="togglePlay()"
                class="btn-glow py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg"
                style="background: linear-gradient(135deg, #f8155b, #a855f7);">
          <i class="fa-solid fa-play text-xs"></i> <span>Phát</span>
        </button>
        <button onclick="next()" class="btn-glow py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-semibold text-sm flex items-center justify-center gap-2">
          Sau <i class="fa-solid fa-chevron-right text-xs"></i>
        </button>
      </div>

      <!-- EPISODES LIST (Scrollable) -->
      <div class="glass-strong rounded-2xl p-4 flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <i class="fa-solid fa-layer-group text-brand-400"></i> Danh sách tập
          </h3>
          <div class="flex items-center gap-2">
            <button onclick="scrollEpisodes(-1)" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-xs">
              <i class="fa-solid fa-chevron-up"></i>
            </button>
            <button onclick="scrollEpisodes(1)" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 flex items-center justify-center text-xs">
              <i class="fa-solid fa-chevron-down"></i>
            </button>
          </div>
        </div>
        <div id="epList" class="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-4 gap-2 overflow-y-auto p-1 -m-1 pr-2 max-h-[50vh] lg:max-h-[calc(100vh-24rem)]">
          <div class="col-span-full text-center py-10 text-slate-500 text-sm">
            <i class="fa-solid fa-inbox text-4xl mb-3 opacity-40"></i>
            <p>Chưa có episodes</p>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- FOOTER -->
  <footer class="text-center text-xs text-slate-500 py-8 mt-4">
    <p>Built with <span class="gradient-text font-semibold">♥</span> · DramaBox Player Premium</p>
    <p class="mt-1">Tap player để hiện controls · ESC để thoát fullscreen</p>
  </footer>
</div>

<script>
// ============================================================
// DOM
// ============================================================
const player = document.getElementById('player');
const playerWrap = document.getElementById('playerWrap');
const videoOverlay = document.getElementById('videoOverlay');
const centerPlay = document.getElementById('centerPlay');
const progressBar = document.getElementById('progressBar');
const progressDot = document.getElementById('progressDot');
const timeDisplay = document.getElementById('timeDisplay');
const chName = document.getElementById('chName');
const chStatus = document.getElementById('chStatus');
const chSource = document.getElementById('chSource');
const overlayTitle = document.getElementById('overlayTitle');
const epList = document.getElementById('epList');
const meta = document.getElementById('meta');
const metaRight = document.getElementById('metaRight');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const centerIcon = document.getElementById('centerIcon');
const muteIcon = document.getElementById('muteIcon');
const qualityBox = document.getElementById('quality');
const bookIdInput = document.getElementById('bookIdInput');
const loadBtn = document.getElementById('loadBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const emptyState = document.getElementById('emptyState');

let EPISODES = [];
let currentIdx = 0;
let currentQuality = '720';
let currentMode = 'signed';
let currentBookId = '';
let hideControlsTimer = null;
let currentStreamUrl = '';

// ============================================================
// TOAST SYSTEM
// ============================================================
function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  const colors = {
    info: 'from-sky-500/20 to-blue-500/20 border-sky-400/40',
    success: 'from-emerald-500/20 to-green-500/20 border-emerald-400/40',
    error: 'from-rose-500/20 to-red-500/20 border-rose-400/40',
    warn: 'from-amber-500/20 to-orange-500/20 border-amber-400/40'
  };
  const icons = {
    info: 'fa-circle-info text-sky-300',
    success: 'fa-circle-check text-emerald-300',
    error: 'fa-circle-xmark text-rose-300',
    warn: 'fa-triangle-exclamation text-amber-300'
  };
  const el = document.createElement('div');
  el.className = 'toast-enter pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-gradient-to-br backdrop-blur-xl border shadow-2xl ' + colors[type];
  el.innerHTML = \`
    <i class="fa-solid \${icons[type]} text-base mt-0.5"></i>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-white font-medium leading-snug">\${msg}</p>
    </div>
  \`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(120%)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============================================================
// MODE TABS
// ============================================================
function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab-item').forEach(t => {
    const active = t.dataset.mode === mode;
    t.classList.toggle('active', active);
    t.classList.toggle('text-white', active);
    t.classList.toggle('text-slate-300', !active);
    t.classList.toggle('bg-surface-900/80', !active);
    if (active) {
      t.style.background = 'linear-gradient(135deg, rgba(248,21,91,0.15), rgba(168,85,247,0.15))';
      t.style.borderColor = 'rgba(248,21,91,0.3)';
      t.style.border = '1px solid rgba(248,21,91,0.3)';
    } else {
      t.style.background = '';
      t.style.border = '';
    }
  });
  if (EPISODES.length) loadChapter(currentIdx);
  toast('Chuyển sang mode: ' + mode.toUpperCase(), 'info', 1500);
}

document.querySelectorAll('.tab-item').forEach(t => {
  t.addEventListener('click', () => setMode(t.dataset.mode));
});

// ============================================================
// EPISODE LOGIC
// ============================================================
function getBestCandidate(chapter, quality, mode) {
  if (chapter._playable) {
    const p = chapter._playable;
    return {
      score: 10000, url: p.url, cdn: p.cdn,
      isSigned: !p.cdn.includes('akavideo'),
      isVip: p.isVip, quality: p.quality, verified: true
    };
  }
  const cands = [];
  for (const cdn of (chapter.cdnList || [])) {
    const isSigned = cdn.cdnDomain.includes('hwztvideo') && !cdn.cdnDomain.includes('akavideo');
    for (const v of (cdn.videoPathList || [])) {
      let score = 0;
      if (String(v.quality) === quality) score += 100;
      if (v.isDefault) score += 50;
      if (!v.isVipEquity) score += 30;
      if (mode === 'signed' && isSigned) score += 1000;
      if (mode === 'decrypt' && !isSigned) score += 1000;
      if (mode === 'proxy' && isSigned) score += 1000;
      cands.push({
        score, url: v.videoPath, cdn: cdn.cdnDomain, isSigned,
        isVip: v.isVipEquity === 1, quality: v.quality, verified: false
      });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands[0] || null;
}

function buildStreamUrl(rawUrl, mode) {
  if (mode === 'decrypt') return '/api/decrypt?url=' + encodeURIComponent(rawUrl);
  if (mode === 'proxy') return '/api/video-proxy?url=' + encodeURIComponent(rawUrl);
  return rawUrl;
}

async function loadChapter(idx) {
  if (idx < 0 || idx >= EPISODES.length) {
    toast(idx < 0 ? 'Đây là tập đầu tiên' : 'Đây là tập cuối cùng', 'warn', 1500);
    return;
  }
  currentIdx = idx;
  const ch = EPISODES[idx];
  const c = getBestCandidate(ch, currentQuality, currentMode);
  if (!c) {
    toast('Không tìm thấy URL cho chapter này', 'error');
    return;
  }
  const finalUrl = buildStreamUrl(c.url, currentMode);
  currentStreamUrl = finalUrl;

  chName.textContent = ch.chapterName + ' (' + (ch.chapterIndex + 1) + '/' + EPISODES.length + ')';
  overlayTitle.textContent = ch.chapterName;
  chStatus.innerHTML = ch.isCharge === 1
    ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-semibold"><i class="fa-solid fa-crown text-[10px]"></i> VIP</span>'
    : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold"><i class="fa-solid fa-circle-check text-[10px]"></i> Free</span>';

  const sourceLabel = c.isSigned ? 'signed' : 'encrypted';
  const vipLabel = c.isVip ? ' · VIP' : '';
  const verifiedIcon = c.verified ? ' <i class="fa-solid fa-circle-check text-emerald-400"></i>' : '';
  chSource.innerHTML = \`\${c.quality}p · \${sourceLabel}\${vipLabel} · \${c.cdn} · \${currentMode}\${verifiedIcon}\`;

  emptyState.style.display = 'none';
  loadingSpinner.style.opacity = '1';
  loadingSpinner.style.pointerEvents = 'auto';

  player.src = finalUrl;
  try {
    await player.play();
    toast('▶ ' + ch.chapterName, 'success', 2000);
  } catch (e) {
    toast('Cần tap vào video để phát', 'warn');
  }
  loadingSpinner.style.opacity = '0';
  loadingSpinner.style.pointerEvents = 'none';

  updatePlayButtons(false);
  document.querySelectorAll('.ep-btn').forEach((b, i) => b.classList.toggle('current', i === idx));
  const currentBtn = document.querySelector('.ep-btn.current');
  if (currentBtn) currentBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updatePlayButtons(isPaused) {
  const icon = isPaused ? 'fa-play' : 'fa-pause';
  playIcon.className = 'fa-solid ' + icon;
  centerIcon.className = 'fa-solid ' + icon;
  playBtn.innerHTML = '<i class="fa-solid ' + icon + ' text-xs"></i> <span>' + (isPaused ? 'Phát' : 'Dừng') + '</span>';
}

function togglePlay() {
  if (!player.src || player.src === window.location.href) {
    toast('Chưa có video nào được chọn', 'warn');
    return;
  }
  if (player.paused) { player.play(); updatePlayButtons(false); }
  else { player.pause(); updatePlayButtons(true); }
}

function toggleMute() {
  player.muted = !player.muted;
  muteIcon.className = 'fa-solid ' + (player.muted ? 'fa-volume-xmark' : 'fa-volume-high');
}

function togglePiP() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else if (player.requestPictureInPicture) {
    player.requestPictureInPicture().catch(() => toast('Không hỗ trợ PiP', 'error'));
  }
}

function downloadCurrent() {
  if (!currentStreamUrl) return toast('Chưa có video', 'warn');
  const a = document.createElement('a');
  a.href = currentStreamUrl;
  a.download = (EPISODES[currentIdx]?.chapterName || 'video') + '.mp4';
  a.target = '_blank';
  a.click();
  toast('Đang mở video trong tab mới...', 'info');
}

function next() { loadChapter(currentIdx + 1); }
function prev() { loadChapter(currentIdx - 1); }

function setQuality(q) {
  currentQuality = q;
  document.querySelectorAll('.quality-btn').forEach(b => b.classList.toggle('active', b.dataset.q === q));
  loadChapter(currentIdx);
  toast('Chất lượng: ' + q + 'p', 'info', 1500);
}

function seekFromClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  if (player.duration) player.currentTime = pct * player.duration;
}

function scrollEpisodes(dir) {
  epList.scrollBy({ top: dir * 200, behavior: 'smooth' });
}

// ============================================================
// PLAYER EVENTS
// ============================================================
function formatTime(s) {
  if (!isFinite(s)) return '00:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

player.addEventListener('timeupdate', () => {
  const pct = player.duration ? (player.currentTime / player.duration) * 100 : 0;
  progressBar.style.width = pct + '%';
  progressDot.style.left = pct + '%';
  timeDisplay.textContent = formatTime(player.currentTime) + ' / ' + formatTime(player.duration);
});

player.addEventListener('ended', next);
player.addEventListener('waiting', () => {
  loadingSpinner.style.opacity = '1';
  loadingSpinner.style.pointerEvents = 'auto';
});
player.addEventListener('playing', () => {
  loadingSpinner.style.opacity = '0';
  loadingSpinner.style.pointerEvents = 'none';
  emptyState.style.display = 'none';
});

player.addEventListener('play', () => updatePlayButtons(false));
player.addEventListener('pause', () => updatePlayButtons(true));

player.addEventListener('error', () => {
  if (currentMode === 'signed') {
    toast('Signed URL lỗi, thử Decrypt Proxy…', 'warn');
    setMode('decrypt');
  } else if (currentMode === 'decrypt') {
    toast('Decrypt fail, thử Server Proxy…', 'warn');
    setMode('proxy');
  } else {
    toast('Cả 3 mode đều fail. Hãy Refresh Links', 'error');
  }
});

let overlayTimeout;
function showOverlay() {
  videoOverlay.classList.remove('hide');
  clearTimeout(overlayTimeout);
  if (!player.paused) {
    overlayTimeout = setTimeout(() => {
      if (!player.paused) videoOverlay.classList.add('hide');
    }, 3000);
  }
}
playerWrap.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  videoOverlay.classList.toggle('hide');
  showOverlay();
});
playerWrap.addEventListener('mousemove', showOverlay);
playerWrap.addEventListener('mouseleave', () => {
  if (!player.paused) videoOverlay.classList.add('hide');
});

// ============================================================
// LOAD BOOK
// ============================================================
function showEpSkeletons() {
  epList.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton aspect-square rounded-lg';
    epList.appendChild(sk);
  }
}

async function loadBookId(bookId) {
  if (!bookId) return toast('Vui lòng nhập Book ID', 'warn');
  if (!/^\\d+$/.test(bookId)) return toast('Book ID phải là số', 'error');

  currentBookId = bookId;
  bookIdInput.value = bookId;
  loadBtn.disabled = true;
  loadBtn.style.opacity = '0.6';
  meta.innerHTML = \`<div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div><span>Đang tải \${bookId}...</span></div>\`;
  showEpSkeletons();

  try {
    const r = await fetch('/api/episodes?bookId=' + encodeURIComponent(bookId));
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));

    EPISODES = data.episodes;
    currentIdx = 0;
    renderUI();

    const playable = EPISODES.filter(c => c._playable).length;
    const pct = Math.round((playable / EPISODES.length) * 100);
    toast('✓ ' + EPISODES.length + ' episodes · ' + playable + ' playable (' + pct + '%)', 'success');

    const u = new URL(window.location);
    u.searchParams.set('bookId', bookId);
    history.replaceState(null, '', u);

    await loadChapter(0);
  } catch (e) {
    toast('❌ ' + e.message, 'error');
    meta.innerHTML = '<div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-rose-500"></div><span>Lỗi tải dữ liệu</span></div>';
  } finally {
    loadBtn.disabled = false;
    loadBtn.style.opacity = '1';
  }
}

function renderUI() {
  const free = EPISODES.filter(c => c.isCharge === 0).length;
  const vip = EPISODES.length - free;
  const playable = EPISODES.filter(c => c._playable).length;

  meta.innerHTML = \`
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
      <span>Book <span class="text-brand-400 font-bold">\${currentBookId}</span> · \${EPISODES.length} tập</span>
    </div>
  \`;
  metaRight.innerHTML = \`
    <span class="flex items-center gap-3">
      <span class="text-emerald-300"><i class="fa-solid fa-unlock mr-1"></i>\${free}</span>
      <span class="text-amber-300"><i class="fa-solid fa-crown mr-1"></i>\${vip}</span>
      <span class="text-sky-300"><i class="fa-solid fa-circle-check mr-1"></i>\${playable}</span>
    </span>
  \`;

  qualityBox.innerHTML = '';
  ['1080', '720', '540', '360'].forEach(q => {
    const b = document.createElement('button');
    b.className = 'quality-btn py-2.5 rounded-lg bg-surface-900/80 hover:bg-surface-700/80 border border-white/5 text-white text-xs font-semibold transition-all';
    b.dataset.q = q;
    b.innerHTML = '<i class="fa-solid fa-film mr-1 opacity-60"></i>' + q + 'p';
    b.onclick = () => setQuality(q);
    if (q === currentQuality) b.classList.add('active');
    qualityBox.appendChild(b);
  });

  epList.innerHTML = '';
  EPISODES.forEach((ch, i) => {
    const b = document.createElement('button');
    let cls = 'ep-btn relative aspect-square rounded-lg flex items-center justify-center font-bold text-sm border transition-all';
    const isVip = ch.isCharge === 1;
    const isPlayable = !!ch._playable;

    if (isVip) cls += ' bg-amber-500/10 border-amber-400/30 text-amber-200 hover:bg-amber-500/20';
    else cls += ' bg-white/5 border-white/10 text-white hover:bg-white/10';

    if (!isPlayable) {
      cls += ' opacity-40 cursor-not-allowed';
      cls = cls.replace('hover:bg-white/10', '').replace('hover:bg-amber-500/20', '');
    }
    b.className = cls;

    const status = !isPlayable
      ? ' (không play được)'
      : isVip ? ' (VIP ✓' + ch._playable.quality + 'p)' : ' (Free ✓' + ch._playable.quality + 'p)';
    b.title = ch.chapterName + status;
    b.innerHTML = \`
      <span class="relative z-10">\${ch.chapterIndex + 1}</span>
      \${isVip ? '<i class="fa-solid fa-crown absolute top-1 right-1 text-[9px] text-amber-400"></i>' : ''}
      \${!isPlayable ? '<i class="fa-solid fa-ban absolute bottom-1 right-1 text-[9px] text-rose-400"></i>' : ''}
    \`;
    if (isPlayable) b.onclick = () => loadChapter(i);
    else b.onclick = () => toast('Tập này không play được', 'warn');
    epList.appendChild(b);
  });
}

async function refreshLinks() {
  if (!currentBookId) return toast('Chưa có Book ID', 'warn');
  toast('Đang refresh signature mới...', 'info');
  try {
    const r = await fetch('/api/episodes?bookId=' + encodeURIComponent(currentBookId));
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || ('HTTP ' + r.status));
    EPISODES = data.episodes;
    renderUI();
    toast('✓ Refresh OK! Signature mới ~24h', 'success');
    loadChapter(currentIdx);
  } catch (e) {
    toast('Refresh fail: ' + e.message, 'error');
  }
}

// ============================================================
// INPUT EVENTS
// ============================================================
loadBtn.addEventListener('click', () => loadBookId(bookIdInput.value.trim()));
bookIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadBookId(bookIdInput.value.trim()); });

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch(e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'ArrowRight':
      e.preventDefault();
      next();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prev();
      break;
    case 'f':
    case 'F':
      if (!document.fullscreenElement) playerWrap.requestFullscreen?.();
      else document.exitFullscreen?.();
      break;
    case 'm':
    case 'M':
      toggleMute();
      break;
    case 'Escape':
      videoOverlay.classList.remove('hide');
      break;
  }
});

// ============================================================
// INIT
// ============================================================
const params = new URLSearchParams(window.location.search);
const initialBookId = params.get('bookId');
if (initialBookId) loadBookId(initialBookId);

setMode('signed');
</script>
</body>
</html>`;

// ============================================================
// HTTP SERVER (unchanged)
// ============================================================

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    return res.end();
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(HTML);
  }
  if (url.pathname === '/api/episodes') {
    const bookId = url.searchParams.get('bookId');
    return handleFetchEpisodes(bookId, res);
  }
  if (url.pathname === '/api/decrypt') {
    const targetUrl = url.searchParams.get('url');
    return handleDecryptStream(targetUrl, res);
  }
  if (url.pathname === '/api/video-proxy') {
    const targetUrl = url.searchParams.get('url');
    return handleVideoProxy(targetUrl, res, req);
  }
  if (url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, port: PORT, ts: Date.now() });
  }
  sendJson(res, 404, { error: 'Not found', path: url.pathname });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🎬 DramaBox Player Server (Split Layout UX)');
  console.log('============================================');
  console.log(`✓ Listening on http://localhost:${PORT}`);
  console.log('');
  console.log('Cách dùng:');
  console.log('  http://localhost:' + PORT + '/?bookId=42000023820');
  console.log('');
  console.log('Keyboard shortcuts:');
  console.log('  Space     : Play/Pause');
  console.log('  ← / →     : Prev/Next episode');
  console.log('  F         : Fullscreen');
  console.log('  M         : Mute');
  console.log('');
  console.log('Bấm Ctrl+C để tắt server');
  console.log('');
});