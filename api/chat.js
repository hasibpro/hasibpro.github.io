// api/chat.js — HasibPro + Google Gemini

const store = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const rec = store.get(ip) || { n: 0, t: now };

  if (now - rec.t > 60000) {
    store.set(ip, { n: 1, t: now });
    return true;
  }

  if (rec.n >= 15) return false;

  rec.n++;
  store.set(ip, rec);
  return true;
}

function sanitize(str, max = 2000) {
  if (typeof str !== 'string') return '';

  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, max);
}

export default async function handler(req, res) {

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || 'unknown')
    .split(',')[0]
    .trim();

  if (!rateLimit(ip)) {
    return res.status(429).json({
      error: 'كثرت الطلبات — حاول بعد دقيقة'
    });
  }

  try {

    const { messages, system } = req.body || {};

    // Validate messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'بيانات غير صالحة'
      });
    }

    // Clean messages
    const cleanMessages = messages
      .map(m => {

        let text = '';

        if (typeof m.content === 'string') {
          text = sanitize(m.content);
        }
        else if (Array.isArray(m.content)) {
          text = sanitize(
            m.content
              .map(c => c.text || '')
              .join(' ')
          );
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text }]
        };

      })
      .filter(m => m.parts[0].text.length > 0);

    if (cleanMessages.length === 0) {
      return res.status(400).json({
        error: 'الرسالة فارغة'
      });
    }

    // System prompt
    const cleanSystem =
      sanitize(system || '', 3000) ||
      'أنت مستشار خبير في التجارة الإلكترونية للسوق المغربي والعربي. أجب بشكل مختصر وعملي.';

    // API key
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GEMINI_KEY;

    if (!apiKey) {
      console.error('[HasibPro] Missing API key');

      return res.status(500).json({
        error: 'API key غير موجود'
      });
    }

    // Gemini model
    const model = 'gemini-1.5-flash';

    // API URL
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({

        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanSystem
              }
            ]
          },

          ...cleanMessages
        ],

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000
        }

      })
    });

    // Error from Gemini
    if (!response.ok) {

      const errText = await response.text();

      console.error(
        '[HasibPro] Gemini error:',
        response.status,
        errText
      );

      return res.status(502).json({
        error: `Gemini error ${response.status}`,
        details: errText.slice(0, 300)
      });
    }

    // Success
    const data = await response.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'لم أتمكن من إنشاء رد حالياً';

    console.log('[HasibPro] Gemini success');

    return res.status(200).json({
      content: [
        {
          type: 'text',
          text
        }
      ]
    });

  }
  catch (err) {

    console.error(
      '[HasibPro] Internal error:',
      err.message
    );

    return res.status(500).json({
      error: 'خطأ داخلي بالخادم',
      details: err.message
    });
  }
}
