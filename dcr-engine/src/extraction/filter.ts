import type { Entity, Expression, Mention, ProcessDescription, Relation, Variable } from "./models";

export function filterProcessDescription(
    doc: ProcessDescription,
    selectedMentionIndices: Set<number>,
    selectedRelationIndices: Set<number>,
    selectedVariableIndices: Set<number>,
    selectedExpressionIndices: Set<number>
): ProcessDescription {
    const mentionIndexMap = new Map<number, number>();
    const mentions: Mention[] = [];
    doc.mentions.forEach((m, i) => {
        if (!selectedMentionIndices.has(i)) return;
        mentionIndexMap.set(i, mentions.length);
        mentions.push({...m});
    });

    const relationIndexMap = new Map<number, number>();
    const relations: Relation[] = [];
    doc.relations.forEach((r, i) => {
        if (!selectedRelationIndices.has(i)) return;
        const head = mentionIndexMap.get(r.headMentionIndex);
        const tail = mentionIndexMap.get(r.tailMentionIndex);
        if (head === undefined || tail === undefined) return;
        relationIndexMap.set(i, relations.length);
        relations.push({
            type: r.type,
            name: r.name,
            headMentionIndex: head,
            tailMentionIndex: tail,
        });
    });

    const expressions: Expression[] = [];
    doc.expressions.forEach((e, i) => {
        if (!selectedExpressionIndices.has(i)) return;
        const boundToRelation = relationIndexMap.get(e.boundToRelation);
        if (boundToRelation === undefined) return;
        expressions.push({...e, boundToRelation});
    });

    const variables: Variable[] = [];
    doc.variables.forEach((v, i) => {
        if (!selectedVariableIndices.has(i)) return;
        variables.push({...v});
    });

    // Filter entities: keep entities that still have at least one mention,
    // remapping their mention indices to the filtered mentions array.
    const entities: Entity[] = [];
    doc.entities.forEach((entity) => {
        const mentionIndices = entity.mentionIndices
            .map((i) => mentionIndexMap.get(i))
            .filter((i): i is number => i !== undefined);

        if (mentionIndices.length === 0) return;

        entities.push({
            id: entity.id,
            representativeIndex:
                mentionIndexMap.get(entity.representativeIndex) ?? mentionIndices[0],
            mentionIndices,
        });
    });

    return {
        ...doc,
        mentions,
        relations,
        expressions,
        variables,
        entities,
    };
}
