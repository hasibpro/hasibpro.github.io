// middleware.js — HasibPro Geo-Redirect
// كل الزوار → landing page (فصحى)
// التطبيق نفسه → /app

export const config = {
  matcher: ['/', '/index.html'],
};

export default function middleware(request) {
  const url = new URL(request.url);

  // إذا جاء من رابط مباشر للتطبيق، يبقى فيه
  if (url.searchParams.get('app') === '1') {
    return;
  }

  // كل الزوار → landing page
  // (Landing page هي الـ root نفسها — مافي redirect لازم)
  return;
}
