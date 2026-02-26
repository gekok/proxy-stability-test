// Scoring service placeholder
// Runner computes scores; API just stores them.
// Sprint 3 may add server-side score recomputation.

export function computeGrade(score: number): string {
  if (score >= 0.90) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.60) return 'C';
  if (score >= 0.40) return 'D';
  return 'F';
}
