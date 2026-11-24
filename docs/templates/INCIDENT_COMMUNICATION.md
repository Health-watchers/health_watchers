# Incident Communication Templates

Copy-paste templates for keeping stakeholders informed during an incident or DR
event. Fill the `<…>` placeholders. Keep updates factual, on a cadence, and free
of blame or speculation.

| Severity | First update within | Cadence | Channels |
|----------|---------------------|---------|----------|
| Sev-1 (outage / data risk) | 15 min | every 30 min | Status page, `#incident`, email to affected customers, exec brief |
| Sev-2 (degraded) | 30 min | every 60 min | Status page, `#incident` |
| Sev-3 (minor) | 60 min | at resolution | `#incident` |

Roles: **Incident Commander** (decisions), **Comms Lead** (owns these updates),
**Scribe** (timeline), **Ops** (hands on keyboard).

---

## 1. Status page — lifecycle

**Investigating**
> **<Investigating> — <short title>**
> We are investigating reports of <symptom> affecting <feature/area>. Some users
> may experience <impact>. Next update by <HH:MM UTC>.

**Identified**
> **<Identified> — <short title>**
> We have identified the cause as <plain-language cause> and are <action, e.g.
> "failing over to our secondary region" / "rolling back a recent change">.
> <Feature> remains <impacted/unavailable>. Next update by <HH:MM UTC>.

**Monitoring**
> **<Monitoring> — <short title>**
> A fix has been applied and services are recovering. We are monitoring to
> confirm full recovery. Next update by <HH:MM UTC>.

**Resolved**
> **<Resolved> — <short title>**
> This incident is resolved as of <HH:MM UTC>. Root cause: <one sentence>.
> Duration: <start>–<end> UTC (<N> min). <If applicable: data recorded between
> <T1> and <T2> UTC was lost and cannot be recovered / has been restored.>
> A post-incident review will be published within 5 business days.

---

## 2. Internal — `#incident` kickoff

> 🚨 **Sev-<N> declared** — <title>
> **IC:** <name> · **Comms:** <name> · **Scribe:** <name>
> **Impact:** <who/what, quantified if possible>
> **Started:** <HH:MM UTC> · **Detection:** <alert name / customer report>
> **Bridge:** <link> · **Doc:** <link>
> Current hypothesis: <…>. Next update in 30 min.

## 3. Internal — periodic update

> **Update <HH:MM UTC> — Sev-<N> <title>**
> **Status:** <investigating|identified|monitoring>
> **Since last update:** <what changed / what was tried>
> **Now:** <current action, owner>
> **Customer impact:** <current state>
> **ETA:** <best estimate or "unknown">
> Next update by <HH:MM UTC>.

---

## 4. Customer email — major incident

> Subject: [Health Watchers] Service disruption on <date> — <resolved/ongoing>
>
> Hi <name>,
>
> Between <start> and <end> UTC, <product/area> was <unavailable/degraded>.
> During this window you may have experienced <impact>.
>
> **What happened:** <2–3 plain sentences.>
> **What we did:** <recovery actions.>
> **Data:** <no data was lost / data between <T1>–<T2> UTC was affected and has
> been restored / a <N>-minute window of data could not be recovered>.
> **What's next:** <prevention items>. A full post-incident review will follow by
> <date>.
>
> We're sorry for the disruption. Reply here or contact support@health-watchers.io
> with any questions.
>
> — The Health Watchers Team

---

## 5. Post-incident review (skeleton)

> ## PIR: <title> (<date>)
> **Severity:** Sev-<N> · **Duration:** <N> min · **Author:** <name>
>
> ### Impact
> <users affected, requests failed, RPO/RTO actually achieved>
>
> ### Timeline (UTC)
> | Time | Event |
> |------|-------|
> | <HH:MM> | <detection> |
> | <HH:MM> | <declared> |
> | <HH:MM> | <mitigation> |
> | <HH:MM> | <resolved> |
>
> ### Root cause
> <contributing factors — no single "human error" root cause>
>
> ### What went well / what didn't
>
> ### Action items
> | Action | Owner | Due | Issue |
> |--------|-------|-----|-------|

---

## 6. Regulatory note (HIPAA)

If PHI confidentiality, integrity, or availability was or may have been
compromised, notify the Privacy/Security Officer **immediately** and do not
communicate externally about the breach until they approve wording. Breach-
notification timelines are legal obligations, not best-effort — track them in the
PIR action items.
