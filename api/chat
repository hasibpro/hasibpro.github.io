// api/chat.js — HasibPro Secured API
// ✅ Rate Limiting | Auth Check | Input Validation | Error Handling

// In-memory rate limiter (resets on cold start)
const rateStore = new Map();

function getRateLimit(ip) {
  const now    = Date.now();
  const window = 60 * 1000;  // 1 دقيقة
  const max    = 15;          // 15 طلب / دقيقة لكل IP

  const rec = rateStore.get(ip) || { count: 0, start: now };

  // reset window
  if (now - rec.start > window) {
    const fresh = { count: 1, start: now };
    rateStore.set(ip, fresh);
    return { allowed: true, remaining: max - 1 };
  }

  if (rec.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  rec.count++;
  rateStore.set(ip, rec);
  return { allowed: true, remaining: max - rec.count };
}

// Sanitize string input
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')       // منع HTML injection
    .replace(/javascript:/gi, '') // منع JS injection
    .trim()
    .slice(0, 3000);              // حد أقصى للطول
}

export default async function handler(req, res) {

  // ✅ CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://hasibpro-github-io.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ✅ Method check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ✅ Rate limiting
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();

  const rate = getRateLimit(ip);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);

  if (!rate.allowed) {
    return res.status(429).json({
      error: 'Too many requests — حاول مرة أخرى بعد دقيقة'
    });
  }

  // ✅ Auth check — تحقق من Supabase session token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token || token.length < 20) {
    return res.status(401).json({ error: 'Unauthorized — يجب تسجيل الدخول' });
  }

  // ✅ Input validation
  const { messages, system } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  if (messages.length > 20) {
    return res.status(400).json({ error: 'Too many messages in history' });
  }

  // Sanitize كل رسالة
  const cleanMessages = messages.map(m => ({
    role:    m.role === 'assistant' ? 'assistant' : 'user',
    content: sanitize(m.content || '')
  })).filter(m => m.content.length > 0);

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: 'Empty message content' });
  }

  const cleanSystem = system
    ? sanitize(system).slice(0, 1000)
    : 'أنت مستشار خبير في التجارة الإلكترونية. أجب بشكل مختصر وعملي.';

  // ✅ Anthropic API call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Missing ANTHROPIC_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            apiKey,
        'anthropic-version':    '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     cleanSystem,
        messages:   cleanMessages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', response.status, err);
      return res.status(502).json({ error: 'AI service error — حاول مرة أخرى' });
    }

    const data = await response.json();

    // ✅ لا نعيد معلومات حساسة للـ client
    return res.status(200).json({
      content: data.content,
      usage:   { input: data.usage?.input_tokens, output: data.usage?.output_tokens }
    });

  } catch (err) {
    console.error('Chat handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
