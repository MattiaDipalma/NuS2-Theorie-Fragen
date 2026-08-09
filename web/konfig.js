/**
 * Adresse des Claude-Backends.
 *
 * Leer lassen, solange die Seite über `npm start` lokal läuft – dann beantwortet
 * server.js die Anfragen selbst unter /api/erklaeren.
 *
 * Für die öffentliche Fassung auf GitHub Pages hier die URL des Cloudflare
 * Workers eintragen, z. B.:
 *   window.NUS2_API = 'https://nus2-erklaeren.DEIN-NAME.workers.dev/api/erklaeren';
 *
 * Bleibt der Wert leer und läuft die Seite ohne eigenen Server, fragt die Seite
 * nach einem persönlichen API-Schlüssel und spricht damit direkt mit
 * api.anthropic.com – siehe README, Abschnitt „Claude-API einrichten“.
 */
window.NUS2_API = '';
