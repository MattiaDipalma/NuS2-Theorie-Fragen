/**
 * NuS 2 – Theoriefragen Trainer · Erklär-Backend
 *
 * Cloudflare Worker, der die Erklärfunktion für die statische Seite auf
 * GitHub Pages bereitstellt. Der API-Schlüssel liegt als Cloudflare-Secret
 * beim Worker und erreicht den Browser nie.
 */
import Anthropic from '@anthropic-ai/sdk';

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

/* ── Fragen einmalig von der Website laden ─────────────────────────── */
let fragen = null;

async function ladeFragen(seite) {
  if (fragen) return fragen;
  const antw = await fetch(`${seite}/fragen.json`);
  if (!antw.ok) throw new Error(`fragen.json nicht erreichbar (${antw.status})`);
  fragen = new Map(((await antw.json())).map((f) => [f.id, f]));
  return fragen;
}

async function ladeBild(seite, id) {
  const antw = await fetch(`${seite}/fragen/ki/${encodeURIComponent(id)}.jpg`);
  if (!antw.ok) return null;
  const bytes = new Uint8Array(await antw.arrayBuffer());
  let roh = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    roh += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(roh);
}

/* ── Einfache Bremse pro IP ────────────────────────────────────────── */
const zugriffe = new Map();

function zuHaeufig(ip, grenze) {
  const jetzt = Date.now();
  const liste = (zugriffe.get(ip) || []).filter((t) => jetzt - t < 3600_000);
  if (liste.length >= grenze) return true;
  liste.push(jetzt);
  zugriffe.set(ip, liste);
  return false;
}

/* ── Worker ────────────────────────────────────────────────────────── */
export default {
  async fetch(anfrage, umgebung, kontext) {
    const erlaubt = (umgebung.ERLAUBTE_HERKUNFT || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    const herkunft = anfrage.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': erlaubt.includes(herkunft) ? herkunft : erlaubt[0] || '',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (anfrage.method !== 'POST') {
      return new Response('Nur POST.', { status: 405, headers: cors });
    }
    if (erlaubt.length && !erlaubt.includes(herkunft)) {
      return new Response('Herkunft nicht erlaubt.', { status: 403, headers: cors });
    }

    const ip = anfrage.headers.get('CF-Connecting-IP') || 'unbekannt';
    if (zuHaeufig(ip, Number(umgebung.ANFRAGEN_PRO_STUNDE) || 40)) {
      return new Response(
        JSON.stringify({ fehler: 'Zu viele Anfragen. Bitte später nochmal versuchen.' }),
        { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    const seite = (umgebung.SEITE || '').replace(/\/$/, '');
    const { id, frage } = await anfrage.json().catch(() => ({}));

    let eintrag;
    try {
      eintrag = (await ladeFragen(seite)).get(id);
    } catch (e) {
      return new Response(JSON.stringify({ fehler: e.message }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!eintrag) {
      return new Response(JSON.stringify({ fehler: 'Frage nicht gefunden.' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const inhalt = [];

    // Bild der Frage mitschicken – nur so kann Claude Schaltbilder lesen.
    const bild = await ladeBild(seite, eintrag.id);
    if (bild) {
      inhalt.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: bild },
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

    const { readable, writable } = new TransformStream();
    const schreiber = writable.getWriter();
    const kodierer = new TextEncoder();
    const sende = (o) => schreiber.write(kodierer.encode(`data: ${JSON.stringify(o)}\n\n`));

    kontext.waitUntil((async () => {
      try {
        const klient = new Anthropic({ apiKey: umgebung.ANTHROPIC_API_KEY });
        const strom = klient.beta.messages.stream({
          model: umgebung.CLAUDE_MODELL || 'claude-opus-5',
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

        for await (const ereignis of strom) {
          if (ereignis.type === 'content_block_delta' && ereignis.delta.type === 'text_delta') {
            await sende({ text: ereignis.delta.text });
          }
        }

        const fertig = await strom.finalMessage();
        if (fertig.stop_reason === 'refusal') {
          await sende({ fehler: 'Claude hat die Beantwortung dieser Frage abgelehnt.' });
        } else if (fertig.stop_reason === 'max_tokens') {
          await sende({ text: '\n\n_(Antwort wurde gekürzt – frag gezielter nach.)_' });
        }
      } catch (e) {
        await sende({ fehler: `Claude-Anfrage fehlgeschlagen: ${e?.message || 'unbekannter Fehler'}` });
      } finally {
        await schreiber.close();
      }
    })());

    return new Response(readable, {
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  },
};
