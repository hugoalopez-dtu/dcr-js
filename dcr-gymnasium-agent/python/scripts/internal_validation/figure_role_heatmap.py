"""
Full-sweep role-specialisation heatmap for the role-conditioned Loan
Application benchmark: %Expert per event across all six (alpha, beta)
weight pairs, not just the two poles shown in
figures_loanapp_role_slopegraph.py. Closes the appendix referenced as
Appendix~\\ref{app:loanapp_role_distribution} (Chapter6) and
Appendix~\\ref{app:role_heatmap} (Chapter_Discussion_FINAL) -- same
intended content, two different label names, neither previously
defined anywhere.

Reuses the exact data-loading and %Expert computation of
figures_loanapp_role_slopegraph.py (last 20% of accepting episodes per
config, >=20 legal role-choice steps per event), extended from 2 poles
to all 6 configs.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/internal_validation/figure_role_heatmap.py
"""
import csv
import re
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

LOGS_DIR = Path("/Users/sofia/Desktop/loanapp_roles_logs")
OUT_DIR = Path(__file__).resolve().parent / "loanapp_roles_figures"
OUT_DIR.mkdir(parents=True, exist_ok=True)

LABELS_ORDER = ["a=1.0 b=0.0", "a=2.0 b=0.5", "a=0.5 b=0.5",
                "a=0.5 b=2.0", "a=0.0 b=1.0", "a=0.0 b=0.0"]
COLUMN_TITLES = ["1.0 / 0.0", "2.0 / 0.5", "0.5 / 0.5",
                  "0.5 / 2.0", "0.0 / 1.0", "0.0 / 0.0"]

SHORT_NAME = {
    "Check application form completeness": "Application completeness",
    "Return application back to applicant": "Return application",
    "Check credit history":                 "Credit history",
    "Assess loan risk":                     "Risk assessment",
    "Appraise property":                    "Property appraisal",
    "AML check":                             "AML check",
    "Design loan offer":                     "Design loan offer",
    "Approve loan offer":                    "Approve loan offer",
    "Approve application":                   "Approve application",
    "Reject application":                    "Reject application",
    "Cancel application":                    "Cancel application",
    "Applicant completes form":              "Applicant completes form",
}


def parse_weights(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", stem)
    if m:
        return float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
    return None, None


def wlabel(a, b):
    return f"a={a:.1f} b={b:.1f}" if a is not None else "unknown"


def load_data(logs_dir):
    rows = []
    for p in sorted(logs_dir.glob("train_trace_exp_LoanApp_roles_*.csv")):
        if "_k" in p.stem:
            continue
        a, b = parse_weights(p.stem)
        if a is None:
            continue
        label = wlabel(a, b)
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
                if str(row.get("done", "")).lower() not in ("true", "1"):
                    continue
                try:
                    rows.append({
                        "label": label,
                        "episode": int(row.get("episode", 0)),
                        "accepting": str(row.get("accepting", "")).lower() in ("true", "1"),
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def load_steps(logs_dir):
    rows = []
    for p in sorted(logs_dir.glob("train_trace_exp_LoanApp_roles_*.csv")):
        if "_k" in p.stem:
            continue
        a, b = parse_weights(p.stem)
        if a is None:
            continue
        label = wlabel(a, b)
        with open(p, newline="") as f:
            for row in csv.DictReader(f):
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
                    rows.append({
                        "label": label,
                        "episode": int(row.get("episode", 0)),
                        "event": event, "role": role,
                    })
                except (ValueError, KeyError):
                    pass
    return pd.DataFrame(rows)


def tail_20pct(grp):
    return grp.iloc[int(len(grp) * 0.8):]


def build_full_role_table(df, df_steps):
    role_table = {}
    for label in LABELS_ORDER:
        grp_ep = df[df["label"] == label]
        if grp_ep.empty:
            role_table[label] = {}
            continue
        tail_eps = tail_20pct(grp_ep)
        acc_ep_nums = set(tail_eps[tail_eps["accepting"]]["episode"].tolist())
        grp_steps = df_steps[(df_steps["label"] == label) & (df_steps["episode"].isin(acc_ep_nums))]
        event_pct = {}
        for event, eg in grp_steps.groupby("event"):
            if len(eg) < 20:
                continue
            event_pct[event] = (eg["role"] == "Expert").mean() * 100
        role_table[label] = event_pct
    return role_table


def main():
    df = load_data(LOGS_DIR)
    df_steps = load_steps(LOGS_DIR)
    role_table = build_full_role_table(df, df_steps)

    events = sorted(
        {e for table in role_table.values() for e in table},
        key=lambda e: -np.mean([abs(role_table[l].get(e, 50) - 50) for l in LABELS_ORDER if e in role_table[l]])
    )
    names = [SHORT_NAME.get(e, e) for e in events]

    z = np.full((len(events), len(LABELS_ORDER)), np.nan)
    for i, e in enumerate(events):
        for j, label in enumerate(LABELS_ORDER):
            if e in role_table[label]:
                z[i, j] = role_table[label][e]

    fig, ax = plt.subplots(figsize=(8, 0.5 * len(events) + 2))
    im = ax.imshow(z, cmap="RdYlGn_r", vmin=0, vmax=100, aspect="auto")

    ax.set_xticks(range(len(LABELS_ORDER)))
    ax.set_xticklabels(COLUMN_TITLES, rotation=0, fontsize=9)
    ax.set_xlabel(r"Weight pair ($\alpha$ / $\beta$)")
    ax.set_yticks(range(len(events)))
    ax.set_yticklabels(names, fontsize=9)

    for i in range(len(events)):
        for j in range(len(LABELS_ORDER)):
            if not np.isnan(z[i, j]):
                ax.text(j, i, f"{z[i, j]:.0f}", ha="center", va="center", fontsize=8,
                         color="black" if 30 < z[i, j] < 70 else "white")

    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("% Expert assignment")

    ax.set_title("Expert-assignment rate per event across the full\n"
                  "weight sweep (role-conditioned Loan Application)")
    fig.tight_layout()
    out_path = OUT_DIR / "LoanApp_role_heatmap.png"
    fig.savefig(out_path, dpi=200)
    plt.close(fig)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
