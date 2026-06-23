"""
Converts a DCR-JS modeler/engine XML (the schema used by Expense_Report_Diaz.xml,
LoanApp_junior_senior.xml, Synthetic_review_roles.xml, etc. -- <dcrgraph><specification>
<resources><events><event id=...><cost>/<duration>, <constraints><conditions>/<responses>/
<excludes>/<includes>/<milestones>) into the extendedGraph dict consumed by
pymzn_MultiObj_AsFunct.solveExtendedDcrGraph.

Unlike tobias_converter.py (which parses the unrelated dcr:event/dcr:relation mined-graph
format and synthesizes cost/duration), this parser reads REAL cost/duration values already
present in the XML and ignores any <roles> multipliers (ground truth for the flat,
no-role-choice baseline only).
"""
import re
import xml.etree.ElementTree as ET


def _sanitize_identifier(name, used):
    ident = re.sub(r"[^0-9a-zA-Z_]", "_", name.strip())
    if not ident or not re.match(r"[a-zA-Z_]", ident[0]):
        ident = "a_" + ident
    base = ident
    i = 2
    while ident in used:
        ident = f"{base}_{i}"
        i += 1
    used.add(ident)
    return ident


def parse_dcrjs_xml(path):
    """Returns dict with event_ids (document order), cost/duration per event id,
    label per event id, relation list [(type, source, target), ...], and initial
    marking per event id (defaults to executed=False, included=True, pending=False
    when no <runtime><marking> block is present, matching the engine default)."""
    tree = ET.parse(path)
    root = tree.getroot()

    event_ids = []
    cost = {}
    duration = {}
    for ev in root.findall(".//resources/events/event"):
        eid = ev.get("id")
        event_ids.append(eid)
        cost_el = ev.find("cost")
        dur_el = ev.find("duration")
        cost[eid] = int(cost_el.text) if cost_el is not None and cost_el.text else 0
        duration[eid] = int(dur_el.text) if dur_el is not None and dur_el.text else 0

    labels = {eid: eid for eid in event_ids}
    for m in root.findall(".//resources/labelMappings/labelMapping"):
        eid = m.get("eventId")
        if eid in labels:
            labels[eid] = m.get("labelId", eid)

    relations = []
    rel_tags = {
        "conditions/condition": "condition",
        "responses/response": "response",
        "includes/include": "include",
        "excludes/exclude": "exclude",
        "milestones/milestone": "milestone",
    }
    for xpath, rtype in rel_tags.items():
        for r in root.findall(f".//constraints/{xpath}"):
            relations.append((rtype, r.get("sourceId"), r.get("targetId")))

    initial_marking = {
        eid: {"executed": False, "included": True, "pending": False}
        for eid in event_ids
    }
    executed_ids = {e.get("id") for e in root.findall(".//runtime/marking/executed/event")}
    included_ids = {e.get("id") for e in root.findall(".//runtime/marking/included/event")}
    pending_ids = {e.get("id") for e in root.findall(".//runtime/marking/pendingResponses/event")}
    marking_block = root.find(".//runtime/marking")
    if marking_block is not None and (
        marking_block.find("included") is not None
        or marking_block.find("executed") is not None
        or marking_block.find("pendingResponses") is not None
    ):
        # An explicit <runtime><marking> block is present: included defaults to
        # False per-event unless explicitly listed (only matters if some <event>
        # is deliberately excluded from <included> -- e.g. LoanApp's roles graph
        # lists all 12 events, so this is equivalent to the default here, but the
        # logic must not silently assume "included" for graphs where it isn't).
        for eid in event_ids:
            initial_marking[eid] = {
                "executed": eid in executed_ids,
                "included": eid in included_ids,
                "pending": eid in pending_ids,
            }

    return {
        "event_ids": event_ids,
        "labels": labels,
        "cost": cost,
        "duration": duration,
        "initial_marking": initial_marking,
        "relations": relations,
    }


def build_extended_graph(parsed, K=None):
    """Builds the extendedGraph dict expected by solveExtendedDcrGraph, using the
    REAL cost/duration values parsed from the XML (no synthetic assignment)."""
    event_ids = parsed["event_ids"]
    labels = parsed["labels"]
    initial_marking = parsed["initial_marking"]
    relations = parsed["relations"]

    used_idents = set()
    label_to_ident = {}
    for eid in event_ids:
        lbl = labels[eid]
        if lbl not in label_to_ident:
            label_to_ident[lbl] = _sanitize_identifier(lbl, used_idents)

    distinct_activities = list(dict.fromkeys(label_to_ident.values()))

    events = ["dummyEv"] + event_ids
    Act = ["dummyAct"] + distinct_activities
    l = ["dummyAct"] + [label_to_ident[labels[eid]] for eid in event_ids]

    InitialM = [[False, False, False]]
    for eid in event_ids:
        m = initial_marking[eid]
        InitialM.append([m["executed"], m["included"], m["pending"]])

    conditions, responses, inclusions, exclusions = [], [], [], []
    for rtype, src, tgt in relations:
        pair = [src, tgt]
        if rtype == "condition":
            conditions.append(pair)
        elif rtype == "response":
            responses.append(pair)
        elif rtype == "include":
            inclusions.append(pair)
        elif rtype == "exclude":
            exclusions.append(pair)
        else:
            raise ValueError(f"Unsupported relation type {rtype!r} (milestones not "
                              f"supported by the DcrGraph_Extended.mzn model)")

    # cost[event][feature]: event index 0 = dummyAct, then one row per real event,
    # in event_ids order (matching `events`/`l` order above).
    cost = [[0, 0]]
    for eid in event_ids:
        cost.append([parsed["cost"][eid], parsed["duration"][eid]])

    if K is None:
        K = len(event_ids)

    return {
        "K": K,
        "feats": ["costs", "duration"],
        "agg": ["sumVal", "sumVal"],
        "events": events,
        "Act": Act,
        "InitialM": InitialM,
        "conditions": conditions,
        "responses": responses,
        "inclusions": inclusions,
        "exclusions": exclusions,
        "l": l,
        "cost": cost,
        "num_events": len(event_ids),
        "num_relations": len(relations),
        "num_activities": len(distinct_activities),
    }
