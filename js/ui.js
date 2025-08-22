import { dom } from './dom.js';
import * as state from './state.js';
import { reverseGeocode, fetchAddressSuggestions } from './api.js';
import { formatPlaceForDisplay } from './utils.js';
import { addOrMoveMarker, traceRoute } from './map.js';
import { saveDestinationToHistory, toggleShowFavorites, renderHistoryList } from './history.js';

let mapMessageTimeout;

/**
 * Exibe uma mensagem flutuante temporária.
 * @param {string} message - A mensagem a ser exibida.
 */
export function showMessage(message) {
    dom.messageBox.textContent = message;
    dom.messageBox.style.display = 'block';
    setTimeout(() => {
        dom.messageBox.style.display = 'none';
    }, 3000);
}

/**
 * Exibe ou oculta o contêiner do mapa.
 * @param {boolean} visible - Se o mapa deve ser visível.
 */
export function toggleMapVisibility(forceVisible = null, fromButton = false) {
    const isCurrentlyVisible = dom.mapContainer.classList.contains('visible');
    let shouldBeVisible = forceVisible !== null ? forceVisible : !isCurrentlyVisible;

    // Se a chamada veio do botão, alternar a visibilidade
    if (fromButton) {
        shouldBeVisible = !isCurrentlyVisible;
    } else {
        // Se não veio do botão, e o mapa está visível e não há modo de seleção, ocultar
        // Isso evita que o mapa permaneça visível quando não está sendo usado para seleção
        if (isCurrentlyVisible && !state.currentSelectionMode) {
            shouldBeVisible = false;
        }
    }

    dom.mapContainer.classList.toggle('visible', shouldBeVisible);

    if (shouldBeVisible) {
        setTimeout(() => state.map.invalidateSize(), 500);
        // Exibir a mensagem do mapa apenas se estiver no modo de seleção
        if (state.currentSelectionMode) {
            dom.mapMessage.style.display = 'block';
            clearTimeout(mapMessageTimeout);
            mapMessageTimeout = setTimeout(() => {
                dom.mapMessage.style.display = 'none';
            }, 5000);
        }
    } else {
        dom.mapMessage.style.display = 'none';
        clearTimeout(mapMessageTimeout);
    }
}

/**
 * Exibe uma notificação push.
 * @param {string} message - A mensagem a ser exibida.
 * @param {string} type - Tipo da notificação ('info', 'success', 'warning', 'error').
 * @param {number} duration - Duração em milissegundos.
 */
export function showPushNotification(message, type = 'info', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `push-notification push-notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">${getNotificationIcon(type)}</div>
            <div class="notification-text">${message}</div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `;
    
    const container = document.getElementById('notification-container') || createNotificationContainer();
    container.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

function createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

function getNotificationIcon(type) {
    const icons = {
        info: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
        success: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14 9,11"/></svg>`,
        warning: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    };
    return icons[type] || icons.info;
}

/**
 * Alterna o painel de visualização principal.
 * @param {string} panelId - O ID do painel a ser exibido.
 */
export function switchPanel(panelId) {
    dom.rideRequestPanel.classList.add('hidden');
    dom.vehicleSelectionPanel.classList.add('hidden');
    dom.rideStatusPanel.classList.add('hidden');
    document.getElementById(panelId).classList.remove('hidden');
}

/**
 * Lida com cliques no mapa para selecionar origem/destino.
 * @param {object} e - Objeto do evento do clique.
 */
export async function handleMapClick(e) {
    if (!state.currentSelectionMode || state.isDraggingMarker) return;

    const latlng = e.latlng;
    const type = state.currentSelectionMode;
    
    let inputEl;

    if (type === 'origin') {
        inputEl = dom.originInput;
    } else if (type === 'destination') {
        inputEl = dom.destinationInput;
    }

    if (!inputEl) return;

    const name = (type === 'origin') ? 'Origem' : 'Destino';

    inputEl.value = 'Buscando endereço...';

    const fullAddressData = await reverseGeocode(latlng.lat, latlng.lng);
    const addressText = formatPlaceForDisplay(fullAddressData) || 'Endereço desconhecido';
    
    inputEl.value = addressText;
    fullAddressData.display_name = addressText;

    // Adiciona as coordenadas ao dataset do input para o traceRoute funcionar
    inputEl.dataset.lat = latlng.lat;
    inputEl.dataset.lng = latlng.lng;

    if (type === 'origin') {
        state.setCurrentOrigin({ latlng, data: fullAddressData });
        addOrMoveMarker(latlng, 'origin', 'Origem');
        dom.originInput.parentElement.classList.add('input-filled');
    } else {
        state.setCurrentDestination({ latlng, data: fullAddressData });
        addOrMoveMarker(latlng, 'destination', 'Destino');
        dom.destinationInput.closest('.input-group').classList.add('input-filled');
    }

    traceRoute();
    if (state.currentOrigin && state.currentDestination) {
        dom.submitButton.disabled = false;
    }

    // Desativa o modo de seleção e o foco do input após o clique
    state.setCurrentSelectionMode(null);
    state.setActiveDestinationInput(null);
    dom.mapMessage.style.display = 'none';
}

/**
 * Exibe e atualiza as sugestões de endereço, incluindo histórico e favoritos.
 * @param {HTMLInputElement} inputEl - O elemento de input.
 * @param {HTMLDivElement} suggestionsEl - O container para as sugestões.
 */
export async function displayAddressSuggestions(inputEl, suggestionsEl) {
    const query = inputEl.value.toLowerCase();
    suggestionsEl.innerHTML = '';
    suggestionsEl.style.display = 'none';

    if (query.length < 2) return;

    const history = JSON.parse(localStorage.getItem('viaja_destination_history')) || [];
    const favorites = JSON.parse(localStorage.getItem('viaja_favorite_destinations')) || [];

    const localResults = [...favorites, ...history];
    const uniqueLocalResults = Array.from(new Map(localResults.map(item => [item.place_id, item])).values());

    const filteredLocalResults = uniqueLocalResults.filter(place =>
        place.display_name.toLowerCase().includes(query)
    );

    const displayedPlaceIds = new Set();

    // Renderiza os resultados locais
    filteredLocalResults.forEach(place => {
        const isFavorite = favorites.some(fav => fav.place_id === place.place_id);
        const icon = isFavorite ? '⭐' : '🕒';
        renderSuggestion(place, `${icon} ${place.display_name}`, inputEl, suggestionsEl);
        displayedPlaceIds.add(place.place_id);
    });

    // Busca e renderiza os resultados da API
    if (query.length >= 3) {
        const apiResults = await fetchAddressSuggestions(query);
        apiResults.forEach(place => {
            if (!displayedPlaceIds.has(place.place_id)) {
                renderSuggestion(place, place.display_name, inputEl, suggestionsEl);
                displayedPlaceIds.add(place.place_id);
            }
        });
    }

    if (suggestionsEl.children.length > 0) {
        suggestionsEl.style.display = 'block';
    }
}

/**
 * Renderiza um único item de sugestão.
 * @param {object} place - O objeto do local.
 * @param {string} displayText - O texto a ser exibido.
 * @param {HTMLInputElement} inputEl - O elemento de input.
 * @param {HTMLDivElement} suggestionsEl - O container para as sugestões.
 */
function renderSuggestion(place, displayText, inputEl, suggestionsEl) {
    const suggestionDiv = document.createElement('div');
    suggestionDiv.innerHTML = displayText; // Usa innerHTML para renderizar o ícone
    suggestionDiv.className = 'suggestion-item'; // Adiciona uma classe para estilização

    suggestionDiv.addEventListener('click', () => {
        inputEl.value = place.display_name; // Usa o nome limpo sem o ícone
        suggestionsEl.innerHTML = '';
        suggestionsEl.style.display = 'none';

        const latlng = { lat: parseFloat(place.lat), lng: parseFloat(place.lon) };
        inputEl.dataset.lat = latlng.lat;
        inputEl.dataset.lng = latlng.lng;

        if (inputEl.id === 'origin-input') {
            state.setCurrentOrigin({ latlng, data: place });
            addOrMoveMarker(latlng, 'origin', 'Origem');
            dom.originInput.parentElement.classList.add('input-filled');
        } else {
            state.setCurrentDestination({ latlng, data: place });
            addOrMoveMarker(latlng, 'destination', 'Destino');
            dom.destinationInput.closest('.input-group').classList.add('input-filled');
        }

        traceRoute();
        if (state.currentOrigin && state.currentDestination) {
            dom.submitButton.disabled = false;
        }

        if (!dom.mapContainer.classList.contains('visible')) {
            toggleMapVisibility(true);
        }
    });

    suggestionsEl.appendChild(suggestionDiv);
}

/**
 * Alterna entre o tema claro e escuro.
 */
export function toggleGpsModal(show) {
    dom.gpsModal.classList.toggle('visible', show);
}

export function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    const logoElement = document.querySelector('h1 img');
    if (logoElement) {
        logoElement.src = isDark ? 'imgs/logodark.png' : 'imgs/logo.png';
    }

    // Redesenha a rota para atualizar a cor
    if (state.currentOrigin && state.currentDestination) {
        traceRoute();
    }
}

// Adiciona eventos de clique aos botões de histórico e favoritos
dom.showHistoryButton.addEventListener('click', () => {
    toggleShowFavorites(false); // Exibe o histórico
    dom.showHistoryButton.classList.remove('bg-gray-300', 'text-gray-800');
    dom.showHistoryButton.classList.add('bg-blue-500', 'text-white');
    dom.showFavoritesButton.classList.remove('bg-blue-500', 'text-white');
    dom.showFavoritesButton.classList.add('bg-gray-300', 'text-gray-800');
    renderHistoryList(); // Renderiza a lista de histórico
});

dom.showFavoritesButton.addEventListener('click', () => {
    toggleShowFavorites(true); // Exibe os favoritos
    dom.showFavoritesButton.classList.remove('bg-gray-300', 'text-gray-800');
    dom.showFavoritesButton.classList.add('bg-blue-500', 'text-white');
    dom.showHistoryButton.classList.remove('bg-blue-500', 'text-white');
    dom.showHistoryButton.classList.add('bg-gray-300', 'text-gray-800');
    renderHistoryList(); // Renderiza a lista de favoritos
});
