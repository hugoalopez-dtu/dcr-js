# Dcr Graph Process mining tool
 
## About
 
Interactive web-based tool in React that supports modelling, simulation, conformance checking etc. of DCR graphs.
 
## Building
 
You need a [NodeJS](http://nodejs.org) development stack with [npm](https://npmjs.org) and [yarn](https://classic.yarnpkg.com/lang/en/docs/install/#windows-stable) installed to build the project.
 
To install all project dependencies execute in the root folder, *i.e.* /dcr-js/, the following: 
 
```
yarn
```

To run the application locally run

```
yarn start
```
 
Which should serve the application to http://localhost:5173/dcr-js. Note that some errors related to the modeler loading might occur locally as everything is rendered twice. The harmless ones are appended with an explanation.

## Extension Points

### New States

The core application ([App.tsx](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/App.tsx)) is built as a State Machine that maintains the current state to render as well as the saved event logs and graphs. The homepage ([HomeState.tsx](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/components/HomeState.tsx)) is the main entrypoint for the program where there exists button to access every other state.

When adding new functionality that is distinct from the other functionality of the application, this can be done entirely separated from everything by simply adding a new state.

Each State should implement the following properties as defined in `App.tsx`:
```
    interface StateProps {
      savedGraphs: DCRGraphRepository;
      setSavedGraphs: (repository: DCRGraphRepository) => void;
      setState: (state: StateEnum) => void;
      savedLogs: EventLogRepository;
      setSavedLogs: (repository: EventLogRepository) => void;
      lastSavedGraph: React.RefObject<string | undefined>;
      lastSavedLog: React.RefObject<string | undefined>;
    }
```
These properties allows you to access the saved logs and graphs, change State with `setState`, as well as update the saved graphs and logs with `setSavedGraphs` and `setSavedLogs` respectively. `lastSavedGraph` and `lastSavedLog` allows you to access which graph and log were last saved, in order to *e.g.* access the last saved graph as the initial graph in Simulation.

### New Algorithms 

[Discovery](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/components/DiscoveryState.tsx) and [Event Log Generation](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/components/EventLogGenerationState.tsx) employs the same abstraction that allows for easy extension with new algorithms. Both components define a map of algorithms of the type:
```
    [key: string]: {
        inputs: Array<React.JSX.Element>,
        onSubmit: (formData: FormData) => void;
    }
```
Adding a new entry in this map will extend the dropdown with a new option of `key`, which when selected will render a form with the inputs specified in `inputs` and then function `onSubmit` being run when clicked to do so. This allows you to simply specify which inputs you need for the algorithm, and how a DCR graph or event log is generated based on these inputs, without worrying about UI or anything of the sort.

For concrete examples, take a look at the Discovery and Event Log Generation states linked above.