# DCR-engine

This is the underlying typescript implementation of DCR graphs and the algorithms used for the application.
Anything exported here can freely be called from the application. Good practice is to declare all exports in `index.ts` for transparency, but this is not required.
Notable files are:

- `src/types.ts`: The types for everything.

- `src/utility.ts`: Any small utility-functions that might be needed multiple places, _e.g._ copying a set of DCR relations, initializing a default marking, or a set union implementation without side-effects.
