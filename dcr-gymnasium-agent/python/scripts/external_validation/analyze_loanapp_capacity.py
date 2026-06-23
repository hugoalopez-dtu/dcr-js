"""
Analysis of the capacity-constrained Loan Application role experiment
(k in {1,2,3,inf}, 6 weight pairs each, seed=1) -- fills in the TODOs
left in Chapter 6 (tab:loanapp_capacity_front, fig:loanapp_capacity_allocation):

  - Recovered cost/duration front per budget k (Q1)
  - Expert-budget allocation per event per k (Q2)

Does NOT compute the three allocation heuristics (Always-Junior,
Always-Expert, Greedy-per-event) for Q3 -- those aren't RL runs, they
require a separate deterministic-policy script against the same
environment, not present in the data pulled from the cluster.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/analyze_loanapp_capacity.py
"""
import glob
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DATA_DIR = Path(__file__).resolve().parent / "loanapp_roles_capacity"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

K_VALUES = [None, 1, 2, 3]
K_LABEL = {None: "k=inf", 1: "k=1", 2: "k=2", 3: "k=3"}


def files_for_k(k):
    if k is None:
        # unconstrained files have NO _k suffix at all
        pattern = str(DATA_DIR / "train_trace_exp_LoanApp_roles_s1_a*_b*_2*.csv")
        return [f for f in glob.glob(pattern) if not re.search(r"_k\d_", f)]
    pattern = str(DATA_DIR / f"train_trace_exp_LoanApp_roles_s1_a*_b*_k{k}_*.csv")
    return glob.glob(pattern)


def last20_episodes(csv_path):
    df = pd.read_csv(csv_path, low_memory=False)
    eps = df[df["done"] == True].copy()
    n = len(eps)
    if n == 0:
        return df.iloc[0:0], df.iloc[0:0]
    last20 = eps.tail(max(1, n // 5))
    # row-level data (for role allocation) restricted to the same tail window
    cutoff_step = last20["global_timestep"].min()
    last20_rows = df[df["global_timestep"] >= cutoff_step]
    return last20, last20_rows


def pareto_filter(points):
    pts = list(set(points))
    return [p for p in pts if not any(
        q != p and q[0] <= p[0] and q[1] <= p[1] and (q[0] < p[0] or q[1] < p[1])
        for q in pts
    )]


def main():
    front_rows = []
    role_rows = []

    for k in K_VALUES:
        files = files_for_k(k)
        print(f"{K_LABEL[k]}: {len(files)} weight-pair files")
        if not files:
            continue

        all_points = set()
        accept_rates = []
        role_records = []

        for f in files:
            last20_eps, last20_rows = last20_episodes(f)
            if len(last20_eps) == 0:
                continue
            accept_rates.append(last20_eps["accepting"].astype(str).str.lower().eq("true").mean())
            accepted = last20_eps[last20_eps["accepting"].astype(str).str.lower() == "true"]
            for c, d in zip(accepted["episode_cost"], accepted["episode_duration"]):
                try:
                    all_points.add((round(float(c), 1), round(float(d), 1)))
                except (TypeError, ValueError):
                    continue

            # role allocation: every legal step with a role choice, in the
            # same final-20% window, regardless of episode outcome
            roled = last20_rows[last20_rows["action_role"].isin(["Junior", "Expert"])]
            role_records.append(roled[["action_event", "action_role"]])

        front = pareto_filter(all_points)
        costs = [p[0] for p in front]
        durs = [p[1] for p in front]
        front_rows.append({
            "k": K_LABEL[k],
            "n_weight_files": len(files),
            "accept_rate_mean": np.mean(accept_rates) if accept_rates else np.nan,
            "pareto_points": len(front),
            "cost_min": min(costs) if costs else np.nan,
            "cost_max": max(costs) if costs else np.nan,
            "dur_min": min(durs) if durs else np.nan,
            "dur_max": max(durs) if durs else np.nan,
        })

        if role_records:
            roles_df = pd.concat(role_records, ignore_index=True)
            expert_rate = (roles_df.groupby("action_event")["action_role"]
                           .apply(lambda s: (s == "Expert").mean()))
            for event, rate in expert_rate.items():
                role_rows.append({"k": K_LABEL[k], "event": event, "expert_rate": rate})

    front_table = pd.DataFrame(front_rows)
    front_table.to_csv(OUT_DIR / "capacity_front_table.csv", index=False)
    print("\n=== Front per budget k ===")
    print(front_table.to_string(index=False))

    EVENT_LABELS = {
        "Event_1": "Check application form completeness",
        "Event_2": "Appraise property",
        "Event_3": "Check credit history",
        "Event_4": "AML check",
        "Event_5": "Assess loan risk",
        "Event_6": "Design loan offer",
        "Event_7": "Approve loan offer",
        "Event_8": "Approve application",
        "Event_9": "Reject application",
        "Event_10": "Cancel application",
        "Event_11": "Return application to applicant",
        "Event_12": "Applicant completes form",
    }
    role_table = pd.DataFrame(role_rows)
    role_table["event"] = role_table["event"].map(EVENT_LABELS).fillna(role_table["event"])
    role_table.to_csv(OUT_DIR / "capacity_role_allocation.csv", index=False)

    # ---- Figure: Expert allocation per event, one line per k ----
    if not role_table.empty:
        pivot = role_table.pivot(index="event", columns="k", values="expert_rate")
        # order events by overall variability (most sensitive first) for readability
        pivot = pivot.loc[pivot.std(axis=1).sort_values(ascending=False).index]

        fig, ax = plt.subplots(figsize=(10, 6))
        for k_label in pivot.columns:
            ax.plot(pivot.index, pivot[k_label], marker="o", label=k_label)
        ax.set_ylabel("Expert-assignment rate")
        ax.set_xlabel("event")
        ax.set_xticklabels(pivot.index, rotation=60, ha="right", fontsize=8)
        ax.set_ylim(-0.05, 1.05)
        ax.legend(title="Expert budget")
        ax.set_title("Expert-budget allocation per event, by capacity limit k\n"
                      "(Loan Application, final 20% of training, pooled across 6 weight pairs)")
        fig.tight_layout()
        fig.savefig(OUT_DIR / "capacity_allocation_per_event.png", dpi=150)
        plt.close(fig)
        print(f"\nWrote {OUT_DIR / 'capacity_allocation_per_event.png'}")

    print(f"\nWrote {OUT_DIR / 'capacity_front_table.csv'}")
    print(f"Wrote {OUT_DIR / 'capacity_role_allocation.csv'}")


if __name__ == "__main__":
    main()
