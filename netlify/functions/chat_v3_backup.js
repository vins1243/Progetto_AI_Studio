import OpenAI from 'openai';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, history, file, files, sourceType, isLessonGeneration, topicTitle } = JSON.parse(event.body);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });

    // Definizione del System Prompt in base alla modalità
    let systemInstruction = '';
    if (isLessonGeneration) {
      if (sourceType === 'my_materials') {
        systemInstruction = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è generare una lezione/riassunto chiaro, approfondito e pedagogico sull'argomento richiesto.
REGOLA FONDAMENTALE E RIGIDA: Devi basarti ESCLUSIVAMENTE ed UNICAMENTE sul testo e sui materiali caricati dall'utente inclusi nel prompt.
Non aggiungere nozioni esterne da internet o informazioni che non siano presenti o deducibili dalle fonti fornite.
Formatta la lezione con titoli in Markdown, concetti chiave in grassetto, elenchi puntati chiari e definizioni precise.`;
      } else {
        systemInstruction = `Sei un docente universitario e tutor accademico di altissimo livello.
Il tuo compito è generare una lezione/riassunto chiaro, rigoroso, approfondito e ben strutturato sull'argomento richiesto, attingendo alle migliori nozioni scientifiche e accademiche.
Formatta la lezione con titoli in Markdown, concetti chiave in grassetto, schemi a punti e definizioni precise.`;
      }
    } else {
      systemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Il tuo compito è aiutare lo studente a comprendere concetti, analizzare materiali caricati, creare schemi chiari, sintetizzare appunti e verificare la comprensione con domande mirate.
Rispondi con un tono professionale, chiaro e ben strutturato in formato Markdown.`;
    }

    const messages = [
      { role: 'system', content: systemInstruction }
    ];

    // Aggiungi cronologia conversazione se presente
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    // Gestione file multipli o file singolo
    const allFiles = files && Array.isArray(files) ? files : (file ? [file] : []);
    const imageParts = [];
    let aggregatedFileText = '';

    for (const f of allFiles) {
      if (f && f.base64 && f.mimeType) {
        if (f.mimeType.startsWith('image/')) {
          imageParts.push({
            type: 'image_url',
            image_url: {
              url: f.base64.startsWith('data:') ? f.base64 : `data:${f.mimeType};base64,${f.base64}`,
            },
          });
        } else {
          try {
            const rawBase64 = f.base64.split(',')[1] || f.base64;
            const decoded = Buffer.from(rawBase64, 'base64').toString('utf-8');
            aggregatedFileText += `\n\n--- INIZIO DOCUMENTO: ${f.name} ---\n${decoded}\n--- FINE DOCUMENTO ---\n`;
          } catch (e) {
            aggregatedFileText += `\n\n[File allegato: ${f.name} (${f.size || ''})]`;
          }
        }
      }
    }

    let finalPromptText = prompt || (isLessonGeneration ? `Genera una lezione approfondita e strutturata sull'argomento: "${topicTitle}".` : '');
    if (aggregatedFileText) {
      finalPromptText += `\n\n--- FONTI E MATERIALI CARICATI DALL'UTENTE ---${aggregatedFileText}`;
    }

    if (imageParts.length > 0) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: finalPromptText },
          ...imageParts,
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: finalPromptText,
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.5,
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
