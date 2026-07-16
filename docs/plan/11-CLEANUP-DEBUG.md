# Phase 11 — Cleanup + debug

Status: PARTIAL — sidebar split into Studio + Legacy.

### What ships
- `legacy` nav group hosts WorkflowRunner, BRollWorkspace, Generations, CampaignCopilot, VisualPreviewer, WorkflowStudio.
- Studio group is the prominent default. New users see Studio + workbenches first.

### What's still TODO (next session)
- Delete `WorkflowStudio.tsx` once nobody uses it (60-day deprecation telemetry needed).
- Audit dead deps in `web/package.json`.
- Consolidate duplicate `Generations` UI now that Studio's Generations workbench mirrors it.
- Move shared types out of components into `web/src/types/` to drop circular imports.
- Replace `Layers` icon usage on Legacy with a clearer "Folder" or "Archive" icon.
- Wrap top-level App with an ErrorBoundary that auto-reports to a `/api/errors` collector.
