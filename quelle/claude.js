/**
 * NuS 2 – Theoriefragen Trainer · Claude-Anbindung im Browser
 *
 * Wird mit esbuild zu web/claude.js gebündelt (siehe `npm run build`).
 *
 * Jede Person benutzt ihren eigenen API-Schlüssel: er liegt nur im
 * localStorage des jeweiligen Browsers und geht ausschliesslich an
 * api.anthropic.com – die Seite selbst hat keinen Server und sieht ihn nie.
 */
import Anthropic from '@anthropic-ai/sdk';

const MODELL = 'claude-opus-5';

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

function klient(schluessel) {
  return new Anthropic({
    apiKey: schluessel,
    // Bewusst gesetzt: der Schlüssel gehört der Person, die ihn eingibt, und
    // bleibt in ihrem eigenen Browser. Es gibt keinen Server, der ihn halten
    // könnte, und niemandes fremder Schlüssel wird ausgeliefert.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
  });
}

/** Bild der Frage als Base64 – ohne es kann Claude die Schaltbilder nicht lesen. */
async function ladeBild(id) {
  try {
    const antw = await fetch(`fragen/ki/${encodeURIComponent(id)}.jpg`);
    if (!antw.ok) return null;
    const bytes = new Uint8Array(await antw.arrayBuffer());
    let roh = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      roh += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(roh);
  } catch {
    return null;
  }
}

/**
 * Prüft einen Schlüssel mit einer kostenlosen Abfrage der Modell-Liste.
 * Gibt null zurück, wenn er in Ordnung ist, sonst einen Fehlertext.
 */
async function pruefeSchluessel(schluessel) {
  try {
    await klient(schluessel).models.retrieve(MODELL);
    return null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return 'Der Schlüssel wurde nicht akzeptiert.';
    if (e instanceof Anthropic.PermissionDeniedError) {
      return `Der Schlüssel hat keinen Zugriff auf ${MODELL}.`;
    }
    if (e instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zu api.anthropic.com.';
    return e?.message || 'Der Schlüssel konnte nicht geprüft werden.';
  }
}

/**
 * Erklärt eine Frage und ruft `aufText` für jedes Textstück auf.
 * `signal` bricht die Anfrage ab. Wirft bei Fehlern.
 */
async function erklaere({ schluessel, eintrag, frage, aufText, signal }) {
  const inhalt = [];

  const bild = await ladeBild(eintrag.id);
  if (bild) {
    inhalt.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: bild },
    });
  }

  const schluesselText = eintrag.schluessel?.length
    ? `\nOffizielle Bewertung der vier Aussagen (von oben nach unten): ${eintrag.schluessel.join(', ')}`
    : eintrag.loesungBuchstaben?.length
      ? `\nRichtige Antwort(en): ${eintrag.loesungBuchstaben.join(', ')}`
      : '';

  inhalt.push({
    type: 'text',
    text:
      `Frage ${eintrag.nr} aus "${eintrag.quelle}" · Thema: ${eintrag.thema} · ${eintrag.punkte} Punkte\n\n` +
      `--- Extrahierter Fragetext (kann bei Formeln fehlerhaft sein, das Bild ist massgeblich) ---\n` +
      `${kuerze(eintrag.suchtext, 6000)}${schluesselText}`,
    cache_control: { type: 'ephemeral' },   // Folgefragen zur selben Frage werden billiger
  });

  inhalt.push({
    type: 'text',
    text: frage?.trim()
      ? `Meine Frage dazu: ${kuerze(String(frage).trim(), 2000)}`
      : 'Erkläre mir diese Frage und die Musterlösung.',
  });

  const strom = klient(schluessel).beta.messages.stream(
    {
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
    },
    { signal },
  );

  strom.on('text', aufText);

  const fertig = await strom.finalMessage();
  if (fertig.stop_reason === 'refusal') {
    throw new Error('Claude hat die Beantwortung dieser Frage abgelehnt.');
  }
  if (fertig.stop_reason === 'max_tokens') {
    aufText('\n\n_(Antwort wurde gekürzt – frag gezielter nach.)_');
  }
}

/** Übersetzt SDK-Fehler in etwas, das man einer Studentin zeigen kann. */
function fehlertext(e) {
  if (e instanceof Anthropic.AuthenticationError) {
    return 'Der API-Schlüssel wurde nicht akzeptiert. Bitte in der Seitenleiste neu eintragen.';
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return `Dieser Schlüssel hat keinen Zugriff auf ${MODELL} – oder das Guthaben ist aufgebraucht.`;
  }
  if (e instanceof Anthropic.RateLimitError) {
    return 'Zu viele Anfragen in kurzer Zeit. Kurz warten und nochmal versuchen.';
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return 'Keine Verbindung zu api.anthropic.com.';
  }
  return e?.message || 'Unbekannter Fehler.';
}

window.NUS2_CLAUDE = { MODELL, erklaere, pruefeSchluessel, fehlertext };
