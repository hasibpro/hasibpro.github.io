// pricing-modal.js — HasibPro Pricing Modal v3
// ✅ FIX #4: لا inline events (onclick/onmouseover/onmouseout مُزالة كلها)
// ✅ FIX #5: CSP-compatible — addEventListener فقط
// ✅ Strict pricing validation — السعر من OFFICIAL_PRICES دائماً

(function () {

  // ── الأسعار الرسمية — مصدر الحقيقة الوحيد ──────────────────────
  const OFFICIAL_PRICES = {
    MA: { price: '49', symbol: 'درهم', currency: 'MAD' },
    AR: { price: '9',  symbol: '$',    currency: 'USD'  },
  };

  // ── التحقق الصارم — localStorage = cache، السعر من OFFICIAL_PRICES ─
  function getValidatedPricing() {
    const stored = localStorage.getItem('hasibpro_region') || 'MA';
    const region = OFFICIAL_PRICES[stored] ? stored : 'MA';
    return { region, ...OFFICIAL_PRICES[region] };
  }

  // ── بناء HTML الـ Modal بدون أي inline event ─────────────────────
  function buildModalHTML(price, symbol, desc) {
    const priceDisplay = symbol === '$' ? `$${price}` : `${price} ${symbol}`;
    // لاحظ: لا onclick، لا onmouseover، لا onmouseout في الـ HTML
    return `
      <div id="hasibpro-modal-inner" style="
        background:#0f1a2e; border:1px solid rgba(0,212,170,0.3);
        border-radius:20px; padding:36px 30px; max-width:420px;
        width:90%; position:relative; text-align:center;
        box-shadow:0 20px 60px rgba(0,0,0,0.6);
        font-family:'Cairo',sans-serif; color:#e2e8f0; direction:rtl;">

        <button id="hasibpro-modal-close" aria-label="إغلاق"
          style="position:absolute;top:14px;left:14px;background:transparent;
          border:none;color:#64748b;cursor:pointer;font-size:20px;line-height:1;">✕</button>

        <div style="font-size:36px;margin-bottom:12px;">🚀</div>
        <h2 style="font-size:22px;font-weight:900;margin-bottom:8px;">
          اشترك في
          <span style="background:linear-gradient(135deg,#00d4aa,#4e8ef7);
            -webkit-background-clip:text;-webkit-text-fill-color:transparent;">
            حاسب برو
          </span>
        </h2>
        <p id="hasibpro-plan-desc"
           style="font-size:13px;color:#94a3b8;margin-bottom:20px;line-height:1.7;">
          ${desc}
        </p>

        <div style="background:#121f36;border:1px solid #1a2940;border-radius:14px;
                    padding:20px;margin-bottom:22px;">
          <div id="hasibpro-price-display"
               style="font-size:48px;font-weight:900;color:#00d4aa;line-height:1;">
            ${priceDisplay}
          </div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">في الشهر</div>
        </div>

        <ul style="list-style:none;text-align:right;margin-bottom:24px;padding:0;
                   display:flex;flex-direction:column;gap:8px;">
          ${['جميع المنصات (9+)','تحليل الإعلانات ROAS','المساعد الذكي',
             'مقارنة غير محدودة','تصدير PDF','حفظ سحابي آمن']
            .map(f => `<li style="font-size:13px;color:#94a3b8;">
              <span style="color:#00d4aa;font-weight:900;">✓</span> ${f}</li>`)
            .join('')}
        </ul>

        <a id="hasibpro-whatsapp-btn"
           href="https://wa.me/212602568191"
           target="_blank"
           rel="noopener noreferrer"
           style="display:block;background:linear-gradient(135deg,#00d4aa,#4e8ef7);
             color:#000;font-family:'Cairo',sans-serif;font-size:14px;
             font-weight:900;padding:14px;border-radius:12px;
             text-decoration:none;margin-bottom:12px;
             box-shadow:0 6px 20px rgba(0,212,170,0.3);
             transition:opacity 0.2s;">
          💬 اشترك عبر واتساب
        </a>
        <p style="font-size:11px;color:#4a6080;">
          دفع آمن · إلغاء في أي وقت · بلا بطاقة بنكية
        </p>
      </div>
    `;
  }

  // ── ربط Events بعد إنشاء الـ modal (addEventListener فقط) ────────
  function bindModalEvents(modal) {
    // زر الإغلاق
    modal.querySelector('#hasibpro-modal-close')
      ?.addEventListener('click', () => closeModal());

    // Hover على زر واتساب — CSS class بدل inline style
    const waBtn = modal.querySelector('#hasibpro-whatsapp-btn');
    if (waBtn) {
      waBtn.addEventListener('mouseover', () => { waBtn.style.opacity = '0.88'; });
      waBtn.addEventListener('mouseout',  () => { waBtn.style.opacity = '1'; });
      waBtn.addEventListener('focus',     () => { waBtn.style.opacity = '0.88'; });
      waBtn.addEventListener('blur',      () => { waBtn.style.opacity = '1'; });
    }
  }

  // ── إنشاء الـ Modal ───────────────────────────────────────────────
  function createModal() {
    const { region, price, symbol } = getValidatedPricing();

    const modal = document.createElement('div');
    modal.id = 'hasibpro-pricing-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'الاشتراك في HasibPro Pro');
    modal.style.cssText = `
      display:none; position:fixed; inset:0; z-index:9999;
      background:rgba(0,0,0,0.75); backdrop-filter:blur(6px);
      align-items:center; justify-content:center;
    `;

    const desc = region === 'MA'
      ? 'اشترك الآن واستمتع بكل مميزات Pro مع دعم مغربي كامل'
      : 'اشترك الآن واستمتع بكل مميزات Pro للبائعين العرب';

    modal.innerHTML = buildModalHTML(price, symbol, desc);
    document.body.appendChild(modal);

    // FIX #4: كل الـ events عبر addEventListener
    bindModalEvents(modal);

    // إغلاق بالضغط على الخلفية
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal();
    });

    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('hasibpro-pricing-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── تحديث بيانات الـ Modal ────────────────────────────────────────
  function updateModal() {
    const modal = document.getElementById('hasibpro-pricing-modal');
    if (!modal) return;

    const { region, price, symbol } = getValidatedPricing();

    const desc = region === 'MA'
      ? 'اشترك الآن واستمتع بكل مميزات Pro مع دعم مغربي كامل'
      : 'اشترك الآن واستمتع بكل مميزات Pro للبائعين العرب';

    const descEl = modal.querySelector('#hasibpro-plan-desc');
    if (descEl) descEl.textContent = desc;

    const priceEl = modal.querySelector('#hasibpro-price-display');
    if (priceEl) priceEl.textContent = symbol === '$' ? `$${price}` : `${price} ${symbol}`;

    const waMsg = region === 'MA'
      ? `مرحباً، أريد الاشتراك في حاسب برو Pro بـ ${price} ${symbol}/شهر`
      : `Hello, I want to subscribe to HasibPro Pro at $${price}/month`;

    const waBtn = modal.querySelector('#hasibpro-whatsapp-btn');
    if (waBtn) {
      // FIX #8: بناء URL بشكل آمن — رقم الهاتف ثابت في الكود، فقط الـ text ديناميكي
      const WA_NUMBER = '212602568191'; // ثابت — لا يُقرأ من user input أبداً
      const safeText  = encodeURIComponent(waMsg.slice(0, 300)); // حد 300 حرف
      waBtn.href = `https://wa.me/${WA_NUMBER}?text=${safeText}`;
    }
  }

  // ── تحديث أسعار Landing Pages ─────────────────────────────────────
  function updateLandingPrices() {
    const { price, symbol } = getValidatedPricing();
    const display = symbol === '$' ? `$${price}` : `${price} ${symbol}`;

    document.querySelectorAll('[data-hasibpro-price]')
      .forEach(el => { el.textContent = display; });

    const arEl = document.getElementById('ar-pro-price');
    if (arEl) arEl.textContent = display;
  }

  // ── API عامة ──────────────────────────────────────────────────────
  window.openPricingModal = function () {
    let modal = document.getElementById('hasibpro-pricing-modal');
    if (!modal) modal = createModal();
    updateModal();
    modal.style.display = 'flex';
    modal.querySelector('#hasibpro-modal-close')?.focus();
  };

  // إغلاق بـ Escape — global listener
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // استجابة لـ geo-pricing event
  window.addEventListener('hasibpro:pricingReady', () => {
    updateModal();
    updateLandingPrices();
  });

  // تحديث فوري إذا كان الـ cache موجوداً
  if (localStorage.getItem('hasibpro_region')) {
    updateLandingPrices();
  }

})();
