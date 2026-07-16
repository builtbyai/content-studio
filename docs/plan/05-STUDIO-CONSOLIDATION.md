# Phase 05 — Studio consolidation

Status: SHIPPED (web/src/App.tsx)

- Old Studio nav group reordered: Studio (unified) is #1.
- Legacy entries (WorkflowRunner, BRollWorkspace, Generations, CampaignCopilot, VisualPreviewer, WorkflowStudio) folded under new "Legacy" nav group.
- All tabs still accessible — no regression. Cmd+K palette still resolves them.

### Future
- Add deprecation banners on Legacy components: "Use Studio's <X> workbench instead."
- After 30 days of low Legacy usage, delete the legacy components and migration shims.
