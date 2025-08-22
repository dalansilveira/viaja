import { dom } from './dom.js';
import * as state from './state.js';
import { addOrMoveMarker, traceRoute } from './map.js';
import { toggleMapVisibility } from './ui.js';

const HISTORY_STORAGE_KEY = 'viaja_destination_history';
const FAVORITES_STORAGE_KEY = 'viaja_favorite_destinations';
let showFavoritesOnly = false; // Novo estado para controlar a exibição

/**
 * Salva um local de destino no histórico.
 * @param {object} place - O objeto de local da API.
 */
export function saveDestinationToHistory(place) {
    if (!place || !place.place_id) return;

    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    history = history.filter(item => item.place_id !== place.place_id);
    history.unshift(place);
    const shortHistory = history.slice(0, 5);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(shortHistory));
    renderHistoryList();
}

/**
 * Adiciona ou remove um local dos favoritos.
 * @param {object} place - O objeto de local a ser favoritado/desfavoritado.
 */
export function toggleFavorite(place) {
    if (!place || !place.place_id) return;

    let favorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || [];
    const isFavorite = favorites.some(item => item.place_id === place.place_id);

    if (isFavorite) {
        showConfirmationModal(`Tem certeza de que deseja remover "${place.display_name}" dos favoritos?`, () => {
            favorites = favorites.filter(item => item.place_id !== place.place_id);
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
            renderHistoryList();
        });
    } else {
        if (favorites.length < 5) { // Limita a 5 favoritos
            favorites.push(place);
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
            renderHistoryList(); // Atualiza a exibição para refletir a mudança
        } else {
            // Opcional: Notificar o usuário que o limite foi atingido
            console.warn('Limite de 5 favoritos atingido.');
        }
    }
}

/**
 * Remove um item do histórico.
 * @param {string} placeId - O ID do local a ser removido.
 */
export function deleteHistoryItem(placeId) {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    const itemToDelete = history.find(item => item.place_id === placeId);
    if (!itemToDelete) return;

    showConfirmationModal(`Tem certeza de que deseja remover "${itemToDelete.display_name}" do histórico?`, () => {
        history = history.filter(item => item.place_id !== placeId);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        renderHistoryList(); // Atualiza a exibição
    });
}

/**
 * Alterna a exibição entre histórico completo e apenas favoritos.
 * @param {boolean} showFavorites - Se deve exibir apenas favoritos.
 */
export function toggleShowFavorites(showFavorites) {
    showFavoritesOnly = showFavorites;
    renderHistoryList();
}

/**
 * Renderiza a lista de histórico/favoritos na UI.
 */
export function renderHistoryList() {
    const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    const favorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || [];
    
    // Limpa ambas as listas antes de renderizar
    dom.destinationHistoryList.innerHTML = '';
    if (dom.destinationFavoritesList) {
        dom.destinationFavoritesList.innerHTML = '';
    }

    const listContainer = showFavoritesOnly ? dom.destinationFavoritesList : dom.destinationHistoryList;
    const itemsToDisplay = showFavoritesOnly ? favorites : history;

    if (history.length > 0 || favorites.length > 0) {
        dom.destinationHistory.classList.remove('hidden');
        
        if (itemsToDisplay.length === 0) {
            listContainer.innerHTML = `<p class="text-center text-sm text-gray-500 dark:text-gray-400 p-4">Nenhum item encontrado.</p>`;
            return;
        }

        itemsToDisplay.forEach(place => {
            const isFavorite = favorites.some(item => item.place_id === place.place_id);
            const historyItem = document.createElement('div');
            historyItem.className = `history-list-item flex items-center justify-between p-2 rounded-md text-sm w-full ${showFavoritesOnly ? 'favorite-item' : ''}`;
            historyItem.innerHTML = `
                <button type="button" class="flex items-center gap-2 text-left flex-grow" data-place-id="${place.place_id}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400 flex-shrink-0">
                      <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                    </svg>
                    <span class="truncate" title="${place.display_name}">${place.display_name}</span>
                </button>
                <div class="flex items-center gap-2">
                    <button type="button" class="favorite-button p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600" data-place-id="${place.place_id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ${isFavorite ? 'text-yellow-500' : 'text-gray-400'}" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.538 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.538-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.927 8.72c-.783-.57-.381-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" />
                        </svg>
                    </button>
                    <button type="button" class="delete-button p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600" data-place-id="${place.place_id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            `;
            historyItem.querySelector('button[data-place-id]').addEventListener('click', () => handleHistorySelection(place));
            historyItem.querySelector('.favorite-button').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(place);
            });
            historyItem.querySelector('.delete-button').addEventListener('click', (e) => {
                e.stopPropagation();
                if (showFavoritesOnly) {
                    toggleFavorite(place); // Reutiliza a lógica de toggle, que agora tem confirmação
                } else {
                    deleteHistoryItem(place.place_id);
                }
            });
            listContainer.appendChild(historyItem);
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

/**
 * Exibe o modal de confirmação.
 * @param {string} message - A mensagem a ser exibida no modal.
 * @param {function} onConfirm - A função a ser executada na confirmação.
 */
function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirm-button');
    const cancelBtn = document.getElementById('cancel-button-modal');

    messageEl.textContent = message;
    modal.classList.remove('hidden');

    const confirmHandler = () => {
        onConfirm();
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    };

    const cancelHandler = () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    };

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
}
