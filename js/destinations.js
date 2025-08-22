import { dom } from './dom.js';
import { state } from './state.js';
import { traceRoute } from './map.js';

let stopCounter = 0;

/**
 * Cria e adiciona um novo campo de input para destino.
 */
export function addDestinationInput() {
    stopCounter++;
    const stopId = `stop-${stopCounter}`;

    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group destination-group';
    inputGroup.setAttribute('draggable', 'true');
    inputGroup.dataset.id = stopId;

    inputGroup.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pin-green-svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
        </svg>
        <input type="text" placeholder="Parada ${stopCounter}" class="destination-input" autocomplete="off" data-id="${stopId}">
        <div class="flex items-center gap-2">
            <button type="button" class="select-in-field-button select-destination-button" title="Selecionar no mapa" data-id="${stopId}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pin-green-svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                </svg>
            </button>
            <button type="button" class="remove-stop-button" title="Remover parada" data-id="${stopId}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                </svg>
            </button>
        </div>
    `;

    dom.destinationInputsContainer.appendChild(inputGroup);

    const input = inputGroup.querySelector('.destination-input');
    const selectButton = inputGroup.querySelector('.select-destination-button');
    const removeButton = inputGroup.querySelector('.remove-stop-button');

    // Adicionar listeners
    // TODO: Implementar autocomplete para os campos de parada.
    // handleAutocomplete(input, ...);
    selectButton.addEventListener('click', () => {
        state.isSelecting = 'destination';
        state.selectingDestinationId = stopId;
        dom.mapMessage.textContent = 'Toque no mapa para selecionar a parada';
        dom.mapMessage.style.display = 'block';
    });

    removeButton.addEventListener('click', () => {
        removeDestinationInput(stopId);
    });

    // Lógica de Drag and Drop
    inputGroup.addEventListener('dragstart', handleDragStart);
    inputGroup.addEventListener('dragover', handleDragOver);
    inputGroup.addEventListener('drop', handleDrop);
    inputGroup.addEventListener('dragend', handleDragEnd);
}

/**
 * Remove um campo de input de destino, seu marcador e seus dados do estado.
 * @param {string} stopId O ID da parada a ser removida.
 */
function removeDestinationInput(stopId) {
    const inputGroup = dom.destinationInputsContainer.querySelector(`[data-id="${stopId}"]`);
    if (inputGroup) {
        inputGroup.remove();
    }

    // Remove o ponto do estado
    if (state.points.destination[stopId]) {
        delete state.points.destination[stopId];
    }

    // Remove o marcador do mapa e do estado
    if (state.stopMarkers[stopId]) {
        state.map.removeLayer(state.stopMarkers[stopId]);
        delete state.stopMarkers[stopId];
    }

    // Atualiza os placeholders e a rota
    updatePlaceholders();
    traceRoute();
}

/**
 * Atualiza os placeholders dos inputs de destino após remoção ou reordenação.
 */
function updatePlaceholders() {
    const allStops = dom.destinationInputsContainer.querySelectorAll('.destination-input');
    allStops.forEach((input, index) => {
        input.placeholder = `Parada ${index + 1}`;
    });
    stopCounter = allStops.length;
}

/**
 * Retorna um array com as coordenadas de todos os destinos.
 * @returns {L.LatLng[]}
 */
export function getWaypoints() {
    const waypoints = [];
    const destinationInputs = dom.destinationInputsContainer.querySelectorAll('.destination-input');
    destinationInputs.forEach(input => {
        const stopId = input.dataset.id;
        if (state.points.destination[stopId]) {
            waypoints.push(state.points.destination[stopId]);
        }
    });
    return waypoints;
}


// --- Lógica de Drag and Drop ---
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = this;
    setTimeout(() => {
        this.style.display = 'none';
    }, 0);
}

function handleDragEnd() {
    setTimeout(() => {
        if (draggedItem) {
            draggedItem.style.display = 'flex';
            draggedItem = null;
        }
    }, 0);

    const items = document.querySelectorAll('.destination-group');
    items.forEach(item => item.classList.remove('over'));

    updatePlaceholders();
}

function handleDragOver(e) {
    e.preventDefault();
    const items = document.querySelectorAll('.destination-group');
    items.forEach(item => item.classList.remove('over'));
    this.classList.add('over');
}

function handleDrop(e) {
    e.preventDefault();
    if (this !== draggedItem) {
        let currentPos = 0, droppedPos = 0;
        const items = document.querySelectorAll('.destination-group');
        for(let i=0; i < items.length; i++) {
            if(draggedItem === items[i]) {
                currentPos = i;
            }
            if(this === items[i]) {
                droppedPos = i;
            }
        }
        
        if(currentPos < droppedPos) {
            this.parentNode.insertBefore(draggedItem, this.nextSibling);
        } else {
            this.parentNode.insertBefore(draggedItem, this);
        }
    }
}

/**
 * Inicializa a funcionalidade de múltiplos destinos.
 */
export function initializeDestinations() {
    dom.addStopButton.addEventListener('click', addDestinationInput);
    // Adiciona o primeiro campo de destino por padrão
    addDestinationInput();
}
