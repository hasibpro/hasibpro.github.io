// pricing-modal.js — HasibPro Pricing Modal
// أضف هذا السكريبت في التطبيق (index.html) لإظهار modal الاشتراك الصحيح

(function() {
  // إنشاء الـ Modal
  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'hasibpro-pricing-modal';
    modal.style.cssText = `
      display:none; position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,0.7); backdrop-filter:blur(6px);
      align-items:center; justify-content:center;
    `;
    modal.innerHTML = `
      <div style="
        background:#0f1a2e; border:1px solid rgba(0,212,170,0.3);
        border-radius:20px; padding:36px 30px; max-width:420px;
        width:90%; position:relative; text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,0.6);
        font-family:'Cairo',sans-serif; color:#e2e8f0; direction:rtl;
      ">
        <button onclick="document.getElementById('hasibpro-pricing-modal').style.display='none'"
          style="position:absolute;top:14px;left:14px;background:transparent;border:none;
          color:#64748b;cursor:pointer;font-size:20px;">✕</button>

        <div style="font-size:36px;margin-bottom:12px;">🚀</div>
        <h2 style="font-size:22px;font-weight:900;margin-bottom:8px;">
          اشترك في <span style="background:linear-gradient(135deg,#00d4aa,#4e8ef7);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;">حاسب برو</span>
        </h2>
        <p id="hasibpro-plan-desc" style="font-size:13px;color:#94a3b8;margin-bottom:20px;line-height:1.7;"></p>

        <div style="background:#121f36;border:1px solid #1a2940;border-radius:14px;padding:20px;margin-bottom:22px;">
          <div style="font-size:48px;font-weight:900;color:#00d4aa;line-height:1;">
            <span id="hasibpro-price-symbol"></span><span id="hasibpro-price-value"></span>
          </div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">في الشهر</div>
        </div>

        <ul style="list-style:none;text-align:right;margin-bottom:24px;padding:0;display:flex;flex-direction:column;gap:8px;">
          <li style="font-size:13px;color:#94a3b8;"><span style="color:#00d4aa;font-weight:900;">✓</span> جميع المنصات (9+)</li>
          <li style="font-size:13px;color:#94a3b8;"><span style="color:#00d4aa;font-weight:900;">✓</span> تحليل الإعلانات ROAS</li>
          <li style="font-size:13px;color:#94a3b8;"><span style="color:#00d4aa;font-weight:900;">✓</span> المساعد الذكي AI</li>
          <li style="font-size:13px;color:#94a3b8;"><span style="color:#00d4aa;font-weight:900;">✓</span> مقارنة غير محدودة</li>
          <li style="font-size:13px;color:#94a3b8;"><span style="color:#00d4aa;font-weight:900;">✓</span> تصدير PDF</li>
        </ul>

        <a id="hasibpro-whatsapp-btn"
          href="https://wa.me/212602568191"
          target="_blank"
          style="
            display:block; background:linear-gradient(135deg,#00d4aa,#4e8ef7);
            color:#000; font-family:'Cairo',sans-serif; font-size:14px;
            font-weight:900; padding:14px; border-radius:12px;
            text-decoration:none; margin-bottom:12px;
            box-shadow:0 6px 20px rgba(0,212,170,0.3);
          ">
          💬 اشترك عبر واتساب
        </a>
        <p style="font-size:11px;color:#4a6080;">دفع آمن · إلغاء في أي وقت</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  // تحديث بيانات الـ Modal حسب المنطقة
  function updateModal() {
    const price    = localStorage.getItem('hasibpro_price')    || '49';
    const symbol   = localStorage.getItem('hasibpro_symbol')   || 'درهم';
    const region   = localStorage.getItem('hasibpro_region')   || 'MA';
    const currency = localStorage.getItem('hasibpro_currency') || 'MAD';

    const desc = region === 'MA'
      ? 'اشترك الآن واستمتع بكل مميزات Pro مع دعم مغربي كامل'
      : 'اشترك الآن واستمتع بكل مميزات Pro للبائعين العرب';

    const modal = document.getElementById('hasibpro-pricing-modal');
    if (!modal) return;

    modal.querySelector('#hasibpro-plan-desc').textContent = desc;

    if (symbol === '$') {
      modal.querySelector('#hasibpro-price-symbol').textContent = '$';
      modal.querySelector('#hasibpro-price-value').textContent = price;
    } else {
      modal.querySelector('#hasibpro-price-symbol').textContent = '';
      modal.querySelector('#hasibpro-price-value').textContent = price + ' ' + symbol;
    }

    // واتساب message
    const waMsg = region === 'MA'
      ? `مرحباً، أريد الاشتراك في حاسب برو Pro بـ ${price} ${symbol}/شهر`
      : `مرحباً، أريد الاشتراك في HasibPro Pro بـ $${price}/month`;
    modal.querySelector('#hasibpro-whatsapp-btn').href =
      `https://wa.me/212602568191?text=${encodeURIComponent(waMsg)}`;
  }

  // فتح الـ Modal
  window.openPricingModal = function() {
    let modal = document.getElementById('hasibpro-pricing-modal');
    if (!modal) modal = createModal();
    updateModal();
    modal.style.display = 'flex';
  };

  // إغلاق عند الضغط خارج الـ Modal
  document.addEventListener('click', function(e) {
    const modal = document.getElementById('hasibpro-pricing-modal');
    if (modal && e.target === modal) modal.style.display = 'none';
  });

  // تحديث تلقائي عند جهوزية التسعير
  window.addEventListener('hasibpro:pricingReady', updateModal);
})();
