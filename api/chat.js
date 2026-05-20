// api/chat.js — HasibPro + Google Gemini
// FIX: استعمال v1beta بدل v1 + models الصحيحة

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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (!rateLimit(ip)) return res.status(429).json({ error: 'كثرت الطلبات — انتظر دقيقة' });

  const { messages, system } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'بيانات غير صالحة' });

  const cleanSystem = sanitize(system || '', 3000) ||
    'أنت مستشار خبير في التجارة الإلكترونية للسوق المغربي والعربي. أجب بشكل مختصر وعملي.';

  // دمج system مع أول رسالة user
  const cleanMessages = messages
    .map((m, i) => {
      let text = '';
      if (typeof m.content === 'string') text = sanitize(m.content);
      else if (Array.isArray(m.content)) text = sanitize(m.content.map(c => c.text || '').join(' '));
      if (i === 0 && m.role === 'user') {
        text = cleanSystem + '\n\n---\n\n' + text;
      }
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }]
      };
    })
    .filter(m => m.parts[0].text.length > 0);

  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY غير موجود في Environment Variables' });
  }

  // FIX: v1beta هو الصحيح — v1 لا يدعم هاد الـ models
  // FIX: models الصحيحة المتاحة في v1beta
  const models = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ];

  for (const model of models) {
    try {
      // FIX: v1beta بدل v1
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: cleanMessages,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[HasibPro] Success with: ${model}`);
        return res.status(200).json({
          content: [{ type: 'text', text }]
        });
      }

      const errText = await response.text();
      console.error(`[HasibPro] ${model} failed ${response.status}:`, errText.slice(0, 300));

    } catch (err) {
      console.error(`[HasibPro] ${model} exception:`, err.message);
    }
  }

  return res.status(502).json({
    error: 'خطأ في الاتصال بـ Gemini — تحقق من Vercel Logs'
  });
}
