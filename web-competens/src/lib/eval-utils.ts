import type { EvaluationStatus } from "@/types";

// Numeric score assigned to each teacher-entered status.
// These midpoints place each status squarely inside its target range.
export function statusToScore(status: EvaluationStatus): number {
  if (status === "acquis") return 100;
  if (status === "en_cours") return 70; // midpoint of [50, 90]
  return 25;                            // midpoint of [0, 50)
}

// Derives the display status from a computed rate, enforcing the agreed ranges.
// This is the single bridge between the teacher's "100% / -1" demerit toggle
// (Evaluation.tsx) and the Acquis/En cours/Non acquis categories shown by every
// chart (StudentDetail, ParentDashboard, DailyGranularAnalytics). Those charts
// are never touched directly — they always render whatever this function returns.
//   90–100  → Acquis
//   51–89   → En cours
//   ≤50     → Non acquis
export function scoreToStatus(rate: number): EvaluationStatus {
  if (rate >= 90) return "acquis";
  if (rate > 50) return "en_cours";
  return "non_acquis";
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface TimelinePoint {
  date: string;       // ISO "YYYY-MM-DD"
  rate: number;       // 0-100 average score for that day
  teachers: string[]; // unique teacher names who evaluated on that day
  count: number;      // number of individual evaluation rows
}

export function buildTimeline(
  evals: Array<{ date: string; status: EvaluationStatus; teacherName?: string }>
): TimelinePoint[] {
  const byDate: Record<string, { scores: number[]; teachers: Set<string> }> = {};
  for (const e of evals) {
    if (!byDate[e.date]) byDate[e.date] = { scores: [], teachers: new Set() };
    byDate[e.date].scores.push(statusToScore(e.status));
    if (e.teacherName) byDate[e.date].teachers.add(e.teacherName);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { scores, teachers }]) => ({
      date,
      rate: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
      teachers: [...teachers],
      count: scores.length,
    }));
}
