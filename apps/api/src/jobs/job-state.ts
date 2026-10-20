/**
 * Process-local record of the scheduled jobs this process is executing.
 *
 * Deliberately dependency-free so job modules can report `running` status
 * without importing BullMQ, Redis or the metrics registry.
 */
const activeJobs = new Set<string>();

export function markJobsActive(names: string[]): void {
  for (const name of names) activeJobs.add(name);
}

export function clearActiveJobs(): void {
  activeJobs.clear();
}

export function isJobActive(name: string): boolean {
  return activeJobs.has(name);
}
