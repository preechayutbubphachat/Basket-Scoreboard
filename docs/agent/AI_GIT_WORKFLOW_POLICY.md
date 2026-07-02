# AI Git Workflow Policy

## Mandatory Build Rule

Before every commit, merge, or push to origin/main, the AI coding agent must run:

```bash
npm test
npm run build
```

If database environment variables are available, also run:

```bash
npm run test:db
npm run db:check
npm run migrate:status
```

The AI must not push to origin/main if `npm run build` fails.

## Required Project Document Pre-Flight

Before coding, read the task-relevant canonical project documents under `docs/`, including agent, product, architecture, rules, security, API, database, UI, and quality contracts when the task touches those areas.

## Required Guard Search

Before merge or push to main, run:

```bash
rg "scoreboard_state|UPDATE match_events|DELETE FROM match_events|DROP TABLE match_events" apps packages migrations tests
```

If any unsafe match is found, stop and report it.

## Forbidden Behavior

The AI must not:

- push broken code to main
- skip `npm run build`
- claim build passed without running it
- commit `.env`
- commit secrets
- commit generated artifacts such as `dist`, `build`, `coverage`, `node_modules`
- run `npm audit fix --force` without approval
- update `match_events`
- delete from `match_events`
- create mutable `scoreboard_state`
- implement Socket.IO unless explicitly assigned

## Required Report After Every Task

Every completed task must report:

1. Task branch
2. Task commit hash
3. Merge commit hash on main
4. Current origin/main commit hash
5. Files created
6. Files changed
7. Commands run
8. `npm test` result
9. `npm run build` result
10. `npm run test:db` result if DB env exists
11. `db:check` result if DB env exists
12. `migrate:status` result if DB env exists
13. Guard search result
14. Whether `.env` or generated artifacts are tracked
15. Known limitations
16. Next recommended task
