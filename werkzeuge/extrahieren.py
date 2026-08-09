#!/usr/bin/env python3
"""
Erzeugt web/fragen.json und web/fragen/*.png aus den beiden Moodle-PDF-Exporten.

    pip install pymupdf pillow
    python werkzeuge/extrahieren.py

Moodle rendert jede Frage in ein hellblaues und jede Musterloesung in ein
cremefarbenes Kaestchen. Genau an diesen Fuellfarben werden die Fragen getrennt.
Jede Frage wird als Bildausschnitt gerendert, damit Formeln und Schaltbilder
exakt erhalten bleiben; parallel wird der Text fuer Suche, Themenzuordnung und
als Kontext fuer Claude extrahiert.

Wichtig: Die PDFs sind Moodle-Exporte einer *korrigierten* Abgabe. In den
Fragekaestchen stehen deshalb bereits die Loesungsmarken - ein rotes
FontAwesome-Kreuz an der falschen und ein gruenes Haekchen an der richtigen
Antwort. Diese Marken werden vor dem Rendern aus den Fragekaestchen entfernt
(nur dort - die Musterloesung bleibt vollstaendig), damit die Fragebilder
aussehen wie im unbeantworteten Test.
"""
import pymupdf, re, json, os, unicodedata, glob
from collections import Counter
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + os.sep
OUT  = BASE + "web/fragen"
os.makedirs(OUT, exist_ok=True)
DPI, BLUE, CREAM = 110, (0.902, 0.949, 0.957), (1.0, 0.965, 0.906)
SOURCES = [("mc", "Alle MC Fragen NUS 2_ Revisione tentativo _ Moodle Course.pdf", "MC-Test"),
           ("cl", "Clicker Fragen aus der Vorlesung_ Revisione tentativo _ Moodle Course.pdf", "Clicker")]

# Loesungsmarken in den Fragekaestchen: das rote Kreuz ist ein FontAwesome-Zeichen,
# das gruene Haekchen eine Vektorgrafik in genau dieser Fuellfarbe.
KREUZ_ZEICHEN, HAEKCHEN_FARBE = "\uf05c", (0.565, 0.408, 0.184)

def norm(s):
    s = unicodedata.normalize("NFKC", s).replace("\xa0", " ")
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", s)).strip()

def boxes(page, colour):
    out = []
    for dr in page.get_drawings():
        r, fl = dr["rect"], dr.get("fill")
        if fl and r.width >= 500 and r.height >= 25 and tuple(round(x, 3) for x in fl) == colour:
            out.append(pymupdf.Rect(r))
    out.sort(key=lambda r: (r.y0, -r.height))
    kept = []
    for r in out:
        if not any(k.y0 - 2 <= r.y0 and r.y1 <= k.y1 + 2 for k in kept):
            kept.append(r)
    return kept

def marken_rechtecke(page, kasten):
    """Rechtecke aller Loesungsmarken innerhalb eines Fragekaestchens."""
    out = []
    for blk in page.get_text("dict", clip=kasten)["blocks"]:
        if blk["type"] != 0:
            continue
        for line in blk["lines"]:
            for s in line["spans"]:
                if "FontAwesome" in s["font"] and KREUZ_ZEICHEN in s["text"]:
                    out.append(pymupdf.Rect(s["bbox"]))
    for dr in page.get_drawings():
        r, fl = dr["rect"], dr.get("fill")
        if fl and tuple(round(x, 3) for x in fl) == HAEKCHEN_FARBE and r.intersects(kasten):
            out.append(pymupdf.Rect(r))
    return out

def entferne_loesungsmarken(doc):
    """Loescht die Kreuze und Haekchen aus allen Fragekaestchen des Dokuments.

    Nur die Marken selbst werden entfernt; Hintergrund, Tabellenlinien, die
    leeren Auswahlkreise und der Fragetext bleiben unveraendert stehen. Die
    cremefarbenen Loesungskaestchen werden nicht angefasst.
    """
    entfernt = 0
    for page in doc:
        marken = [m for kasten in boxes(page, BLUE) for m in marken_rechtecke(page, kasten)]
        if not marken:
            continue
        for m in marken:
            page.add_redact_annot(m + (-1.5, -1.5, 1.5, 1.5), fill=False)
        # IF_COVERED: nur Vektorgrafik loeschen, die ganz im Rechteck liegt – sonst
        # verschwaende das grosse Kaestchen selbst, das die Marken ja beruehrt.
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                              graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        entfernt += len(marken)
    return entfernt

def collect(doc, colour):
    """Document-order list of runs; a run is [(page_index, rect), ...] merged across page breaks."""
    per_page = [boxes(p, colour) for p in doc]
    bottoms  = [max([r.y1 for r in bs] + [0]) for bs in per_page]
    runs = []
    for pi, bs in enumerate(per_page):
        for bi, r in enumerate(bs):
            last_on_page  = bi == len(bs) - 1
            clipped       = last_on_page and r.y1 >= bottoms[pi] - 2
            starts_at_top = pi > 0 and bi == 0 and r.y0 < 260
            if starts_at_top and runs and getattr(runs[-1], "_open", False):
                runs[-1].append((pi, r))
            else:
                runs.append([(pi, r)])
            runs[-1]._open = clipped
    return [list(r) for r in runs]

data, dropped = [], 0
for tag, fname, label in SOURCES:
    doc = pymupdf.open(BASE + fname)
    print(f"{label}: {entferne_loesungsmarken(doc)} Lösungsmarken aus den Fragen entfernt")

    class L(list):
        pass
    def page_bottom(page):
        ys = [b[3] for b in page.get_text("blocks") if b[6] == 0 and b[0] < 1900]
        ys += [dr["rect"].y1 for dr in page.get_drawings()
               if dr["rect"].width < 2000 and dr["rect"].height < 20000]
        return max(ys + [0])

    def collect2(colour):
        per_page = [boxes(p, colour) for p in doc]
        bottoms  = [page_bottom(p) for p in doc]
        runs, open_ = [], False
        for pi, bs in enumerate(per_page):
            for bi, r in enumerate(bs):
                clipped = (bi == len(bs) - 1) and r.y1 >= bottoms[pi] - 4
                if pi > 0 and bi == 0 and r.y0 < 260 and runs and open_:
                    runs[-1].append((pi, r))
                else:
                    runs.append([(pi, r)])
                open_ = clipped
        return runs

    qruns, sruns = collect2(BLUE), collect2(CREAM)
    marks = {}
    for pi, page in enumerate(doc):
        for x0, y0, x1, y1, txt, _, t in page.get_text("blocks"):
            m = re.match(r"^Domanda (\d+)\s*$", txt.strip())
            if t == 0 and m and x0 < 345:
                marks.setdefault(pi, []).append((int(m.group(1)), y0))

    def key(run):  return (run[0][0], run[0][1].y0)
    used, n = set(), 0
    for qi, q in enumerate(qruns):
        qk   = key(q)
        nxt  = key(qruns[qi + 1]) if qi + 1 < len(qruns) else (10 ** 9, 0)
        qend = (q[-1][0], q[-1][1].y1)
        sol  = next((j for j, s in enumerate(sruns)
                     if j not in used and qend <= key(s) < nxt), None)
        if sol is not None:
            used.add(sol)

        def shots(run, suffix):
            parts, texts = [], []
            for k, (pi, r) in enumerate(run):
                pg  = doc[pi]
                pad = pymupdf.Rect(r.x0 - 8, r.y0 - 8, r.x1 + 8, r.y1 + 8) & pg.rect
                if pad.height < 12:
                    continue
                pix  = pg.get_pixmap(clip=pad, dpi=DPI)
                name = f"{tag}-{n:03d}{suffix}{k or ''}.png"
                pix.save(os.path.join(OUT, name))
                parts.append({"src": name, "w": pix.width, "h": pix.height})
                texts.append(norm(pg.get_text("text", clip=pad)))
            return parts, norm("\n".join(texts))

        n += 1
        fp, ft = shots(q, "-f")
        if not ft and sum(p["h"] for p in fp) < 120:
            for p in fp:
                os.remove(os.path.join(OUT, p["src"]))
            n -= 1; dropped += 1; continue
        lp, lt = shots(sruns[sol], "-l") if sol is not None else ([], "")

        pi0, y0 = qk
        moodle = next((num for num, y in marks.get(pi0, []) if y0 - 40 <= y <= q[0][1].y1), None)
        data.append({"id": f"{tag}-{n}", "quelle": label, "nr": n, "moodleNr": moodle,
                     "frage": fp, "frageText": ft, "loesung": lp, "loesungText": lt})

print("Fragen:", len(data), "| MC:", sum(1 for q in data if q["quelle"] == "MC-Test"),
      "| Clicker:", sum(1 for q in data if q["quelle"] == "Clicker"),
      "| verworfen:", dropped, "| ohne Lösung:", sum(1 for q in data if not q["loesung"]),
      "| mehrteilig:", sum(1 for q in data if len(q["frage"]) > 1))
raw = data

# ---------- Punkte aus der linken Moodle-Spalte ----------
punkte = {}
for tag, fname in [("mc", "Alle MC Fragen NUS 2_ Revisione tentativo _ Moodle Course.pdf"),
                   ("cl", "Clicker Fragen aus der Vorlesung_ Revisione tentativo _ Moodle Course.pdf")]:
    doc = pymupdf.open(BASE + fname)
    for page in doc:
        cur = None
        for x0, y0, x1, y1, txt, _, t in sorted(page.get_text("blocks"), key=lambda b: b[1]):
            if t or x0 >= 345:
                continue
            m = re.match(r"^Domanda (\d+)\s*$", txt.strip())
            if m:
                cur = int(m.group(1))
            p = re.search(r"max\.:\s*(\d+),(\d+)", txt)
            if p and cur:
                punkte[f"{tag}-{cur}"] = int(p.group(1)) + int(p.group(2)) / 100

# ---------- Themen ----------
THEMEN = [
    ("Netzwerkanalyse",        ["knotengleichung","maschengleichung","knotenregel","maschenregel","kirchhoff",
                                "überlagerung","superposition","ersatzquelle","thévenin","thevenin","norton",
                                "knotenpotential","zweipol","ersatzschaltbild"]),
    ("Transiente Vorgänge",    ["transient","einschaltvorgang","ausschaltvorgang","zeitkonstante","schalter",
                                "differentialgleichung","sprungantwort","homogene lösung","partikulär",
                                "aperiodisch","kriechfall","einschwing","anfangswert","endwert"]),
    ("Laplace-Transformation", ["laplace","bildbereich","bildfunktion","rücktransformation","partialbruch",
                                "pol-","polstelle","nullstelle","s-ebene","übertragungsfunktion h(s)"]),
    ("Fourier & Verzerrung",   ["fourier","oberschwingung","grundschwingung","klirr","nichtsinusförmig",
                                "verzerrungsblindleistung","spektrum","harmonische","rechteckspannung"]),
    ("Drehstrom",              ["drehstrom","dreiphasig","sternschaltung","dreieckschaltung","neutralleiter",
                                "aussenleiter","außenleiter","strangspannung","strangstrom","stern-dreieck",
                                "symmetrische last"]),
    ("Transformator & Kopplung",["transformator","gegeninduktivität","gekoppelte spule","magnetisch gekoppelt",
                                "übersetzungsverhältnis","streuinduktivität","kopplungsfaktor","übertrager"]),
    ("Filter & Frequenzgang",  ["tiefpass","hochpass","bandpass","bandsperre","bode","frequenzgang","filter",
                                " db","dekade","asymptot","amplitudengang","phasengang","übertragungsfunktion"]),
    ("Resonanz & Schwingkreis",["resonanz","schwingkreis","güte","bandbreite","verstimmung","grenzfrequenz",
                                "stromüberhöhung","spannungsüberhöhung","kennwiderstand"]),
    ("Leistung",               ["wirkleistung","blindleistung","scheinleistung","leistungsfaktor","cos φ",
                                "kompensation","blindstrom","leistungsanpassung","energie","wirkungsgrad",
                                "leistung"]),
    ("Impedanz & Ortskurven",  ["impedanz","admittanz","reaktanz","blindwiderstand","suszeptanz","ortskurve",
                                "reihenschaltung","parallelschaltung","widerstandsoperator"]),
    ("Zeiger & Effektivwerte", ["zeiger","effektivwert","scheitelwert","komplexe amplitude","phasenverschiebung",
                                "sinusförmig","kreisfrequenz","momentanwert","mittelwert","gleichrichtwert",
                                "zeigerdiagramm"]),
    ("Bauelemente & Grundlagen",["induktivität","kapazität","kondensator","spule","widerstand","ideale quelle",
                                "stromquelle","spannungsquelle","kurzschluss","leerlauf"]),
]

def thema(text):
    t = text.lower()
    best, score = "Sonstiges", 0
    for name, kws in THEMEN:
        s = sum(t.count(k) for k in kws)
        if s > score:
            best, score = name, s
    return best

# ---------- Aufbereiten ----------
def antwortschluessel(q):
    k = [{"True": "Richtig", "False": "Falsch"}.get(x, x)
         for x in re.findall(r":\s*(Richtig|Falsch|True|False)\b", q["loesungText"])]
    if len(k) == 8 and k[:4] == k[4:]:
        k = k[:4]
    return k

def optionen(q):
    return sorted(set(re.findall(r"^([a-h])\.\s*$", q["frageText"], re.M)))

out = []
for q in raw:
    ft, lt = q["frageText"], q["loesungText"]
    if "Scoring method" in ft:
        typ, schluessel, opts = "kprime", antwortschluessel(q), []
    elif "una o più" in ft:
        typ, schluessel, opts = "mehrfach", [], optionen(q)
    elif "Scegli" in ft:
        typ, schluessel, opts = "einfach", [], optionen(q)
    else:
        typ, schluessel, opts = "offen", [], []
    if typ == "kprime" and len(schluessel) != 4:
        typ, schluessel = "offen", []

    out.append({
        "id": q["id"], "nr": q["nr"], "quelle": q["quelle"],
        "typ": typ, "punkte": punkte.get(q["id"], 1.0),
        "thema": thema(ft + " " + lt),
        "schluessel": schluessel, "optionen": opts,
        "frage": q["frage"], "loesung": q["loesung"],
        "suchtext": re.sub(r"\s+", " ", (ft + " " + lt))[:1600],
    })

print("Fragen:", len(out))
print("Typen:", dict(Counter(q["typ"] for q in out)))
print("Quellen:", dict(Counter(q["quelle"] for q in out)))
print("Punkte:", dict(Counter(q["punkte"] for q in out)))
print("Themen:")
for t, c in Counter(q["thema"] for q in out).most_common():
    print(f"   {t:28s} {c}")

# ---------- Nachtrag: korrekte Buchstaben bei Auswahlfragen ----------
import unicodedata as _u
rawmap = {q["id"]: q for q in raw}

def _toks(s):
    return re.findall(r"[a-zäöüß0-9]{3,}", _u.normalize("NFKD", s.lower()))

def _optionen_text(ft):
    parts, res = re.split(r"^([a-h])\.\s*$", ft, flags=re.M), {}
    for i in range(1, len(parts) - 1, 2):
        res[parts[i]] = re.sub(r"\s+", " ", parts[i + 1]).strip()
    return res

def _loesungsteil(lt):
    m = re.search(r"(?:La risposta corretta è|Le risposte corrette sono)\s*:?\s*(.*)", lt, re.S)
    return m.group(1) if m else ""

for q in out:
    q["loesungBuchstaben"] = None
    if q["typ"] not in ("einfach", "mehrfach"):
        continue
    r = rawmap[q["id"]]
    otext, stext = _optionen_text(r["frageText"]), _loesungsteil(r["loesungText"])
    if not stext.strip():
        continue
    textual = {k: v for k, v in otext.items() if len(_toks(v)) >= 3}
    if not textual:
        continue
    st = set(_toks(stext))
    hits = [k for k, v in textual.items()
            if sum(t in st for t in _toks(v)) / len(_toks(v)) >= 0.7]
    if hits and (q["typ"] == "mehrfach" or len(hits) == 1):
        q["loesungBuchstaben"] = sorted(hits)

for q in out:
    q["autoBewertung"] = bool(q["schluessel"]) or bool(q["loesungBuchstaben"])

print("automatisch bewertbar:", sum(q["autoBewertung"] for q in out), "/", len(out))
json.dump(out, open(BASE + "web/fragen.json", "w"), ensure_ascii=False, separators=(",", ":"))

# ---------- Bilder verkleinern ----------
vorher = sum(os.path.getsize(f) for f in glob.glob(OUT + "/*.png"))
for f in glob.glob(OUT + "/*.png"):
    Image.open(f).convert("RGB").quantize(
        colors=128, method=Image.MEDIANCUT, dither=Image.NONE).save(f, optimize=True)
nachher = sum(os.path.getsize(f) for f in glob.glob(OUT + "/*.png"))
print(f"Anzeigebilder: {vorher/1e6:.1f} MB -> {nachher/1e6:.1f} MB")

# ---------- verkleinerte Fassungen fuer die Claude-Anfrage ----------
KI = os.path.join(OUT, "ki")
os.makedirs(KI, exist_ok=True)
for q in out:
    teile = [Image.open(os.path.join(OUT, p["src"])).convert("RGB") for p in q["frage"]]
    leinwand = Image.new("RGB", (max(t.width for t in teile), sum(t.height for t in teile)), "white")
    y = 0
    for t in teile:
        leinwand.paste(t, (0, y)); y += t.height
    s = min(1.0, 1200 / max(leinwand.size))
    if s < 1.0:
        leinwand = leinwand.resize((int(leinwand.width * s), int(leinwand.height * s)), Image.LANCZOS)
    leinwand.save(os.path.join(KI, f"{q['id']}.jpg"), "JPEG", quality=72, optimize=True)
print(f"KI-Bilder: {sum(os.path.getsize(f) for f in glob.glob(KI + '/*.jpg'))/1e6:.1f} MB")

json.dump(out, open(BASE + "web/fragen.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("geschrieben: web/fragen.json")
