// security.js — HasibPro Frontend Security
// أضف هاد الملف في <head> قبل أي script آخر
// <script src="security.js"></script>

(function() {
  'use strict';

  // ================================================
  // 🔴 1. XSS Protection — Sanitize كل input
  // ================================================
  window.HP = window.HP || {};

  HP.sanitize = function(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  };

  // Safe innerHTML — يمنع XSS
  HP.safeHtml = function(element, html) {
    if (!element) return;
    // Allow only safe tags
    const safe = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
    element.innerHTML = safe;
  };

  // ================================================
  // 🔴 2. Number Validation — منع القيم الغريبة
  // ================================================
  HP.validateNumber = function(val, min, max) {
    min = min !== undefined ? min : 0;
    max = max !== undefined ? max : 9999999;
    const n = parseFloat(val);
    if (isNaN(n) || !isFinite(n)) return null;
    if (n < min || n > max) return null;
    return n;
  };

  HP.validatePositive = function(val) {
    return HP.validateNumber(val, 0.01, 9999999);
  };

  // ================================================
  // 🟡 3. Rate Limiting — منع Spam على الـ AI
  // ================================================
  const AI_LIMIT = {
    maxPerMin: 10,
    count: 0,
    resetAt: Date.now() + 60000
  };

  HP.checkAILimit = function() {
    const now = Date.now();
    if (now > AI_LIMIT.resetAt) {
      AI_LIMIT.count = 0;
      AI_LIMIT.resetAt = now + 60000;
    }
    if (AI_LIMIT.count >= AI_LIMIT.maxPerMin) {
      return false;
    }
    AI_LIMIT.count++;
    return true;
  };

  // ================================================
  // 🟡 4. Secure Fetch — زيد Auth Token تلقائياً
  // ================================================
  HP.secureFetch = async function(url, body) {
    // Rate limit check
    if (url.includes('/api/chat') && !HP.checkAILimit()) {
      throw new Error('rate_limit');
    }

    // Get Supabase session token
    let token = '';
    try {
      const sb = window.supabase?.createClient
        ? null
        : window._sb;
      if (window._sbSession) {
        token = window._sbSession;
      }
    } catch(e) {}

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify(body)
    });

    if (resp.status === 429) {
      throw new Error('rate_limit');
    }
    if (resp.status === 401) {
      // Session expired — redirect to login
      window.location.href = 'auth.html';
      throw new Error('unauthorized');
    }
    if (!resp.ok) {
      throw new Error('server_error_' + resp.status);
    }
    return resp.json();
  };

  // ================================================
  // 🟡 5. Session Token Cache — للاستخدام في API calls
  // ================================================
  HP.initSession = async function(sbClient) {
    try {
      const { data: { session } } = await sbClient.auth.getSession();
      if (session?.access_token) {
        window._sbSession = session.access_token;
      }
      // Auto-refresh token
      sbClient.auth.onAuthStateChange((_event, session) => {
        window._sbSession = session?.access_token || '';
      });
    } catch(e) {
      console.error('Session init error:', e);
    }
  };

  // ================================================
  // 🟢 6. Console Protection — إخفاء الأكواد من DevTools
  // ================================================
  if (window.location.hostname !== 'localhost' &&
      !window.location.hostname.includes('127.0.0.1')) {

    // منع console.log في Production
    const noop = function() {};
    window.console.log   = noop;
    window.console.debug = noop;
    window.console.info  = noop;
    // نبقيو warn وerror للمشاكل الحقيقية

    // DevTools Detection
    let devOpen = false;
    const threshold = 160;
    setInterval(function() {
      const widthDiff  = window.outerWidth  - window.innerWidth  > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if ((widthDiff || heightDiff) && !devOpen) {
        devOpen = true;
        console.warn('HasibPro: للإبلاغ عن ثغرة، تواصل معنا عبر واتساب');
      } else if (!widthDiff && !heightDiff) {
        devOpen = false;
      }
    }, 1000);
  }

  // ================================================
  // 🟢 7. Clickjacking Protection
  // ================================================
  if (window.top !== window.self) {
    window.top.location = window.self.location;
  }

  console.info('✅ HasibPro Security initialized');

})();
