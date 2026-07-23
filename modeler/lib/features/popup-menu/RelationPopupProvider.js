import inherits from 'inherits';

/**
 * @class
 * @implements {PopupMenuProvider}
 */
export default function DCRPopupProvider(
   popupMenu, modeling, moddle, 
   dcrReplace, rules, translate, dcrRules
) {

  this._popupMenu = popupMenu;
  this._modeling = modeling;
  this._moddle = moddle;
  this._dcrReplace = dcrReplace;
  this._rules = rules;
  this._translate = translate;
  this._dcrRules = dcrRules;

  this.register();
}


DCRPopupProvider.$inject = [

  'popupMenu',
  'modeling',
  'moddle',
  'dcrReplace',
  'rules',
  'translate',
  'dcrRules'
];

DCRPopupProvider.prototype.getHeaderEntries = function(element) {
  return [];
};

DCRPopupProvider.prototype.getEntries = function(element) {
  const type = element.businessObject.get('type');

  let self = this;
  
  const entries = [
    {
      id: 'toggle-condition-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Condition Relation',
      flowType: 'condition',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType
        });
      },
    },
    {
      id: 'toggle-response-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Response Relation',
      flowType: 'response',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType
        });
      },
    },
    {
      id: 'toggle-include-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Include Relation',
      flowType: 'include',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType,
          time: undefined
        });
      },
    },
    {
      id: 'toggle-exclude-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Exclude Relation',
      flowType: 'exclude',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType,
          time: undefined
        });
      },
    },
    {
      id: 'toggle-milestone-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Milestone Relation',
      flowType: 'milestone',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType,
          time: undefined
        });
      },
    },
    {
      id: 'toggle-spawn-flow',
      //className: 'bpmn-icon-intermediate-event-none',
      label: 'Spawn Relation',
      flowType: 'spawn',
      action: (event, entry) => {
        self._modeling.updateProperties(element, {
          type: entry.flowType,
          time: undefined
        });
      },
    }
  ];

  return entries.filter(entry => self._dcrRules.isLinkAllowed(element, entry.flowType));
};


DCRPopupProvider.prototype.register = function() {
  this._popupMenu.registerProvider('dcr-link-popup', this);
}; 