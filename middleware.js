// middleware.js — HasibPro Geo-Redirect
// ✅ Web Standard APIs فقط — لا next/server، لا NextResponse
// ✅ يعمل مع Vercel Edge Middleware على Static HTML projects
// ✅ يحتاج package.json في root المشروع

export const config = {
  matcher: ['/', '/ar', '/app', '/auth'],
};

// ─────────────────────────────────────────────────────────────────
// Country Detection — 3 مصادر مرتبة
// ─────────────────────────────────────────────────────────────────
function detectCountry(request) {
  // 1. x-vercel-ip-country — Vercel يُرسله تلقائياً لكل Edge request
  const vercelHeader = request.headers.get('x-vercel-ip-country');
  if (isValidCC(vercelHeader)) return vercelHeader;

  // 2. hp_country cookie — من زيارة سابقة
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)hp_country=([A-Z]{2})(?:;|$)/);
  if (match && isValidCC(match[1])) return match[1];

  // 3. MA default آمن
  return 'MA';
}

function isValidCC(val) {
  return typeof val === 'string' && /^[A-Z]{2}$/.test(val);
}

// ─────────────────────────────────────────────────────────────────
// بناء Cookie header يدوياً (Web API — لا response.cookies)
// ─────────────────────────────────────────────────────────────────
function buildCookieHeader(country) {
  return `hp_country=${country}; Path=/; Max-Age=86400; SameSite=Lax; Secure`;
}

// ─────────────────────────────────────────────────────────────────
// إضافة geo headers على أي Response
// ─────────────────────────────────────────────────────────────────
function withGeoHeaders(response, country) {
  response.headers.set('X-Country', country);
  response.headers.set('Vary', 'Accept-Encoding, X-Country');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Set-Cookie', buildCookieHeader(country));
  return response;
}

// ─────────────────────────────────────────────────────────────────
// Handler — Web Standard Request → Response
// ─────────────────────────────────────────────────────────────────
export default function middleware(request) {
  const country = detectCountry(request);
  const url     = new URL(request.url);
  const path    = url.pathname;

  // ── / (root) ──────────────────────────────────────────────────
  if (path === '/') {
    if (country === 'MA') {
      // مغربي → يبقى في / — نمرر الطلب بدون redirect
      return withGeoHeaders(new Response(null, { status: 200 }), country);
    }
    // غير مغربي → redirect لـ /ar
    return withGeoHeaders(
      new Response(null, {
        status: 302,
        headers: { Location: new URL('/ar', request.url).toString() },
      }),
      country
    );
  }

  // ── /ar ───────────────────────────────────────────────────────
  if (path === '/ar') {
    if (country === 'MA') {
      // مغربي فتح /ar مباشرة → أعده لـ /
      return withGeoHeaders(
        new Response(null, {
          status: 302,
          headers: { Location: new URL('/', request.url).toString() },
        }),
        country
      );
    }
    return withGeoHeaders(new Response(null, { status: 200 }), country);
  }

  // ── /app و /auth — لا redirect، فقط geo headers ───────────────
  return withGeoHeaders(new Response(null, { status: 200 }), country);
}
