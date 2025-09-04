import { dom } from './dom.js';
import * as state from './state.js';
import { addOrMoveMarker, traceRoute } from './map.js';
import { refreshMap } from './ui.js';
import { addHistory, getHistory, addFavorite, removeFavorite, getFavorites } from './firestore.js';

/**
 * Salva um local de destino no histórico do Firestore.
 * @param {object} place - O objeto de local da API.
 */
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export async function saveDestinationToHistory(place) {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    console.log(`saveDestinationToHistory chamado com userId: ${userId}`, place);
    if (!userId || !place) {
        console.error("Condição para salvar histórico não atendida (usuário ou local ausente).", { userId, place });
        return;
    }
    
    if (AppConfig.DISABLE_ADDRESS_SUGGESTION_HISTORY) {
        console.log("Histórico de sugestões desabilitado via AppConfig. Não salvando no histórico.");
        return;
    }

    await addHistory(userId, place);
}

/**
 * Adiciona ou remove um local dos favoritos no Firestore.
 * @param {object} place - O objeto de local a ser favoritado/desfavoritado.
 */
export async function toggleFavorite(place) {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId || !place || !place.place_id) return;

    const favorites = await getFavorites(userId);
    const isFavorite = favorites.some(item => item.place_id === place.place_id);

    if (isFavorite) {
        showConfirmationModal(`Tem certeza de que deseja remover "${place.display_name}" dos favoritos?`, async () => {
            await removeFavorite(userId, place.place_id);
            renderFavoritesList(); // Atualiza a lista de favoritos
            renderRideHistory(); // Atualiza o histórico também, pois o status de favorito pode ter mudado
        });
    } else {
        await addFavorite(userId, place);
        renderFavoritesList();
        renderRideHistory();
    }
}

/**
 * Renderiza a lista de histórico/favoritos na UI.
 * @param {HTMLElement} container - O elemento container para a lista.
 * @param {Array} items - Os itens a serem renderizados.
 * @param {boolean} isFavorites - Indica se a lista é de favoritos.
 * @param {Array} favoritesList - A lista completa de favoritos para verificação.
 */
function renderList(container, items, isFavorites, favoritesList = []) {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = `<p class="text-center text-sm text-gray-500 dark:text-gray-400 p-4">Nenhum item encontrado.</p>`;
        return;
    }

    items.forEach(place => {
        const isFavorite = favoritesList.some(item => item.place_id === place.place_id);
        const historyItem = document.createElement('div');
        historyItem.className = `history-list-item flex items-center justify-between p-2 rounded-md text-sm w-full ${isFavorites ? 'favorite-item' : ''}`;
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
                ${isFavorites ? `<button type="button" class="delete-button p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600" data-place-id="${place.place_id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clip-rule="evenodd" />
                    </svg>
                </button>` : ''}
            </div>
        `;
        historyItem.querySelector('button[data-place-id]').addEventListener('click', () => handleHistorySelection(place));
        historyItem.querySelector('.favorite-button').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(place);
        });
        const deleteBtn = historyItem.querySelector('.delete-button');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(place); // A ação de deletar um favorito é a mesma que desfavoritar
            });
        }
        container.appendChild(historyItem);
    });
}

export async function renderRideHistory() {
    if (AppConfig.DISABLE_ADDRESS_SUGGESTION_HISTORY) {
        console.log("Histórico de sugestões desabilitado via AppConfig. Não renderizando histórico.");
        dom.rideHistoryList.innerHTML = `<p class="text-center text-sm text-gray-500 dark:text-gray-400 p-4">O histórico de sugestões está desabilitado.</p>`;
        return;
    }

    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) {
        renderList(dom.rideHistoryList, [], false, []);
        return;
    }
    const [history, favorites] = await Promise.all([getHistory(userId), getFavorites(userId)]);
    renderList(dom.rideHistoryList, history, false, favorites);
}

export async function renderFavoritesList() {
    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    if (!userId) {
        renderList(dom.modalFavoritesList, [], true, []);
        return;
    }
    const favorites = await getFavorites(userId);
    renderList(dom.modalFavoritesList, favorites, true, favorites);
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

    refreshMap();
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
