import React, {useEffect, useState} from "react";
import styled from "styled-components";
import type {
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
                                               }) => {
    const {text, mentions, relations, entities} = processDescription;

    const [selectedMentions, setSelectedMentions] = useState<Set<number>>(
        () => new Set(mentions.map((_, index) => index))
    );
    const [selectedRelations, setSelectedRelations] = useState<Set<number>>(
        () => new Set(relations.map((_, index) => index))
    );

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

    const mentionItem = (mention: Mention, index: number) => {
        const color = colorForType(mention.type);
        return (
            <ListItem key={index}>
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

    return (
        <>
            <RebuildButton
                onClick={() => onRebuild(selectedMentions, selectedRelations)}
            >
                Rebuild model
            </RebuildButton>
            <Accordion>
                <Drawer title="Text" defaultOpen>
                    <div>{elements}</div>
                </Drawer>
                <Drawer title="Entity mentions">
                    {entities.map((entity, entityIndex) => {
                        const representative = mentions[entity.representativeIndex];
                        if (!representative) return null;

                        const color = colorForType(representative.type);
                        return (
                            <EntityCardView
                                key={entityIndex}
                                title={
                                    <span style={{color: color.text}}>
                                        {representative.text}
                                    </span>
                                }
                            >
                                <List>
                                    {entity.mentionIndices
                                        .filter(
                                            (index) =>
                                                mentions[index] !== undefined
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
                        );
                    })}
                    {uncoveredMentions.length > 0 && (
                        <EntityCardView title={<span>Other mentions</span>}>
                            <List>
                                {uncoveredMentions.map(({mention, index}) =>
                                    mentionItem(mention, index)
                                )}
                            </List>
                        </EntityCardView>
                    )}
                </Drawer>
                <Drawer title="Relations">
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
        </>
    );
};

export default ExtractionResultView;