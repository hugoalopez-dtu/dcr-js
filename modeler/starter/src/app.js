import $ from 'jquery';

import './assets/odm.css';
import 'diagram-js/assets/diagram-js.css';
import 'bpmn-font/dist/css/bpmn.css';

import { setSimulating as keyBindingsSetSimulating } from '../../lib/features/keyboard/DCRKeyboardBindings';
import { getPendingEvents } from '../../../modeler/lib/simulator/simulator.ts';

import DCRModeler from 'dcr-graph-diagram-modeler';

import emptyBoardXML from './resources/emptyBoard.xml?raw';
import sampleBoardXML from './resources/sampleBoard.xml?raw';

// modeler instance
var modeler = new DCRModeler({
  container: '#canvas',
  keyboard: {
    bindTo: window,
  },
});

/* screen interaction */
function enterFullscreen(element) {
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if (element.mozRequestFullScreen) {
    element.mozRequestFullScreen();
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.mozCancelFullScreen) {
    document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

const state = {
  fullScreen: false,
  keyboardHelp: false,
  examples: false,
};
document
  .getElementById('js-open-examples')
  .addEventListener('click', function () {
    state.examples = !state.examples;
    let displayProp = 'none';
    if (state.examples) {
      displayProp = 'block';
    }
    document.getElementById('io-dialog-examples').style.display = displayProp;
    
  });
document
  .getElementById('io-dialog-examples')
  .addEventListener('click', function () {
    state.examples = !state.examples;
    let displayProp = 'none';
    if (!state.examples) {
      document.getElementById('io-dialog-examples').style.display = displayProp;
    }
  });
document
  .getElementById('examples')
  .addEventListener('click', function (event) {
    event.stopPropagation();
  })
document
  .getElementById('js-toggle-fullscreen')
  .addEventListener('click', function () {
    state.fullScreen = !state.fullScreen;
    if (state.fullScreen) {
      enterFullscreen(document.documentElement);
    } else {
      exitFullscreen();
    }
  });
document
  .getElementById('js-toggle-keyboard-help')
  .addEventListener('click', function () {
    state.keyboardHelp = !state.keyboardHelp;
    let displayProp = 'none';
    if (state.keyboardHelp) {
      displayProp = 'block';
    }
    document.getElementById('io-dialog-main').style.display = displayProp;
  });
document
  .getElementById('io-dialog-main')
  .addEventListener('click', function () {
    state.keyboardHelp = !state.keyboardHelp;
    let displayProp = 'none';
    if (!state.keyboardHelp) {
      document.getElementById('io-dialog-main').style.display = displayProp;
    }
  });
export let simulating = false;
document
  .getElementById('js-start-simulation')
  .addEventListener('click', function () {

    // Handle simulation
    if (!simulating) {
      startSimulation();
    } else {
      stopSimulation();
    }
  });
  document
  .getElementById('js-restart-simulation')
  .addEventListener('click', function () {
    modeler.simulatorRestoreStates();
    clearSimulation();
    updatePendingEvents();
  });

function appendSimulationLog(message) {
  const log = document.getElementById('feedback');
  log.innerHTML = message;
}
  
function addToSimulationTrace(message) {
  const trace = document.getElementById('trace');
  message = message.replace(/\s/g, "\u00A0");
  if (trace.innerHTML === "") {
    trace.innerHTML = message;
  } else {
    trace.innerHTML = trace.innerHTML + ", " + message;
  }
}
  
function clearSimulation() {
  document.getElementById('trace').innerHTML = "";
  document.getElementById('feedback').innerHTML = "";
  document.getElementById('missing-events').innerHTML = "";
}

function startSimulation() {
    const selection = modeler.get("selection");
    selection.select([]);

    simulating = true;
    keyBindingsSetSimulating(simulating);
    let eventBus = modeler.get('eventBus');

    document.getElementsByClassName('djs-palette').item(0).style.display = 'none';
    document.getElementById('js-start-simulation').innerHTML = 'Stop simulation';
    document.getElementById('js-restart-simulation').style.display = 'block';
    document.getElementById('js-open-examples').style.display = 'none';
    document.getElementById('js-open-files').style.display = 'none';
    document.getElementById('simulation-sidepanel').style.display = 'block';

    // Define events that should be prevented
    const interactionEvents = [
        'shape.move.start',
        'element.dblclick',
        'connectionSegment.move.start',
        'commandStack.connection.updateWaypoints.canExecute',
        'commandStack.connection.reconnect.canExecute',
        'element.hover',

    ];

    // Override interactions for certain events in diagram-js
    interactionEvents.forEach(event => {
        eventBus.on(event, 3000, (event) => {
            if (simulating) {
                event.preventDefault();
                event.stopPropagation();
            }
        });
    });
    
    // Prevent the default action for paste, undo and redo
    document.addEventListener('keydown', function(event) {
      if (event.ctrlKey && simulating && (event.key === 'v' || event.key === 'z'
          || event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
          event.preventDefault(); 
          event.stopPropagation();
      }
    });

    // Override clicks on events to execute them
    eventBus.on('element.click', (event) => {
        if (simulating) {
            event.preventDefault();
            event.stopPropagation();

            const element = event.element;
            if (element.type === 'dcr:Event') {
                let ret = modeler.simulatorExecute(element);
                appendSimulationLog(ret[0]);
                if (ret.length > 1) {
                    addToSimulationTrace(ret[1]);
                }
            }

            // Unselect everything, prevents selecting elements during simulation
            const selection = modeler.get("selection");
            selection.select([]);
        }
        updatePendingEvents();
    });

    modeler.startSimulation();
    updatePendingEvents();
}

function updatePendingEvents() {
    const events = getPendingEvents(modeler.get('elementRegistry')).join(', ');
    if (events === '') {
      document.getElementById('missing-events').innerHTML = 'Graph is accepting';
    } else {
      document.getElementById('missing-events').innerHTML = events;
    }
}

function stopSimulation() {
    simulating = false;
    keyBindingsSetSimulating(simulating);
    document.getElementsByClassName('djs-palette').item(0).style.display = 'block';
    document.getElementById('js-start-simulation').innerHTML = 'Start simulation';
    document.getElementById('js-restart-simulation').style.display = 'none';
    document.getElementById('js-open-examples').style.display = 'block'
    document.getElementById('js-open-files').style.display = 'block'
    document.getElementById('simulation-sidepanel').style.display = 'none';
    clearSimulation();

    // Restore states for events and set enabled to false
    modeler.simulatorRestoreStates();
    modeler.get('elementRegistry').forEach(element => {
        if (element.type === 'dcr:Event') {
            modeler.get('modeling').updateProperties(element, { enabled: false });
        }
    });

    // Clear command stack log to prevent undo from using property updates during simulation
    modeler.get('modeling')._commandStack.clear();
}

/* file functions */
function openFile(file, callback) {
  // check file api availability
  if (!window.FileReader) {
    return window.alert(
      'Looks like you use an older browser that does not support drag and drop. ' +
      'Try using a modern browser such as Chrome, Firefox or Internet Explorer > 10.'
    );
  }

  // no file chosen
  if (!file) {
    return;
  }

  var reader = new FileReader();

  reader.onload = function (e) {
    var xml = e.target.result;

    callback(xml);
  };

  reader.readAsText(file);
}

var fileInput = $('<input type="file" />')
  .appendTo(document.body)
  .css({
    width: 1,
    height: 1,
    display: 'none',
    overflow: 'hidden',
  })
  .on('change', function (e) {
    openFile(e.target.files[0], openDCRPortalBoard);
  });

var customFileInput = $('<input type="file" />')
  .appendTo(document.body)
  .css({
    width: 1,
    height: 1,
    display: 'none',
    overflow: 'hidden',
  })
  .on('change', function (e) {
    openFile(e.target.files[0], openCustomBoard);
  });

function openBoard(xml) {
  // import board
  modeler.importXML(xml).catch(function (err) {
    if (err) {
      return console.error('could not import dcr board', err);
    }
  });
}

function openDCRPortalBoard(xml) {
  // import board
  modeler.importDCRPortalXML(xml).catch(function (err) {
    if (err) {
      return console.error('could not import dcr board', err);
    }
  });
}

function openCustomBoard(xml) {
  // import board
  modeler.importCustomXML(xml).catch(function (err) {
    if (err) {
      return console.error('could not import dcr board', err);
    }
  });
}

function saveSVG() {
  return modeler.saveSVG();
}

function saveBoard() {
  return modeler.saveXML({ format: true });
}

function saveDCR() {
  return modeler.saveDCRXML();
}

// bootstrap board functions
$(function () {
  var downloadLink = $('#js-download-board');
  var downloadDCRLink = $('#js-download-dcr');
  var downloadSvgLink = $('#js-download-svg');

  var openNew = $('#js-open-new');
  var openCustomBoard = $('#js-open-custom-board');
  var openExistingBoard = $('#js-open-board');

  $('.buttons a').click(function (e) {
    if (!$(this).is('.active')) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  function setEncoded(link, name, data) {
    var encodedData = encodeURIComponent(data);

    if (data) {
      link.addClass('active').attr({
        href: 'data:application/xml;charset=UTF-8,' + encodedData,
        download: name,
      });
    } else {
      link.removeClass('active');
    }
  }

  var exportArtifacts = debounce(function () {
    saveSVG().then(function (result) {
      setEncoded(downloadSvgLink, 'dcr-graph.svg', result.svg);
    });

    saveBoard().then(function (result) {
      setEncoded(downloadLink, 'dcr-board.xml', result.xml);
    });

    saveDCR().then(function (result) {
      setEncoded(downloadDCRLink, 'dcr-graph-XML-format.xml', result.xml);
    });
  }, 500);

  modeler.on('commandStack.changed', exportArtifacts);

  openNew.on('click', function () {
    openBoard(emptyBoardXML);
  });

  openCustomBoard.on('click', function () {
    var input = $(customFileInput);

    // clear input so that previously selected file can be reopened
    input.val('');
    input.trigger('click');
  });

  openExistingBoard.on('click', function () {
    var input = $(fileInput);

    // clear input so that previously selected file can be reopened
    input.val('');
    input.trigger('click');
  });
});

//openBoard(sampleBoardXML);
openBoard(emptyBoardXML);

// helpers //////////////////////

function debounce(fn, timeout) {
  var timer;

  return function () {
    if (timer) {
      clearTimeout(timer); 
    } 

    timer = setTimeout(fn, timeout);
  };
}

async function generateExamples() {
  fetch('examples/generated_examples.txt')
  .then(response => {
    if (!response.ok) {
      document.getElementById("generated-examples").append(document.createElement('p').innerHTML ="Failed to load examples");
      throw new Error('Failed to fetch examples status code: ' + response.status);
    }
    return response.text();
  })
  .then(data => {
    var files = data.split('\n');
    files.pop(); // Remove last empty line
    files = files.map(name => name.split('.').slice(0, -1).join('.')); // Shave file extension off
    const wrapper = document.getElementById("generated-examples");
    for (let i = 0; i < files.length ; i++) {
      var button = document.createElement('button');
      button.addEventListener('click', function () {
        if (confirm("Are you sure? This will override your current diagram!")) {
          fetch('examples/diagrams/' + files[i]+ '.xml')
            .then(response => {
              if (!response.ok) {
                alert("Failed to fetch example\nStatus code: " + response.status + " " + response.statusText);
              } else {
                return response.text();
              }
            }).then(data => {
              if(data.includes('<?xml')) { // type check which type of save file. Only one of them has magic number '<?xml'
                openCustomBoard(data);
              } else {
                openDCRPortalBoard(data);
              }
              document.getElementById('io-dialog-examples').style.display = 'none';
              state.examples = !state.examples;
            }).catch (err => {
              console.log(err);
            });
        }
      });
      button.className = 'example';
      var title = document.createElement('h2');
      title.innerHTML = files[i];
      var image = document.createElement('img');
      image.src = 'examples/images/' + files[i] + '.svg';
      button.append(title);
      button.append(image);
      wrapper.append(button);
    };
  })
}
generateExamples();


// Search examples
document.getElementById('search').addEventListener('input', e => {
  const value = e.target.value.toLowerCase();
  let elements = Array.from(document.getElementsByClassName('example'));
  elements.forEach(element => {
    const visible = element.children[0].innerHTML.toLowerCase().includes(value);
    element.style.display = visible ? 'inline-block' : 'none';
  });
});

/* Code for accessing elements in the modeler and their attributes
modeler.getElementRegistry().forEach(element => {
        console.log(element);
        if (element.type === 'dcr:Event') {
          console.log(element.businessObject.get('pending'));
          console.log(element.businessObject.get('included'));
          console.log(element.businessObject.get('executed'));
        } else if (element.type === 'dcr:Relation') {
          console.log(element.businessObject.get('type'));
          console.log(element.businessObject.get('sourceRef').id)
        }
    });
 */
