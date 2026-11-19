import type { ProcessDescription } from "./models";

export function preprocessText(text: string): ProcessDescription {
    const processed: ProcessDescription = {
        text: text,
        sentences: [],
        mentions: [],
        entities: [],
        relations: [],
        variables: [],
        expressions: [],
    };

    // fix manual new lines in input text, to prevent problems with segmenting
    text = text.replace(/([\w,-])\s*\n/gm, "$1 ");

    const segmenter = new Intl.Segmenter('en', {granularity: 'sentence'});
    const segments = segmenter.segment(text);
    processed.sentences = Array.from(segments).map(s => s.segment);

    return processed;
}

export function tagMentions(
    sentences: string[],
    mentions: import("./models").Mention[]
): string[] {
    // Group mentions by sentence index
    const mentionsBySentence: Record<number, (import("./models").Mention & { index: number })[]> =
        {};

    mentions.forEach((m, index) => {
        if (!mentionsBySentence[m.sentence]) {
            mentionsBySentence[m.sentence] = [];
        }
        mentionsBySentence[m.sentence].push({...m, index});
    });

    return sentences.map((sentence, sentenceIndex) => {
        const sentenceMentions = mentionsBySentence[sentenceIndex];
        if (!sentenceMentions || sentenceMentions.length === 0) {
            return sentence;
        }

        // Sort by position in sentence (first occurrence)
        const sorted = sentenceMentions
            .map((m) => {
                const start = sentence.indexOf(m.text);
                if (start === -1) return null;
                return {...m, start, end: start + m.text.length};
            })
            .filter((m): m is NonNullable<typeof m> => m !== null)
            .sort((a, b) => b.start - a.start); // IMPORTANT: reverse order

        let result = sentence;

        for (const m of sorted) {
            const before = result.slice(0, m.start);
            const match = result.slice(m.start, m.end);
            const after = result.slice(m.end);

            const tagged = `<${m.type} id=${m.index}>${match}</${m.type}>`;
            result = before + tagged + after;
        }

        return result;
    });
}
