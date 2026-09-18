const entitiesPrompt = `
# Task

You are a business process modeling expert, tasked with resolving entity mentions into entities.
Mentions that refer to the same real-world entity must be grouped together into a single entity.
The text is given sentence by sentence, and the mentions are marked with xml-style tags that include an id, which you should use to refer to them.

# Definition

{{description}}

# Format

For each entity you detect, write a line that lists the mention ids belonging to that entity, separated by tabs.
The first id on each line is the representative mention of the entity, i.e., the mention that best describes the entity.
List one entity per line.

<representative-mention-index>\t<mention-index>\t<mention-index>

## Format Example

Given the following input:

0: The <Actor id=0> clerk </Actor> receives the report and <Event id=1> reviews it </Event> .
1: Afterwards, <Actor id=2> he </Actor> sends a confirmation to <Actor id=3> the manager </Actor> .
2: The <Actor id=4> supervisor </Actor> approves the report .

You will resolve these entities:

0\t2
3
4

Because the clerk (id 0) and "he" (id 2) refer to the same person, while the manager (id 3) and the supervisor (id 4) each refer to distinct entities.

# Notes

Do not invent mention ids that are not present in the input.
Every mention id may belong to exactly one entity.
Mentions that do not refer to an existing entity on their own can still form an entity consisting of a single mention.

# The text

{{text}}
`;

export default entitiesPrompt;