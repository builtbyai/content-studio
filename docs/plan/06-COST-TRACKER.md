# Phase 06 — Cost tracker

Status: SHIPPED (worker /api/spend + web/src/components/CostBar.tsx)

- Per-model unit prices encoded in worker.
- Aggregates today / this month / all-time succeeded jobs × rate.
- Inflight count surfaces queued + processing jobs.
- Auto-refresh: 30s timer + on every terminal job state change.

### Caveats (open)
- Estimated until we capture Replicate's `metrics.predict_time` per prediction.
- Workers AI cost based on docs, not actual gateway invoice.

### Future
- Add monthly budget cap → block new jobs when >100% AND `enforceCap=true`.
- Per-source-kind breakdown (Video Lab vs Scene Composer vs Workflow Composer).
- Cost-estimate-before-dispatch banner in Lab forms.
- Pull actual invoiced totals from Cloudflare AI Gateway analytics API once exposed.
