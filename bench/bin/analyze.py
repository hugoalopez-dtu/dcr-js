import os
import json
import csv
import argparse
import glob
import re
import xml.etree.ElementTree as ET
import statistics
import pandas as pd

PD_STEPS = [
    "discover",  # Wrapper
    "parse-log",
    "transform-log",
    "filter-log",
    "abstract-log",
    "mine-log",
    "nest-graph",
    "layout-graph",
    "import-graph",
    "save-log"
]

CC_STEPS = [
    "conformance-checking",  # Wrapper
    "parse-log",
    "open-model",
    "transform-log",
    "replay-log",
    "quantify-violations",
    "precompute-properties",
    "align-log"
]

INTERESTING_STEPS = list(set(PD_STEPS + CC_STEPS))


def parse_xml_graph(xml_path):
    """Parses DCR XML to count graph elements."""
    if not os.path.exists(xml_path):
        return {}

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()

        ns = {'dcr': 'http://tk/schema/dcr'}

        events = len(root.findall('.//dcr:event', ns))

        relations = root.findall('.//dcr:relation', ns)
        counts = {
            'events': events,
            'conditions': 0,
            'responses': 0,
            'includes': 0,
            'excludes': 0,
            'milestones': 0
        }

        for rel in relations:
            rtype = rel.get('type')
            if rtype == 'condition':
                counts['conditions'] += 1
            elif rtype == 'response':
                counts['responses'] += 1
            elif rtype == 'include':
                counts['includes'] += 1
            elif rtype == 'exclude':
                counts['excludes'] += 1
            elif rtype == 'milestone':
                counts['milestones'] += 1

        return counts
    except Exception as e:
        print(f"Error parsing XML {xml_path}: {e}")
        return {}


def get_closest_memory(df_mem, target_ts):
    """Finds the memory reading closest to a specific timestamp."""
    if df_mem.empty:
        return 0
    idx = (df_mem['ts'] - target_ts).abs().idxmin()
    return df_mem.loc[idx, 'mib']


def analyze_trace_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        events = data.get(
            'traceEvents', data if isinstance(data, list) else [])
        if not events:
            return []

        memory_data = []
        for e in events:
            if e.get('name') == 'UpdateCounters':
                args = e.get('args', {}).get('data', e.get('args', {}))
                if 'jsHeapSizeUsed' in args:
                    memory_data.append({
                        'ts': e['ts'],
                        'mib': args['jsHeapSizeUsed'] / (1024**2)
                    })

        df_mem = pd.DataFrame(memory_data).sort_values(
            'ts') if memory_data else pd.DataFrame(columns=['ts', 'mib'])

        # Extract step timings using blink.user_timing
        step_timings = []

        sorted_events = sorted(events, key=lambda x: x.get('ts', 0))
        active_starts = {}

        for e in sorted_events:
            # Strictly use blink.user_timing for high precision performance.measure() calls
            if e.get('cat') != 'blink.user_timing':
                continue

            name = e.get('name')
            ph = e.get('ph')

            if name in INTERESTING_STEPS:
                if ph == 'b':  # b = Begin
                    active_starts[name] = e['ts']
                elif ph == 'e':  # e = End
                    if name in active_starts:
                        start = active_starts.pop(name)
                        end = e['ts']
                        step_timings.append({
                            'name': name, 'start': start, 'end': end, 'dur': end - start
                        })

        metrics = {}

        # Initialize metrics for all interesting steps to ensure they appear in output even if missing from trace
        for step_name in INTERESTING_STEPS:
            metrics[step_name] = {
                "Duration_s": 0,
                "Mem_Start_MiB": 0,
                "Mem_End_MiB": 0,
                "Mem_Max_MiB": 0,
                "Mem_Min_MiB": 0,
                "Mem_Avg_MiB": 0,
                "Mem_Median_MiB": 0,
                "Mem_Growth_MiB": 0
            }

        for step in step_timings:
            step_name = step['name']

            # Convert duration from microseconds to seconds
            duration_s = step['dur'] / 1_000_000

            if not df_mem.empty:
                mask = (df_mem['ts'] >= step['start']) & (
                    df_mem['ts'] <= step['end'])
                step_mem_window = df_mem[mask]

                mem_start = get_closest_memory(df_mem, step['start'])
                mem_end = get_closest_memory(df_mem, step['end'])

                if not step_mem_window.empty:
                    max_mem = step_mem_window['mib'].max()
                    min_mem = step_mem_window['mib'].min()
                    avg_mem = step_mem_window['mib'].mean()
                    median_mem = step_mem_window['mib'].median()
                else:
                    # This is a fallback for when there are no samples inside memory window
                    # This happens for very short steps (i.e., instantaneous)
                    max_mem = max(mem_start, mem_end)
                    min_mem = min(mem_start, mem_end)
                    avg_mem = (mem_start + mem_end) / 2
                    # With only start/end, median is same as average
                    median_mem = avg_mem
            else:
                mem_start = 0
                mem_end = 0
                max_mem = 0
                min_mem = 0
                avg_mem = 0
                median_mem = 0

            metrics[step_name] = {
                "Duration_s": duration_s,
                "Mem_Start_MiB": mem_start,
                "Mem_End_MiB": mem_end,
                "Mem_Max_MiB": max_mem,
                "Mem_Min_MiB": min_mem,
                "Mem_Avg_MiB": avg_mem,
                "Mem_Median_MiB": median_mem,
                "Mem_Growth_MiB": mem_end - mem_start
            }

        return metrics

    except Exception as e:
        print(f"Error {file_path}: {e}")
        return None


def process_experiment(exp_dir):
    traces_dir = os.path.join(exp_dir, "traces")
    if not os.path.exists(traces_dir):
        print(f"No traces folder found in {exp_dir}")
        return

    out_runs_long = os.path.join(exp_dir, "runs.csv")
    out_sum_long = os.path.join(exp_dir, "summaries.csv")

    # Filename format: {log}_run_{i}.{type}.status.txt
    run_pattern = re.compile(r"(.*)_run_(\d+)\.(PD|CC)\.status\.txt")

    logs_data = {}

    print("Scanning for runs...")
    for status_file in glob.glob(os.path.join(traces_dir, "*.status.txt")):
        filename = os.path.basename(status_file)
        match = run_pattern.match(filename)
        if not match:
            continue

        log_name = match.group(1)
        run_id = int(match.group(2))
        run_type = match.group(3)  # PD or CC

        if log_name not in logs_data:
            logs_data[log_name] = []

        with open(status_file, 'r') as f:
            status = f.read().strip()

        xml_path = os.path.join(
            traces_dir, f"{log_name}_run_{run_id}.{run_type}.dcrgraph.xml")

        graph_stats = parse_xml_graph(xml_path)

        trace_path = os.path.join(
            traces_dir, f"{log_name}_run_{run_id}.{run_type}.trace.json")
        step_metrics = analyze_trace_file(trace_path)

        run_data = {
            'run_id': run_id,
            'type': run_type,
            'status': status,
            'graph': graph_stats,
            'metrics': step_metrics
        }
        logs_data[log_name].append(run_data)

    metric_types = ["Duration_s", "Mem_Start_MiB", "Mem_End_MiB", "Mem_Max_MiB",
                    "Mem_Min_MiB", "Mem_Avg_MiB", "Mem_Median_MiB", "Mem_Growth_MiB"]

    print(f"Writing runs to {out_runs_long}...")
    headers_long = ['Log Name', 'Type', 'Run ID',
                    'Status', 'Step'] + metric_types

    with open(out_runs_long, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers_long)
        for log_name, runs in logs_data.items():
            for r in runs:
                metrics = r.get('metrics') or {}

                relevant_steps = PD_STEPS if r['type'] == 'PD' else CC_STEPS

                for step in relevant_steps:
                    step_data = metrics.get(step, {})
                    row = [log_name, r['type'], r['run_id'], r['status'], step]
                    for m in metric_types:
                        val = step_data.get(m, '')
                        row.append(f"{val:.4f}" if isinstance(
                            val, (int, float)) else val)
                    writer.writerow(row)

    agg_metrics = [
        ("Duration_s", ["mean", "std", "min", "max", "median"]),
        ("Mem_Max_MiB", ["mean", "std", "min", "max", "median"]),
        ("Mem_Growth_MiB", ["mean", "std"])
    ]

    # Prepare aggregated data structure, separated by log and type (PD or CC)
    log_agg_data = {}

    for log_name, runs in logs_data.items():
        log_agg_data[log_name] = {}

        runs_by_type = {}
        for r in runs:
            t = r['type']
            if t not in runs_by_type:
                runs_by_type[t] = []
            runs_by_type[t].append(r)

        for r_type, type_runs in runs_by_type.items():
            passed = [r for r in type_runs if r['status'] == 'passed']
            if not passed:
                continue

            log_agg_data[log_name][r_type] = {}

            collected = {step: {m: [] for m in metric_types}
                         for step in INTERESTING_STEPS}

            for r in passed:
                m = r.get('metrics', {})
                if not m:
                    continue
                for step in INTERESTING_STEPS:
                    s_data = m.get(step, {})
                    for k, v in s_data.items():
                        if isinstance(v, (int, float)):
                            collected[step][k].append(v)

            for step in INTERESTING_STEPS:
                log_agg_data[log_name][r_type][step] = {}
                for m_name, stats_list in agg_metrics:
                    values = collected[step][m_name]
                    if not values:
                        continue

                    for stat in stats_list:
                        val = 0
                        if stat == "mean":
                            val = statistics.mean(values)
                        elif stat == "median":
                            val = statistics.median(values)
                        elif stat == "std":
                            val = statistics.stdev(
                                values) if len(values) > 1 else 0
                        elif stat == "min":
                            val = min(values)
                        elif stat == "max":
                            val = max(values)

                        log_agg_data[log_name][r_type][step][f"{m_name}_{stat}"] = val

    print(f"Writing summary to {out_sum_long}...")
    sum_headers_long = ['Log Name', 'Type', 'Step']
    for m_name, stats_list in agg_metrics:
        for stat in stats_list:
            sum_headers_long.append(f"{m_name}_{stat}")

    with open(out_sum_long, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(sum_headers_long)
        for log_name, types_data in log_agg_data.items():
            for r_type, step_data in types_data.items():
                relevant_steps = PD_STEPS if r_type == 'PD' else CC_STEPS
                for step in relevant_steps:
                    row = [log_name, r_type, step]
                    has_data = False
                    # Check if we have data for this step
                    for m_name, stats_list in agg_metrics:
                        for stat in stats_list:
                            if step_data[step].get(f"{m_name}_{stat}", "") != "":
                                has_data = True
                                break
                        if has_data:
                            break

                    if not has_data:
                        continue

                    for m_name, stats_list in agg_metrics:
                        for stat in stats_list:
                            val = step_data[step].get(
                                f"{m_name}_{stat}", '')
                            row.append(f"{val:.4f}" if isinstance(
                                val, (int, float)) else val)
                    writer.writerow(row)

    print(f"Completed analysis")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze benchmark results")
    parser.add_argument(
        "exp_dir", help="Path to the specific experiment folder")
    args = parser.parse_args()

    process_experiment(args.exp_dir)
