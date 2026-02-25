# Invoice2E — TODO / Feature Roadmap

_Erstellt: 2026-02-25 | Basiert auf: Audit V4 + Konkurrenzanalyse_

---

## 🔴 Priorität: HOCH (Business Impact)

### 1. Homepage Hero-Text optimieren

**Warum:** Alle Konkurrenten (zugferd-rechnung.com, xrechnung.io) erstellen Rechnungen von Null. Unser USP ist "bestehende PDFs konvertieren" — das muss im Hero sofort klar sein.
**Aufwand:** ~1h
**Tasks:**

- [ ] Hero H1 ändern: "PDF-Rechnungen in E-Rechnungen umwandeln" statt generisch
- [ ] Subtitle: "Laden Sie Ihre bestehende PDF hoch — KI extrahiert, validiert und konvertiert in XRechnung, ZUGFeRD & 7 weitere Formate"
- [ ] Upload-Icon/Animation im Hero (visuelles Verständnis)
- [ ] DE + EN Translations

### 2. Social Proof Counter

**Warum:** invoice-converter.com zeigt "20,000+ invoices processed". Wir zeigen nichts.
**Aufwand:** ~2-3h
**Tasks:**

- [ ] Supabase RPC `get_invoice_count()` erstellen
- [ ] API Route `GET /api/stats` (cached, public)
- [ ] `SocialProofCounter` Component im Hero
- [ ] Anzeige: "X Rechnungen konvertiert · 100% EN 16931 konform · Unter 30 Sekunden"
- [ ] Fallback für niedrige Zahlen (Minimum-Floor oder Trust-Badges stattdessen)

### 3. Audit V4 offene Fixes

**Warum:** 2 High-Findings noch offen
**Aufwand:** ~4-6h
**Tasks:**

- [ ] H-001: Zod-Validierung auf 12 POST-Routes (data-deletion, data-export, create-checkout, batch-\*, templates, keys, files/upload)
- [ ] M-001: `any` Types reduzieren (40 → <15)
- [ ] M-004: Test-Typen fixen (`@types/jest` oder Vitest config)
- [ ] M-008: Minor Dependency Updates (`npm update`)

### 4. Deutsche Sprache als Default

**Warum:** 90%+ der Zielgruppe ist deutsch. Alle Konkurrenten sind DE-first.
**Aufwand:** ~1h
**Tasks:**

- [ ] Default-Locale auf `de` setzen (statt `en`)
- [ ] `Accept-Language` Header auswerten als Fallback
- [ ] Testen: Neue User sehen DE, können auf EN wechseln

---

## 🟡 Priorität: MITTEL (SEO + Conversion)

### 5. Kostenloser XRechnung Viewer (Web)

**Warum:** Quba ist Desktop-only, kein guter Web-Viewer existiert. Riesige SEO-Chance für "XRechnung anzeigen/lesen" Keywords. Traffic-Magnet → Upsell auf Conversion.
**Aufwand:** ~2 Tage
**Tasks:**

- [ ] Route: `/xrechnung-viewer`
- [ ] Client-side XML Parser (`DOMParser` im Browser)
- [ ] XRechnung BT-Felder → visuelles Invoice-Layout mappen
- [ ] Drag & Drop Upload Zone für XML-Dateien
- [ ] 100% client-side (kein Server, keine Credits, kein Login)
- [ ] CTA: "XRechnung erstellen? Jetzt PDF konvertieren →"
- [ ] SEO: JSON-LD, einzigartige Meta-Tags
- [ ] i18n DE + EN

### 6. XRechnung Validator (Web)

**Warum:** Beliebtes Keyword, Traffic-Magnet, baut Vertrauen auf.
**Aufwand:** ~2-3 Tage
**Tasks:**

- [ ] Route: `/xrechnung-validator`
- [ ] Client-side Validation (Subset von Schematron-Regeln → JS)
- [ ] ODER Server-side via KoSIT Validator (rate-limited: 5/Tag anonym, unlimited eingeloggt)
- [ ] Ergebnis-Anzeige: ✅ Pass / ❌ Fail pro Regel (BR-DE-_, BR-CO-_)
- [ ] CTA: "Validierung fehlgeschlagen? Invoice2E erstellt valide XRechnungen →"

### 7. ZUGFeRD Validator (Web)

**Warum:** Ergänzung zum XRechnung Validator für PDF-Hybrid-Rechnungen.
**Aufwand:** ~1-2 Tage (aufbauend auf #6)
**Tasks:**

- [ ] Route: `/zugferd-validator`
- [ ] PDF hochladen → eingebettetes XML extrahieren → validieren
- [ ] pdf-lib oder PDF.js für XML-Extraktion aus PDF/A-3
- [ ] Gleiche Validation-UI wie #6

### 8. Leitweg-ID Lookup Tool

**Warum:** Nischen-Keyword, kaum Konkurrenz, relevante Zielgruppe (B2G).
**Aufwand:** ~2 Tage
**Tasks:**

- [ ] Route: `/leitweg-id`
- [ ] Supabase Tabelle `leitweg_ids` (authority_name, leitweg_id, state, portal)
- [ ] Datenquelle: Offizielles Verzeichnis scrapen/importieren
- [ ] Suchfeld mit Autocomplete
- [ ] CTA: "Rechnung an diese Behörde senden? PDF zu XRechnung konvertieren →"

### 9. Homepage: Supported Formats Grid

**Warum:** Homepage zeigt nicht welche 9 Formate unterstützt werden. Verlinkt auch nicht auf Format-Landing-Pages (SEO internal linking).
**Aufwand:** ~2h
**Tasks:**

- [ ] `SupportedFormats` Section auf Homepage nach "How It Works"
- [ ] Grid mit 9 Format-Cards (Flag, Name, Output-Type Badge)
- [ ] Jede Card verlinkt auf `/pdf-to-{format}` Landing Page
- [ ] i18n DE + EN

### 10. Pricing prominenter auf Homepage

**Warum:** invoice-converter versteckt Pricing. Transparenz schafft Vertrauen.
**Aufwand:** ~1h
**Tasks:**

- [ ] Pricing-Section auf Homepage vergrößern
- [ ] "Ab 0€ — kostenlose Credits bei Registrierung" prominent anzeigen
- [ ] "Keine Kreditkarte erforderlich" Badge

---

## 🟢 Priorität: NIEDRIG (Nice-to-have)

### 11. Email-Verifizierung testen (Brevo)

**Warum:** Flow nach Migration prüfen.
**Tasks:**

- [ ] Signup → Email erhalten? → Link klicken → Verifiziert?
- [ ] Edge Cases: Expired Link, Resend

### 12. Payment End-to-End Test

**Warum:** Stripe + PayPal im Live-Modus testen.
**Tasks:**

- [ ] Stripe Checkout → Zahlung → Credits erhalten?
- [ ] PayPal Checkout → Zahlung → Credits erhalten?
- [ ] Webhook-Verarbeitung korrekt?

### 13. Landing Page CTA Conversion optimieren

**Warum:** A/B Testing, bessere CTA-Texte.
**Tasks:**

- [ ] CTA-Button-Text testen: "Jetzt konvertieren" vs "Kostenlos starten" vs "PDF hochladen"
- [ ] CTA-Farbe/Position optimieren
- [ ] Exit-Intent Popup (optional, DSGVO-konform)

### 14. Testimonials / Reviews Section

**Warum:** Social Proof über Counter hinaus.
**Tasks:**

- [ ] Testimonial-Cards auf Homepage
- [ ] Echte Reviews sammeln (nach ersten zahlenden Kunden)
- [ ] Trustpilot / Google Reviews Widget (optional)

### 15. `/free` Landing Page

**Warum:** Zieht "kostenlos XRechnung erstellen" Suchende an.
**Tasks:**

- [ ] Route: `/free` oder `/kostenlos`
- [ ] Content: Was ist kostenlos? (X Credits), was kostet extra?
- [ ] CTA → Signup

### 16. API Documentation (Public)

**Warum:** Developer/Integratoren als Zielgruppe.
**Tasks:**

- [ ] Route: `/docs/api`
- [ ] OpenAPI/Swagger Spec
- [ ] Code-Beispiele (curl, Python, Node.js)
- [ ] API Key Management Doku

### 17. Format-spezifische Blog-Posts

**Warum:** Jeder Blog-Post rankt für eigene Keywords.
**Tasks:**

- [ ] "FatturaPA: Alles was deutsche Unternehmen wissen müssen"
- [ ] "KSeF Polen 2026: Der ultimative Guide"
- [ ] "PEPPOL BIS 3.0 erklärt"
- [ ] "ZUGFeRD vs XRechnung: Was ist der Unterschied?" (existiert schon, erweitern)

### 18. Static Generation für restliche Marketing-Pages

**Warum:** Performance + Caching.
**Tasks:**

- [ ] Homepage `force-static` (wenn möglich)
- [ ] Pricing Page `force-static`
- [ ] Blog Pages prüfen

---

## ✅ Kürzlich erledigt

- [x] Phase 1: 9 Format-SEO-Landing-Pages + Convert Hub
- [x] Phase 2: Format-Auswahl im Dashboard vor Upload
- [x] Vercel Analytics + Speed Insights
- [x] Header Formats-Dropdown + Footer-Umbau
- [x] Sitemap mit allen neuen Seiten
- [x] JSON-LD Schema.org (FAQPage + SoftwareApplication)
- [x] SEO-Fixes: Doppelte Titles, robots.txt, /convert in Sitemap
- [x] Audit V4: Rate Limiting (data-export, data-deletion, keys, batch-download)
- [x] Audit V4: Static Generation für Format-Seiten
- [x] Audit V4: npm audit fix (minimatch)
- [x] Audit V4: .env.example erstellt
- [x] Datenschutz, Impressum, Nutzungsbedingungen (DSGVO-konform)
- [x] Signup Privacy Consent Checkbox
- [x] Audit V3: Logger, TSConfig, CSP, Logo Base64

---

_Maintained by MO ⚡_
