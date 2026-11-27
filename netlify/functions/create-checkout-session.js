// Netlify Function v2 - Crea una Stripe Checkout Session reale per MinervaAI Pro

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
  const stripePriceId = process.env.STRIPE_PRICE_ID;

  if (!stripeSecret || !stripePriceId) {
    return jsonResponse(
      {
        error:
          'Stripe non è ancora configurato sul server (mancano STRIPE_SECRET_KEY o STRIPE_PRICE_ID su Netlify).',
      },
      503
    );
  }

  const auth = await verifySupabaseUser(req);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status || 401);
  }

  try {
    const profile = await getOrCreateProfile(auth.user);
    const origin =
      process.env.SITE_URL ||
      req.headers.get('origin') ||
      new URL(req.url).origin;

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', stripePriceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${origin}/?checkout=success`);
    params.append('cancel_url', `${origin}/?checkout=canceled`);
    params.append('client_reference_id', auth.user.id);
    params.append('metadata[user_id]', auth.user.id);
    params.append('subscription_data[metadata][user_id]', auth.user.id);
    params.append('allow_promotion_codes', 'true');

    if (profile?.stripe_customer_id) {
      params.append('customer', profile.stripe_customer_id);
    } else if (auth.user.email) {
      params.append('customer_email', auth.user.email);
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: data?.error?.message || 'Errore creazione sessione Stripe.' }, 500);
    }

    return jsonResponse({ url: data.url, sessionId: data.id });
  } catch (err) {
    console.error('Errore create-checkout-session:', err);
    return jsonResponse({ error: err.message || 'Errore interno Stripe Checkout.' }, 500);
  }
};
