/**
 * Deployments can briefly contain the new UI before the matching Supabase SQL
 * migration is executed. Reading an absent table must not take down existing
 * dashboards; recovery actions simply stay empty until migration 008 is run.
 */
export function isMissingSkillRecoveryTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("skill_recovery_actions") && (
    text.includes("pgrst205") || text.includes("42p01") || text.includes("does not exist") || text.includes("could not find")
  );
}

/** Backwards-compatible guard while migration 013 has not been applied yet. */
export function isMissingSkillRecoveryRequestTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.includes("skill_recovery_requests") && (
    text.includes("pgrst205") || text.includes("42p01") || text.includes("does not exist") || text.includes("could not find")
  );
}

/** The recovery RPC returns no ledger row when it has queued an admin review. */
export function isQueuedSkillRecoveryResponse(data: unknown): boolean {
  const row = Array.isArray(data) ? data[0] : data;
  return !row || typeof row !== "object" || !("id" in row) || !row.id;
}
