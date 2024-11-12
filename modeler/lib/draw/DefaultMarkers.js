import { attr as svgAttr, create as svgCreate, transform } from 'tiny-svg';
import { svgGroup, getTransform } from './markers.js';

export function conditionMarker(marker, path, strokeColor) {
  svgAttr(path, {
    markerEnd: marker('default-condition-flow-end', strokeColor, strokeColor),
    stroke: strokeColor,
  });
}

export function responseMarker(marker, path, strokeColor) {
  svgAttr(path, {
    markerStart: marker('default-response-flow-start', strokeColor, strokeColor),
    markerEnd: marker('default-response-flow-end', strokeColor, strokeColor),
    stroke: strokeColor
  });
}

export function includeMarker(marker, path, strokeColor) {
  svgAttr(path, {
    markerEnd: marker('default-include-flow-end', strokeColor, strokeColor),
    stroke: strokeColor
  });
}

export function excludeMarker(marker, path, strokeColor, fill, startDirection, endDirection) {
  svgAttr(path, {
    markerEnd: marker('default-exclude-flow-end', strokeColor, strokeColor, startDirection, endDirection),
    stroke: strokeColor
  });
}

export function milestoneMarker(marker, path, strokeColor) {
  svgAttr(path, {
    markerEnd: marker('default-milestone-flow-end', strokeColor, strokeColor),
    stroke: strokeColor
  });
}

export function spawnMarker(marker, path, strokeColor) {
  svgAttr(path, {
    markerEnd: marker('default-spawn-flow-end', '#4D6180', '#4D6180'),
    stroke: strokeColor
  });
}

export function createMarker(addMarker, id, type, fill, stroke, startDirection, endDirection) {
  
  if (type === 'default-response-flow-end') {
    var background = svgCreate('rect');
    svgAttr(background, {
      x: 18,
      y: 9.15,
      width: 2,
      height: 1.7,
      fill: 'white',
    });

    var arrowHead = svgCreate('path');
    svgAttr(arrowHead, {
      d: "M10 14.5L10 5.5L20 10L10 14.5Z",
    });

    var responseGroup = svgGroup([background, arrowHead]);

    addMarker(id, {
      element: responseGroup,
      scale: 0.8,
      attrs: {
        fill: fill,
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'default-response-flow-start') {
    var circle = svgCreate('circle');
    svgAttr(circle, {
      cx: 4,
      cy: 10,
      r: 4
    });

    addMarker(id, {
      element: circle,
      scale: 0.8,
      attrs: {
        fill: fill,
      },
      ref: { x: -0.65, y: 10 },
    });
  }



  if (type === 'default-exclude-flow-end') {
    var percentTranslate;

    if (endDirection === 'right-to-left') {
      percentTranslate = 'translate(12.1, 0)'
    } else if (endDirection === 'left-to-right') {
      percentTranslate = ''
    } else if (endDirection === 'top-to-bottom') {
      percentTranslate = 'translate(6,6.5)';
    } else {
      percentTranslate = 'translate(6, -6)';
    }

    var background = svgCreate('rect');
    svgAttr(background, {
      x: 8,
      y: 9.15,
      width: 12,
      height: 1.7,
      fill: 'white',
    });
    
    var arrowHead = svgCreate('path');
    svgAttr(arrowHead, {
      d: "M2 14.5L2 5.5L12 10L2 14.5Z",
    });

    var percentSign = svgCreate('path');
    svgAttr(percentSign, {
      d: "M13.8 9.6C14.7941 9.6 15.6 8.79411 15.6 7.8C15.6 6.80589 14.7941 6 13.8 6C12.8059 6 12 6.80589 12 7.8C12 8.79411 12.8059 9.6 13.8 9.6ZM13.8 8.4C14.1314 8.4 14.4 8.13137 14.4 7.8C14.4 7.46863 14.1314 7.2 13.8 7.2C13.4686 7.2 13.2 7.46863 13.2 7.8C13.2 8.13137 13.4686 8.4 13.8 8.4ZM12.9485 13.9647L12.1 13.1162L19.1162 6.1L19.9647 6.94852L12.9485 13.9647ZM20 12.2C20 13.1941 19.1941 14 18.2 14C17.2059 14 16.4 13.1941 16.4 12.2C16.4 11.2059 17.2059 10.4 18.2 10.4C19.1941 10.4 20 11.2059 20 12.2ZM18.8 12.2C18.8 12.5314 18.5314 12.8 18.2 12.8C17.8686 12.8 17.6 12.5314 17.6 12.2C17.6 11.8686 17.8686 11.6 18.2 11.6C18.5314 11.6 18.8 11.8686 18.8 12.2Z",
      fillRule: "evenodd",
      clipRule: "evenodd"
    });

    svgAttr(percentSign, {
      transform: percentTranslate + " " + getTransform(endDirection)
    });

    var excludeGroup = svgGroup([background, arrowHead, percentSign]);

    addMarker(id, {
      element: excludeGroup,
      scale: 0.8,
      attrs: {
        fill: fill
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'default-include-flow-end') {
    var background = svgCreate('rect');
    svgAttr(background, {
      x: 8,
      y: 9.15,
      width: 12,
      height: 1.7,
      fill: 'white',
    });

    var plus = svgCreate('path');
    svgAttr(plus, {
      d: "M20 10.7H16.7V14H15.3V10.7H12L12 9.3H15.3V6L16.7 6V9.3H20V10.7Z",
    });

    var arrowHead = svgCreate('path');
    svgAttr(arrowHead, {
      d: "M2 14.5L2 5.5L12 10L2 14.5Z",
    });

    var includeGroup = svgGroup([background, arrowHead, plus]);

    addMarker(id, {
      element: includeGroup,
      scale: 0.8,
      attrs: {
        fill: fill,
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'default-condition-flow-end') {
    var background = svgCreate('rect');
    svgAttr(background, {
      x: 9,
      y: 9.15,
      width: 4,
      height: 1.7,
      fill: 'white',
    });

    var circle = svgCreate('circle');
    svgAttr(circle, {
      cx: 16,
      cy: 10,
      r: 4
    });

    var arrowHead = svgCreate('path');
    svgAttr(arrowHead, {
      d: "M2 14.5L2 5.5L12 10L2 14.5Z",
    });

    var conditionGroup = svgGroup([background, circle, arrowHead]);

    addMarker(id, {
      element: conditionGroup,
      scale: 0.8,
      attrs: {
        fill: fill,
      },
      ref: { x: 20.65, y: 10 },
    });
  }

  if (type === 'default-milestone-flow-end') {
    var background = svgCreate('rect');
    svgAttr(background, {
      x: 8,
      y: 9.15,
      width: 12,
      height: 1.7,
      fill: 'white',
    });

    var squareBorder = svgCreate('path');
    svgAttr(squareBorder, {
      d: "M10 9.99925L14.9992 5L19.9985 9.99925L14.9992 14.9985L10 9.99925Z"
    });

    var squareFill = svgCreate('path');
    svgAttr(squareFill, {
      d: "M11.98 9.99919L14.9993 6.97985L18.0187 9.99919L14.9993 13.0185L11.98 9.99919Z",
      fill: 'white'
    });

    var arrowHead = svgCreate('path');
    svgAttr(arrowHead, {
      d: "M-4.801e-07 14.5L-8.66976e-08 5.5L10 10L-4.801e-07 14.5Z",
    });

    var milestoneGroup = svgGroup([background, arrowHead, squareBorder, squareFill]);

    addMarker(id, {
      element: milestoneGroup,
      scale: 0.8,
      attrs: {
        fill: fill,
      },
      ref: { x: 20.65, y: 10 },
    });
  }

    
  if (type === 'default-spawn-flow-end') {
    var spawnflowEnd = svgCreate('path');
    svgAttr(spawnflowEnd, {

      d: 'M 13.85,5.21 C 14.23,5.49 14.60,5.34 14.67,4.87 14.67,4.87 14.98,2.83 14.98,2.83 15.06,2.35 15.17,'+
      '2.35 15.24,2.83 15.24,2.83 15.55,4.87 15.55,4.87 15.63,5.34 16.00,5.49 16.38,5.21 16.38,5.21 18.13,'+
      '3.92 18.13,3.92 18.51,3.64 18.60,3.73 18.32,4.11 18.32,4.11 17.04,5.89 17.04,5.89 16.77,6.27 16.92,'+
      '6.65 17.39,6.72 17.39,6.72 19.40,7.03 19.40,7.03 19.87,7.11 19.87,7.22 19.40,7.30 19.40,7.30 17.39,'+
      '7.61 17.39,7.61 16.92,7.68 16.77,8.06 17.04,8.44 17.04,8.44 18.32,10.22 18.32,10.22 18.60,10.60 18.51,'+
      '10.69 18.13,10.41 18.13,10.41 16.38,9.12 16.38,9.12 16.00,8.84 15.63,8.99 15.55,9.46 15.55,9.46 15.24,'+
      '11.50 15.24,11.50 15.17,11.98 15.06,11.98 14.98,11.50 14.98,11.50 14.67,9.46 14.67,9.46 14.60,8.99 14.23,'+
      '8.84 13.85,9.12 13.85,9.12 12.10,10.41 12.10,10.41 11.72,10.69 11.65,10.61 11.94,10.24 11.94,10.24 13.39,'+
      '8.42 13.39,8.42 13.69,8.05 13.55,7.69 13.08,7.62 13.08,7.62 10.78,7.30 10.78,7.30 10.32,7.24 10.32,'+
      '7.12 10.78,7.05 10.78,7.05 12.84,6.72 12.84,6.72 13.31,6.65 13.46,6.27 13.19,5.89 13.19,5.89 11.91,'+
      '4.11 11.91,4.11 11.63,3.73 11.72,3.64 12.10,3.92 12.10,3.92 13.85,5.21 13.85,5.21 Z M 10.60,7.18 C 10.60,'+
      '7.18 5.30,9.56 5.30,9.56 5.30,9.56 -0.00,11.94 -0.00,11.94 -0.00,11.94 0.01,7.16 0.01,7.16 0.01,7.16 0.03,'+
      '2.37 0.03,2.37 0.03,2.37 5.31,4.77 5.31,4.77 5.31,4.77 10.60,7.18 10.60,7.18 Z',

 
    });

    addMarker(id, {
      element: spawnflowEnd,
      attrs: {
        fill: fill,
        stroke: stroke,
        strokeLinecap: 'butt',
      },
      ref: { x: 21.2, y: 7.2 },
      scale: 0.6,
    });
  }
}