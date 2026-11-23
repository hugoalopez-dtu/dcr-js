import { is } from '../../util/ModelUtil';
import { getNewShapePosition } from '../auto-place/DCRAutoPlaceUtil';

/**
 * Relation types understood by the modeler.
 */
export const RELATION_TYPES = [
  'condition',
  'response',
  'include',
  'exclude',
  'milestone',
  'spawn'
];

const TYPE_ALIASES = {
  conditions: 'condition',
  responses: 'response',
  includes: 'include',
  excludes: 'exclude',
  milestones: 'milestone',
  spawns: 'spawn'
};

const PLACEMENT_GAP = 80;

/**
 * Error thrown by every DCRGraphEditing operation that cannot be carried out.
 * The message is meant to be readable as-is (by a person or an LLM).
 */
export class GraphEditingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphEditingError';
  }
}

/**
 * Normalise a relation type ("Includes", "exclude", ...) to the modeler's
 * canonical name, or throw.
 *
 * @param {string} type
 * @return {string}
 */
export function normalizeRelationType(type) {
  const t = String(type || '').trim().toLowerCase();
  const canonical = TYPE_ALIASES[t] || t;
  if (!RELATION_TYPES.includes(canonical)) {
    throw new GraphEditingError(
      `Unknown relation type "${type}". Expected one of: ${RELATION_TYPES.join(', ')}.`
    );
  }
  return canonical;
}

/**
 * Programmatic editing of the DCR graph that is currently rendered.
 *
 * Every change goes through the modeling service (and therefore the command
 * stack), so it is rendered immediately, can be undone, and fires the same
 * change events as edits made by hand.
 *
 * Events are referenced either by element id (e.g. "Event_3") or by their
 * label (description). A label that matches several events is rejected.
 *
 * Usage: `modeler.get('dcrGraphEditing').addRelation('condition', 'A', 'B')`
 */
export default function DCRGraphEditing(
  modeling, elementRegistry, elementFactory, canvas, dcrRules, moddle) {
  this._modeling = modeling;
  this._elementRegistry = elementRegistry;
  this._elementFactory = elementFactory;
  this._canvas = canvas;
  this._dcrRules = dcrRules;
  this._moddle = moddle;
}

DCRGraphEditing.$inject = [
  'modeling',
  'elementRegistry',
  'elementFactory',
  'canvas',
  'dcrRules',
  'moddle'
];


// ── reading ────────────────────────────────────────────────────────────────

/**
 * @return {Array<{id, name, role, included, pending, executed, variable}>}
 */
DCRGraphEditing.prototype.listEvents = function() {
  return this._events().map(toEventInfo);
};

/**
 * @return {Array<{id, type, source, target, sourceId, targetId, guard}>}
 */
DCRGraphEditing.prototype.listRelations = function() {
  return this._relations().map(toRelationInfo);
};

/**
 * @param {string} ref event id or label
 * @return {boolean}
 */
DCRGraphEditing.prototype.hasEvent = function(ref) {
  return this._matchEvents(ref).length > 0;
};

/**
 * @return {boolean}
 */
DCRGraphEditing.prototype.hasRelation = function(type, source, target) {
  return !!this._findRelation(normalizeRelationType(type), source, target, false);
};

/**
 * Ids of the relations matching all given filters (no filters: all relations).
 * A source/target that matches no event gives an empty result; a label that
 * matches several events matches relations of any of them.
 *
 * @param {Object} [filters]
 * @param {string} [filters.source] event id or label
 * @param {string} [filters.target] event id or label
 * @param {string} [filters.type] relation type
 *
 * @return {Array<string>}
 */
DCRGraphEditing.prototype.getEdges = function(filters = {}) {
  const type = filters.type !== undefined ? normalizeRelationType(filters.type) : undefined;
  const sources = filters.source !== undefined ? this._matchEvents(filters.source) : undefined;
  const targets = filters.target !== undefined ? this._matchEvents(filters.target) : undefined;

  return this._relations()
    .filter(r =>
      (type === undefined || r.businessObject.get('type') === type) &&
      (sources === undefined || sources.includes(r.source)) &&
      (targets === undefined || targets.includes(r.target)))
    .map(r => r.id);
};

/**
 * Ids of the events matching all given filters (no filters: all events).
 *
 * @param {Object} [filters]
 * @param {string} [filters.name] exact label
 * @param {string} [filters.role] exact role
 * @param {{included?: boolean, pending?: boolean, executed?: boolean}} [filters.marking]
 *        only the given marking flags are checked
 *
 * @return {Array<string>}
 */
DCRGraphEditing.prototype.getNodes = function(filters = {}) {
  const marking = filters.marking || {};
  return this._events()
    .filter(e => {
      const bo = e.businessObject;
      if (filters.name !== undefined && label(e) !== filters.name) return false;
      if (filters.role !== undefined && (bo.get('role') || '') !== filters.role) return false;
      for (const key of [ 'included', 'pending', 'executed' ]) {
        if (marking[key] !== undefined && !!bo.get(key) !== !!marking[key]) return false;
      }
      return true;
    })
    .map(e => e.id);
};


// ── events ─────────────────────────────────────────────────────────────────

/**
 * Add an event to the root of the diagram.
 *
 * @param {string} name label of the new event (must not be in use)
 * @param {Object} [options]
 * @param {string} [options.role]
 * @param {boolean} [options.included=true]
 * @param {boolean} [options.pending=false]
 * @param {boolean} [options.executed=false]
 * @param {string} [options.near] event (id or label) to place the new event next to
 * @param {{x: number, y: number}} [options.position] explicit centre position
 *
 * @return {string} id of the new event
 */
DCRGraphEditing.prototype.addEvent = function(name, options = {}) {
  name = requireName(name, 'Event name');
  if (this._matchEvents(name).length) {
    throw new GraphEditingError(`An event named "${name}" already exists.`);
  }

  const attrs = {
    description: name,
    included: options.included ?? true,
    pending: options.pending ?? false,
    executed: options.executed ?? false,
    enabled: false
  };
  if (options.role) attrs.role = options.role;

  const shape = this._elementFactory.createShape({ type: 'dcr:Event', attrs });
  const near = options.near ? this._getEvent(options.near) : null;
  const position = options.position || this._findPosition(shape, near);

  const created = this._modeling.createShape(shape, position, this._canvas.getRootElement());
  return created.id;
};

/**
 * Remove an event together with all of its relations.
 *
 * @param {string} id event id (see getNodes)
 */
DCRGraphEditing.prototype.removeEvent = function(id) {
  this._modeling.removeElements([ this._getEventById(id) ]);
};

/**
 * @param {string} id event id (see getNodes)
 * @param {string} newName must not be used by another event
 */
DCRGraphEditing.prototype.renameEvent = function(id, newName) {
  const event = this._getEventById(id);
  newName = requireName(newName, 'New event name');
  const clash = this._matchEvents(newName).filter(e => e !== event);
  if (clash.length) {
    throw new GraphEditingError(`An event named "${newName}" already exists.`);
  }
  this._modeling.updateProperties(event, { description: newName });
};

/**
 * @param {string} id event id (see getNodes)
 * @param {string|undefined} role pass undefined/empty to clear
 */
DCRGraphEditing.prototype.setRole = function(id, role) {
  this._modeling.updateProperties(this._getEventById(id), { role: role || undefined });
};

/**
 * @param {string} id event id (see getNodes)
 * @param {{included?: boolean, pending?: boolean, executed?: boolean}} marking
 *        omitted flags stay unchanged
 */
DCRGraphEditing.prototype.setMarking = function(id, marking = {}) {
  const event = this._getEventById(id);
  const props = {};
  for (const key of [ 'included', 'pending', 'executed' ]) {
    if (marking[key] !== undefined) props[key] = !!marking[key];
  }
  if (Object.keys(props).length) {
    this._modeling.updateProperties(event, props);
  }
};

/**
 * Attach a data variable to an event, or remove it (variable = null).
 *
 * @param {string} id event id (see getNodes)
 * @param {{name: string, type: string, default?: string}|null} variable
 */
DCRGraphEditing.prototype.setVariable = function(id, variable) {
  const event = this._getEventById(id);
  if (!variable) {
    this._modeling.updateProperties(event, { eventData: undefined });
    return;
  }
  const attrs = {
    name: requireName(variable.name, 'Variable name'),
    type: variable.type || 'String'
  };
  if (variable.default !== undefined && variable.default !== '') {
    attrs.default = String(variable.default);
  }
  this._modeling.updateProperties(event, {
    eventData: this._moddle.create('dcr:EventData', attrs)
  });
};


// ── relations ──────────────────────────────────────────────────────────────

/**
 * @param {string} type condition | response | include | exclude | milestone | spawn
 * @param {string} source event id or label
 * @param {string} target event id or label
 * @param {Object} [options]
 * @param {string} [options.guard]
 *
 * @return {string} id of the new relation
 */
DCRGraphEditing.prototype.addRelation = function(type, source, target, options = {}) {
  type = normalizeRelationType(type);
  const src = this._getEvent(source);
  const tgt = this._getEvent(target);

  if (this._findRelation(type, src, tgt, false)) {
    throw new GraphEditingError(
      `A ${type} relation from "${label(src)}" to "${label(tgt)}" already exists.`
    );
  }
  if (!this._dcrRules.canConnect(src, tgt) ||
      !this._dcrRules.isLinkAllowed({ source: src, target: tgt }, type)) {
    throw new GraphEditingError(
      `A ${type} relation from "${label(src)}" to "${label(tgt)}" is not allowed.`
    );
  }

  const attrs = { type };
  if (options.guard) attrs.guard = options.guard;

  const connection = this._modeling.connect(src, tgt, { type: 'dcr:Relation', attrs });
  return connection.id;
};

/**
 * @param {string} id relation id (see getEdges)
 */
DCRGraphEditing.prototype.removeRelation = function(id) {
  this._modeling.removeElements([ this._getRelation(id) ]);
};

/**
 * Change the type of an existing relation, keeping its route on the canvas.
 *
 * @param {string} id relation id (see getEdges)
 * @param {string} toType
 */
DCRGraphEditing.prototype.changeRelationType = function(id, toType) {
  const relation = this._getRelation(id);
  toType = normalizeRelationType(toType);
  if (relation.businessObject.get('type') === toType) return;

  if (this._findRelation(toType, relation.source, relation.target, false)) {
    throw new GraphEditingError(
      `A ${toType} relation from "${label(relation.source)}" to "${label(relation.target)}" already exists.`
    );
  }
  if (!this._dcrRules.isLinkAllowed(relation, toType)) {
    throw new GraphEditingError(
      `A ${toType} relation from "${label(relation.source)}" to "${label(relation.target)}" is not allowed.`
    );
  }
  this._modeling.updateProperties(relation, { type: toType });
};

/**
 * @param {string} id relation id (see getEdges)
 * @param {string|undefined} guard pass undefined/empty to clear
 */
DCRGraphEditing.prototype.setGuard = function(id, guard) {
  this._modeling.updateProperties(this._getRelation(id), { guard: guard || undefined });
};


// ── internals ──────────────────────────────────────────────────────────────

DCRGraphEditing.prototype._events = function() {
  return this._elementRegistry.filter(e => is(e, 'dcr:Event') && !e.labelTarget);
};

DCRGraphEditing.prototype._relations = function() {
  return this._elementRegistry.filter(e => is(e, 'dcr:Relation'));
};

DCRGraphEditing.prototype._matchEvents = function(ref) {
  if (ref && typeof ref === 'object') {
    return is(ref, 'dcr:Event') ? [ ref ] : [];
  }
  const events = this._events();
  const byId = events.filter(e => e.id === ref);
  if (byId.length) return byId;
  return events.filter(e => label(e) === ref);
};

DCRGraphEditing.prototype._getEvent = function(ref) {
  const matches = this._matchEvents(ref);
  if (matches.length === 0) {
    throw new GraphEditingError(`No event "${ref}" in the graph.`);
  }
  if (matches.length > 1) {
    throw new GraphEditingError(
      `"${ref}" matches ${matches.length} events (${matches.map(e => e.id).join(', ')}); use an event id instead.`
    );
  }
  return matches[0];
};

DCRGraphEditing.prototype._getEventById = function(id) {
  const event = this._elementRegistry.get(id);
  if (!event || !is(event, 'dcr:Event') || event.labelTarget) {
    throw new GraphEditingError(`No event with id "${id}" in the graph.`);
  }
  return event;
};

DCRGraphEditing.prototype._getRelation = function(id) {
  const relation = this._elementRegistry.get(id);
  if (!relation || !is(relation, 'dcr:Relation')) {
    throw new GraphEditingError(`No relation with id "${id}" in the graph.`);
  }
  return relation;
};

DCRGraphEditing.prototype._findRelation = function(type, source, target, required) {
  const src = this._getEvent(source);
  const tgt = this._getEvent(target);
  const relation = this._relations().find(r =>
    r.source === src && r.target === tgt && r.businessObject.get('type') === type
  );
  if (!relation && required) {
    throw new GraphEditingError(
      `No ${type} relation from "${label(src)}" to "${label(tgt)}".`
    );
  }
  return relation;
};

DCRGraphEditing.prototype._findPosition = function(shape, near) {
  if (near) {
    return getNewShapePosition(near, shape);
  }

  const shapes = this._elementRegistry.filter(e =>
    !e.waypoints && !e.labelTarget && e.parent && e !== this._canvas.getRootElement()
  );
  if (!shapes.length) {
    return { x: PLACEMENT_GAP + shape.width / 2, y: PLACEMENT_GAP + shape.height / 2 };
  }
  const right = Math.max(...shapes.map(s => s.x + s.width));
  const top = Math.min(...shapes.map(s => s.y));
  return { x: right + PLACEMENT_GAP + shape.width / 2, y: top + shape.height / 2 };
};


// ── helpers ────────────────────────────────────────────────────────────────

function label(element) {
  return element.businessObject.get('description') || '';
}

function requireName(name, what) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new GraphEditingError(`${what} must not be empty.`);
  return trimmed;
}

function toEventInfo(e) {
  const bo = e.businessObject;
  const data = bo.get('eventData');
  return {
    id: e.id,
    name: bo.get('description') || '',
    role: bo.get('role') || undefined,
    included: !!bo.get('included'),
    pending: !!bo.get('pending'),
    executed: !!bo.get('executed'),
    variable: data && data.name
      ? { name: data.name, type: data.type, default: data['default'] }
      : undefined
  };
}

function toRelationInfo(r) {
  const bo = r.businessObject;
  return {
    id: r.id,
    type: bo.get('type'),
    source: label(r.source),
    target: label(r.target),
    sourceId: r.source.id,
    targetId: r.target.id,
    guard: bo.get('guard') || undefined
  };
}
