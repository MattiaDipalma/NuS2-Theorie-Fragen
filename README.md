# NuS 2 – Theoriefragen Trainer

Lern-Website für die Theoriefragen zur ETH-Vorlesung **227-0002-00L Netzwerke und
Schaltungen II**. Alle **176 Fragen** aus den beiden Moodle-Tests (MC-Test und
Clicker-Fragen) lassen sich damit einzeln durcharbeiten – mit Filtern, Fortschritts-
speicherung und einer Erklärfunktion, die Claude fragt, wenn eine Frage unklar ist.

Die Oberfläche ist vollständig auf Deutsch.

---

## Schnellstart

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."   # optional, siehe unten
npm start
```

Danach <http://localhost:3000> im Browser öffnen.

Ohne API-Schlüssel funktioniert alles ausser der Erklärfunktion – Fragen, Lösungen,
Filter und Fortschritt laufen rein im Browser.

Wie die Seite öffentlich erreichbar wird, steht unten unter *Öffentlich stellen*.

---

## Was die Seite kann

**Fragen üben**

| Fragetyp | Anzahl | Bewertung |
|---|---:|---|
| Richtig/Falsch (Kprime, 4 Aussagen) | 108 | automatisch |
| Einfachwahl | 44 | automatisch, wo die richtige Antwort aus dem Moodle-Export ableitbar ist |
| Mehrfachwahl | 18 | dito |
| Offene Fragen | 6 | Selbstkontrolle |

Insgesamt sind **124 von 176 Fragen automatisch bewertbar**. Bei den übrigen
bestehen die Antwortmöglichkeiten nur aus Bildern (Zeigerdiagramme, Schaltbilder),
sodass sich die richtige Antwort nicht zuverlässig aus dem Text bestimmen lässt.
Dort wird die Musterlösung eingeblendet und du hakst selbst ab: *Wusste ich* /
*Wusste ich nicht*. Beides zählt gleichermassen in den Fortschritt.

**Filtern und finden**

* **Modus** – Alle · Fehler wiederholen · Noch offen
* **Quelle** – MC-Test · Clicker
* **Fragetyp** – Richtig/Falsch · Einfachwahl · Mehrfachwahl · Offene Frage
* **Thema** – 13 automatisch zugeordnete Themen (Impedanz & Ortskurven, Leistung,
  Resonanz & Schwingkreis, Drehstrom, Laplace-Transformation, …)
* Volltextsuche über Frage- und Lösungstext
* Zufallsknopf, Pfeiltasten ← → zum Blättern

**Fortschritt** wird im `localStorage` des Browsers gespeichert, ist also gerätelokal
und braucht kein Konto. Über *Fortschritt zurücksetzen* in der Seitenleiste lässt er
sich löschen.

**Dunkelmodus** folgt beim ersten Start der Systemeinstellung und lässt sich
umschalten.

---

## Claude-API einrichten

Die Erklärfunktion (`+ Erkläre mir das`) schickt die Frage an die Claude API und
streamt die Antwort zurück in die Seite.

```bash
export ANTHROPIC_API_KEY="sk-ant-..."    # Schlüssel: https://console.anthropic.com
npm start
```

Alternativ eine Datei `.env` anlegen (siehe `.env.example`) und mit
`node --env-file=.env server.js` starten.

### Wie die Anfrage aussieht

Der Schlüssel liegt ausschliesslich auf dem Server; der Browser sieht ihn nie. Pro
Anfrage schickt `server.js` an die Messages-API:

* **Modell** `claude-opus-5` (überschreibbar mit `CLAUDE_MODELL`)
* **das Bild der Frage** – entscheidend, denn viele Fragen bestehen aus Schaltbildern
  und Zeigerdiagrammen, die im reinen Text verlorengehen
* den extrahierten Frage- und Lösungstext sowie den offiziellen Antwortschlüssel
* deine konkrete Rückfrage, falls du eine eingetippt hast
* einen deutschen System-Prompt, der Formeln in gut lesbarem Unicode-Text verlangt
  (`U_eff = û/√2` statt LaTeX), weil die Seite kein LaTeX rendert

Ausserdem sind zwei Dinge aktiviert, die du bei Bedarf in `server.js` entfernen kannst:

* **Prompt-Caching** auf dem Frage-Kontext – Folgefragen zur selben Frage sind dadurch
  deutlich günstiger.
* **Server-seitige Fallbacks** (`fallbacks: "default"`). Lehnt ein Sicherheitsfilter
  eine Anfrage ab, beantwortet sie automatisch ein Ersatzmodell, statt einfach
  abzubrechen.

Antworten werden gestreamt, erscheinen also Wort für Wort.

---

## Öffentlich stellen

Die Seite selbst ist statisch und läuft auf **GitHub Pages**. Nur die Erklärfunktion
braucht einen Server, weil der API-Schlüssel niemals in den Browser darf – dafür
liegt im Ordner `worker/` ein kleiner **Cloudflare Worker**.

### 1 · Seite veröffentlichen

`.github/workflows/pages.yml` lädt bei jedem Push auf `main` den Ordner `web/` zu
GitHub Pages hoch. Einmalig muss die Quelle umgestellt werden:

> Repository → **Settings** → **Pages** → *Build and deployment* → **Source: GitHub Actions**

Danach ist die Seite erreichbar unter
<https://mattiadipalma.github.io/NuS2-Theorie-Fragen/>.

Ab hier funktioniert alles ausser der Erklärfunktion – Fragen, Bilder, Filter und
Fortschritt laufen rein im Browser.

### 2 · Erklärfunktion veröffentlichen

```bash
cd worker
npm install
npx wrangler login                          # einmalig, öffnet den Browser
npx wrangler secret put ANTHROPIC_API_KEY   # Schlüssel eingeben, wird nicht im Repo gespeichert
npx wrangler deploy
```

`wrangler deploy` gibt am Ende eine Adresse aus, etwa
`https://nus2-erklaeren.dein-name.workers.dev`.

### 3 · Seite und Worker verbinden

In `web/konfig.js` diese Adresse eintragen – mit `/api/erklaeren` am Ende:

```js
window.NUS2_API = 'https://nus2-erklaeren.dein-name.workers.dev/api/erklaeren';
```

Committen, pushen, fertig. Beim lokalen Betrieb (`npm start`) den Wert leer lassen,
dann beantwortet `server.js` die Anfragen selbst.

### Was der Worker macht

Er nimmt nur die Frage-Nummer und deine Rückfrage entgegen. Fragetext, Antwort-
schlüssel und Bild holt er sich selbst von der veröffentlichten Seite – der Browser
kann also keinen beliebigen Text an die Claude-API durchreichen.

Gegen Missbrauch der API-Kosten sind zwei Bremsen eingebaut, beide in
`worker/wrangler.toml` einstellbar:

* `ERLAUBTE_HERKUNFT` – nur die eigene Seite darf den Worker aufrufen.
* `ANFRAGEN_PRO_STUNDE` – Obergrenze pro IP-Adresse (Standard 40).

Wer es strenger will, ergänzt im Cloudflare-Dashboard unter *Security → WAF →
Rate limiting rules* eine zusätzliche Regel. Mit `CLAUDE_MODELL = "claude-sonnet-5"`
lassen sich die Kosten pro Anfrage deutlich senken.

---

## Aufbau

```
server.js                  Express-Server für lokal: liefert /web aus + POST /api/erklaeren
web/
  index.html               Seitengerüst
  style.css                Gestaltung, Hell- und Dunkelmodus
  app.js                   Filter, Fragekarte, Bewertung, Claude-Stream
  konfig.js                Adresse des Claude-Backends (leer = lokaler Server)
  fragen.json              176 Fragen mit Typ, Thema, Punkten, Antwortschlüssel
  fragen/*.png             Frage- und Lösungsbilder (aus den PDFs geschnitten)
  fragen/ki/*.jpg          verkleinerte Fassungen für die Claude-Anfrage
worker/                    Cloudflare Worker: dasselbe /api/erklaeren für die
                           veröffentlichte Seite
werkzeuge/extrahieren.py   erzeugt fragen.json und die Bilder neu aus den PDFs
*.pdf                      die beiden Moodle-Exporte (Quelle der Daten)
```

### Woher die Fragen kommen

Die Daten stammen direkt aus den beiden Moodle-PDF-Exporten im Repository. Moodle
rendert jede Frage in ein hellblaues Kästchen und jede Musterlösung in ein cremefarbenes –
genau daran wurden die Fragen getrennt. Jede Frage wird als Bildausschnitt aus dem PDF
gerendert statt in HTML nachgebaut: So bleiben Formeln, Schaltbilder und
Zeigerdiagramme exakt erhalten. Parallel liegt der extrahierte Text vor – für Suche,
Themenzuordnung und als Kontext für Claude.

Fragen, die im PDF über einen Seitenumbruch laufen, werden aus mehreren Ausschnitten
zusammengesetzt.

Neu erzeugen lässt sich alles mit:

```bash
pip install pymupdf pillow
python werkzeuge/extrahieren.py
```

---

## Bekannte Grenzen

* Die Moodle-Oberfläche im Export ist italienisch, deshalb steht in den Bildern
  „Scegli un'alternativa“ statt „Wähle eine Antwort“. Das lässt sich ohne
  Neu-Export aus Moodle nicht ändern.
* Bei 52 Fragen sind die Antwortmöglichkeiten reine Bilder – dort gibt es
  Selbstkontrolle statt automatischer Bewertung (siehe oben).
* Die Themenzuordnung erfolgt über Stichwörter im Fragetext. 20 Fragen mit sehr
  wenig Text landen unter *Sonstiges*.
* Zu 6 offenen Fragen enthält der Moodle-Export keine Musterlösung. Dort hilft die
  Claude-Erklärung weiter.
