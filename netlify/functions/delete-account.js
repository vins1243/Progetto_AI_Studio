// Netlify Function v2 - Eliminazione definitiva account e dati utente (Art. 17 GDPR - Diritto all'Oblio)
// Verifica JWT Supabase, disdice eventuale abbonamento Stripe attivo ed elimina tutti i dati personali.

import { verifySupabaseUser, getOrCreateProfile } from './_lib/authAndQuota.js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://qxjamqwbgeysnoipqnih.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getServiceHeaders() {
  const key = SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
  };
  if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const user = await verifySupabaseUser(req);
  if (!user) {
    return jsonResponse({ error: 'Devi essere autenticato per eliminare il tuo account.' }, 401);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: 'Configurazione server incompleta (SUPABASE_SERVICE_ROLE_KEY mancante). Contatta il supporto.' },
      500
    );
  }

  try {
    // 1. Se esiste un abbonamento Stripe attivo, lo disdice subito per evitare addebiti futuri
    const profile = await getOrCreateProfile(user);
    if (STRIPE_SECRET_KEY && profile?.stripe_subscription_id) {
      try {
        await fetch(
          `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(profile.stripe_subscription_id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
          }
        );
      } catch (stripeErr) {
        console.warn('Disdetta Stripe durante eliminazione account:', stripeErr.message);
      }
    }

    const headers = getServiceHeaders();
    const uid = encodeURIComponent(user.id);

    // 2. Elimina progetti, conversazioni, link condivisi e profilo
    await Promise.allSettled([
      fetch(`${SUPABASE_URL}/rest/v1/projects?user_id=eq.${uid}`, { method: 'DELETE', headers }),
      fetch(`${SUPABASE_URL}/rest/v1/conversations?user_id=eq.${uid}`, { method: 'DELETE', headers }),
      fetch(`${SUPABASE_URL}/rest/v1/shared_items?user_id=eq.${uid}`, { method: 'DELETE', headers }),
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, { method: 'DELETE', headers }),
    ]);

    // 3. Elimina l'utente da Supabase Auth (Admin API)
    const authDelRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!authDelRes.ok) {
      const errTxt = await authDelRes.text().catch(() => '');
      console.warn('Supabase Auth delete response:', authDelRes.status, errTxt.slice(0, 200));
    }

    return jsonResponse({ deleted: true });
  } catch (err) {
    console.error('Errore eliminazione account:', err);
    return jsonResponse({ error: err.message || 'Errore durante la cancellazione dell account.' }, 500);
  }
};
