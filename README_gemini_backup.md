# Study AI Web App

Applicazione web per lo studio assistito da intelligenza artificiale, costruita con React, Tailwind CSS e Netlify Serverless Functions (Gemini API).

## Caratteristiche
- Interfaccia minimal in stile Google Gemini.
- Barra laterale retrattile con cronologia delle conversazioni salvate localmente.
- Supporto per domande libere, inserimento appunti/testo e upload di file (PDF, immagini, documenti).
- Netlify Function per la comunicazione sicura con l'API di Gemini.

## Avvio in locale
1. Installa le dipendenze:
   ```bash
   npm install
   ```
2. Avvia il server di sviluppo:
   ```bash
   npm run dev
   ```

## Deploy su Netlify
1. Carica il codice su una repository GitHub.
2. Collega la repository su Netlify (**Add new site** > **Import an existing project**).
3. Aggiungi la variabile d'ambiente su Netlify (**Site configuration** > **Environment variables**):
   - **Key:** `GEMINI_API_KEY`
   - **Value:** `[Tua chiave API Gemini]`
4. Clicca su **Deploy site**.
