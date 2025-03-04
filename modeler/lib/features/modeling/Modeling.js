import inherits from 'inherits-browser';

import BaseModeling from 'diagram-js/lib/features/modeling/Modeling';

import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler';
import UpdateCanvasRootHandler from './cmd/UpdateCanvasRootHandler';
import IdClaimHandler from './cmd/IdClaimHandler';

import UpdateLabelHandler from '../label-editing/cmd/UpdateLabelHandler';


/**
 * Postit modeling features activator
 *
 * @param {EventBus} eventBus
 * @param {ElementFactory} elementFactory
 * @param {CommandStack} commandStack
 * @param {DCRRules} dcrRules
 */
export default function Modeling(
  eventBus, elementFactory, commandStack,
  dcrRules) {

  BaseModeling.call(this, eventBus, elementFactory, commandStack);

  this._dcrRules = dcrRules;
}

inherits(Modeling, BaseModeling);

Modeling.$inject = [
  'eventBus',
  'elementFactory',
  'commandStack',
  'dcrRules'
];


Modeling.prototype.getHandlers = function () {
  var handlers = BaseModeling.prototype.getHandlers.call(this);

  handlers['element.updateProperties'] = UpdatePropertiesHandler;
  handlers['canvas.updateRoot'] = UpdateCanvasRootHandler;
  handlers['id.updateClaim'] = IdClaimHandler;
  handlers['element.updateLabel'] = UpdateLabelHandler;

  return handlers;
};


Modeling.prototype.updateLabel = function (element, newLabel, newBounds, hints) {
  this._commandStack.execute('element.updateLabel', {
    element: element,
    newLabel: newLabel,
    newBounds: newBounds,
    hints: hints || {}
  });
};


Modeling.prototype.updateProperties = function (element, properties) {
  this._commandStack.execute('element.updateProperties', {
    element: element,
    properties: properties
  });
};

Modeling.prototype.claimId = function (id, moddleElement) {
  this._commandStack.execute('id.updateClaim', {
    id: id,
    element: moddleElement,
    claiming: true
  });
};


Modeling.prototype.unclaimId = function (id, moddleElement) {
  this._commandStack.execute('id.updateClaim', {
    id: id,
    element: moddleElement
  });
};

Modeling.prototype.connect = function (source, target, attrs, hints) {

  var dcrRules = this._dcrRules;

  if (!attrs) {
    attrs = dcrRules.canConnect(source, target);
  }

  if (!attrs) {
    return;
  }

  return this.createConnection(source, target, attrs, source.parent, hints);
};

/*
Modeling.prototype.setState = function(elements, ElementState) {
  if (!elements.length) {
    elements = [ elements ];
  }

  
  this._commandStack.execute('element.setState', {
    elements: elements,
    Elementstate: ElementState
  });
};*/





