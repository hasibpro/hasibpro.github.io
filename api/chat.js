// api/chat.js — HasibPro + Google Gemini

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

  const cleanMessages = messages
    .map(m => {
      let text = '';
      if (typeof m.content === 'string') text = sanitize(m.content);
      else if (Array.isArray(m.content)) text = sanitize(m.content.map(c => c.text || '').join(' '));
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }]
      };
    })
    .filter(m => m.parts[0].text.length > 0);

  if (cleanMessages.length === 0)
    return res.status(400).json({ error: 'الرسالة فارغة' });

  const cleanSystem = sanitize(system || '', 3000) ||
    'أنت مستشار خبير في التجارة الإلكترونية للسوق المغربي والعربي. أجب بشكل مختصر وعملي.';

  // تحقق من وجود API key
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_KEY;
  if (!apiKey) {
    console.error('[HasibPro] No API key found in env vars');
    return res.status(500).json({ 
      error: 'API key مش موجود',
      hint: 'أضف GEMINI_API_KEY في Vercel Environment Variables'
    });
  }

  // جرب gemini-1.5-flash أولاً ثم gemini-pro كـ fallback
  const models = ['gemini-1.5-flash', 'gemini-1.0-pro'];
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

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

      // إذا نجح — رجع النتيجة
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log(`[HasibPro] Success with model: ${model}`);
        return res.status(200).json({
          content: [{ type: 'text', text }]
        });
      }

      // إذا فشل — سجل الخطأ وجرب الـ model التالي
      const errText = await response.text();
      console.error(`[HasibPro] Model ${model} failed:`, response.status, errText);

      // إذا هو آخر model — رجع الخطأ للعميل
      if (model === models[models.length - 1]) {
        return res.status(502).json({ 
          error: `Gemini error ${response.status}`,
          details: errText.slice(0, 200)
        });
      }

    } catch (err) {
      console.error(`[HasibPro] Fetch error with ${model}:`, err.message);
      if (model === models[models.length - 1]) {
        return res.status(500).json({ error: 'خطأ داخلي: ' + err.message });
      }
    }
  }
}
