import { create as svgCreate } from 'tiny-svg';

// Colors of relations
export var colorCondition = "#FEA00F"
export var colorResponse = "#2192FF"
export var colorInclude = "#2CA81A"
export var colorExclude = "#FB1818"
export var colorMilestone = "#A932D0"
export var colorBlack = "#000000"
export var colorGrey = "#cccccc"

export function svgAppend(parent, child) {
    parent.appendChild(child);
}

export function svgGroup(elements) {
    var group = svgCreate('g');
    elements.forEach(function (element) {
        svgAppend(group, element);
    });
    return group;
}

export function getTransform(direction) {
    var transform = direction === 'left-to-right' ? '' :
        direction === 'right-to-left' ? 'rotate(180, 10, 10)' :
            direction === 'top-to-bottom' ? 'rotate(270, 10, 10)' :
                direction === 'bottom-to-top' ? 'rotate(90, 10, 10)' : '';
    return transform;
}

export function makeAntiTransform(direction) {
    var antiTransform = direction === 'left-to-right' ? '' :  // No rotation needed
        direction === 'right-to-left' ? 'rotate(180, 10, 10)' :  // 180 is its own inverse
            direction === 'top-to-bottom' ? 'rotate(90, 10, 10)' :  // Reverse 270 degrees
                direction === 'bottom-to-top' ? 'rotate(270, 10, 10)' : '';  // Reverse 90 degrees
    return antiTransform;
}