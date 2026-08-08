/**
 * NuS 2 – Theoriefragen Trainer
 *
 * Kleiner statischer Server für die lokale Entwicklung. Die Seite braucht
 * sonst nichts: Claude wird direkt aus dem Browser mit dem persönlichen
 * API-Schlüssel angesprochen (siehe quelle/claude.js).
 */
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(HIER, 'web')));

app.listen(PORT, () => {
  console.log(`▸ Trainer läuft auf http://localhost:${PORT}`);
});
