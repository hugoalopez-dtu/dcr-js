"""
Temporal sequence of role choices for the "most balanced" Pareto trace
at each Expert capacity budget k, for the role-conditioned Loan
Application benchmark. Unlike the role-slopegraph/heatmap (which show
per-event Expert-assignment RATE pooled over many episodes), this shows
ONE actual episode's event order with the role chosen at each step,
stacked one row per budget k -- so role choice is shown as coupled
across the sequence (genuinely non-trivial under a shared Expert
budget), not as an independent per-event statistic.

"Most balanced" follows the same definition used throughout the
chapter (figures_loanapp_roles.py / analyze_loanapp_capacity.py):
minimum Euclidean distance to the ideal point after min-max
normalising cost and duration, pooled over the five non-baseline
weight configs, last 20% of training.

Two findings confirmed directly against the raw per-step CSV rows
(not assumptions of this script): at k=3 the balanced trace spends
only 2 of the 3 available Expert assignments; at k=inf the event
order itself differs from the capacity-constrained cases (Appraise
property and Check credit history swap position).

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/figure_role_sequence_timeline.py
"""
import csv
import glob
import re
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

DATA_DIR = Path(__file__).resolve().parent / "loanapp_roles_capacity"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results"
OUT_DIR.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans"],
})

K_VALUES = [1, 2, 3, None]
K_LABEL = {1: "k=1", 2: "k=2", 3: "k=3", None: "k=inf"}
K_BUDGET = {1: 1, 2: 2, 3: 3, None: None}

SHORT_NAME = {
    "Check application form completeness": "CheckForm",
    "Appraise property": "Appraise",
    "Check credit history": "CheckCredit",
    "AML check": "AML",
    "Assess loan risk": "AssessRisk",
    "Design loan offer": "DesignOffer",
    "Approve loan offer": "ApproveOffer",
    "Approve application": "Approve",
    "Reject application": "Reject",
    "Cancel application": "Cancel",
    "Return application back to applicant": "Return",
    "Applicant completes form": "Completes",
}

ROLE_COLOR = {"Junior": "#0F6E56", "Expert": "#993C1D"}


def parse_weights(stem):
    m = re.search(r"_a([\dp]+)_b([\dp]+)", stem)
    if m:
        return float(m.group(1).replace("p", ".")), float(m.group(2).replace("p", "."))
    return None, None


def files_for_k(k):
    if k is None:
        pattern = str(DATA_DIR / "train_trace_exp_LoanApp_roles_s1_a*_b*_2*.csv")
        return [f for f in glob.glob(pattern) if not re.search(r"_k\d_", f)]
    pattern = str(DATA_DIR / f"train_trace_exp_LoanApp_roles_s1_a*_b*_k{k}_*.csv")
    return glob.glob(pattern)


def load_rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def balanced_episode_for_k(k):
    """Returns (file_path, episode_number, sequence) for the most-balanced
    accepting episode in the last 20% of training, pooled across the 5
    non-baseline configs, at budget k."""
    candidates = []  # (cost, duration, path, episode)
    for path in files_for_k(k):
        a, b = parse_weights(Path(path).stem)
        if a is None or (a == 0.0 and b == 0.0):
            continue
        rows = load_rows(path)
        done_eps = [r for r in rows if str(r.get("done", "")).lower() == "true"]
        n = len(done_eps)
        if n == 0:
            continue
        tail = done_eps[int(n * 0.8):]
        for r in tail:
            if str(r.get("accepting", "")).lower() != "true":
                continue
            try:
                cost, dur = float(r["episode_cost"]), float(r["episode_duration"])
            except (KeyError, ValueError):
                continue
            candidates.append((cost, dur, path, int(r["episode"])))

    if not candidates:
        return None

    costs = np.array([c[0] for c in candidates])
    durs = np.array([c[1] for c in candidates])
    c_norm = (costs - costs.min()) / (costs.max() - costs.min()) if costs.max() > costs.min() else np.zeros_like(costs)
    d_norm = (durs - durs.min()) / (durs.max() - durs.min()) if durs.max() > durs.min() else np.zeros_like(durs)
    dist = np.sqrt(c_norm ** 2 + d_norm ** 2)
    best_idx = int(np.argmin(dist))
    _, _, best_path, best_ep = candidates[best_idx]

    rows = load_rows(best_path)
    ep_rows = [r for r in rows if int(r.get("episode", -1)) == best_ep]
    sequence = []
    for r in ep_rows:
        if r.get("message", "").startswith("Non-compliant"):
            continue
        event = SHORT_NAME.get(r.get("action_label", ""), r.get("action_label", "?"))
        role = r.get("action_role", "")
        sequence.append((event, role))
    return best_path, best_ep, sequence


def main():
    sequences = {}
    for k in K_VALUES:
        result = balanced_episode_for_k(k)
        if result is None:
            print(f"No accepting episodes found for {K_LABEL[k]}")
            continue
        path, ep, seq = result
        sequences[k] = seq
        print(f"{K_LABEL[k]}: episode {ep} from {Path(path).name}, {len(seq)} steps")

    max_len = max(len(seq) for seq in sequences.values())
    n_rows = len(sequences)

    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=200)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    tile_w, tile_h = 1.2, 0.7
    gap = 0.15
    x_step = tile_w + gap
    row_pitch = tile_h + gap + 0.35  # extra room for the "left: N" label under each tile

    for row, k in enumerate(K_VALUES):
        if k not in sequences:
            continue
        y = (n_rows - 1 - row) * row_pitch
        budget = K_BUDGET[k]

        # thin dashed separator above the k=inf row (unconstrained, qualitatively
        # different from the three capacity-constrained rows above it)
        if k is None:
            sep_y = y + tile_h + gap * 1.6
            ax.plot([-0.3, max_len * x_step], [sep_y, sep_y], linestyle=(0, (4, 3)),
                    linewidth=0.9, color="#AAAAAA")

        for step, (event, role) in enumerate(sequences[k]):
            color = ROLE_COLOR.get(role, "#AAAAAA")
            x = step * x_step
            ax.add_patch(FancyBboxPatch((x, y), tile_w, tile_h,
                                         boxstyle="round,pad=0,rounding_size=0.06",
                                         facecolor=color, edgecolor="none"))
            ax.text(x + tile_w / 2, y + tile_h * 0.64, event, ha="center", va="center",
                    fontsize=9, color="white", fontweight=500)
            ax.text(x + tile_w / 2, y + tile_h * 0.26, f"step {step + 1}", ha="center", va="center",
                    fontsize=8, color="white", fontweight="light")
            if budget is not None:
                if role == "Expert":
                    budget -= 1
                ax.text(x + tile_w / 2, y - 0.10, f"left: {budget}", ha="center", va="top",
                        fontsize=8, color="#555555")
        ax.text(-0.3, y + tile_h / 2, K_LABEL[k], ha="right", va="center",
                fontsize=12, fontweight="bold")

    ax.set_xlim(-1.9, max_len * x_step + 0.15)
    ax.set_ylim(-0.45, n_rows * row_pitch + 0.5)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.text(0.5, -0.05, "Execution order (step in the episode) " + r"$\rightarrow$",
            transform=ax.transAxes, ha="center", va="top", fontsize=10.5)

    legend_y = n_rows * row_pitch + 0.15
    legend_x0 = (max_len * x_step) / 2 - 1.4
    ax.add_patch(FancyBboxPatch((legend_x0, legend_y), 0.4, 0.28,
                                 boxstyle="round,pad=0,rounding_size=0.05",
                                 facecolor=ROLE_COLOR["Junior"], edgecolor="none"))
    ax.text(legend_x0 + 0.55, legend_y + 0.14, "Junior", ha="left", va="center", fontsize=11)
    ax.add_patch(FancyBboxPatch((legend_x0 + 1.5, legend_y), 0.4, 0.28,
                                 boxstyle="round,pad=0,rounding_size=0.05",
                                 facecolor=ROLE_COLOR["Expert"], edgecolor="none"))
    ax.text(legend_x0 + 2.05, legend_y + 0.14, "Expert", ha="left", va="center", fontsize=11)

    ax.set_title("Role choice along the most-balanced accepting trace, by Expert capacity budget",
                 fontsize=13, fontweight="normal", pad=22)

    fig.tight_layout()
    out_path = OUT_DIR / "LoanApp_capacity_trace.png"
    fig.savefig(out_path, dpi=200, facecolor="white", bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
