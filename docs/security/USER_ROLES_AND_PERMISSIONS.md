# USER_ROLES_AND_PERMISSIONS.md

## 0. Purpose

[SYSTEM RECOMMENDATION] This document defines the authorization model for the Basketball Scoreboard and Tournament Management web application.

This file tells every AI coding agent how user roles, permissions, match assignment, realtime socket authorization, public access, correction approval, and audit requirements must work.

This system is not a simple public scoreboard. It controls live match data, tournament records, correction history, and official match summaries. Therefore authorization must be enforced server-side for every REST API request and every realtime command.

---

## 1. Core Authorization Principle

[SYSTEM RECOMMENDATION] Use **deny-by-default authorization**.

If a permission is not explicitly granted, the action must be rejected.

```txt
Default result = DENY
Allow only when:
1. user is authenticated, if required;
2. user has the required role;
3. user has the required permission;
4. user is within the allowed resource scope;
5. command payload passes validation;
6. match state allows the action;
7. rules engine allows the action.
```

The client must never be trusted for:

```txt
- user role
- permission
- team assignment
- match assignment
- score state
- foul state
- clock state
- shot clock state
- timeout state
- event sequence
- correction authority
```

---

## 2. Security Labels

Use these labels in implementation notes, code review, and AI agent responses:

```txt
[PUBLIC]             No login required, read-only only.
[AUTHENTICATED]      Login required.
[RBAC]               Role-based permission required.
[MATCH_SCOPED]       User must be assigned to the match or have admin-level access.
[TOURNAMENT_SCOPED]  User must be assigned to the tournament or have admin-level access.
[CORRECTION]         Requires correction permission, reason, and audit log.
[AUDIT_REQUIRED]     Must create audit/event trail.
[DENY_BY_DEFAULT]    Reject unless explicitly allowed.
[NEEDS_APPROVAL]     Requires Product Owner / Admin approval before implementation.
```

---

## 3. Authentication vs Authorization

### 3.1 Authentication

Authentication answers:

```txt
Who is this user?
```

Recommended authenticated identity fields:

```ts
type AuthenticatedUser = {
  userId: string;
  displayName: string;
  email?: string;
  globalRoles: RoleCode[];
  organizationIds: string[];
  tournamentAssignments: TournamentAssignment[];
  matchAssignments: MatchAssignment[];
  isActive: boolean;
};
```

### 3.2 Authorization

Authorization answers:

```txt
Can this user perform this action on this resource right now?
```

Authorization must check:

```txt
- action
- resource type
- resource id
- user role
- resource assignment
- match status
- tournament status
- command payload validity
- expectedSeq
- rule engine decision
```

---

## 4. Role Model Overview

The system uses a combination of:

```txt
1. Global roles
2. Organization-scoped roles
3. Tournament-scoped roles
4. Match-scoped roles
5. Public read-only access
```

[SYSTEM RECOMMENDATION] RBAC alone is not enough for live matches. The system must also use resource scoping, especially `assigned match only`.

Example:

```txt
A Referee / Scorer can operate Match A only if assigned to Match A.
The same user must not automatically operate Match B.
```

---

## 5. Default Roles

## 5.1 Admin

Admin has full management access within the organization or tournament scope assigned to them.

Can manage:

```txt
- tournaments
- teams
- players
- rosters
- matches
- schedules
- users
- roles
- permissions
- rule profiles
- correction approvals
- audit logs
- match summaries
- tournament standings
```

Admin can:

```txt
- create tournament
- update tournament settings
- create/edit teams
- create/edit players
- manage tournament roster
- create/edit match schedule
- assign match officials
- assign scorer/operator users
- configure rule profile
- publish/unpublish match summary
- approve/reject correction workflow
- view audit log
- export match/tournament data
```

Admin must not:

```txt
- directly mutate historical match_events
- delete audit records
- bypass correction reason
- bypass event sequence validation
- edit official rules without creating a versioned rule profile
```

Required audit:

```txt
[AUDIT_REQUIRED]
- user management
- role changes
- rule profile changes
- match schedule changes
- roster changes after lock
- correction approval/rejection
- official result publication
```

---

## 5.2 Referee / Scorer

Referee / Scorer operates assigned matches.

Can operate assigned matches:

```txt
- score
- team fouls
- player fouls
- game clock
- shot clock
- timeout
- possession
- offensive direction
- period transitions
- overtime start
- correction request
```

Scope:

```txt
[MATCH_SCOPED]
The user must be assigned to the match as:
- referee
- scorer
- assistant scorer
- timer
- shot clock operator
- authorized match operator
```

Can send live match commands:

```txt
- ADD_SCORE
- ADJUST_SCORE_BY_CORRECTION_REQUEST
- ADD_PLAYER_FOUL
- ADD_TEAM_FOUL
- START_GAME_CLOCK
- STOP_GAME_CLOCK
- SET_GAME_CLOCK
- START_SHOT_CLOCK
- STOP_SHOT_CLOCK
- RESET_SHOT_CLOCK_24
- RESET_SHOT_CLOCK_14
- SET_SHOT_CLOCK
- GRANT_TIMEOUT
- CANCEL_TIMEOUT_BY_CORRECTION_REQUEST
- CHANGE_POSSESSION
- SWITCH_DIRECTION
- START_PERIOD
- END_PERIOD
- START_OVERTIME
- REQUEST_CORRECTION
```

Can view:

```txt
- assigned match live state
- assigned match events
- assigned match correction history
- assigned match summary draft
```

Cannot:

```txt
- manage global users
- manage role definitions
- delete events
- approve their own post-match correction if policy requires Admin approval
- operate unassigned matches
- change rule profile
- publish tournament-wide standings unless granted separately
```

Required audit:

```txt
[AUDIT_REQUIRED]
Every live command must create a match event with actor metadata.
Every correction request must include reason.
```

---

## 5.3 Viewer

Viewer is read-only.

Can view:

```txt
- public scoreboard
- schedule
- standings
- match summary
- published tournament bracket
- published team information
- published player roster
```

Cannot:

```txt
- send match commands
- join operator socket room
- view private audit logs
- view unpublished corrections
- view admin-only pages
- create/edit/delete any resource
```

Scope:

```txt
[PUBLIC] or [AUTHENTICATED]
Viewer may be unauthenticated for public displays if the endpoint is explicitly public.
```

---

## 5.4 Public Scoreboard Display

This is not a human role. It represents a public display device such as a scoreboard screen, projector, TV, or kiosk.

Can:

```txt
- read live scoreboard state
- read public match clock state
- read public score/foul/timeout state
- reconnect using lastEventSeq
```

Cannot:

```txt
- send commands
- send corrections
- join operator room
- view private audit details
- access admin APIs
```

[SYSTEM RECOMMENDATION] Public scoreboard clients should receive sanitized state only.

Do not expose:

```txt
- user IDs
- private notes
- internal audit metadata
- correction drafts
- unpublished disputes
- security-sensitive event metadata
```

---

## 5.5 Optional Fine-Grained Match Roles

[SYSTEM RECOMMENDATION] The MVP may use a single `Referee / Scorer` role. For production, the system should support finer match roles without rewriting the authorization system.

Optional match-scoped roles:

```txt
- Match Supervisor
- Referee
- Scorer
- Assistant Scorer
- Timer
- Shot Clock Operator
- Score Operator
- Foul Operator
- Public Display Operator
```

### Permission Examples

```txt
Scorer:
- add score
- add foul
- grant timeout
- request correction

Timer:
- start/stop/set game clock
- manage interval clock
- manage timeout clock

Shot Clock Operator:
- start/stop/reset/set shot clock

Assistant Scorer:
- operate public scoreboard projection
- verify scoreboard discrepancy

Match Supervisor:
- approve in-match correction
- lock/unlock match
- publish official result
```

[ASSUMPTION] Fine-grained match roles are recommended for production, but MVP may start with Admin, Referee / Scorer, and Viewer only.

---

## 6. Permission Naming Convention

Permission codes must be stable and machine-readable.

Format:

```txt
resource.action.scope
```

Examples:

```txt
tournament.create.organization
tournament.update.assigned
team.create.tournament
player.update.tournament
roster.manage.tournament
match.schedule.tournament
match.assign_official.tournament
match.view.public
match.view.assigned
match.operate.assigned
match.score.assigned
match.foul.assigned
match.clock.assigned
match.shot_clock.assigned
match.timeout.assigned
match.possession.assigned
match.correction.request.assigned
match.correction.approve.assigned
match.correction.approve.any
match.result.publish.assigned
match.result.publish.tournament
audit.view.assigned
audit.view.tournament
user.manage.organization
role.manage.organization
rule_profile.manage.organization
```

---

## 7. Permission Matrix

| Action / Resource | Admin | Referee / Scorer | Viewer | Public Scoreboard |
|---|---:|---:|---:|---:|
| View public scoreboard | Yes | Yes | Yes | Yes |
| View schedule | Yes | Yes | Yes | Yes |
| View standings | Yes | Yes | Yes | Yes |
| View match summary | Yes | Yes | Yes | Yes, if published |
| View assigned match operator state | Yes | Yes, assigned only | No | No |
| Create tournament | Yes | No | No | No |
| Update tournament | Yes | No | No | No |
| Manage teams | Yes | No, unless delegated | No | No |
| Manage players | Yes | No, unless delegated | No | No |
| Manage rosters | Yes | No, unless delegated | No | No |
| Create match schedule | Yes | No | No | No |
| Assign officials/operators | Yes | No | No | No |
| Start match | Yes | Yes, assigned only | No | No |
| Add score | Yes | Yes, assigned only | No | No |
| Add player foul | Yes | Yes, assigned only | No | No |
| Add team foul | Yes | Yes, assigned only | No | No |
| Start/stop game clock | Yes | Yes, assigned only | No | No |
| Reset/set shot clock | Yes | Yes, assigned only | No | No |
| Grant timeout | Yes | Yes, assigned only | No | No |
| Change possession | Yes | Yes, assigned only | No | No |
| Switch direction | Yes | Yes, assigned only | No | No |
| Request correction | Yes | Yes, assigned only | No | No |
| Approve correction | Yes | Optional by policy | No | No |
| View audit log | Yes | Assigned match only | No | No |
| Publish official result | Yes | Optional by policy | No | No |
| Manage users | Yes | No | No | No |
| Manage roles | Yes | No | No | No |
| Manage rule profile | Yes | No | No | No |

---

## 8. Resource Scopes

## 8.1 Organization Scope

Organization-scoped permissions apply to:

```txt
- users
- global teams
- global players
- role definitions
- default rule profiles
- audit policies
```

## 8.2 Tournament Scope

Tournament-scoped permissions apply to:

```txt
- tournament settings
- stages
- groups
- tournament teams
- tournament rosters
- match schedule
- standings
- brackets
- published results
```

## 8.3 Match Scope

Match-scoped permissions apply to:

```txt
- live score
- fouls
- game clock
- shot clock
- timeout
- possession
- correction requests
- match summary
- match audit trail
```

## 8.4 Public Scope

Public scope applies only to explicitly published read models:

```txt
- public scoreboard state
- schedule
- published standings
- published match summaries
```

---

## 9. Match Assignment Model

[SYSTEM RECOMMENDATION] Live match operation must require match assignment.

Example match assignment:

```ts
type MatchAssignment = {
  matchId: string;
  userId: string;
  role: MatchRoleCode;
  permissions: PermissionCode[];
  assignedBy: string;
  assignedAt: string;
  revokedAt?: string | null;
};
```

A user can operate a match only when:

```txt
- user is active
- match assignment exists
- assignment is not revoked
- match is not locked, unless user has override permission
- permission matches requested action
```

---

## 10. REST API Authorization Rules

Every protected REST API must run authorization middleware.

### 10.1 Required API Auth Context

```ts
type ApiAuthContext = {
  userId: string | null;
  roles: RoleCode[];
  permissions: PermissionCode[];
  organizationIds: string[];
  tournamentIds: string[];
  matchAssignments: MatchAssignment[];
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
};
```

### 10.2 API Authorization Flow

```txt
1. Authenticate user if endpoint is not public.
2. Load server-side roles and permissions.
3. Resolve target resource.
4. Check resource scope.
5. Check permission.
6. Validate request payload.
7. Apply rules engine validation if command affects match state.
8. Reject by default if any check fails.
9. Append event/audit log when applicable.
```

### 10.3 API Denial Response

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "reasonCode": "PERMISSION_DENIED",
    "message": "You do not have permission to perform this action.",
    "correlationId": "..."
  }
}
```

---

## 11. Socket Authorization Rules

[SYSTEM RECOMMENDATION] Socket handshake authentication is not enough. Every socket command must be authorized again.

### 11.1 Socket Rooms

```txt
match:{matchId}:public
match:{matchId}:operator
match:{matchId}:admin
```

### 11.2 Public Room

Can receive:

```txt
- SCOREBOARD_STATE
- SCOREBOARD_PATCH
- MATCH_CLOCK_TICK_HINT
- FULL_STATE_SYNC_REQUIRED
```

Cannot send:

```txt
- ADD_SCORE
- ADD_FOUL
- START_CLOCK
- STOP_CLOCK
- RESET_SHOT_CLOCK
- CORRECTION_REQUEST
```

### 11.3 Operator Room

Requires:

```txt
[AUTHENTICATED]
[MATCH_SCOPED]
[RBAC]
```

Can send only commands explicitly allowed by permission.

### 11.4 Admin Room

Requires:

```txt
[AUTHENTICATED]
[RBAC]
Admin or specific admin permission.
```

### 11.5 Socket Command Format

Every command must include:

```ts
type SocketCommand<TPayload> = {
  commandId: string;
  matchId: string;
  expectedSeq: number;
  correlationId: string;
  clientTimestamp: string;
  payload: TPayload;
};
```

### 11.6 Socket Command Authorization Flow

```txt
1. Verify socket identity.
2. Load latest server-side user permissions.
3. Verify room access.
4. Verify match assignment.
5. Validate command schema.
6. Validate expectedSeq.
7. Validate rules engine decision.
8. Use commandId for idempotency.
9. Append match event in transaction.
10. Broadcast committed event or projection patch.
```

---

## 12. Correction Permission Policy

Corrections are high-risk operations.

Every correction must require:

```txt
[AUTHENTICATED]
[RBAC]
[MATCH_SCOPED] or Admin-level permission
[CORRECTION]
[AUDIT_REQUIRED]
```

Correction request must include:

```ts
type CorrectionRequest = {
  matchId: string;
  targetEventId?: string;
  correctionType:
    | "SCORE_CORRECTION"
    | "FOUL_CORRECTION"
    | "CLOCK_CORRECTION"
    | "SHOT_CLOCK_CORRECTION"
    | "TIMEOUT_CORRECTION"
    | "POSSESSION_CORRECTION"
    | "ROSTER_CORRECTION"
    | "OTHER";
  reason: string;
  proposedPayload: unknown;
  expectedSeq: number;
};
```

Minimum reason rule:

```txt
reason is required
reason must not be empty
reason must be stored
reason must be visible in audit log to authorized users
```

Forbidden correction behavior:

```txt
- Do not update old event payload.
- Do not delete old event.
- Do not silently change projection state.
- Do not allow correction without reason.
- Do not allow public viewer correction.
```

Required correction event pattern:

```txt
1. CORRECTION_REQUESTED
2. CORRECTION_APPROVED or CORRECTION_REJECTED
3. CORRECTION_APPLIED
4. projection rebuild or projection patch
```

[ASSUMPTION] MVP may combine approval and application into one Admin action, but must still create explicit correction events and audit logs.

---

## 13. Audit Requirements

Every privileged action must capture:

```txt
- actor user id
- actor display name, if available
- actor role at action time
- actor permissions used
- device id
- IP address, if available
- user agent, if available
- timestamp
- resource type
- resource id
- action
- old value, if applicable
- new value, if applicable
- reason, if correction or override
- command id
- correlation id
- causation id
- match id, if applicable
- event sequence, if applicable
```

Audit logs must be append-only.

Audit logs must not be exposed to public viewers.

---

## 14. Match State Restrictions

Authorization must consider match state.

Examples:

```txt
SCHEDULED:
- Admin can edit schedule.
- Assigned operator can prepare match.

READY:
- Assigned operator can start match.

LIVE:
- Assigned operator can operate score/foul/clock/shot clock/timeout/possession.

PAUSED:
- Assigned operator can resume or correct.

PERIOD_BREAK:
- Assigned operator can start next period.
- Corrections may be allowed with reason.

FINISHED:
- Live commands denied.
- Corrections require correction permission.

OFFICIAL:
- Corrections require Admin or configured supervisor approval.
- Public summary can be published.

LOCKED:
- Only Admin-level unlock or approved correction workflow.
```

---

## 15. Rule Profile Permissions

Only Admin or explicitly authorized role can manage rule profiles.

Can manage:

```txt
- create custom rule profile
- duplicate FIBA profile
- change tournament rule profile before tournament lock
- version rule profile
- archive rule profile
```

Cannot:

```txt
- edit official FIBA profile in place
- change rule profile during live match unless emergency override is explicitly approved
- apply rule profile change without audit log
```

Rule profile changes require audit:

```txt
[AUDIT_REQUIRED]
- old profile id
- new profile id
- old values
- new values
- reason
- actor
- timestamp
```

---

## 16. Tournament Permissions

Tournament management actions:

```txt
tournament.create
tournament.update
tournament.delete_or_archive
tournament.publish
tournament.lock
tournament.unlock
stage.create
stage.update
group.create
group.update
schedule.create
schedule.update
standings.recalculate
result.publish
result.unpublish
```

[SYSTEM RECOMMENDATION] Prefer archive instead of hard delete for tournaments with historical matches.

---

## 17. Team / Player / Roster Permissions

Team and roster permissions must distinguish:

```txt
Team master:
- long-lived team identity

TournamentRoster:
- players registered for a tournament

MatchRoster:
- players active for a match
```

Roster changes after match start require:

```txt
[RBAC]
[AUDIT_REQUIRED]
reason
```

[NEEDS SOURCE] Local eligibility rules must be provided by tournament organizer before implementing automatic eligibility validation.

---

## 18. Public Access Policy

Public endpoints must be explicitly marked.

Allowed public endpoints:

```txt
GET /public/matches/:matchId/scoreboard
GET /public/tournaments/:tournamentId/schedule
GET /public/tournaments/:tournamentId/standings
GET /public/matches/:matchId/summary
```

Public endpoints must return read-only sanitized projection data.

Public endpoints must not return:

```txt
- auth context
- private user data
- audit logs
- unpublished corrections
- internal event metadata
- command ids
- device ids
- IP addresses
```

---

## 19. AI Agent Implementation Rules

AI agents must not:

```txt
- authorize based on role sent from client
- trust hidden form fields for permissions
- skip server-side RBAC because UI hides a button
- allow public clients to send socket commands
- join operator room without server-side authorization
- store permissions only in frontend constants
- implement correction without audit log
- implement delete event as undo
- bypass match assignment check
- bypass expectedSeq check
```

AI agents must:

```txt
- implement authorization server-side
- add tests for every protected action
- add negative tests for forbidden actions
- use shared permission constants/types
- use middleware/guards for REST APIs
- use per-message authorization for socket commands
- log denied privileged actions when useful
- document all new permissions
```

---

## 20. Recommended TypeScript Structure

```txt
src/
  auth/
    auth.types.ts
    role.types.ts
    permission.types.ts
    permission.constants.ts
    authorization.service.ts
    authorization.guard.ts
    socket-authorization.ts
    auth.errors.ts

  users/
    user.entity.ts
    user.service.ts

  matches/
    match-assignment.types.ts
    match-permissions.ts
    match-command-auth.ts

  audit/
    audit.types.ts
    audit.service.ts
```

---

## 21. Permission Types Example

```ts
export type RoleCode =
  | "ADMIN"
  | "REFEREE_SCORER"
  | "VIEWER"
  | "PUBLIC_DISPLAY";

export type PermissionCode =
  | "tournament.create.organization"
  | "tournament.update.assigned"
  | "team.manage.tournament"
  | "player.manage.tournament"
  | "roster.manage.tournament"
  | "match.schedule.tournament"
  | "match.assign_official.tournament"
  | "match.view.public"
  | "match.view.assigned"
  | "match.operate.assigned"
  | "match.score.assigned"
  | "match.foul.assigned"
  | "match.clock.assigned"
  | "match.shot_clock.assigned"
  | "match.timeout.assigned"
  | "match.possession.assigned"
  | "match.correction.request.assigned"
  | "match.correction.approve.assigned"
  | "match.result.publish.tournament"
  | "audit.view.tournament"
  | "user.manage.organization"
  | "role.manage.organization"
  | "rule_profile.manage.organization";
```

---

## 22. Authorization Function Contract

```ts
type AuthorizeInput = {
  actor: AuthenticatedUser | null;
  action: PermissionCode;
  resource: {
    type:
      | "organization"
      | "tournament"
      | "team"
      | "player"
      | "match"
      | "audit_log"
      | "rule_profile";
    id: string;
    organizationId?: string;
    tournamentId?: string;
    matchId?: string;
  };
  context?: {
    matchStatus?: string;
    expectedSeq?: number;
    commandId?: string;
    isPublicEndpoint?: boolean;
  };
};

type AuthorizeResult = {
  allowed: boolean;
  reasonCode:
    | "ALLOWED"
    | "NOT_AUTHENTICATED"
    | "USER_INACTIVE"
    | "PERMISSION_DENIED"
    | "ROLE_NOT_ALLOWED"
    | "MATCH_NOT_ASSIGNED"
    | "TOURNAMENT_NOT_ASSIGNED"
    | "MATCH_LOCKED"
    | "PUBLIC_READ_ONLY"
    | "NEEDS_CORRECTION_REASON"
    | "NEEDS_ADMIN_APPROVAL";
  explanation: string;
};
```

---

## 23. Required Tests

AI agent must add tests for:

```txt
Admin can manage tournament.
Viewer cannot add score.
Public scoreboard cannot send socket command.
Referee / Scorer can operate assigned match.
Referee / Scorer cannot operate unassigned match.
Inactive user cannot perform protected action.
Admin can assign official.
Non-admin cannot assign official.
Correction without reason is rejected.
Correction by viewer is rejected.
Correction creates audit log.
Socket command checks permission per message.
Client-provided role is ignored.
Duplicate command does not create duplicate event.
Command with stale expectedSeq is rejected.
Locked match rejects live commands.
Published public summary does not expose audit metadata.
```

---

## 24. Acceptance Criteria

This file is accepted when:

```txt
- every role has clear allowed and forbidden actions
- every live command requires server-side permission check
- every socket command requires per-message authorization
- public scoreboard is read-only
- correction requires permission, reason, and audit log
- Admin cannot bypass append-only event policy
- match assignment is required for non-admin match operation
- permissions are machine-readable
- tests cover allowed and denied paths
```

---

## 25. Open Product Decisions

[NEEDS_APPROVAL] Product Owner must decide:

```txt
1. Should Referee / Scorer be able to approve their own correction?
2. Should correction after match is OFFICIAL require Admin only?
3. Should public scoreboard be accessible without login?
4. Should team managers exist as a future role?
5. Should match officials be separated into Scorer, Timer, and Shot Clock Operator in MVP?
6. Should audit logs be exportable by tournament admins?
7. Should local tournament organizer roles be added?
```

---

## 26. Next Safe Implementation Step

After this file is approved, create:

```txt
EVENT_MODEL.md
```

That file must define:

```txt
- match event metadata
- event sequence
- command idempotency
- correction events
- audit metadata
- projection effects
- permission requirement per event type
```
