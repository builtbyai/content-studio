# Phase 07 — Intel deepen

Status: SHIPPED (worker runIntelTagger + /api/intel/signals + web IntelSignals tab)

- Hourly cron tags articles with sentiment / angle / topic / signal via gpt-4o-mini.
- Signal feed page filters by angle (competitor / industry / customer-pain / regulatory).
- Manual triggers: re-tag now, seed roofing sources.

### Future
- Auto-cluster signals by topic vector embeddings (env.AI bge-base + Vectorize VEC_LEADS).
- Daily digest email of the top 10 high-signal items.
- Competitor diff: when a competitor blog adds a new article on a topic we haven't covered, surface as "battlecard candidate".
- Slack/Postiz webhook on new high-impact regulatory or hail-storm signal.
