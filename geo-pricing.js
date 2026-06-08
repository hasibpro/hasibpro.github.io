// geo-pricing.js — HasibPro Geo-Pricing v3
// ✅ FIX: Cookie كمصدر أساسي (middleware يحقنه — يعمل بدون HTMLRewriter)
// ✅ FIX #8 Dead code: arabCountries مُزال
// ترتيب مصادر البلد:
//   1. Cookie hp_country  (من middleware — الأموثق)
//   2. window.__HASIBPRO_COUNTRY__ (SSR injection اختياري)
//   3. ip-api.com  (fallback فقط)
//   4. 'MA'        (default آمن)

(function () {
  const CACHE_KEY    = 'hasibpro_region';
  const CACHE_TS_KEY = 'hasibpro_cached_at';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ساعة

  // ── هل الـ cache صالح؟ ─────────────────────────────────────────
  function isCacheValid() {
    const region = localStorage.getItem(CACHE_KEY);
    const ts     = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
    return !!(region && (Date.now() - ts < CACHE_TTL_MS));
  }

  if (isCacheValid()) {
    firePricingReady();
    return;
  }

  // ── اكتشاف البلد ────────────────────────────────────────────────
  resolveCountry().then(country => setPricing(country));

  async function resolveCountry() {
    // 1. Cookie hp_country (middleware يحقنه — الأموثق بعد حذف HTMLRewriter)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)hp_country=([A-Z]{2})/);
    if (cookieMatch) {
      return cookieMatch[1];
    }

    // 2. window variable (SSR injection اختياري)
    if (typeof window.__HASIBPRO_COUNTRY__ === 'string'
        && /^[A-Z]{2}$/.test(window.__HASIBPRO_COUNTRY__)) {
      return window.__HASIBPRO_COUNTRY__;
    }

    // 3. ip-api.com — fallback (10k/يوم مجاناً)
    try {
      // AbortSignal.timeout متاح في المتصفحات الحديثة — مع fallback آمن
      const signal = typeof AbortSignal?.timeout === 'function'
        ? AbortSignal.timeout(5000)
        : undefined;

      const r = await fetch('https://ip-api.com/json/?fields=countryCode', {
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      });

      if (r.ok) {
        const data = await r.json();
        if (typeof data.countryCode === 'string' && /^[A-Z]{2}$/.test(data.countryCode)) {
          return data.countryCode;
        }
      }
    } catch {
      // timeout أو network error → default
    }

    // 4. Default
    return 'MA';
  }

  // ── setPricing ──────────────────────────────────────────────────
  function setPricing(country) {
    const isMA = country === 'MA';
    const config = isMA
      ? { region: 'MA', currency: 'MAD', price: '49', symbol: 'درهم', landing: '/' }
      : { region: 'AR', currency: 'USD', price: '9',  symbol: '$',    landing: '/ar' };

    Object.entries(config).forEach(([k, v]) =>
      localStorage.setItem(`hasibpro_${k}`, v)
    );
    localStorage.setItem(CACHE_TS_KEY, Date.now().toString());

    firePricingReady();
  }

  // ── حدث التسعير ─────────────────────────────────────────────────
  function firePricingReady() {
    window.dispatchEvent(new CustomEvent('hasibpro:pricingReady', {
      detail: {
        region  : localStorage.getItem('hasibpro_region')   || 'MA',
        currency: localStorage.getItem('hasibpro_currency') || 'MAD',
        price   : localStorage.getItem('hasibpro_price')    || '49',
        symbol  : localStorage.getItem('hasibpro_symbol')   || 'درهم',
      },
    }));
  }

  // دالة إعادة الضبط (للتطوير فقط)
  window.__hasibproResetPricing = function () {
    [CACHE_KEY, CACHE_TS_KEY,
     'hasibpro_currency', 'hasibpro_price',
     'hasibpro_symbol', 'hasibpro_landing']
      .forEach(k => localStorage.removeItem(k));
    console.info('[HasibPro] Pricing cache cleared — reload the page');
  };
})();
