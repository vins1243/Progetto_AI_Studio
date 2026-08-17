import OpenAI from 'openai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, history, file } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });

    const systemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Il tuo compito e aiutare lo studente a comprendere concetti, analizzare materiali caricati, creare schemi chiari, sintetizzare appunti e verificare la comprensione con domande mirate.
Rispondi con un tono professionale, chiaro e ben strutturato in formato Markdown.`;

    const messages = [
      { role: 'system', content: systemInstruction }
    ];

    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    if (file && file.base64 && file.mimeType) {
      if (file.mimeType.startsWith('image/')) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'Analizza questa immagine/appunti di studio.' },
            {
              type: 'image_url',
              image_url: {
                url: file.base64.startsWith('data:') ? file.base64 : `data:${file.mimeType};base64,${file.base64}`,
              },
            },
          ],
        });
      } else {
        let fileTextContent = '';
        try {
          const rawBase64 = file.base64.split(',')[1] || file.base64;
          fileTextContent = Buffer.from(rawBase64, 'base64').toString('utf-8');
        } catch (e) {
          fileTextContent = '[File allegato: ' + file.name + ']';
        }

        const combinedPrompt = `${prompt ? prompt + '\n\n' : ''}--- Allegato: ${file.name} ---\n${fileTextContent}`;
        messages.push({
          role: 'user',
          content: combinedPrompt,
        });
      }
    } else {
      messages.push({
        role: 'user',
        content: prompt || '',
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || 'Nessuna risposta generata.';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (error) {
    console.error('Errore backend OpenAI:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione con OpenAI.' }),
    };
  }
};
