// Netlify Function v2 - Crea una Stripe Checkout Session per i piani Plus (9,99€), Pro (17,99€) o Ultra (29,99€)

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
    return jsonResponse(
      { error: 'STRIPE_SECRET_KEY non configurata su Netlify.' },
      503
    );
  }

  const auth = await verifySupabaseUser(req);
  if (auth.error) {
    return jsonResponse({ error: auth.error }, auth.status || 401);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestedPlan = ['plus', 'pro', 'ultra'].includes(body?.plan) ? body.plan : 'pro';
  const priceMap = {
    plus: process.env.STRIPE_PRICE_ID_PLUS || process.env.STRIPE_PRICE_ID,
    pro: process.env.STRIPE_PRICE_ID_PRO || process.env.STRIPE_PRICE_ID,
    ultra: process.env.STRIPE_PRICE_ID_ULTRA || process.env.STRIPE_PRICE_ID,
  };
  const stripePriceId = priceMap[requestedPlan];

  if (!stripePriceId) {
    return jsonResponse(
      {
        error: `Prezzo Stripe non configurato per il piano ${requestedPlan.toUpperCase()} (imposta STRIPE_PRICE_ID_${requestedPlan.toUpperCase()} su Netlify).`,
      },
      503
    );
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
    params.append('success_url', `${origin}/?checkout=success&plan=${requestedPlan}`);
    params.append('cancel_url', `${origin}/?checkout=canceled`);
    params.append('client_reference_id', auth.user.id);
    params.append('metadata[user_id]', auth.user.id);
    params.append('metadata[plan_tier]', requestedPlan);
    params.append('subscription_data[metadata][user_id]', auth.user.id);
    params.append('subscription_data[metadata][plan_tier]', requestedPlan);
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

    return jsonResponse({ url: data.url, sessionId: data.id, plan: requestedPlan });
  } catch (err) {
    console.error('Errore create-checkout-session:', err);
    return jsonResponse({ error: err.message || 'Errore interno Stripe Checkout.' }, 500);
  }
};
