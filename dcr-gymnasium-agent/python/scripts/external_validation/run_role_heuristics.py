"""
Non-learning role-allocation heuristics for the Loan Application
capacity-constrained experiment (Q3 of Section 6.2's
"Capacity-constrained Role Allocation"): Always-Junior, Always-Expert,
and Greedy-per-event, against the same shielded environment used for
the learned policy and for the Shielding-only baseline.

Design choice: all three heuristics fix only the ROLE-selection rule;
EVENT selection is uniform-random among the currently enabled events,
exactly as in Shielding-only (run_ablation_mined.py /
run_shielding_seed_variance.py). This isolates the role-selection
policy as the only varying factor across the four non-learning
baselines (Shielding-only is the special case where role is ALSO
random), matching what Q3 is meant to test: is the learned role policy
better than a deterministic role rule, holding the event-sequencing
policy constant.

Heuristics:
  - always_junior: among the events with a legal role option, restrict
    to those where Junior is legal (always true -- budget never blocks
    Junior), pick one uniformly at random, use Junior.
  - always_expert: pick a uniformly random enabled event; use Expert if
    legal for it (i.e. budget not exhausted), otherwise fall back to
    Junior for that event (forced, since some action must be taken).
  - greedy: pick a uniformly random enabled event; among its legal role
    options for that event, pick whichever minimises
    alpha*cost + beta*duration using the event's base cost/duration and
    the role multipliers parsed directly from the graph XML (no need to
    query the live event/duration from the server beforehand). If only
    one role is legal for that event (budget exhausted), use it.

Usage:
    cd dcr-gymnasium-agent/python
    python scripts/external_validation/run_role_heuristics.py \
        --heuristic always_junior --episodes 2900 --port 5501
    python scripts/external_validation/run_role_heuristics.py \
        --heuristic greedy --alpha 1.0 --beta 0.0 --budget-k 1 --episodes 2900 --port 5502
"""
import argparse
import csv
import os
import random
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
XML_FILE = ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml"
OUT_DIR = Path(__file__).resolve().parent / "loanapp_capacity_results" / "heuristics"

MAX_EPISODE_STEPS = 300

CSV_FIELDNAMES = [
    "global_timestep", "episode", "step_in_episode",
    "action_idx", "action_event", "action_role", "action_label",
    "reward", "ep_rew_sum", "done",
    "accepting", "goal_reached", "max_step_reached",
    "episode_steps", "illegal_traces_ratio",
    "event_cost", "event_duration", "episode_cost", "episode_duration",
    "action_compliant", "message",
]


def parse_graph_costs(xml_path):
    """Returns {event_id: (base_cost, base_duration)} and
    {role_name: (cost_mult, dur_mult)} parsed directly from the engine XML."""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    costs = {}
    for ev in root.iter("event"):
        eid = ev.get("id")
        cost_el = ev.find("cost")
        dur_el = ev.find("duration")
        if cost_el is not None and dur_el is not None:
            costs[eid] = (float(cost_el.text), float(dur_el.text))
    roles = {}
    for role in root.iter("role"):
        name = role.get("name")
        roles[name] = (float(role.get("costMultiplier", 1)), float(role.get("durationMultiplier", 1)))
    return costs, roles


def wait_for_adapter(url, timeout=25):
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
    time.sleep(0.3)


def start_adapter(port, alpha, beta, budget_k, log_path):
    free_port(port)
    env = os.environ.copy()
    env.update({
        "DCR_XML": str(XML_FILE),
        "PORT": str(port),
        "GOAL_LABEL": "",
        "MAX_EPISODE_STEPS": str(MAX_EPISODE_STEPS),
        "COST_WEIGHT": str(alpha),
        "DURATION_WEIGHT": str(beta),
        "STEP_PENALTY": "-1.5",
        "RESET_NOVELTY_ON_RESET": "0",
        "STRICT_GOAL_TERMINATION": "0",
        "EXPERT_BUDGET_K": "none" if budget_k is None else str(budget_k),
    })
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lf = open(log_path, "ab")
    proc = subprocess.Popen(["node", "dist/server.mjs"], cwd=str(NODE_ADAPTER_DIR), env=env,
                             stdout=subprocess.DEVNULL, stderr=lf)
    if not wait_for_adapter(f"http://localhost:{port}"):
        proc.terminate()
        proc.wait(timeout=5)
        lf.close()
        raise RuntimeError(f"Node adapter failed to start; see {log_path}")
    return proc, lf


def stop_adapter(proc, lf, port):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    lf.close()
    free_port(port)


def choose_action(heuristic, pairs, action_mask, rng, costs, role_mults, alpha, beta,
                   expert_remaining=None):
    """pairs[i] = {"event": ..., "role": ...}; action_mask[i] in {0,1}.
    Returns the chosen action index.

    expert_remaining: current Expert budget left this episode, or None if
    unlimited. The server's action_mask does NOT reflect budget exhaustion
    by design (the learning agent is meant to discover the block via the
    -10 budget_block penalty, not via the mask) -- so a fixed heuristic
    that only reads action_mask will keep proposing Expert forever once the
    budget hits 0, get blocked every step, and never fall back to Junior.
    Filtering Expert out here when expert_remaining == 0 fixes that for the
    non-learning heuristics, which have no way to "learn" from the penalty.
    """
    legal = [i for i, m in enumerate(action_mask) if m == 1]
    if not legal:
        return None
    if expert_remaining == 0:
        legal = [i for i in legal if pairs[i]["role"] != "Expert"]
        if not legal:
            return None
    by_event = {}
    for i in legal:
        by_event.setdefault(pairs[i]["event"], []).append(i)

    if heuristic == "always_junior":
        junior_events = {e: idxs for e, idxs in by_event.items()
                          if any(pairs[i]["role"] == "Junior" for i in idxs)}
        event = rng.choice(list(junior_events.keys())) if junior_events else rng.choice(list(by_event.keys()))
        idxs = junior_events.get(event, by_event[event])
        for i in idxs:
            if pairs[i]["role"] == "Junior":
                return i
        return rng.choice(idxs)

    if heuristic == "always_expert":
        event = rng.choice(list(by_event.keys()))
        idxs = by_event[event]
        for i in idxs:
            if pairs[i]["role"] == "Expert":
                return i
        return rng.choice(idxs)  # budget exhausted -> forced fallback (Junior)

    if heuristic == "greedy":
        event = rng.choice(list(by_event.keys()))
        idxs = by_event[event]
        if len(idxs) == 1:
            return idxs[0]
        base_cost, base_dur = costs.get(event, (0.0, 0.0))
        best_i, best_score = None, None
        for i in idxs:
            role = pairs[i]["role"]
            cmult, dmult = role_mults.get(role, (1.0, 1.0))
            score = alpha * (base_cost * cmult) + beta * (base_dur * dmult)
            if best_score is None or score < best_score:
                best_score, best_i = score, i
        return best_i

    raise ValueError(heuristic)


def run(heuristic, alpha, beta, budget_k, episodes, seed, port):
    weight_tag = f"a{alpha}_b{beta}".replace(".", "p")
    k_tag = "kinf" if budget_k is None else f"k{budget_k}"
    exp_id = f"LoanAppHeuristic_{heuristic}_s{seed}_{weight_tag}_{k_tag}"
    out_dir = OUT_DIR / heuristic
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"train_trace_exp_{exp_id}_{time.strftime('%Y%m%dT%H%M%S')}.csv"
    run_log = out_dir / f"run_{exp_id}_{int(time.time())}.log"

    costs, role_mults = parse_graph_costs(XML_FILE)
    rng = random.Random(seed)

    print(f"[{heuristic.upper()}] {exp_id} | alpha={alpha} beta={beta} k={budget_k} | episodes={episodes}")
    proc, lf = start_adapter(port, alpha, beta, budget_k, run_log)
    node_url = f"http://localhost:{port}"
    # A persistent Session reuses the underlying TCP connection (HTTP
    # keep-alive) instead of opening a new socket per request. Without
    # this, a few thousand episodes x up to 300 steps each exhausts the
    # local ephemeral port pool on macOS (OSError 49: Can't assign
    # requested address), since each bare requests.post() call opens a
    # fresh connection that lingers in TIME_WAIT.
    session = requests.Session()
    try:
        global_t = 0
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
            for ep in range(1, episodes + 1):
                init = session.post(f"{node_url}/reset", timeout=5).json()
                action_mask = init.get("actionMask", [])
                pairs = init.get("eventRolePairs", [])
                expert_remaining = init.get("expertBudgetRemaining")
                ep_rew_sum = 0.0
                step_in_ep = 0
                for _ in range(MAX_EPISODE_STEPS):
                    action_idx = choose_action(heuristic, pairs, action_mask, rng, costs, role_mults, alpha, beta,
                                                expert_remaining=expert_remaining)
                    if action_idx is None:
                        break
                    resp = session.post(f"{node_url}/action", json={"action": action_idx}, timeout=5).json()
                    result = resp.get("result", {})
                    reward = result.get("stepReward", result.get("reward", 0))
                    done = bool(result.get("done", False))
                    action_mask = resp.get("actionMask", [])
                    pairs = resp.get("eventRolePairs", pairs)
                    expert_remaining = result.get("expertBudgetRemaining", expert_remaining)
                    global_t += 1
                    step_in_ep += 1
                    ep_rew_sum += reward
                    writer.writerow({
                        "global_timestep": global_t, "episode": ep, "step_in_episode": step_in_ep,
                        "action_idx": action_idx, "action_event": result.get("action", ""),
                        "action_role": result.get("chosenRole", ""), "action_label": result.get("action", ""),
                        "reward": round(reward, 4), "ep_rew_sum": round(ep_rew_sum, 4), "done": done,
                        "accepting": result.get("accepting", False),
                        "goal_reached": result.get("goalReached", False),
                        "max_step_reached": result.get("maxStepReached", False),
                        "episode_steps": step_in_ep,
                        "illegal_traces_ratio": result.get("illegalTracesCount", 0) / max(1, step_in_ep) * 100,
                        "event_cost": result.get("eventCost", ""),
                        "event_duration": result.get("eventDuration", ""),
                        "episode_cost": result.get("episodeCost", ""),
                        "episode_duration": result.get("episodeDuration", ""),
                        "action_compliant": result.get("actionCompliant", True),
                        "message": result.get("msg", ""),
                    })
                    if done:
                        break
                if ep % 500 == 0:
                    print(f"  ep {ep}/{episodes} | t={global_t}")
        print(f"[OK] {csv_path}")
    finally:
        session.close()
        stop_adapter(proc, lf, port)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--heuristic", required=True, choices=["always_junior", "always_expert", "greedy"])
    ap.add_argument("--alpha", type=float, default=0.0, help="only used by --heuristic greedy")
    ap.add_argument("--beta", type=float, default=0.0, help="only used by --heuristic greedy")
    ap.add_argument("--budget-k", type=int, default=None)
    ap.add_argument("--episodes", type=int, default=2900)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--port", type=int, default=5500)
    args = ap.parse_args()

    assert XML_FILE.exists(), f"Graph XML not found: {XML_FILE}"
    run(args.heuristic, args.alpha, args.beta, args.budget_k, args.episodes, args.seed, args.port)


if __name__ == "__main__":
    main()
