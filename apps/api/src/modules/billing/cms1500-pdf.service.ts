import PDFDocument from 'pdfkit';

/**
 * Renders a claim's CMS-1500 (02/12) data as a printable PDF.
 *
 * The layout follows the box numbering of the official form so billing staff can transcribe or
 * mail it, but it is a plain-paper rendition — payers that require the red OCR-scannable form
 * must receive the data on pre-printed stock or electronically (EDI 837P).
 */

export interface Cms1500ServiceLine {
  dateOfService?: string;
  placeOfService?: string;
  cptCode?: string;
  modifiers?: string[];
  diagnosisPointers?: string[];
  charges?: number;
  units?: number;
  renderingNpi?: string;
}

export interface Cms1500Data {
  box1_insuranceType?: string;
  box1a_insuredId?: string;
  box2_patientName?: string;
  box3_patientDob?: string;
  box3_patientSex?: string;
  box4_insuredName?: string;
  box5_patientAddress?: string;
  box11_insuredGroupNumber?: string;
  box11c_insurancePlanName?: string;
  box21_diagnosisCodes?: string[];
  box22_resubmissionCode?: string;
  box22_originalRefNumber?: string;
  box24_servicelines?: Cms1500ServiceLine[];
  box25_federalTaxId?: string;
  box26_patientAccountNo?: string;
  box28_totalCharge?: number;
  box29_amountPaid?: number;
  box31_physicianSignature?: string;
  box32_serviceFacility?: string;
  box33_billingProvider?: string;
  box33_billingProviderNpi?: string;
  [key: string]: unknown;
}

export interface Cms1500PdfOptions {
  claimId: string;
  data: Cms1500Data;
  /** Shown in the header — e.g. "ORIGINAL" or "CORRECTED (7)" */
  submissionLabel?: string;
}

const MARGIN = 36;
const PAGE_WIDTH = 612; // US Letter
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const RED = '#b91c1c';

const money = (n?: number) => (typeof n === 'number' ? n.toFixed(2) : '');
const mmddyyyy = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m} ${d} ${y}` : iso;
};

type Doc = InstanceType<typeof PDFDocument>;

function box(doc: Doc, x: number, y: number, w: number, h: number, label: string, value = '') {
  doc.lineWidth(0.5).strokeColor(RED).rect(x, y, w, h).stroke();
  doc.fillColor(RED).font('Helvetica').fontSize(5.5).text(label, x + 2, y + 2, { width: w - 4 });
  doc
    .fillColor('#000')
    .font('Courier')
    .fontSize(9)
    .text(value, x + 3, y + h - 12, { width: w - 6, height: 11, ellipsis: true });
}

/** Generates the PDF and resolves with its bytes. */
export function generateCms1500Pdf({ claimId, data, submissionLabel }: Cms1500PdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN, info: { Title: `CMS-1500 ${claimId}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(14).text('HEALTH INSURANCE CLAIM FORM', MARGIN, MARGIN);
    doc
      .font('Helvetica')
      .fontSize(7)
      .text('APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12', MARGIN, MARGIN + 18);
    doc
      .fillColor('#000')
      .font('Helvetica')
      .fontSize(8)
      .text(`Claim ${claimId}`, MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'right' })
      .text(submissionLabel ?? 'ORIGINAL', MARGIN, MARGIN + 11, { width: CONTENT_WIDTH, align: 'right' });

    let y = MARGIN + 34;
    const row = 26;
    const half = CONTENT_WIDTH / 2;

    // ── Patient & insured information (boxes 1–11) ────────────────────────────
    box(doc, MARGIN, y, half, row, '1. MEDICARE / MEDICAID / TRICARE / CHAMPVA / GROUP / FECA / OTHER', String(data.box1_insuranceType ?? ''));
    box(doc, MARGIN + half, y, half, row, "1a. INSURED'S I.D. NUMBER", String(data.box1a_insuredId ?? ''));
    y += row;
    box(doc, MARGIN, y, half * 0.62, row, "2. PATIENT'S NAME (Last, First, MI)", String(data.box2_patientName ?? ''));
    box(
      doc,
      MARGIN + half * 0.62,
      y,
      half * 0.38,
      row,
      "3. PATIENT'S BIRTH DATE / SEX",
      `${mmddyyyy(data.box3_patientDob)} ${data.box3_patientSex ?? ''}`.trim()
    );
    box(doc, MARGIN + half, y, half, row, "4. INSURED'S NAME (Last, First, MI)", String(data.box4_insuredName ?? ''));
    y += row;
    box(doc, MARGIN, y, half, row, "5. PATIENT'S ADDRESS", String(data.box5_patientAddress ?? ''));
    box(
      doc,
      MARGIN + half,
      y,
      half,
      row,
      "11. INSURED'S POLICY GROUP / 11c. PLAN NAME",
      [data.box11_insuredGroupNumber, data.box11c_insurancePlanName].filter(Boolean).join(' / ')
    );
    y += row + 8;

    // ── Box 21 — diagnoses ────────────────────────────────────────────────────
    const dx = (data.box21_diagnosisCodes ?? []).slice(0, 12);
    const dxHeight = 40;
    doc.lineWidth(0.5).strokeColor(RED).rect(MARGIN, y, half * 1.3, dxHeight).stroke();
    doc.fillColor(RED).font('Helvetica').fontSize(5.5).text('21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY (ICD Ind. 0)', MARGIN + 2, y + 2);
    const dxColW = (half * 1.3 - 8) / 4;
    dx.forEach((code, i) => {
      const cx = MARGIN + 4 + (i % 4) * dxColW;
      const cy = y + 11 + Math.floor(i / 4) * 9;
      doc.fillColor(RED).font('Helvetica').fontSize(6).text(`${String.fromCharCode(65 + i)}.`, cx, cy + 1);
      doc.fillColor('#000').font('Courier').fontSize(8.5).text(code, cx + 8, cy);
    });
    box(
      doc,
      MARGIN + half * 1.3,
      y,
      CONTENT_WIDTH - half * 1.3,
      dxHeight / 2,
      '22. RESUBMISSION CODE / ORIGINAL REF. NO.',
      [data.box22_resubmissionCode, data.box22_originalRefNumber].filter(Boolean).join('  ')
    );
    box(doc, MARGIN + half * 1.3, y + dxHeight / 2, CONTENT_WIDTH - half * 1.3, dxHeight / 2, '23. PRIOR AUTHORIZATION NUMBER', '');
    y += dxHeight + 6;

    // ── Box 24 — service lines ────────────────────────────────────────────────
    const cols = [
      { label: '24A. DATE(S) OF SERVICE', w: 78 },
      { label: 'B. POS', w: 30 },
      { label: 'D. CPT/HCPCS', w: 62 },
      { label: 'MODIFIER', w: 62 },
      { label: 'E. DX PTR', w: 48 },
      { label: 'F. $ CHARGES', w: 70 },
      { label: 'G. UNITS', w: 40 },
      { label: 'J. RENDERING NPI', w: CONTENT_WIDTH - 390 },
    ];
    let x = MARGIN;
    const headerH = 14;
    cols.forEach((c) => {
      doc.lineWidth(0.5).strokeColor(RED).rect(x, y, c.w, headerH).stroke();
      doc.fillColor(RED).font('Helvetica').fontSize(5.5).text(c.label, x + 2, y + 4, { width: c.w - 4 });
      x += c.w;
    });
    y += headerH;

    const lines = (data.box24_servicelines ?? []).slice(0, 6);
    const lineH = 18;
    for (let i = 0; i < 6; i++) {
      const l = lines[i];
      const values = l
        ? [
            mmddyyyy(l.dateOfService),
            l.placeOfService ?? '',
            l.cptCode ?? '',
            (l.modifiers ?? []).join(' '),
            (l.diagnosisPointers ?? []).join(''),
            money(l.charges),
            String(l.units ?? ''),
            l.renderingNpi ?? '',
          ]
        : cols.map(() => '');
      x = MARGIN;
      cols.forEach((c, j) => {
        doc.lineWidth(0.5).strokeColor(RED).rect(x, y, c.w, lineH).stroke();
        doc
          .fillColor('#000')
          .font('Courier')
          .fontSize(8.5)
          .text(values[j], x + 3, y + 5, { width: c.w - 6, align: j === 5 ? 'right' : 'left' });
        x += c.w;
      });
      doc.fillColor(RED).font('Helvetica').fontSize(6).text(String(i + 1), MARGIN - 9, y + 6);
      y += lineH;
    }
    y += 6;

    // ── Boxes 25–33 — totals & provider ───────────────────────────────────────
    const third = CONTENT_WIDTH / 3;
    box(doc, MARGIN, y, third, row, '25. FEDERAL TAX I.D. NUMBER', String(data.box25_federalTaxId ?? ''));
    box(doc, MARGIN + third, y, third, row, "26. PATIENT'S ACCOUNT NO.", String(data.box26_patientAccountNo ?? ''));
    box(doc, MARGIN + third * 2, y, third / 2, row, '28. TOTAL CHARGE', money(data.box28_totalCharge));
    box(doc, MARGIN + third * 2.5, y, third / 2, row, '29. AMOUNT PAID', money(data.box29_amountPaid));
    y += row;
    box(doc, MARGIN, y, third, row * 1.5, '31. SIGNATURE OF PHYSICIAN OR SUPPLIER', String(data.box31_physicianSignature ?? 'SIGNATURE ON FILE'));
    box(doc, MARGIN + third, y, third, row * 1.5, '32. SERVICE FACILITY LOCATION INFORMATION', String(data.box32_serviceFacility ?? ''));
    box(
      doc,
      MARGIN + third * 2,
      y,
      third,
      row * 1.5,
      '33. BILLING PROVIDER INFO / 33a. NPI',
      [data.box33_billingProvider, data.box33_billingProviderNpi].filter(Boolean).join('  NPI ')
    );
    y += row * 1.5 + 12;

    doc
      .fillColor('#555')
      .font('Helvetica')
      .fontSize(6.5)
      .text(
        `Generated ${new Date().toISOString()} — plain-paper rendition of CMS-1500 (02/12). ` +
          'Submit electronically (837P) or on the official red-ink form where required by the payer.',
        MARGIN,
        y,
        { width: CONTENT_WIDTH }
      );

    doc.end();
  });
}
