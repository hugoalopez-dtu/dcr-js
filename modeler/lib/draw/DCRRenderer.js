import inherits from 'inherits-browser';
import { assign, isObject } from 'min-dash';
import { colorBlack, colorGrey, colorCondition, colorResponse, colorInclude, colorExclude, colorMilestone, svgGroup, getTransform } from './markers.js';

import {
  append as svgAppend,
  attr as svgAttr,
  classes as svgClasses,
  create as svgCreate,
} from 'tiny-svg';

import { createLine } from 'diagram-js/lib/util/RenderUtil';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import { getLabel } from '../features/label-editing/LabelUtil';

import { getBusinessObject, is } from '../util/ModelUtil';
import { query as domQuery } from 'min-dom';

import {
  getFillColor,
  getRectPath,
  getSemantic,
  getStrokeColor,
} from './DCRRendererUtil';
import * as DefaultMarkers from './DefaultMarkers';
import * as ProposedMarkers from './ProposedMarkers';
import * as NewMarkers from './newMarkers';
import Ids from 'ids';
import { settings } from '../features/settings/DCRSettings.js';

var RENDERER_IDS = new Ids();

var HIGH_FILL_OPACITY = 0.35;

var DEFAULT_TEXT_SIZE = 16;
var markers = {};

export default function DCRRenderer(
  config,
  eventBus,
  styles,
  pathMap,
  canvas,
  textRenderer,
  dcrSettings,
  priority,
) {
  BaseRenderer.call(this, eventBus, priority);

  var defaultFillColor = config && config.defaultFillColor,
    defaultStrokeColor = config && config.defaultStrokeColor;

  var rendererId = RENDERER_IDS.next();

  var computeStyle = styles.computeStyle;

  function drawRect(parentGfx, width, height, r, offset, attrs) {
    if (isObject(offset)) {
      attrs = offset;
      offset = 0;
    }

    offset = offset || 0;

    attrs = computeStyle(attrs, {
      fill: 'white',
    });

    var rect = svgCreate('rect');

    svgAttr(rect, {
      x: offset,
      y: offset,
      width: width - offset * 2,
      height: height - offset * 2,
      rx: r,
      ry: r,
    });

    svgAttr(rect, attrs);

    svgAppend(parentGfx, rect);

    return rect;
  }

  function drawPath(parentGfx, d, attrs) {
    attrs = computeStyle(attrs, ['no-fill'], {
      strokeWidth: 2,
    });

    var path = svgCreate('path');
    svgAttr(path, { d: d });
    svgAttr(path, attrs);

    svgAppend(parentGfx, path);

    return path;
  }

  function drawMarker(type, parentGfx, path, attrs) {
    return drawPath(parentGfx, path, assign({ 'data-marker': type }, attrs));
  }

  function renderer(type) {
    return handlers[type];
  }

  function renderLabel(parentGfx, label, options) {
    options = assign(
      {
        size: {
          width: 100,
        },
      },
      options
    );

    var text = textRenderer.createText(label || '', options);

    svgClasses(text).add('djs-label');

    svgAppend(parentGfx, text);

    return text;
  }

  function renderExternalLabel(parentGfx, element) {
    var box = {
      width: 90,
      height: 30,
      x: element.width / 2 + element.x,
      y: element.height / 2 + element.y,
    };

    return renderLabel(parentGfx, getLabel(element), {
      box: box,
      fitBox: true,
      style: assign({}, textRenderer.getExternalStyle(), {
        fill: 'black',
      }),
    });
  }

  function renderTitleLabel(parentGfx, element) {
    let semantic = getSemantic(element);
    let text = semantic.role || '';
    renderLabel(parentGfx, text, {
      box: {
        height: 30,
        width: element.width,
      },
      padding: 5,
      align: 'center-middle',
      style: {
        fill: defaultStrokeColor,
      },
    });
  }

  function renderDescription(parentGfx, element, align, topPadding) {
    var semantic = getSemantic(element);
    if (semantic.description) {
      renderLabel(parentGfx, semantic.description, {
        box: {
          height: element.height + topPadding,
          width: element.width,
        },
        padding: {
          top: 5 + topPadding,
          bottom: 5,
          left: 5,
          right: 5,
        },
        align: align,
        style: {
          fill: defaultStrokeColor,
        },
      });
    }
  }

  function getMarkers() {
    switch (settings.markerNotation) {
      case "DCR Solutions":
        return NewMarkers;
      case "TAL2023":
        return ProposedMarkers;
      case "HM2011":
        return DefaultMarkers;
    }
  }

  function addDivider(parentGfx, element, dashed = false) {
    drawLine(
      parentGfx,
      [
        { x: 0, y: 30 },
        { x: element.width, y: 30 },
      ],
      {
        stroke: getStrokeColor(element, defaultStrokeColor),
        'stroke-dasharray': dashed ? '12, 5' : undefined,
      }
    );
  }

  function drawLine(parentGfx, waypoints, attrs) {
    attrs = computeStyle(attrs, ['no-fill'], {
      stroke: 'black',
      strokeWidth: 2,
      fill: 'none',
    });

    var line = createLine(waypoints, attrs);

    svgAppend(parentGfx, line);

    return line;
  }

  function createPathFromConnection(connection) {
    var waypoints = connection.waypoints;

    var pathData = 'm  ' + waypoints[0].x + ',' + waypoints[0].y;
    for (var i = 1; i < waypoints.length; i++) {
      pathData += 'L' + waypoints[i].x + ',' + waypoints[i].y + ' ';
    }
    return pathData;
  }

  function marker(type, fill, stroke, startDirection, endDirection) {
    var id =
      type +
      '-' +
      colorEscape(fill) +
      '-' +
      colorEscape(stroke) +
      '-' +
      rendererId +
      '-' +
      startDirection +
      '-' +
      endDirection;

    if (!markers[id]) {
      getMarkers().createMarker(addMarker, id, type, fill, stroke, startDirection, endDirection);
    }

    return 'url(#' + id + ')';
  }

  function addMarker(id, options) {

    var attrs = assign(
      {
        fill: 'black',
        strokeWidth: 1,
        strokeLinecap: 'round',
        strokeDasharray: 'none',
      },
      options.attrs
    );
    var ref = options.ref || { x: 0, y: 0 };

    var scale = options.scale || 1;

    // fix for safari / chrome / firefox bug not correctly
    // resetting stroke dash array
    if (attrs.strokeDasharray === 'none') {
      attrs.strokeDasharray = [10000, 1];
    }

    var marker = svgCreate('marker');

    svgAttr(options.element, attrs);
    svgAppend(marker, options.element);

    svgAttr(marker, {
      id: id,
      viewBox: '0 0 20 20',
      refX: ref.x,
      refY: ref.y,
      markerWidth: 20 * scale,
      markerHeight: 20 * scale,
      //orient: '0deg',
      orient: "auto"
    });

    var defs = domQuery('defs', canvas._svg);

    if (!defs) {
      defs = svgCreate('defs');

      svgAppend(canvas._svg, defs);
    }

    svgAppend(defs, marker);

    markers[id] = marker;
  }

  function colorEscape(str) {
    // only allow characters and numbers
    return str.replace(/[^0-9a-zA-z]+/g, '_');
  }


  var handlers = (this.handlers = {
    'dcr:Event': function (parentGfx, element, attrs) {
      let included = element.businessObject.get('included');
      let pending = element.businessObject.get('pending');
      let executed = element.businessObject.get('executed');
      let enabled = element.businessObject.get('enabled');

      var rect = drawRect(
        parentGfx,
        element.width,
        element.height,
        7,
        assign({
          fill: getFillColor(element, defaultFillColor),
          fillOpacity: HIGH_FILL_OPACITY,
          stroke: enabled ? 'green' : getStrokeColor(element, defaultStrokeColor),
          strokeWidth: enabled ? 3 : 2,
          'stroke-dasharray': included ? undefined : '12, 5',
        }),
        attrs
      );

      addDivider(parentGfx, element, !included);

      renderTitleLabel(parentGfx, element);

      renderDescription(parentGfx, element, 'center-middle', 30);

      if (pending) {
        renderer('PendingMarker')(parentGfx, element);
      }

      if (executed) {
        renderer('ExecutedMarker')(parentGfx, element);
      }

      return rect;
    },
    'dcr:Nesting': function (parentGfx, element, attrs) {
      var rect = drawRect(
        parentGfx,
        element.width,
        element.height,
        7,
        assign({
          fill: getFillColor(element, defaultFillColor),
          fillOpacity: HIGH_FILL_OPACITY,
          stroke: getStrokeColor(element, defaultStrokeColor),
          strokeWidth: 2,
        }),
        attrs
      );

      addDivider(parentGfx, element);

      renderTitleLabel(parentGfx, element);

      renderDescription(parentGfx, element, 'center-top', 30);

      renderer('NestingMarker')(parentGfx, element);

      return rect;
    },
    'dcr:SubProcess': function (parentGfx, element, attrs) {

      let included = element.businessObject.get('included');
      let pending = element.businessObject.get('pending');
      let executed = element.businessObject.get('executed');
      let multiInstance = element.businessObject.get('multi-instance');

      var rect = drawRect(
        parentGfx,
        element.width,
        element.height,
        7,
        assign({
          fill: getFillColor(element, defaultFillColor),
          fillOpacity: HIGH_FILL_OPACITY,
          stroke: getStrokeColor(element, defaultStrokeColor),
          strokeWidth: 2,
          'stroke-dasharray': included ? undefined : '12, 5',
        }),
        attrs
      );

      renderDescription(parentGfx, element, 'center-top', 0);

      if (multiInstance) {
        renderer('MultiInstanceMarker')(parentGfx, element);
      } else {
        renderer('SubProcessMarker')(parentGfx, element);
      }

      if (pending) {
        renderer('PendingMarker')(parentGfx, element);
      }

      if (executed) {
        renderer('ExecutedMarker')(parentGfx, element);
      }


      return rect;
    },
    'dcr:Relation': function (parentGfx, element) {
      let type = element.businessObject.get('type');
      let violationColour = element.businessObject.get('violationColour');
      let inactive = element.businessObject.get('inactive');

      var pathData = createPathFromConnection(element);

      var fill = getFillColor(element, defaultFillColor),
        stroke = getStrokeColor(element, defaultStrokeColor);

      var Link = getSemantic(element);

      var path = drawPath(parentGfx, pathData, {
        strokeLinejoin: 'round',
        stroke,
      });

      // Determine direction of the arrow based on the connection waypoints
      let waypoints = element.waypoints;
      let start = waypoints[0];
      let startPrev = waypoints[1];

      let startDirection, endDirection;

      if (start.y == startPrev.y) {
        startDirection = start.x > startPrev.x ? 'right-to-left' : 'left-to-right';
      } else {
        startDirection = start.y > startPrev.y ? 'bottom-to-top' : 'top-to-bottom';
      }

      let end = waypoints[waypoints.length - 1];
      let endPrev = waypoints[waypoints.length - 2];

      if (end.y == endPrev.y) {
        endDirection = end.x > endPrev.x ? 'left-to-right' : 'right-to-left';
      } else {
        endDirection = end.y > endPrev.y ? 'top-to-bottom' : 'bottom-to-top';
      }

      let markers = getMarkers();

      if (type === 'condition') {
        markers.conditionMarker(marker, path,
          inactive ? colorGrey : violationColour ? violationColour : settings.blackRelations ? colorBlack : colorCondition, //yellow
          fill, startDirection, endDirection);
      } else if (type === 'response') {
        markers.responseMarker(marker, path,
          inactive ? colorGrey : violationColour ? violationColour : settings.blackRelations ? colorBlack : colorResponse, //blue
          fill, startDirection, endDirection);
      } else if (type === 'include') {
        markers.includeMarker(marker, path,
          inactive ? colorGrey : violationColour ? violationColour : settings.blackRelations ? colorBlack : colorInclude, //green
          fill, startDirection, endDirection);
      } else if (type === 'exclude') {
        markers.excludeMarker(marker, path,
          inactive ? colorGrey : violationColour ? violationColour : settings.blackRelations ? colorBlack : colorExclude, //red
          fill, startDirection, endDirection);
      } else if (type === 'milestone') {
        markers.milestoneMarker(marker, path,
          inactive ? colorGrey : violationColour ? violationColour : settings.blackRelations ? colorBlack : colorMilestone, //purple
          fill, startDirection, endDirection);
      } else if (type === 'spawn') {
        markers.spawnMarker(marker, path,
          settings.blackRelations ? colorBlack : "#4D6180", //green
          fill, startDirection, endDirection);
      }

      return path;
    },
    label: function (parentGfx, element) {
      return renderExternalLabel(parentGfx, element);
    },
    PendingMarker: function (parentGfx, element) {
      var markerPath = pathMap.getScaledPath('MARKER_PENDING', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: 6 / element.width,
          my: 60 / element.height,
        },
      });

      drawMarker('pending', parentGfx, markerPath, {
        fill: '#039BE5',   //sky blue
        stroke: '#039BE5',   //sky blue
      });
    },
    ExecutedMarker: function (parentGfx, element) {
      var markerPath = pathMap.getScaledPath('MARKER_EXECUTED', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: 15 / element.width,
          my: 50 / element.height,
        },
      });

      drawMarker('executed', parentGfx, markerPath, {
        strokeWidth: 1,
        fill: '#4CAF50',    //green
        stroke: '#4CAF50',    //green
      });
    },

    NestingMarker: function (parentGfx, element) {
      var markerPath = pathMap.getScaledPath('MARKER_NESTING', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: (element.width - 15) / element.width,
          my: (element.height - 5) / element.height,
        },
      });

      drawMarker('nesting', parentGfx, markerPath, {
        strokeWidth: 1,
        fill: 'grey',
        stroke: 'grey',
      });
    },

    SubProcessMarker: function (parentGfx, element) {
      var markerPath = pathMap.getScaledPath('MARKER_SUBPROCESS', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: (element.width - 15) / element.width,
          my: (element.height - 5) / element.height,
        },
      });

      drawMarker('subprocess', parentGfx, markerPath, {
        strokeWidth: 1,
        fill: 'grey',
        stroke: 'grey',
      });
    },
    MultiInstanceMarker: function (parentGfx, element) {
      var markerPath = pathMap.getScaledPath('MARKER_MULTI_INSTANCE', {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: element.width,
        containerHeight: element.height,
        position: {
          mx: ((element.width / 2) / element.width),
          my: (element.height - 20) / element.height
        }
      });

      drawMarker('multi-instance', parentGfx, markerPath, {
        strokeWidth: 2,
        fill: getFillColor(element, defaultFillColor),
        stroke: getStrokeColor(element, defaultStrokeColor)
      });
    },
  });
}

inherits(DCRRenderer, BaseRenderer);

DCRRenderer.$inject = [
  'config.odm',
  'eventBus',
  'styles',
  'pathMap',
  'canvas',
  'textRenderer',
  'dcrSettings'
];

DCRRenderer.prototype.canRender = function (element) {
  return is(element, 'dcr:BoardElement');
};


DCRRenderer.prototype.drawShape = function (parentGfx, element) {
  var type = element.type;
  var h = this.handlers[type];

  return h(parentGfx, element);

  // rest of the method code...
};

DCRRenderer.prototype.drawConnection = function (parentGfx, element) {
  var type = element.type;
  var h = this.handlers[type];

  /* jshint -W040 */
  return h(parentGfx, element);
};

DCRRenderer.prototype.getShapePath = function (element) {
  return getRectPath(element);
};

// helpers //////////

function getColor(element) {
  var bo = getBusinessObject(element);

  return bo.color || element.color;
}
