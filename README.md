# DCR-js: an open-source web process mining tool for DCR graphs

[Try it live!](https://hugoalopez-dtu.github.io/dcr-js/)

What are DCR Graphs? A novel [Business Process Management](https://en.wikipedia.org/wiki/Business_process_management) notation is ideal for flexible processes, such as those in healthcare, municipal administration, or knowledge-intensive processes in general. The notation allows you to describe processes like a game, focusing on the rules.

For a formal definition of DCR graphs, please [read this paper](https://arxiv.org/pdf/1110.4161.pdf).

This tool supports a wide range of process mining activities for DCR graphs:

* Modeling, automatic layout and nesting, and open test cases to support **Test Driven Modeling**.

* Discovery with automatic layouting and nesting.

* Conformance checking, both rule-based and alignment-based, with an additional heatmap-feature to highlight both activations and violations both log-based and trace-based.

* Simulation and manual event log generation with both conforming and non-conforming traces.

* Automatic event log generation by sampling models.

## Development information

This project is organized in three separate modules.

* [**App**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app): The main react application. Visit here for information on UI development and extension, as well as information on running the application locally.

* [**Modeler**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/modeler): The DCR graph editor. The editor is based on the popular [Diagram-js](https://github.com/bpmn-io/diagram-js) web editor. Visit here for information about editor development as well an how the editor is encapsulated for use in the application. 

* [**DCR-engine**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/dcr-engine): The underlying DCR engine. This module contains a typescript implementation of DCR graphs, all process mining algorithms, as well as all types used for these.

# License
This package is published using an MIT license





