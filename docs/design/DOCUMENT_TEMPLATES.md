# Printed Document Templates — Design Spec

**Issue:** #1404 · **Status:** Ready for implementation · **Audience:** backend engineers working on PDF generation in `apps/api`

This spec defines one base layout for every generated PDF and four variants built on it:
invoice, payment receipt, immunization certificate, and patient visit summary. All
measurements are in PDF points (1 pt = 1/72 in ≈ 0.353 mm), which is PDFKit's native unit.

---

## 1. Why this exists

Today each service lays out its own page:

| Service | Margins (T/B/L/R) | Page numbers | Confidentiality notice | QR |
|---|---|---|---|---|
| `invoices/invoice-pdf.service.ts` | 60 / 90 / 50 / 50 | none | none | Pay QR (SEP-7) centered, 120 pt |
| `payments/services/receipt-pdf.service.ts` | — (payload only, no renderer) | — | — | Explorer URL, not rendered |
| `immunizations/immunization-certificate.service.ts` | 50 / 60 / 50 / 50 + 2 pt coloured border | "Page X of Y" | inline in body | none |
| `export/pdf-generator.service.ts` | 50 / 50 / 50 / 50 | "Page X of Y" + timestamp | diagonal watermark | none |

Beyond looking different, three problems affect the printed result:

1. **Page numbers probably break on multi-page documents.** The certificate and export
   services call `doc.switchToPage(i)` without creating the document with
   `bufferPages: true`. Without buffering, earlier pages are already flushed and can't be
   revisited.
2. **Greyscale loss.** The certificate's adverse-reaction flag is only red text, and its
   border and table header use brand-blue fills. On a mono printer these become mid-grey,
   and the red flag reads the same as normal text.
3. **Missing glyphs.** The services use PDFKit's built-in Helvetica, which only covers
   WinAnsi (Latin-1). Yoruba (ẹ, ọ, ṣ, tone marks) and Hausa (ɓ, ɗ, ƙ) patient names render
   incorrectly, and so does the "⚠" used in the certificate.

---

## 2. Page setup

Both paper sizes use the same layout. Only the page box changes. Content width is
**page width − 2 × 48 pt**, so every element is placed relative to the content box and
never at absolute x positions like `x = 470`.

| | A4 | US Letter |
|---|---|---|
| Page | 595.28 × 841.89 | 612 × 792 |
| Side margins | 48 | 48 |
| Content width | 499.28 | 516 |
| Top margin (to header) | 36 | 36 |
| Header band height | 64 | 64 |
| Gap header → body | 20 | 20 |
| Footer zone (from bottom edge) | 60 | 60 |
| Body area height | 661.89 | 612 |

**Choosing the size:** use the clinic setting `document.paperSize` (`'A4' | 'LETTER'`).
If it isn't set, default to `LETTER` for clinics whose country is US, CA, MX, or PH, and
`A4` for everyone else.

Create every document this way:

```ts
new PDFDocument({
  size: paperSize,              // 'A4' | 'LETTER'
  margins: { top: 120, bottom: 72, left: 48, right: 48 }, // body frame; header/footer are drawn outside it
  bufferPages: true,            // required for "Page X of Y"
  autoFirstPage: true,
  pdfVersion: '1.7',
  tagged: true,                 // accessible structure tree (PDFKit ≥ 0.13)
  displayTitle: true,
  lang: locale,                 // e.g. 'fr', 'yo'
  info: { Title, Author: clinic.name, Subject, Creator: 'Health Watchers', Keywords },
});
```

`margins.top = 36 + 64 + 20 = 120` and `margins.bottom = 72` make PDFKit's automatic
text flow stay inside the body area. The header and footer are drawn at absolute
positions on every page.

---

## 3. Typography

### Typeface

Embed **Noto Sans** (Regular, Bold) and **Noto Sans Mono** (Regular). All three are
SIL OFL licensed, cover Latin Extended-A/B plus combining diacritics (Yoruba and Hausa),
and stay readable at small sizes on laser and inkjet printers. Store them in
`apps/api/assets/fonts/` and register them once:

```ts
doc.registerFont('body', FONTS.notoSansRegular);
doc.registerFont('bold', FONTS.notoSansBold);
doc.registerFont('mono', FONTS.notoSansMono);
```

Do not use Helvetica or any other built-in PDFKit font.

### Type scale

| Token | Font | Size / leading | Case | Used for |
|---|---|---|---|---|
| `docTitle` | bold | 18 / 22 | UPPERCASE, +0.5 pt tracking | "INVOICE", "PAYMENT RECEIPT" in header |
| `clinicName` | bold | 12 / 15 | as entered | Header, left column |
| `sectionHeading` | bold | 9 / 12 | UPPERCASE, +0.6 pt tracking | Section titles in body |
| `body` | body | 9.5 / 13.5 | sentence | Paragraphs, key–value values |
| `label` | body | 8 / 11 | sentence | Key–value labels, captions (`ink-muted`) |
| `tableHead` | bold | 8 / 11 | sentence | Table header row |
| `tableCell` | body | 9 / 12.5 | sentence | Table body |
| `amountTotal` | bold | 12 / 15 | — | Grand total line only |
| `mono` | mono | 8 / 11 | — | Tx hashes, IDs, ICD-10 codes, memo |
| `meta` | body | 7 / 9.5 | sentence | Footer, "generated on", QR captions |

Rules:
- Nothing prints smaller than **7 pt**. This keeps it readable after a 94% "fit to page" scale.
- Use bold for emphasis. Don't use italics, because Noto Sans Italic isn't embedded.
- Right-align numbers in tables and use tabular figures. Noto Sans figures are already
  tabular, so no extra setting is needed.

### Spacing scale

Use only these values for vertical rhythm (pt): **4, 8, 12, 16, 24, 32**.

| Between | Space |
|---|---|
| Section heading → its content | 8 |
| Section → next section heading | 24 |
| Key–value rows | 4 |
| Table rows (cell padding top/bottom) | 5 / 5 |
| Table cell padding left/right | 6 |
| Paragraphs | 8 |

---

## 4. Colour and greyscale

The palette is designed for greyscale first. The clinic's brand colour is decoration
only and never carries information.

| Token | Value | Greyscale L* | Use |
|---|---|---|---|
| `ink` | `#1A1A1A` | 10 | All primary text |
| `ink-muted` | `#595959` | 38 | Labels, captions, footer (contrast 7:1 on white) |
| `rule` | `#8C8C8C` | 58 | Table and section rules, 0.5 pt |
| `rule-strong` | `#1A1A1A` | 10 | Totals rule, stamp border, 1 pt |
| `fill-subtle` | `#EDEDED` | 94 | Table header background, callout boxes |
| `brand` | `clinic.branding.primaryColor` (default `#2563EB`) | varies | **Only** the 2 pt rule under the header |

Rules for greyscale printing:

1. **Brand colour appears in exactly one place:** the 2 pt rule under the header. Whatever
   its luminance, it prints as a visible line, and losing its hue loses no information.
2. **Status is always text.** PAID, VOID, DRAFT, OVERDUE, and COPY are shown as a stamp:
   an uppercase `docTitle`-size label inside a 1 pt `rule-strong` border. The stamp uses
   no fill and no colour.
3. **Warnings use a label and a shape, not colour.** An adverse reaction row starts with the
   bold word "Adverse reaction:" and gets a 2 pt `ink` bar on its left edge.
4. **Don't use zebra striping.** Light fills below about 8% grey disappear on many office
   printers. Separate rows with 0.5 pt `rule` lines instead.
5. **Fills are `fill-subtle` or nothing.** No mid-grey or brand-coloured panels, which
   use a lot of toner and hurt the contrast of any text on them.
6. **QR codes are always pure black (`#000000`) on white.** Never tint a QR code.
7. **Logos print as supplied.** In the clinic branding settings, tell admins to upload a
   logo that works in one colour (see §5.1).

**Acceptance check:** render each variant, convert it to greyscale
(`gs -sDEVICE=pdfwrite -sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray`),
and confirm by eye that every piece of information is still distinguishable. Also print
once on a mono laser printer.

---

## 5. Base template

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                               36 pt top margin                           │
 │ ┌────────────┐  Clinic Name (clinicName)           DOCUMENT TITLE ①      │
 │ │  LOGO  ②   │  12 Example Rd, Lagos (label)       No. INV-2026-0042     │ 64 pt
 │ │  ≤120×48   │  +234 800 000 0000 · Tax ID 123 ③   Issued 26 Sep 2026    │ header
 │ └────────────┘                                     [ PAID ] ④            │ band
 │══════════════════════════════════════════════════════════════════════════│ ⑤ 2 pt brand rule
 │                               20 pt                                      │
 │  SECTION HEADING ⑥                                                       │
 │  ────────────────────────────────────────────────────────────────────    │
 │  Label            Value                  Label            Value     ⑦    │
 │                                                                          │
 │  ┌──────────────────────────────────────────────────────────────────┐    │
 │  │ Table head (fill-subtle)                                         │ ⑧  │
 │  ├──────────────────────────────────────────────────────────────────┤    │
 │  │ row                                                              │    │
 │  └──────────────────────────────────────────────────────────────────┘    │
 │                                                                          │
 │                           … body flows here …                            │
 │                                                                          │
 │  ────────────────────────────────────────────────────────────────────    │ ⑨ 0.5 pt rule
 │  CONFIDENTIAL — This document contains personal health          Page 1  │
 │  information. If you received it in error, destroy it and …     of 3 ⑩  │ 60 pt
 │  Doc ID 7f3c…a91e · Generated 26 Sep 2026 14:02 WAT · Health Watchers ⑪  │ footer
 └──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Header (every page)

| # | Element | Spec |
|---|---|---|
| ① | Document title | `docTitle`, right-aligned to the content box, top of the band. |
| ② | Logo | Fit inside **120 × 48 pt**, keep the aspect ratio, align top-left. If there is no logo, move the clinic text block left to `x = margin`. Ask clinics for a logo with a transparent or white background that reads in one colour. |
| ③ | Clinic block | `clinicName`, then up to 2 `label` lines: address on one line, then phone · email · tax ID joined with " · ". Width = content width × 0.55. Wrap within that width; never overlap ①. |
| ④ | Doc meta + stamp | Right column, `label` / `body` pairs: number, issue date, and any variant-specific dates. The optional stamp (§4.2) sits below the meta, right-aligned. |
| ⑤ | Brand rule | 2 pt, full content width, at `y = 36 + 64`. |

**Continuation pages** (page 2 onward) use a compact header: clinic name (`label`, bold)
on the left, `docTitle` at 11 pt with the document number on the right, then the brand
rule. The body starts at the same `y = 120`.

### 5.2 Footer (every page)

| # | Element | Spec |
|---|---|---|
| ⑨ | Rule | 0.5 pt `rule`, at `y = pageHeight − 60`. |
| ⑩ | Confidentiality notice + page number | Notice: `meta`, `ink-muted`, left column, width = content − 72 pt, **at most 2 lines**. Page number: `meta`, right-aligned, text "Page {n} of {total}". |
| ⑪ | Provenance line | `meta`: `Doc ID {first 4}…{last 4}` (the full ID is in the PDF metadata) · `Generated {date time tz}` · `Health Watchers`. |

Draw the footer in a final pass after all content exists:

```ts
const { start, count } = doc.bufferedPageRange();
for (let i = start; i < start + count; i++) {
  doc.switchToPage(i);
  drawHeader(doc, ctx, { continuation: i > start });
  drawFooter(doc, ctx, { page: i - start + 1, total: count });
}
doc.flushPages();
```

**Confidentiality notice text** (localize it; see §8):

| Variant | Notice |
|---|---|
| Invoice, Receipt | "Confidential. This document contains personal and financial information intended only for the named recipient." |
| Immunization certificate | "Confidential health record issued to the named patient. Verify authenticity using the QR code on this certificate." |
| Visit summary | "CONFIDENTIAL — contains personal health information. If you received this in error, notify {clinic phone} and destroy all copies." |

### 5.3 Optional watermark

For `DRAFT`, `VOID`, and `COPY`, draw the word diagonally (−35°) and centred in the
body at 72 pt `bold`, `#000000` at **6% opacity**, behind the content. At that opacity it
stays visible in greyscale without covering the text. Draw it first on each page so text
sits on top of it.

---

## 6. Shared components

Every variant is built from these components. Implement each one once in
`components.ts` (§9).

### 6.1 Section heading
`sectionHeading` text, 4 pt gap, 0.5 pt `rule` across the content width, 8 pt gap.
**Keep-with-next:** if fewer than 48 pt remain in the body area, call `addPage()` before
drawing the heading.

### 6.2 Key–value grid
Two layouts:
- **1-up:** label column 32% of the width, value column 68%.
- **2-up:** two 1-up grids side by side with a 24 pt gutter. Use this for patient and
  encounter metadata.

Labels are `label` in `ink-muted`. Values are `body` in `ink`. For an empty value print
"—", never "N/A" or a blank. Never split a row across pages.

### 6.3 Data table
- Header row: `fill-subtle` background, `tableHead` text, 5 pt vertical padding.
- Body rows: `tableCell` text, 0.5 pt `rule` below each row, no vertical rules.
- Numeric columns are right-aligned; text columns left-aligned.
- Column widths are fractions of the content width (listed per variant), so the same
  table fits A4 and Letter.
- **Page breaks:** if a row doesn't fit, start a new page and **repeat the header row**,
  with "(continued)" appended to the preceding section heading.
- Long cell text wraps inside its cell. Rows grow in height; they are never truncated.

### 6.4 Totals block
Right-aligned, 45% of the content width. Rows are `body` label/value pairs; the grand
total is `amountTotal` with a 1 pt `rule-strong` above it. Never split the block across
pages.

### 6.5 QR block
```
 ┌──────────┐  Heading (bold 9 pt)
 │ ▓▓ QR ▓▓ │  One-line instruction (body)
 │ ▓▓▓▓▓▓▓▓ │  Target in mono, wrapped (e.g. short URL or hash)
 └──────────┘
```
- QR size **72 × 72 pt (25.4 mm)** minimum, which scans reliably from paper at arm's length.
- Error correction **M**, quiet zone **4 modules** (`QRCode.toBuffer(uri, { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#FFFFFF' } })`).
- Render as PNG at ≥ 300 px so it isn't resampled when printed.
- Text column to the right, 12 pt gap, top-aligned with the QR.
- Keep the whole block on one page.

### 6.6 Callout box
0.5 pt `rule` border, `fill-subtle` background, 8 pt padding, `body` text. Use it for
payment instructions and verification details.

### 6.7 Signature block
A 160 pt wide line (0.5 pt `ink`) with 36 pt of space above it for a signature image
(fit 160 × 36). Below the line: signer name (`body`, bold), then title and date (`label`).
Keep the block on one page.

---

## 7. Variants

Column widths below are fractions of the content width.

### 7.1 Invoice

**Header meta:** No. `{invoiceNumber}` · Issued `{issueDate}` · Due `{dueDate}`. Stamp:
`PAID`, `OVERDUE`, or `VOID` when applicable (`VOID` also gets the watermark).

```
 BILL TO                                   INVOICE DETAILS
 Adaeze Okafor                             Patient ID     HW-000123
 14 Allen Ave, Ikeja                       Encounter      ENC-7781 (12 Sep 2026)

 ITEMS
 Description                        Qty      Unit price          Amount
 Consultation — general               1       25.00 USDC       25.00 USDC
 Malaria RDT                          1        5.00 USDC        5.00 USDC
                                           ─────────────────────────────
                                           Subtotal          30.00 USDC
                                           Tax (0%)           0.00 USDC
                                           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                           Total due         30.00 USDC

 PAY WITH STELLAR
 ┌────────────────────────────────────────────────────────────────────┐
 │ [QR]  Scan to pay                                                  │
 │       Opens your Stellar wallet with the amount and memo filled in.│
 │       Destination  GABC…(full, mono, wrapped)                      │
 │       Memo         INV-2026-0042 (mono)                            │
 └────────────────────────────────────────────────────────────────────┘

 NOTES   (optional; branding.footerText)
 [Signature block — branding.signatureName / signatureTitle]
```

| Items column | Width | Align |
|---|---|---|
| Description | 0.46 | left |
| Qty | 0.10 | right |
| Unit price | 0.22 | right |
| Amount | 0.22 | right |

- The QR encodes the existing SEP-7 URI built in `invoices.controller.ts`
  (`web+stellar:pay?…`). Leave out the QR block when the invoice is `PAID` or `VOID`.
- Amounts: show as stored (up to 7 decimals, the Stellar precision) followed by the asset
  code. Don't round.
- `branding.headerText` (if set) goes directly under the brand rule as a centred `label`
  line, outside the header band.

### 7.2 Payment receipt

**Header meta:** Receipt No. `RCT-{paymentId}` · Paid `{paidAt}` (date + time + tz).
Stamp: `PAID` (always).

```
 RECEIVED FROM                              PAYMENT
 Adaeze Okafor                              Method       Stellar network (Public)
 Patient ID  HW-000123                      For invoice  INV-2026-0042

 SUMMARY
 Description                                                      Amount
 Consultation and lab tests                                   30.00 USDC
                                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                            Amount paid       30.00 USDC

 BLOCKCHAIN VERIFICATION
 ┌────────────────────────────────────────────────────────────────────┐
 │ [QR]  Verify this payment                                          │
 │       Scan to view the transaction on Stellar Expert.              │
 │       Transaction hash                                             │
 │       3f9a2c7e 4b1d0a8f 9c6e5b2a 7d4f1e0c                          │
 │       8b3a6d9f 2e5c1b7a 0f4d8e6c 9a2b5f3e   (mono, 4 × 8-char groups│
 │       Network  Public   Ledger  51 234 567   per line)             │
 └────────────────────────────────────────────────────────────────────┘
```

- QR target: `ReceiptPayload.explorerUrl` (already built in `receipt-pdf.service.ts`).
- **Always print the full hash.** Split it into 8-character groups separated by a space,
  4 groups per line, so staff can read it aloud or retype it. The QR is a shortcut, not a
  replacement for the hash.
- On `testnet`, add the `COPY` watermark and print "Test network — not a real payment" as
  the first body line (a `body` bold callout).

| Summary column | Width | Align |
|---|---|---|
| Description | 0.70 | left |
| Amount | 0.30 | right |

### 7.3 Immunization certificate

**Header meta:** Certificate No. `{certificateId}` · Issued `{issuedAt}`. The certificate
should fit on one page when there are ≤ 14 doses. Longer histories continue onto more
pages with a repeated table header.

```
 PATIENT
 Name           Adaeze Okafor               Date of birth   3 Mar 2019
 Patient ID     HW-000123                   Sex             Female

 VACCINATION HISTORY
 Date         Vaccine / Dose              Lot        Site     Administered by
 12 Jan 2020  Measles (MCV1) · Dose 1     MV2231     L arm    N. Bello, RN
 ▌Adverse reaction: mild fever, resolved in 24 h (Mild)
 04 Jun 2020  Yellow fever · Dose 1        YF8812     R arm    N. Bello, RN

 VERIFICATION
 ┌────────────────────────────────────────────────────────────────────┐
 │ [QR]  Verify this certificate                                      │
 │       Scan to confirm this certificate was issued by Sunrise Clinic│
 │       and has not been altered.                                    │
 │       https://app.healthwatchers.com/verify/c/9K2F-7QXA (mono)     │
 │       Checksum  A7F3 91C2                                          │
 └────────────────────────────────────────────────────────────────────┘

 [Signature block — authorising clinician]
```

| Table column | Width | Align |
|---|---|---|
| Date | 0.15 | left |
| Vaccine / Dose | 0.33 | left |
| Lot | 0.14 | left |
| Site | 0.12 | left |
| Administered by | 0.26 | left |

- **Drop the current 2 pt coloured page border.** Its colour disappears in greyscale, and
  it uses up the printer's unprintable edge area.
- Adverse reaction: a sub-row under its dose, indented 8 pt, with a 2 pt `ink` left bar,
  the text **"Adverse reaction:"** in bold, then the description and severity (§4.3).
  Don't use "⚠" or red.
- Verification QR target: `{WEB_URL}/verify/c/{certificateId}`. The checksum is the first
  8 hex characters of `SHA-256(certificateId + patientId + issuedAt + doseIds)`, grouped
  4 + 4.
  - **Backend dependency (not built yet):** create a `certificateId` when the certificate
    is issued, store the checksum inputs, and add a public, rate-limited
    `GET /verify/c/:id` page. That page shows the patient's initials, year of birth, the
    issuing clinic, and the dose list, and **no other PHI**.

### 7.4 Patient visit summary

**Header meta:** Visit No. `{encounterId}` · Visit date `{startedAt}`. A summary usually
runs 1–2 pages and has no stamp. `DRAFT` watermark until the encounter is signed.

```
 PATIENT                                    VISIT
 Name          Adaeze Okafor                Clinician    Dr. T. Adeyemi
 Patient ID    HW-000123                    Type         Outpatient
 Date of birth 3 Mar 2019 (7 y)             Duration     14:05 – 14:40

 REASON FOR VISIT
 Fever for 3 days, reduced appetite.                               (body)

 VITAL SIGNS
 Temp 38.4 °C    BP 100/65 mmHg    HR 112 bpm    RR 24 /min    SpO₂ 97%    Wt 21 kg
 (6-up grid: label above value, value in bold)

 ASSESSMENT
 Code (mono)  Diagnosis
 B54          Malaria, unspecified          Primary
 R50.9        Fever, unspecified

 PRESCRIPTIONS
 Medication                 Dose       Route   Frequency      Duration
 Artemether/lumefantrine    20/120 mg  Oral    Twice daily    3 days

 PLAN & FOLLOW-UP
 Return in 3 days or sooner if symptoms worsen. (body, paragraphs)

 [Signature block — attending clinician, "Electronically signed {date time}"]
```

| Assessment column | Width | Align |
|---|---|---|
| Code | 0.14 | left, `mono` |
| Diagnosis | 0.66 | left |
| (rank) | 0.20 | right |

| Prescriptions column | Width | Align |
|---|---|---|
| Medication | 0.34 | left |
| Dose | 0.16 | left |
| Route | 0.12 | left |
| Frequency | 0.20 | left |
| Duration | 0.18 | left |

- **Leave out empty sections entirely.** Don't print a heading with "—" under it.
- Vitals: a 6-up grid. Each cell is a `label` above a bold `body` value with its unit.
  Wrap to a second row if more than 6 vitals are recorded.
- Clinician free-text notes are **not** included by default (they may contain sensitive
  internal notes). Add a per-export toggle, `includeClinicalNotes`, that is off by default.

---

## 8. Localization and formatting

- Every fixed label (titles, section headings, column names, notices, "Page X of Y") comes
  from a message map keyed by locale (`en`, `fr`, `pt`, `yo`, `ha`). Mirror the web app's
  `apps/web/messages/*.json` structure under a `documents.*` namespace so the same
  translators can maintain it.
- Locale comes from the recipient (patient's preferred language). If the patient has
  none, use the clinic default, then `en`.
- Dates: `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: clinic.timezone })`.
  Times include the zone abbreviation.
- Stellar amounts: format the integer part with `Intl.NumberFormat(locale)` grouping. Keep
  the stored decimals exactly as they are, then add the asset code.
- Fiat amounts (if shown): `Intl.NumberFormat(locale, { style: 'currency', currency })`.
- Patient names, addresses, and free text render in Noto Sans (§3) so every supported
  script prints correctly.

---

## 9. Implementation plan

Suggested module layout:

```
apps/api/src/modules/documents/pdf/
  tokens.ts          # page sizes, margins, type scale, spacing, colours (this spec, as constants)
  fonts.ts           # font paths + registerFonts(doc)
  base-template.ts   # createDocument(opts) → { doc, ctx }; finalize(doc, ctx) draws headers/footers/watermarks
  components.ts      # sectionHeading, keyValueGrid, table, totals, qrBlock, callout, signature, stamp
  messages/{en,fr,pt,yo,ha}.json
  variants/
    invoice.ts               # replaces invoices/invoice-pdf.service.ts rendering
    receipt.ts               # consumes ReceiptPayload from payments/services/receipt-pdf.service.ts
    immunization-certificate.ts
    visit-summary.ts         # new; export/pdf-generator.service.ts's full-record export can reuse it
```

`base-template.ts` contract:

```ts
interface DocumentContext {
  variant: 'invoice' | 'receipt' | 'immunizationCertificate' | 'visitSummary';
  paperSize: 'A4' | 'LETTER';
  locale: Locale;
  timeZone: string;
  clinic: { name: string; address?: string; phone?: string; email?: string; taxId?: string;
            logo?: Buffer; brandColor?: string };
  title: string;                       // localized docTitle
  meta: Array<{ label: string; value: string }>;
  stamp?: 'PAID' | 'VOID' | 'DRAFT' | 'OVERDUE' | 'COPY';
  watermark?: 'VOID' | 'DRAFT' | 'COPY';
  documentId: string;                  // stored in PDF metadata + footer
}

createDocument(ctx): { doc: PDFKit.PDFDocument; ctx }
finalize(doc, ctx): void               // header + footer + watermark on each buffered page, then doc.end()
```

Migrate one variant at a time: **receipt** first (it has no renderer yet), then invoice,
then certificate, then visit summary and export. Each migration keeps its existing public
function signature, so controllers don't change.

---

## 10. Acceptance checklist

- [ ] All four variants are produced by `createDocument` / `finalize`. No variant draws its
      own header, footer, or page numbers.
- [ ] A4 and Letter output both fit, with no clipped text at either size.
- [ ] Every page shows "Page X of Y", the confidentiality notice, and the provenance line.
- [ ] The greyscale conversion (§4) keeps all information distinguishable: stamps,
      adverse reactions, totals, and table structure.
- [ ] QR codes are ≥ 72 pt, black on white, ECC M, quiet zone 4, and scan from a printed copy.
- [ ] A Yoruba name (e.g. "Adéṣọlá Ọ̀ṣúntókì") and a Hausa name (e.g. "Ɗanjuma Ƙwairanga")
      render correctly.
- [ ] A 3-page visit summary and a 20-dose certificate repeat the table header and
      never split a totals, QR, or signature block.

---

## 11. Open questions

1. **Certificate verification endpoint:** product needs to confirm which fields the public
   verify page may show (§7.3).
2. **Paper size default:** confirm the country rule in §2, or add an explicit clinic
   setting in onboarding.
3. **Tagged PDF:** confirm the PDFKit version in `apps/api/package.json` (`^0.18`) produces
   a valid structure tree for tables. If not, ship untagged and track accessibility
   separately.
