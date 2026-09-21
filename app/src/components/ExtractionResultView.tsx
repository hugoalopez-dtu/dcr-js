import React, {useEffect, useState} from "react";
import styled from "styled-components";
import type {
    Entity,
    Mention,
    ProcessDescription,
    Relation,
} from "dcr-engine/src/extraction.ts";

type Props = {
    processDescription: ProcessDescription;
    onRebuild: (
        selectedMentions: Set<number>,
        selectedRelations: Set<number>
    ) => void;
    onProcessDescriptionChange: (doc: ProcessDescription) => void;
};

type Span = {
    start: number;
    end: number;
    mention: Mention;
};

const Accordion = styled.div`
  border: 1px solid gainsboro;
  border-radius: 6px;
  overflow: hidden;
`;

const Root = styled.div`
  font-size: 14px;
`;

const DrawerHeader = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 1px solid gainsboro;
  background: ${(props) => (props.$open ? "gainsboro" : "white")};
  cursor: pointer;
  font-weight: 600;
  text-align: left;

  &:hover {
    background: gainsboro;
  }
`;

const DrawerBody = styled.div`
  padding: 0.75rem;
  border-bottom: 1px solid gainsboro;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const ListItem = styled.li`
  padding: 0.25rem 0;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: pointer;
`;

const CheckboxText = styled.span`
  flex: 1;
`;

const Checkbox = styled.input`
  flex: 0 0 auto;
  width: auto;
`;

const RebuildButton = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid gainsboro;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.75rem;

  &:hover {
    background: gainsboro;
  }
`;

const EntityCard = styled.div`
  border: 1px solid gainsboro;
  border-radius: 6px;
  margin-bottom: 0.5rem;
  overflow: hidden;
`;

const EntityCardHeader = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: none;
  background: ${(props) => (props.$open ? "gainsboro" : "white")};
  cursor: pointer;
  font-weight: 600;
  text-align: left;

  &:hover {
    background: gainsboro;
  }
`;

const EntityCardBody = styled.div`
  padding: 0.25rem 0.5rem;
`;

const DropZone = styled.div<{ $active: boolean }>`
  outline: ${(props) => (props.$active ? "2px dashed dodgerblue" : "none")};
  outline-offset: 2px;
  border-radius: 6px;
  padding: 2px;
`;

const CardDropTarget = styled.div<{ $active: boolean }>`
  outline: ${(props) => (props.$active ? "2px solid dodgerblue" : "none")};
  border-radius: 6px;
  padding: 2px;
  margin: -2px;
`;

function hashString(str: string): number {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }

    return hash;
}

function colorForType(type: string) {
    const hash = hashString(type);

    const hue = hash % 360;
    const saturation = 70;
    const lightness = 45;

    return {
        text: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        background: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.15)`,
    };
}

const Drawer: React.FC<{
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({title, defaultOpen = false, children}) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div>
            <DrawerHeader $open={open} onClick={() => setOpen((o) => !o)}>
                <span>{title}</span>
                <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </DrawerHeader>
            {open && <DrawerBody>{children}</DrawerBody>}
        </div>
    );
};

const EntityCardView: React.FC<{
    title: React.ReactNode;
    children: React.ReactNode;
}> = ({title, children}) => {
    const [open, setOpen] = useState(false);

    return (
        <EntityCard>
            <EntityCardHeader $open={open} onClick={() => setOpen((o) => !o)}>
                <span>{title}</span>
                <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </EntityCardHeader>
            {open && <EntityCardBody>{children}</EntityCardBody>}
        </EntityCard>
    );
};

const ExtractionResultView: React.FC<Props> = ({
                                                   processDescription,
                                                   onRebuild,
                                                   onProcessDescriptionChange,
                                               }) => {
    const {text, mentions, relations, entities} = processDescription;

    const [selectedMentions, setSelectedMentions] = useState<Set<number>>(
        () => new Set(mentions.map((_, index) => index))
    );
    const [selectedRelations, setSelectedRelations] = useState<Set<number>>(
        () => new Set(relations.map((_, index) => index))
    );
    const [draggedMentionIndex, setDraggedMentionIndex] = useState<number | null>(null);
    const [dragOverEntityIndex, setDragOverEntityIndex] = useState<number | null>(null);
    const [dragOverZone, setDragOverZone] = useState<string | null>(null);

    useEffect(() => {
        setSelectedMentions(
            new Set(processDescription.mentions.map((_, index) => index))
        );
        setSelectedRelations(
            new Set(processDescription.relations.map((_, index) => index))
        );
    }, [processDescription]);

    const spans: Span[] = [];

    for (const mention of mentions) {
        let start = text.indexOf(mention.text, 0);

        while (start !== -1) {
            const end = start + mention.text.length;

            const overlaps = spans.some(
                (span) => start < span.end && span.start < end
            );

            if (!overlaps) {
                spans.push({start, end, mention});
                break;
            }

            start = text.indexOf(mention.text, start + 1);
        }
    }

    spans.sort((a, b) => a.start - b.start);

    const elements: React.ReactNode[] = [];
    let currentPos = 0;

    spans.forEach((span, index) => {
        // Plain text before mention
        if (span.start > currentPos) {
            elements.push(
                <React.Fragment key={`text-${index}`}>
                    {text.slice(currentPos, span.start)}
                </React.Fragment>
            );
        }

        // Highlighted mention
        const color = colorForType(span.mention.type);
        elements.push(
            <span
                key={`mention-${index}`}
                style={{
                    color: color.text,
                    backgroundColor: color.background,
                    borderRadius: 4,
                    padding: "0 2px",
                    fontWeight: 600,
                }}
                title={span.mention.type}
            >
              {text.slice(span.start, span.end)}
            </span>
        );

        currentPos = span.end;
    });

    // Remaining text
    if (currentPos < text.length) {
        elements.push(
            <React.Fragment key="tail">
                {text.slice(currentPos)}
            </React.Fragment>
        );
    }

    const relationLabel = (relation: Relation): string => {
        const head = mentions[relation.headMentionIndex];
        const tail = mentions[relation.tailMentionIndex];
        return `${relation.type}: ${head?.text ?? `#[${relation.headMentionIndex}]`} → ${tail?.text ?? `#[${relation.tailMentionIndex}]`}`;
    };

    const toggleMention = (index: number) => {
        const wasSelected = selectedMentions.has(index);

        setSelectedMentions((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });

        if (wasSelected) {
            // Deselecting a mention also deselects every relation relying on it.
            const dependentRelations = new Set<number>();
            relations.forEach((relation, relationIndex) => {
                if (
                    relation.headMentionIndex === index ||
                    relation.tailMentionIndex === index
                ) {
                    dependentRelations.add(relationIndex);
                }
            });

            setSelectedRelations((prev) => {
                const next = new Set(prev);
                dependentRelations.forEach((i) => next.delete(i));
                return next;
            });
        }
    };

    const toggleRelation = (index: number) => {
        setSelectedRelations((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const moveMention = (mentionIndex: number, targetEntityIndex: number | null) => {
        const sourceEntityIndex = entities.findIndex((entity) =>
            entity.mentionIndices.includes(mentionIndex)
        );
        if (sourceEntityIndex === -1) return;

        if (targetEntityIndex !== null && sourceEntityIndex === targetEntityIndex) {
            return;
        }
        if (
            targetEntityIndex === null &&
            entities[sourceEntityIndex].mentionIndices.length === 1
        ) {
            return;
        }

        const next = entities.map((entity) => ({
            ...entity,
            mentionIndices: [...entity.mentionIndices],
        }));

        next[sourceEntityIndex].mentionIndices = next[sourceEntityIndex].mentionIndices.filter(
            (i) => i !== mentionIndex
        );

        if (targetEntityIndex !== null) {
            next[targetEntityIndex].mentionIndices.push(mentionIndex);
        }

        const filtered = next
            .map((entity) =>
                entity.mentionIndices.includes(entity.representativeIndex)
                    ? entity
                    : {...entity, representativeIndex: entity.mentionIndices[0] ?? -1}
            )
            .filter((entity) => entity.mentionIndices.length > 0);

        const nextEntityId =
            entities.reduce((max, entity) => Math.max(max, entity.id), -1) + 1;

        if (targetEntityIndex === null) {
            filtered.push({
                id: nextEntityId,
                representativeIndex: mentionIndex,
                mentionIndices: [mentionIndex],
            });
        }

        onProcessDescriptionChange({...processDescription, entities: filtered});
    };

    const handleMentionDrop = (
        e: React.DragEvent,
        targetEntityIndex: number | null
    ) => {
        e.preventDefault();
        moveMention(Number(e.dataTransfer.getData("text/plain")), targetEntityIndex);
        setDraggedMentionIndex(null);
        setDragOverEntityIndex(null);
        setDragOverZone(null);
    };

    const mentionItem = (mention: Mention, index: number) => {
        const color = colorForType(mention.type);
        return (
            <ListItem
                key={index}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(index));
                    setDraggedMentionIndex(index);
                }}
                onDragEnd={() => {
                    setDraggedMentionIndex(null);
                    setDragOverEntityIndex(null);
                    setDragOverZone(null);
                }}
                style={{opacity: draggedMentionIndex === index ? 0.4 : 1}}
            >
                <CheckboxLabel>
                    <CheckboxText>
                        <span style={{color: color.text, fontWeight: 600}}>
                            {mention.text}
                        </span>{" "}
                        ({mention.type}, sentence {mention.sentence})
                    </CheckboxText>
                    <Checkbox
                        type="checkbox"
                        checked={selectedMentions.has(index)}
                        onChange={() => toggleMention(index)}
                    />
                </CheckboxLabel>
            </ListItem>
        );
    };

    const coveredMentionIndices = new Set<number>();
    for (const entity of entities) {
        for (const index of entity.mentionIndices) {
            coveredMentionIndices.add(index);
        }
    }

    const uncoveredMentions = mentions
        .map((mention, index) => ({mention, index}))
        .filter(({index}) => !coveredMentionIndices.has(index));

    const typeGroups = new Map<string, {entity: Entity; entityIndex: number}[]>();
    entities.forEach((entity, entityIndex) => {
        const representative = mentions[entity.representativeIndex];
        if (!representative) return;
        const type = representative.type;
        const list = typeGroups.get(type) ?? [];
        list.push({entity, entityIndex});
        typeGroups.set(type, list);
    });
const sortedTypes = Array.from(typeGroups.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, {sensitivity: "base"})
    );

    const typeCounts = new Map<string, {checked: number; total: number}>();
    for (const [type, entries] of typeGroups) {
        const counts = entries.reduce(
            (accumulator, {entity}) => ({
                checked:
                    accumulator.checked +
                    entity.mentionIndices.filter((index) =>
                        selectedMentions.has(index)
                    ).length,
                total: accumulator.total + entity.mentionIndices.length,
            }),
            {checked: 0, total: 0}
        );
        typeCounts.set(type, counts);
    }

    return (
        <Root>
            <RebuildButton
                onClick={() => onRebuild(selectedMentions, selectedRelations)}
            >
                Rebuild model
            </RebuildButton>
            <Accordion>
                <Drawer title="Text" defaultOpen>
                    <div>{elements}</div>
                </Drawer>
                {sortedTypes.map((type) => {
                    const {checked, total} = typeCounts.get(type)!;
                    return (
                        <Drawer key={type} title={`${type} (${checked}/${total})`}>
                            <DropZone
                                $active={
                                    draggedMentionIndex !== null &&
                                    dragOverEntityIndex === null &&
                                    dragOverZone === type
                                }
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    setDragOverZone(type);
                                    setDragOverEntityIndex(null);
                                }}
                                onDrop={(e) => handleMentionDrop(e, null)}
                            >
                                {typeGroups.get(type)!.map(({entity, entityIndex}) => {
                                    const representative =
                                        mentions[entity.representativeIndex];
                                    if (!representative) return null;

                                    const color = colorForType(representative.type);
                                    const checkedMentionCount =
                                        entity.mentionIndices.filter((index) =>
                                            selectedMentions.has(index)
                                        ).length;
                                    return (
                                        <CardDropTarget
                                            key={entity.id}
                                            $active={
                                                dragOverEntityIndex === entityIndex
                                            }
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                e.dataTransfer.dropEffect = "move";
                                                setDragOverEntityIndex(entityIndex);
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleMentionDrop(e, entityIndex);
                                            }}
                                        >
                                            <EntityCardView
                                                title={
                                                    <span style={{color: color.text}}>
                                                        {`${representative.text} (${checkedMentionCount}/${entity.mentionIndices.length})`}
                                                    </span>
                                                }
                                            >
                                                <List>
                                                    {entity.mentionIndices
                                                        .filter(
                                                            (index) =>
                                                                mentions[index] !==
                                                                undefined
                                                        )
                                                        .map((index) => [
                                                            mentions[index],
                                                            index,
                                                        ] as const)
                                                        .map(([mention, index]) =>
                                                            mentionItem(mention, index)
                                                        )}
                                                </List>
                                            </EntityCardView>
                                        </CardDropTarget>
                                    );
                                })}
                            </DropZone>
                        </Drawer>
                    );
                })}
                {uncoveredMentions.length > 0 && (
                    <Drawer
                        title={`Other mentions (${uncoveredMentions.filter(({index}) => selectedMentions.has(index)).length}/${uncoveredMentions.length})`}
                    >
                        <DropZone
                            $active={
                                draggedMentionIndex !== null &&
                                dragOverEntityIndex === null &&
                                dragOverZone === "other"
                            }
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                                setDragOverZone("other");
                                setDragOverEntityIndex(null);
                            }}
                            onDrop={(e) => handleMentionDrop(e, null)}
                        >
                            <List>
                                {uncoveredMentions.map(
                                    ({mention, index}) =>
                                        mentionItem(mention, index)
                                )}
                            </List>
                        </DropZone>
                    </Drawer>
                )}
                <Drawer title={`Relations (${selectedRelations.size}/${relations.length})`}>
                    <List>
                        {relations.map((relation, index) => (
                            <ListItem key={index}>
                                <CheckboxLabel>
                                        <CheckboxText>{relationLabel(relation)}</CheckboxText>
                                        <Checkbox
                                            type="checkbox"
                                            checked={selectedRelations.has(index)}
                                            onChange={() => toggleRelation(index)}
                                        />
                                    </CheckboxLabel>
                            </ListItem>
                        ))}
                    </List>
                </Drawer>
            </Accordion>
        </Root>
    );
};

export default ExtractionResultView;