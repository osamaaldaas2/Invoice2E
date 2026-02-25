# Validation Audit — Codebase vs. Official Specifications

_Erstellt: 2026-02-25 | Quellen: KoSIT XRechnung 3.0, Peppol BIS 3.0 v3.0.20 (May 2025), FatturaPA v1.4, KSeF FA(3), Factur-X 1.0 EN16931, NLCIUS SI-UBL 2.0, CIUS-RO_

---

## Zusammenfassung

| Format            | Regeln implementiert | Fehlende Regeln | Falsche Regeln | Bewertung |
| ----------------- | -------------------- | --------------- | -------------- | --------- |
| XRechnung CII/UBL | 15                   | 5               | 1              | ⚠️        |
| Peppol BIS 3.0    | 8                    | 2               | 0              | ✅        |
| FatturaPA         | 11                   | 2               | 0              | ✅        |
| KSeF FA(3)        | 9                    | 1               | 1              | ⚠️        |
| Factur-X EN16931  | 11                   | 1               | 1              | ⚠️        |
| Factur-X Basic    | 10                   | 0               | 0              | ✅        |
| NLCIUS            | Peppol + 3           | 0               | 0              | ✅        |
| CIUS-RO           | Peppol + 2           | 0               | 0              | ✅        |

**Gesamt: 3 falsche Regeln, 11 fehlende Regeln**

---

## 🔴 FALSCHE REGELN (sofort beheben)

### 1. XRechnung: BR-DE-15 (Buyer Reference / Leitweg-ID) — NUR WARNING statt FATAL

**Codebase** (`xrechnung-rules.ts:102`): `createWarning('BR-DE-15', ...)` — nur Warnung, und nur wenn `buyerReference` UND `invoiceNumber` leer sind.

**Offizielle Spec** (Peppol DE-R-015): `DE-R-015 — fatal — The element "Buyer reference" (BT-10) shall be provided.`

**Problem:** BT-10 (Buyer Reference) ist **FATAL/PFLICHT** für XRechnung, nicht optional. Die Leitweg-ID muss immer angegeben werden. Unser Code akzeptiert Rechnungen ohne Leitweg-ID mit nur einer Warnung → **diese werden vom KoSIT Validator abgelehnt**.

**Format-Field-Config:** `buyerReference: 'optional'` — muss `'required'` sein.

**Fix:**

- `xrechnung-rules.ts`: `createWarning` → `createError`, Bedingung ändern auf `if (!data.buyerReference?.trim())`
- `format-field-config.ts`: `buyerReference: 'required'` für xrechnung-cii und xrechnung-ubl

---

### 2. XRechnung: BR-DE-18 (EUR-only) — RICHTIG implementiert, ABER...

**Codebase** (`xrechnung-rules.ts:140`): Prüft `currency !== 'EUR'` → Error. ✅ Korrekt.

**Problem im Format-Field-Config:** `currency: 'required'` — OK, aber kein Hint dass es EUR sein MUSS. Der User kann "USD" eingeben, das Feld wird akzeptiert, erst die Validierung schlägt fehl. Besser: Dropdown auf EUR fixieren oder Warnung im UI.

**Kein Code-Fix nötig**, aber UX-Verbesserung empfohlen.

---

### 3. KSeF: Titel sagt "FA(2)" in `validation/ksef-rules.ts` Header

**Codebase** (`ksef-rules.ts:1`): Kommentar sagt "KSeF FA(3)" — aber Zeile 7: `FA(3) is mandatory since 1 February 2026`.

**Offiziell:** KSeF 2.0 mit Schema FA(3) ist seit 01.02.2026 Pflicht. FA(2) wird nicht mehr akzeptiert.

**Problem:** Der Code ist korrekt für FA(3), aber der format-field-config Kommentar sagt "KSeF FA(2)":

```
// ── KSeF FA(2) (Poland) ─────────────────────────
```

**Fix:** Kommentar auf "KSeF FA(3)" ändern.

---

### 4. Factur-X: Electronic Address (BT-34/BT-49) — WAR hidden, jetzt required

**Status:** ✅ **Bereits behoben** in dieser Session. `buyerElectronicAddress` und `sellerElectronicAddress` sind jetzt `'required'` für beide Factur-X Profile.

**Offiziell:** Factur-X EN 16931 Profile folgt EN 16931 Kern-Regeln. BT-34 und BT-49 sind im EN 16931 Profil als "conditional" spezifiziert — sie werden benötigt wenn der Exchange via Peppol erfolgt, aber nicht zwingend für rein bilaterale Übertragung.

**⚠️ KORREKTUR:** Für Factur-X sollten `buyerElectronicAddress` und `sellerElectronicAddress` **`'optional'`** sein, nicht `'required'`. Sie sind nur Pflicht wenn über Peppol versendet wird. Die aktuelle Config ist **zu streng**.

**Fix:**

- `format-field-config.ts`: Factur-X EN16931 + Basic → `buyerElectronicAddress: 'optional'`, `sellerElectronicAddress: 'optional'`
- `review.service.ts`: Factur-X aus `ELECTRONIC_ADDRESS_FORMATS` entfernen
- `ReadinessPanel.tsx`: `checkSellerElectronicAddress` und `checkBuyerEmail` aus Factur-X entfernen

---

## 🟡 FEHLENDE REGELN (mittelfristig)

### XRechnung — 5 fehlende

| Regel        | Offizielle Beschreibung                        | Severity |
| ------------ | ---------------------------------------------- | -------- |
| **DE-R-001** | Payment Instructions (BG-16) SHALL be provided | fatal    |
| **DE-R-008** | Buyer city (BT-52) SHALL be provided           | fatal    |
| **DE-R-009** | Buyer post code (BT-53) SHALL be provided      | fatal    |
| **DE-R-014** | VAT category rate (BT-119) SHALL be provided   | fatal    |
| **DE-R-018** | Skonto format in Payment Terms (BT-20)         | fatal    |

**Analyse:**

- DE-R-001 (Payment Instructions): Wir prüfen `paymentTerms` in `review.service.ts`, aber nicht die volle BG-16 Gruppe. Unser `paymentTerms: 'required'` in der Config deckt das teilweise ab. **Risiko: mittel** — die meisten Rechnungen haben Zahlungsbedingungen.
- DE-R-008/009 (Buyer City/PostalCode): Wir prüfen das NUR in `review.service.ts` für XRechnung (`isXRechnung` Block), aber in `xrechnung-rules.ts` (Validation Pipeline) existiert es als BR-DE-7/BR-DE-8. ✅ **Doppelt abgedeckt.**
- DE-R-014 (VAT rate pro Zeile): Wir prüfen NICHT ob jede Line Item einen `taxRate` hat. **Risiko: hoch** — fehlende Steuersätze werden vom KoSIT Validator abgelehnt.
- DE-R-018 (Skonto-Format): Spezifisches Format `#SKONTO#TAGE=N#PROZENT=N.NN#` — wir validieren das Format nicht. **Risiko: niedrig** — wenige Nutzer geben Skonto-Bedingungen ein.

### Peppol — 2 fehlende

| Regel                   | Beschreibung                                                     | Severity |
| ----------------------- | ---------------------------------------------------------------- | -------- |
| **PEPPOL-EN16931-R003** | Profile ID must be `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` | fatal    |
| **PEPPOL-EN16931-R007** | Invoice currency code must be valid ISO 4217                     | fatal    |

**Analyse:** R003 wird beim XML-Generieren gesetzt (nicht user-input). R007 wird in `facturx-rules.ts` geprüft aber nicht in `peppol-rules.ts` — **sollte hinzugefügt werden** für Konsistenz.

### FatturaPA — 2 fehlende

| Regel                       | Beschreibung                      | Severity |
| --------------------------- | --------------------------------- | -------- |
| **FPA-RegimeFiscale**       | RF01 Default wenn nicht angegeben | warning  |
| **FPA-FormatoTrasmissione** | FPA12 vs FPR12 (PA vs Ordinaria)  | fatal    |

**Analyse:** `RegimeFiscale` wird in `fatturapa-rules.ts` geprüft (FPA-036) ✅. Aber `FormatoTrasmissione` (ob PA oder B2B) wird nicht validiert — das wird beim XML-Generieren bestimmt. **Kein Fix nötig.**

### KSeF — 1 fehlende

| Regel                 | Beschreibung                        | Severity |
| --------------------- | ----------------------------------- | -------- |
| **KSEF-NIP-CHECKSUM** | NIP hat eine Prüfziffer (Modulo 11) | warning  |

**Analyse:** Wir prüfen nur die Länge (10 Ziffern), nicht die Checksumme. **Risiko: niedrig** — falsche NIPs werden vom KSeF-System abgelehnt.

### Factur-X — 1 fehlende

| Regel          | Beschreibung                     | Severity |
| -------------- | -------------------------------- | -------- |
| **FX-PDF/A-3** | Output muss PDF/A-3 konform sein | fatal    |

**Analyse:** Das ist eine Frage des PDF-Generators, nicht der Datenvalidierung. Muss beim PDF-Rendering sichergestellt werden. **Nicht in Validation Pipeline zu lösen.**

---

## ✅ KORREKT IMPLEMENTIERT

### XRechnung (10 von 15 korrekt)

- ✅ BR-DE-1: Seller street required
- ✅ BR-DE-2: Seller contact (Name + Phone + Email) required
- ✅ BR-DE-3: Seller city required
- ✅ BR-DE-4: Seller postal code required
- ✅ BR-DE-5/9: Seller country code required
- ✅ BR-DE-6: Buyer street required
- ✅ BR-DE-7: Buyer city required
- ✅ BR-DE-8: Buyer postal code required
- ✅ BR-DE-23-a: IBAN required for SEPA CT
- ✅ BR-CO-25: Payment terms or due date required

### Peppol (8 korrekt)

- ✅ PEPPOL-EN16931-R010: Buyer electronic address required
- ✅ PEPPOL-EN16931-R020: Seller electronic address required
- ✅ EAS scheme validation (116 codes)
- ✅ Tax category code validation (S, Z, E, AE, K, G, O, L, M)
- ✅ ISO 3166-1 country code validation
- ✅ Seller tax identifier required
- ✅ BR-AE-01: Reverse charge VAT IDs
- ✅ BR-E-01: Exempt 0% validation

### FatturaPA (11 korrekt)

- ✅ FPA-001–004: Basic required fields
- ✅ FPA-010: Seller Partita IVA required
- ✅ FPA-011–014: Seller address required
- ✅ FPA-020: Buyer identification (VAT or fiscal code)
- ✅ FPA-021: CodiceDestinatario format (7 chars)
- ✅ FPA-030–035: Line items + tax validation
- ✅ FPA-036: RegimeFiscale validation (RF01–RF19)

### KSeF (9 korrekt)

- ✅ KSEF-01: Seller NIP 10 digits
- ✅ KSEF-02: Buyer NIP or name
- ✅ KSEF-03: Invoice number (max 256)
- ✅ KSEF-04: Issue date
- ✅ KSEF-05: Currency
- ✅ KSEF-06: Line items
- ✅ KSEF-07: Line item validation
- ✅ KSEF-08: Polish tax rates (23, 22, 8, 7, 5, 0, zw, np, oo)
- ✅ KSEF-09: Total amount

### NLCIUS (Peppol + 3 NL-spezifisch)

- ✅ OIN format (0190: 20 digits)
- ✅ KVK format (0106: 8 digits)
- ✅ Dutch BTW format (NLxxxxxxxxxBxx)

### CIUS-RO (Peppol + 2 RO-spezifisch)

- ✅ CUI/CIF format (optional "RO" + up to 10 digits)
- ✅ RO VAT format (RO + 2-10 digits)

---

## 🔧 EMPFOHLENE FIXES (Priorität)

### Sofort (Breaking Bugs)

1. **XRechnung `buyerReference` → `required`** — Leitweg-ID ist Pflicht (DE-R-015 fatal)
2. **Factur-X Electronic Address → `optional`** — zu streng, war nur für Peppol-Versand nötig
3. **KSeF Kommentar FA(2) → FA(3)** — Kosmetik, aber verwirrend

### Mittelfristig

4. **DE-R-014: VAT rate per line item validieren** — `taxRate` als required in XRechnung line items
5. **Peppol: ISO 4217 currency validation hinzufügen** — Konsistenz
6. **KSeF: NIP Checksumme** — Modulo 11 Validierung

### Nice-to-have

7. DE-R-018: Skonto-Format validieren
8. XRechnung: BT-3 TypeCode validieren (326, 380, 381, 384, 389, 875-877)

---

_Dieser Audit basiert auf den offiziellen Spezifikationen Stand Februar 2026._
