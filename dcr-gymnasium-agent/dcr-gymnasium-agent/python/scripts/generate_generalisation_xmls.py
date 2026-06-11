"""
Generate calibration/test XML variants of LoanApp_junior_senior.xml for the
temporal generalisation gap analysis (sec:policy_generalisation, Analysis 2).

Splits the 1000-case event log temporally (first 800 cases = calibration,
last 200 cases = test), estimates per-activity mean duration (minutes) on
each split, and writes two graph variants with <duration> replaced by the
calibration/test estimates respectively. Costs and role multipliers are left
unchanged.

Usage: python generate_generalisation_xmls.py /path/to/LoanApp_junior_senior.csv
"""
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
XML_IN = ROOT / "app" / "public" / "examples" / "diagrams" / "LoanApp_junior_senior.xml"
OUT_DIR = Path(__file__).resolve().parent / "logs" / "generalisation_gap"

# Event_X -> activity_name (from labelMappings in LoanApp_junior_senior.xml)
EVENT_TO_LABEL = {
    "Event_1":  "Check application form completeness",
    "Event_2":  "Appraise property",
    "Event_3":  "Check credit history",
    "Event_4":  "AML check",
    "Event_5":  "Assess loan risk",
    "Event_6":  "Design loan offer",
    "Event_7":  "Approve loan offer",
    "Event_8":  "Approve application",
    "Event_9":  "Reject application",
    "Event_10": "Cancel application",
    "Event_11": "Return application back to applicant",
    "Event_12": "Applicant completes form",
}


def compute_duration_tables(csv_path: Path):
    df = pd.read_csv(csv_path)
    df["start_timestamp"] = pd.to_datetime(df["start_timestamp"], format="ISO8601", utc=True)
    df["end_timestamp"] = pd.to_datetime(df["end_timestamp"], format="ISO8601", utc=True)
    df["duration_min"] = (df["end_timestamp"] - df["start_timestamp"]).dt.total_seconds() / 60.0

    case_start = df.groupby("case_id")["start_timestamp"].min().sort_values()
    calib_cases = set(case_start.index[:800])
    test_cases = set(case_start.index[800:])

    calib = df[df["case_id"].isin(calib_cases)]
    test = df[df["case_id"].isin(test_cases)]

    calib_mean = calib.groupby("activity_name")["duration_min"].mean()
    calib_median = calib.groupby("activity_name")["duration_min"].median()
    test_mean = test.groupby("activity_name")["duration_min"].mean()
    test_median = test.groupby("activity_name")["duration_min"].median()

    return {
        "calibration": {"mean": calib_mean.to_dict(), "median": calib_median.to_dict()},
        "test": {"mean": test_mean.to_dict(), "median": test_median.to_dict()},
    }


def write_variant(xml: str, durations_by_event: dict, out_path: Path):
    out = xml
    for event_id, new_duration in durations_by_event.items():
        pattern = re.compile(
            r'(<event id="' + re.escape(event_id) + r'">\s*<cost>\d+</cost>\s*<duration>)\d+(</duration>)'
        )
        new_out, n = pattern.subn(r"\g<1>" + str(round(new_duration)) + r"\g<2>", out)
        assert n == 1, f"Expected 1 substitution for {event_id}, got {n}"
        out = new_out
    out_path.write_text(out)


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    assert csv_path and csv_path.exists(), "Usage: generate_generalisation_xmls.py <LoanApp_junior_senior.csv>"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tables = compute_duration_tables(csv_path)

    xml = XML_IN.read_text()

    calib_durations = {ev: tables["calibration"]["mean"][label] for ev, label in EVENT_TO_LABEL.items()}
    test_durations = {ev: tables["test"]["mean"][label] for ev, label in EVENT_TO_LABEL.items()}

    write_variant(xml, calib_durations, OUT_DIR / "LoanApp_junior_senior_calib.xml")
    write_variant(xml, test_durations, OUT_DIR / "LoanApp_junior_senior_test.xml")

    (OUT_DIR / "duration_tables.json").write_text(json.dumps(tables, indent=2, default=float))

    print("Wrote:")
    print(f"  {OUT_DIR / 'LoanApp_junior_senior_calib.xml'}")
    print(f"  {OUT_DIR / 'LoanApp_junior_senior_test.xml'}")
    print(f"  {OUT_DIR / 'duration_tables.json'}")


if __name__ == "__main__":
    main()
