import argparse
import csv
from collections import Counter, defaultdict
from pathlib import Path


def to_bool(v):
    return str(v).strip().lower() in {"1", "true", "yes"}


def to_int(v):
    s = str(v).strip()
    if s == "":
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def load_rows(csv_path: Path):
    with csv_path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    parser = argparse.ArgumentParser(
        description="Analyze pending/acceptance dynamics from train_trace CSV"
    )
    parser.add_argument("csv_file", help="Path to train_trace CSV")
    parser.add_argument(
        "--goal-label",
        default="",
        help="Optional expected goal label, e.g. 'Release A'",
    )
    args = parser.parse_args()

    csv_path = Path(args.csv_file)
    rows = load_rows(csv_path)
    if not rows:
        print("CSV vacío")
        return

    by_episode = defaultdict(list)
    for r in rows:
        ep = to_int(r.get("episode"))
        if ep is None:
            continue
        by_episode[ep].append(r)

    episodes = sorted(by_episode.keys())
    if not episodes:
        print("No se pudieron leer episodios")
        return

    total_eps = len(episodes)
    ever_pending_zero = 0
    end_pending_zero = 0
    eps_goal = 0
    eps_accepting = 0
    eps_maxstep = 0
    goal_and_pending_gt0 = 0

    pending_delta_actions = Counter()
    pending_drop_actions = Counter()
    action_counts = Counter()

    for ep in episodes:
        trace = by_episode[ep]
        seen_goal = False
        seen_acc = False
        seen_max = False
        seen_pending_zero = False

        for r in trace:
            label = (r.get("action_label") or "").strip()
            if label:
                action_counts[label] += 1

            pb = to_int(r.get("pending_before"))
            pa = to_int(r.get("pending_after"))

            if pb is not None and pa is not None:
                delta = pa - pb
                if delta != 0 and label:
                    pending_delta_actions[label] += 1
                if delta < 0 and label:
                    pending_drop_actions[label] += 1

            if pa == 0:
                seen_pending_zero = True

            g = to_bool(r.get("goal_reached", ""))
            a = to_bool(r.get("accepting", ""))
            m = to_bool(r.get("max_step_reached", ""))

            if g:
                seen_goal = True
                if pa is not None and pa > 0:
                    goal_and_pending_gt0 += 1
            if a:
                seen_acc = True
            if m:
                seen_max = True

        last = trace[-1]
        last_pending_after = to_int(last.get("pending_after"))

        if seen_pending_zero:
            ever_pending_zero += 1
        if last_pending_after == 0:
            end_pending_zero += 1
        if seen_goal:
            eps_goal += 1
        if seen_acc:
            eps_accepting += 1
        if seen_max:
            eps_maxstep += 1

    print(f"FILE: {csv_path}")
    print(f"Rows: {len(rows)}")
    print(f"Episodes: {total_eps}")
    print()

    print("=== Acceptance dynamics ===")
    print(f"Episodes with goal_reached at least once: {eps_goal} ({eps_goal/total_eps:.2%})")
    print(f"Episodes with accepting at least once:   {eps_accepting} ({eps_accepting/total_eps:.2%})")
    print(f"Episodes ended by max_step_reached:      {eps_maxstep} ({eps_maxstep/total_eps:.2%})")
    print()

    print("=== Pending behavior ===")
    print(f"Episodes where pending_after reached 0 at least once: {ever_pending_zero} ({ever_pending_zero/total_eps:.2%})")
    print(f"Episodes with pending_after==0 on final step:         {end_pending_zero} ({end_pending_zero/total_eps:.2%})")
    print(f"Rows where goal_reached=true but pending_after>0:      {goal_and_pending_gt0}")
    print()

    if args.goal_label:
        goal_hits = action_counts.get(args.goal_label, 0)
        print("=== Goal label sanity check ===")
        print(f"Expected goal label: {args.goal_label}")
        print(f"Rows where action_label == goal label: {goal_hits}")
        if goal_hits == 0:
            print("WARNING: El label objetivo no aparece en action_label. Revisa mismatch de etiqueta.")
        print()

    print("=== Actions that change pending (top 10) ===")
    for label, cnt in pending_delta_actions.most_common(10):
        print(f"{label}: {cnt}")
    print()

    print("=== Actions that reduce pending (top 10) ===")
    for label, cnt in pending_drop_actions.most_common(10):
        print(f"{label}: {cnt}")


if __name__ == "__main__":
    main()
