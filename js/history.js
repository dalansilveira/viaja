import { dom } from './dom.js';
import * as state from './state.js';
import { addOrMoveMarker, traceRoute } from './map.js';
import { toggleMapVisibility } from './ui.js';

const HISTORY_STORAGE_KEY = 'viaja_destination_history';

/**
 * Salva um local de destino no histórico.
 * @param {object} place - O objeto de local da API.
 */
export function saveDestinationToHistory(place) {
    if (!place || !place.place_id) return;

    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    history = history.filter(item => item.place_id !== place.place_id);
    history.unshift(place);
    const shortHistory = history.slice(0, 3);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(shortHistory));
    displayHistory();
}

/**
 * Exibe o histórico de destinos na UI.
 */
export function displayHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    dom.destinationHistoryList.innerHTML = '';

    if (history.length > 0) {
        dom.destinationHistory.classList.remove('hidden');
        history.forEach(place => {
            const historyItem = document.createElement('button');
            historyItem.type = 'button';
            historyItem.className = 'text-left p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-600 dark:text-gray-300 w-full flex items-center gap-2';
            historyItem.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414L6 10.586V12h1.414l4.293-4.293z" clip-rule="evenodd" />
                </svg>
                <span class="truncate">${place.display_name}</span>
            `;
            historyItem.addEventListener('click', () => handleHistorySelection(place));
            dom.destinationHistoryList.appendChild(historyItem);
        });
    } else {
        dom.destinationHistory.classList.add('hidden');
    }
}

/**
 * Lida com a seleção de um item do histórico.
 * @param {object} place - O objeto de local selecionado.
 */
function handleHistorySelection(place) {
    dom.destinationInput.value = place.display_name;
    const latlng = { lat: parseFloat(place.lat), lng: parseFloat(place.lon) };
    state.setCurrentDestination({ latlng, data: place });

    addOrMoveMarker(latlng, 'destination', 'Destino');

    if (state.currentOrigin && state.currentDestination) {
        traceRoute();
        dom.submitButton.disabled = false;
    }

    if (!dom.mapContainer.classList.contains('visible')) {
        toggleMapVisibility(true);
    }
}
