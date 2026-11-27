// Netlify Function v2 - Stripe Webhook con verifica firma HMAC-SHA256 e aggiornamento Supabase sicuro

import crypto from 'node:crypto';
import { updateProfileByServiceRole } from './_lib/authAndQuota.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    if (k && v) {
      if (!acc[k]) acc[k] = [];
      acc[k].push(v);
    }
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  // Tolleranza anti-replay: 5 minuti
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  return signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig, 'hex');
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

export default async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonResponse({ error: 'STRIPE_WEBHOOK_SECRET non configurata.' }, 500);
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  if (!verifyStripeSignature(rawBody, sigHeader, webhookSecret)) {
    return jsonResponse({ error: 'Firma Stripe non valida.' }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Payload webhook non valido.' }, 400);
  }

  try {
    const obj = event.data?.object || {};

    if (event.type === 'checkout.session.completed') {
      const userId = obj.client_reference_id || obj.metadata?.user_id;
      if (userId) {
        await updateProfileByServiceRole(`id=eq.${encodeURIComponent(userId)}`, {
          subscription_status: 'active',
          is_premium: true,
          plan_type: 'pro_monthly_14.99',
          stripe_customer_id: obj.customer || null,
          stripe_subscription_id: obj.subscription || null,
        });
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const status = obj.status; // 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
      const isActive = status === 'active' || status === 'trialing';
      const userId = obj.metadata?.user_id;
      const customerId = obj.customer;
      const periodEnd = obj.current_period_end
        ? new Date(obj.current_period_end * 1000).toISOString()
        : null;

      const filter = userId
        ? `id=eq.${encodeURIComponent(userId)}`
        : customerId
          ? `stripe_customer_id=eq.${encodeURIComponent(customerId)}`
          : null;

      if (filter) {
        await updateProfileByServiceRole(filter, {
          subscription_status: isActive ? 'active' : status || 'canceled',
          is_premium: isActive,
          plan_type: isActive ? 'pro_monthly_14.99' : 'free',
          stripe_subscription_id: obj.id || null,
          current_period_end: periodEnd,
        });
      }
    } else if (event.type === 'invoice.payment_failed') {
      const customerId = obj.customer;
      if (customerId) {
        await updateProfileByServiceRole(`stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
          subscription_status: 'past_due',
          is_premium: false,
        });
      }
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error('Errore elaborazione Stripe webhook:', err);
    return jsonResponse({ error: err.message || 'Errore webhook.' }, 500);
  }
};
