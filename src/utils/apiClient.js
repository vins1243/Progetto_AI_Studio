// Client API autenticato con JWT Supabase, gestione Streaming SSE e Billing Stripe

import { getAccessToken } from '../supabaseClient.js';
import { getStableDeviceId } from './deviceFingerprint.js';

export class QuotaExceededError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'QuotaExceededError';
    this.code = 'QUOTA_EXCEEDED';
    this.details = details;
  }
}

async function getAuthHeaders() {
  const [token, deviceId] = await Promise.all([
    getAccessToken(),
    getStableDeviceId(),
  ]);
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }
  return headers;
}

export async function callAiApi(payload) {
  const headers = await getAuthHeaders();
  const res = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 402 || data?.code === 'QUOTA_EXCEEDED') {
    throw new QuotaExceededError(
      data.error || 'Hai raggiunto il limite del tuo piano. Passa a Pro per continuare.',
      data
    );
  }

  if (!res.ok) {
    throw new Error(data.error || `Errore server (${res.status}).`);
  }

  return data;
}

export async function streamAiApi(payload, { onChunk, onMeta, onStatus } = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, stream: true }),
  });

  const contentType = res.headers.get('content-type') || '';

  if (res.status === 402) {
    const data = await res.json().catch(() => ({}));
    throw new QuotaExceededError(
      data.error || 'Hai raggiunto il limite del tuo piano. Passa a Pro per continuare.',
      data
    );
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Errore server (${res.status}).`);
  }

  // Fallback se il server ha risposto JSON invece di SSE
  if (!contentType.includes('text/event-stream') || !res.body) {
    const data = await res.json();
    const reply = data.reply || '';
    if (reply && onChunk) onChunk(reply, reply);
    return { reply, modelUsed: data.modelUsed };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let modelUsed = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;

      let evt = null;
      try {
        evt = JSON.parse(jsonStr);
      } catch {
        continue;
      }
      if (evt.type === 'meta') {
        modelUsed = evt.modelUsed || modelUsed;
        if (onMeta) onMeta(evt);
      } else if (evt.type === 'status') {
        if (onStatus) onStatus(evt);
      } else if (evt.type === 'chunk' && evt.text) {
        fullText += evt.text;
        if (onChunk) onChunk(evt.text, fullText);
      } else if (evt.type === 'done') {
        modelUsed = evt.modelUsed || modelUsed;
      } else if (evt.type === 'error') {
        throw new Error(evt.error || 'Errore durante lo streaming AI.');
      }
    }
  }

  return { reply: fullText, modelUsed };
}

export async function fetchUsageQuota() {
  return callAiApi({ action: 'get_usage' });
}

export async function startStripeCheckout(plan = 'pro') {
  const headers = await getAuthHeaders();
  const res = await fetch('/.netlify/functions/create-checkout-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Impossibile avviare Stripe Checkout.');
  }
  window.location.href = data.url;
}

export async function openStripePortal() {
  const headers = await getAuthHeaders();
  const res = await fetch('/.netlify/functions/create-portal-session', {
    method: 'POST',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Impossibile aprire il portale fatturazione Stripe.');
  }
  window.location.href = data.url;
}
