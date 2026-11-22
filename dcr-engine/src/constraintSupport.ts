
import { quantifyViolations } from "./conformance";
import type {
    DCRGraphS,
    Event,
    EventLog,
    EventMap,
    FuzzyRelation,
    RelationType,
    RoleTrace,
} from "./types";
import { copyMarking } from "./utility";

type SupportedRelationType = Exclude<RelationType, "include">;

const relationKeys = {
    condition: "conditionsFor",
    response: "responseTo",
    exclude: "excludesTo",
    milestone: "milestonesFor",
} as const;

export interface ConstraintSupport {
    type: SupportedRelationType;
    source: Event;
    target: Event;
    activatedTraces: number;
    supportingTraces: number;
    violatingTraces: number;
    support: number | null;
}

function getRelationCount(
    relations: FuzzyRelation,
    type: SupportedRelationType,
    source: Event,
    target: Event,
): number {
    if (type === "condition" || type === "milestone") {
        return relations[target]?.[source] ?? 0;
    }

    return relations[source]?.[target] ?? 0;
}

export function calculateConstraintSupport(
    graph: DCRGraphS,
    log: EventLog<RoleTrace>,
): ConstraintSupport[] {
    const relationTypes = [
        ["condition", graph.conditionsFor],
        ["response", graph.responseTo],
        ["exclude", graph.excludesTo],
        ["milestone", graph.milestonesFor],
    ] as const satisfies ReadonlyArray<
        readonly [SupportedRelationType, EventMap]
    >;

    const constraints: ConstraintSupport[] = [];

    // Collect all supported constraints from the graph.
    for (const [type, relations] of relationTypes) {
        for (const [event, relatedEvents] of Object.entries(relations)) {
            for (const relatedEvent of relatedEvents) {
                const reversed =
                    type === "condition" || type === "milestone";

                constraints.push({
                    type,
                    source: reversed ? relatedEvent : event,
                    target: reversed ? event : relatedEvent,
                    activatedTraces: 0,
                    supportingTraces: 0,
                    violatingTraces: 0,
                    support: null,
                });
            }
        }
    }

    // Evaluate each trace independently.
    for (const trace of Object.values(log.traces)) {
        const draftGraph: DCRGraphS = {
            ...graph,
            marking: copyMarking(graph.marking),
        };

        const result = quantifyViolations(
            draftGraph,
            trace,
            graph.initialVariableStore ?? {},
        );

        for (const constraint of constraints) {
            const { type, source, target } = constraint;
            const key = relationKeys[type];

            const activations = getRelationCount(
                result.activations[key],
                type,
                source,
                target,
            );

            // Ignore traces where the constraint was not activated.
            if (activations === 0) {
                continue;
            }

            constraint.activatedTraces++;

            const violations = getRelationCount(
                result.violations[key],
                type,
                source,
                target,
            );

            const timeViolations = getRelationCount(
                result.timeViolations[key],
                type,
                source,
                target,
            );

            if (violations > 0 || timeViolations > 0) {
                constraint.violatingTraces++;
            } else {
                constraint.supportingTraces++;
            }
        }
    }

    // Calculate support ratios for each constraint.
    for (const constraint of constraints) {
        if (constraint.activatedTraces > 0) {
            constraint.support =
                constraint.supportingTraces / constraint.activatedTraces;
        }
    }

    return constraints;
}
