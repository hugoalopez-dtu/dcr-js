import CommandStack from "diagram-js/lib/command/CommandStack";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { is } from "../../util/ModelUtil";
import EventBus from "diagram-js/lib/core/EventBus";


/**
 * DCR specific keyboard bindings.
 *
 * @param {CommandStack} commandStack
 * @param {EventBus} eventBus
 */


export const settings = {
  markerNotation: "TAL2023",
  blackRelations: false,
};

export const getSetting = (key) => {
  return settings[key];
};

let globalCommandStack;

export const setSetting = (key, value) => {
  globalCommandStack.execute('settings.update', {
    settings: {},
    key,
    value
  });
};

export default function DCRSettings(commandStack, eventBus) {
  globalCommandStack = commandStack;
  commandStack.registerHandler('settings.update', UpdateSettingsHandler);
}

DCRSettings.$inject = [
  'commandStack',
  'eventBus'
];

/**
 * @param {ElementRegistry} elementRegistry 
 */
function UpdateSettingsHandler(elementRegistry) {
  this._elementRegistry = elementRegistry;
}
UpdateSettingsHandler.$inject = [
  'elementRegistry'
];

UpdateSettingsHandler.prototype.execute = function (context) {
  context.oldValue = settings[context.key];
  settings[context.key] = context.value;
  return this._elementRegistry.filter(function (element) {
    return is(element, 'dcr:Relation');
  });
};

UpdateSettingsHandler.prototype.revert = function (context) {
  settings[context.key] = context.oldValue;

  return this._elementRegistry.filter(function (element) {
    return is(element, 'dcr:Relation');
  });
};