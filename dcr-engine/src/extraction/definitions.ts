import type { MentionTypeDefinition, RelationTypeDefinition } from "./models";

export const defaultMentionDescriptions: MentionTypeDefinition[] = [
    {
        type: "Event",
        name: "Event",
        description:
            "Definition of an event, occurrence, or circumstance that is " +
            "relevant to the regulation or law.",
        order: 1,
    },
    {
        type: "Event",
        name: "Obligation",
        description:
            "An obligation that is the result of some event that happened " +
            "previously. Often signalled by modal verbs such as 'must', " +
            "'shall', ...",
        order: 1,
    },
    {
        type: "Event",
        name: "Permission",
        description:
            "A permission that is the result of some event that happened " +
            "previously. Often signalled by modal verbs, such as 'can', " +
            "'may', ...",
        order: 1,
    },
    {
        type: "Event",
        name: "Exception",
        description:
            "Definition of conditions that constitute an exception " +
            "to the applicability of other obligations or permissions. " +
            "Often signalled by 'unless', 'except', ...",
        order: 1,
    },
    {
        type: "Actor",
        name: "Actor",
        description:
            "Nouns and pronouns, that describe a person, system, or company " +
            "that plays an active role in the scenario of the regulation, law. ",
        order: 2,
    },
];

export const defaultRelationDescriptions: RelationTypeDefinition[] = [
    {
        type: "executes",
        name: "executes",
        description:
            "Focus on actors. Extract a relation of type 'executes', if the text describes that this actor (head) " +
            "is responsible for the event, obligation, permission, or exception (tail).",
        order: 1,
    },
    {
        type: "condition",
        name: "condition",
        description:
            "Focus on events, obligations, permissions, and exceptions. Extract a relation of type 'condition', " +
            "if one (head) must happen before another (tail, usually condition) can happen (first is the 'condition' " +
            "for the second).",
        order: 1,
    },
    {
        type: "response",
        name: "response",
        description:
            "Focus on events, obligations, permissions, and exceptions. Extract a relation of type 'response', " +
            "if executing one of them (head) necessitates the execution of another (tail, usually obligation) " +
            "('responding' to the first).",
        order: 1,
    },
    {
        type: "includes",
        name: "includes",
        description:
            "Focus on events, obligations, permissions, and exceptions. Extract a relation of type 'includes', " +
            "if on of them (head) re-enables the execution of another (tail) again, even if it was excluded " +
            "before.",
        order: 1,
    },
    {
        type: "excludes",
        name: "excludes",
        description:
            "Focus on events, obligations, permissions, and exceptions. Extract a relation of type 'excludes', " +
            "if executing one (head, often but not always exception) makes executing another (tail) event, obligation, " +
            "permission, or exception impossible, i.e., prevents its execution. Excludes relations can be reflexive, " +
            "e.g., if one event, obligation, permission, or exception can only be executed once. Another common case " +
            "is mutual exclusion (choice between actions).",
        order: 1,
    },
];

export const defaultEntityDescription: string =
    "**Entity**: A real-world object that can be referred to by multiple mentions, e.g., a person, company, or event. " +
    "Mentions contained in the same entity must refer to the same real-world object.";

export const defaultDataDescription: string =
    "**Variable**: Data that is relevant to the process, e.g., by changing rules or outcomes. Examples are the age of " +
    "process participants, distances, weights, number of units, etc. Time does not need to be extracted separately and " +
    "will always be a variable available by default.\n" +
    "**Expression**: Rules that change behaviour and constraints, e.g., if a response is only valid if some variable is " +
    "below a certain threshold. Such expressions are called Guards. If the expression uses the time variable, they are " +
    "called Deadlines (for responses) and Timeouts (for conditions). Expressions always shall be extracted in the FEEL " +
    "notation, deadlines and timeouts use the time period format, e.g., PT2h for a period of 2 hours.";

export const initGraphName: string = "DCR-JS Graph";
