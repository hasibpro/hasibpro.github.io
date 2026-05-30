// api/chat.js — HasibPro + Groq (Free, Fast, Stable)

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
  const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  const cleanSystem = sanitize(system || '', 5000) || `
أنت HasibPro AI، مستشار خبير في التجارة الإلكترونية، الدروبشيبينغ، التسويق الرقمي وتحليل الأرباح.

قواعد الإجابة:

- أجب دائماً باللغة التي يكتب بها المستخدم.
- إذا كتب المستخدم بالعربية فأجب بالعربية الفصحى الواضحة والسليمة.
- إذا كتب المستخدم بالدارجة المغربية فأجب بدارجة مغربية احترافية وواضحة.
- تجنب الترجمة الحرفية والمصطلحات غير الطبيعية.
- قدم إجابات عملية وقابلة للتطبيق.
- استخدم عناوين ونقاط مرتبة.
- قدم أمثلة رقمية عند الحديث عن الأرباح أو الإعلانات.
- إذا كانت المعطيات ناقصة فاطلب المعلومات اللازمة.
- لا تخترع أرقاماً أو نتائج غير مؤكدة.
- ركز على التجارة الإلكترونية والأسواق العربية والمغربية.

أسلوب الكتابة:
- واضح
- احترافي
- مباشر
- منظم
- سهل الفهم
`;

  const lastMsg = sanitize(
    messages[messages.length - 1]?.content || ''
  );

  // ===== TRY GROQ FIRST =====

  if (groqKey) {
    try {
      const groqRes = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: cleanSystem
              },
              {
                role: 'user',
                content: lastMsg
              }
            ],
            max_tokens: 2000,
            temperature: 0.5
          })
        }
      );

      if (groqRes.ok) {
        const data = await groqRes.json();

        const text =
          data.choices?.[0]?.message?.content ||
          'لم أتمكن من إنشاء إجابة حالياً.';

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
      }

      console.error(
        '[HasibPro] Groq failed:',
        groqRes.status
      );
    } catch (err) {
      console.error(
        '[HasibPro] Groq exception:',
        err.message
      );
    }
  }

  // ===== GEMINI FALLBACK =====

  if (geminiKey) {
    const models = [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash'
    ];

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: cleanSystem + '\n\n' + lastMsg
          }
        ]
      }
    ];

    for (const model of models) {
      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        const gRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              maxOutputTokens: 2000,
              temperature: 0.5
            }
          })
        });

        if (gRes.ok) {
          const data = await gRes.json();

          const text =
            data.candidates?.[0]?.content?.parts?.[0]?.text ||
            '';

          console.log(
            `[HasibPro] Success: Gemini ${model}`
          );

          return res.status(200).json({
            content: [
              {
                type: 'text',
                text
              }
            ]
          });
        }

        console.error(
          `[HasibPro] Gemini ${model} failed:`,
          gRes.status
        );
      } catch (err) {
        console.error(
          `[HasibPro] Gemini ${model} exception:`,
          err.message
        );
      }
    }
  }

  return res.status(502).json({
    error:
      'خدمة الذكاء الاصطناعي غير متاحة حالياً — حاول مرة أخرى لاحقاً'
  });
}
