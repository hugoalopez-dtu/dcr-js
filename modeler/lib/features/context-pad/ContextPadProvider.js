import {
  assign,
  isArray,
} from 'min-dash';

import {
  hasPrimaryModifier
} from 'diagram-js/lib/util/Mouse';
import { is } from '../../util/ModelUtil';


/**
 * A provider for dcr elements context pad.
 */
export default function ContextPadProvider(
  config, injector, eventBus, connect, create,
  elementFactory, contextPad, modeling, rules,
  translate, popupMenu) {

  config = config || {};

  contextPad.registerProvider(this);

  this._connect = connect;
  this._create = create;
  this._elementFactory = elementFactory;
  this._contextPad = contextPad;

  this._modeling = modeling;

  this._rules = rules;
  this._translate = translate;

  this._popupMenu = popupMenu;

  if (config.autoPlace !== false) {
    this._autoPlace = injector.get('autoPlace', false);
  }

  eventBus.on('create.end', 250, function (event) {
    let context = event.context,
      shape = context.shape;

    if (!hasPrimaryModifier(event) || !contextPad.isOpen(shape)) {
      return;
    }

    let entries = contextPad.getEntries(shape);

    if (entries.replace) {
      entries.replace.action.click(event, shape);
    }
  });
}

ContextPadProvider.$inject = [
  'config.contextPad',
  'injector',
  'eventBus',
  'connect',
  'create',
  'elementFactory',
  'contextPad',
  'modeling',
  'rules',
  'translate',
  'popupMenu',
];


ContextPadProvider.prototype.getContextPadEntries = function (element) {

  const {
    _rules: rules,
    _modeling: modeling,
    _translate: translate,
    _connect: connect,
    _elementFactory: elementFactory,
    _contextPad: contextPad,
    _autoPlace: autoPlace,
    _create: create,
    _popupMenu: popupMenu
  } = this;

  let actions = {};

  if (element.type === 'label') {
    return actions;
  }

  createDeleteEntry(actions);

  if (element.type === 'dcr:Event') {
    createLinkObjectsEntry(actions);
    createLinkNewObjectEntry(actions);
    createObjectReplaceMenu(actions);
  } else if (element.type === 'dcr:Relation') {
    createLinkReplaceMenu(actions);
  } else if (element.type === 'dcr:Nesting') {
    createLinkObjectsEntry(actions);
    createNestingReplaceMenu(actions);
  } else if (element.type === 'dcr:SubProcess') {
    createLinkObjectsEntry(actions);
    createObjectReplaceMenu(actions);
  }

  return actions;

  function removeElement() {
    modeling.removeElements([element]);
  }

  function createDeleteEntry(actions) {

    // delete element entry, only show if allowed by rules
    let deleteAllowed = rules.allowed('elements.delete', { elements: [element] });

    if (isArray(deleteAllowed)) {

      // was the element returned as a deletion candidate?
      deleteAllowed = deleteAllowed[0] === element;
    }

    if (deleteAllowed) {
      assign(actions, {
        'delete': {
          group: 'edit',
          className: 'bpmn-icon-trash',
          title: translate('Remove'),
          action: {
            click: removeElement
          }
        }
      });
    }
  }

  /** Add dcr code -tlk22 */

  function getReplaceMenuPosition(element) {
    var Y_OFFSET = 5;

    var pad = contextPad.getPad(element).html;

    var padRect = pad.getBoundingClientRect();

    var pos = {
      x: padRect.left,
      y: padRect.bottom + Y_OFFSET
    };

    return pos;
  }

  function setState(ElementState) {
    modeling.setState(element, ElementState);
  }


  function createObjectReplaceMenu(actions) {
    assign(actions, {
      'dcr-replace': {
        group: 'edit',
        className: 'bpmn-icon-screw-wrench',
        title: 'Change type',
        action: {
          click: function (event, element) {

            var position = assign(getReplaceMenuPosition(element), {
              cursor: { x: event.x, y: event.y }
            });

            const isMultiInstanceSubProcess = is(element, 'dcr:SubProcess') && element.businessObject['multi-instance'];
            popupMenu.open(element, 'dcr-object-popup', position, { title: !isMultiInstanceSubProcess ? 'Marking:' : undefined });
          }
        },
      },
    });
  }

  function createNestingReplaceMenu(actions) {
    assign(actions, {
      'dcr-replace': {
        group: 'edit',
        className: 'bpmn-icon-screw-wrench',
        title: 'Change type of children',
        action: {
          click: function (event, element) {

            var position = assign(getReplaceMenuPosition(element), {
              cursor: { x: event.x, y: event.y }
            });

            popupMenu.open(element, 'dcr-nesting-popup', position, { title: 'Marking:' });
          }
        },
      },
    });
  }

  function createLinkReplaceMenu(actions) {
    assign(actions, {
      'dcr-replace': {
        group: 'edit',
        className: 'bpmn-icon-screw-wrench',
        title: 'Change DCR Relation type',
        action: {
          click: function (event, element) {

            var position = assign(getReplaceMenuPosition(element), {
              cursor: { x: event.x, y: event.y }
            });

            popupMenu.open(element, 'dcr-link-popup', position, { title: 'DCR Relation Types' });
          }
        },
      },
    });
  }



  /** Add dcr code -tlk22 */




  function startConnect(event, element) {
    connect.start(event, element);
  }

  function createLinkObjectsEntry(actions) {
    assign(actions, {
      'connect': {
        group: 'connect',
        className: 'bpmn-icon-connection',
        title: 'Connect using DCR Relations',
        action: {
          click: startConnect,
          dragstart: startConnect,
        },
      },
    });
  }

  function createLinkNewObjectEntry(actions) {
    assign(actions, {
      'append.append-task': appendAction(
        'dcr:Event',
        'od-no-font-icon-object',
        translate('Append new DCR Event'),
        { attrs: { included: true, pending: false, executed: false, enabled: false } }
      ),
    });
  }

  /**
   * Create an append action
   *
   * @param {string} type
   * @param {string} className
   * @param {string} [title]
   * @param {Object} [options]
   *
   * @return {Object} descriptor
   */
  function appendAction(type, className, title, options) {

    if (typeof title !== 'string') {
      options = title;
      title = translate('Append {type}', { type: type.replace(/^bpmn:/, '') });
    }

    function appendStart(event, element) {

      var shape = elementFactory.createShape(assign({ type: type }, options));
      create.start(event, shape, {
        source: element
      });
    }


    var append = autoPlace ? function (event, element) {
      var shape = elementFactory.createShape(assign({ type: type }, options));

      autoPlace.append(element, shape);
    } : appendStart;


    return {
      group: 'model',
      className: className,
      title: title,
      action: {
        dragstart: appendStart,
        click: append
      }
    };
  }
};