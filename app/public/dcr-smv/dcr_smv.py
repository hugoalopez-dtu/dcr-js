"""
DCR -> NuSMV translation.

Adapted from Jonas's thesis script
(~/Downloads/Jonas Thesis Model Checking/translation_script_DCR_SMV.py) for
in-browser use via Pyodide instead of batch file processing. create_smv()
below is untouched from the original — same template, same DEFINE/CTLSPEC
logic. process_xml() is adapted to parse an XML *string* (ET.fromstring)
instead of reading a file path (ET.parse), since the caller (the modeler's
"Editor XML" export) already has the graph's XML in memory — no
"DCR_processes/" folder to scan here, each export is one graph, on demand.
"""

import xml.etree.ElementTree as ET


def process_xml(xml_text: str):
    root = ET.fromstring(xml_text)

    ns = {
        "dcr": "http://tk/schema/dcr",
        "dcrDi": "http://tk/schema/dcrDi",
        "dc": "http://www.omg.org/spec/DD/20100524/DC"
    }

    graph = root.find("dcr:dcrGraph", ns)
    events = graph.findall("dcr:event", ns)

    for event in events:
        event.attrib["description"] = event.attrib["description"].replace(" ", "_").replace("'", "")

    terms = graph.findall("dcr:relation", ns)
    for term in terms:
        for event in events:
            if term.attrib["sourceRef"] == event.attrib["id"]:
                term.attrib["sourceRef"] = event.attrib["description"]
            if term.attrib["targetRef"] == event.attrib["id"]:
                term.attrib["targetRef"] = event.attrib["description"]

    return events, terms


def create_smv(events, terms):

    template = """MODULE main
    VAR
    {variables}
    INIT
    ({init}
    )
    TRANS
    ( {transitions}
    )
    DEFINE
    {definitions_enabled}
    {definitions_accepted}{definitions_effects}
    CTLSPEC   -- deadlock-freedom
    {spec_deadlock_freedom}
    CTLSPEC   -- absence of dead activities
    {spec_absence_of_dead_activities}
    CTLSPEC   -- livelock-freedom
    {spec_livelock_freedom}
    CTLSPEC   -- consistency
    {spec_consistency}
    """

    ###### VAR
    variables = ""
    for event in events:
        happened = event.attrib["description"] + "_happened"
        variables = variables + happened + " : boolean;" + "\n  "
        included = event.attrib["description"] + "_included"
        variables = variables + included + " : boolean;" + "\n  "
        pending = event.attrib["description"] + "_pending"
        variables = variables + pending + " : boolean;" + "\n  "

    ###### INIT
    init = ""
    for event in events:
        if event.attrib["executed"] == "false":
            happened = "( " + event.attrib["description"] + "_happened = FALSE ) "
        elif event.attrib["executed"] == "true":
            happened = "( " + event.attrib["description"] + "_happened = TRUE ) "
        init = init + "\n  " + happened + "&"
        if event.attrib["included"] == "false":
            included = "( " + event.attrib["description"] + "_included = FALSE ) "
        elif event.attrib["included"] == "true":
            included = "( " + event.attrib["description"] + "_included = TRUE ) "
        init = init + "\n  " + included + "&"
        if event.attrib["pending"] == "false":
            pending = "( " + event.attrib["description"] + "_pending = FALSE ) "
        elif event.attrib["pending"] == "true":
            pending = "( " + event.attrib["description"] + "_pending = TRUE ) "
        init = init + "\n  " + pending + "&"

    init = init[:-1]

    ###### TRANS
    transitions = ""
    for event in events:
        transitions = transitions + "\n  ( "
        transitions = transitions + "(" + event.attrib["description"] + "_enabled) & "
        transitions = transitions + "(" + event.attrib["description"] + "_effect) ) |"
    transitions = transitions + "\n  ( no_enabled & no_effect )"

    ###### DEFINE ENABLED
    definitions_enabled = ""

    for event in events:
        definitions_enabled = definitions_enabled + event.attrib["description"] + "_enabled := " + event.attrib["description"] + "_included"
        for term in terms:
            if term.attrib["type"] == "condition" and event.attrib["description"] == term.attrib["targetRef"]:
                definitions_enabled = definitions_enabled + " & (" + term.attrib["sourceRef"] + "_happened | !" + term.attrib["sourceRef"] + "_included)"
            if term.attrib["type"] == "milestone" and event.attrib["description"] == term.attrib["targetRef"]:
                definitions_enabled = definitions_enabled + " & (!" + term.attrib["sourceRef"] + "_pending | !" + term.attrib["sourceRef"] + "_included)"
        definitions_enabled = definitions_enabled + " ;\n  "

    definitions_enabled = definitions_enabled + "no_enabled := "
    for event in events:
        definitions_enabled = definitions_enabled + "!" + event.attrib["description"] + "_enabled & "
    definitions_enabled = definitions_enabled[:-2] + ";"

    ###### DEFINE ACCEPTED
    definitions_accepted = ""

    for event in events:
        definitions_accepted = definitions_accepted + event.attrib["description"] + "_accepted := ( !" + event.attrib["description"] + "_included | !" + event.attrib["description"] + "_pending | " + event.attrib["description"] + "_enabled ); \n  "

    ###### DEFINE EFFECTS
    definitions_effects = ""

    for event in events:
        effect_exclude = []
        effect_include = []
        effect_pending = []

        for term in terms:
            if term.attrib["type"] == "response" and event.attrib["description"] == term.attrib["sourceRef"]:
                effect_pending.append(term.attrib["targetRef"])
            if term.attrib["type"] == "exclude" and event.attrib["description"] == term.attrib["sourceRef"]:
                effect_exclude.append(term.attrib["targetRef"])
            if term.attrib["type"] == "include" and event.attrib["description"] == term.attrib["sourceRef"]:
                effect_include.append(term.attrib["targetRef"])

        definitions_effects = definitions_effects + event.attrib["description"] + "_effect := ("
        for event2 in events:
            if event.attrib["description"] == event2.attrib["description"]:
                definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_happened) = TRUE) &"
                if event.attrib["description"] in effect_exclude:
                    definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_included) = FALSE) &"
                elif event.attrib["description"] in effect_include:
                    definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_included) = TRUE) &"
                else:
                    definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_included) = " + event.attrib["description"] + "_included) &"
                if event.attrib["description"] in effect_pending:
                    definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_pending) = TRUE) &"
                else:
                    definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_pending) = FALSE) &"
            else:
                definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_happened) = " + event2.attrib["description"] + "_happened) &"
                if event2.attrib["description"] in effect_exclude:
                    definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_included) = FALSE) &"
                elif event2.attrib["description"] in effect_include:
                    definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_included) = TRUE) &"
                else:
                    definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_included) = " + event2.attrib["description"] + "_included) &"
                if event2.attrib["description"] in effect_pending:
                    definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_pending) = TRUE) &"
                else:
                    definitions_effects = definitions_effects + " (next(" + event2.attrib["description"] + "_pending) = " + event2.attrib["description"] + "_pending) &"

        definitions_effects = definitions_effects[:-1] + ") ;\n  "

    definitions_effects = definitions_effects + "no_effect := ( "
    for event in events:
        definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_happened) = " + event.attrib["description"] + "_happened) & "
        definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_included) = " + event.attrib["description"] + "_included) & "
        definitions_effects = definitions_effects + " (next(" + event.attrib["description"] + "_pending) = " + event.attrib["description"] + "_pending) & "

    definitions_effects = definitions_effects[:-2] + ") ;"

    ###### CTLSPECS
    ### deadlock-freedom
    spec_deadlock_freedom = "AG (\n    ("
    for event in events:
        spec_deadlock_freedom = spec_deadlock_freedom + "\n    (" + event.attrib["description"] + "_included & " + event.attrib["description"] + "_pending) |"
    spec_deadlock_freedom = spec_deadlock_freedom[:-1] + "\n    )\n    ->\n    ("
    for event in events:
        spec_deadlock_freedom = spec_deadlock_freedom + "\n    " + event.attrib["description"] + "_enabled |"
    spec_deadlock_freedom = spec_deadlock_freedom[:-1] + "\n    )\n    )"
    ### absence of dead activities
    spec_absence_of_dead_activities = ""
    for event in events:
        spec_absence_of_dead_activities = spec_absence_of_dead_activities + "(EF " + event.attrib["description"] + "_enabled) & "
    spec_absence_of_dead_activities = spec_absence_of_dead_activities[:-2]

    ### livelock-freedom
    spec_livelock_freedom = "AG ("
    for event in events:
        spec_livelock_freedom = spec_livelock_freedom + "\n    ( (" + event.attrib["description"] + "_included & " + event.attrib["description"] + "_pending) -> (EF " + event.attrib["description"] + "_accepted) ) &"
    spec_livelock_freedom = spec_livelock_freedom[:-1] + "\n   )"

    ### consistency
    spec_consistency = "!no_enabled & EX (\n    "
    # stable
    spec_consistency = spec_consistency + "( EF ("
    for event in events:
        spec_consistency = spec_consistency + "\n    (!" + event.attrib["description"] + "_included | !" + event.attrib["description"] + "_pending) &"
    spec_consistency = spec_consistency[:-1] + ") )"

    spec_consistency = spec_consistency + "\n    |\n    "

    # BSCC
    spec_consistency = spec_consistency + "( EF EG ("
    for event in events:
        spec_consistency = spec_consistency + "\n    ( EF " + event.attrib["description"] + "_accepted ) &"
    spec_consistency = spec_consistency[:-1] + ") )"

    spec_consistency = spec_consistency + "\n    )"

    process_smv = template.format(
        variables=variables,
        init=init,
        transitions=transitions,
        definitions_enabled=definitions_enabled,
        definitions_accepted=definitions_accepted,
        definitions_effects=definitions_effects,
        spec_deadlock_freedom=spec_deadlock_freedom,
        spec_absence_of_dead_activities=spec_absence_of_dead_activities,
        spec_livelock_freedom=spec_livelock_freedom,
        spec_consistency=spec_consistency
    )

    return process_smv


def xml_to_smv(xml_text: str) -> str:
    events, terms = process_xml(xml_text)
    return create_smv(events, terms)
