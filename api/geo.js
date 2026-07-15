// api/geo.js — HasibPro Geo Detection
// Replaces the old client-side call to https://ipapi.co/json/ which was:
//  - a third-party dependency subject to CORS/rate-limit failures
//    (this is what caused the "blocked by CORS policy" console errors)
//  - an unnecessary extra network round trip
// Vercel already tells us the visitor's country on every request via the
// `x-vercel-ip-country` header (no external call, no CORS, same-origin).

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const country = req.headers['x-vercel-ip-country'] || 'MA';
  return res.status(200).json({ country_code: country });
}
