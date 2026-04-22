// middleware.js — HasibPro Geo-Redirect
// المغرب → الصفحة الأصلية (دارجة / 49 MAD)
// الدول العربية → /ar (فصحى / $9 USD)

export const config = {
  matcher: '/',
};

export default function middleware(request) {
  const country = request.geo?.country ?? 'MA';
  const url     = request.nextUrl ?? new URL(request.url);

  const arabCountries = [
    'SA', // السعودية
    'AE', // الإمارات
    'KW', // الكويت
    'QA', // قطر
    'BH', // البحرين
    'OM', // عُمان
    'EG', // مصر
    'JO', // الأردن
    'IQ', // العراق
    'LB', // لبنان
    'LY', // ليبيا
    'TN', // تونس
    'DZ', // الجزائر
    'YE', // اليمن
    'SD', // السودان
    'PS', // فلسطين
    'SY', // سوريا
    'MR', // موريتانيا
    'SO', // الصومال
    'KM', // جزر القمر
  ];

  // المغرب → يبقى في الصفحة الأصلية
  if (country === 'MA') {
    return; // لا redirect
  }

  // دول عربية → صفحة الفصحى
  if (arabCountries.includes(country)) {
    return Response.redirect(new URL('/ar', request.url), 302);
  }

  // باقي دول العالم → نفس صفحة العرب (فصحى أوسع انتشاراً)
  return Response.redirect(new URL('/ar', request.url), 302);
}
feat: geo-redirect middleware
