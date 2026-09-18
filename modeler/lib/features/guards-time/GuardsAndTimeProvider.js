import { is, getBusinessObject } from '../../util/ModelUtil';
import { validateGuardSyntax } from 'dcr-engine';

var VALID_DURATION = /^P(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/;

export default function GuardsAndTimeProvider(
  eventBus, canvas, modeling, contextPad, elementRegistry, moddle
) {
  this._canvas = canvas;
  this._modeling = modeling;
  this._elementRegistry = elementRegistry;
  this._moddle = moddle;
  this._panel = null;
  this._backdrop = null;

  contextPad.registerProvider(this);

  var self = this;

  eventBus.on([
    'canvas.viewbox.changed',
    'element.remove',
    'diagram.destroy',
  ], function() {
    self._closePanel();
  });
}

GuardsAndTimeProvider.$inject = [
  'eventBus', 'canvas', 'modeling', 'contextPad', 'elementRegistry', 'moddle'
];

// ── Context pad entries ────────────────────────────────────────────────────

GuardsAndTimeProvider.prototype.getContextPadEntries = function(element) {
  var self = this;
  var actions = {};

  if (is(element, 'dcr:Relation')) {
    actions['edit-relation-constraints'] = {
      group: 'annotate',
      className: 'bpmn-icon-script-task',
      title: 'Edit time constraint / guard',
      action: {
        click: function(evt, el) {
          evt.stopPropagation();
          self.openRelationPanel(el);
        }
      }
    };
  }

  if (is(element, 'dcr:Event')) {
    actions['edit-variables'] = {
      group: 'annotate',
      className: 'bpmn-icon-data-store',
      title: 'Edit data variables',
      action: {
        click: function(evt, el) {
          evt.stopPropagation();
          self.openEventVariablesPanel(el);
        }
      }
    };
  }

  return actions;
};

// ── Panel helpers ──────────────────────────────────────────────────────────

GuardsAndTimeProvider.prototype._closePanel = function() {
  if (this._backdrop && this._backdrop.parentNode) {
    this._backdrop.parentNode.removeChild(this._backdrop);
  }
  if (this._panel && this._panel.parentNode) {
    this._panel.parentNode.removeChild(this._panel);
  }
  if (this._tooltip && this._tooltip.parentNode) {
    this._tooltip.parentNode.removeChild(this._tooltip);
  }
  this._backdrop = null;
  this._panel = null;
  this._tooltip = null;
};

GuardsAndTimeProvider.prototype._makePanel = function() {
  this._closePanel();

  var self = this;

  // Transparent backdrop — clicking outside closes the panel
  var backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;';
  backdrop.addEventListener('click', function() { self._closePanel(); });
  document.body.appendChild(backdrop);
  this._backdrop = backdrop;

  var panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    'background:white',
    'border:1px solid #ccc',
    'border-radius:8px',
    'padding:18px',
    'box-shadow:0 8px 28px rgba(0,0,0,0.25)',
    'z-index:10000',
    'min-width:310px',
    'font-family:sans-serif',
    'font-size:13px',
    'color:#333',
  ].join(';');
  // Stop clicks on the panel from reaching the backdrop
  panel.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  panel.addEventListener('click',     function(e) { e.stopPropagation(); });
  document.body.appendChild(panel);
  this._panel = panel;

  var tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position:fixed',
    'background:#333',
    'color:white',
    'font-size:11px',
    'padding:5px 8px',
    'border-radius:4px',
    'pointer-events:none',
    'z-index:10001',
    'max-width:240px',
    'line-height:1.5',
    'display:none',
  ].join(';');
  document.body.appendChild(tooltip);
  this._tooltip = tooltip;

  return panel;
};

// ── Relation panel (time constraint + guard) ───────────────────────────────

GuardsAndTimeProvider.prototype.openRelationPanel = function(element) {
  var self = this;
  var bo = getBusinessObject(element);
  var relType = bo.get('type');
  var hasTime = relType === 'condition' || relType === 'response';
  var timeLabel = relType === 'condition' ? 'Delay' : 'Deadline';

  var titleText = 'Relation Constraints';

  var panel = this._makePanel();

  panel.innerHTML =
    '<div style="font-weight:700;font-size:14px;margin-bottom:14px">' + titleText + '</div>' +
    (hasTime
      ? '<div style="margin-bottom:12px">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
            '<label style="font-weight:600">' + timeLabel + '</label>' +
            '<span id="_info_time_btn" data-tooltip="ISO 8601 duration — e.g. P3D (3 days), PT2H (2 hours), PT30M (30 min). Leave blank to clear." style="cursor:default;color:#aaa;font-size:13px;line-height:1;user-select:none">ⓘ</span>' +
          '</div>' +
          '<input id="_ann_time" type="text" value="' + _esc(bo.get('time') || '') + '"' +
            ' placeholder="e.g. P3D, PT2H30M"' +
            ' style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px"/>' +
        '</div>'
      : '') +
    '<div style="margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        '<label style="font-weight:600">Guard</label>' +
        '<span id="_info_guard_btn" data-tooltip="FEEL expression — e.g. amount > 0, status = &quot;ok&quot;. Leave blank to clear." style="cursor:default;color:#aaa;font-size:13px;line-height:1;user-select:none">ⓘ</span>' +
      '</div>' +
      '<input id="_ann_guard" type="text" value="' + _esc(bo.get('guard') || '') + '"' +
        ' placeholder="e.g. amount > 0"' +
        ' style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px"/>' +
    '</div>' +
    '<div id="_ann_err" style="color:#dc3545;font-size:11px;min-height:16px;margin-bottom:6px"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button id="_ann_cancel" style="padding:6px 14px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:white">Cancel</button>' +
      '<button id="_ann_save" style="padding:6px 14px;border:none;border-radius:4px;cursor:pointer;background:#28a745;color:white;font-weight:bold">Save</button>' +
    '</div>';

  // Wire up ⓘ hover tooltips
  var tooltip = this._tooltip;
  ['time', 'guard'].forEach(function(key) {
    var btn = panel.querySelector('#_info_' + key + '_btn');
    if (!btn) return;
    btn.addEventListener('mouseenter', function() {
      tooltip.textContent = btn.dataset.tooltip;
      tooltip.style.display = 'block';
      var rect = btn.getBoundingClientRect();
      tooltip.style.left = Math.round(rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
      tooltip.style.top  = Math.round(rect.bottom + 6) + 'px';
    });
    btn.addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
    });
  });

  setTimeout(function() {
    var first = panel.querySelector('#_ann_time') || panel.querySelector('#_ann_guard');
    if (first) first.focus();
  }, 30);

  var errEl = panel.querySelector('#_ann_err');

  panel.querySelector('#_ann_cancel').addEventListener('click', function() {
    self._closePanel();
  });

  function save() {
    errEl.textContent = '';
    var props = {};

    if (hasTime) {
      var timeVal = (panel.querySelector('#_ann_time').value || '').trim();
      if (timeVal && (!VALID_DURATION.test(timeVal) || timeVal === 'P' || timeVal === 'PT')) {
        errEl.textContent = 'Invalid ISO 8601 duration — examples: P3D, PT2H, PT30M, P1DT12H';
        return;
      }
      props.time = timeVal || undefined;
    }

    var guardVal = (panel.querySelector('#_ann_guard').value || '').trim();
    var guardErr = self._validateGuard(guardVal);
    if (guardErr) { errEl.textContent = guardErr; return; }
    props.guard = guardVal || undefined;

    self._modeling.updateProperties(element, props);
    self._closePanel();
  }

  panel.querySelector('#_ann_save').addEventListener('click', save);

  panel.addEventListener('keydown', function(e) {
    e.stopPropagation();
    if (e.key === 'Escape') self._closePanel();
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') save();
  });
};

// ── Event variables panel ─────────────────────────────────────────────────

GuardsAndTimeProvider.prototype.openEventVariablesPanel = function(element) {
  var self = this;
  var bo = getBusinessObject(element);

  var existing = bo.get('eventData');
  var editVar = existing
    ? { name: String(existing.name || ''), type: String(existing.type || 'String'), default: existing['default'] !== undefined ? String(existing['default']) : '' }
    : null;

  var panel = this._makePanel();
  panel.style.minWidth = '340px';

  function defaultFieldHtml(v) {
    if (v.type === 'Int') {
      return (
        '<div style="display:flex;align-items:stretch;border:1px solid #ccc;border-radius:4px;overflow:hidden;margin-top:8px">' +
          '<button id="_var_dec" style="padding:4px 10px;border:none;border-right:1px solid #ccc;cursor:pointer;background:#f5f5f5;font-size:15px;line-height:1">&#x2212;</button>' +
          '<input id="_var_default" type="number" value="' + _esc(v.default || '') + '"' +
            ' placeholder="default"' +
            ' style="flex:1;min-width:0;padding:5px 4px;border:none;text-align:center;font-size:13px;-moz-appearance:textfield"/>' +
          '<button id="_var_inc" style="padding:4px 10px;border:none;border-left:1px solid #ccc;cursor:pointer;background:#f5f5f5;font-size:15px;line-height:1">&#x2b;</button>' +
        '</div>'
      );
    }
    if (v.type === 'Bool') {
      return (
        '<select id="_var_default" style="width:100%;margin-top:8px;padding:5px 4px;border:1px solid #ccc;border-radius:4px;font-size:13px">' +
          '<option value=""'      + (!v.default             ? ' selected' : '') + '></option>' +
          '<option value="true"'  + (v.default === 'true'  ? ' selected' : '') + '>true</option>' +
          '<option value="false"' + (v.default === 'false' ? ' selected' : '') + '>false</option>' +
        '</select>'
      );
    }
    return (
      '<input id="_var_default" type="text" value="' + _esc(v.default || '') + '"' +
        ' placeholder="default (optional)"' +
        ' style="width:100%;box-sizing:border-box;margin-top:8px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px"/>'
    );
  }

  function render() {
    panel.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:14px">' +
        'Data Variable &mdash; ' + _esc(bo.get('description') || bo.id) +
      '</div>' +
      (editVar
        ? '<div style="margin-bottom:12px">' +
            '<label style="font-weight:600;display:block;margin-bottom:4px">Name</label>' +
            '<input id="_var_name" type="text" value="' + _esc(editVar.name) + '"' +
              ' placeholder="variable name"' +
              ' style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px"/>' +
            '<label style="font-weight:600;display:block;margin-top:8px;margin-bottom:4px">Type</label>' +
            '<select id="_var_type" style="width:100%;padding:5px 4px;border:1px solid #ccc;border-radius:4px;font-size:13px">' +
              '<option value="String"' + (editVar.type === 'String' ? ' selected' : '') + '>String</option>' +
              '<option value="Int"'    + (editVar.type === 'Int'    ? ' selected' : '') + '>Int</option>' +
              '<option value="Bool"'   + (editVar.type === 'Bool'   ? ' selected' : '') + '>Bool</option>' +
            '</select>' +
            '<label style="font-weight:600;display:block;margin-top:8px;margin-bottom:4px">Default</label>' +
            defaultFieldHtml(editVar) +
            '<button id="_var_clear" style="margin-top:10px;padding:4px 10px;border:1px solid #dc3545;border-radius:4px;cursor:pointer;background:white;color:#dc3545;font-size:12px">Remove variable</button>' +
          '</div>'
        : '<button id="_var_add" style="padding:4px 12px;border:1px solid #2196F3;border-radius:4px;' +
            'cursor:pointer;background:white;color:#2196F3;margin-bottom:14px">+ Add Variable</button>') +
      '<div id="_var_err" style="color:#dc3545;font-size:11px;min-height:16px;margin-bottom:6px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="_var_cancel" style="padding:6px 14px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:white">Cancel</button>' +
        '<button id="_var_save" style="padding:6px 14px;border:none;border-radius:4px;cursor:pointer;background:#28a745;color:white;font-weight:bold">Save</button>' +
      '</div>';

    if (editVar) {
      panel.querySelector('#_var_name').addEventListener('input', function() { editVar.name = this.value; });
      panel.querySelector('#_var_type').addEventListener('change', function() {
        editVar.type = this.value;
        editVar.default = '';
        render();
      });
      panel.querySelector('#_var_default').addEventListener('input', function() { editVar.default = this.value; });
      panel.querySelector('#_var_default').addEventListener('change', function() { editVar.default = this.value; });

      var decBtn = panel.querySelector('#_var_dec');
      if (decBtn) decBtn.addEventListener('click', function() {
        editVar.default = String((parseInt(editVar.default || '0', 10)) - 1);
        render();
      });
      var incBtn = panel.querySelector('#_var_inc');
      if (incBtn) incBtn.addEventListener('click', function() {
        editVar.default = String((parseInt(editVar.default || '0', 10)) + 1);
        render();
      });

      panel.querySelector('#_var_clear').addEventListener('click', function() {
        editVar = null;
        render();
      });
    } else {
      panel.querySelector('#_var_add').addEventListener('click', function() {
        editVar = { name: '', type: 'String', default: '' };
        render();
        setTimeout(function() { var n = panel.querySelector('#_var_name'); if (n) n.focus(); }, 0);
      });
    }

    panel.querySelector('#_var_cancel').addEventListener('click', function() { self._closePanel(); });

    panel.querySelector('#_var_save').addEventListener('click', function() {
      if (!editVar) {
        self._modeling.updateProperties(element, { eventData: undefined });
        self._closePanel();
        return;
      }
      var name = editVar.name.trim();
      var errEl = panel.querySelector('#_var_err');
      if (!name) {
        if (errEl) errEl.textContent = 'Variable name is required.';
        return;
      }
      if (self._isVariableNameTakenElsewhere(name, element)) {
        if (errEl) errEl.textContent = 'Variable "' + name + '" is already declared on another event.';
        return;
      }
      var obj = self._moddle.create('dcr:EventData', { name: name, type: editVar.type });
      if ((editVar.default || '').trim()) obj['default'] = editVar.default.trim();
      self._modeling.updateProperties(element, { eventData: obj });
      self._closePanel();
    });
  }

  render();

  panel.addEventListener('keydown', function(e) {
    e.stopPropagation();
    if (e.key === 'Escape') self._closePanel();
  });
};

// ── Utility ───────────────────────────────────────────────────────────────

var FEEL_KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);

function extractGuardVarNames(guardVal) {
  var stripped = guardVal.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  var names = new Set();
  var m;
  var pat = /[A-Za-z_][A-Za-z0-9_]*/g;
  while ((m = pat.exec(stripped)) !== null) {
    if (!FEEL_KEYWORDS.has(m[0])) names.add(m[0]);
  }
  return names;
}

GuardsAndTimeProvider.prototype._allVariableNames = function() {
  var names = new Set();
  this._elementRegistry.filter(function(el) {
    return el.type === 'dcr:Event';
  }).forEach(function(el) {
    var bo = getBusinessObject(el);
    var v = bo.get('eventData');
    if (v && v.name) names.add(v.name);
  });
  return names;
};

GuardsAndTimeProvider.prototype._isVariableNameTakenElsewhere = function(name, element) {
  return this._elementRegistry.filter(function(el) {
    return el.type === 'dcr:Event' && el !== element;
  }).some(function(el) {
    var v = getBusinessObject(el).get('eventData');
    return v && v.name === name;
  });
};

GuardsAndTimeProvider.prototype._validateGuard = function(guardVal) {
  if (!guardVal) return null;
  var syntaxErr = validateGuardSyntax(guardVal);
  if (syntaxErr) return syntaxErr;
  var knownVars = this._allVariableNames();
  var usedVars = extractGuardVarNames(guardVal);
  if (usedVars.size === 0) {
    return 'Guard must reference at least one variable (e.g. amount > 0, delay>=2 and distance<=1500)';
  }
  for (var name of usedVars) {
    if (!knownVars.has(name)) {
      return 'Variable "' + name + '" is not defined on any event in this graph.';
    }
  }
  return null;
};

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
