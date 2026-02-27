# Bugfix Plan — Post-Review Fixes

**Created:** 2026-02-27
**Source:** Full project review (4 parallel agents across all services)
**Total Issues Found:** 18 HIGH + 43 MEDIUM + 40 LOW
**This Plan Covers:** 18 HIGH + 1 MEDIUM = 19 fixes

---

## Batch Structure

```
Batch 1: Go Runner — concurrency + safety    (4 files, 5 fixes)  ← START HERE
Batch 2: Go Runner — timing + burst data     (4 files, 2 fixes)  ← after Batch 1
Batch 3: API — all fixes                     (4 files, 6 fixes)  ← parallel with 1
Batch 4: Dashboard — all fixes               (6 files, 5 fixes)  ← parallel with 1
Batch 5: Database — schema sync              (1 file, 1 fix)     ← parallel with 1

Parallelism: Batch 1 ∥ 3 ∥ 4 ∥ 5 → then Batch 2
(Batch 2 depends on Batch 1 — both touch orchestrator.go)
```

---

## Batch 1 — Go Runner Concurrency + Safety (4 files, 5 fixes)

### R-H1: Data race on allSamples/allWSSamples
**File:** `runner/internal/engine/orchestrator.go`
**Problem:** `allSamples` (line 34) and `allWSSamples` (line 35) written by collectAndReport/collectAndReportWS goroutines, read concurrently by rollingSummary goroutine — no sync.
**Fix:**
- Add `sampleMu sync.RWMutex` field to Orchestrator struct (after line 37)
- Write sites — wrap with `o.sampleMu.Lock()`/`Unlock()`:
  - Line 626: `o.allSamples = append(o.allSamples, batch...)` (collectAndReport)
  - Line 580: `o.allWSSamples = append(o.allWSSamples, batch...)` (collectAndReportWS)
- Read sites — copy under `o.sampleMu.RLock()`/`RUnlock()`:
  - Lines 286-287 (rollingSummary): copy slices → pass copies to ComputeSummary/ComputeWSSummary
  - Lines 237-238 (final summary after g.Wait()): same copy pattern

### R-H2: errgroup.WithContext cascade cancel
**File:** `runner/internal/engine/orchestrator.go`
**Problem:** Line 176 `g, gCtx := errgroup.WithContext(ctx)` — if any goroutine returns error, all get cancelled.
**Fix:**
- Change to `g := new(errgroup.Group)`
- Replace all `gCtx` → `ctx` in goroutine closures

### R-H3: Goroutine leak in WS tester read loop
**File:** `runner/internal/proxy/ws_tester.go`
**Problem:** Lines 240-249 — read goroutine sends to `readCh` (buffered 60). If buffer full when main loop exits, goroutine blocks on channel send forever even after conn.Close().
**Fix:**
- Before read goroutine (~line 239): `doneCh := make(chan struct{})`
- In read goroutine, change `readCh <- readResult{...}` to:
  ```go
  select {
  case readCh <- readResult{msg: msg, err: err}:
  case <-doneCh:
      return
  }
  ```
- At `done:` label (~line 320): `close(doneCh)` before ConnectionHeldMS assignment

### R-H5: DBReporter missing interface methods
**File:** `runner/internal/reporter/db_reporter.go`
**Problem:** Missing `ReportWSSamples()` and `ReportIPCheck()` — doesn't satisfy Reporter interface.
**Fix:** Add 2 stub methods returning nil (placeholder, using API reporter in practice)

### R-H7: Scheduler semaphore blocks without ctx check
**File:** `runner/internal/engine/scheduler.go`
**Problem:** Line 70 `sem <- struct{}{}` doesn't check ctx.Done().
**Fix:**
```go
select {
case sem <- struct{}{}:
case <-ctx.Done():
    wg.Done()
    return
}
```

**Verify:** `cd runner && go build ./... && go vet ./...`

---

## Batch 2 — Go Runner Timing + Burst Data (4 files, 2 fixes)

### R-H6: Sub-ms timing truncation
**Files:** `runner/internal/proxy/http_tester.go`, `https_tester.go`, `ws_tester.go`
**Problem:** `float64(duration.Milliseconds())` truncates to whole ms — sub-ms values become 0.
**Fix:** Replace ALL instances with `float64(duration.Microseconds()) / 1000.0`
- http_tester.go: ~6 locations (lines 228, 240, 243, 246, etc.)
- https_tester.go: ~12 locations (lines 203, 219, 233, 247, 255, 280, 283, 327, 341, 342, 357, 362)
- ws_tester.go: ~6 locations (lines 174, 175, 177, 184, 305, 321)

### R-H4: Burst results silently lost
**File:** `runner/internal/engine/orchestrator.go`
**Problem:** `runBurst()` (lines 487-567) receives `sampleChan` param but NEVER sends samples. Only computes aggregates and logs.
**Fix:** In each burst goroutine, create `domain.HTTPSample` and send via non-blocking:
```go
sample := domain.HTTPSample{
    Seq: -1, TargetURL: targetURL, Method: "GET",
    MeasuredAt: time.Now(),
    TotalMS: float64(elapsed.Microseconds()) / 1000.0,
}
// ... set StatusCode/ErrorType based on result
select {
case sampleChan <- sample:
default: // channel full, skip
}
```
Also fix burst timing (line 530): use Microseconds-based calc.

**Verify:** `cd runner && go build ./... && go vet ./...`

---

## Batch 3 — API Fixes (4 files, 6 fixes)

### A-H1: Hardcoded default encryption key
**File:** `api/src/routes/proxies.ts`
**Problem:** Line 10 — fallback to well-known key `'0123456789abcdef...'` when env missing.
**Fix:**
```ts
const KEY_HEX = process.env.ENCRYPTION_KEY;
if (!KEY_HEX || KEY_HEX.length !== 64) {
  throw new Error('ENCRYPTION_KEY env var required (64 hex chars). Generate: openssl rand -hex 32');
}
```

### A-H2: No run status transition validation
**File:** `api/src/routes/runs.ts`
**Problem:** PATCH /:id/status accepts any transition (e.g., completed → running).
**Fix:** Add valid transition map + validation after line 162:
```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['running', 'cancelled'],
  running:   ['stopping', 'completed', 'failed'],
  stopping:  ['completed', 'failed', 'cancelled'],
  completed: [], failed: [], cancelled: [],
};
// After reading oldStatus:
const allowed = VALID_TRANSITIONS[oldStatus] || [];
if (!allowed.includes(status)) {
  return res.status(400).json({ error: { message: `Invalid transition: ${oldStatus} → ${status}` } });
}
```

### A-H3: `|| 0` / `|| null` falsy bug on numeric fields
**File:** `api/src/routes/runs.ts`
**Problem:** Lines 228-233 (HTTP batch) and 271-277 (WS batch) — `s.tcp_connect_ms || null` treats valid `0` as falsy → `null`.
**Fix:** Replace ALL `||` with `??` in both batch inserts:
- HTTP batch: `s.status_code ?? null`, `s.tcp_connect_ms ?? null`, `s.ttfb_ms ?? null`, `s.total_ms ?? null`, `s.bytes_sent ?? 0`, etc.
- WS batch: `s.seq ?? 0`, `s.tcp_connect_ms ?? null`, `s.messages_sent ?? 0`, `s.drop_count ?? 0`, etc.

### A-H4: Race condition in triggerRunner
**File:** `api/src/services/runService.ts`
**Problem:** Lines 46-49 set status='running' BEFORE calling Runner at line 95. If API crashes between, run stuck in 'running' forever.
**Fix:** Move status update to AFTER successful Runner response:
1. Build payload (keep lines 54-78 as-is, but DON'T update status yet)
2. Call Runner (lines 86-99)
3. On success (after line 119): `UPDATE status = 'running', started_at = now()`
4. On failure: `UPDATE status = 'failed'` (already exists)

### A-H5: WS batch INSERT missing measured_at
**File:** `api/src/routes/runs.ts`
**Problem:** Lines 269-284 — 16 columns, `measured_at` not included. DB default `now()` fills it but Runner timestamp lost.
**Fix:**
- Add `measured_at` to column list (17th column)
- Add `s.measured_at ?? new Date().toISOString()` to values
- Update placeholder count: 16 → 17 params per row

### A-H6: CSV export incomplete escaping
**File:** `api/src/services/exportService.ts`
**Problem:** Lines 143-148 — `csvEscape()` only applied to `target_url`. Other string fields (method, error_type, measured_at) unescaped.
**Fix:** Apply `csvEscape(String(...))` to all string fields:
```ts
r.seq, csvEscape(String(r.method ?? '')), r.is_https,
csvEscape(String(r.target_url ?? '')),
r.status_code ?? '', csvEscape(String(r.error_type ?? '')),
..., csvEscape(String(r.measured_at ?? '')),
```

**Verify:** `cd api && npx tsc --noEmit`

---

## Batch 4 — Dashboard Fixes (6 files, 5 fixes)

### D-H1: Protocol type missing 'https'
**File:** `dashboard/src/types/index.ts`
- Line 31: `'http' | 'socks5'` → `'http' | 'https' | 'socks5'`
- Line 47: same
- Line 58: `'http' | 'socks5'` → `'http' | 'https' | 'socks5'`

**File:** `dashboard/src/components/proxies/ProxyForm.tsx`
- Lines 82, 95: cast → `'http' | 'https' | 'socks5'`
- Lines 138-141: Add `{ value: 'https', label: 'HTTPS' }` option

### D-H2: hasSecurity check excludes valid score=0
**File:** `dashboard/src/components/runs/RunScoreBreakdown.tsx`
**Problem:** Line 66 — `summary.score_security > 0` treats score=0.0 as "skipped" → wrong weight redistribution.
**Fix:** `const hasSecurity = summary.score_security != null;`

### D-H3: Double-fetch on mount
**File:** `dashboard/src/hooks/usePolling.ts`
- Add `fetchOnMount?: boolean` to UsePollingOptions
- Modify useEffect: execute initial poll when `enabled || fetchOnMount`, set interval only when `enabled`

**File:** `dashboard/src/app/runs/[runId]/page.tsx`
- Line 47: Remove `fetchRunDetail()`, keep only `fetchErrorLogs()`:
  `useEffect(() => { fetchErrorLogs(); }, [fetchErrorLogs]);`
- Line 49-53: Add `fetchOnMount: true` to usePolling options

### D-H4: Fetch all 5 endpoints regardless of active tab
**File:** `dashboard/src/hooks/useRunDetail.ts`
- Change: `useRunDetail(runId: string, activeTab?: string)`
- Always fetch: run + summary
- Conditional: http-samples (tab=http/charts/errors), ws-samples (tab=ws/errors), ip-checks (tab=ip/errors)
- Don't clear unfetched data — keep previous state

**File:** `dashboard/src/app/runs/[runId]/page.tsx`
- Line 40: Pass activeTab: `useRunDetail(runId, activeTab)`

### D-M3: ErrorLogFilters debounce
**File:** `dashboard/src/components/runs/ErrorLogFilters.tsx`
- Add 300ms debounce to filter change callbacks

**Verify:** `cd dashboard && npx tsc --noEmit && npx next build`

---

## Batch 5 — Database Schema Sync (1 file, 1 fix)

### X-H1: schema.sql missing migration 002 columns
**File:** `database/schema.sql`
**Problem:** `run_summary` table (lines 143-188) missing 3 columns from migration 002. Fresh Docker install → API crash on summary UPSERT.
**Fix:** Add after line 186 (before `computed_at`):
```sql
ip_clean_score          DOUBLE PRECISION,
majority_tls_version    VARCHAR(20),
tls_version_score       DOUBLE PRECISION,
```

**Verify:** Compare with `database/migrations/002_scoring_improvements.sql`

---

## Final Verification (after all batches)

```bash
cd runner && go build ./... && go vet ./...
cd api && npx tsc --noEmit
cd dashboard && npx tsc --noEmit && npx next build
```

## Summary Table

| Batch | Service | Files | Fixes | Status |
|-------|---------|-------|-------|--------|
| 1 | Go Runner | 4 | R-H1, R-H2, R-H3, R-H5, R-H7 | ☐ |
| 2 | Go Runner | 4 | R-H4, R-H6 | ☐ |
| 3 | API | 4 | A-H1, A-H2, A-H3, A-H4, A-H5, A-H6 | ☐ |
| 4 | Dashboard | 6 | D-H1, D-H2, D-H3, D-H4, D-M3 | ☐ |
| 5 | Database | 1 | X-H1 | ☐ |
| **Total** | | **19** | **19 fixes** | |
