# Business Associate Agreement (BAA) — Template

> **This is a starting-point template, not a signable legal document.** It must be reviewed and adapted by qualified legal counsel before use with any actual vendor or covered entity. It does not constitute legal advice. Do not send this document to a vendor or sign anything based on it without legal sign-off — see the checklist in [`SECURITY_POLICY.md`](./SECURITY_POLICY.md#compliance) and contact `compliance@healthwatchers.com` first.

---

## Purpose

Under HIPAA, a Business Associate Agreement (BAA) is required whenever a third party ("Business Associate") creates, receives, maintains, or transmits Protected Health Information (PHI) on behalf of Health Watchers ("Covered Entity"). This template exists so a BAA is drafted consistently every time a new vendor integration needs one, instead of being written from scratch or skipped under time pressure.

**When a BAA is required** — before sending PHI to, or letting PHI pass through, any of:
- A hosting/infrastructure provider that stores PHI-bearing databases or backups
- An error-monitoring or logging vendor whose payloads could contain PHI
- An email/SMS provider used to send anything containing PHI
- An AI/LLM or analytics vendor processing patient data
- Any subcontractor of an existing Business Associate who will also touch PHI

If a vendor only ever receives de-identified data (per the HIPAA Safe Harbor or Expert Determination method), a BAA is not required — but confirm the de-identification method with compliance before relying on this.

---

## Template

```
BUSINESS ASSOCIATE AGREEMENT

This Business Associate Agreement ("Agreement") is entered into as of [EFFECTIVE DATE]
("Effective Date"), by and between:

  Covered Entity: Health Watchers, Inc.
                  [ADDRESS]

  Business Associate: [VENDOR LEGAL NAME]
                       [VENDOR ADDRESS]

  (each a "Party" and collectively the "Parties")

RECITALS

WHEREAS, Covered Entity and Business Associate have entered into, or intend to enter
into, an arrangement ("Underlying Agreement") pursuant to which Business Associate may
create, receive, maintain, or transmit Protected Health Information ("PHI") on behalf
of Covered Entity; and

WHEREAS, the Parties intend to comply with the requirements of the Health Insurance
Portability and Accountability Act of 1996 ("HIPAA"), the Health Information Technology
for Economic and Clinical Health Act ("HITECH Act"), and their implementing regulations,
including the Privacy Rule and Security Rule (collectively, the "HIPAA Rules"),

NOW, THEREFORE, the Parties agree as follows:

1. DEFINITIONS
   Terms used but not otherwise defined in this Agreement have the meanings given to
   them in the HIPAA Rules (e.g., "Breach," "Designated Record Set," "Electronic
   Protected Health Information," "Protected Health Information," "Required by Law,"
   "Secretary," "Security Incident," "Subcontractor," "Unsecured PHI").

2. PERMITTED USES AND DISCLOSURES OF PHI
   2.1 Business Associate may use or disclose PHI only as necessary to perform the
       services described in the Underlying Agreement, as permitted or required by
       this Agreement, or as Required by Law.
   2.2 Business Associate shall not use or disclose PHI in any manner that would
       violate the HIPAA Rules if done by Covered Entity.
   2.3 Business Associate may use PHI for its own proper management and
       administration, or to carry out its legal responsibilities, provided any
       disclosure for such purposes is Required by Law or Business Associate obtains
       reasonable assurances of confidentiality from the recipient.

3. SAFEGUARDS
   Business Associate shall implement administrative, physical, and technical
   safeguards that reasonably and appropriately protect the confidentiality,
   integrity, and availability of Electronic PHI, consistent with the Security Rule,
   including but not limited to: [ENCRYPTION AT REST / IN TRANSIT, ACCESS CONTROLS,
   AUDIT LOGGING — specify per vendor].

4. SUBCONTRACTORS
   Business Associate shall ensure that any subcontractor that creates, receives,
   maintains, or transmits PHI on behalf of Business Associate agrees, in writing, to
   restrictions and conditions at least as stringent as those in this Agreement.

5. REPORTING
   5.1 Business Associate shall report to Covered Entity, without unreasonable delay
       and in no event later than [X] business days after discovery, any use or
       disclosure of PHI not permitted by this Agreement, and any Security Incident
       of which it becomes aware.
   5.2 Business Associate shall report any Breach of Unsecured PHI to Covered Entity
       without unreasonable delay and in no event later than [X] calendar days
       (recommended: no more than 30, and enough to let Covered Entity meet its own
       60-day individual-notification deadline under the Breach Notification Rule —
       see the Incident Notification section of `SECURITY_POLICY.md`) after
       discovery, including the identification of each affected individual, to the
       extent known.

6. ACCESS, AMENDMENT, AND ACCOUNTING
   Business Associate shall make PHI available to Covered Entity (or, as directed by
   Covered Entity, to an individual) as necessary to satisfy Covered Entity's
   obligations under the HIPAA Rules regarding individual access, amendment, and
   accounting of disclosures.

7. AVAILABILITY OF BOOKS AND RECORDS
   Business Associate shall make its internal practices, books, and records relating
   to the use and disclosure of PHI available to the Secretary of Health and Human
   Services for purposes of determining Covered Entity's compliance with the HIPAA
   Rules.

8. TERM AND TERMINATION
   8.1 This Agreement is effective as of the Effective Date and terminates upon
       termination of the Underlying Agreement, or as otherwise provided herein.
   8.2 Upon termination, Business Associate shall, at Covered Entity's election,
       return or destroy all PHI, or if neither is feasible, extend the protections
       of this Agreement for as long as it retains the PHI.
   8.3 Covered Entity may terminate the Underlying Agreement immediately if Business
       Associate has breached a material term of this Agreement and fails to cure
       within [X] days of notice.

9. MISCELLANEOUS
   9.1 This Agreement shall be interpreted to comply with the HIPAA Rules. In the
       event of any inconsistency between this Agreement and the HIPAA Rules, the
       HIPAA Rules govern.
   9.2 This Agreement is governed by the laws of [STATE/JURISDICTION].
   9.3 No third-party beneficiaries.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

Health Watchers, Inc.                    [VENDOR LEGAL NAME]

By: _______________________              By: _______________________
Name:                                    Name:
Title:                                   Title:
Date:                                    Date:
```

---

## Before sending to a vendor

- [ ] Fill in all `[BRACKETED]` placeholders — do not send with placeholders still present
- [ ] Confirm the reporting/breach-notification timeframes (Section 5) are consistent with the commitments in [`SECURITY_POLICY.md#incident-notification`](./SECURITY_POLICY.md#incident-response)
- [ ] Have legal counsel review the filled-in draft
- [ ] Confirm the vendor's own safeguards (Section 3) are described accurately, not generically — ask them for their security/compliance documentation
- [ ] File the fully executed agreement per your organization's contract-management process, and record the vendor + BAA date in your compliance tracker
- [ ] Add the vendor to the "third-party PHI processors" list your compliance team maintains for breach-notification and audit purposes

See also: [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) (threat model, incident response, vulnerability reporting) and [`PHI_HANDLING_GUIDE.md`](./PHI_HANDLING_GUIDE.md) (when a new integration needs a BAA before it can receive PHI).
