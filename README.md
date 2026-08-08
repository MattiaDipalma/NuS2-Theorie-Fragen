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
npm start
```

Danach <http://localhost:3000> im Browser öffnen.

Die Seite braucht keinen Server-Schlüssel: Wer die Erklärfunktion nutzen will,
trägt in der Seitenleiste seinen **eigenen** Claude-API-Schlüssel ein. Alles andere
– Fragen, Lösungen, Filter und Fortschritt – läuft ohnehin rein im Browser.

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

## Claude-Erklärungen: eigener Schlüssel

Die Erklärfunktion (`+ Erkläre mir das`) schickt die Frage an die Claude API und
streamt die Antwort zurück in die Seite. **Jede Person benutzt dafür ihren eigenen
API-Schlüssel** – es gibt keinen gemeinsamen Schlüssel, den alle mitverbrauchen.

1. Schlüssel holen unter <https://console.anthropic.com/settings/keys>
2. In der Seitenleiste unter *Claude-Erklärungen* eintragen und speichern

Der Schlüssel wird beim Speichern einmal geprüft und liegt danach im
`localStorage` des Browsers – wie der Lernfortschritt, also gerätelokal. Er geht
ausschliesslich an `api.anthropic.com`.

> **Wichtig:** Ein Claude-Abo (Pro/Max auf claude.ai) reicht dafür **nicht**. Die
> API rechnet getrennt ab, nach verbrauchten Tokens. Ein Konto auf
> console.anthropic.com mit etwas Guthaben ist nötig; eine einzelne Erklärung
> kostet aber nur Bruchteile eines Rappens.

Ohne Schlüssel funktioniert alles andere ganz normal: Fragen, Lösungen, Filter
und Fortschritt laufen rein im Browser.

### Wie die Anfrage aussieht

Pro Anfrage schickt der Browser an die Messages-API:

* **Modell** `claude-opus-5` (in `quelle/claude.js` änderbar, z. B. auf
  `claude-sonnet-5` für weniger Kosten)
* **das Bild der Frage** – entscheidend, denn viele Fragen bestehen aus Schaltbildern
  und Zeigerdiagrammen, die im reinen Text verlorengehen
* den extrahierten Frage- und Lösungstext sowie den offiziellen Antwortschlüssel
* deine konkrete Rückfrage, falls du eine eingetippt hast
* einen deutschen System-Prompt, der Formeln in gut lesbarem Unicode-Text verlangt
  (`U_eff = û/√2` statt LaTeX), weil die Seite kein LaTeX rendert

Ausserdem sind zwei Dinge aktiviert, die du bei Bedarf in `quelle/claude.js`
entfernen kannst:

* **Prompt-Caching** auf dem Frage-Kontext – Folgefragen zur selben Frage sind dadurch
  deutlich günstiger.
* **Server-seitige Fallbacks** (`fallbacks: "default"`). Lehnt ein Sicherheitsfilter
  eine Anfrage ab, beantwortet sie automatisch ein Ersatzmodell, statt einfach
  abzubrechen.

Antworten werden gestreamt, erscheinen also Wort für Wort.

### Was das für die Sicherheit heisst

Der Browser spricht die Claude-API direkt an (`dangerouslyAllowBrowser` im SDK).
Das ist hier vertretbar, weil der Schlüssel der Person gehört, die ihn eintippt,
und ihren Rechner nicht verlässt – es gibt keinen Server, der ihn halten oder
weitergeben könnte. Zwei Dinge trotzdem beachten:

* Auf einem **geteilten oder öffentlichen Rechner** keinen Schlüssel speichern
  (bzw. danach *Schlüssel entfernen* drücken).
* Am besten einen **eigenen Schlüssel nur für diese Seite** anlegen, mit
  Ausgabenlimit im Anthropic-Konto. Dann lässt er sich jederzeit einzeln sperren.

---

## Öffentlich stellen

Die Seite ist rein statisch und läuft auf **GitHub Pages** – kein Server, keine
Geheimnisse im Repository, kein Hosting-Konto.

`.github/workflows/pages.yml` bündelt bei jedem Push auf `main` die Claude-Anbindung
(`quelle/claude.js` → `web/claude.js`) und lädt den Ordner `web/` zu GitHub Pages hoch.
Einmalig muss die Quelle umgestellt werden:

> Repository → **Settings** → **Pages** → *Build and deployment* → **Source: GitHub Actions**

Danach ist die Seite für alle erreichbar unter
<https://mattiadipalma.github.io/NuS2-Theorie-Fragen/>.

Jede Besucherin trägt bei Bedarf ihren eigenen Schlüssel ein (siehe oben) und zahlt
damit nur ihre eigenen Anfragen.

---

## Aufbau

```
quelle/claude.js           Claude-Anbindung; wird zu web/claude.js gebündelt
server.js                  kleiner statischer Server für die lokale Entwicklung
web/
  index.html               Seitengerüst
  style.css                Gestaltung, Hell- und Dunkelmodus
  app.js                   Filter, Fragekarte, Bewertung, Schlüsselverwaltung
  claude.js                erzeugt von `npm run build` (nicht im Repository)
  fragen.json              176 Fragen mit Typ, Thema, Punkten, Antwortschlüssel
  fragen/*.png             Frage- und Lösungsbilder (aus den PDFs geschnitten)
  fragen/ki/*.jpg          verkleinerte Fassungen für die Claude-Anfrage
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
