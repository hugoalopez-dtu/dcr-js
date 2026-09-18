import React from "react";
import type {Mention, ProcessDescription} from "dcr-engine/src/extraction.ts";

type Props = {
    processDescription: ProcessDescription;
};

type Span = {
    start: number;
    end: number;
    mention: Mention;
};

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

const ExtractionResultView: React.FC<Props> = ({
                                                   processDescription,
                                               }) => {
    const {text, mentions} = processDescription;

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

    return <div>{elements}</div>;
};

export default ExtractionResultView;