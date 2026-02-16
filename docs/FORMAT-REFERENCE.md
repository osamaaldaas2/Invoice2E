# Format Reference

Technical details for each supported e-invoicing format.

---

## XRechnung CII (`xrechnung-cii`)

| Property | Value |
|----------|-------|
| **Standard** | XRechnung 3.0 (CIUS of EN 16931) |
| **Syntax** | UN/CEFACT Cross-Industry Invoice D16B |
| **Root element** | `rsm:CrossIndustryInvoice` |
| **Namespace** | `urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100` |
| **CustomizationID** | `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` |
| **Countries** | DE |
| **Required fields** | Buyer reference (Leitweg-ID), seller VAT ID, invoice number, dates |
| **Validation** | Structural XML checks + XRechnung business rules |
| **Limitations** | Leitweg-ID must be provided for German public sector |

---

## XRechnung UBL (`xrechnung-ubl`)

| Property | Value |
|----------|-------|
| **Standard** | XRechnung 3.0 (CIUS of EN 16931) |
| **Syntax** | OASIS UBL 2.1 |
| **Root element** | `ubl:Invoice` |
| **Namespace** | `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` |
| **CustomizationID** | `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` |
| **Countries** | DE |
| **Required fields** | Same as XRechnung CII |
| **Validation** | Structural XML + UBL schema rules |
| **Limitations** | Same as CII variant |

---

## PEPPOL BIS 3.0 (`peppol-bis`)

| Property | Value |
|----------|-------|
| **Standard** | PEPPOL BIS Billing 3.0 |
| **Syntax** | OASIS UBL 2.1 |
| **Root element** | `ubl:Invoice` |
| **Namespace** | `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` |
| **CustomizationID** | `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` |
| **ProfileID** | `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` |
| **Countries** | 30 EU/EEA countries |
| **Required fields** | Endpoint IDs (scheme + value), invoice number, dates, VAT |
| **Validation** | PEPPOL business rules (aligned with EN 16931) |
| **Limitations** | Requires PEPPOL participant IDs for routing |

---

## Factur-X EN 16931 (`facturx-en16931`)

| Property | Value |
|----------|-------|
| **Standard** | Factur-X / ZUGFeRD 2.x — EN 16931 profile |
| **Syntax** | CII XML embedded in PDF/A-3 |
| **XML root** | `rsm:CrossIndustryInvoice` |
| **Namespace** | `urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100` |
| **Countries** | FR, DE, AT, CH, LU, BE |
| **Output** | PDF (with embedded XML attachment) |
| **Required fields** | Full EN 16931 mandatory set |
| **Validation** | CII structural + PDF embedding |
| **Limitations** | Requires source PDF for hybrid embedding |

---

## Factur-X Basic (`facturx-basic`)

| Property | Value |
|----------|-------|
| **Standard** | Factur-X / ZUGFeRD 2.x — Basic profile |
| **Syntax** | CII XML embedded in PDF/A-3 |
| **Countries** | FR, DE, AT, CH, LU, BE |
| **Output** | PDF |
| **Required fields** | Reduced set vs EN 16931 (no line-level detail required) |
| **Validation** | Basic profile CII rules |
| **Limitations** | Less detail than EN 16931; may not satisfy all recipient requirements |

---

## FatturaPA (`fatturapa`)

| Property | Value |
|----------|-------|
| **Standard** | FatturaPA 1.2.2 |
| **Syntax** | FatturaPA XML |
| **Root element** | `p:FatturaElettronica` |
| **Namespace** | `http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2` |
| **Countries** | IT |
| **Required fields** | Codice Fiscale / Partita IVA, Codice Destinatario, progressive number |
| **Validation** | FatturaPA schema rules |
| **Limitations** | Italy-specific tax codes required; regime fiscale must be set |

---

## KSeF FA(2) (`ksef`)

| Property | Value |
|----------|-------|
| **Standard** | KSeF FA(2) schema |
| **Syntax** | KSeF XML |
| **Root element** | `Faktura` |
| **Countries** | PL |
| **Required fields** | NIP (tax number), Polish-specific invoice fields |
| **Validation** | KSeF schema rules |
| **Limitations** | Poland-specific; requires NIP for both parties |

---

## NLCIUS / SI-UBL 2.0 (`nlcius`)

| Property | Value |
|----------|-------|
| **Standard** | NLCIUS (Dutch CIUS of EN 16931) / SI-UBL 2.0 |
| **Syntax** | OASIS UBL 2.1 |
| **Root element** | `ubl:Invoice` |
| **Namespace** | `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` |
| **CustomizationID** | `urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0` |
| **Countries** | NL |
| **Required fields** | KVK number or OIN, standard EN 16931 fields |
| **Validation** | NLCIUS business rules |
| **Limitations** | Netherlands-specific identifier requirements |

---

## CIUS-RO (`cius-ro`)

| Property | Value |
|----------|-------|
| **Standard** | CIUS-RO (Romanian CIUS of EN 16931) |
| **Syntax** | OASIS UBL 2.1 |
| **Root element** | `ubl:Invoice` |
| **Namespace** | `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` |
| **CustomizationID** | `urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1` |
| **Countries** | RO |
| **Required fields** | CUI/CIF tax identifier, standard EN 16931 fields |
| **Validation** | CIUS-RO rules for Romanian e-Factura |
| **Limitations** | Romania-specific tax ID format |
