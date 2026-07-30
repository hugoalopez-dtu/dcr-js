# MSc Thesis — Multi-objective Optimisation of Business Processes via Reinforcement Learning

**Author:** Sofía Ortiz Arce · DTU Technical University of Denmark · 2026

This repository contains the full implementation for the MSc thesis *"Multi-objective Optimisation of Business Processes via Reinforcement Learning: A Shielded Reinforcement Learning Approach over Declarative DCR Models"*.

The work extends the DCR-js platform (see below) with a reinforcement learning pipeline that optimises business process executions for cost and time while guaranteeing formal compliance by construction.

## Thesis code — where to find things

| What | Path |
|---|---|
| RL environment (Gymnasium) | `dcr-gymnasium-agent/python/src/envs/dcr_env.py` |
| PPO training agent | `dcr-gymnasium-agent/python/src/agents/train_agent.py` |
| Training & evaluation scripts | `dcr-gymnasium-agent/python/scripts/` |
| Analysis notebook (Pareto, plots) | `dcr-gymnasium-agent/python/scripts/notebooks/analysis.ipynb` |
| MiniZinc ground truth (CSP+COP) | `dcr-gymnasium-agent/python/minizinc_ground_truth/` |
| Experimental results & figures | `dcr-gymnasium-agent/python/scripts/logs/` |
| DCR graphs used in experiments | `app/public/examples/diagrams/` |
| Node adapter (REST API bridge) | `node-adapter/src/server.ts` |
| DCR execution engine (TypeScript) | `dcr-engine/src/` |
| Thesis LaTeX source | `dcr-gymnasium-agent/python/thesis_text/` |

> **Note:** Training logs (raw PPO episode CSVs) are not included in the repository due to size. Available on request.

---

# DCR-js: an open-source process modelling and mining environment for DCR graphs

[Try it live!](https://hugoalopez-dtu.github.io/dcr-js/)

What are DCR Graphs? A novel [Business Process Management](https://en.wikipedia.org/wiki/Business_process_management) notation is ideal for flexible processes, such as those in healthcare, municipal administration, or knowledge-intensive processes in general. The notation allows you to describe processes like a game, focusing on the rules.

For a formal definition of DCR graphs, please [read this paper](https://arxiv.org/pdf/1110.4161.pdf).

This tool supports a wide range of process mining activities for DCR graphs:

* Modeling, automatic layout, and nesting, and open test cases to support **Test Driven Modeling**.

* Discovery with automatic layouting and nesting.

* Conformance checking, both rule-based and alignment-based, with an additional heatmap feature to highlight both activations and violations, both log-based and trace-based.

* Simulation and manual event log generation with both conforming and non-conforming traces.

* Automatic event log generation by sampling models.

## User Manual ##
The user manual for DCR-js can be found in the [docs folder](https://github.com/hugoalopez-dtu/dcr-js/blob/main/docs/UserManual-DCR-js.pdf) (Document version June 27, 2025)
A video walk-through explaining the main functionalities of the tool can be watched [here](http://tiny.cc/ya1o001)

[![Screencast DCRjs](https://github.com/hugoalopez-dtu/dcr-js/blob/main/docs/screencastDCRJS.png)](http://tiny.cc/ya1o001)

## Development information

This project is organized into three separate modules.

* [**App**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app): The main react application. Visit here for information on UI development and extension, as well as information on running the application locally.

* [**Modeler**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/modeler): The DCR graph editor. The editor is based on the popular [Diagram-js](https://github.com/bpmn-io/diagram-js) web editor. Visit here for information about editor development as well an how the editor is encapsulated for use in the application. 

* [**DCR-engine**](https://github.com/hugoalopez-dtu/dcr-js/tree/main/dcr-engine): The underlying DCR engine. This module contains a typescript implementation of DCR graphs, all process mining algorithms, as well as all types used for these.

# Citing DCR-js
We are happy that you are using our project for research purposes. We would appreciate it if you cite our project in case you decide to use the models in your publication:

If you use only the editor capabilities:
```bibtex
@inproceedings{dcrjs,
  title={An open-source modeling editor for declarative process models},
  author={Tamo, Lucien Kiven and Abbad-Andaloussi, Amine and Trinh, Dung My Thi and L{\'o}pez, Hugo A.},
  booktitle={International Conference on Cooperative Information Systems 2023},
  Volume={3552},
  pages={1--5},
  year={2023},
  organization={CEUR-WS}
}
```
If you use the process mining or simulation capabilities:
```bibtex
@inproceedings{christfort2025dcr,
  title={DCR-JS: An Online Environment for Declarative Process Mining},
  author={Christfort, Axel KF and L{\'o}pez, Hugo A.},
  booktitle={23rd International Conference on Business Process Management},
  Volume={4032},
  pages={1--5},
  year={2025}
}
```

# License
This package is published using an MIT license





