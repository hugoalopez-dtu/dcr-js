"""
Per-event Expert-assignment-rate stability across seeds, for the
"Stability across seeds" paragraph in sec:loanapp_roles
(Chapter6_Results_REVISED.tex). Closes the TODO asking for concrete
cross-seed deviation figures, complementing the front-level robustness
already computed by aggregate_seed_robustness_roles.py.

Reuses the exact %Expert-at-each-pole computation of
figures_loanapp_role_slopegraph.py (last 20% of accepting episodes per
config, >=20 legal role-choice steps per event), but across all four
seeds instead of seed=1 only.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/analyze_role_stability_across_seeds.py
"""
import csv
import re
from pathlib import Path

import pandas as pd

SEED1_DIR = Path("/Users/sofia/Desktop/loanapp_roles_logs")
SEEDROB_DIR = Path("/Users/sofia/Desktop/loanapp_roles_seedrob_logs")

POLE_L = "a1.0 b0.0"   # cost-focused
POLE_R = "a0.0 b1.0"   # duration-focused

SHORT_NAME = {
    "Check application form completeness": "Application completeness",
    "Return application back to applicant": "Return application",
    "Check credit history":                 "Credit history",
    "Assess loan risk":                     "Risk assessment",
    "Appraise property":                    "Property appraisal",
}


def parse_weights(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", stem)
    if m:
        return float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
    return None, None


def wlabel(a, b):
    return f"a{a:.1f} b{b:.1f}" if a is not None else "unknown"


def load_for_seed(seed):
    search_dir = SEED1_DIR if seed == 1 else SEEDROB_DIR
    episodes, steps = [], []
    seen_configs = {}
    for p in sorted(search_dir.glob(f"train_trace_exp_LoanApp_roles_s{seed}_*.csv")):
        a, b = parse_weights(p.stem)
        if a is None:
            continue
        label = wlabel(a, b)
        # keep the most complete file per config (handles partial leftovers)
        n_lines = sum(1 for _ in open(p))
        if label in seen_configs and seen_configs[label][1] >= n_lines:
            continue
        seen_configs[label] = (p, n_lines)

    for label, (p, _) in seen_configs.items():
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                if str(row.get("done", "")).lower() in ("true", "1"):
                    try:
                        episodes.append({
                            "label": label,
                            "episode": int(row.get("episode", 0)),
                            "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                        })
                    except (ValueError, KeyError):
                        pass
                try:
                    bm = float(row.get("base_mapped", 0))
                except ValueError:
                    continue
                if bm == -10.0:
                    continue
                role = row.get("action_role", "")
                event = row.get("action_label", "")
                if not role or not event:
                    continue
                try:
                    steps.append({
                        "label": label,
                        "episode": int(row.get("episode", 0)),
                        "event": event, "role": role,
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(episodes), pd.DataFrame(steps)


def tail_20pct(grp):
    return grp.iloc[int(len(grp) * 0.8):]


def role_table_for_seed(seed):
    df, df_steps = load_for_seed(seed)
    table = {}
    for label in (POLE_L, POLE_R):
        grp_ep = df[df["label"] == label]
        if grp_ep.empty:
            table[label] = {}
            continue
        tail_eps = tail_20pct(grp_ep)
        acc_ep_nums = set(tail_eps[tail_eps["accepting"]]["episode"].tolist())
        grp_steps = df_steps[(df_steps["label"] == label) & (df_steps["episode"].isin(acc_ep_nums))]
        event_pct = {}
        for event, eg in grp_steps.groupby("event"):
            if len(eg) < 20:
                continue
            event_pct[event] = (eg["role"] == "Expert").mean() * 100
        table[label] = event_pct
    return table


def main():
    per_seed = {seed: role_table_for_seed(seed) for seed in [1, 2, 3, 4]}

    common_events = set(per_seed[1][POLE_L]) & set(per_seed[1][POLE_R])
    for seed in [2, 3, 4]:
        common_events &= set(per_seed[seed][POLE_L])
        common_events &= set(per_seed[seed][POLE_R])

    print(f"{'Event':<35} {'Pole':<10} {'min':>6} {'max':>6} {'range':>6}")
    max_range_overall = 0.0
    for event in sorted(common_events):
        name = SHORT_NAME.get(event, event)
        for pole, pole_name in [(POLE_L, "cost"), (POLE_R, "duration")]:
            vals = [per_seed[seed][pole][event] for seed in [1, 2, 3, 4]]
            rng = max(vals) - min(vals)
            max_range_overall = max(max_range_overall, rng)
            print(f"{name:<35} {pole_name:<10} {min(vals):>6.1f} {max(vals):>6.1f} {rng:>6.1f}")

    print(f"\nMax cross-seed range across all events/poles: {max_range_overall:.1f} percentage points")


if __name__ == "__main__":
    main()
