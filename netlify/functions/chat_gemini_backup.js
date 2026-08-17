import { GoogleGenAI } from '@google/genai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, history, file } = JSON.parse(event.body);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave GEMINI_API_KEY non configurata su Netlify.' }),
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Il tuo compito e aiutare lo studente a comprendere concetti, analizzare materiali caricati (PDF/testo), creare schemi chiari, sintetizzare appunti e verificare la comprensione con domande mirate.
Rispondi con un tono professionale, chiaro e ben strutturato in formato Markdown.`;

    const contents = [];

    if (history && history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        });
      }
    }

    const currentParts = [];
    if (file && file.base64 && file.mimeType) {
      currentParts.push({
        inlineData: {
          data: file.base64.split(',')[1] || file.base64,
          mimeType: file.mimeType,
        },
      });
    }
    if (prompt && prompt.trim()) {
      currentParts.push({ text: prompt });
    }

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: response.text }),
    };
  } catch (error) {
    console.error('Errore backend:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione.' }),
    };
  }
};
