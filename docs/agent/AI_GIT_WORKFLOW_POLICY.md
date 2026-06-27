# AI Git Workflow Policy

## Mandatory rule

Before every git commit, merge, or push to origin/main, the AI coding agent must run:

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

## Push to main rule

The AI must not push to origin/main unless all required checks pass.

Required checks:

- `npm test` must pass.
- `npm run build` must pass.
- `npm run test:db` must pass when DB env exists.
- `db:check` must pass when DB env exists.
- `migrate:status` must show 0 pending migrations when DB env exists.
- Guard search must show no unsafe event-store mutation patterns.

## Guard search

Before merging or pushing to main, run:

```bash
rg "scoreboard_state|UPDATE match_events|DELETE FROM match_events|DROP TABLE match_events" .
```

If any unsafe match is found, stop and report it.

## Forbidden behavior

The AI must not:

- push broken code to main
- skip `npm run build`
- claim build passed without running it
- commit `.env`
- commit secrets
- commit generated artifacts
- run `npm audit fix --force` without approval
- update `match_events`
- delete from `match_events`
- create mutable `scoreboard_state`
- implement Socket.IO unless explicitly assigned
- implement dashboards before backend event store and safety gates are stable

## Required report after every task

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

## Recommended workflow

Use this flow for every task:

```bash
git checkout main
git pull origin main
git checkout -b <task-branch>

# implement task

npm test
npm run build

# if DB env exists
npm run test:db
npm run db:check
npm run migrate:status

rg "scoreboard_state|UPDATE match_events|DELETE FROM match_events|DROP TABLE match_events" .

git status
git add .
git commit -m "<type>: <message>"

git checkout main
git pull origin main
git merge --no-ff <task-branch> -m "merge: <task summary>"
git push origin main
```
