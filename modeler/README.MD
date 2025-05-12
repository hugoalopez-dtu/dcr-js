# DCR modeler

This module contains the original DCR modeler, which has now been encapsulated in this new refactored project. As such, it is not recommended to make any changes to this module unless you're an invested developer on this project. 

**Touch at your own peril!**

This module exports a DCRModeler class, which implements the methods described in the [type declaration](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/@types/modeler.d.ts).

This class is furthermore wrapped in a React component ([Modeler](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/components/Modeler.tsx)) which can be imported and used as \<Modeler /\> with the following properties in order to embed a function modeling tool in the given page.

```
    modelerRef: React.RefObject<DCRModeler | null>,
    initXml?: string,
    override?: {
        graphRef: React.RefObject<{ initial: DCRGraph, current: DCRGraph } | { initial: DCRGraphS, current: DCRGraphS } | null>,
        overrideOnclick: (e: any) => void;
        canvasClassName?: string;
        onLoadCallback?: (graph: DCRGraphS) => void,
        noRendering?: boolean
    }
```

Here, `modelerRef` is a reference which the component will assign the underlying DCRModeler object to, *i.e.* from this reference you can access the class methods of the modeler. 
`initXml` is an optional parameter if you want to render some initial graph xml.
`overide` is another optional parameter that allows more complex features s.a. simulation by disabling modeling functionality and instead render the graph with a manual onClick handler for clicks anywhere on the graph. Here

* `graphRef` is a reference that the component will assign the DCRGraphS to. This graph can be used by algorithms in the DCR-engine.
* `overrideOnclick` is the custom onClick handler that will be called on all clicks on the graph. (e) will contain a payload with information on what was clicked.
* `canvasClassName` is an optional parameter if you want to give the modeling canvas a css className. This allows you to override the graph styling by styling the corresponding className in the [global css](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/index.css).
* `onLoadCallback` allows you to to specify a callback function that is called on the loaded DCRGraphS once the modeler finished loading. 
* `noRendering` is an optional parameter, that when set to true disables enabledness rendering as green border etc. 


# DEPRECATED

## Development

### Installing dependencies
```console
npm i
cd starter
npm i
```

### Running the modeler
```console
cd starter
npm run dev
```

### Tutorial

This [pdf](https://github.com/tlk2k13/dcrjs/blob/main/modeler/Tutorial.pdf) provides a tutorial on how to navigate the dcr-js Editor.
