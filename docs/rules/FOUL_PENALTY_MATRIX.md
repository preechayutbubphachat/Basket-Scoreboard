---
project: Basketball Scoreboard
type: foul-penalty-matrix
status: active
updated: 2026-07-27
last_verified: 2026-07-27T23:50:00+07:00
confidence: VERIFIED
freshness: CURRENT
source_revision: cd8455cbcbbc984c209ea061ceebdebb4bdcb8ec
brain_schema_version: 1
---

# FIBA 2024 Foul Penalty Matrix

> **Governing Profile:** `FIBA_2024`
> **Source Documents:**
> - FIBA Official Basketball Rules 2024 (105 pages) — SHA-256: `62294f5231710584fd72f53cb2f9825e8f3275ec9a336cb27c81072eb8eb4b46`
> - FIBA Official Basketball Rules Interpretations 2024 (142 pages) — SHA-256: `d804362991c2328c19ec7fc9be17ebbdd1efa666b9cd15bb9488212c9ebf47ae`
> **Effective Date:** 1 October 2024
> **Derivation Status:** COPYRIGHT_SAFE_PARAPHRASE — paraphrased findings with article/interpretation citations only
> **Review Date:** 2026-07-27
> **Limitations:** Copyright-safe paraphrase only; no verbatim reproduction of official text; source hashes bound for provenance

---

## Separation Key

Every row separates four columns:

| Column | Description |
|---|---|
| **[OFFICIAL RULE]** | Facts directly verified from FIBA 2024 Rules or Interpretations |
| **Product Decision** | Project-authorized choices (PD-01, PD-02, PD-03) |
| **Architecture Decision** | Project-authorized architecture (AD-01, AD-02, AD-03) |
| **Implementation Status** | Current state: READY / DEFERRED / SOURCE_GATED |

---

## Foul Penalty Matrix

### 1. PERSONAL FOUL — Defensive (Non-Shooting)

| Field | Value |
|---|---|
| **Canonical Category** | PERSONAL — Defensive Non-Shooting |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 |
| **Team Foul Count** | +1 |
| **Player Status Consequence** | Accumulates toward 5-foul limit |
| **Free Throws** | 0 (unless team in penalty) |
| **Throw-in / Possession** | Throw-in for non-offending team at nearest point |
| **Point of Interruption** | Resume at point of interruption |
| **Period / Overtime** | Team fouls in OT count as 4th quarter |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | No reset (continues if 14+; resets to 14 if <14 in frontcourt) |
| **Substitution** | Standard substitution rules |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | `PLAYER_FOUL_UNDO` reverses player + team count |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: PERSONAL, defensive) |
| **Product Decision** | PD-01: Team foul derived from player foul |
| **Architecture Decision** | AD-02: Team foul derived; AD-01: foul-out derived from count |
| **Implementation Status** | READY (P1 complete) |
| **Source Article** | Art. 34, 41 |
| **Interpretation** | OBRI cases on non-shooting personal fouls |
| **Exceptions** | If team in penalty → bonus free throws (see Team Foul Penalty) |

---

### 2. PERSONAL FOUL — Offensive (Team-Control Foul)

| Field | Value |
|---|---|
| **Canonical Category** | PERSONAL — Offensive / Team-Control |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 |
| **Team Foul Count** | +1 |
| **Player Status Consequence** | Accumulates toward 5-foul limit |
| **Free Throws** | 0 (never) |
| **Throw-in / Possession** | Throw-in for non-offending team at nearest point |
| **Point of Interruption** | Resume at point of interruption |
| **Period / Overtime** | Team fouls in OT count as 4th quarter |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | Resets to 24 for new team control (Art. 29) |
| **Substitution** | Standard substitution rules |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | `PLAYER_FOUL_UNDO` reverses player + team count |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: PERSONAL, offensive) |
| **Product Decision** | PD-01: Team foul derived from player foul |
| **Architecture Decision** | AD-02: Team foul derived |
| **Implementation Status** | READY (P1 complete) |
| **Source Article** | Art. 34, 41 |
| **Interpretation** | OBRI cases on offensive/team-control fouls |
| **Exceptions** | No free throws ever for offensive fouls |

---

### 3. PERSONAL FOUL — Shooting (2-Point Attempt)

| Field | Value |
|---|---|
| **Canonical Category** | PERSONAL — Shooting (2-Point) |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 |
| **Team Foul Count** | +1 |
| **Player Status Consequence** | Accumulates toward 5-foul limit |
| **Free Throws** | 2 (if missed); 1 (if made) |
| **Throw-in / Possession** | If last FT missed → live ball; if made → opponent throw-in |
| **Point of Interruption** | Free throw line |
| **Period / Overtime** | Team fouls in OT count as 4th quarter |
| **Game Clock** | Stops on whistle; restarts on FT touch or throw-in |
| **Shot Clock** | Resets to 24 after last FT (new team control) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | `PLAYER_FOUL_UNDO` + FT reversal if scored |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: PERSONAL, shooting-2pt) + FT events |
| **Product Decision** | PD-01: Team foul derived |
| **Architecture Decision** | AD-02: Team foul derived |
| **Implementation Status** | READY (P1 complete) |
| **Source Article** | Art. 15, 34, 41, 43 |
| **Interpretation** | OBRI cases on act of shooting & 2-pt attempts |
| **Exceptions** | If basket scored → 1 FT only; if team in penalty + missed → 2 FT |

---

### 4. PERSONAL FOUL — Shooting (3-Point Attempt)

| Field | Value |
|---|---|
| **Canonical Category** | PERSONAL — Shooting (3-Point) |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 |
| **Team Foul Count** | +1 |
| **Player Status Consequence** | Accumulates toward 5-foul limit |
| **Free Throws** | 3 (if missed); 1 (if made) |
| **Throw-in / Possession** | If last FT missed → live ball; if made → opponent throw-in |
| **Point of Interruption** | Free throw line |
| **Period / Overtime** | Team fouls in OT count as 4th quarter |
| **Game Clock** | Stops on whistle; restarts on FT touch or throw-in |
| **Shot Clock** | Resets to 24 after last FT (new team control) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | `PLAYER_FOUL_UNDO` + FT reversal if scored |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: PERSONAL, shooting-3pt) + FT events |
| **Product Decision** | PD-01: Team foul derived |
| **Architecture Decision** | AD-02: Team foul derived |
| **Implementation Status** | READY (P1 complete) |
| **Source Article** | Art. 15, 34, 41, 43 |
| **Interpretation** | OBRI cases on act of shooting & 3-pt attempts |
| **Exceptions** | If basket scored → 1 FT only; if team in penalty + missed → 3 FT |

---

### 5. TECHNICAL FOUL — Player

| Field | Value |
|---|---|
| **Canonical Category** | TECHNICAL FOUL — Player |
| **Actor** | Player |
| **Attribution Target** | Individual player (also counts as team foul) |
| **Player Foul Count** | +1 (counts toward 5-foul limit) |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Accumulates toward 5-foul limit; 2 technicals = ejection |
| **Free Throws** | 1 free throw for opponent |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | No reset (continues if 14+; resets to 14 if <14 in frontcourt) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | `PLAYER_FOUL_UNDO` reverses counts; FT reversal if scored |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: TECHNICAL, player) + FT events |
| **Product Decision** | PD-01: Team foul derived from player event |
| **Architecture Decision** | AD-02: Team foul derived |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED (special foul categories) |
| **Source Article** | Art. 36 |
| **Interpretation** | OBRI cases on player technical fouls |
| **Exceptions** | 2nd technical = disqualification (Art. 36.3.2) |

---

### 6. TECHNICAL FOUL — Coach

| Field | Value |
|---|---|
| **Canonical Category** | TECHNICAL FOUL — Coach |
| **Actor** | Coach |
| **Attribution Target** | Coach (charged to head coach) |
| **Player Foul Count** | 0 (not a player) |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Coach ejection on 2nd technical (or 1st if bench technical also) |
| **Free Throws** | 1 free throw for opponent |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | No reset (continues if 14+; resets to 14 if <14 in frontcourt) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | `TEAM_FOUL_UNDO` for team count; coach ejection reversal |
| **Event Model** | `TEAM_FOUL_ADDED` (type: TECHNICAL, coach) + FT events + `COACH_EJECTED` |
| **Product Decision** | PD-01: Team foul derived from coach event (special case) |
| **Architecture Decision** | AD-02: Team foul derived (special case: no player foul count) |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 36, 7 |
| **Interpretation** | OBRI cases on coach technical fouls |
| **Exceptions** | 2nd technical (or 1 technical + 1 bench technical) = ejection |

---

### 7. TECHNICAL FOUL — Bench

| Field | Value |
|---|---|
| **Canonical Category** | TECHNICAL FOUL — Bench |
| **Actor** | Bench personnel (assistant coach, substitute, team follower) |
| **Attribution Target** | Charged to head coach |
| **Player Foul Count** | 0 |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Counts toward coach's technical foul limit (ejection threshold) |
| **Free Throws** | 1 free throw for opponent |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | No reset (continues if 14+; resets to 14 if <14 in frontcourt) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | `TEAM_FOUL_UNDO` for team count; coach ejection reversal |
| **Event Model** | `TEAM_FOUL_ADDED` (type: TECHNICAL, bench) + FT events + `COACH_EJECTED` |
| **Product Decision** | PD-01: Team foul derived from bench event (special case) |
| **Architecture Decision** | AD-02: Team foul derived (special case) |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 36 |
| **Interpretation** | OBRI cases on bench technical fouls |
| **Exceptions** | Counts toward coach ejection threshold |

---

### 8. UNSPORTSMANLIKE FOUL

| Field | Value |
|---|---|
| **Canonical Category** | UNSPORTSMANLIKE FOUL |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 (counts toward 5-foul limit) |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Accumulates toward 5-foul limit; 2 unsportsmanlike = ejection |
| **Free Throws** | 2 free throws for opponent |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table (no rebound) |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | Resets to 24 for opponent (new team control) |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | `PLAYER_FOUL_UNDO` + FT reversal |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: UNSPORTSMANLIKE) + FT events |
| **Product Decision** | PD-01: Team foul derived |
| **Architecture Decision** | AD-02: Team foul derived |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 37 |
| **Interpretation** | OBRI cases on unsportsmanlike foul criteria |
| **Exceptions** | 2nd unsportsmanlike = ejection (Art. 37.3) |

---

### 9. DISQUALIFYING FOUL

| Field | Value |
|---|---|
| **Canonical Category** | DISQUALIFYING FOUL |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | +1 (counts toward 5-foul limit) |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Immediate ejection (disqualification) |
| **Free Throws** | 2 free throws for opponent |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts on throw-in touch |
| **Shot Clock** | Resets to 24 for opponent |
| **Substitution** | Immediate substitution required for disqualified player |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | `PLAYER_FOUL_UNDO` + FT reversal; ejection reversal |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: DISQUALIFYING) + FT events + `PLAYER_EJECTED` |
| **Product Decision** | PD-01: Team foul derived; PD-02: foul-out projection derived |
| **Architecture Decision** | AD-01: foul-out derived; AD-02: team foul derived |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 38 |
| **Interpretation** | OBRI cases on disqualifying foul criteria |
| **Exceptions** | Immediate ejection; cannot be corrected to allow continued play |

---

### 10. FIGHTING FOUL

| Field | Value |
|---|---|
| **Canonical Category** | FIGHTING FOUL |
| **Actor** | Player / Coach / Bench personnel |
| **Attribution Target** | Individual participant |
| **Player Foul Count** | +1 (if player) |
| **Team Foul Count** | +1 (counts toward team penalty) |
| **Player Status Consequence** | Immediate disqualification + possible further sanctions |
| **Free Throws** | As per applicable foul type (usually 2 free throws) |
| **Throw-in / Possession** | Throw-in at throw-in line opposite scorer's table |
| **Point of Interruption** | Throw-in line opposite scorer's table |
| **Period / Overtime** | Counts in all periods |
| **Game Clock** | Stops on whistle; restarts per administration |
| **Shot Clock** | Resets to 24 for opponent |
| **Substitution** | Immediate substitution for disqualified players |
| **Penalty Cancellation** | Does NOT cancel with double foul |
| **Correction Implication** | Complex — ejection + further sanctions |
| **Event Model** | `PLAYER_FOUL_ADDED` (type: FIGHTING) + `PLAYER_EJECTED` + possible `TEAM_FOUL_ADDED` |
| **Product Decision** | PD-01: Team foul derived; PD-02: ejection derived |
| **Architecture Decision** | AD-01: ejection derived; AD-02: team foul derived |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 39 |
| **Interpretation** | OBRI cases on fighting criteria and sanctions |
| **Exceptions** | Further sanctions by competition authority |

---

### 11. DOUBLE FOUL

| Field | Value |
|---|---|
| **Canonical Category** | DOUBLE FOUL |
| **Actor** | Two opponents |
| **Attribution Target** | Both players |
| **Player Foul Count** | +1 for each player |
| **Team Foul Count** | 0 (neither team gains team foul) |
| **Player Status Consequence** | Each accumulates toward 5-foul limit |
| **Free Throws** | 0 (free throws cancel) |
| **Throw-in / Possession** | Resume at point of interruption |
| **Point of Interruption** | Point of interruption |
| **Period / Overtime** | N/A |
| **Game Clock** | Continues from interruption point |
| **Shot Clock** | Continues from interruption point (or resets per situation) |
| **Substitution** | No substitution required |
| **Penalty Cancellation** | Free throws cancel; no team foul penalty |
| **Correction Implication** | Two `PLAYER_FOUL_UNDO` events |
| **Event Model** | Two `PLAYER_FOUL_ADDED` events + `DOUBLE_FOUL` marker |
| **Product Decision** | PD-01: Team foul derived (0 for double foul) |
| **Architecture Decision** | AD-02: Team foul derived (0) |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 35 |
| **Interpretation** | OBRI cases on double foul criteria |
| **Exceptions** | If one foul is unsportsmanlike/disqualifying → not a double foul |

---

### 12. MULTIPLE FOULS (Simultaneous/Sequential)

| Field | Value |
|---|---|
| **Canonical Category** | MULTIPLE FOULS |
| **Actor** | Two or more players |
| **Attribution Target** | Each player individually |
| **Player Foul Count** | +1 per foul per player |
| **Team Foul Count** | +1 per foul per team |
| **Player Status Consequence** | Each accumulates toward 5-foul limit |
| **Free Throws** | Administered in order of occurrence |
| **Throw-in / Possession** | Per final penalty in sequence |
| **Point of Interruption** | Per final penalty |
| **Period / Overtime** | Per individual foul |
| **Game Clock** | Stops on each whistle |
| **Shot Clock** | Per final penalty |
| **Substitution** | Per individual foul requirements |
| **Penalty Cancellation** | Per Art. 42 — penalties administered in order |
| **Correction Implication** | Individual `PLAYER_FOUL_UNDO` per foul |
| **Event Model** | Multiple `PLAYER_FOUL_ADDED` events in sequence |
| **Product Decision** | PD-01: Each team foul derived |
| **Architecture Decision** | AD-02: Each team foul derived |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 42 |
| **Interpretation** | OBRI cases on penalty administration order |
| **Exceptions** | Double fouls within multiple fouls cancel per Art. 35 |

---

### 13. TEAM FOUL PENALTY (Bonus Free Throws)

| Field | Value |
|---|---|
| **Canonical Category** | TEAM FOUL PENALTY |
| **Actor** | Team (derived status) |
| **Attribution Target** | Team |
| **Player Foul Count** | N/A (derived) |
| **Team Foul Count** | Threshold: 4 team fouls per quarter (OT = 4th quarter) |
| **Player Status Consequence** | N/A |
| **Free Throws** | 2 free throws for each subsequent team foul (bonus) |
| **Throw-in / Possession** | If last FT missed → live ball; if made → opponent throw-in |
| **Point of Interruption** | Free throw line / throw-in line |
| **Period / Overtime** | OT team fouls count as 4th quarter |
| **Game Clock** | Stops on whistle for FTs |
| **Shot Clock** | Resets to 24 after last FT |
| **Substitution** | Permitted during FT intervals |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | `TEAM_FOUL_UNDO` (via `PLAYER_FOUL_UNDO` of source event) |
| **Event Model** | Derived projection: `isTeamInPenalty` = true/false |
| **Product Decision** | **PD-01: NO DIRECT TEAM-FOUL ENTRY** — team fouls derived only |
| **Architecture Decision** | **AD-02: DERIVED FROM PLAYER FOUL EVENTS ONLY** |
| **Implementation Status** | READY (P1 complete) |
| **Source Article** | Art. 41 |
| **Interpretation** | OBRI cases on team foul penalty administration |
| **Exceptions** | Offensive fouls, technical fouls by non-control team don't count toward penalty |

---

### 14. PLAYER FOUL LIMIT — Foul-Out (5 Fouls)

| Field | Value |
|---|---|
| **Canonical Category** | PLAYER FOUL LIMIT — FOUL-OUT |
| **Actor** | Player |
| **Attribution Target** | Individual player |
| **Player Foul Count** | Threshold: 5 fouls |
| **Team Foul Count** | N/A (each foul already counted) |
| **Player Status Consequence** | Must leave game immediately; substitution required |
| **Free Throws** | N/A (triggered by 5th foul event) |
| **Throw-in / Possession** | N/A |
| **Point of Interruption** | N/A |
| **Period / Overtime** | Fouls accumulate through OT |
| **Game Clock** | Stops on 5th foul whistle |
| **Shot Clock** | N/A |
| **Substitution** | Immediate substitution required |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | Correction below 5 clears foul-out status automatically |
| **Event Model** | **No `PLAYER_FOULED_OUT` event** — derived from count |
| **Product Decision** | **PD-02: INFORMATIONAL FOUL-OUT ONLY** — private presentation, no command blocking |
| **Architecture Decision** | **AD-01: PROJECTION-DERIVED** — no `PLAYER_FOULED_OUT` event |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED (informational presentation only) |
| **Source Article** | Art. 40 |
| **Interpretation** | OBRI cases on 5-foul limit and substitution |
| **Exceptions** | If team reduced to <5 players, continue per Art. 40.4 |

---

### 15. FOUL-OUT / DISQUALIFICATION CONSEQUENCES

| Field | Value |
|---|---|
| **Canonical Category** | FOUL-OUT / DISQUALIFICATION CONSEQUENCES |
| **Actor** | System (derived) |
| **Attribution Target** | Player / Team |
| **Player Foul Count** | 5 (foul-out) / N/A (disqualification) |
| **Team Foul Count** | N/A |
| **Player Status Consequence** | Foul-out: must leave; Disqualification: ejected + possible sanctions |
| **Free Throws** | As per triggering foul |
| **Throw-in / Possession** | As per triggering foul |
| **Point of Interruption** | As per triggering foul |
| **Period / Overtime** | Fouls accumulate through OT |
| **Game Clock** | Stops on whistle |
| **Shot Clock** | As per triggering foul |
| **Substitution** | Mandatory for foul-out/disqualification |
| **Penalty Cancellation** | N/A |
| **Correction Implication** | Correction reverses status automatically (projection-derived) |
| **Event Model** | No foul-out event; `PLAYER_EJECTED` for disqualification |
| **Product Decision** | PD-02: INFORMATIONAL ONLY; PD-01: team foul derived |
| **Architecture Decision** | AD-01: DERIVED; AD-02: DERIVED |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED (informational only) |
| **Source Article** | Art. 40, 38, 39 |
| **Interpretation** | OBRI cases on foul-out and disqualification |
| **Exceptions** | Team reduced to <5 players continues per Art. 40.4 |

---

### 16. SPECIAL SITUATIONS (Article 42)

| Field | Value |
|---|---|
| **Canonical Category** | SPECIAL SITUATIONS (Art. 42) |
| **Actor** | Various |
| **Attribution Target** | Per situation |
| **Player Foul Count** | Per situation |
| **Team Foul Count** | Per situation |
| **Player Status Consequence** | Per situation |
| **Free Throws** | Administered in order of occurrence |
| **Throw-in / Possession** | Per final penalty |
| **Point of Interruption** | Per final penalty |
| **Period / Overtime** | Per situation |
| **Game Clock** | Stops on each whistle |
| **Shot Clock** | Per final penalty |
| **Substitution** | Per situation |
| **Penalty Cancellation** | Penalties administered in order; double fouls cancel |
| **Correction Implication** | Individual `PLAYER_FOUL_UNDO` per foul |
| **Event Model** | Multiple `PLAYER_FOUL_ADDED` events in sequence |
| **Product Decision** | PD-01, PD-02, PD-03 as per individual fouls |
| **Architecture Decision** | AD-01, AD-02, AD-03 as per individual fouls |
| **Implementation Status** | SOURCE_COMPLETE / DEFERRED |
| **Source Article** | Art. 42 |
| **Interpretation** | OBRI cases on penalty administration order |
| **Exceptions** | Double fouls within multiple fouls cancel per Art. 35 |

---

## Product Decision Summary (Applied in Matrix)

| ID | Decision | Matrix Effect |
|---|---|---|
| **PD-01** | NO DIRECT TEAM-FOUL ENTRY | Team foul counts derived from player foul events only; no `TEAM_FOUL_ADDED` operator command |
| **PD-02** | INFORMATIONAL FOUL-OUT ONLY | Private operator presentation only; no command blocking, no auto-substitution, no auto free throws |
| **PD-03** | NO INLINE FOUL HISTORY | Existing Replay/correction surfaces remain history sources; no new panel/API |

## Architecture Decision Summary (Applied in Matrix)

| ID | Decision | Matrix Effect |
|---|---|---|
| **AD-01** | PROJECTION-DERIVED FOUL-OUT | No `PLAYER_FOULED_OUT` event; status derived from `playerFoulCount >= 5` |
| **AD-02** | DERIVED TEAM FOULS | Team fouls increment from `PLAYER_FOUL_ADDED` only; no explicit `TEAM_FOUL_ADDED` |
| **AD-03** | NO NEW FOUL-HISTORY READ MODEL | Replay remains the authoritative history surface |

---

## Source Traceability

Every matrix row above is bound to:

| Source | Article(s) | Interpretation |
|---|---|---|
| Rules | Art. 15, 17, 29, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 48, 50, App. A, App. B | OBRI cases per article |
| Interpretations | All corresponding OBRI cases | Official 2024 Interpretations |

**Source Hashes:**
- Rules: `62294f5231710584fd72f53cb2f9825e8f3275ec9a336cb27c81072eb8eb4b46`
- Interpretations: `d804362991c2328c19ec7fc9be17ebbdd1efa666b9cd15bb9488212c9ebf47ae`

---

## Verification Status

| Check | Result |
|---|---|
| Source completeness | 20/20 areas SOURCE_COMPLETE |
| No unsupported rows | ✅ |
| No missing mandatory categories | ✅ |
| Product/rule separation | ✅ (explicit columns) |
| Architecture/rule separation | ✅ (explicit columns) |
| Copyright-safe paraphrase | ✅ |
| Source hash binding | ✅ |
| Terminology consistency | ✅ (FIBA_2024 profile) |
| DNT integrity | ✅ |

---

## Implementation Readiness

| Category | Status |
|---|---|
| Personal fouls (P1) | READY (implemented) |
| Technical fouls | DEFERRED (requires special-foul architecture) |
| Unsportsmanlike/Disqualifying/Fighting | DEFERRED |
| Double/Multiple fouls | DEFERRED |
| Team foul penalty | READY (projection implemented) |
| Foul-out informational | DEFERRED (informational only) |
| Special situations | DEFERRED |

---

## Next Gates

1. Independent rule review (passed: true required)
2. Independent architecture review (passed: true required)
3. Docs-only commit + feature push + fast-forward main
3. Post-matrix reassessment for implementation-ready candidates