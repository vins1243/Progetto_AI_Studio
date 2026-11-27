// Autenticazione JWT Supabase + Gestione 4 Piani (Free / Plus / Pro / Ultra) + Anti-Multi-Account per dispositivo

import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://qxjamqwbgeysnoipqnih.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_kCmRAz-yQsd4VCDvtmV98g_y5phq6wZ';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const PLAN_LIMITS = {
  free: {
    label: 'Free',
    price: 0,
    projects: 1,
    lessons: 2,
    chat: 10,
    maps: 2,
    quizzes: 1,
  },
  plus: {
    label: 'Plus',
    price: 9.99,
    projects: 5,
    lessons: 25,
    chat: 150,
    maps: 25,
    quizzes: 25,
  },
  pro: {
    label: 'Pro',
    price: 17.99,
    projects: 25,
    lessons: 90,
    chat: 500,
    maps: 80,
    quizzes: 80,
  },
  ultra: {
    label: 'Ultra',
    price: 29.99,
    projects: 100,
    lessons: 250,
    chat: 1500,
    maps: 250,
    quizzes: 250,
  },
};

function currentMonthKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getDeviceHash(req) {
  const clientDeviceId = (req.headers.get('x-device-id') || '').trim();
  const clientIp =
    (req.headers.get('x-nf-client-connection-ip') ||
      req.headers.get('x-forwarded-for') ||
      '').split(',')[0].trim();
  const ua = (req.headers.get('user-agent') || '').slice(0, 120);
  const raw = clientDeviceId ? `dev:${clientDeviceId}` : `ip:${clientIp}|ua:${ua}`;
  if (!raw || raw === 'ip:|ua:') return null;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function verifySupabaseUser(req) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return { error: 'Autenticazione richiesta. Effettua il login per continuare.', status: 401 };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!res.ok) {
      return { error: 'Sessione scaduta o non valida. Effettua nuovamente il login.', status: 401 };
    }

    const user = await res.json();
    if (!user?.id) {
      return { error: 'Utente non riconosciuto.', status: 401 };
    }

    return { user, token };
  } catch (err) {
    console.error('Errore verifica JWT Supabase:', err);
    return { error: 'Impossibile verificare la sessione utente.', status: 500 };
  }
}

function getServiceHeaders() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
  };
  if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export async function getOrCreateProfile(user) {
  const period = currentMonthKey();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return {
      id: user.id,
      email: user.email,
      subscription_status: 'free',
      is_premium: false,
      plan_type: 'free',
      usage_period: period,
      usage_chat_count: 0,
      usage_lesson_count: 0,
      usage_quiz_count: 0,
      usage_map_count: 0,
      _serviceRoleMissing: true,
    };
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=*`,
    { headers: getServiceHeaders() }
  );

  let profile = null;
  if (res.ok) {
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) {
      profile = rows[0];
    }
  }

  if (!profile) {
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || '',
        usage_period: period,
      }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      profile = Array.isArray(created) ? created[0] : created;
    }
  }

  // Reset automatico contatori mensili SOLO per i piani a pagamento (il piano Free è una tantum anti-abuso!)
  const tier = getUserPlanTier(profile);
  if (profile && tier !== 'free' && profile.usage_period !== period) {
    const resetRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify({
          usage_period: period,
          usage_chat_count: 0,
          usage_lesson_count: 0,
          usage_quiz_count: 0,
          usage_map_count: 0,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (resetRes.ok) {
      const updated = await resetRes.json();
      profile = Array.isArray(updated) ? updated[0] : profile;
    }
  }

  return profile || {
    id: user.id,
    email: user.email,
    subscription_status: 'free',
    is_premium: false,
    plan_type: 'free',
    usage_period: period,
    usage_chat_count: 0,
    usage_lesson_count: 0,
    usage_quiz_count: 0,
    usage_map_count: 0,
  };
}

export async function getOrCreateDeviceFreeUsage(deviceHash, userId) {
  if (!deviceHash || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/device_free_usage?device_hash=eq.${encodeURIComponent(deviceHash)}&select=*`,
      { headers: getServiceHeaders() }
    );
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) return rows[0];
    }
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/device_free_usage`, {
      method: 'POST',
      headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify({
        device_hash: deviceHash,
        first_user_id: userId || null,
      }),
    });
    if (createRes.ok) {
      const created = await createRes.json();
      return Array.isArray(created) ? created[0] : created;
    }
  } catch (err) {
    console.warn('Errore lettura device_free_usage:', err.message);
  }
  return null;
}

export function getUserPlanTier(profile) {
  if (!profile) return 'free';
  const active = profile.is_premium === true || profile.subscription_status === 'active';
  if (!active) return 'free';
  const pt = String(profile.plan_type || '').toLowerCase();
  if (pt.includes('ultra')) return 'ultra';
  if (pt.includes('plus')) return 'plus';
  return 'pro';
}

export function isUserPro(profile) {
  return getUserPlanTier(profile) !== 'free';
}

export function getQuotaBucketForAction(action, isLessonGeneration) {
  if (
    isLessonGeneration ||
    action === 'generate_lesson' ||
    action === 'lesson_plan' ||
    action === 'lesson_draft' ||
    action === 'lesson_synthesize'
  ) {
    return 'lessons';
  }
  if (action === 'generate_concept_map') return 'maps';
  if (action === 'generate_quiz' || action === 'evaluate_open_answer') return 'quizzes';
  if (action === 'transcribe_audio' || action === 'get_usage') return null;
  return 'chat';
}

export function checkQuota(profile, bucket, deviceUsage = null) {
  const tier = getUserPlanTier(profile);
  const pro = tier !== 'free';
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;

  // Per gli utenti Free prende il MASSIMO tra l'uso dell'account e l'uso del dispositivo (anti-multi-account!)
  const usage = {
    lessons: Math.max(
      Number(profile?.usage_lesson_count || 0),
      !pro && deviceUsage ? Number(deviceUsage.usage_lesson_count || 0) : 0
    ),
    chat: Math.max(
      Number(profile?.usage_chat_count || 0),
      !pro && deviceUsage ? Number(deviceUsage.usage_chat_count || 0) : 0
    ),
    maps: Math.max(
      Number(profile?.usage_map_count || 0),
      !pro && deviceUsage ? Number(deviceUsage.usage_map_count || 0) : 0
    ),
    quizzes: Math.max(
      Number(profile?.usage_quiz_count || 0),
      !pro && deviceUsage ? Number(deviceUsage.usage_quiz_count || 0) : 0
    ),
  };

  // Modalità test: blocco quote disattivato di default.
  // Per riattivarlo al lancio commerciale, imposta ENFORCE_QUOTAS=true su Netlify.
  const enforceQuotas = process.env.ENFORCE_QUOTAS === 'true';
  if (!enforceQuotas || !bucket) {
    return { allowed: true, pro, tier, limits, usage };
  }

  const current = usage[bucket] || 0;
  const limit = limits[bucket] || 0;

  if (current >= limit) {
    const labels = {
      lessons: 'lezioni generate',
      chat: 'messaggi AI',
      maps: 'mappe concettuali',
      quizzes: 'verifiche/quiz',
    };
    const isDeviceLimit = !pro && deviceUsage && Number(deviceUsage[`usage_${bucket === 'lessons' ? 'lesson' : bucket === 'maps' ? 'map' : bucket === 'quizzes' ? 'quiz' : 'chat'}_count`] || 0) >= limit;
    return {
      allowed: false,
      pro,
      tier,
      limits,
      usage,
      bucket,
      error: pro
        ? `Hai raggiunto il limite mensile del piano ${limits.label} (${limit} ${labels[bucket]}). Passa a un piano superiore o attendi il rinnovo.`
        : isDeviceLimit
          ? `Questo dispositivo ha già esaurito la prova gratuita (${limit} ${labels[bucket]}). Scegli un piano Plus, Pro o Ultra per continuare!`
          : `Hai raggiunto il limite del piano Free (${limit} ${labels[bucket]}). Passa a Plus, Pro o Ultra per sbloccare MinervaAI!`,
    };
  }

  return { allowed: true, pro, tier, limits, usage };
}

export async function incrementUsage(profile, bucket, deviceUsage = null) {
  if (!bucket || !SUPABASE_SERVICE_ROLE_KEY || !profile?.id) return;

  const colMap = {
    lessons: 'usage_lesson_count',
    chat: 'usage_chat_count',
    maps: 'usage_map_count',
    quizzes: 'usage_quiz_count',
  };
  const col = colMap[bucket];
  if (!col) return;

  const nextVal = Number(profile[col] || 0) + 1;
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
      {
        method: 'PATCH',
        headers: getServiceHeaders(),
        body: JSON.stringify({
          [col]: nextVal,
          usage_period: currentMonthKey(),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    // Se l'utente è Free, incrementa anche il contatore legato al dispositivo fisico (anti-multi-account)
    if (getUserPlanTier(profile) === 'free' && deviceUsage?.device_hash) {
      const nextDevVal = Number(deviceUsage[col] || 0) + 1;
      await fetch(
        `${SUPABASE_URL}/rest/v1/device_free_usage?device_hash=eq.${encodeURIComponent(deviceUsage.device_hash)}`,
        {
          method: 'PATCH',
          headers: getServiceHeaders(),
          body: JSON.stringify({
            [col]: nextDevVal,
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }
  } catch (err) {
    console.warn('Errore aggiornamento contatore uso:', err);
  }
}

export async function updateProfileByServiceRole(filterQuery, updates) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY non configurata su Netlify.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${filterQuery}`, {
    method: 'PATCH',
    headers: { ...getServiceHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      ...updates,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update error (${res.status}): ${text}`);
  }
  return res.json();
}
