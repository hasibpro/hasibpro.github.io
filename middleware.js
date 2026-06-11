// middleware.js — HasibPro Geo-Redirect
// 🇲🇦 MA → / (Landing دارجة)
// 🌍 Arab → /ar (Landing فصحى)
// ⚙️ /app و /auth → لا redirect — يمروا مباشرة

export const config = {
  matcher: '/', // فقط الـ root
};

export default function middleware(request) {
  const country = request.geo?.country ?? 'MA';

  const arabCountries = [
    'SA','AE','KW','QA','BH','OM','EG','JO','IQ',
    'LB','LY','TN','DZ','YE','SD','PS','SY','MR','SO','KM'
  ];

  // 🇲🇦 المغرب → يبقى في / (landing MA)
  if (country === 'MA') return;

  // 🌍 الدول العربية + باقي العالم → /ar
  if (arabCountries.includes(country)) {
    return Response.redirect(new URL('/ar', request.url), 302);
  }

  // باقي الدول → /ar (فصحى أوسع انتشاراً)
  return Response.redirect(new URL('/ar', request.url), 302);
}
