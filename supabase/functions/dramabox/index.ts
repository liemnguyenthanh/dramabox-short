import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Range",
  "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
};

const API_BASE = "https://api.sansekai.my.id/api/dramabox";
const CDN_REFERER = "https://www.dramaboxdb.com/";
const CDN_ORIGIN = "https://www.dramaboxdb.com";

function randomIP() {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join(".");
}

function apiHeaders() {
  const ip = randomIP();
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Forwarded-For": ip,
    "X-Real-IP": ip,
    "Accept": "*/*",
  };
}

function cdnHeaders(extra: Record<string, string> = {}) {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": CDN_REFERER,
    "Origin": CDN_ORIGIN,
    ...extra,
  };
}

async function testUrl(url: string): Promise<{ ok: boolean; size?: number; reason?: string }> {
  try {
    const r = await fetch(url, {
      headers: cdnHeaders({ Range: "bytes=0-63" }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.status !== 200 && r.status !== 206) {
      return { ok: false, reason: `HTTP ${r.status}` };
    }
    const ct = r.headers.get("content-type") || "";
    if (!ct.startsWith("video/") && !ct.startsWith("application/octet-stream")) {
      return { ok: false, reason: `Bad content-type: ${ct}` };
    }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length < 8) return { ok: false, reason: "Too small" };
    if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) {
      return { ok: false, reason: "Not MP4" };
    }
    const size = parseInt(r.headers.get("content-length") || "0", 10);
    return { ok: true, size };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

async function annotateEpisodes(episodes: any[]) {
  const out = [];
  for (const ch of episodes) {
    const cands: any[] = [];
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

async function handleEpisodes(bookId: string): Promise<Response> {
  if (!/^\d{10,20}$/.test(bookId)) {
    return new Response(JSON.stringify({ ok: false, error: "bookId không hợp lệ" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  try {
    const r = await fetch(`${API_BASE}/allepisode?bookId=${bookId}`, {
      headers: apiHeaders(), signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, error: `Sansekai trả ${r.status}` }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const data = await r.json();
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ ok: false, error: "Response không phải array", raw: data }), {
        status: 502, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const annotated = await annotateEpisodes(data);
    const playableCount = annotated.filter((c: any) => c._playable).length;
    return new Response(JSON.stringify({
      ok: true, bookId, count: data.length, playableCount, episodes: annotated,
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

async function handleProxy(targetUrl: string, rangeHeader: string | null): Promise<Response> {
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Thiếu param url" }), {
      status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  try {
    const extra: Record<string, string> = {};
    if (rangeHeader) extra["Range"] = rangeHeader;
    const r = await fetch(targetUrl, {
      headers: cdnHeaders(extra), signal: AbortSignal.timeout(60000),
    });
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", r.headers.get("content-type") || "video/mp4");
    const cl = r.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    const cr = r.headers.get("content-range");
    if (cr) headers.set("Content-Range", cr);
    headers.set("Accept-Ranges", r.headers.get("accept-ranges") || "bytes");
    return new Response(r.body, { status: r.status, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  const url = new URL(req.url);
  const path = url.pathname;

  // Extract action from path: /dramabox/episodes?bookId=... or /dramabox/proxy?url=...
  const segments = path.split("/").filter(Boolean);
  const action = segments[segments.length - 1] || "";

  if (action === "episodes") {
    const bookId = url.searchParams.get("bookId") || "";
    return handleEpisodes(bookId);
  }
  if (action === "proxy") {
    const targetUrl = url.searchParams.get("url") || "";
    return handleProxy(targetUrl, req.headers.get("range"));
  }

  return new Response(JSON.stringify({ error: "Not found", path }), {
    status: 404, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});
