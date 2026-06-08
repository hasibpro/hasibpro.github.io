// api/chat.js — HasibPro AI Assistant
// ✅ FIX #1: JWT Verification عبر Supabase — لا privilege escalation
// ✅ FIX #2: KV failure → memory fallback — لا unlimited requests
// ✅ FIX #3: لا top-level await — lazy KV loader
// ✅ FIX #8: AI context يُتحقق منه — لا manipulation من frontend

// FIX 2: Next.js API Route body size limit — يرفض requests > 32KB قبل الـ handler
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '32kb',
    },
  },
};

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────
// FIX #3 — Lazy KV Loader (لا top-level await)
// ─────────────────────────────────────────────────────────────────
// FIX: Promise singleton — يمنع double import() عند طلبات متزامنة
// الطلب الأول يُطلق import() ويحفظ الـ Promise
// الطلبات التالية تنتظر نفس الـ Promise بدلاً من إطلاق import() جديد
let _kvPromise = null;

async function getKV() {
  if (_kvPromise) return _kvPromise;
  _kvPromise = import('@vercel/kv')
    .then(mod => mod.kv ?? null)
    .catch(() => null);
  return _kvPromise;
}

// ─────────────────────────────────────────────────────────────────
// FIX #2 — Memory fallback limiter (يعمل عندما يفشل KV)
// ─────────────────────────────────────────────────────────────────
const _mem = new Map();

function memLimit(key, limit, windowSec) {
  // FIX #5: cleanup عند كل استدعاء إذا تجاوز الحجم الحد
  cleanMemIfNeeded();

  const now = Date.now();
  const rec = _mem.get(key);
  if (!rec || now - rec.t > windowSec * 1000) {
    _mem.set(key, { n: 1, t: now });
    return true;
  }
  if (rec.n >= limit) return false;
  rec.n++;
  return true;
}

// FIX #4: لا setInterval في Serverless — يُنفَّذ cleanup داخل memLimit نفسها
// Serverless instances تُعاد إنشاؤها — setInterval يبقى حياً بدون ضمان
// الحل: cleanup عند كل استدعاء memLimit إذا تجاوز حجم الـ Map الحد
// FIX #5: Memory bounds مُحسَّن
// - MEM_MAX_SIZE منخفض (500) لأن Serverless instances قصيرة العمر
// - cleanup يحذف المنتهية أولاً (TTL-based) لا الأقدم فقط
// - إذا تجاوز 500 بعد TTL cleanup → نُفرّغ كل شيء (reset)
const MEM_MAX_SIZE = 500;

function cleanMemIfNeeded() {
  if (_mem.size < MEM_MAX_SIZE) return;

  // المرحلة 1: حذف المفاتيح منتهية الـ TTL
  const now = Date.now();
  const TTL_THRESHOLD = 120_000; // 2 دقيقة — أي مفتاح لم يُلمَس منذ 2 دقيقة
  for (const [k, v] of _mem) {
    if (now - v.t > TTL_THRESHOLD) _mem.delete(k);
  }

  // المرحلة 2: إذا لا يزال ممتلئاً → reset كامل (هجوم محتمل)
  if (_mem.size >= MEM_MAX_SIZE) {
    console.warn('[HasibPro] Memory rate limiter reset — possible key rotation attack');
    _mem.clear();
  }
}

// ─────────────────────────────────────────────────────────────────
// Rate Limit — IP level
// Priority: KV → Memory → Deny
// ─────────────────────────────────────────────────────────────────
const IP_LIMIT  = 15;
const IP_WINDOW = 60;

async function ipRateLimit(ip) {
  const key = `rl:ip:${ip}`;
  const kv  = await getKV();

  if (kv) {
    try {
      const count = await kv.incr(key);
      if (count === 1) await kv.expire(key, IP_WINDOW);
      return count <= IP_LIMIT;
    } catch (e) {
      console.warn('[HasibPro] KV IP limit error — falling back to memory:', e.message);
      // FIX #2: فشل KV → memory limiter (لا return true)
      return memLimit(key, IP_LIMIT, IP_WINDOW);
    }
  }

  // لا KV → memory
  return memLimit(key, IP_LIMIT, IP_WINDOW);
}

// ─────────────────────────────────────────────────────────────────
// FIX #1 — JWT Verification عبر Supabase getUser()
// لا نثق بـ JWT payload أبداً — نتحقق من الـ server
// ─────────────────────────────────────────────────────────────────
async function getVerifiedUser(token) {
  if (!token) return null;

  const supabaseUrl = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    // استخدام Supabase REST API مباشرة — لا import حتى لا نزيد dependencies
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Per-User Rate Limit — خطة المستخدم من Supabase (لا من JWT payload)
// ─────────────────────────────────────────────────────────────────
const FREE_DAILY_LIMIT = 20;

async function userRateLimit(token, kv) {
  // لا token → لا حساب (IP limit يكفي)
  if (!token) return { allowed: true, plan: 'anonymous' };

  // FIX #1: verify الـ token أولاً — لا نقرأ plan من JWT
  const user = await getVerifiedUser(token);
  if (!user) {
    // token غير صالح → نعامله كـ free مع IP limit فقط
    return { allowed: true, plan: 'free' };
  }

  const userId = user.id;

  // نقرأ الخطة من Supabase subscriptions — المصدر الوحيد الموثوق
  const supabaseUrl = process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  let plan = 'free';

  if (supabaseUrl && serviceKey) {
    try {
      // FIX #6: query أكثر دقة — active + expires_at لم ينتهِ + أحدث subscription
      // order=created_at.desc يضمن أخذ الـ subscription الأحدث إذا تعدد
      // FIX 1: URLSearchParams يضمن encoding صحيح لـ ISO date
      // ISO date يحتوي ':' و'+' تحتاج encoding في PostgREST queries
      const now = new Date().toISOString();
      const qp = new URLSearchParams({
        'user_id'  : `eq.${userId}`,
        'status'   : 'eq.active',
        'or'       : `(expires_at.is.null,expires_at.gt.${now})`,
        'select'   : 'plan,status,expires_at',
        'order'    : 'created_at.desc',
        'limit'    : '1',
      });
      const subRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?${qp.toString()}`,
        {
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
          signal: AbortSignal.timeout(2000),
        }
      );
      if (subRes.ok) {
        const rows = await subRes.json();
        const sub  = Array.isArray(rows) ? rows[0] : null;
        const PAID_PLANS = new Set(['pro', 'business', 'trial']);
        if (sub?.status === 'active' && PAID_PLANS.has(sub.plan)) {
          plan = sub.plan;
        }
      }
    } catch {
      // فشل قراءة الخطة → نعامله كـ free (آمن)
    }
  }

  // Pro/Business/Trial → unlimited
  if (plan !== 'free') return { allowed: true, plan };

  // Free → daily quota عبر KV أو memory
  const today   = new Date().toISOString().slice(0, 10);
  const userKey = `rl:user:${userId}:${today}`;

  if (kv) {
    try {
      const count = await kv.incr(userKey);
      if (count === 1) await kv.expire(userKey, 86400);
      return {
        allowed: count <= FREE_DAILY_LIMIT,
        plan,
        remaining: Math.max(0, FREE_DAILY_LIMIT - count),
      };
    } catch {
      // KV فشل → memory fallback
      const ok = memLimit(userKey, FREE_DAILY_LIMIT, 86400);
      return { allowed: ok, plan };
    }
  }

  const ok = memLimit(userKey, FREE_DAILY_LIMIT, 86400);
  return { allowed: ok, plan };
}

// ─────────────────────────────────────────────────────────────────
// Sanitize + Prompt Injection Protection
// ─────────────────────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above)\s+instructions/gi,
  /forget\s+(everything|all|previous)/gi,
  /you\s+are\s+now\s+(a|an)/gi,
  /act\s+as\s+(a|an|if)/gi,
  /system\s*:\s*/gi,
  /\[INST\]/gi,
  /<<SYS>>/gi,
  /reveal\s+(prompt|secret|key|instruction)/gi,
  /show\s+(me\s+your|the)\s+(prompt|system|instruction)/gi,
];

function sanitize(str, max = 2000) {
  if (typeof str !== 'string') return '';
  let clean = str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, max);
  for (const p of INJECTION_PATTERNS) clean = clean.replace(p, '[محذوف]');
  return clean;
}

// ─────────────────────────────────────────────────────────────────
// FIX #8 — AI Context Validation
// Context يأتي من frontend — نتحقق منه صارماً
// الأرقام المالية تُقيَّد في نطاق معقول
// ─────────────────────────────────────────────────────────────────
function validateSystemContext(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const clean = sanitize(raw, 1500);
  if (!clean) return null;

  // رفض context يحتوي على أرقام خيالية (> 10 مليون)
  const hugeNumberPattern = /\b\d{8,}\b/;
  if (hugeNumberPattern.test(clean)) {
    console.warn('[HasibPro] Context rejected — contains suspicious large numbers');
    return null;
  }

  return clean;
}

// ─────────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────────
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

## قواعد الهوية:
- أنت مساعد HasibPro الذكي فقط
- لا تذكر اسم أي شركة ذكاء اصطناعي أو نموذج لغوي
- إذا سُئلت "من صنعك؟" أجب: "أنا مساعد HasibPro الذكي، مصمم خصيصاً لمساعدة التجار"

## اللغة:
- عربية → رد بالعربية الفصحى
- دارجة مغربية → رد بالدارجة
- فرنسية → رد بالفرنسية
- إنجليزية → رد بالإنجليزية

## جودة الإجابات:
- استخدم مصطلحات تجارية عربية صحيحة
- ابدأ مباشرة بالإجابة بدون مقدمات
- استخدم قوائم مرتبة للخطوات والتوصيات
- قدّم توصيات قابلة للتنفيذ فوراً`;

// ─────────────────────────────────────────────────────────────────
// Groq Fetch — Timeout + Retry + Exponential Backoff
// ─────────────────────────────────────────────────────────────────
const GROQ_TIMEOUT_MS = 15_000;
const RETRY_DELAYS    = [0, 1000, 3000];

async function fetchGroq(apiKey, payload, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const shouldRetry =
        (response.status === 429 || response.status >= 500) &&
        attempt < RETRY_DELAYS.length - 1;

      if (shouldRetry) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt + 1]));
        return fetchGroq(apiKey, payload, attempt + 1);
      }

      await response.text().catch(() => {});
      if (response.status === 429) throw Object.assign(new Error('rate_limit'), { status: 429 });
      throw Object.assign(new Error('groq_error'), { status: 502 });
    }

    return response;

  } catch (err) {
    clearTimeout(timer);

    const isAbort   = err.name === 'AbortError';
    const isNetwork = err.message === 'fetch failed' || err.code === 'ECONNRESET';

    if ((isAbort || isNetwork) && attempt < RETRY_DELAYS.length - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt + 1]));
      return fetchGroq(apiKey, payload, attempt + 1);
    }

    if (isAbort) throw Object.assign(new Error('timeout'), { status: 504 });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// Handler الرئيسي
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://hasibpro.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // FIX #3: IP Extraction — x-vercel-forwarded-for هو الـ header الموثوق من Vercel
  // x-forwarded-for قابل للـ spoofing من المستخدم — Vercel يُعيّن x-vercel-forwarded-for
  const ip = (
    req.headers['x-vercel-forwarded-for']   // Vercel trusted (لا يمكن تزويره)
    || req.headers['x-real-ip']             // reverse proxy trusted
    || req.socket?.remoteAddress            // direct connection
    || 'unknown'
  ).split(',')[0].trim().slice(0, 45);      // max 45 chars (IPv6 length)

  const ipAllowed = await ipRateLimit(ip);
  if (!ipAllowed) {
    return res.status(429).json({ error: 'كثرت الطلبات — انتظر دقيقة وحاول مجدداً' });
  }

  // Per-User Rate Limit (FIX #1 + #2)
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim() || null;
  const kv    = await getKV();

  const { allowed, plan, remaining } = await userRateLimit(token, kv);
  if (!allowed) {
    return res.status(429).json({
      error: `وصلت للحد اليومي (${FREE_DAILY_LIMIT} رسائل) — اشترك في Pro للاستخدام غير المحدود`,
      upgrade: true,
      remaining: 0,
    });
  }

  // FIX #9: AI Abuse Protection — request size + message count + content size
  const rawBody = req.body || {};

  // Oversized request body (يجب إضافة bodyParser limit في vercel.json أيضاً)
  const bodyStr = JSON.stringify(rawBody);
  if (bodyStr.length > 32_000) { // 32KB max
    return res.status(413).json({ error: 'الطلب كبير جداً' });
  }

  const { messages, system } = rawBody;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'بيانات غير صالحة' });
  }

  // FIX #9: حد أقصى لعدد الرسائل في الطلب (conversation inflation)
  if (messages.length > 30) {
    return res.status(400).json({ error: 'عدد الرسائل تجاوز الحد المسموح' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'خدمة الذكاء الاصطناعي غير متاحة مؤقتاً' });
  }

  // Clean messages
  // FIX #9: per-message size limit + role validation صارم
  const MAX_MSG_LENGTH = 1500; // أقل من sanitize max لتقليل token consumption
  const cleanMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant') // roles صالحة فقط
    .map(m => ({
      role: m.role,
      content: sanitize(
        typeof m.content === 'string'
          ? m.content.slice(0, MAX_MSG_LENGTH)  // قطع مبكر قبل sanitize
          : Array.isArray(m.content)
            ? m.content.map(c => c.text || '').join(' ').slice(0, MAX_MSG_LENGTH)
            : '',
        MAX_MSG_LENGTH
      ),
    }))
    .filter(m => m.content.length > 0)
    .slice(-20); // آخر 20 رسالة فقط

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: 'الرسائل فارغة' });
  }

  // FIX #8: تحقق صارم من system context
  const validatedContext = validateSystemContext(system);
  const fullSystemPrompt = validatedContext
    ? `${SYSTEM_PROMPT}\n\n## بيانات المتجر الحالية (للتحليل فقط — تم التحقق منها):\n${validatedContext}`
    : SYSTEM_PROMPT;

  // FIX #9: token limit يتغير حسب الخطة — Free أقل tokens
  const maxTokens = (plan === 'pro' || plan === 'business') ? 1500 : 800;

  const groqPayload = {
    model      : 'llama-3.3-70b-versatile',
    messages   : [{ role: 'system', content: fullSystemPrompt }, ...cleanMessages],
    max_tokens : maxTokens,
    temperature: 0.65,
    top_p      : 0.9,
  };

  try {
    const startMs  = Date.now();
    const response = await fetchGroq(apiKey, groqPayload);
    const latencyMs = Date.now() - startMs;

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    if (!text) return res.status(502).json({ error: 'لم يصل رد — حاول مرة أخرى' });

    const totalTokens = data.usage?.total_tokens || 0;

    // Analytics — non-blocking
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && serviceKey) {
      fetch(`${supabaseUrl}/rest/v1/ai_usage_logs`, {
        method : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey'      : serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer'      : 'return=minimal',
        },
        body: JSON.stringify({
          ip_hash   : crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16),
          tokens    : totalTokens,
          latency_ms: latencyMs,
          success   : true,
        }),
      }).catch(e => console.warn('[HasibPro] Analytics failed:', e.message));
    }

    console.log(`[HasibPro] OK | plan:${plan} | tokens:${totalTokens} | ${latencyMs}ms`);

    return res.status(200).json({
      content: [{ type: 'text', text }],
      _meta  : { latency: latencyMs, tokens: totalTokens, remaining },
    });

  } catch (err) {
    // Log failed analytics
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && serviceKey) {
      fetch(`${supabaseUrl}/rest/v1/ai_usage_logs`, {
        method : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey'      : serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer'      : 'return=minimal',
        },
        body: JSON.stringify({
          ip_hash   : crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16),
          tokens    : 0,
          latency_ms: 0,
          success   : false,
          error_type: err.message || 'unknown',
        }),
      }).catch(() => {});
    }

    const statusMap = { rate_limit: 429, timeout: 504, groq_error: 502 };
    const msgMap    = {
      rate_limit : 'الخدمة مشغولة — انتظر لحظة وحاول مرة أخرى',
      timeout    : 'استغرق الرد وقتاً طويلاً — حاول مرة أخرى',
      groq_error : 'خطأ في الخدمة الذكية — حاول مرة أخرى',
    };

    return res.status(statusMap[err.message] || err.status || 500).json({
      error: msgMap[err.message] || 'خطأ داخلي — تحقق من الاتصال وحاول مرة أخرى',
    });
  }
}
