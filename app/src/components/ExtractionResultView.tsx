import React, {useState} from "react";
import styled from "styled-components";
import type {
    Mention,
    ProcessDescription,
    Relation,
} from "dcr-engine/src/extraction.ts";

type Props = {
    processDescription: ProcessDescription;
};

type Span = {
    start: number;
    end: number;
    mention: Mention;
};

const Accordion = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border: 1px solid gainsboro;
  border-radius: 6px;
  overflow: hidden;
`;

const DrawerSection = styled.div<{ $open: boolean }>`
  display: flex;
  flex-direction: column;
  flex: ${(props) => (props.$open ? 1 : 0)};
  min-height: 0;

  &:not(:last-child) {
    border-bottom: 1px solid gainsboro;
  }
`;

const DrawerHeader = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  flex: 0 0 auto;
  background: ${(props) => (props.$open ? "gainsboro" : "white")};
  cursor: pointer;
  font-weight: 600;
  text-align: left;

  &:hover {
    background: gainsboro;
  }
`;

const DrawerBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.75rem;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const ListItem = styled.li`
  padding: 0.25rem 0;
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
        <DrawerSection $open={open}>
            <DrawerHeader $open={open} onClick={() => setOpen((o) => !o)}>
                <span>{title}</span>
                <span aria-hidden="true">{open ? "▴" : "▾"}</span>
            </DrawerHeader>
            {open && <DrawerBody>{children}</DrawerBody>}
        </DrawerSection>
    );
};

const ExtractionResultView: React.FC<Props> = ({processDescription}) => {
    const {text, mentions, relations} = processDescription;

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

    return (
        <Accordion>
            <Drawer title="Text" defaultOpen>
                <div>{elements}</div>
            </Drawer>
            <Drawer title="Entity mentions">
                <List>
                    {mentions.map((mention, index) => {
                        const color = colorForType(mention.type);
                        return (
                            <ListItem key={index}>
                                <span style={{color: color.text, fontWeight: 600}}>
                                    {mention.text}
                                </span>{" "}
                                ({mention.type}, sentence {mention.sentence})
                            </ListItem>
                        );
                    })}
                </List>
            </Drawer>
            <Drawer title="Relations">
                <List>
                    {relations.map((relation, index) => (
                        <ListItem key={index}>{relationLabel(relation)}</ListItem>
                    ))}
                </List>
            </Drawer>
        </Accordion>
    );
};

export default ExtractionResultView;