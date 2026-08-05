# FIBA 2024 Timeout Source Mapping

This is limited to RM-07 timeout opportunity, requesting authority and quota. Runtime architecture remains a system recommendation.

| Rule ID | Document/clause | PDF page | Verified official fact | Runtime dependency |
|---|---|---:|---|---|
| RM07-18.2.2 | Rules 18.2.2 | 24 | Timeout may be granted during a timeout opportunity. | Fail closed without opportunity evidence. |
| RM07-18.2.3-A | Rules 18.2.3 bullet 1 | 24 | Dead ball + stopped clock + ended referee-table communication opens for both teams. | Complete match-bound conjunction. |
| RM07-18.2.3-B | Rules 18.2.3 bullet 2 | 24 | Dead ball following successful last free throw opens for both. | Successful-last-free-throw fact. |
| RM07-18.2.3-C | Rules 18.2.3 bullet 3 | 24 | Goal opens for non-scoring team. | Valid goal and scoring team. |
| RM07-18.2.4 | Rules 18.2.4 | 24 | Throw-in or first-free-throw disposal closes. | Disposal fact. |
| RM07-18.2.5 | Rules 18.2.5 | 24 | 2 first-half, 3 second-half with max 2 at Q4 2:00 or less, 1 each overtime. | Event-derived quota; cap does not replenish. |
| RM07-18.2.6 | Rules 18.2.6 | 24 | No carryover to next half/overtime. | Period pools. |
| RM07-18.2.7 | Rules 18.2.7 | 24 | Charge first requesting head/first assistant coach's team, with stated opponent-goal exception. | Request identity/order. |
| RM07-18.2.8 | Rules 18.2.8 | 24 | At Q4/overtime 2:00 or less after goal, scoring team ineligible unless referee interrupted. | Period/clock/scoring team/interruption evidence. |
| RM07-18.3.1 | Rules 18.3.1 | 24 | Only head or first assistant coach may request. | Role mapping. |
| RM07-18.3.2-4 | Rules 18.3.2–18.3.4 | 24 | Cancellation, duration and timer procedure. | Later command procedure. |
| RM07-18/19-1 | Interpretations 18/19-1 | 41 | No timeout before playing time starts or after it ends. | Period-playing-time state. |
| RM07-18/19-2 | Interpretations 18/19-2 | 41 | Match start before clock start does not permit timeout. | Do not infer from LIVE. |
| RM07-18/19-3-4 | Interpretations 18/19-3, 18/19-4 | 41 | Successful shot opens initially only for non-scoring team. | Goal/scoring evidence. |
| RM07-18/19-5-7 | Interpretations 18/19-5, 18/19-6, 18/19-7 | 42–43 | Free-throw disposal closes; later opening depends on authoritative outcome. | Sequence/outcome/disposal facts. |
| RM07-18/19-16-17 | Interpretations 18/19-16, 18/19-17 | 44 | Following foul, timeout waits for communication and substitution completion. | Communication completion. |
| RM07-18/19-21-23 | Interpretations 18/19-21, 18/19-22, 18/19-23 | 45–46 | At Q4 2:00, first box is forfeited if none granted; at most two usable thereafter. | Cap within existing second-half pool. |

- [OFFICIAL RULE] `LIVE`, a stopped clock, or dead ball alone is insufficient.
- [OFFICIAL RULE] Throw-in/first-free-throw disposal closes; period boundaries forbid granting.
- [OFFICIAL RULE] Late-Q4 is a cap in the existing second-half pool, not replenishment.
- [SYSTEM RECOMMENDATION] Persist match-bound, sequence-bound facts and derive opportunity/quota server-side.
