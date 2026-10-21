---
title: CDS Rules and ICD-10 Favourites
description: Configure clinical decision support alerts and your clinic's most-used diagnosis codes.
---

# CDS Rules and ICD-10 Favourites

## Clinical decision support (CDS) rules

CDS rules show alerts to clinicians, for example *"WARNING: Blood pressure > 140/90 mmHg"*, when they record vitals, add a prescription, or create an encounter. Health Watchers comes with default rules for blood pressure, heart rate, temperature and oxygen saturation.

**Where:** **Settings → CDS Rules** (`/settings/cds-rules`).

### Create a rule

1. Click **Create Rule**.
2. Fill in **Name** and **Description**.
3. Choose a **Category** (vital sign, drug interaction, allergy, screening, care gap) and a **Trigger** (when an encounter is created, a prescription is added, or vitals are recorded).
4. Enter the **Conditions (JSON)**. Ask your clinical lead or support contact for the exact condition. For example, a screening rule for patients aged 50–75:
   ```json
   { "type": "screening", "minAge": 50, "maxAge": 75 }
   ```
5. Choose the **Action**: alert, recommendation, or block. Then choose the **Severity** (info, warning, critical) and write the **Message** clinicians will see.
6. Tick **Active** and click **Save Rule**.

### Test a rule before relying on it

Click **Test** next to the rule. Enter sample values, such as heart rate or blood pressure, and click **Run Test**. The result shows **✓ Rule would fire for this scenario** or **✗ Rule would not fire for this scenario**.

Use **Edit** to change a rule and **Delete** to remove it.

## ICD-10 favourites

Favourites are the diagnosis codes your clinic uses most. They appear first when clinicians search for a diagnosis.

**Where:** **Settings → ICD-10 Favorites** (`/settings/icd10-favorites`).

1. Under **Add a favorite**, search by code or description, for example `J06.9` or *upper respiratory*.
2. Click **Add** next to the code. It moves to **Current favorites**.
3. To remove a favourite, click **Remove**.

**Recently used** lists the codes your clinic used recently. These are good candidates for favourites.
