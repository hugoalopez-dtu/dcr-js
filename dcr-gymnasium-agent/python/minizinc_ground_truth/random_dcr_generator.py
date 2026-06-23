"""
Controlled DCR graph generator for a scaling study, in the spirit of Diaz et
al.'s own generator (dcrGraph/Tests/scripts/generators/DcrInstancesGenerator.py)
but producing the "parsed" dict format used by tobias_converter.py and
compute_lmin.py, so the SAME downstream pipeline (MiniZinc ground truth via
build_extended_graph, RL training XML via build_engine_xml, structural L_min
via compute_lmin) can be reused unchanged for synthetic graphs of any size.

Unlike Diaz et al.'s generator (which fixes relation counts in absolute terms
while growing #events, and randomizes the initial marking), this one:
  - scales relation count with #events (density = relations per event),
    matching the density profile of the real mined graphs (Tobias dataset,
    ranged 1.4-14.5 rel/event) instead of making graphs sparser as they grow
  - always starts fully included / not executed / not pending (matches every
    mined graph in the Tobias set, and is required for a clean comparison
    against them)
  - is fully seeded (reproducible), unlike the original which uses the
    unseeded global `random` module
"""
import random


def generate_graph(num_events, seed=1, density=6.0,
                    mix=(0.30, 0.20, 0.10, 0.40)):
    """mix = (condition, response, include, exclude) proportions of the total
    relation count (density * num_events), rounded to integers."""
    rng = random.Random(seed)
    event_ids = [f"Event_{i}" for i in range(1, num_events + 1)]
    descriptions = {e: "Act_" + e for e in event_ids}
    initial_marking = {e: {"executed": False, "included": True, "pending": False}
                        for e in event_ids}

    total_rel = round(density * num_events)
    cond_n, resp_n, incl_n, excl_n = (round(total_rel * p) for p in mix)

    def rand_pair(allow_self):
        a = rng.choice(event_ids)
        b = rng.choice(event_ids)
        if not allow_self:
            while b == a:
                b = rng.choice(event_ids)
        return a, b

    relations = []
    for _ in range(cond_n):
        a, b = rand_pair(allow_self=False)
        relations.append(("condition", a, b))
    for _ in range(resp_n):
        a, b = rand_pair(allow_self=False)
        relations.append(("response", a, b))
    for _ in range(incl_n):
        a, b = rand_pair(allow_self=True)
        relations.append(("include", a, b))
    for _ in range(excl_n):
        a, b = rand_pair(allow_self=True)
        relations.append(("exclude", a, b))

    return {
        "event_ids": event_ids,
        "descriptions": descriptions,
        "initial_marking": initial_marking,
        "relations": relations,
        "num_events": num_events,
        "num_relations": len(relations),
    }


def generate_chain_graph(num_events, seed=1, noise_density=2.0,
                          noise_mix=(0.25, 0.25, 0.15, 0.35)):
    """Like generate_graph, but lays down a forced sequential skeleton first
    (condition(e_i,e_i+1) + response(e_i,e_i+1) for all i), so there is a
    guaranteed long path through the graph -- pure random wiring almost never
    produces one (real mined workflows have this kind of sequential backbone,
    plain random graphs don't). Random noise relations are layered on top at
    `noise_density` relations/event to add branching/complexity; they may
    shorten the minimal accepting trace below num_events, which is exactly
    what we want to measure via compute_lmin rather than assume."""
    rng = random.Random(seed)
    event_ids = [f"Event_{i}" for i in range(1, num_events + 1)]
    descriptions = {e: "Act_" + e for e in event_ids}
    initial_marking = {e: {"executed": False, "included": True, "pending": False}
                        for e in event_ids}

    relations = []
    for i in range(num_events - 1):
        a, b = event_ids[i], event_ids[i + 1]
        relations.append(("condition", a, b))
        relations.append(("response", a, b))

    total_noise = round(noise_density * num_events)
    cond_n, resp_n, incl_n, excl_n = (round(total_noise * p) for p in noise_mix)

    def rand_pair(allow_self):
        a = rng.choice(event_ids)
        b = rng.choice(event_ids)
        if not allow_self:
            while b == a:
                b = rng.choice(event_ids)
        return a, b

    # Noise conditions must respect the same index order as the skeleton
    # (src earlier in the chain than tgt) -- a backward condition combined
    # with the skeleton's forward conditions creates a dependency cycle that
    # deadlocks the graph from the very first step (nothing ever enabled).
    for _ in range(cond_n):
        i, j = rng.sample(range(num_events), 2)
        if i > j:
            i, j = j, i
        relations.append(("condition", event_ids[i], event_ids[j]))
    for _ in range(resp_n):
        a, b = rand_pair(allow_self=False)
        relations.append(("response", a, b))
    for _ in range(incl_n):
        a, b = rand_pair(allow_self=True)
        relations.append(("include", a, b))
    for _ in range(excl_n):
        a, b = rand_pair(allow_self=True)
        relations.append(("exclude", a, b))

    return {
        "event_ids": event_ids,
        "descriptions": descriptions,
        "initial_marking": initial_marking,
        "relations": relations,
        "num_events": num_events,
        "num_relations": len(relations),
    }
