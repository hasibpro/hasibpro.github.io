// api/chat.js — HasibPro + Google Gemini (مجاني)
// 1500 request/يوم مجاناً

const store = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const rec  = store.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { store.set(ip, { n: 1, t: now }); return true; }
  if (rec.n >= 15) return false;
  rec.n++; store.set(ip, rec); return true;
}

function sanitize(str, max = 2000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .trim().slice(0, max);
}

export default async function handler(req, res) {

  // CORS
  const allowed = ['https://hasibpro-github-io.vercel.app', 'http://localhost:3000'];
  const origin  = req.headers.origin || '';
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (!rateLimit(ip)) return res.status(429).json({ error: 'كثرت الطلبات — انتظر دقيقة' });

  // Input validation
  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'بيانات غير صالحة' });

  const cleanMessages = messages
    .map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: sanitize(m.content || '') }] }))
    .filter(m => m.parts[0].text.length > 0);

  const cleanSystem = sanitize(system || '', 1000) ||
    'أنت مستشار خبير في التجارة الإلكترونية. أجب بشكل مختصر وعملي.';

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key غير موجود' });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: cleanSystem }] },
        contents: cleanMessages,
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[HasibPro] Gemini error:', response.status, err);
      return res.status(502).json({ error: 'خطأ في خدمة AI — حاول مرة أخرى' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Return in same format as Anthropic for compatibility
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (err) {
    console.error('[HasibPro] Handler error:', err.message);
    return res.status(500).json({ error: 'خطأ داخلي — تحقق من الإنترنت' });
  }
}
