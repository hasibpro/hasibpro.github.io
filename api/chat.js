// api/chat.js — HasibPro + Groq Only

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

function sanitize(str, max = 3000) {
  if (typeof str !== 'string') return '';

  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, max);
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const ip = (req.headers['x-forwarded-for'] || 'unknown')
    .split(',')[0]
    .trim();

  if (!rateLimit(ip)) {
    return res.status(429).json({
      error: 'كثرت الطلبات — انتظر دقيقة'
    });
  }

  const { messages, system } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'بيانات غير صالحة'
    });
  }

  const groqKey = process.env.GROQ_API_KEY;

  if (!groqKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY غير موجود في Environment Variables'
    });
  }

  const cleanSystem = sanitize(system || '', 5000) || `
أنت HasibPro AI.

مستشار خبير في:
- التجارة الإلكترونية
- الدروبشيبينغ
- التسويق الرقمي
- تحليل الأرباح
- تحليل الإعلانات
- التسعير
- Shopify
- Youcan
- TikTok Shop
- Amazon
- WooCommerce

قواعد الإجابة:

- أجب دائماً بنفس لغة المستخدم.
- إذا كتب المستخدم بالعربية فأجب بالعربية الفصحى السليمة.
- إذا كتب بالدارجة المغربية فأجب بدارجة مغربية احترافية وواضحة.
- لا تستعمل ترجمة حرفية أو مصطلحات ركيكة.
- استخدم عناوين ونقاط مرتبة.
- اشرح خطوة بخطوة عند الحاجة.
- قدم أمثلة رقمية واقعية.
- ركز على السوق المغربي والعربي.
- إذا كانت المعلومات ناقصة فاطلب التفاصيل اللازمة.
- لا تخترع أرقاماً أو نتائج غير مؤكدة.

أسلوب الكتابة:

- احترافي
- واضح
- عملي
- منظم
- مباشر
`;

  // الاحتفاظ بآخر 10 رسائل للسياق
  const conversationMessages = messages
    .slice(-10)
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitize(
        typeof m.content === 'string'
          ? m.content
          : JSON.stringify(m.content || ''),
        3000
      )
    }));

  try {

    const groqRes = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',

          messages: [
            {
              role: 'system',
              content: cleanSystem
            },
            ...conversationMessages
          ],

          temperature: 0.5,
          max_tokens: 2000,
          top_p: 0.95
        })
      }
    );

    if (!groqRes.ok) {

      const errorText = await groqRes.text();

      console.error(
        '[HasibPro] Groq failed:',
        groqRes.status,
        errorText
      );

      return res.status(502).json({
        error: 'تعذر الوصول إلى خدمة الذكاء الاصطناعي'
      });
    }

    const data = await groqRes.json();

    const text =
      data?.choices?.[0]?.message?.content ||
      'تعذر إنشاء إجابة حالياً.';

    console.log(
      '[HasibPro] Success: Groq llama-3.3-70b-versatile'
    );

    return res.status(200).json({
      content: [
        {
          type: 'text',
          text
        }
      ]
    });

  } catch (err) {

    console.error(
      '[HasibPro] Groq exception:',
      err.message
    );

    return res.status(502).json({
      error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً'
    });
  }
}
