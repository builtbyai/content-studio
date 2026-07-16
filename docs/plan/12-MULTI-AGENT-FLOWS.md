# Phase 12 — Multi-agent flows

## Goal
Fan out single user request → N parallel specialist agents → synthesizer → ranked output. Mirrors the `/multi-agent-search` skill pattern.

## Worker plan
- `POST /api/agents/dispatch` body: `{ goal, agents: [{role, prompt}], synthesisModel }`.
- Worker concurrently dispatches each agent through env.AI (model per role).
- Collects results, sends to synthesisModel (`openai/gpt-5`) for ranked synthesis.
- Stores as a `compositions` row with `mode=multiagent`.

## Web plan
- New "Agents" workbench in Studio (or sub-route of WorkflowComposer).
- 3 default agent slots (research, contrarian, summarizer); add/remove freely.
- Each shows live status + partial output streaming via SSE.

## Status: DOC ONLY. Implementation deferred to next session.
