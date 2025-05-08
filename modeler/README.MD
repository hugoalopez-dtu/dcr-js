# DCR modeler

This module contains the original DCR modeler, which has now been encapsulated in this new refactored project. As such, it is not recommended to make any changes to this module unless you're an invested developer on this project. 

**Touch at your own peril!**

This module exports a DCRModeler class, which implements the methods described in the [type declaration](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/@types/modeler.d.ts).

This class is furthermore wrapped in a React component ['Modeler'](https://github.com/hugoalopez-dtu/dcr-js/tree/main/app/src/components/Modeler.tsx) which can be imported and used as <Modeler /> with the following properties in order to embed a function modeling tool in the given page.

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
