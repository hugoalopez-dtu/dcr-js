import { attr as svgAttr, create as svgCreate, innerSVG } from 'tiny-svg';
import { svgGroup, getTransform } from './markers.js';

export function conditionMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerEnd: marker('proposed-condition-flow-end', fill, strokeColor, startDirection, endDirection),
    markerStart: marker('proposed-condition-flow-start', strokeColor, strokeColor),
    stroke: strokeColor
  });
}

export function responseMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerStart: marker('proposed-response-flow-start', strokeColor, strokeColor),
    markerEnd: marker('proposed-response-flow-end', fill, strokeColor, startDirection, endDirection),
    stroke: strokeColor,
  });
}

export function includeMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerStart: marker('proposed-include-flow-start', strokeColor, strokeColor),
    markerEnd: marker('proposed-include-flow-end', fill, strokeColor, startDirection, endDirection),
    stroke: strokeColor
  });
}

export function excludeMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerStart: marker('proposed-exclude-flow-start', strokeColor, strokeColor),
    markerEnd: marker('proposed-exclude-flow-end', fill, strokeColor, startDirection, endDirection),
    stroke: strokeColor
  });
}

export function milestoneMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerEnd: marker('proposed-milestone-flow-end', fill, strokeColor, startDirection, endDirection),
    markerStart: marker('proposed-milestone-flow-start', fill, strokeColor, startDirection, endDirection),
    stroke: strokeColor
});
}


export function spawnMarker(marker, path, strokeColor, fill) {
  svgAttr(path, {
    markerEnd: marker('proposed-spawn-flow-end', '#4D6180', '#4D6180'),
    markerStart: marker('proposed-spawn-flow-start', '#4D6180', '#4D6180'),
    stroke: strokeColor
  });
}



//Create the proposed markers
export function createMarker(addMarker, id, type, fill, stroke, startDirection, endDirection) {
  if (type === 'proposed-response-flow-end') {

    // Outer element: Circle
    var responseflowEnd = svgCreate('circle');
    svgAttr(responseflowEnd, {
      cx: 10,
      cy: 10,
      r: 9,
    });

    // Inner element: Vertical line
    var verticalLine = svgCreate('path');
    svgAttr(verticalLine, {
      d: 'M12 0.8V5',
      'stroke-width': 2.3,
      'stroke-linecap': 'round',
      transform: 'translate(-2, 5)'
    });

    // Inner element: Dot
    var dot = svgCreate('circle');
    svgAttr(dot, {
      cx: 10,
      cy: 14,
      r: 0.21,
    });

    // Group the elements together
    var responseGroup = svgGroup([responseflowEnd, verticalLine, dot]);

    addMarker(id, {
      element: responseGroup,
      attrs: {
        stroke: stroke,
        'stroke-width': '2',
        fill: 'white',
        transform: getTransform(endDirection)
      },
      ref: {
        x: 21,
        y: 10
      },
      scale: 0.5
    });
  }

  if (type === 'proposed-response-flow-start') {
    var responseflowStart = svgCreate('path');
    svgAttr(responseflowStart, {

      d: 'M0 24V0L24 12L0 24Z',
      transform: 'scale(0.6)'

    });

    addMarker(id, {
      element: responseflowStart,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 0, y: 7.22 },
      scale: 0.5,
    });
  }

  if (type === 'proposed-exclude-flow-end') {

    // Outer element: Circle
    var excludeflowEnd = svgCreate('circle');
    svgAttr(excludeflowEnd, {
      cx: 10,
      cy: 10,
      r: 9,
    });

    // Inner element: Minus sign
    var minusSign = svgCreate('path');
    svgAttr(minusSign, {
      d: 'M16 12H10',
      fill: stroke,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      transform: 'translate(-3, -2)'
    });

    // Group the elements together
    var excludeGroup = svgGroup([excludeflowEnd, minusSign]);

    addMarker(id, {
      element: excludeGroup,
      attrs: {
        stroke: stroke,
        'stroke-width': '2',
        fill: 'white',
        transform: getTransform(endDirection)
      },
      ref: {
        x: 21,
        y: 10
      },
      scale: 0.5
    });
  }

  if (type === 'proposed-exclude-flow-start') {
    var excludeflowStart = svgCreate('path');
    svgAttr(excludeflowStart, {

      d: 'M0 24V0L24 12L0 24Z',
      transform: 'scale(0.6)'

    });

    addMarker(id, {
      element: excludeflowStart,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 0, y: 7.22 },
      scale: 0.5,
    });
  }

  if (type === 'proposed-include-flow-end') {

    // Outer element: Circle
    var includeflowEnd = svgCreate('circle');
    svgAttr(includeflowEnd, {
      cx: 10,
      cy: 10,
      r: 9,
    });

    // Inner element: Plus sign
    var plusSign = svgCreate('path');
    svgAttr(plusSign, {
      d: 'M16 12L8 12M12 16L12 8',
      fill: stroke,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      transform: 'translate(-2, -2)'
    });

    // Group the elements together
    var excludeGroup = svgGroup([includeflowEnd, plusSign]);

    addMarker(id, {
      element: excludeGroup,
      attrs: {
        stroke: stroke,
        'stroke-width': '2',
        fill: 'white',
        transform: getTransform(endDirection)
      },
      ref: {
        x: 21,
        y: 10
      },
      scale: 0.5
    });
  }

  if (type === 'proposed-include-flow-start') {
    var includeflowStart = svgCreate('path');
    svgAttr(includeflowStart, {

      d: 'M0 24V0L24 12L0 24Z',
      transform: 'scale(0.6)'

    });

    addMarker(id, {
      element: includeflowStart,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 0, y: 7.22 },
      scale: 0.5,
    });
  }

  if (type === 'proposed-condition-flow-end') {
    var circle = svgCreate('circle');
    svgAttr(circle, {
      cx: 10,
      cy: 10,
      r: 9,
      fill: 'white',
      stroke: stroke,
      strokeWidth: 2
    });

    var keyCircle = svgCreate('circle');
    svgAttr(keyCircle, {
      cx: 6.5,
      cy: 10,
      r: 2.1,
      stroke: stroke,
      strokeWidth: 2
    });

    var keyLine = svgCreate('path');
    svgAttr(keyLine, {
      d: "M9.5 10H12.5M15.5 12.5V10H12.5M12.5 10V12.5",
      stroke: stroke,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    });

    // Group the elements together
    var conditionGroup = svgGroup([circle, keyCircle, keyLine]);


    addMarker(id, {
      element: conditionGroup,
      scale: 0.5,
      attrs: {
        fill: fill,
        transform: getTransform(endDirection)
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'proposed-condition-flow-start') {
    var conditionflowStart = svgCreate('path');
    svgAttr(conditionflowStart, {

      d: 'M0 24V0L24 12L0 24Z',
      transform: 'scale(0.6)'

    });

    addMarker(id, {
      element: conditionflowStart,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 0, y: 7.22 },
      scale: 0.5,
    });
  }

  if (type === 'proposed-milestone-flow-end') {
    var circle = svgCreate('circle');
    svgAttr(circle, {
      cx: 10,
      cy: 10,
      r: 9,
      fill: 'white',
      stroke: stroke,
      strokeWidth: 2
    });

    var keyCircle = svgCreate('circle');
    svgAttr(keyCircle, {
      cx: 6.5,
      cy: 10,
      r: 2.1,
      stroke: stroke,
      strokeWidth: 2
    });

    var keyLine = svgCreate('path');
    svgAttr(keyLine, {
      d: "M9.5 10H12.5M15.5 12.5V10H12.5M12.5 10V12.5",
      stroke: stroke,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    });

    // Group the elements together
    var conditionGroup = svgGroup([circle, keyCircle, keyLine]);


    addMarker(id, {
      element: conditionGroup,
      scale: 0.5,
      attrs: {
        fill: fill,
        transform: getTransform(endDirection)
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'proposed-milestone-flow-start') {
    let triangle = svgCreate('path');
    svgAttr(triangle, {
      d: 'M3,1 l17,8.5 l-17,8.5 z',
      'stroke-width': '2',
      transform: 'scale(0.5)'
    });


    var exclTranslate;

    if (startDirection === 'right-to-left') {
      exclTranslate = 'translate(-14, -10.5)'
    } else if (startDirection === 'left-to-right') {
      exclTranslate = ''
    } else if (startDirection === 'top-to-bottom') {
      exclTranslate = 'translate(0.15,-12.2)';
    } else {
      exclTranslate = 'translate(-10.5, 1.8)';
    }

    // Inner element: Vertical line
    var verticalLine = svgCreate('path');
    svgAttr(verticalLine, {
      d: 'M3 2.7V4.8',
      'stroke-width': 1,
      'stroke-linecap': 'round',
    });

    // Inner element: Dot
    var dot = svgCreate('circle');
    svgAttr(dot, {
      cx: 3,
      cy: 6.5,
      r: 0.1,
    });

    var excl = svgGroup([verticalLine, dot]);
    svgAttr(excl, {
      transform: exclTranslate + " " + getTransform(startDirection)
    });


    // Group the elements together
    var milestoneGroup = svgGroup([triangle, excl]);

    addMarker(id, {
      element: milestoneGroup,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 1.5, y: 4.7 },
    });
  }

  if (type === 'proposed-spawn-flow-end') {
    var spawnflowEnd = svgCreate('path');
    svgAttr(spawnflowEnd, {

      d: 'M 13.85,5.21 C 14.23,5.49 14.60,5.34 14.67,4.87 14.67,4.87 14.98,2.83 14.98,2.83 15.06,2.35 15.17,' +
        '2.35 15.24,2.83 15.24,2.83 15.55,4.87 15.55,4.87 15.63,5.34 16.00,5.49 16.38,5.21 16.38,5.21 18.13,' +
        '3.92 18.13,3.92 18.51,3.64 18.60,3.73 18.32,4.11 18.32,4.11 17.04,5.89 17.04,5.89 16.77,6.27 16.92,' +
        '6.65 17.39,6.72 17.39,6.72 19.40,7.03 19.40,7.03 19.87,7.11 19.87,7.22 19.40,7.30 19.40,7.30 17.39,' +
        '7.61 17.39,7.61 16.92,7.68 16.77,8.06 17.04,8.44 17.04,8.44 18.32,10.22 18.32,10.22 18.60,10.60 18.51,' +
        '10.69 18.13,10.41 18.13,10.41 16.38,9.12 16.38,9.12 16.00,8.84 15.63,8.99 15.55,9.46 15.55,9.46 15.24,' +
        '11.50 15.24,11.50 15.17,11.98 15.06,11.98 14.98,11.50 14.98,11.50 14.67,9.46 14.67,9.46 14.60,8.99 14.23,' +
        '8.84 13.85,9.12 13.85,9.12 12.10,10.41 12.10,10.41 11.72,10.69 11.65,10.61 11.94,10.24 11.94,10.24 13.39,' +
        '8.42 13.39,8.42 13.69,8.05 13.55,7.69 13.08,7.62 13.08,7.62 10.78,7.30 10.78,7.30 10.32,7.24 10.32,7.12 10.78,' +
        '7.05 10.78,7.05 12.84,6.72 12.84,6.72 13.31,6.65 13.46,6.27 13.19,5.89 13.19,5.89 11.91,4.11 11.91,4.11 11.63,' +
        '3.73 11.72,3.64 12.10,3.92 12.10,3.92 13.85,5.21 13.85,5.21 Z M 10.60,7.18 C 10.60,7.18 5.30,9.56 5.30,9.56 5.30,' +
        '9.56 -0.00,11.94 -0.00,11.94 -0.00,11.94 0.01,7.16 0.01,7.16 0.01,7.16 0.03,2.37 0.03,2.37 0.03,2.37 5.31,' +
        '4.77 5.31,4.77 5.31,4.77 10.60,7.18 10.60,7.18 Z',

    });

    addMarker(id, {
      element: spawnflowEnd,
      attrs: {
        fill: fill,
        stroke: stroke,
      },
      ref: { x: 21.2, y: 7.2 },
      scale: 0.6,
    });
  }


  if (type === 'proposed-spawn-flow-start') {
    var spawnflowStart = svgCreate('path');
    svgAttr(spawnflowStart, {

      d: 'M0 24V0L24 12L0 24Z',
      transform: 'scale(0.6)'

    });

    addMarker(id, {
      element: spawnflowStart,
      attrs: {
        fill: fill,
        stroke: stroke,
        'stroke-linecap': 'round',
      },
      ref: { x: 0, y: 7.22 },
      scale: 0.5,
    });
  }
}