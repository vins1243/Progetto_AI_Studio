// Motore AI Multi-Modello: Gemini (Flash per task leggeri, Pro per task pesanti) con fallback OpenAI
// + Chunking intelligente per argomento su documenti lunghi

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export const MODEL_TIERS = {
  // Task leggeri/veloci: chat, riscritture, mappe concettuali, syllabus, trascrizione audio
  light: {
    gemini: ['gemini-2.5-flash', 'gemini-2.0-flash'],
    openai: ['gpt-4o-mini', 'gpt-4o'],
  },
  // Task pesanti/complessi: compendi accademici approfonditi, quiz estesi, valutazioni in trentesimi
  heavy: {
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    openai: ['gpt-4o', 'gpt-4o-mini'],
  },
};

// -------------------------------------------------------------
// CHUNKING INTELLIGENTE PER ARGOMENTO (SELEZIONE PARAGRAFI RILEVANTI)
// -------------------------------------------------------------
const ITALIAN_STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'che', 'chi', 'cui', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'dal', 'dallo', 'dalla', 'nel', 'nello', 'nella', 'sul', 'sullo', 'sulla', 'e', 'ed', 'o', 'od', 'ma', 'se', 'non',
  'piu', 'meno', 'come', 'sono', 'essere', 'avere', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella',
  'anche', 'solo', 'tutto', 'tutti', 'tutte', 'molto', 'parte', 'giorno', 'lezione', 'argomento', 'studio', 'esame'
]);

function tokenizeQuery(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !ITALIAN_STOPWORDS.has(w));
}

export function extractRelevantChunks(files, queryText, maxTotalChars = 42000) {
  if (!Array.isArray(files) || files.length === 0) return '';

  const keywords = tokenizeQuery(queryText);
  const allChunks = [];

  files.forEach((f, fileIdx) => {
    const fileName = f.name || `Documento ${fileIdx + 1}`;
    const raw = (f.text || f.extractedText || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return;

    // Se il documento è breve, includilo intero
    if (raw.length <= 6000) {
      allChunks.push({
        fileName,
        index: 0,
        text: raw,
        score: 100,
      });
      return;
    }

    const CHUNK_SIZE = 2200;
    const OVERLAP = 250;
    let pos = 0;
    let chunkIdx = 0;

    while (pos < raw.length) {
      const slice = raw.slice(pos, pos + CHUNK_SIZE).trim();
      if (slice.length > 40) {
        let score = chunkIdx === 0 ? 3 : 1; // Piccolo bonus per l'introduzione/indice
        if (keywords.length > 0) {
          const lower = slice.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          for (const kw of keywords) {
            if (lower.includes(kw)) {
              score += 5;
              // Bonus se compare più volte
              const matches = lower.split(kw).length - 1;
              score += Math.min(matches, 4);
            }
          }
        }
        allChunks.push({
          fileName,
          index: chunkIdx,
          text: slice,
          score,
        });
      }
      pos += CHUNK_SIZE - OVERLAP;
      chunkIdx++;
    }
  });

  if (allChunks.length === 0) return '';

  // Ordina per rilevanza, seleziona fino al budget, poi riordina per file/posizione naturale
  const sortedByScore = [...allChunks].sort((a, b) => b.score - a.score);
  const selected = [];
  let usedChars = 0;

  for (const ch of sortedByScore) {
    if (usedChars + ch.text.length + 120 > maxTotalChars) {
      if (selected.length === 0) {
        selected.push({ ...ch, text: ch.text.slice(0, maxTotalChars - 120) });
      }
      break;
    }
    selected.push(ch);
    usedChars += ch.text.length + 120;
  }

  selected.sort((a, b) => {
    if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName);
    return a.index - b.index;
  });

  const grouped = new Map();
  for (const ch of selected) {
    if (!grouped.has(ch.fileName)) grouped.set(ch.fileName, []);
    grouped.get(ch.fileName).push(ch.text);
  }

  let output = '';
  for (const [fileName, parts] of grouped.entries()) {
    output += `\n\n=== DOCUMENTO: "${fileName}" ===\n${parts.join('\n[...]\n')}\n=== FINE DOCUMENTO ===\n`;
  }
  return output;
}

export function createSmartFileDigest(rawText, maxChars) {
  if (!rawText) return '';
  const clean = rawText.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const headBudget = Math.floor(maxChars * 0.55);
  const midBudget = Math.floor(maxChars * 0.25);
  const tailBudget = Math.floor(maxChars * 0.2);
  const midStart = Math.floor((clean.length - midBudget) / 2);
  return `${clean.slice(0, headBudget)}\n[...]\n${clean.slice(midStart, midStart + midBudget)}\n[...]\n${clean.slice(-tailBudget)}`;
}

// -------------------------------------------------------------
// CONVERSIONE MESSAGGI -> FORMATO GEMINI
// -------------------------------------------------------------
function buildGeminiBody({
  model = '',
  systemPrompt,
  messages,
  temperature = 0.3,
  maxOutputTokens = 8192,
  jsonMode = false,
}) {
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
    const parts = [];

    if (Array.isArray(msg.parts)) {
      parts.push(...msg.parts);
    } else if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          const url = item.image_url.url;
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const generationConfig = {
    temperature,
    maxOutputTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  // Gestione thinkingBudget su Gemini 2.5 per evitare troncamenti JSON o lezioni brevi
  if (model.includes('gemini-2.5-flash')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else if (model.includes('gemini-2.5-pro')) {
    generationConfig.thinkingConfig = { thinkingBudget: 1024 };
  }

  const body = {
    contents,
    generationConfig,
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  return body;
}

// -------------------------------------------------------------
// CHIAMATA STANDARD (NON-STREAMING) CON ROUTING GEMINI + FALLBACK OPENAI
// -------------------------------------------------------------
export async function generateAI({
  tier = 'light',
  systemPrompt,
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const tierConfig = MODEL_TIERS[tier] || MODEL_TIERS.light;

  let lastError = null;

  // 1. Tentativo primario con Google Gemini (Flash o Pro in base al tier)
  if (geminiKey) {
    for (const model of tierConfig.gemini) {
      try {
        const body = buildGeminiBody({
          model,
          systemPrompt,
          messages,
          temperature,
          maxOutputTokens: maxTokens,
          jsonMode,
        });
        const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('')
          .trim();

        if (!text) {
          throw new Error(`Gemini ${model} risposta vuota.`);
        }

        return { text, modelUsed: model, provider: 'gemini' };
      } catch (err) {
        console.warn(`Tentativo Gemini (${model}) fallito:`, err.message);
        lastError = err;
      }
    }
  }

  // 2. Fallback automatico su OpenAI se configurato
  if (openaiKey) {
    const openaiMessages = [];
    if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      openaiMessages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content || (Array.isArray(m.parts) ? m.parts.map((p) => p.text || '').join('\n') : ''),
      });
    }

    for (const model of tierConfig.openai) {
      try {
        const payload = {
          model,
          messages: openaiMessages,
          temperature,
          max_tokens: maxTokens,
        };
        if (jsonMode) payload.response_format = { type: 'json_object' };

        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`OpenAI ${model} HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error(`OpenAI ${model} risposta vuota.`);

        return { text, modelUsed: model, provider: 'openai' };
      } catch (err) {
        console.warn(`Tentativo OpenAI (${model}) fallito:`, err.message);
        lastError = err;
      }
    }
  }

  throw lastError || new Error('Nessuna chiave API configurata (imposta GEMINI_API_KEY o OPENAI_API_KEY su Netlify).');
}

// -------------------------------------------------------------
// STREAMING SSE (NETLIFY FUNCTIONS V2) CON GEMINI + FALLBACK OPENAI
// -------------------------------------------------------------
export async function streamAIResponse({
  tier = 'light',
  systemPrompt,
  messages,
  temperature = 0.3,
  maxTokens = 6144,
  onComplete,
}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const tierConfig = MODEL_TIERS[tier] || MODEL_TIERS.light;

  const encoder = new TextEncoder();

  // Prova a connettere lo stream upstream prima di restituire la Response SSE
  let upstreamRes = null;
  let provider = null;
  let modelUsed = null;
  let lastError = null;

  if (geminiKey) {
    for (const model of tierConfig.gemini) {
      try {
        const body = buildGeminiBody({
          model,
          systemPrompt,
          messages,
          temperature,
          maxOutputTokens: maxTokens,
          jsonMode: false,
        });
        const res = await fetch(
          `${GEMINI_BASE_URL}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
        if (res.ok && res.body) {
          upstreamRes = res;
          provider = 'gemini';
          modelUsed = model;
          break;
        }
        const errText = await res.text();
        lastError = new Error(`Gemini stream ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`);
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!upstreamRes && openaiKey) {
    const openaiMessages = [];
    if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      openaiMessages.push({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content || '',
      });
    }

    for (const model of tierConfig.openai) {
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: openaiMessages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          }),
        });
        if (res.ok && res.body) {
          upstreamRes = res;
          provider = 'openai';
          modelUsed = model;
          break;
        }
        const errText = await res.text();
        lastError = new Error(`OpenAI stream ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`);
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (!upstreamRes) {
    throw lastError || new Error('Impossibile avviare lo streaming AI. Verifica GEMINI_API_KEY o OPENAI_API_KEY.');
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (payload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      sendEvent({ type: 'meta', modelUsed, provider });

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
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
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              let delta = '';
              if (provider === 'gemini') {
                delta = parsed?.candidates?.[0]?.content?.parts
                  ?.map((p) => p.text || '')
                  .join('') || '';
              } else {
                delta = parsed?.choices?.[0]?.delta?.content || '';
              }
              if (delta) {
                sendEvent({ type: 'chunk', text: delta });
              }
            } catch {
              // Ignora chunk JSON parziali
            }
          }
        }

        if (typeof onComplete === 'function') {
          await onComplete();
        }
        sendEvent({ type: 'done', modelUsed, provider });
      } catch (err) {
        sendEvent({ type: 'error', error: err.message || 'Errore durante lo streaming.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// -------------------------------------------------------------
// TRASCRIZIONE AUDIO MULTIMODALE (GEMINI FLASH -> FALLBACK WHISPER)
// -------------------------------------------------------------
export async function transcribeAudio({ audioBase64, audioMimeType }) {
  const rawBase64 = audioBase64.includes('base64,') ? audioBase64.split('base64,')[1] : audioBase64;
  const mime = (audioMimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    for (const model of MODEL_TIERS.light.gemini) {
      try {
        const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: 'Trascrivi fedelmente in italiano questo audio vocale dello studente. Restituisci SOLO il testo trascritto, con punteggiatura corretta, senza commenti o prefissi.',
                  },
                  {
                    inlineData: {
                      mimeType: mime,
                      data: rawBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0.1 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
          if (text) return { text, modelUsed: model };
        }
      } catch (err) {
        console.warn(`Trascrizione Gemini (${model}) fallita:`, err.message);
      }
    }
  }

  if (openaiKey) {
    const ext = mime.includes('mp4') || mime.includes('m4a')
      ? 'mp4'
      : mime.includes('mpeg') || mime.includes('mp3')
        ? 'mp3'
        : mime.includes('ogg')
          ? 'ogg'
          : mime.includes('wav')
            ? 'wav'
            : 'webm';
    const buffer = Buffer.from(rawBase64, 'base64');
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mime }), `audio.${ext}`);
    formData.append('model', 'whisper-1');
    formData.append('language', 'it');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Whisper HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return { text: data.text || '', modelUsed: 'whisper-1' };
  }

  throw new Error('Nessuna chiave API configurata per la trascrizione vocale.');
}
