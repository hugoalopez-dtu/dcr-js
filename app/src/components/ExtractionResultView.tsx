import React, {useEffect, useRef, useState} from "react";
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

const EntityCardHeaderRow = styled.div`
  display: flex;
  align-items: center;
`;

const EntityCardHeaderCheckbox = styled(Checkbox)`
  margin: 0 0.5rem;
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

const CreateEntityTarget = styled.div<{ $active: boolean }>`
  margin: 0.25rem 0.5rem 0.5rem;
  padding: 0.5rem;
  border: 1px dashed ${(props) => (props.$active ? "dodgerblue" : "gainsboro")};
  border-radius: 6px;
  text-align: center;
  color: ${(props) => (props.$active ? "dodgerblue" : "#666")};
  font-weight: 600;
`;

const TextBody = styled.div`
  position: relative;
  white-space: pre-wrap;
`;

const NewEntityPopover = styled.div`
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: white;
  border: 1px solid gainsboro;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 220px;
`;

const NewEntityPopoverRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const PopoverButton = styled.button`
  padding: 0.25rem 0.75rem;
  border: 1px solid gainsboro;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-weight: 600;

  &:hover:not(:disabled) {
    background: gainsboro;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
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
    bulkChecked?: boolean;
    bulkIndeterminate?: boolean;
    onBulkToggle?: () => void;
}> = ({
         title,
         children,
         bulkChecked = false,
         bulkIndeterminate = false,
         onBulkToggle,
     }) => {
    const [open, setOpen] = useState(false);
    const bulkCheckboxRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (bulkCheckboxRef.current) {
            bulkCheckboxRef.current.indeterminate = bulkIndeterminate;
        }
    }, [bulkIndeterminate]);

    const toggleOpen = () => setOpen((o) => !o);

    return (
        <EntityCard>
            <EntityCardHeaderRow>
                {onBulkToggle && (
                    <EntityCardHeaderCheckbox
                        ref={bulkCheckboxRef}
                        type="checkbox"
                        checked={bulkChecked}
                        onChange={onBulkToggle}
                    />
                )}
                <EntityCardHeader $open={open} onClick={toggleOpen}>
                    <span>{title}</span>
                    <span aria-hidden="true">{open ? "▴" : "▾"}</span>
                </EntityCardHeader>
            </EntityCardHeaderRow>
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
    const [dragOverMentionIndex, setDragOverMentionIndex] = useState<number | null>(null);
    const [dragOverCreateNew, setDragOverCreateNew] = useState(false);
    const [textSelection, setTextSelection] = useState<{
        start: number;
        end: number;
        x: number;
        y: number;
    } | null>(null);
    const textBodyRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSelectedMentions(
            new Set(processDescription.mentions.map((_, index) => index))
        );
        setSelectedRelations(
            new Set(processDescription.relations.map((_, index) => index))
        );
    }, [processDescription]);

    const spans: Span[] = [];

    const sentenceOfOffset = (offset: number): number => {
        const sentences = processDescription.sentences;
        let position = 0;
        for (let i = 0; i < sentences.length; i++) {
            const sentence = (sentences[i] ?? "").trim();
            const found = text.indexOf(sentence, position);
            const next =
                found === -1 ? position + sentence.length : found + sentence.length;
            position = next;
            if (offset < next) {
                return i;
            }
        }
        return Math.max(processDescription.sentences.length - 1, 0);
    };

    const closeTextSelection = () => {
        setTextSelection(null);
        window.getSelection()?.removeAllRanges();
    };

    useEffect(() => {
        if (!textSelection) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node)
            ) {
                closeTextSelection();
            }
        };

        document.addEventListener("mousedown", handleMouseDown);
        return () => document.removeEventListener("mousedown", handleMouseDown);
    }, [textSelection]);

    const handleTextMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (popoverRef.current?.contains(e.target as Node)) return;

        const container = textBodyRef.current;
        const selection = window.getSelection();
        const range =
            selection && selection.rangeCount > 0
                ? selection.getRangeAt(0)
                : null;

        if (container && range && container.contains(range.commonAncestorContainer)) {
            const preRange = document.createRange();
            preRange.selectNodeContents(container);
            preRange.setEnd(range.startContainer, range.startOffset);
            const start = preRange.toString().length;
            const end = start + range.toString().length;

            if (end > start) {
                const rect = container.getBoundingClientRect();
                setTextSelection({
                    start,
                    end,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                });
                return;
            }
        }

        setTextSelection(null);
    };

    const addMentionFromSelection = (type: string) => {
        if (!textSelection) return;

        const selectedText = text.slice(textSelection.start, textSelection.end);
        if (selectedText.length === 0) return;

        const mentionIndex = mentions.length;
        const newMention: Mention = {
            text: selectedText,
            type,
            sentence: sentenceOfOffset(textSelection.start),
        };
        const nextEntityId =
            entities.reduce((max, entity) => Math.max(max, entity.id), -1) + 1;
        const newEntity: Entity = {
            id: nextEntityId,
            representativeIndex: mentionIndex,
            mentionIndices: [mentionIndex],
        };

        onProcessDescriptionChange({
            ...processDescription,
            mentions: [...mentions, newMention],
            entities: [...entities, newEntity],
        });
        setSelectedMentions((prev) => new Set(prev).add(mentionIndex));
        closeTextSelection();
    };

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

    const toggleEntityMentions = (entity: Entity) => {
        const allSelected = entity.mentionIndices.every((index) =>
            selectedMentions.has(index)
        );

        if (allSelected) {
            // Deselecting all mentions also deselects every relation relying on them.
            const dependentRelations = new Set<number>();
            relations.forEach((relation, relationIndex) => {
                if (
                    entity.mentionIndices.includes(relation.headMentionIndex) ||
                    entity.mentionIndices.includes(relation.tailMentionIndex)
                ) {
                    dependentRelations.add(relationIndex);
                }
            });

            setSelectedMentions((prev) => {
                const next = new Set(prev);
                entity.mentionIndices.forEach((index) => next.delete(index));
                return next;
            });
            setSelectedRelations((prev) => {
                const next = new Set(prev);
                dependentRelations.forEach((index) => next.delete(index));
                return next;
            });
        } else {
            setSelectedMentions((prev) => {
                const next = new Set(prev);
                entity.mentionIndices.forEach((index) => next.add(index));
                return next;
            });
        }
    };

    const withRepresentativeFirst = (entity: Entity): Entity => ({
        ...entity,
        representativeIndex: entity.mentionIndices[0] ?? entity.representativeIndex,
    });

    const moveMention = (
        mentionIndex: number,
        targetEntityIndex: number | null,
        insertBefore?: number
    ) => {
        const sourceEntityIndex = entities.findIndex((entity) =>
            entity.mentionIndices.includes(mentionIndex)
        );
        if (sourceEntityIndex === -1) return;

        if (targetEntityIndex === null) {
            // Dropped outside of any entity: create a new singleton entity.
            if (entities[sourceEntityIndex].mentionIndices.length === 1) {
                return;
            }

            const next = entities.map((entity) => ({
                ...entity,
                mentionIndices: [...entity.mentionIndices],
            }));
            next[sourceEntityIndex].mentionIndices = next[sourceEntityIndex].mentionIndices.filter(
                (i) => i !== mentionIndex
            );
            const filtered = next
                .map(withRepresentativeFirst)
                .filter((entity) => entity.mentionIndices.length > 0);

            const nextEntityId =
                entities.reduce((max, entity) => Math.max(max, entity.id), -1) + 1;
            filtered.push({
                id: nextEntityId,
                representativeIndex: mentionIndex,
                mentionIndices: [mentionIndex],
            });

            onProcessDescriptionChange({...processDescription, entities: filtered});
            return;
        }

        if (sourceEntityIndex === targetEntityIndex) {
            // Reorder within the same entity. Dropping on a mention row places the
            // dragged mention before that row; dropping on the card background is a no-op.
            if (insertBefore === undefined) return;

            const current = entities[sourceEntityIndex].mentionIndices;
            const from = current.indexOf(mentionIndex);
            if (from === -1) return;

            let to = insertBefore;
            if (from < to) to -= 1;
            if (to === from) return;

            const reordered = [...current];
            reordered.splice(from, 1);
            reordered.splice(to, 0, mentionIndex);

            const next = entities.map((entity, entityIndex) =>
                entityIndex === sourceEntityIndex
                    ? withRepresentativeFirst({...entity, mentionIndices: reordered})
                    : entity
            );

            onProcessDescriptionChange({...processDescription, entities: next});
            return;
        }

        // Move to another entity.
        const next = entities.map((entity) => ({
            ...entity,
            mentionIndices: [...entity.mentionIndices],
        }));
        next[sourceEntityIndex].mentionIndices = next[sourceEntityIndex].mentionIndices.filter(
            (i) => i !== mentionIndex
        );

        if (insertBefore !== undefined) {
            next[targetEntityIndex].mentionIndices.splice(insertBefore, 0, mentionIndex);
        } else {
            next[targetEntityIndex].mentionIndices.push(mentionIndex);
        }

        const filtered = next
            .map(withRepresentativeFirst)
            .filter((entity) => entity.mentionIndices.length > 0);

        onProcessDescriptionChange({...processDescription, entities: filtered});
    };

    const handleMentionDrop = (
        e: React.DragEvent,
        targetEntityIndex: number | null,
        insertBefore?: number
    ) => {
        e.preventDefault();
        const mentionIndex = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isInteger(mentionIndex)) {
            moveMention(mentionIndex, targetEntityIndex, insertBefore);
        }
        setDraggedMentionIndex(null);
        setDragOverEntityIndex(null);
        setDragOverZone(null);
        setDragOverMentionIndex(null);
        setDragOverCreateNew(false);
    };

    const mentionItem = (
        mention: Mention,
        index: number,
        entityIndex?: number
    ) => {
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
                    setDragOverMentionIndex(null);
                    setDragOverCreateNew(false);
                }}
                onDragOver={(e) => {
                    if (entityIndex === undefined) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverEntityIndex(entityIndex);
                    setDragOverMentionIndex(index);
                }}
                onDrop={(e) => {
                    if (entityIndex === undefined) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const insertBefore = entities[entityIndex].mentionIndices.indexOf(index);
                    handleMentionDrop(e, entityIndex, insertBefore);
                }}
                style={{
                    opacity: draggedMentionIndex === index ? 0.4 : 1,
                    cursor:
                        draggedMentionIndex === index ? "grabbing" : "grab",
                    backgroundColor:
                        dragOverMentionIndex === index ? "#dbe9ff" : undefined,
                }}
            >
                <CheckboxLabel>
                    <Checkbox
                        type="checkbox"
                        checked={selectedMentions.has(index)}
                        onChange={() => toggleMention(index)}
                    />
                    <CheckboxText>
                        <span style={{color: color.text, fontWeight: 600}}>
                            {mention.text}
                        </span>{" "}
                        ({mention.type}, sentence {mention.sentence})
                    </CheckboxText>
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

    const draggedSourceEntityIndex =
        draggedMentionIndex === null
            ? -1
            : entities.findIndex((entity) =>
                  entity.mentionIndices.includes(draggedMentionIndex)
              );
    const canCreateNewFromDrag =
        draggedSourceEntityIndex !== -1 &&
        (entities[draggedSourceEntityIndex]?.mentionIndices.length ?? 0) > 1;

    return (
        <Root>
            <RebuildButton
                onClick={() => onRebuild(selectedMentions, selectedRelations)}
            >
                Rebuild model
            </RebuildButton>
            <Accordion>
                <Drawer title="Text" defaultOpen>
                    <TextBody ref={textBodyRef} onMouseUp={handleTextMouseUp}>
                        {elements}
                        {textSelection && (
                            <NewEntityPopover
                                ref={popoverRef}
                                style={{
                                    left: textSelection.x,
                                    top: textSelection.y,
                                }}
                            >
                                <div>
                                    Create entity from{" "}
                                    <strong>
                                        "
                                        {(text.slice(
                                             textSelection.start,
                                             textSelection.end
                                         ).length > 40
                                             ? text.slice(
                                                   textSelection.start,
                                                   textSelection.start + 40
                                               ) + "…"
                                             : text.slice(
                                                   textSelection.start,
                                                   textSelection.end
                                               ))}
                                        "
                                    </strong>
                                </div>
                                <NewEntityPopoverRow>
                                    <PopoverButton
                                        onClick={() =>
                                            addMentionFromSelection("Event")
                                        }
                                    >
                                        Event
                                    </PopoverButton>
                                    <PopoverButton
                                        onClick={() =>
                                            addMentionFromSelection("Actor")
                                        }
                                    >
                                        Actor
                                    </PopoverButton>
                                </NewEntityPopoverRow>
                            </NewEntityPopover>
                        )}
                    </TextBody>
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
                                    const allMentionsSelected =
                                        checkedMentionCount ===
                                        entity.mentionIndices.length;
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
                                                bulkChecked={allMentionsSelected}
                                                bulkIndeterminate={
                                                    checkedMentionCount > 0 &&
                                                    !allMentionsSelected
                                                }
                                                onBulkToggle={() =>
                                                    toggleEntityMentions(entity)
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
                                                            mentionItem(
                                                                mention,
                                                                index,
                                                                entityIndex
                                                            )
                                                        )}
                                                </List>
                                            </EntityCardView>
                                            {entityIndex ===
                                                draggedSourceEntityIndex &&
                                                canCreateNewFromDrag && (
                                                    <CreateEntityTarget
                                                        $active={dragOverCreateNew}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            e.dataTransfer.dropEffect =
                                                                "move";
                                                            setDragOverCreateNew(true);
                                                        }}
                                                        onDragLeave={() =>
                                                            setDragOverCreateNew(false)
                                                        }
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleMentionDrop(e, null);
                                                        }}
                                                    >
                                                        Drop to create new entity
                                                    </CreateEntityTarget>
                                                )}
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
                                        <Checkbox
                                            type="checkbox"
                                            checked={selectedRelations.has(index)}
                                            onChange={() => toggleRelation(index)}
                                        />
                                        <CheckboxText>{relationLabel(relation)}</CheckboxText>
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