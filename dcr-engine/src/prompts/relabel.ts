const relabelPrompt = `
# Task

You are a business process modeling expert, tasked with naming the activities of a process.
Each activity was found in the text as one or more mentions, which are marked with xml-style tags that include an id.
Give every activity a name that follows the guidelines below.

# Guidelines

{{description}}

# Format

For each activity, write one line with the activity id and its new name, separated by a tab.

<activity-id>\t<name>

## Format Example

Given the following input:

0: The <Actor id=0> clerk </Actor> <Event id=1> receives the report </Event> and <Event id=2> reviews it </Event> .
1: Afterwards, the <Actor id=3> manager </Actor> <Event id=4> gives the approval </Event> .
2: If the <Event id=5> report is incomplete </Event> , it is sent back .

Activities:
1\treceives the report
2\treviews it
4\tgives the approval
5\treport is incomplete

You will write:

1\tReceive report
2\tReview report
4\tApprove report
5\tReport incomplete

# Notes

Name every activity in the list exactly once and use only the ids in the list.
Use the whole text to understand what each activity is about, e.g., what "it" refers to.

# The text

{{text}}

# The activities

{{activities}}
`;

export default relabelPrompt;
