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
    sentence: number;
};

export type Entity = {
    id: number;
    representativeIndex: number;
    mentionIndices: number[];
}

export type Relation = {
    type: string;
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

export type ExtractionConfig = {
    text: string;
    modelName: string;
    apiKey: string;
    mentionDescription: string;
    entityDescription: string;
    relationDescription: string;
    dataDescription: string;
}

export type ExtractionResult = {
    graph: import("../types").RoleDataDCR;
    doc: ProcessDescription;
}
