// Fingerprinting stabile del dispositivo (anti-multi-account per il piano Free)

let cachedDeviceId = null;

async function sha256Hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministico
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `fb_${Math.abs(hash).toString(16)}`;
}

function getCanvasSignature() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#be123c';
    ctx.fillRect(4, 4, 60, 20);
    ctx.fillStyle = '#0f172a';
    ctx.fillText('MinervaAI-FP-v1', 8, 10);
    return canvas.toDataURL().slice(-64);
  } catch {
    return '';
  }
}

export async function getStableDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  if (typeof window === 'undefined') return 'server';

  const signals = [
    navigator.platform || '',
    navigator.language || '',
    String(navigator.hardwareConcurrency || ''),
    String(navigator.deviceMemory || ''),
    `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    getCanvasSignature(),
  ].join('|');

  const hardwareHash = await sha256Hex(signals);

  // Combina con un token persistito in localStorage (così anche su hardware identici resta legato al browser)
  try {
    const stored = localStorage.getItem('minerva_dev_fp');
    if (stored && stored.length >= 16) {
      cachedDeviceId = stored;
      return cachedDeviceId;
    }
    localStorage.setItem('minerva_dev_fp', hardwareHash);
  } catch {
    // ignore storage restrictions
  }

  cachedDeviceId = hardwareHash;
  return cachedDeviceId;
}
