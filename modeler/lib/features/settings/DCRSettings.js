import CommandStack from "diagram-js/lib/command/CommandStack";
import ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import { is } from "../../util/ModelUtil";
import EventBus from "diagram-js/lib/core/EventBus";

const defaultSettings = {
  markerNotation: "defaultMarkers"
};

/**
 * DCR specific keyboard bindings.
 *
 * @param {CommandStack} commandStack
 * @param {EventBus} eventBus
 */
export default function DCRSettings(commandStack, eventBus) {
  this.settings = { ...defaultSettings };

  this.get = (key) => {
    return this.settings[key];
  };

  this.set = (key, value) => {
    commandStack.execute('settings.update', {
      settings: this.settings,
      key,
      value
    });
  };

  // Hook existing buttons into the settings
  const flowAppearanceButton = document.getElementById('js-dropdown-flow-appearance');
  flowAppearanceButton?.addEventListener('change', (e) => {
    this.set('markerNotation', e.target.value);
  });

  const colorToggle = document.getElementById('colorToggle');
  colorToggle?.addEventListener('change', (e) => {
    this.set('blackRelations', !e.target.checked);
  });

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
  console.log("Executing something over here!");
  context.oldValue = context.settings[context.key];
  context.settings[context.key] = context.value;
  console.log("got through");
  return this._elementRegistry.filter(function (element) {
    return is(element, 'dcr:Relation');
  });
};

UpdateSettingsHandler.prototype.revert = function (context) {
  context.settings[context.key] = context.oldValue;

  return this._elementRegistry.filter(function (element) {
    return is(element, 'dcr:Relation');
  });
};