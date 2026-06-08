// middleware.js — HasibPro Geo-Redirect v4
// FIX #1: response.cookies.set() بدل headers.set('Set-Cookie') — الطريقة الرسمية في Next.js
// FIX #2: Vary: Accept-Encoding, X-Country — CDN لا يخزّن redirect خاطئ
// FIX #4: country detection بـ 4 مصادر مرتبة

import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/', '/ar', '/app', '/auth'],
};

// ─────────────────────────────────────────────────────────────────
// Country Detection — 4 مصادر مرتبة
// ─────────────────────────────────────────────────────────────────
function detectCountry(request) {
  // 1. request.geo.country — Vercel Edge Runtime (الأدق)
  const geo = request.geo?.country;
  if (isValidCC(geo)) return geo;

  // 2. x-vercel-ip-country — header من Vercel infrastructure
  const vh = request.headers.get('x-vercel-ip-country');
  if (isValidCC(vh)) return vh;

  // 3. hp_country cookie — من زيارة سابقة
  const ck = request.cookies.get('hp_country')?.value;
  if (isValidCC(ck)) return ck;

  // 4. MA default
  return 'MA';
}

// ISO 3166-1 alpha-2: حرفان كبيران فقط
function isValidCC(val) {
  return typeof val === 'string' && /^[A-Z]{2}$/.test(val);
}

// ─────────────────────────────────────────────────────────────────
// attachGeo — headers + cookie على كل رد
// ─────────────────────────────────────────────────────────────────
function attachGeo(response, country) {
  // X-Country للـ JS/API
  response.headers.set('X-Country', country);

  // FIX #2: Vary شامل — يمنع CDN من تقديم رد بلد A لبلد B
  // Accept-Encoding دائماً مطلوب، X-Country لأن الـ response يتغير بحسبه
  response.headers.set('Vary', 'Accept-Encoding, X-Country');

  // Cache-Control — لا يُخزَّن أي رد جغرافي (redirect أو next)
  // CDN يجب ألا يُخزّن صفحات تعتمد على geo detection
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');

  // FIX #1: response.cookies.set() — الطريقة الرسمية في Next.js Middleware
  // تتعامل مع Set-Cookie بشكل صحيح وتتجنب header corruption
  response.cookies.set('hp_country', country, {
    path    : '/',
    maxAge  : 86400,        // 24 ساعة
    sameSite: 'lax',        // لا CSRF، قابل للقراءة من JS
    secure  : true,         // HTTPS فقط
    httpOnly: false,        // geo-pricing.js يقرأه من document.cookie
  });

  return response;
}

// ─────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────
export default function middleware(request) {
  const country = detectCountry(request);
  const path    = request.nextUrl.pathname;

  if (path === '/') {
    if (country === 'MA') return attachGeo(NextResponse.next(), country);
    return attachGeo(NextResponse.redirect(new URL('/ar', request.url), 302), country);
  }

  if (path === '/ar') {
    if (country === 'MA') return attachGeo(NextResponse.redirect(new URL('/', request.url), 302), country);
    return attachGeo(NextResponse.next(), country);
  }

  // /app و /auth — لا redirect، فقط geo
  return attachGeo(NextResponse.next(), country);
}
