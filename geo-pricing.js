// geo-pricing.js — HasibPro Geo-Pricing System
// يكشف البلد تلقائياً ويحفظ العملة في localStorage
// MA → 49 MAD | باقي الدول → $9 USD

(function() {
  // إذا كانت الإعدادات محفوظة مسبقاً نوقف
  if (localStorage.getItem('hasibpro_region')) return;

  const arabCountries = [
    'SA','AE','KW','QA','BH','OM','EG','JO','IQ',
    'LB','LY','TN','DZ','YE','SD','PS','SY','MR','SO','KM'
  ];

  // محاولة كشف البلد عبر ipapi.co (مجاني)
  fetch('https://ipapi.co/json/')
    .then(r => r.json())
    .then(data => {
      const country = data.country_code || 'MA';
      setPricing(country);
    })
    .catch(() => {
      // في حالة الفشل نحافظ على القيمة الافتراضية MA
      setPricing('MA');
    });

  function setPricing(country) {
    if (country === 'MA') {
      localStorage.setItem('hasibpro_region',   'MA');
      localStorage.setItem('hasibpro_currency', 'MAD');
      localStorage.setItem('hasibpro_price',    '49');
      localStorage.setItem('hasibpro_symbol',   'درهم');
      localStorage.setItem('hasibpro_landing',  '/');
    } else {
      localStorage.setItem('hasibpro_region',   'AR');
      localStorage.setItem('hasibpro_currency', 'USD');
      localStorage.setItem('hasibpro_price',    '9');
      localStorage.setItem('hasibpro_symbol',   '$');
      localStorage.setItem('hasibpro_landing',  '/ar');
    }
    // إرسال حدث للتطبيق
    window.dispatchEvent(new CustomEvent('hasibpro:pricingReady', {
      detail: {
        region:   localStorage.getItem('hasibpro_region'),
        currency: localStorage.getItem('hasibpro_currency'),
        price:    localStorage.getItem('hasibpro_price'),
        symbol:   localStorage.getItem('hasibpro_symbol'),
      }
    }));
  }
})();
