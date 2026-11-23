export type Variable = {
    name: string;
    type: string;
}

export type Expression = {
    text: string;
    boundToRelation: number;
}

export type Mention = {
    text: string;
    type: string;
    name: string;
    sentence: number;
};

export type Entity = {
    id: number;
    representativeIndex: number;
    mentionIndices: number[];
    /** Name of the activity, set by the relabelling step; falls back to the representative mention's text. */
    label?: string;
}

export type Relation = {
    type: string;
    name: string;
    headMentionIndex: number;
    tailMentionIndex: number;
};

export type ProcessDescription = {
    text: string;
    sentences: string[];
    mentions: Mention[];
    entities: Entity[];
    relations: Relation[];
    variables: Variable[];
    expressions: Expression[];
}

export type MentionTypeDefinition = {
    type: string;
    name: string;
    description: string;
    order: number;
};

export type RelationTypeDefinition = {
    type: string;
    name: string;
    description: string;
    order: number;
};

export type ExtractionConfig = {
    text: string;
    modelName: string;
    apiKey: string;
    mentionDescriptions: MentionTypeDefinition[];
    entityDescription: string;
    relationDescriptions: RelationTypeDefinition[];
    dataDescription: string;
    includeData: boolean;
    relabelDescription: string;
    relabel: boolean;
}

export type ExtractionResult = {
    graph: import("../types").RoleDataDCR;
    doc: ProcessDescription;
}
