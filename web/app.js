/* NuS 2 – Theoriefragen Trainer ------------------------------------- */
'use strict';

const SPEICHER = 'nus2-trainer-v1';
const $  = (s) => document.querySelector(s);

let FRAGEN   = [];
let auswahl  = [];
let position = 0;

const filter = { modus: 'alle', quelle: 'alle', typ: 'alle', thema: 'alle', suche: '' };
let fortschritt = ladeFortschritt();

const TYP_NAMEN = {
  kprime:   'Richtig/Falsch',
  einfach:  'Einfachwahl',
  mehrfach: 'Mehrfachwahl',
  offen:    'Offene Frage',
};

/* ── Persistenz ───────────────────────────────────────────────────── */
function ladeFortschritt() {
  try { return JSON.parse(localStorage.getItem(SPEICHER)) || {}; }
  catch { return {}; }
}
function sichereFortschritt() {
  try { localStorage.setItem(SPEICHER, JSON.stringify(fortschritt)); } catch {}
}
function merke(id, status) {
  fortschritt[id] = { status, zeit: Date.now() };
  sichereFortschritt();
  zeichneSeitenleiste();
}

/* ── Hilfsfunktionen ──────────────────────────────────────────────── */
const escape = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Sehr kleiner Markdown-Renderer für Claudes Antworten. */
function markdown(text) {
  const zeilen = escape(text).split('\n');
  let html = '', liste = null, code = false;

  const schliesseListe = () => { if (liste) { html += `</${liste}>`; liste = null; } };

  for (const zeile of zeilen) {
    if (/^```/.test(zeile)) {
      schliesseListe();
      html += code ? '</code></pre>' : '<pre><code>';
      code = !code;
      continue;
    }
    if (code) { html += zeile + '\n'; continue; }

    const h = zeile.match(/^(#{1,4})\s+(.*)$/);
    if (h) { schliesseListe(); html += `<h3>${inline(h[2])}</h3>`; continue; }

    const ul = zeile.match(/^\s*[-*]\s+(.*)$/);
    const ol = zeile.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const art = ul ? 'ul' : 'ol';
      if (liste !== art) { schliesseListe(); html += `<${art}>`; liste = art; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
      continue;
    }
    schliesseListe();
    if (zeile.trim()) html += `<p>${inline(zeile)}</p>`;
  }
  schliesseListe();
  if (code) html += '</code></pre>';
  return html;
}
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

/* ── Filter & Auswahl ─────────────────────────────────────────────── */
function passt(f) {
  const st = fortschritt[f.id]?.status;
  if (filter.modus === 'fehler' && st !== 'falsch') return false;
  if (filter.modus === 'neu'    && st)              return false;
  if (filter.quelle !== 'alle' && f.quelle !== filter.quelle) return false;
  if (filter.typ    !== 'alle' && f.typ    !== filter.typ)    return false;
  if (filter.thema  !== 'alle' && f.thema  !== filter.thema)  return false;
  if (filter.suche) {
    const q = filter.suche.toLowerCase();
    if (!(f.suchtext.toLowerCase().includes(q) || f.thema.toLowerCase().includes(q))) return false;
  }
  return true;
}

function berechneAuswahl(behalteFrage) {
  const vorher = behalteFrage && auswahl[position] ? auswahl[position].id : null;
  auswahl = FRAGEN.filter(passt);
  const idx = vorher ? auswahl.findIndex((f) => f.id === vorher) : -1;
  position = idx >= 0 ? idx : 0;
}

/* ── Seitenleiste ─────────────────────────────────────────────────── */
function pillGruppe(behaelter, optionen, aktiv, beiWahl) {
  behaelter.innerHTML = '';
  for (const o of optionen) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.type = 'button';
    b.setAttribute('aria-pressed', String(o.wert === aktiv));
    b.innerHTML = `${escape(o.name)}${o.zahl != null ? `<span class="zahl">${o.zahl}</span>` : ''}`;
    b.onclick = () => beiWahl(o.wert);
    behaelter.appendChild(b);
  }
}

function zaehle(schluessel, wert) {
  const probe = { ...filter, [schluessel]: wert };
  const alt = { ...filter };
  Object.assign(filter, probe);
  const n = FRAGEN.filter(passt).length;
  Object.assign(filter, alt);
  return n;
}

function zeichneSeitenleiste() {
  const werte = Object.values(fortschritt);
  const richtig = werte.filter((w) => w.status === 'richtig').length;
  $('#statbox').textContent =
    `$ bearbeitet ${werte.length}/${FRAGEN.length} — ${richtig} richtig`;

  const anteil = FRAGEN.length ? (werte.length / FRAGEN.length) * 100 : 0;
  $('#balken').style.width = anteil + '%';
  $('#fortschrittText').textContent =
    `${werte.length} von ${FRAGEN.length} bearbeitet · ${Math.round(anteil)} %`;

  pillGruppe($('#filterModus'), [
    { wert: 'alle',   name: 'Alle',              zahl: zaehle('modus', 'alle') },
    { wert: 'fehler', name: 'Fehler wiederholen', zahl: zaehle('modus', 'fehler') },
    { wert: 'neu',    name: 'Noch offen',        zahl: zaehle('modus', 'neu') },
  ], filter.modus, (v) => { filter.modus = v; nachFilterwechsel(); });

  const quellen = [...new Set(FRAGEN.map((f) => f.quelle))].sort();
  pillGruppe($('#filterQuelle'), [
    { wert: 'alle', name: 'Alle', zahl: zaehle('quelle', 'alle') },
    ...quellen.map((q) => ({ wert: q, name: q, zahl: zaehle('quelle', q) })),
  ], filter.quelle, (v) => { filter.quelle = v; nachFilterwechsel(); });

  const typen = ['kprime', 'einfach', 'mehrfach', 'offen'].filter((t) => FRAGEN.some((f) => f.typ === t));
  pillGruppe($('#filterTyp'), [
    { wert: 'alle', name: 'Alle', zahl: zaehle('typ', 'alle') },
    ...typen.map((t) => ({ wert: t, name: TYP_NAMEN[t], zahl: zaehle('typ', t) })),
  ], filter.typ, (v) => { filter.typ = v; nachFilterwechsel(); });

  const themen = [...new Set(FRAGEN.map((f) => f.thema))]
    .sort((a, b) => a.localeCompare(b, 'de'));
  pillGruppe($('#filterThema'), [
    { wert: 'alle', name: 'Alle', zahl: zaehle('thema', 'alle') },
    ...themen.map((t) => ({ wert: t, name: t, zahl: zaehle('thema', t) })),
  ], filter.thema, (v) => { filter.thema = v; nachFilterwechsel(); });
}

function nachFilterwechsel() {
  berechneAuswahl(true);
  zeichneSeitenleiste();
  zeichneKarte();
}

/* ── Fragekarte ───────────────────────────────────────────────────── */
function zeichneKarte() {
  const ziel = $('#karte');
  const f = auswahl[position];

  $('#zurueckKnopf').disabled = position <= 0;
  $('#weiterKnopf').disabled  = position >= auswahl.length - 1;
  $('#blaetternInfo').textContent = auswahl.length
    ? `${position + 1} / ${auswahl.length}` : '–';

  if (!f) {
    $('#kopfMeta').textContent = '0 Fragen in Auswahl';
    ziel.innerHTML = `<div class="leer">Keine Frage passt zu den gewählten Filtern.<br>
      Filter lockern oder Suche leeren.</div>`;
    return;
  }

  $('#kopfMeta').textContent =
    `${position + 1} / ${auswahl.length} in Auswahl · ${f.quelle} · ${f.thema} · ${f.punkte} Pkt`;

  const bilder = f.frage
    .map((p) => `<img class="frage-bild" src="fragen/${p.src}" width="${p.w}" height="${p.h}" alt="Frage ${f.nr}" loading="lazy">`)
    .join('');

  ziel.innerHTML = `
    <article class="karte">
      <div class="karte-kopf">
        <span>${escape(f.quelle)} #${f.nr} · ${escape(f.thema)} · ${escape(TYP_NAMEN[f.typ])}</span>
        <span>${f.punkte} Pkt</span>
      </div>
      <div class="karte-koerper">
        ${bilder}
        <div id="antwortBereich"></div>
        <div class="aktionen" id="aktionen"></div>
        <div id="ergebnis"></div>
        <div id="loesungBereich"></div>
        <div class="claude">
          <textarea class="claude-eingabe" id="claudeFrage"
            placeholder="Etwas unklar? Frag nach – z. B. „Warum ist Aussage 3 falsch?“ (leer lassen für eine allgemeine Erklärung)"></textarea>
          <div class="aktionen">
            <button class="knopf" id="claudeKnopf">+ Erkläre mir das</button>
          </div>
          <div id="claudeAusgabe"></div>
        </div>
      </div>
    </article>`;

  zeichneAntwortbereich(f);
  $('#claudeKnopf').onclick = () => frageClaude(f);
  $('#claudeFrage').onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) frageClaude(f);
  };
}

/** aktuelle Nutzerantwort je Frage (nicht persistent) */
let antwort = {};

function zeichneAntwortbereich(f) {
  const bereich = $('#antwortBereich');
  const aktionen = $('#aktionen');
  antwort = {};
  bereich.innerHTML = '';
  aktionen.innerHTML = '';
  $('#ergebnis').innerHTML = '';
  $('#loesungBereich').innerHTML = '';
  $('#claudeAusgabe').innerHTML = '';

  if (f.typ === 'kprime') {
    antwort.wahl = [null, null, null, null];
    const box = document.createElement('div');
    box.className = 'antworten';
    for (let i = 0; i < 4; i++) {
      const zeile = document.createElement('div');
      zeile.className = 'aussage';
      zeile.dataset.i = i;
      zeile.innerHTML = `
        <span class="aussage-label">Aussage ${i + 1}</span>
        <span class="wahl">
          <button type="button" data-w="Richtig" aria-pressed="false">Richtig</button>
          <button type="button" data-w="Falsch"  aria-pressed="false">Falsch</button>
        </span>`;
      zeile.querySelectorAll('.wahl button').forEach((b) => {
        b.onclick = () => {
          antwort.wahl[i] = b.dataset.w;
          zeile.querySelectorAll('.wahl button')
               .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        };
      });
      box.appendChild(zeile);
    }
    bereich.appendChild(box);

  } else if (f.typ === 'einfach' || f.typ === 'mehrfach') {
    const buchstaben = f.optionen.length ? f.optionen : ['a', 'b', 'c', 'd'];
    antwort.wahl = new Set();
    const box = document.createElement('div');
    box.className = 'antworten';
    for (const bst of buchstaben) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.dataset.b = bst;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="punkt"></span><span>Antwort ${bst})</span>`;
      b.onclick = () => {
        if (f.typ === 'einfach') {
          antwort.wahl = new Set([bst]);
          box.querySelectorAll('.option')
             .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        } else {
          const an = b.getAttribute('aria-pressed') !== 'true';
          an ? antwort.wahl.add(bst) : antwort.wahl.delete(bst);
          b.setAttribute('aria-pressed', String(an));
        }
      };
      box.appendChild(b);
    }
    bereich.appendChild(box);
    const hinweis = document.createElement('div');
    hinweis.className = 'hinweis';
    hinweis.textContent = f.typ === 'mehrfach'
      ? 'Mehrere Antworten möglich. Die Antwortmöglichkeiten stehen im Bild oben.'
      : 'Genau eine Antwort. Die Antwortmöglichkeiten stehen im Bild oben.';
    bereich.appendChild(hinweis);

  } else {
    const hinweis = document.createElement('div');
    hinweis.className = 'hinweis';
    hinweis.textContent = 'Offene Frage – überlege dir die Antwort und vergleiche danach mit der Musterlösung.';
    bereich.appendChild(hinweis);
  }

  if (f.autoBewertung) {
    const pruefen = document.createElement('button');
    pruefen.className = 'knopf primaer';
    pruefen.textContent = 'Antwort prüfen';
    pruefen.onclick = () => pruefe(f);
    aktionen.appendChild(pruefen);
  }
  const zeigen = document.createElement('button');
  zeigen.className = f.autoBewertung ? 'knopf' : 'knopf primaer';
  zeigen.textContent = 'Lösung zeigen';
  zeigen.onclick = () => zeigeLoesung(f, !f.autoBewertung);
  aktionen.appendChild(zeigen);
}

function pruefe(f) {
  let korrekt = false;
  let text = '';

  if (f.typ === 'kprime') {
    if (antwort.wahl.some((w) => w === null)) {
      $('#ergebnis').innerHTML =
        `<div class="banner neutral"><span class="etikett">Unvollständig</span>
         Bitte alle vier Aussagen mit Richtig oder Falsch bewerten.</div>`;
      return;
    }
    korrekt = f.schluessel.every((s, i) => s === antwort.wahl[i]);
    document.querySelectorAll('.aussage').forEach((zeile, i) => {
      const ok = f.schluessel[i] === antwort.wahl[i];
      zeile.classList.add(ok ? 'ok' : 'falsch');
      const m = document.createElement('span');
      m.className = 'marke-loesung ' + (ok ? 'ok' : 'falsch');
      m.textContent = f.schluessel[i];
      zeile.appendChild(m);
    });
    const n = f.schluessel.filter((s, i) => s === antwort.wahl[i]).length;
    text = `${n} von 4 Aussagen richtig bewertet.`;

  } else {
    if (!antwort.wahl.size) {
      $('#ergebnis').innerHTML =
        `<div class="banner neutral"><span class="etikett">Unvollständig</span>
         Bitte zuerst eine Antwort wählen.</div>`;
      return;
    }
    const soll = new Set(f.loesungBuchstaben);
    korrekt = soll.size === antwort.wahl.size && [...soll].every((b) => antwort.wahl.has(b));
    document.querySelectorAll('.option').forEach((el) => {
      const b = el.dataset.b;
      if (soll.has(b)) el.classList.add('ok');
      else if (antwort.wahl.has(b)) el.classList.add('falsch');
    });
    text = `Richtig wäre: ${[...soll].map((b) => b + ')').join(', ')}.`;
  }

  $('#ergebnis').innerHTML = korrekt
    ? `<div class="banner ok"><span class="etikett">Richtig</span>${escape(text)}</div>`
    : `<div class="banner falsch"><span class="etikett">Nicht ganz</span>${escape(text)}</div>`;

  merke(f.id, korrekt ? 'richtig' : 'falsch');
  zeigeLoesung(f, false);
}

function zeigeLoesung(f, selbstkontrolle) {
  const ziel = $('#loesungBereich');
  if (ziel.dataset.offen === '1') return;
  ziel.dataset.offen = '1';

  if (!f.loesung || !f.loesung.length) {
    ziel.innerHTML = `<div class="banner neutral"><span class="etikett">Keine Musterlösung</span>
      Zu dieser Frage enthält der Moodle-Export keine Lösung. Frag unten Claude.</div>`;
  } else {
    ziel.innerHTML = `<div class="loesung-block">` + f.loesung
      .map((p) => `<img class="loesung-bild" src="fragen/${p.src}" width="${p.w}" height="${p.h}" alt="Musterlösung" loading="lazy">`)
      .join('') + `</div>`;
  }

  if (selbstkontrolle && !f.autoBewertung) {
    const box = document.createElement('div');
    box.className = 'aktionen';
    box.innerHTML = `
      <button class="knopf" data-s="richtig">✓ Wusste ich</button>
      <button class="knopf" data-s="falsch">✗ Wusste ich nicht</button>`;
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        merke(f.id, b.dataset.s);
        box.outerHTML = `<div class="banner ${b.dataset.s === 'richtig' ? 'ok' : 'falsch'}">
          <span class="etikett">Gespeichert</span>Als „${b.textContent.slice(2)}“ vermerkt.</div>`;
      };
    });
    ziel.appendChild(box);
  }
}

/* ── Claude ───────────────────────────────────────────────────────── */
let laeuft = null;

async function frageClaude(f) {
  if (laeuft) { laeuft.abort(); laeuft = null; }

  const eingabe = $('#claudeFrage').value.trim();
  const ausgabe = $('#claudeAusgabe');
  const knopf   = $('#claudeKnopf');
  knopf.disabled = true;
  knopf.textContent = 'Claude denkt nach …';

  ausgabe.innerHTML = `<div class="erklaerung"><span class="etikett">Erklärung</span>
    <div id="claudeText"><span class="cursor"></span></div></div>`;
  const textZiel = $('#claudeText');

  laeuft = new AbortController();
  let gesammelt = '';

  try {
    const antw = await fetch('/api/erklaeren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, frage: eingabe }),
      signal: laeuft.signal,
    });

    if (!antw.ok || !antw.body) {
      const fehler = await antw.text().catch(() => '');
      throw new Error(fehler || `Server antwortete mit ${antw.status}`);
    }

    const leser = antw.body.getReader();
    const dec = new TextDecoder();
    let puffer = '';

    for (;;) {
      const { value, done } = await leser.read();
      if (done) break;
      puffer += dec.decode(value, { stream: true });
      const teile = puffer.split('\n\n');
      puffer = teile.pop();
      for (const block of teile) {
        for (const zeile of block.split('\n')) {
          if (!zeile.startsWith('data: ')) continue;
          const nutz = JSON.parse(zeile.slice(6));
          if (nutz.fehler) throw new Error(nutz.fehler);
          if (nutz.text) {
            gesammelt += nutz.text;
            textZiel.innerHTML = markdown(gesammelt) + '<span class="cursor"></span>';
          }
        }
      }
    }
    textZiel.innerHTML = markdown(gesammelt) || '<p>(keine Antwort erhalten)</p>';

  } catch (e) {
    if (e.name === 'AbortError') return;
    ausgabe.innerHTML = `<div class="banner falsch"><span class="etikett">Fehler</span>${escape(e.message)}</div>`;
  } finally {
    laeuft = null;
    knopf.disabled = false;
    knopf.textContent = '+ Erkläre mir das';
  }
}

/* ── Navigation & Start ───────────────────────────────────────────── */
function gehe(delta) {
  const neu = position + delta;
  if (neu < 0 || neu >= auswahl.length) return;
  position = neu;
  zeichneKarte();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function themaSetzen(t) {
  document.documentElement.dataset.thema = t;
  localStorage.setItem(SPEICHER + '-thema', t);
  $('#themaKnopf').textContent = t === 'dunkel' ? '☀ Hellmodus' : '☾ Dunkelmodus';
}

async function start() {
  themaSetzen(localStorage.getItem(SPEICHER + '-thema') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dunkel' : 'hell'));

  $('#themaKnopf').onclick = () =>
    themaSetzen(document.documentElement.dataset.thema === 'dunkel' ? 'hell' : 'dunkel');

  $('#zurueckKnopf').onclick = () => gehe(-1);
  $('#weiterKnopf').onclick  = () => gehe(1);
  $('#zufallKnopf').onclick  = () => {
    if (!auswahl.length) return;
    position = Math.floor(Math.random() * auswahl.length);
    zeichneKarte();
  };
  $('#menuKnopf').onclick = () => $('#seitenleiste').classList.toggle('offen');
  $('#resetKnopf').onclick = () => {
    if (!confirm('Gesamten Lernfortschritt löschen?')) return;
    fortschritt = {};
    sichereFortschritt();
    nachFilterwechsel();
  };

  let timer;
  $('#suche').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { filter.suche = e.target.value.trim(); nachFilterwechsel(); }, 180);
  };

  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft')  gehe(-1);
    if (e.key === 'ArrowRight') gehe(1);
  });

  try {
    FRAGEN = await (await fetch('fragen.json')).json();
  } catch {
    $('#karte').innerHTML = `<div class="leer">fragen.json konnte nicht geladen werden.</div>`;
    return;
  }

  berechneAuswahl(false);
  zeichneSeitenleiste();
  zeichneKarte();
}

start();
