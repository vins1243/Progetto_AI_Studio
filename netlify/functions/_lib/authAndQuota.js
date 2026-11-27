// Autenticazione JWT Supabase + Gestione Quote Mensili (Freemium / Pro) lato server

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://qxjamqwbgeysnoipqnih.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_kCmRAz-yQsd4VCDvtmV98g_y5phq6wZ';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const PLAN_LIMITS = {
  free: {
    projects: 1,
    lessons: 3,
    chat: 10,
    maps: 2,
    quizzes: 2,
  },
  pro: {
    projects: 50,
    lessons: 120,
    chat: 600,
    maps: 100,
    quizzes: 100,
  },
};

function currentMonthKey() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
  // Le nuove chiavi sb_secret_ / sb_publishable_ non sono JWT: inviarle solo in `apikey`
  if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export async function getOrCreateProfile(user) {
  const period = currentMonthKey();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    // Fallback degradato se la SERVICE_ROLE_KEY non è ancora configurata su Netlify
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

  // Reset automatico contatori al cambio mese
  if (profile && profile.usage_period !== period) {
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
    usage_period: period,
    usage_chat_count: 0,
    usage_lesson_count: 0,
    usage_quiz_count: 0,
    usage_map_count: 0,
  };
}

export function isUserPro(profile) {
  return Boolean(
    profile &&
    (profile.is_premium === true || profile.subscription_status === 'active')
  );
}

export function getQuotaBucketForAction(action, isLessonGeneration) {
  if (isLessonGeneration || action === 'generate_lesson') return 'lessons';
  if (action === 'generate_concept_map') return 'maps';
  if (action === 'generate_quiz' || action === 'evaluate_open_answer') return 'quizzes';
  if (action === 'transcribe_audio' || action === 'get_usage') return null;
  return 'chat';
}

export function checkQuota(profile, bucket) {
  const pro = isUserPro(profile);
  const limits = pro ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
  const usage = {
    lessons: Number(profile.usage_lesson_count || 0),
    chat: Number(profile.usage_chat_count || 0),
    maps: Number(profile.usage_map_count || 0),
    quizzes: Number(profile.usage_quiz_count || 0),
  };

  if (!bucket) {
    return { allowed: true, pro, limits, usage };
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
    return {
      allowed: false,
      pro,
      limits,
      usage,
      bucket,
      error: pro
        ? `Hai raggiunto il tetto mensile anti-abuso di ${limit} ${labels[bucket]}. Il contatore si azzera il 1° del mese.`
        : `Hai raggiunto il limite del piano Free (${limit} ${labels[bucket]}/mese). Passa a MinervaAI Pro per sbloccare l'accesso completo!`,
    };
  }

  return { allowed: true, pro, limits, usage };
}

export async function incrementUsage(profile, bucket) {
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
