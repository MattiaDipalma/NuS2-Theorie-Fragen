/**
 * Leerer Ersatz für node:fs und node:path.
 *
 * Das Anthropic-SDK lädt beides nur nachträglich (`await import(...)`), um
 * Zugangsdaten von der Festplatte zu lesen. Im Browser gibt es keine
 * Festplatte – und wir übergeben den Schlüssel ohnehin direkt –, also wird
 * dieser Pfad nie ausgeführt. Der Ersatz verhindert bloss, dass esbuild
 * beim Bündeln über die fehlenden Node-Module stolpert.
 */
export default {};
