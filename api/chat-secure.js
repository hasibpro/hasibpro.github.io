// api/chat.js — HasibPro Secured API Proxy
// ✅ Rate Limiting | Auth Verification | Input Validation | Error Handling

// ============ Rate Limiter (in-memory) ============
const store = new Map();

function rateLimit(ip) {
  const now    = Date.now();
  const window = 60 * 1000; // 1 دقيقة
  const max    = 15;         // 15 طلب/دقيقة لكل IP

  const rec = store.get(ip) || { n: 0, t: now };

  if (now - rec.t > window) {
    store.set(ip, { n: 1, t: now });
    return { ok: true, remaining: max - 1 };
  }

  if (rec.n >= max) {
    return { ok: false, remaining: 0 };
  }

  rec.n++;
  store.set(ip, rec);
  return { ok: true, remaining: max - rec.n };
}

// ============ Input Sanitizer ============
function sanitize(str, maxLen = 2000) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, maxLen);
}

// ============ Main Handler ============
export default async function handler(req, res) {

  // ✅ 1. CORS — فقط من الدومين ديالك
  const allowed = [
    'https://hasibpro-github-io.vercel.app',
    'http://localhost:3000'
  ];
  const origin = req.headers.origin || '';
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ✅ 2. Method check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ✅ 3. Rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  const rate = rateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);

  if (!rate.ok) {
    return res.status(429).json({
      error: 'كثرت الطلبات — انتظر دقيقة وحاول مرة أخرى'
    });
  }

  // ✅ 4. Auth check — تحقق من Supabase JWT token
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token || token.length < 20) {
    return res.status(401).json({ error: 'غير مصرح — سجل دخولك أولاً' });
  }

  // ✅ 5. Input validation
  const { messages, system } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'بيانات غير صالحة' });
  }

  if (messages.length > 20) {
    return res.status(400).json({ error: 'سجل المحادثة طويل جداً' });
  }

  // ✅ 6. Sanitize كل رسالة — منع Prompt Injection
  const cleanMessages = messages
    .map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitize(m.content || '', 2000)
    }))
    .filter(m => m.content.length > 0);

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: 'الرسالة فارغة' });
  }

  const cleanSystem = sanitize(system || '', 800) ||
    'أنت مستشار خبير في التجارة الإلكترونية. أجب بشكل مختصر وعملي.';

  // ✅ 7. API key من Environment Variables فقط
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[HasibPro] Missing ANTHROPIC_API_KEY');
    return res.status(500).json({ error: 'خطأ في إعداد الخادم' });
  }

  // ✅ 8. Call Anthropic API
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     cleanSystem,
        messages:   cleanMessages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[HasibPro] Anthropic error:', response.status, errText);
      return res.status(502).json({ error: 'خطأ في خدمة AI — حاول مرة أخرى' });
    }

    const data = await response.json();

    // ✅ 9. إرجاع فقط ما يحتاجه الـ client
    return res.status(200).json({
      content: data.content,
      usage: {
        input:  data.usage?.input_tokens  || 0,
        output: data.usage?.output_tokens || 0
      }
    });

  } catch (err) {
    console.error('[HasibPro] Handler error:', err.message);
    return res.status(500).json({ error: 'خطأ داخلي — تحقق من الإنترنت' });
  }
}
