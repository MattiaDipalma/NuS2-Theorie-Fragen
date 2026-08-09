/**
 * NuS 2 – Theoriefragen Trainer
 *
 * Liefert die statische Website aus /web und stellt einen Endpunkt bereit,
 * über den Claude eine Frage erklärt. Der API-Schlüssel bleibt auf dem
 * Server und erreicht den Browser nie.
 */
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER   = path.dirname(fileURLToPath(import.meta.url));
const WEB    = path.join(HIER, 'web');
const PORT   = Number(process.env.PORT) || 3000;
const MODELL = process.env.CLAUDE_MODELL || 'claude-opus-5';

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(WEB, { maxAge: '1h' }));

/* ── Fragen einmalig laden ─────────────────────────────────────────── */
const fragen = new Map();
for (const f of JSON.parse(await readFile(path.join(WEB, 'fragen.json'), 'utf8'))) {
  fragen.set(f.id, f);
}
console.log(`▸ ${fragen.size} Fragen geladen`);

const client = new Anthropic();   // liest ANTHROPIC_API_KEY aus der Umgebung

const SYSTEM = `Du bist ein geduldiger Tutor für die ETH-Vorlesung
"Netzwerke und Schaltungen II" (Wechselstromlehre, komplexe Zeiger, Impedanzen,
Ortskurven, Resonanz, Filter, Leistung, Drehstrom, transiente Vorgänge,
Laplace-Transformation, Fourier-Analyse).

Du bekommst eine Multiple-Choice-Frage als Bild (mit Schaltbildern, Zeigerdiagrammen
und Formeln) sowie den daraus extrahierten Text und die Musterlösung.

Regeln für deine Antwort:
- Antworte **immer auf Deutsch**, auch wenn die Frage anders gestellt wird.
- Erkläre den Lösungsweg, nicht nur das Ergebnis. Nenne die zugrunde liegende
  Regel oder Formel und wende sie auf die konkrete Schaltung an.
- Wenn nach einer bestimmten Aussage oder Antwortmöglichkeit gefragt wird,
  gehe genau darauf ein und erkläre auch, warum die anderen nicht stimmen.
- Halte dich kurz: normalerweise 3 bis 6 Absätze. Keine Wiederholung der Frage.
- Formeln als gut lesbaren Text mit Unicode-Zeichen schreiben, z. B.
  "U_eff = û/√2", "Z = R + jωL", "φ = arctan(ωL/R)". Kein LaTeX, keine
  Dollarzeichen, keine \\frac-Befehle – der Text wird als reines Markdown angezeigt.
- Widersprich der Musterlösung nicht stillschweigend. Wenn sie dir falsch
  erscheint, sag das ausdrücklich und begründe es.`;

const kuerze = (s, n) => (s && s.length > n ? s.slice(0, n) + ' …' : s || '');

/* ── Erklär-Endpunkt (Server-Sent Events) ──────────────────────────── */
app.post('/api/erklaeren', async (req, res) => {
  // Zuerst der Schlüssel: daran erkennt die Seite, dass der Server zwar läuft,
  // die Erklärfunktion aber noch nicht eingerichtet ist.
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      fehler: 'Kein ANTHROPIC_API_KEY gesetzt. Siehe README – Abschnitt „Claude-API einrichten“, '
        + 'oder hinterlege in der Seitenleiste einen eigenen Schlüssel im Browser.',
    });
  }

  const { id, frage } = req.body ?? {};
  const eintrag = fragen.get(id);
  if (!eintrag) return res.status(404).json({ fehler: 'Frage nicht gefunden.' });

  const inhalt = [];

  // Bild der Frage mitschicken – nur so kann Claude Schaltbilder lesen.
  const bildPfad = path.join(WEB, 'fragen', 'ki', `${eintrag.id}.jpg`);
  if (existsSync(bildPfad)) {
    inhalt.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(bildPfad)).toString('base64') },
    });
  }

  const schluessel = eintrag.schluessel?.length
    ? `\nOffizielle Bewertung der vier Aussagen (von oben nach unten): ${eintrag.schluessel.join(', ')}`
    : eintrag.loesungBuchstaben?.length
      ? `\nRichtige Antwort(en): ${eintrag.loesungBuchstaben.join(', ')}`
      : '';

  inhalt.push({
    type: 'text',
    text:
      `Frage ${eintrag.nr} aus "${eintrag.quelle}" · Thema: ${eintrag.thema} · ${eintrag.punkte} Punkte\n\n` +
      `--- Extrahierter Fragetext (kann bei Formeln fehlerhaft sein, das Bild ist massgeblich) ---\n` +
      `${kuerze(eintrag.suchtext, 6000)}${schluessel}`,
    cache_control: { type: 'ephemeral' },   // Folgefragen zur selben Frage werden billiger
  });

  inhalt.push({
    type: 'text',
    text: frage?.trim()
      ? `Meine Frage dazu: ${kuerze(String(frage).trim(), 2000)}`
      : 'Erkläre mir diese Frage und die Musterlösung.',
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sende = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);

  try {
    const stream = client.beta.messages.stream({
      model: MODELL,
      max_tokens: 4000,
      system: SYSTEM,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      // Lehnt ein Sicherheitsfilter die Anfrage ab, beantwortet sie
      // automatisch ein Ersatzmodell statt einfach abzubrechen.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: inhalt }],
    });

    stream.on('text', (delta) => sende({ text: delta }));

    const fertig = await stream.finalMessage();
    if (fertig.stop_reason === 'refusal') {
      sende({ fehler: 'Claude hat die Beantwortung dieser Frage abgelehnt.' });
    } else if (fertig.stop_reason === 'max_tokens') {
      sende({ text: '\n\n_(Antwort wurde gekürzt – frag gezielter nach.)_' });
    }
  } catch (e) {
    console.error('Claude-Fehler:', e?.message || e);
    sende({ fehler: `Claude-Anfrage fehlgeschlagen: ${e?.message || 'unbekannter Fehler'}` });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`▸ Trainer läuft auf http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('▸ Hinweis: ANTHROPIC_API_KEY ist nicht gesetzt – die Erklärfunktion bleibt deaktiviert.');
  }
});
