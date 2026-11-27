// Netlify Function v2 - Crea una sessione Stripe Customer Portal per gestire abbonamento e fatture

import { verifySupabaseUser, getOrCreateProfile } from './_lib/authAndQuota.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return jsonResponse({ error: 'STRIPE_SECRET_KEY non configurata su Netlify.' }, 503);
  }

  const auth = await verifySupabaseUser(req);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status || 401);
  }

  try {
    const profile = await getOrCreateProfile(auth.user);
    if (!profile?.stripe_customer_id) {
      return jsonResponse(
        { error: 'Nessun profilo di fatturazione Stripe associato a questo account.' },
        400
      );
    }

    const origin =
      process.env.SITE_URL ||
      req.headers.get('origin') ||
      new URL(req.url).origin;

    const params = new URLSearchParams();
    params.append('customer', profile.stripe_customer_id);
    params.append('return_url', origin);

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: data?.error?.message || 'Errore apertura Customer Portal.' }, 500);
    }

    return jsonResponse({ url: data.url });
  } catch (err) {
    console.error('Errore create-portal-session:', err);
    return jsonResponse({ error: err.message || 'Errore interno Stripe Portal.' }, 500);
  }
};
