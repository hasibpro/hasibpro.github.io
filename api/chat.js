// api/chat.js — HasibPro AI Assistant (Groq only)

// FIXED_SCOPE_RULES: never overwritten, only merged with the dynamic,
// data-driven system content built client-side in app.html (sendAI()).
// This guarantees the domain-restriction/refusal behavior and language
// rules always apply, regardless of what the front-end sends.
const FIXED_SCOPE_RULES = `أنت المحلل المالي الشخصي داخل HasibPro. لست ChatGPT عاماً ولا مساعداً للمعرفة العامة.

## مهامك المسموح بها فقط:
- تحليل بيانات المستخدم الحقيقية المرفقة (أرباح، تكاليف، مبيعات، تتبع شهري، عائد إعلانات، تسعير)
- تفسير هذه البيانات وتقديم توصيات عملية مبنية عليها فقط

## قاعدة صارمة — مصدر الحقيقة:
بيانات JSON المرفقة (إن وُجدت فـ الرسالة) هي المصدر الوحيد للأرقام. لا تفترض ولا تخترع أي رقم أو معلومة غير موجودة فيها. إذا كانت البيانات المطلوبة للإجابة غير كافية أو فارغة، صرّح بذلك بوضوح للمستخدم بدل تخمين إجابة. معرفتك العامة تُستعمل فقط لتفسير الأرقام الموجودة فعلاً، وليس لتوليد معلومات مستقلة عنها.

## قاعدة صارمة — النطاق:
إذا سأل المستخدم عن أي موضوع خارج تحليل بيانات HasibPro أو التجارة الإلكترونية وإدارة الأرباح (برمجة، طب، تاريخ، رياضة، أخبار، سياسة، طبخ، ترجمة عامة، إلخ)، لا تحاول الإجابة بمعرفتك العامة إطلاقاً. رد فقط بهذه الرسالة بلغة المستخدم:
- بالعربية: "عذراً، أستطيع مساعدتك فقط في تحليل بيانات HasibPro والإجابة عن الأسئلة المتعلقة بمتجرك وأرباحك وإعلاناتك داخل التطبيق."
- بالفرنسية: "Désolé, je peux uniquement vous aider à analyser vos données HasibPro : ventes, profits, coûts et publicités de votre boutique."
- بالإنجليزية: "Sorry, I can only help you analyze your HasibPro data — your store's sales, profits, costs, and ad performance."

## اللغة:
- اكتشف لغة المستخدم تلقائياً من رسالته
- عربية → رد بالعربية الفصحى الاحترافية (أو الدارجة إذا كتب بالدارجة)
- فرنسية → رد بالفرنسية
- إنجليزية → رد بالإنجليزية
- لا تخلط بين اللغات أبداً

## جودة الإجابات:
- ابدأ بالرقم/الاستنتاج المباشر، ثم التفسير، ثم توصية عملية واحدة أو اثنتين قابلة للتنفيذ فوراً
- تجنب الترجمات الحرفية والجمل المكسورة والمقدمات الطويلة غير الضرورية
- استخدم قوائم مرتبة للخطوات والتوصيات عند الحاجة
- تجنب الفقرات الطويلة غير المنظمة`;

function sanitizeSystemData(str, max = 12000) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, max);
}

const store = new Map();

// ===== SERVER-SIDE PRO GATING =====
// The client-side gate (isProUser/gateFeature in app.html) is UX only — a
// technical user could bypass it by editing JS or calling /api/chat directly.
// This is the real enforcement: the AI endpoint (the one that actually costs
// money per call) verifies the caller's plan against Supabase before ever
// touching Groq. URL + anon key are public values (already shipped in the
// client) and can be overridden via Vercel env vars.
const SB_URL = process.env.SUPABASE_URL || 'https://aikfhneieichdkdcrwjs.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpa2ZobmVpZWljaGRrZGNyd2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTYyNjAsImV4cCI6MjA5MzYzMjI2MH0.9qgNjqlVy94zK5JtmzLi9AXWaiJwqh9BRMIxheSP6lI';

// Returns { ok:true } if the bearer-token user is pro or on an active trial,
// else { ok:false, reason:'unauthorized'|'pro_required'|'server' }.
async function verifyPlan(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { ok: false, reason: 'unauthorized' };
  try {
    // 1) Validate the JWT and resolve the user id.
    const uResp = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }
    });
    if (!uResp.ok) return { ok: false, reason: 'unauthorized' };
    const user = await uResp.json();
    const uid = user && user.id;
    if (!uid) return { ok: false, reason: 'unauthorized' };
    // 2) Read the user's plan from their own row (RLS lets them read it).
    const dResp = await fetch(
      `${SB_URL}/rest/v1/user_data?user_id=eq.${uid}&select=plan,trial_ends_at`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } }
    );
    if (!dResp.ok) return { ok: false, reason: 'server' };
    const rows = await dResp.json();
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    // Brand-new authenticated user with no row yet = trial just starting
    // (mirrors the client's checkTrial default).
    if (!row) return { ok: true };
    if (row.plan === 'pro') return { ok: true };
    const trialActive = row.plan === 'trial' && row.trial_ends_at &&
      new Date(row.trial_ends_at) > new Date();
    if (trialActive) return { ok: true };
    return { ok: false, reason: 'pro_required' };
  } catch (e) {
    console.error('[HasibPro] verifyPlan error:', e.message);
    return { ok: false, reason: 'server' };
  }
}

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

  // Server-side Pro enforcement — the real gate for this paid feature.
  const gate = await verifyPlan(req);
  if (!gate.ok) {
    if (gate.reason === 'pro_required') {
      return res.status(403).json({ error: 'المساعد الذكي متاح في خطة Pro — رقّ للاشتراك' });
    }
    if (gate.reason === 'server') {
      return res.status(503).json({ error: 'تعذّر التحقق من الاشتراك — حاول بعد قليل' });
    }
    return res.status(401).json({ error: 'انتهت جلستك — سجّل دخولك من جديد' });
  }

  const { messages, system } = req.body || {};

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

  // Merge the fixed scope/refusal/language rules with the dynamic,
  // structured user-data context sent from app.html's sendAI(). The fixed
  // rules are ALWAYS included first and are never replaced by the
  // front-end payload, so the domain-restriction and source-of-truth
  // behavior cannot be bypassed by whatever the client sends.
  const dynamicContext = sanitizeSystemData(system, 12000);
  const finalSystemContent = dynamicContext
    ? FIXED_SCOPE_RULES + '\n\n---\nبيانات المستخدم الحالية (JSON) — مصدر الحقيقة الوحيد للأرقام:\n' + dynamicContext
    : FIXED_SCOPE_RULES + '\n\n---\nملاحظة: لم تصل أي بيانات من التطبيق مع هذه الرسالة — إذا سُئلت عن أرقام، صرّح أنه لا توجد بيانات متاحة حالياً.';

  const groqMessages = [
    { role: 'system', content: finalSystemContent },
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
