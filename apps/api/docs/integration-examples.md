# Integration Examples

Practical, end-to-end examples for the most common integration scenarios.

---

## 1. Patient Registration and First Appointment

```typescript
import { HealthWatchersClient } from './health-watchers-client';

const hw = new HealthWatchersClient({
  baseUrl: process.env.HW_BASE_URL!,
  email:   process.env.HW_EMAIL!,
  password: process.env.HW_PASSWORD!,
});

async function registerPatientAndBook() {
  // 1. Create patient
  const { data: patient } = await hw.fetch('/patients', {
    method: 'POST',
    body: JSON.stringify({
      fullName:    'Alice Johnson',
      dateOfBirth: '1990-03-22',
      gender:      'female',
      email:       'alice@example.com',
      phone:       '+1-555-0100',
    }),
  });
  console.log('Patient created:', patient.id);

  // 2. Book an appointment
  const { data: appt } = await hw.fetch('/appointments', {
    method: 'POST',
    body: JSON.stringify({
      patientId:   patient.id,
      scheduledAt: '2025-09-10T09:00:00.000Z',
      type:        'initial-consultation',
      notes:       'New patient intake',
    }),
  });
  console.log('Appointment booked:', appt.id, 'at', appt.scheduledAt);
}
```

---

## 2. Clinical Encounter Workflow

```typescript
async function runEncounterWorkflow(patientId: string) {
  // 1. Open encounter
  const { data: encounter } = await hw.fetch('/encounters', {
    method: 'POST',
    body: JSON.stringify({
      patientId,
      chiefComplaint: 'Persistent headache for 3 days',
      notes: 'Patient reports severity 7/10',
    }),
  });

  // 2. Add a diagnosis
  await hw.fetch(`/encounters/${encounter.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      diagnoses: [{ code: 'G43.909', description: 'Migraine, unspecified' }],
      prescriptions: [{
        medication: 'Sumatriptan',
        dosage: '50mg',
        frequency: 'as needed',
        duration: '30 days',
      }],
    }),
  });

  // 3. Add a lab result order
  await hw.fetch('/lab-results', {
    method: 'POST',
    body: JSON.stringify({
      patientId,
      encounterId: encounter.id,
      testName:    'Complete Blood Count',
      status:      'ordered',
    }),
  });

  // 4. Sign off — triggers AI summary email
  await hw.fetch(`/encounters/${encounter.id}/sign-off`, { method: 'POST' });
  console.log('Encounter signed off:', encounter.id);
}
```

---

## 3. Stellar Payment Flow (XLM)

```typescript
async function processPayment(patientId: string, amountXlm: string) {
  // 1. Check clinic balance
  const { data: balance } = await hw.payments.getBalance();
  console.log('XLM balance:', balance.xlmBalance);

  // 2. Create payment intent
  const { data: intent } = await hw.payments.createIntent({
    amount:      amountXlm,
    destination: balance.publicKey,
    assetCode:   'XLM',
    patientId,
  });

  console.log('Intent created');
  console.log('  intentId:', intent.intentId);
  console.log('  memo:',     intent.memo);       // e.g. "HW-abc123" — include in Stellar tx
  console.log('  expires:  30 minutes from now');

  // 3. At this point: hand off memo + destination to patient's Stellar wallet
  //    The patient broadcasts the transaction.

  // 4. Confirm once you have the tx hash
  const txHash = await waitForTxHash(intent.memo); // your own polling/webhook logic
  const { data: confirmed } = await hw.payments.confirm(intent.intentId, txHash);
  console.log('Payment confirmed:', confirmed.status); // "confirmed"
}
```

---

## 4. Stellar Path Payment (USDC → XLM)

```typescript
async function pathPayment(patientId: string, usdcAmount: string) {
  // 1. Discover available paths
  const { data: paths } = await hw.fetch(
    `/payments/paths?sourceAsset=USDC&destinationAsset=XLM&amount=${usdcAmount}`
  );

  if (!paths.length) throw new Error('No path available');

  const bestPath = paths[0];

  // 2. Create path-payment intent
  const { data: intent } = await hw.payments.createIntent({
    amount:            usdcAmount,
    destination:       'GCEZ...clinicPublicKey',
    assetCode:         'XLM',
    patientId,
    sourceAssetCode:   'USDC',
    sourceAssetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    path:              bestPath.path,
    maxSourceAmount:   bestPath.source_amount,
  });

  console.log('Path payment intent:', intent.intentId);
}
```

---

## 5. Bulk Patient Export (CSV)

```typescript
async function exportAllPatients(outputDir: string) {
  const fs = require('fs');
  const path = require('path');

  // Use the batch export API (async job queue)
  const { data: job } = await hw.fetch('/exports', {
    method: 'POST',
    body: JSON.stringify({
      type:   'patients',
      format: 'csv',
      filters: { isActive: true },
    }),
  });

  console.log('Export job queued:', job.jobId);

  // Poll for completion (or use SSE progress endpoint)
  let status = job.status;
  while (status === 'pending' || status === 'processing') {
    await new Promise(r => setTimeout(r, 3000));
    const { data: jobStatus } = await hw.fetch(`/exports/${job.jobId}`);
    status = jobStatus.status;
    console.log('Progress:', jobStatus.progress + '%');
  }

  if (status !== 'completed') throw new Error('Export failed');

  // Download the file (signed URL, valid 1 hour)
  const { data: { downloadUrl } } = await hw.fetch(`/exports/${job.jobId}/download`);
  const fileRes = await fetch(downloadUrl);
  const buffer = await fileRes.arrayBuffer();
  fs.writeFileSync(path.join(outputDir, 'patients.csv'), Buffer.from(buffer));
  console.log('Export saved to', outputDir);
}
```

---

## 6. Receiving Webhooks (Express)

```typescript
import express from 'express';
import crypto  from 'crypto';

const app = express();

// Use raw body for signature verification
app.post(
  '/hooks/health-watchers',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const sig    = req.headers['x-webhook-signature'] as string;
    const secret = process.env.HW_WEBHOOK_SECRET!;

    // Verify HMAC-SHA256 signature
    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig ?? ''))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data, timestamp } = JSON.parse(req.body.toString());

    // Respond immediately — process asynchronously
    res.sendStatus(200);

    setImmediate(async () => {
      switch (event) {
        case 'payment.confirmed':
          await handlePaymentConfirmed(data);
          break;
        case 'patient.created':
          await syncPatientToEHR(data);
          break;
        case 'appointment.created':
          await sendCalendarInvite(data);
          break;
        default:
          console.log(`Unhandled event: ${event}`);
      }
    });
  }
);

async function handlePaymentConfirmed(data: any) {
  console.log(`Payment ${data.intentId} confirmed — txHash: ${data.txHash}`);
  // Update your billing system, notify patient, etc.
}

app.listen(3000, () => console.log('Webhook listener on :3000'));
```

---

## 7. AI Risk Stratification Batch

```typescript
async function stratifyAllHighRiskPatients() {
  const highRisk: any[] = [];

  // Page through all active patients
  for await (const page of hw.paginate('/patients', { isActive: 'true' }, 50)) {
    for (const patient of page) {
      try {
        const { data: risk } = await hw.fetch('/ai/risk', {
          method: 'POST',
          body: JSON.stringify({ patientId: patient.id }),
        });

        if (risk.riskLevel === 'high' || risk.riskLevel === 'critical') {
          highRisk.push({ patient, risk });
        }
      } catch (err: any) {
        if (err.status === 429) {
          // AI limiter: 20 req/min per clinic — slow down
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }
  }

  console.log(`High-risk patients found: ${highRisk.length}`);
  return highRisk;
}
```

---

## 8. HIPAA Audit Log Query

```typescript
async function getAuditLogsForPatient(patientId: string) {
  const { data: logs } = await hw.fetch(
    `/audit-logs?resourceId=${patientId}&resourceType=patient&page=1&limit=100`
  );

  for (const log of logs) {
    console.log(`[${log.createdAt}] ${log.action} by ${log.userId} — ${log.outcome}`);
  }

  return logs;
}
```

---

## 9. Consent Management

```typescript
// Grant consent
async function grantConsent(patientId: string, consentType: string) {
  const { data } = await hw.fetch(`/patients/${patientId}/consent`, {
    method: 'POST',
    body: JSON.stringify({
      type:        consentType,     // e.g. "treatment", "data_sharing"
      grantedAt:   new Date().toISOString(),
      ipAddress:   '192.168.1.1',
      userAgent:   'MyApp/1.0',
    }),
  });
  console.log('Consent granted:', data.id);
}

// Revoke consent
async function revokeConsent(consentId: string) {
  const { data } = await hw.fetch(`/consent/${consentId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Patient requested withdrawal' }),
  });
  console.log('Consent revoked:', data.id);
}
```

---

## 10. Real-time Appointment Updates (Socket.IO — v2 only)

```javascript
import { io } from 'socket.io-client';

const socket = io('https://api.healthwatchers.io', {
  auth: { token: accessToken },
  transports: ['websocket'],
});

socket.on('connect', () => console.log('Connected to real-time service'));

// v2 appointment events
socket.on('appointment:confirmed',   data => console.log('Confirmed:',   data));
socket.on('appointment:cancelled',   data => console.log('Cancelled:',   data));
socket.on('appointment:rescheduled', data => console.log('Rescheduled:', data));
socket.on('appointment:patient_arrived', data => {
  updateWaitingRoomDisplay(data.patientName);
});

socket.on('disconnect', () => console.log('Disconnected'));
```

---

## Environment Setup

```env
# Required
HW_BASE_URL=https://api.healthwatchers.io/api/v1
HW_EMAIL=admin@clinic.example
HW_PASSWORD=Secure@123!

# Required for webhook verification
HW_WEBHOOK_SECRET=<secret-from-webhook-registration>

# Optional — for Stellar testnet development
STELLAR_NETWORK=testnet
```
