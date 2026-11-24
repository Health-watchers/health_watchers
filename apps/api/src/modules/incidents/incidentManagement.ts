/**
 * Incident management system: classification, workflow, tracking,
 * assignment, timeline, communication, post-incident review, analytics,
 * and runbooks.
 */

export type IncidentSeverity = "sev1" | "sev2" | "sev3" | "sev4";
export type IncidentStatus =
  | "open"
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "closed";

export interface IncidentTimelineEntry {
  timestamp: number;
  actor: string;
  event: string;
  detail?: string;
}

export interface IncidentCommunication {
  timestamp: number;
  channel: "status_page" | "email" | "slack" | "internal_note";
  message: string;
  author: string;
}

export interface PostIncidentReview {
  summary: string;
  rootCause: string;
  impact: string;
  actionItems: { description: string; owner: string; dueDate?: number }[];
  completedAt: number;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  classification: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  priority: number; // 1 (highest) - 5 (lowest)
  assignee?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  timeline: IncidentTimelineEntry[];
  communications: IncidentCommunication[];
  postIncidentReview?: PostIncidentReview;
  runbookId?: string;
}

export interface Runbook {
  id: string;
  title: string;
  classification: string;
  steps: string[];
}

const SEVERITY_TO_PRIORITY: Record<IncidentSeverity, number> = {
  sev1: 1,
  sev2: 2,
  sev3: 3,
  sev4: 4,
};

export class IncidentClassifier {
  private classifications = new Map<string, string[]>([
    ["availability", ["outage", "downtime", "unreachable"]],
    ["performance", ["latency", "slow", "timeout"]],
    ["data", ["data loss", "corruption", "inconsistent"]],
    ["security", ["breach", "unauthorized", "vulnerability"]],
  ]);

  classify(description: string): string {
    const lower = description.toLowerCase();
    for (const [classification, keywords] of this.classifications) {
      if (keywords.some((k) => lower.includes(k))) return classification;
    }
    return "uncategorized";
  }
}

export class IncidentStore {
  private incidents = new Map<string, Incident>();
  private runbooks = new Map<string, Runbook>();
  private classifier = new IncidentClassifier();
  private idCounter = 0;

  private nextId(): string {
    this.idCounter += 1;
    return `INC-${Date.now()}-${this.idCounter}`;
  }

  createIncident(input: {
    title: string;
    description: string;
    severity: IncidentSeverity;
    createdBy: string;
  }): Incident {
    const classification = this.classifier.classify(input.description);
    const runbook = [...this.runbooks.values()].find((r) => r.classification === classification);

    const incident: Incident = {
      id: this.nextId(),
      title: input.title,
      description: input.description,
      classification,
      severity: input.severity,
      status: "open",
      priority: SEVERITY_TO_PRIORITY[input.severity],
      createdBy: input.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timeline: [
        {
          timestamp: Date.now(),
          actor: input.createdBy,
          event: "incident_created",
          detail: `Classified as ${classification}`,
        },
      ],
      communications: [],
      runbookId: runbook?.id,
    };

    this.incidents.set(incident.id, incident);
    return incident;
  }

  assign(incidentId: string, assignee: string, actor: string): Incident {
    const incident = this.require(incidentId);
    incident.assignee = assignee;
    incident.updatedAt = Date.now();
    incident.timeline.push({
      timestamp: Date.now(),
      actor,
      event: "assigned",
      detail: `Assigned to ${assignee}`,
    });
    return incident;
  }

  updateStatus(incidentId: string, status: IncidentStatus, actor: string): Incident {
    const incident = this.require(incidentId);
    incident.status = status;
    incident.updatedAt = Date.now();
    if (status === "resolved") incident.resolvedAt = Date.now();
    incident.timeline.push({
      timestamp: Date.now(),
      actor,
      event: "status_changed",
      detail: status,
    });
    return incident;
  }

  addCommunication(incidentId: string, comm: Omit<IncidentCommunication, "timestamp">): Incident {
    const incident = this.require(incidentId);
    incident.communications.push({ ...comm, timestamp: Date.now() });
    incident.updatedAt = Date.now();
    return incident;
  }

  submitPostIncidentReview(incidentId: string, review: Omit<PostIncidentReview, "completedAt">): Incident {
    const incident = this.require(incidentId);
    incident.postIncidentReview = { ...review, completedAt: Date.now() };
    incident.status = "closed";
    incident.timeline.push({
      timestamp: Date.now(),
      actor: "system",
      event: "post_incident_review_submitted",
    });
    return incident;
  }

  registerRunbook(runbook: Runbook): void {
    this.runbooks.set(runbook.id, runbook);
  }

  getRunbook(runbookId: string): Runbook | undefined {
    return this.runbooks.get(runbookId);
  }

  get(incidentId: string): Incident | undefined {
    return this.incidents.get(incidentId);
  }

  list(filter?: { status?: IncidentStatus; severity?: IncidentSeverity }): Incident[] {
    let results = [...this.incidents.values()];
    if (filter?.status) results = results.filter((i) => i.status === filter.status);
    if (filter?.severity) results = results.filter((i) => i.severity === filter.severity);
    return results.sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt);
  }

  /** Dashboard-friendly aggregate view of current incident state. */
  dashboardSummary() {
    const all = [...this.incidents.values()];
    const open = all.filter((i) => !["resolved", "closed"].includes(i.status));
    return {
      totalOpen: open.length,
      bySeverity: this.countBy(open, (i) => i.severity),
      byStatus: this.countBy(all, (i) => i.status),
      unassigned: open.filter((i) => !i.assignee).length,
    };
  }

  /** Analytics: mean time to resolve, incident volume by classification. */
  analytics(windowMs = 30 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - windowMs;
    const inWindow = [...this.incidents.values()].filter((i) => i.createdAt >= cutoff);
    const resolved = inWindow.filter((i) => i.resolvedAt);
    const mttrMs =
      resolved.length === 0
        ? 0
        : resolved.reduce((sum, i) => sum + (i.resolvedAt! - i.createdAt), 0) / resolved.length;

    return {
      totalIncidents: inWindow.length,
      resolvedIncidents: resolved.length,
      meanTimeToResolveMs: mttrMs,
      byClassification: this.countBy(inWindow, (i) => i.classification),
    };
  }

  private countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
    return items.reduce<Record<string, number>>((acc, item) => {
      const key = keyFn(item);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }

  private require(incidentId: string): Incident {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);
    return incident;
  }
}

export const incidentStore = new IncidentStore();

incidentStore.registerRunbook({
  id: "rb-availability",
  title: "Service Outage Response",
  classification: "availability",
  steps: [
    "Confirm outage scope via status dashboard",
    "Page on-call engineer",
    "Post initial status page update within 5 minutes",
    "Identify root cause and mitigate",
    "Confirm recovery and update status page",
  ],
});

incidentStore.registerRunbook({
  id: "rb-security",
  title: "Security Incident Response",
  classification: "security",
  steps: [
    "Isolate affected systems",
    "Notify security lead and compliance officer",
    "Preserve logs and evidence",
    "Assess scope of exposure (PHI/PII)",
    "Notify affected parties per HIPAA breach notification rules",
  ],
});
