# Ch5 quick check: LoanApp_junior_senior duration/cost provenance

Source: `raw_data/LoanApp_junior_senior.csv` from
https://github.com/lukaskirchdorfer/BPS-MAS-Handover-Optimizer (fetched directly,
1000 cases, `case_id` 0-999). Columns: `case_id, agent, activity_name,
start_timestamp, end_timestamp, TimeStep, resource`.

Note: an older local file `LoanApp_junior_senior.xes` (14 traces only, Disco export)
is NOT the source — it gives very different per-activity means. The 1000-case CSV
above is the correct ground truth.

## 1. Per-activity mean duration (end - start, minutes) vs XML base `<duration>`

| Event | Activity | Log mean (min, n=1000 cases*) | XML `<duration>` | Ratio (XML/log) |
|---|---|---|---|---|
| Event_1 | Check application form completeness | 54.457 | 55 | 1.010 |
| Event_2 | Appraise property | 243.937 | 244 | 1.000 |
| Event_3 | Check credit history | 83.774 | 84 | 1.003 |
| Event_4 | AML check | 258.400 | 258 | 0.998 |
| Event_5 | Assess loan risk | 175.406 | 175 | 0.998 |
| Event_6 | Design loan offer | 19.244 | 19 | 0.987 |
| Event_7 | Approve loan offer | 184.045 | 184 | 1.000 |
| Event_8 | Approve application | 15.043 | 15 | 0.997 |
| Event_9 | Reject application | 28.710 | 29 | 1.010 |
| Event_10 | Cancel application | 13.532 | 14 | 1.034 |
| Event_11 | Return application back to applicant | 15.403 | 15 | 0.974 |
| Event_12 | Applicant completes form | 478.432 | 478 | 0.999 |

\* `count` per activity varies (149-1149 occurrences across the 1000 cases, since not
every activity occurs in every case / some occur >1x), but means are stable.

**Every XML base duration equals the log mean rounded to the nearest integer
minute.** Max deviation is 3.4% (Event_10, 13.532→14); all others <1.5%.

## 2. Cost column check

Full column list: `case_id, agent, activity_name, start_timestamp, end_timestamp,
TimeStep, resource` — **no cost/price/rate/amount column of any kind.**

## VERDICT

- **Durations from log: YES** — all 12 XML `<duration>` values are the per-activity
  mean duration (end_timestamp - start_timestamp) from the 1000-case Kirchdorfer
  event log, rounded to the nearest integer minute.
- **Costs: HAND-ASSIGNED** — the log contains no cost/price column, so XML
  `<cost>` values cannot be log-derived; they were assigned manually (origin
  unverified, possibly adapted from Kirchdorfer et al.'s paper — recommend the
  user double-check against that paper's text before citing).
