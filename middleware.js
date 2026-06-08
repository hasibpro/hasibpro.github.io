// middleware.js — HasibPro Geo-Redirect
// ✅ متوافق مع Vercel Static Projects (بدون Next.js)
// يستخدم Web Standard APIs فقط — لا next/server

export const config = {
  matcher: ['/', '/ar', '/app', '/auth'],
};

// ─────────────────────────────────────────────
// Country Detection — 4 مصادر مرتبة
// ─────────────────────────────────────────────
function detectCountry(request) {
  // 1. x-vercel-ip-country — متاح دائماً في Vercel Edge
  const vh = request.headers.get('x-vercel-ip-country');
  if (isValidCC(vh)) return vh;

  // 2. hp_country cookie — من زيارة سابقة
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)hp_country=([A-Z]{2})/);
  if (match && isValidCC(match[1])) return match[1];

  // 3. MA default
  return 'MA';
}

function isValidCC(val) {
  return typeof val === 'string' && /^[A-Z]{2}$/.test(val);
}

// ─────────────────────────────────────────────
// attachGeo — headers + cookie على كل رد
// ─────────────────────────────────────────────
function attachGeo(response, country) {
  response.headers.set('X-Country', country);
  response.headers.set('Vary', 'Accept-Encoding, X-Country');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set(
    'Set-Cookie',
    `hp_country=${country}; Path=/; Max-Age=86400; SameSite=Lax; Secure`
  );
  return response;
}

// ─────────────────────────────────────────────
// Handler — Web Standard Request/Response
// ─────────────────────────────────────────────
export default function middleware(request) {
  const country = detectCountry(request);
  const url     = new URL(request.url);
  const path    = url.pathname;

  if (path === '/') {
    if (country === 'MA') {
      return attachGeo(new Response(null, { status: 200 }), country);
    }
    return attachGeo(
      Response.redirect(new URL('/ar', request.url), 302),
      country
    );
  }

  if (path === '/ar') {
    if (country === 'MA') {
      return attachGeo(
        Response.redirect(new URL('/', request.url), 302),
        country
      );
    }
    return attachGeo(new Response(null, { status: 200 }), country);
  }

  return attachGeo(new Response(null, { status: 200 }), country);
}
