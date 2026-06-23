"""
Non-learning allocation heuristics for the Expert-budget experiment.

Three conditions (each respects the budget gate):

  always_junior   — every step: pick a random DCR-enabled event, execute with Junior.

  always_expert   — every step: pick a random DCR-enabled event; use Expert while
                    budget > 0, fall back to Junior when exhausted.

  greedy          — every step: argmin α·effective_cost + β·effective_duration over
                    all valid (event, role) pairs; (event, Expert) is excluded from
                    the candidate set when budget == 0. Tie-break: lexicographic pair
                    index (deterministic given the marking). Event selection follows
                    from the role decision — no separate random event choice.

Event selection for always_junior / always_expert:
  Random choice from the set of DCR-enabled events (uniform, same as shielding-only).
  The role is then pinned by the heuristic rule.

All three heuristics send actions directly to the server; the server's budget gate
is the authority. Heuristics never intentionally send Expert when budget == 0, so
budget_block count should always be zero — any non-zero count is a bug.

Usage:
    python run_heuristics.py --heuristic greedy --k 2 --alpha 0 --beta 1 --seed 1
    python run_heuristics.py --heuristic always_junior --k none --episodes 500

Output: logs_heuristics/<heuristic>_k<k>_a<α>_b<β>_s<seed>_<ts>.csv
        same core schema as training logs + budget/heuristic columns.
"""
import argparse
import csv
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT              = Path(__file__).resolve().parents[3]
NODE_ADAPTER_DIR  = ROOT / "node-adapter"
PYTHON_DIR        = Path(__file__).resolve().parents[1]
XML_FILE          = str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml")
PORT              = "5001"
NODE_URL          = f"http://localhost:{PORT}"
MAX_EPISODE_STEPS = 300

# Cluster (nvm): set USE_NVM=1 in the environment.
# Local (Homebrew/system node): leave unset.
NODE_CMD = (
    ["bash", "-c", "source ~/.nvm/nvm.sh && nvm use 20 && node dist/server.mjs"]
    if os.environ.get("USE_NVM") == "1"
    else ["node", "dist/server.mjs"]
)

PARETO_WEIGHTS = [
    (0.0, 0.0),
    (1.0, 0.0),
    (0.0, 1.0),
    (0.5, 0.5),
    (2.0, 0.5),
    (0.5, 2.0),
]

CSV_FIELDNAMES = [
    # ── core schema (matches training logs) ────────────────────────────────
    "global_timestep", "episode", "step_in_episode",
    "action_idx", "action_event", "action_role", "action_label",
    "reward", "ep_rew_sum", "done",
    "base_mapped", "novelty_delta", "progress_delta",
    "pending_before", "pending_after",
    "accepting", "goal_reached", "max_step_reached",
    "illegal_traces_count", "episode_steps", "illegal_traces_ratio",
    "event_cost", "event_duration", "episode_cost", "episode_duration",
    "action_compliant", "message",
    # ── budget / heuristic columns ──────────────────────────────────────────
    "intercepted_reason",
    "expert_budget_remaining",
    "expert_budget_initial",
    "num_budget_blocks",
    "heuristic",
    "k",
    "alpha",
    "beta",
]


# ── Adapter helpers ─────────────────────────────────────────────────────────

def wait_for_adapter(url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if requests.post(f"{url}/reset", timeout=2).ok:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def free_port(port):
    result = subprocess.run(["lsof", f"-ti:{port}"], capture_output=True, text=True)
    for pid in result.stdout.split():
        try:
            os.kill(int(pid), 9)
        except Exception:
            pass


def http_reset(url):
    r = requests.post(f"{url}/reset", timeout=5)
    r.raise_for_status()
    return r.json()


def http_step(url, action_idx):
    r = requests.post(f"{url}/action", json={"action": action_idx}, timeout=5)
    r.raise_for_status()
    return r.json()


# ── Cost table ──────────────────────────────────────────────────────────────

def build_cost_table(cost_map, duration_map, role_multipliers, pairs):
    """Return {pair_idx: (effective_cost, effective_duration)} for every pair."""
    table = {}
    for i, pair in enumerate(pairs):
        ev   = pair["event"]
        role = pair["role"]
        base_cost = cost_map.get(ev, 0)
        base_dur  = duration_map.get(ev, 0)
        mult = role_multipliers.get(role, {"costMultiplier": 1.0, "durationMultiplier": 1.0})
        table[i] = (
            base_cost * mult["costMultiplier"],
            base_dur  * mult["durationMultiplier"],
        )
    return table


# ── Action selectors ────────────────────────────────────────────────────────

def build_enabled(pairs, action_mask):
    """Map event → {role: pair_idx} for all mask==1 pairs."""
    enabled = {}
    for i, (pair, m) in enumerate(zip(pairs, action_mask)):
        if m == 1:
            enabled.setdefault(pair["event"], {})[pair["role"]] = i
    return enabled


def select_action(heuristic, pairs, action_mask, cost_table, alpha, beta,
                  expert_budget_remaining):
    """
    Return the pair index to send to the server.

    expert_budget_remaining: int ≥ 0 when k is finite; None when k=None (unlimited).
    Budget is exhausted when expert_budget_remaining == 0 (and k is not None).
    """
    enabled = build_enabled(pairs, action_mask)
    if not enabled:
        return None

    budget_ok = expert_budget_remaining is None or expert_budget_remaining > 0

    if heuristic == "always_junior":
        ev = random.choice(sorted(enabled.keys()))
        roles = enabled[ev]
        return roles.get("Junior", next(iter(roles.values())))

    elif heuristic == "always_expert":
        ev = random.choice(sorted(enabled.keys()))
        roles = enabled[ev]
        if budget_ok and "Expert" in roles:
            return roles["Expert"]
        return roles.get("Junior", next(iter(roles.values())))

    elif heuristic == "greedy":
        best_idx   = None
        best_score = float("inf")
        # Iterate in deterministic order (sorted by pair index) so ties break
        # consistently regardless of dict iteration order.
        for i in sorted(cost_table.keys()):
            pair = pairs[i]
            if action_mask[i] != 1:
                continue
            if pair["role"] == "Expert" and not budget_ok:
                continue  # budget exhausted — skip Expert, don't waste a step
            cost, dur = cost_table[i]
            score = alpha * cost + beta * dur
            if score < best_score:
                best_score = score
                best_idx   = i
        if best_idx is None:
            # All Expert slots are budget-blocked; fall back to any enabled Junior.
            for i in sorted(cost_table.keys()):
                if action_mask[i] == 1 and pairs[i]["role"] == "Junior":
                    return i
        return best_idx

    else:
        raise ValueError(f"Unknown heuristic: {heuristic!r}")


# ── Episode runner ───────────────────────────────────────────────────────────

def run_heuristic(heuristic, k, alpha, beta, seed, n_episodes, out_dir):
    k_tag     = "none" if k is None else str(k)
    weight_tag = f"a{alpha}_b{beta}".replace(".", "p")
    ts        = time.strftime("%Y%m%dT%H%M%S")
    out_dir   = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path  = out_dir / f"{heuristic}_k{k_tag}_{weight_tag}_s{seed}_{ts}.csv"

    env_vars = os.environ.copy()
    env_vars.update({
        "DCR_XML":                  XML_FILE,
        "PORT":                     PORT,
        "GOAL_LABEL":               "",
        "MAX_EPISODE_STEPS":        str(MAX_EPISODE_STEPS),
        "COST_WEIGHT":              str(alpha),
        "DURATION_WEIGHT":          str(beta),
        "STEP_PENALTY":             "-1.5",
        "RESET_NOVELTY_ON_RESET":   "0",
        "STRICT_GOAL_TERMINATION":  "0",
        "EXPERT_BUDGET_K":          "none" if k is None else str(k),
    })

    print(f"[HEURISTIC] {heuristic} | k={k_tag} | α={alpha} β={beta} | "
          f"seed={seed} | episodes={n_episodes}")

    free_port(PORT)
    random.seed(seed)

    run_log = out_dir / f"node_{heuristic}_k{k_tag}_{weight_tag}_s{seed}_{ts}.log"
    with open(run_log, "ab") as lf:
        proc = subprocess.Popen(
            NODE_CMD,
            cwd=str(NODE_ADAPTER_DIR),
            env=env_vars,
            stdout=subprocess.DEVNULL,
            stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=30):
                proc.terminate()
                proc.wait(timeout=5)
                raise RuntimeError("Node adapter failed to start")

            # Read graph metadata from /reset response (extended by our diff)
            init           = http_reset(NODE_URL)
            pairs          = init.get("eventRolePairs", [])
            cost_map       = init.get("costMap", {})
            duration_map   = init.get("durationMap", {})
            role_mults     = init.get("roleMultipliers", {})
            cost_table     = build_cost_table(cost_map, duration_map, role_mults, pairs)
            expert_budget_initial = init.get("expertBudgetK")   # None or int

            global_t   = 0
            num_budget_blocks_total = 0

            with open(csv_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
                writer.writeheader()

                for ep in range(1, n_episodes + 1):
                    init_ep          = http_reset(NODE_URL)
                    action_mask      = init_ep.get("actionMask", [])
                    expert_budget_rem = init_ep.get("expertBudgetRemaining")
                    ep_rew_sum       = 0.0
                    step_in_ep       = 0
                    num_budget_blocks_ep = 0

                    for _ in range(MAX_EPISODE_STEPS):
                        action_idx = select_action(
                            heuristic, pairs, action_mask, cost_table,
                            alpha, beta, expert_budget_rem,
                        )
                        if action_idx is None:
                            break  # no enabled actions (shouldn't happen in normal DCR)

                        resp   = http_step(NODE_URL, action_idx)
                        result = resp.get("result", {})
                        reward = result.get("stepReward", result.get("reward", 0))
                        done   = bool(result.get("done", False))
                        action_mask      = resp.get("actionMask", action_mask)
                        expert_budget_rem = result.get("expertBudgetRemaining", expert_budget_rem)
                        intercepted      = result.get("interceptedReason", "")

                        global_t   += 1
                        step_in_ep += 1
                        ep_rew_sum += reward

                        if intercepted == "budget_block":
                            num_budget_blocks_ep += 1
                            num_budget_blocks_total += 1

                        pair = pairs[action_idx] if action_idx < len(pairs) else {}
                        writer.writerow({
                            "global_timestep":      global_t,
                            "episode":              ep,
                            "step_in_episode":      step_in_ep,
                            "action_idx":           action_idx,
                            "action_event":         pair.get("event", ""),
                            "action_role":          pair.get("role", ""),
                            "action_label":         pair.get("event", ""),
                            "reward":               round(reward, 4),
                            "ep_rew_sum":           round(ep_rew_sum, 4),
                            "done":                 done,
                            "base_mapped":          result.get("baseMapped", ""),
                            "novelty_delta":        result.get("noveltyDelta", ""),
                            "progress_delta":       result.get("progressDelta", ""),
                            "pending_before":       result.get("pendingBefore", ""),
                            "pending_after":        result.get("pendingAfter", ""),
                            "accepting":            result.get("accepting", False),
                            "goal_reached":         result.get("goalReached", False),
                            "max_step_reached":     result.get("maxStepReached", False),
                            "illegal_traces_count": 0,
                            "episode_steps":        step_in_ep,
                            "illegal_traces_ratio": 0.0,
                            "event_cost":           result.get("eventCost", ""),
                            "event_duration":       result.get("eventDuration", ""),
                            "episode_cost":         result.get("episodeCost", ""),
                            "episode_duration":     result.get("episodeDuration", ""),
                            "action_compliant":     True,
                            "message":              result.get("msg", ""),
                            "intercepted_reason":   intercepted,
                            "expert_budget_remaining": expert_budget_rem,
                            "expert_budget_initial":   expert_budget_initial,
                            "num_budget_blocks":    num_budget_blocks_ep,
                            "heuristic":            heuristic,
                            "k":                    k_tag,
                            "alpha":                alpha,
                            "beta":                 beta,
                        })
                        if done:
                            break

                    if ep % 100 == 0:
                        print(f"  ep {ep}/{n_episodes} | t={global_t} | "
                              f"budget_blocks_total={num_budget_blocks_total}")

            print(f"[OK] {csv_path}")
            if num_budget_blocks_total > 0:
                print(f"[WARN] {num_budget_blocks_total} unexpected budget_block(s) — "
                      f"check heuristic fallback logic")

        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


# ── Sweep runner ─────────────────────────────────────────────────────────────

def run_sweep(heuristics, k_values, seeds, n_episodes, out_dir):
    """Run all (heuristic, k, alpha, beta, seed) combinations sequentially."""
    configs = [
        (h, k, alpha, beta, seed)
        for h     in heuristics
        for k     in k_values
        for alpha, beta in PARETO_WEIGHTS
        for seed  in seeds
    ]
    print(f"Sweep: {len(configs)} runs × {n_episodes} episodes each")
    for i, (h, k, alpha, beta, seed) in enumerate(configs, 1):
        print(f"\n── Run {i}/{len(configs)} ──")
        run_heuristic(h, k, alpha, beta, seed, n_episodes, out_dir)
        time.sleep(1)


# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Non-learning allocation heuristics for Expert-budget experiment."
    )
    parser.add_argument("--heuristic", choices=["always_junior", "always_expert", "greedy", "all"],
                        default="all", help="Which heuristic(s) to run (default: all)")
    parser.add_argument("--k",       type=str, default="all",
                        help="Expert budget: int, 'none' (unlimited), or 'all' (1,2,3,none)")
    parser.add_argument("--alpha",   type=float, default=None,
                        help="Cost weight α (omit to sweep all 6 pairs)")
    parser.add_argument("--beta",    type=float, default=None,
                        help="Duration weight β (omit to sweep all 6 pairs)")
    parser.add_argument("--seed",    type=int,   default=None,
                        help="Random seed (omit to use seeds 1,2)")
    parser.add_argument("--episodes",type=int,   default=500)
    parser.add_argument("--out-dir", type=str,
                        default=str(Path(__file__).parent / "logs_heuristics"))
    args = parser.parse_args()

    # Resolve heuristic list
    heuristics = (["always_junior", "always_expert", "greedy"]
                  if args.heuristic == "all" else [args.heuristic])

    # Resolve k values
    if args.k == "all":
        k_values = [1, 2, 3, None]
    elif args.k == "none":
        k_values = [None]
    else:
        k_values = [int(args.k)]

    # Resolve weight pairs
    if args.alpha is not None and args.beta is not None:
        weight_pairs = [(args.alpha, args.beta)]
    else:
        weight_pairs = PARETO_WEIGHTS

    # Resolve seeds
    seeds = [args.seed] if args.seed is not None else [1, 2]

    configs = [
        (h, k, alpha, beta, seed)
        for h           in heuristics
        for k           in k_values
        for alpha, beta in weight_pairs
        for seed        in seeds
    ]
    print(f"Sweep: {len(configs)} runs × {args.episodes} episodes")
    for i, (h, k, alpha, beta, seed) in enumerate(configs, 1):
        print(f"\n── Run {i}/{len(configs)} ──")
        run_heuristic(h, k, alpha, beta, seed, args.episodes, args.out_dir)
        time.sleep(1)

    print("\nDone.")


if __name__ == "__main__":
    main()
