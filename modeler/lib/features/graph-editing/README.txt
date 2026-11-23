GRAPH EDITING API
=================

Programmatic editing of the DCR graph that is currently rendered in the modeler.
Defined in DCRGraphEditing.js.

    const api = modeler.get('dcrGraphEditing');
    api.addRelation('condition', 'Approve', 'Pay');

Conventions
-----------
- id: an event's id (e.g. "Event_3") or a relation's id (e.g. "Relation_4").
  Find ids with getNodes / getEdges; addEvent and addRelation return them.
  Functions that change or remove an existing event or relation take its id.
- ref / source / target (hasEvent, hasRelation, getEdges, addRelation,
  addEvent's "near"): an event's label (e.g. "Pay") or id. A label that
  matches several events is rejected; use the id.
- type: condition, response, include, exclude, milestone or spawn.
  Plural forms (includes, excludes, ...) and any capitalisation are accepted.
- Every change is rendered immediately and can be undone (Ctrl+Z).
- Invalid calls throw a GraphEditingError with a readable message.


READING
-------

listEvents()
    Returns: list of { id, name, role?, included, pending, executed, variable? }

listRelations()
    Returns: list of { id, type, source, target, sourceId, targetId, guard? }

hasEvent(ref)
    ref       string
    Returns:  boolean

getNodes(filters?)
    filters.name               exact event label, optional
    filters.role               exact role, optional
    filters.marking.included   boolean, optional
    filters.marking.pending    boolean, optional
    filters.marking.executed   boolean, optional
    Returns:  list of event ids matching all given filters
              (no filters: all events; only the given marking flags are checked)

hasRelation(type, source, target)
    type      string
    source    string
    target    string
    Returns:  boolean

getEdges(filters?)
    filters.source   event (label or id), optional
    filters.target   event (label or id), optional
    filters.type     relation type, optional
    Returns:         list of relation ids matching all given filters
                     (no filters: all relations; unknown event: empty list)


EVENTS
------

addEvent(name, options?)
    name               string, must not already be used
    options.role       string
    options.included   boolean, default true
    options.pending    boolean, default false
    options.executed   boolean, default false
    options.near       event to place the new one next to
    options.position   { x, y }, explicit centre position
    Returns:           id of the new event

removeEvent(id)
    id        event id
    Also removes all relations of the event.

renameEvent(id, newName)
    id        event id
    newName   string, must not already be used

setRole(id, role)
    id        event id
    role      string; empty/undefined clears it

setMarking(id, marking)
    id        event id
    marking   { included?, pending?, executed? } (booleans; omitted keys stay unchanged)

setVariable(id, variable)
    id        event id
    variable  { name, type, default? }, or null to remove


RELATIONS
---------

addRelation(type, source, target, options?)
    type            relation type
    source          string
    target          string
    options.guard   string
    Returns:        id of the new relation

removeRelation(id)
    id        relation id

changeRelationType(id, toType)
    id        relation id
    toType    relation type
    Keeps the arrow's route on the canvas.

setGuard(id, guard)
    id        relation id
    guard     string; empty/undefined clears it


RULES THAT ARE ENFORCED
-----------------------
- No two events with the same name (addEvent, renameEvent).
- No duplicate relation of the same type between the same two events.
- Same validity rules as the UI: only exclude may go from an event to itself;
  spawn only into a multi-instance subprocess.


NOT SUPPORTED YET
-----------------
Nestings, subprocesses, relation delays/deadlines (time), moving or resizing elements.
