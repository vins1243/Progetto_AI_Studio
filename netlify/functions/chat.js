import OpenAI from 'openai';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import AdmZip from 'adm-zip';

// Estrae il testo pulito da file PowerPoint (.pptx)
function extractPptxText(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    let fullText = '';
    const slideEntries = zipEntries.filter(e => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'));
    
    slideEntries.sort((a, b) => {
      const numA = parseInt(a.entryName.match(/\d+/) || '0');
      const numB = parseInt(b.entryName.match(/\d+/) || '0');
      return numA - numB;
    });

    slideEntries.forEach((entry, idx) => {
      const xml = entry.getData().toString('utf8');
      const matches = xml.match(/<a:t[^>]*>(.*?)<\/a:t>/g);
      if (matches) {
        const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
        fullText += `\n[Slide ${idx + 1}]: ${slideText}`;
      }
    });
    return fullText;
  } catch (e) {
    console.error('Errore estrazione PPTX:', e);
    return '';
  }
}

// Estrazione universale del testo dai file caricati
async function extractDocumentText(fileObj) {
  if (!fileObj || !fileObj.base64) return { text: '', isImage: false };
  
  const mime = (fileObj.mimeType || '').toLowerCase();
  const name = (fileObj.name || '').toLowerCase();
  const rawBase64 = fileObj.base64.split(',')[1] || fileObj.base64;
  const buffer = Buffer.from(rawBase64, 'base64');

  if (mime.startsWith('image/')) {
    return { text: '', isImage: true, base64: fileObj.base64, mime: fileObj.mimeType };
  }

  // 1. File PDF
  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    try {
      const pdfData = await pdfParse(buffer);
      const clean = (pdfData.text || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
      return { text: clean, isImage: false };
    } catch (err) {
      console.error(`Errore parsing PDF ${fileObj.name}:`, err);
      return { text: `[Documento PDF: ${fileObj.name} - Estrazione parziale]`, isImage: false };
    }
  }

  // 2. File Word (.docx)
  if (mime.includes('word') || mime.includes('document') || name.endsWith('.docx')) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || '', isImage: false };
    } catch (err) {
      console.error(`Errore parsing DOCX ${fileObj.name}:`, err);
      return { text: `[Documento Word: ${fileObj.name}]`, isImage: false };
    }
  }

  // 3. File PowerPoint (.pptx)
  if (mime.includes('presentation') || mime.includes('powerpoint') || name.endsWith('.pptx')) {
    const pptxText = extractPptxText(buffer);
    return { text: pptxText, isImage: false };
  }

  // 4. File di testo semplice / Markdown / CSV
  try {
    const txt = buffer.toString('utf-8');
    return { text: txt, isImage: false };
  } catch (err) {
    return { text: `[File allegato: ${fileObj.name}]`, isImage: false };
  }
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body);
    const { 
      action,
      prompt, 
      history, 
      file, 
      files, 
      sourceType, 
      isLessonGeneration, 
      topicTitle,
      examDescription,
      daysTotal,
      prepLevel,
      languageStyle
    } = payload;

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Chiave OPENAI_API_KEY non configurata su Netlify.' }),
      };
    }

    const openai = new OpenAI({ apiKey });

    // Estrazione effettiva del testo da tutti i documenti (PDF, DOCX, PPTX, TXT, Immagini)
    const allFiles = files && Array.isArray(files) ? files : (file ? [file] : []);
    const imageParts = [];
    let fullExtractedCorpus = '';

    for (const f of allFiles) {
      const extracted = await extractDocumentText(f);
      if (extracted.isImage) {
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: extracted.base64.startsWith('data:') ? extracted.base64 : `data:${extracted.mime || 'image/jpeg'};base64,${extracted.base64}`,
          },
        });
      } else if (extracted.text) {
        fullExtractedCorpus += `\n\n=== INIZIO FONTE: ${f.name} ===\n${extracted.text}\n=== FINE FONTE: ${f.name} ===\n`;
      }
    }

    // -------------------------------------------------------------
    // AZIONE 1: GENERAZIONE SYLLABUS BASATA AL 100% SUL TESTO DEI FILE
    // -------------------------------------------------------------
    if (action === 'generate_syllabus') {
      const numDays = Math.max(3, Math.min(daysTotal || 30, 45));

      const syllabusSystemPrompt = `Sei un professore universitario e pianificatore didattico di livello magistrale.
Il tuo compito principale è ANALIZZARE ATTENTAMENTE il materiale di studio caricato dallo studente ed estrarre un piano di studio di esattamente ${numDays} giorni.

REGOLE INDEROGABILI:
1. FEDELTÀ ASSOLUTA ALLE FONTI: Tutti gli argomenti e capitoli del calendario devono provenire ESCLUSIVAMENTE dai documenti allegati (PDF, dispense, slide o appunti). NON inventare o aggiungere temi generici non trattati nelle fonti.
2. PROGRESSIONE LOGICA: Organizza gli argomenti secondo un ordine didattico rigoroso e progressivo (o secondo l'ordine logico indicato dallo studente).
3. VARIETÀ E DISTINZIONE: Ogni giorno ("dayTitle") deve avere 1, 2 o al massimo 3 argomenti specifici ("topics") estratti dai capitoli reali. Non duplicare argomenti e non usare suffissi come "Parte 1" o "Parte 2".
4. FORMATO DI RISPOSTA: Restituisci ESCLUSIVAMENTE un JSON valido con il campo "schedule" contenente la lista dei giorni:
{
  "schedule": [
    {
      "dayNumber": 1,
      "dayTitle": "Giorno 1: Titolo modulo estratto dai file",
      "phase": "Fase 1: Studio e Comprensione",
      "topics": [
        {
          "id": "d1_t1",
          "title": "Titolo reale dell'argomento presente nel documento",
          "difficulty": "Fondamentale"
        }
      ]
    }
  ]
}`;

      // Inviamo fino a 65.000 caratteri di testo reale estratto per un'analisi approfondita e veloce
      const trimmedCorpus = fullExtractedCorpus.slice(0, 65000);

      const syllabusUserPrompt = `Materia/Note studente: "${examDescription || 'Programma di Studio'}".
Numero di giorni disponibili: ${numDays}.
Livello di preparazione desiderato: ${prepLevel || 80}%.
Stile: ${languageStyle || 'automatico'}.

${trimmedCorpus ? `TESTO COMPLETO ESTRATTO DAI FILE CARICATI DALLO STUDENTE:\n${trimmedCorpus}` : 'Nessun testo estratto dai file. Struttura il piano in base alla materia indicata.'}

Estrai i capitoli e gli argomenti reali dai documenti e genera il JSON del piano di studio.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: syllabusSystemPrompt },
          { role: 'user', content: syllabusUserPrompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const rawResponse = completion.choices[0]?.message?.content || '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(rawResponse);
        if (parsed.schedule && Array.isArray(parsed.schedule)) parsed = parsed.schedule;
        else if (parsed.days && Array.isArray(parsed.days)) parsed = parsed.days;
        else if (Array.isArray(parsed)) parsed = parsed;
        else if (typeof parsed === 'object') {
          const arr = Object.values(parsed).find(v => Array.isArray(v));
          if (arr) parsed = arr;
        }
      } catch (err) {
        console.error("Errore parsing JSON syllabus:", err);
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: Array.isArray(parsed) && parsed.length > 0 ? parsed : null }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 2: GENERAZIONE LEZIONE RIGOROSAMENTE VINCOLATA ALLE FONTI
    // -------------------------------------------------------------
    if (isLessonGeneration) {
      const isStrict = sourceType === 'my_materials';
      const lessonSystemPrompt = `Sei un docente universitario e tutor accademico.
Il tuo obiettivo è redigere una lezione/riassunto specialistico, chiaro, altamente logico e approfondito sull'argomento richiesto.

${isStrict ? `REGOLA FONDAMENTALE E RIGIDA:
Devi spiegare l'argomento basandoti UNICAMENTE ED ESCLUSIVAMENTE sulle informazioni, spiegazioni, definizioni, formule ed esempi PRESENTI NEI DOCUMENTI ALLEGATI DELLO STUDENTE.
NON aggiungere nozioni esterne da internet.
Il tuo compito è rendere il materiale originale molto più chiaro, ordinato, schematizzato e pedagogico, senza inventare o deviare dalle fonti caricate.` : `Spiega l'argomento attingendo alle migliori nozioni scientifiche e accademiche di riferimento.`}

FORMATTAZIONE:
- Usa titoli chiari in Markdown (##, ###).
- Evidenzia SEMPRE i termini tecnici e i concetti fondamentali in GRASSETTO (**termine**).
- Usa elenchi puntati strutturati e tabelle comparative.
- Per qualsiasi formula scientifica, chimica, medica, fisica o statistica, USA LA NOTAZIONE LaTeX ($formula$ o $$formula$$).`;

      const trimmedLessonCorpus = fullExtractedCorpus.slice(0, 85000);

      const lessonUserPrompt = `Argomento della lezione: "${topicTitle}".
Materia: "${examDescription || ''}", Livello target: ${prepLevel || 80}%, Stile: ${languageStyle || 'automatico'}.

${trimmedLessonCorpus ? `FONTI DELLO STUDENTE ESTRATTE DAI FILE:\n${trimmedLessonCorpus}` : ''}

Redigi la lezione didattica in modo chiaro, schematizzato e rigorosamente fedele alle fonti fornite.`;

      const messagesList = [
        { role: 'system', content: lessonSystemPrompt }
      ];

      if (imageParts.length > 0) {
        messagesList.push({
          role: 'user',
          content: [
            { type: 'text', text: lessonUserPrompt },
            ...imageParts,
          ],
        });
      } else {
        messagesList.push({
          role: 'user',
          content: lessonUserPrompt,
        });
      }

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesList,
        temperature: 0.3,
      });

      const reply = completion.choices[0]?.message?.content || 'Nessuna lezione generata.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      };
    }

    // -------------------------------------------------------------
    // AZIONE 3: CHAT STANDARD
    // -------------------------------------------------------------
    const standardSystemInstruction = `Sei un tutor universitario e assistente allo studio avanzato.
Rispondi in modo chiaro, approfondito e pedagogico in formato Markdown con termini chiave in grassetto ed equazioni LaTeX in $ o $$ quando utili.`;

    const messages = [
      { role: 'system', content: standardSystemInstruction }
    ];

    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
        });
      }
    }

    let finalPromptText = prompt || '';
    if (fullExtractedCorpus) {
      finalPromptText += `\n\n--- DOCUMENTI ALLEGATI DALL'UTENTE ---\n${fullExtractedCorpus.slice(0, 60000)}`;
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
      body: JSON.stringify({ error: error.message || 'Errore durante la generazione.' }),
    };
  }
};
