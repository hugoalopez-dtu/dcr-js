"""
csv_to_xes.py  –  Convert a train_trace_*.csv to XES event log.

Usage examples:
  # All episodes:
  python3 csv_to_xes.py logs/train_trace_exp_Sepsis_30k_v3_s1_*.csv

  # Only goal-reached episodes:
  python3 csv_to_xes.py --filter goal logs/train_trace_exp_Sepsis_30k_v3_s1_*.csv

  # Only accepting episodes:
  python3 csv_to_xes.py --filter accepting logs/train_trace_exp_Sepsis_30k_v3_s1_*.csv

  # Last 500 episodes (trained agent behaviour):
  python3 csv_to_xes.py --last 500 logs/train_trace_exp_Sepsis_30k_v3_s1_*.csv

  # Combine filters:
  python3 csv_to_xes.py --filter goal --last 500 logs/train_trace_exp_Sepsis_30k_v3_s1_*.csv

Output: next to the input CSV with .xes extension (or use --out to specify path).
"""
import argparse
import csv
import os
import sys
from collections import defaultdict
from xml.etree import ElementTree as ET
from xml.dom import minidom


def t(v):
    return str(v).strip().lower() in {"1", "true"}


def build_xes(traces: list[tuple[str, list[str]]]) -> str:
    """Build XES XML string from list of (trace_id, [event_labels])."""
    log_el = ET.Element("log")
    log_el.set("xes.version", "1.0")
    log_el.set("xes.features", "nested-attributes")
    log_el.set("openxes.version", "1.0RC7")

    global_el = ET.SubElement(log_el, "global")
    global_el.set("scope", "event")
    s = ET.SubElement(global_el, "string")
    s.set("key", "concept:name")
    s.set("value", "__INVALID__")

    clf = ET.SubElement(log_el, "classifier")
    clf.set("name", "Event Name")
    clf.set("keys", "concept:name")

    for trace_id, events in traces:
        trace_el = ET.SubElement(log_el, "trace")
        tid = ET.SubElement(trace_el, "string")
        tid.set("key", "concept:name")
        tid.set("value", trace_id)
        for label in events:
            ev_el = ET.SubElement(trace_el, "event")
            cn = ET.SubElement(ev_el, "string")
            cn.set("key", "concept:name")
            cn.set("value", label)

    raw = ET.tostring(log_el, encoding="unicode")
    return minidom.parseString(raw).toprettyxml(indent="  ")


def load_episodes(path: str) -> dict[int, dict]:
    """
    Returns {episode_num: {"events": [label,...], "goal_reached": bool, "accepting": bool}}
    """
    episodes: dict[int, dict] = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            ep = int(row["episode"])
            if ep not in episodes:
                episodes[ep] = {"events": [], "goal_reached": False, "accepting": False}
            label = row.get("action_label", "").strip()
            if label:
                episodes[ep]["events"].append(label)
            if t(row.get("goal_reached", "")):
                episodes[ep]["goal_reached"] = True
            if t(row.get("accepting", "")):
                episodes[ep]["accepting"] = True
    return episodes


def main():
    parser = argparse.ArgumentParser(description="Convert train_trace CSV to XES event log")
    parser.add_argument("csv_files", nargs="+", help="Input CSV file(s)")
    parser.add_argument(
        "--filter",
        choices=["all", "goal", "accepting"],
        default="all",
        help="Which episodes to include (default: all)",
    )
    parser.add_argument(
        "--last",
        type=int,
        default=None,
        metavar="N",
        help="Only keep the last N episodes (applied after --filter)",
    )
    parser.add_argument("--out", default=None, help="Output .xes path (default: input.xes)")
    args = parser.parse_args()

    for csv_path in args.csv_files:
        if not os.path.isfile(csv_path):
            print(f"File not found: {csv_path}", file=sys.stderr)
            continue

        episodes = load_episodes(csv_path)

        # Apply filter
        if args.filter == "goal":
            filtered = {ep: d for ep, d in episodes.items() if d["goal_reached"]}
            filter_desc = "goal_reached"
        elif args.filter == "accepting":
            filtered = {ep: d for ep, d in episodes.items() if d["accepting"]}
            filter_desc = "accepting"
        else:
            filtered = episodes
            filter_desc = "all"

        # Sort by episode number, then apply --last
        sorted_eps = sorted(filtered.items(), key=lambda x: x[0])
        if args.last is not None:
            sorted_eps = sorted_eps[-args.last :]

        traces = [
            (f"episode-{ep}", d["events"])
            for ep, d in sorted_eps
            if d["events"]  # skip empty traces
        ]

        if not traces:
            print(f"{os.path.basename(csv_path)}: No episodes matched filter '{filter_desc}'. Nothing written.")
            continue

        xes_str = build_xes(traces)

        if args.out:
            out_path = args.out
        else:
            base = os.path.splitext(csv_path)[0]
            suffix = f"_{filter_desc}"
            if args.last:
                suffix += f"_last{args.last}"
            out_path = base + suffix + ".xes"

        with open(out_path, "w", encoding="utf-8") as f:
            f.write(xes_str)

        print(
            f"{os.path.basename(csv_path)}: {len(traces)} traces written → {out_path}"
        )


if __name__ == "__main__":
    main()
