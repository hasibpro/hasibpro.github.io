// api/chat.js — HasibPro AI Assistant (Groq only)

const SYSTEM_PROMPT = `أنت مساعد HasibPro الذكي المتخصص حصراً في تحليل بيانات التجارة الإلكترونية.

## مهامك المسموح بها فقط:
- تحليل الأرباح والهوامش
- تحليل التكاليف والمصاريف
- تحليل المبيعات والوحدات
- تفسير التقارير والإحصائيات
- تحليل عائد الإعلانات (ROAS)
- حاسبة التسعير وهوامش الربح
- مقارنة المنتجات من حيث الربحية
- التتبع الشهري للأداء التجاري
- توصيات لتحسين الأداء التجاري

## قاعدة صارمة:
إذا سأل المستخدم عن أي موضوع خارج هذه المهام، رد فقط بهذه الرسالة بلغة المستخدم:
- بالعربية: "أنا مساعد HasibPro المتخصص. أستطيع مساعدتك فقط في تحليل المبيعات والأرباح والتكاليف والتقارير وعائد الإعلانات. كيف يمكنني مساعدتك في مشروعك؟"
- بالفرنسية: "Je suis l'assistant spécialisé HasibPro. Je peux uniquement vous aider à analyser vos ventes, bénéfices, coûts, rapports et retour sur investissement publicitaire. Comment puis-je vous aider ?"
- بالإنجليزية: "I'm the HasibPro specialized assistant. I can only help you analyze sales, profits, costs, reports and advertising ROI. How can I help you with your project?"

## اللغة:
- اكتشف لغة المستخدم تلقائياً من رسالته
- عربية → رد بالعربية الفصحى الاحترافية
- فرنسية → رد بالفرنسية
- إنجليزية → رد بالإنجليزية
- لا تخلط بين اللغات أبداً

## جودة الإجابات:
- استخدم مصطلحات تجارية عربية صحيحة
- تجنب الترجمات الحرفية والجمل المكسورة
- ابدأ مباشرة بالإجابة بدون مقدمات غير ضرورية
- استخدم عناوين واضحة عند الحاجة
- استخدم قوائم مرتبة للخطوات والتوصيات
- قدّم توصيات قابلة للتنفيذ فوراً
- تجنب الفقرات الطويلة غير المنظمة`;

const store = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const rec = store.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { store.set(ip, { n: 1, t: now }); return true; }
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (!rateLimit(ip)) {
    return res.status(429).json({ error: 'كثرت الطلبات — انتظر دقيقة' });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'بيانات غير صالحة' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY غير موجود في Environment Variables' });
  }

  // Clean messages: keep only user/assistant, remove empty
  const cleanMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: sanitize(
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map(c => c.text || '').join(' ')
            : '',
        2000
      )
    }))
    .filter(m => m.content.length > 0);

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: 'الرسائل فارغة' });
  }

  // Build final messages with fixed system prompt
  const groqMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...cleanMessages
  ];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[HasibPro] Groq error:', response.status, errText.slice(0, 200));
      return res.status(502).json({ error: 'خطأ في خدمة الذكاء الاصطناعي — حاول مرة أخرى' });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    console.log('[HasibPro] Groq success — tokens:', data.usage?.total_tokens);

    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (err) {
    console.error('[HasibPro] Handler error:', err.message);
    return res.status(500).json({ error: 'خطأ داخلي — تحقق من الاتصال وحاول مرة أخرى' });
  }
}
