const dataPrompt = `
# Task

You are a business process modelling expert, tasked with identifying time and data in textual descriptions of business processes that are relevant to their execution.
Specifically, you shall look for variables that are used in deadlines (time) and (data) guards of DCR constraints.
You are given the textual process description, where events are already marked by XML-style tags, and a list of relations between them.

# Definition

{{description}}

# Format

First retrieve a list of variables that are used in the process, give one variable per line with the following format.

<variable-name>\t<variable-type>

Then retrieve a list of deadline and guarding expressions in FEEL, one per line, using the following format:

<relation-id>\t<expression>

## Format Examples

Given the following input:

the <actor id=1> LLM </actor> <event id=0> extracts the text </event> once, and, if it is longer than 200 characters, only then must <event id=2> send it back </event> at most 2 hours later.

0\texecutes\t1\t0
1\texecutes\t1\t2
2\tresponse\t0\t2
3\tcondition\t0\t2
4\texcludes\t0\t0

You will extract the following variables and guards:

length\tNumber

2\tPT2h
2\tlength>200

# Example

Given the textual description and list of relations:

When <Actor id=0> an operating air carrier </Actor> reasonably <Event id=1> expects a flight to be delayed </Event> beyond its scheduled time of departure for two hours or more in the case of flights of 1500 kilometres or less <Event id=2> passengers shall be offered compensation </Event> .

0\texecutes\t0\t1
1\tresponse\t1\t2

You are expected to extract:

delay\tNumber
distance\tNumber
1\tdelay>=2 and distance>1500

# The textual description and relations

{{text}}

{{relations}}
`;

export default dataPrompt;