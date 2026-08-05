# Command Event Traceability

## Current Schema Behavior

`match_events` is append-only and currently has these event identity constraints:

- `UNIQUE(event_id)`
- `UNIQUE(match_id, seq_no)`
- `UNIQUE(match_id, command_id)`

`command_deduplication` also has `UNIQUE(match_id, command_id)` and stores the command result used for idempotent command replay.

This means one match event can carry a given command envelope `commandId` for a match. A second event for the same match cannot reuse that same `commandId`, even when both events were produced by one valid command.

## Multi-Event Command Conflict

The score correction apply command is a valid multi-event workflow. One command can append:

1. `SCORE_REMOVED_BY_CORRECTION`
2. replacement `SCORE_ADDED`
3. `CORRECTION_APPLIED`

If all three event rows used the same command envelope `commandId`, MariaDB would reject the second insert because of `UNIQUE(match_id, command_id)` on `match_events`.

## Current Workaround

The current implementation keeps the existing migration unchanged:

- `command_deduplication` uses the original command envelope `commandId`.
- The terminal `CORRECTION_APPLIED` event uses the original command envelope `commandId`.
- Internal compensating and replacement events use generated UUID command IDs so they can satisfy `UNIQUE(match_id, command_id)`.
- All events produced by the command share the same `correlationId`.
- `causationId` links the compensating event to the original score event, the replacement score event to the compensation event, and the terminal correction event to the correction request event.
- The audit log stores the correction reason, old/new values, correlation ID, causation ID, and final event sequence.

The current DB integration test verifies that:

- correction events are appended in sequence order,
- duplicate apply-score commands return `DUPLICATE_ACCEPTED`,
- stale `expectedSeq` commands append no events,
- the terminal correction event uses the envelope `commandId`,
- internal correction events have unique generated command IDs,
- the correction events share the envelope `correlationId`,
- causation links are populated,
- public scoreboard output does not expose private correction data.

## Risks

- Querying `match_events` by command envelope `commandId` returns only the terminal event for multi-event workflows, not every event caused by the command.
- Generated internal command IDs are not command envelope IDs, so their name can mislead future readers unless traceability rules are documented and tested.
- Reporting or audit tools that assume one command ID maps to all caused events will under-report correction details.
- The schema mixes command idempotency identity and per-event uniqueness identity in one `command_id` column.

## Long-Term Design Options

### Option A: Allow Shared Command IDs On Match Events

Remove `UNIQUE(match_id, command_id)` from `match_events` and rely on `command_deduplication UNIQUE(match_id, command_id)` for command idempotency.

This allows all events caused by one command to share the exact envelope `commandId`. Event uniqueness remains protected by `event_id` and `(match_id, seq_no)`.

This is the cleanest event-sourcing model for multi-event commands, but it requires a deliberate migration and review of any code that assumes `match_events.command_id` is unique.

### Option B: Add Parent Or Originating Command ID

Keep `match_events.command_id` unique, but add a nullable `originating_command_id` or `parent_command_id` column.

Under this model:

- `command_id` stays a per-event unique ID.
- `originating_command_id` stores the command envelope ID for all events produced by a command.
- `command_deduplication` remains the idempotency source for command envelope IDs.

This preserves the existing unique constraint but requires a schema addition and clear naming to avoid confusing event IDs with command envelope IDs.

### Option C: Keep The Current Workaround

Keep generated internal event command IDs and require complete `correlationId`, `causationId`, and audit coverage for every multi-event workflow.

This avoids migration risk now, but it keeps a semantic mismatch in `match_events.command_id` and requires stronger documentation, tests, and query conventions.

## Recommendation

Prefer Option A for the long-term schema: remove `UNIQUE(match_id, command_id)` from `match_events` and keep command idempotency in `command_deduplication`.

Until that migration is explicitly assigned and reviewed, keep the current workaround. Do not change historical events, do not update or delete `match_events`, and keep multi-event workflow traceability covered by DB integration tests.
