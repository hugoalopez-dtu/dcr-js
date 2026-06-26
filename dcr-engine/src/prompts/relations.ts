const relationsPrompt = `
# Task

You are a business process modelling expert, tasked with identifying relations between business process relevant entities in textual descriptions of business processes.
These entities have a type and are marked in the given text by xml-style tags, which includes an id, you can use to refer to it.

# Definition

Relations are directed and therefore have a source mention and a target mention.

{{description}}

# Format

Retrieve a relation by listing the type, the head mention index, and the tail mention index, separated by tabs. List one relation per line.

<relation-type>\t<source-mention-index>\t<target-mention-index>

## Format Examples

Given the following input:

the <actor id=1> LLM </actor> <event id=0> extracts the text </event> once, and only then must <event id=2> send it back </event>.

You will extract these relations

executes\t1\t0
executes\t1\t2
response\t0\t2
condition\t0\t2
excludes\t0\t0

# Example

Given the textual description:

(13) <Actor id=0> Passengers </Actor> whose <Event id=1> flights are cancelled </Event> should be able either to <Event id=2> obtain reimbursement of their tickets </Event> or to <Event id=3> obtain re-routing under satisfactory conditions </Event>, and should <Event id=4> be adequately cared for </Event> while awaiting a later flight.

You are expected to extract:

executes\t0\t2
executes\t0\t3
executes\t0\t4
response\t1\t2
response\t1\t3
response\t1\t4
excludes\t2\t3
excludes\t3\t2

# The textual description

{{text}}
`;

export default relationsPrompt;