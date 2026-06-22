"""
k=None regression smoke test.
Starts the node adapter with EXPERT_BUDGET_K unset (unlimited),
runs 2 000 steps with the duration-dominant weight (alpha=0, beta=1),
and asserts the four pass criteria:

  1. obs.shape == (36,) and obs.dtype == int8
  2. /reset returns expertBudgetK == null  (None in Python)
  3. No budget_block ever appears in any step
  4. Illegal count logic unchanged: intercepted_reason is null or "dcr_illegal" only

Also prints the number of Expert-role assignments on ACCEPTING episodes,
which is the binding-k count needed to choose {1,2,3}.
"""
import os
import random
import subprocess
import sys
import time
from pathlib import Path

import requests
import numpy as np

ROOT             = Path(__file__).resolve().parents[4]
NODE_ADAPTER_DIR = ROOT / "node-adapter"
PYTHON_DIR       = Path(__file__).resolve().parents[1]
XML_FILE         = str(ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml")
PORT             = "5099"   # dedicated port so we don't clash with a running server
NODE_URL         = f"http://localhost:{PORT}"

ALPHA, BETA = 0.0, 1.0   # duration-dominant: the weight pair that should use Expert most
TOTAL_STEPS = 2000
SEED        = 1

sys.path.insert(0, str(PYTHON_DIR / "src"))
from envs.dcr_env import DCRGymEnv


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


def main():
    env_vars = os.environ.copy()
    env_vars.update({
        "DCR_XML":                  XML_FILE,
        "PORT":                     PORT,
        "GOAL_LABEL":               "",
        "MAX_EPISODE_STEPS":        "300",
        "COST_WEIGHT":              str(ALPHA),
        "DURATION_WEIGHT":          str(BETA),
        "STEP_PENALTY":             "-1.5",
        "RESET_NOVELTY_ON_RESET":   "0",
        "STRICT_GOAL_TERMINATION":  "0",
        # EXPERT_BUDGET_K intentionally absent → unlimited
    })

    log_path = Path(__file__).parent / "smoke_k_none.log"
    print(f"Starting node adapter on port {PORT} …")
    with open(log_path, "wb") as lf:
        proc = subprocess.Popen(
            ["node", "dist/server.mjs"],
            cwd=str(NODE_ADAPTER_DIR),
            env=env_vars,
            stdout=subprocess.DEVNULL,
            stderr=lf,
        )
        try:
            if not wait_for_adapter(NODE_URL, timeout=30):
                proc.terminate()
                sys.exit("ERROR: node adapter failed to start")

            # ── Check 1+2: /reset response and obs shape/dtype ──────────────
            reset_resp = requests.post(f"{NODE_URL}/reset", timeout=5).json()
            expert_budget_k = reset_resp.get("expertBudgetK", "MISSING")
            assert expert_budget_k is None, \
                f"FAIL criterion 2: expertBudgetK={expert_budget_k!r} (expected null/None)"
            print(f"[OK] criterion 2 — /reset expertBudgetK = {expert_budget_k!r}")

            env = DCRGymEnv(node_url=NODE_URL)
            obs, _ = env.reset()
            assert obs.shape == (36,), f"FAIL criterion 1: obs.shape={obs.shape}"
            assert obs.dtype == np.int8, f"FAIL criterion 1: obs.dtype={obs.dtype}"
            print(f"[OK] criterion 1 — obs.shape={obs.shape}, dtype={obs.dtype}")

            # ── Run 2 000 steps, collect metrics ────────────────────────────
            random.seed(SEED)
            step = 0
            budget_blocks   = 0
            dcr_illegals    = 0
            bad_reasons     = []
            expert_assigns_accepting = 0   # Expert steps on accepting episodes
            ep_expert = 0                  # Expert steps this episode
            episodes = 0

            obs, _ = env.reset()
            while step < TOTAL_STEPS:
                action = env.action_space.sample()
                obs, reward, done, _, info = env.step(action)
                step += 1

                reason = info.get("intercepted_reason")

                # criterion 3: no budget_block
                if reason == "budget_block":
                    budget_blocks += 1

                # criterion 4: only null or "dcr_illegal"
                if reason not in (None, "dcr_illegal", ""):
                    bad_reasons.append(reason)

                if reason not in ("budget_block", "dcr_illegal") and reason:
                    dcr_illegals += 0   # valid non-block
                if reason == "dcr_illegal":
                    dcr_illegals += 1

                if info.get("action_role") == "Expert" and reason not in ("budget_block", "dcr_illegal"):
                    ep_expert += 1

                if done:
                    episodes += 1
                    if info.get("accepting"):
                        expert_assigns_accepting += ep_expert
                    ep_expert = 0
                    obs, _ = env.reset()

            # ── Report ──────────────────────────────────────────────────────
            print(f"\n── Smoke test results ({TOTAL_STEPS} steps, α={ALPHA} β={BETA}) ──")
            print(f"  Episodes completed : {episodes}")
            print(f"  DCR-illegal steps  : {dcr_illegals}")
            print(f"  Budget-block steps : {budget_blocks}")
            print(f"  Unexpected reasons : {bad_reasons[:5]}")
            print(f"  Expert assignments on ACCEPTING episodes : {expert_assigns_accepting}")

            assert budget_blocks == 0, \
                f"FAIL criterion 3: {budget_blocks} budget_block(s) observed with k=None"
            assert bad_reasons == [], \
                f"FAIL criterion 4: unexpected intercepted_reason values: {bad_reasons}"
            print("\n[PASS] All four criteria satisfied.")
            print(f"\nBinding-k hint: unconstrained agent used Expert {expert_assigns_accepting} times")
            print(f"on accepting episodes over {episodes} episodes ({TOTAL_STEPS} steps).")
            print("Choose k values smaller than the per-episode average to actually constrain.")

        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


if __name__ == "__main__":
    main()
