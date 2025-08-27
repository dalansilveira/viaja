import { requestRide } from './app.js';
import { dom } from './dom.js';
import * as state from './state.js';
import { saveAppState } from './state.js';
import { reverseGeocode, fetchAddressSuggestions } from './api.js';
import { formatPlaceForDisplay, haversineDistance, normalizeText, formatDestinationAddressForTooltip } from './utils.js';
import { addOrMoveMarker, traceRoute } from './map.js';
import { saveDestinationToHistory } from './history.js';
import { saveSuggestionToCache, getHistory, getFavorites } from './firestore.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { AppConfig } from './config.js';

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
 * Garante que o mapa seja redimensionado e centralizado corretamente.
 */
export function refreshMap() {
    setTimeout(() => {
        if (!state.map) return;
        state.map.invalidateSize();

        // Centraliza o mapa com base no estado atual
        if (state.currentOrigin && state.currentDestination) {
            state.map.fitBounds([state.currentOrigin.latlng, state.currentDestination.latlng], { padding: [AppConfig.MAP_ZOOM_LEVELS.FIT_BOUNDS_PADDING, AppConfig.MAP_ZOOM_LEVELS.FIT_BOUNDS_PADDING] });
        } else if (state.currentOrigin) {
            state.map.panTo(state.currentOrigin.latlng);
        }
    }, 100); // Um pequeno atraso para garantir que o mapa esteja pronto.
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
    dom.rideStatusPanel.classList.add('hidden');
    document.getElementById(panelId).classList.remove('hidden');
}

/**
 * Lida com cliques no mapa, tratando a definição de origem e destino.
 * @param {object} e - Objeto do evento do clique.
 */
export async function handleMapClick(e) {
    if (state.isDraggingMarker) return;

    console.log("handleMapClick: state.currentDestination antes da lógica:", state.currentDestination);

    const latlng = e.latlng;

    // Caso 1: Modo de seleção de destino está ativo
    if (state.currentSelectionMode === 'destination') {
        const inputEl = dom.destinationInput;
        if (!inputEl) return;

        inputEl.value = 'Buscando endereço...';
        const fullAddressData = await reverseGeocode(latlng.lat, latlng.lng);
        const addressText = formatPlaceForDisplay(fullAddressData) || 'Endereço desconhecido';
        
        inputEl.value = addressText;
        fullAddressData.display_name = addressText;

        let houseNumber = '';
        if (fullAddressData.address && fullAddressData.address.house_number) {
            houseNumber = fullAddressData.address.house_number;
        } else {
            const match = fullAddressData.display_name.match(/(?:,\s*|\s+)(\d+)$|^(\d+),/);
            if (match) {
                houseNumber = match[1] || match[2];
            }
        }

        inputEl.dataset.lat = latlng.lat;
        inputEl.dataset.lng = latlng.lng;

        state.setCurrentDestination({ latlng, data: fullAddressData });
        addOrMoveMarker(latlng, 'destination', 'Destino');
        dom.destinationInput.closest('.input-group').classList.add('input-filled');

        saveAppState();
        traceRoute();
        if (state.currentOrigin && state.currentDestination) {
            dom.submitButton.disabled = false;
        }

        state.setCurrentSelectionMode(null);
        setSelectionButtonState(null);
        dom.mapMessage.style.display = 'none';

    // Caso 2: Nenhum modo de seleção ativo (ação padrão é definir origem)
    } else if (!state.currentSelectionMode && state.isOriginPinClickDraggable && !state.currentDestination) { // Só move o pin de origem se o modo de arrasto por clique estiver ativo E não houver um destino selecionado
        addOrMoveMarker(latlng, 'origin');
        try {
            const addressData = await reverseGeocode(latlng.lat, latlng.lng);
            state.setCurrentOrigin({
                latlng: latlng,
                data: addressData
            });
            traceRoute();
        } catch (error) {
            console.error("Erro ao obter endereço para o ponto de origem:", error);
            showPushNotification("Não foi possível obter o endereço para este local.", "error");
        }
    }
    // Se houver outro modo de seleção no futuro, ele será ignorado aqui.
}

/**
 * Exibe e atualiza as sugestões de endereço, incluindo histórico e favoritos.
 * @param {HTMLInputElement} inputEl - O elemento de input.
 * @param {HTMLDivElement} suggestionsEl - O container para as sugestões.
 * @param {AbortSignal} signal - O signal do AbortController para cancelar a requisição.
 */
export async function displayAddressSuggestions(inputEl, suggestionsEl, signal) {
    const loadingIndicator = document.getElementById('destination-loading-indicator');
    loadingIndicator.style.display = 'block';

    suggestionsEl.innerHTML = '';
    const query = inputEl.value.toLowerCase();
    const numberMatch = query.match(/(?:,|\s)\s*(\d+)$/);
    const userTypedNumber = numberMatch ? numberMatch[1] : null;

    if (query.length < 2) {
        loadingIndicator.style.display = 'none';
        suggestionsEl.style.display = 'none';
        return;
    }

    const prefixes = [
        'Rua', 'R.', 'Avenida', 'Av.', 'Praça', 'Pç.', 'Travessa', 'Tr.',
        'Estrada', 'Estr.', 'Rodovia', 'Rod.', 'Alameda', 'Al.', 'Largo',
        'Viela', 'Via', 'Trevo', 'Passarela'
    ];

    const cleanedQuery = prefixes.reduce((acc, prefix) => {
        const regex = new RegExp(`^${prefix}\\s+`, 'i');
        return acc.replace(regex, '');
    }, query);

    const auth = getAuth();
    const userId = auth.currentUser?.uid;
    const proximityCoords = state.currentUserCoords || null;

    try {
        // 1. Coletar todas as fontes de dados em paralelo
        const [history, favorites, apiResults] = await Promise.all([
            userId ? getHistory(userId) : Promise.resolve([]),
            userId ? getFavorites(userId) : Promise.resolve([]),
            fetchAddressSuggestions(cleanedQuery, proximityCoords, signal)
        ]);

        if (signal.aborted) return;

        // 2. Unificar todos os resultados em uma única lista
        const combinedResults = [...favorites, ...history, ...apiResults];

        // 3. Remover duplicatas da lista unificada usando uma chave composta (rua + bairro)
        const uniqueResults = Array.from(new Map(combinedResults.map(item => {
            const road = item.address?.road || '';
            const suburb = item.address?.suburb || '';
            const key = `${normalizeText(road)}-${normalizeText(suburb)}`;
            return [key, item];
        })).values());

        // 4. Ordenar por distância se a localização do usuário for conhecida
        if (proximityCoords) {
            uniqueResults.sort((a, b) => {
                const distA = haversineDistance(proximityCoords, a);
                const distB = haversineDistance(proximityCoords, b);
                return distA - distB;
            });
        }

        // 5. Filtrar por resultados que contenham uma rua
        let finalResults = uniqueResults.filter(place => place.address && place.address.road);

        // Se o usuário digitou um número, mostre apenas o resultado mais relevante.
        if (userTypedNumber && finalResults.length > 0) {
            finalResults = [finalResults[0]];
        } else {
            // Caso contrário, limite a 6 sugestões.
            finalResults = finalResults.slice(0, 6);
        }

        // 6. Renderizar os resultados
        loadingIndicator.style.display = 'none';
        if (finalResults.length > 0) {
            const header = document.createElement('div');
            header.className = 'suggestion-header';
            header.textContent = 'Selecione um endereço';
            suggestionsEl.appendChild(header);

            finalResults.forEach(place => {
                const isFavorite = favorites.some(fav => fav.place_id === place.place_id);
                const isHistory = history.some(hist => hist.place_id === place.place_id);
                let iconType = 'location';
                if (isFavorite) iconType = 'favorite';
                else if (isHistory) iconType = 'history';

                renderSuggestion(place, place.display_name, inputEl, suggestionsEl, iconType, userTypedNumber);

                if (userId && state.currentOrigin?.data?.address?.city && place.address?.city?.toLowerCase() === state.currentOrigin.data.address.city.toLowerCase()) {
                    saveSuggestionToCache(place);
                }
            });

            if (!state.currentDestination) {
                const panel = dom.collapsiblePanel;
                if (panel && !panel.classList.contains('open')) {
                    dom.togglePanelButton.click();
                }
                showPage('page2');
            }
            suggestionsEl.style.display = 'block';
        } else {
            suggestionsEl.style.display = 'none';
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("Erro ao buscar sugestões de endereço:", error);
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * Renderiza um único item de sugestão.
 * @param {object} place - O objeto do local.
 * @param {string} displayText - O texto a ser exibido.
 * @param {HTMLInputElement} inputEl - O elemento de input.
 * @param {HTMLDivElement} suggestionsEl - O container para as sugestões.
 * @param {string} iconType - O tipo de ícone ('favorite', 'history', 'location').
 * @param {string|null} userTypedNumber - O número que o usuário digitou.
 */
function renderSuggestion(place, _, inputEl, suggestionsEl, iconType, userTypedNumber) {
    const suggestionDiv = document.createElement('div');
    suggestionDiv.className = 'suggestion-item';

    const currentCity = state.currentOrigin?.data?.address?.city || state.currentOrigin?.data?.address?.town || '';

    const stateAbbreviations = {
        'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE',
        'Distrito Federal': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
        'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', 'Pará': 'PA',
        'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ',
        'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR',
        'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
    };

    const road = place.address?.road || '';
    let mainText = road; // Começa apenas com a rua

    // Adiciona o número com a marcação especial se ele foi digitado pelo usuário
    if (userTypedNumber) {
        mainText += `, <span class="user-typed-number">${userTypedNumber}</span>`;
    } else if (place.address?.house_number) {
        // Se não, usa o número da API, mas sem a marcação
        mainText += `, ${place.address.house_number}`;
    }

    const neighbourhood = place.address?.suburb || place.address?.neighbourhood || '';
    const city = place.address?.city || place.address?.town || place.address?.village || '';
    const stateName = place.address?.state || '';
    const stateAbbr = stateAbbreviations[stateName] || stateName;
    const subtext = [city, stateAbbr].filter(Boolean).join(', ');

    const cityMismatch = currentCity && city && currentCity.toLowerCase() !== city.toLowerCase();

    const iconHtml = {
        favorite: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-yellow-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        location: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`
    }[iconType];

    suggestionDiv.innerHTML = `
        <div class="suggestion-icon">${iconHtml}</div>
        <div class="suggestion-text">
            <div class="suggestion-main-text">${mainText}</div>
            ${neighbourhood ? `<div class="suggestion-neighbourhood-text">${neighbourhood}</div>` : ''}
            <div class="suggestion-sub-text ${cityMismatch ? 'city-mismatch' : ''}">${subtext}</div>
        </div>
    `;

    suggestionDiv.addEventListener('click', () => {
        const hasHouseNumber = place.address?.house_number || /, \d+$/.test(place.display_name);
        
        if (hasHouseNumber) {
            setDestination(place, inputEl, suggestionsEl);
        } else {
            dom.houseNumberModal.classList.remove('hidden');
            dom.houseNumberInput.value = ''; // Limpa o campo para novas entradas
            dom.houseNumberInput.focus();

            // --- Nova Lógica de Fechamento ---
            let confirmListener, cancelListener, overlayClickListener;

            const closeModal = () => {
                dom.houseNumberModal.classList.add('hidden');
                // Remove todos os listeners para evitar duplicação e vazamento de memória
                dom.confirmHouseNumberButton.removeEventListener('click', confirmListener);
                dom.cancelHouseNumberButton.removeEventListener('click', cancelListener);
                dom.houseNumberModal.removeEventListener('click', overlayClickListener);
            };

            confirmListener = () => {
                const houseNumber = dom.houseNumberInput.value;
                if (houseNumber) {
                    place.address.house_number = houseNumber;
                    place.display_name = `${place.address.road}, ${houseNumber}, ${place.address.city}`;
                    setDestination(place, inputEl, suggestionsEl);
                    closeModal();
                }
            };

            cancelListener = () => {
                closeModal();
            };

            overlayClickListener = (e) => {
                // Fecha apenas se o clique for no elemento de fundo (o próprio modal)
                if (e.target === dom.houseNumberModal) {
                    closeModal();
                }
            };

            // Adiciona os listeners
            dom.confirmHouseNumberButton.addEventListener('click', confirmListener);
            dom.cancelHouseNumberButton.addEventListener('click', cancelListener);
            dom.houseNumberModal.addEventListener('click', overlayClickListener);
        }
    });

    suggestionsEl.appendChild(suggestionDiv);
}

function setDestination(place, inputEl, suggestionsEl) {
    inputEl.value = place.display_name;
    suggestionsEl.innerHTML = '';
    suggestionsEl.style.display = 'none';

    const latlng = { lat: parseFloat(place.lat), lng: parseFloat(place.lon) };
    inputEl.dataset.lat = latlng.lat;
    inputEl.dataset.lng = latlng.lng;

    state.setCurrentDestination({ latlng, data: place });
    const destinationName = formatDestinationAddressForTooltip(place, state.currentOrigin.data);
    addOrMoveMarker(latlng, 'destination', destinationName);
    dom.destinationInput.closest('.input-group').classList.add('input-filled');

    saveAppState();
    traceRoute();
    if (state.currentOrigin && state.currentDestination) {
        requestRide();
    }

    dom.mapMessage.style.display = 'none'; // Oculta a dica quando o destino é definido por sugestão
    refreshMap();
}

/**
 * Alterna entre o tema claro e escuro.
 */
export function toggleGpsModal(show) {
    dom.gpsModal.classList.toggle('visible', show);
}

/**
 * Exibe a modal de progresso da rota.
 */
export function showRouteProgressModal() {
    dom.routeProgressModal.classList.remove('hidden');
}

/**
 * Oculta a modal de progresso da rota.
 */
export function hideRouteProgressModal() {
    dom.routeProgressModal.classList.add('hidden');
}

export function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    const logoElement = document.querySelector('h1 img');
    if (logoElement) {
        logoElement.src = isDark ? 'imgs/logodark.webp' : 'imgs/logo.webp';
    }

    // Redesenha a rota para atualizar a cor
    if (state.currentOrigin && state.currentDestination) {
        traceRoute();
    }
}

// Adiciona eventos de clique aos botões de histórico e favoritos
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove a classe 'active' de todas as abas e conteúdos
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Adiciona a classe 'active' à aba clicada e ao conteúdo correspondente
            tab.classList.add('active');
            const targetContentId = tab.id === 'show-history-button' ? 'destination-history-list' : 'destination-favorites-list';
            document.getElementById(targetContentId).classList.add('active');

            // Renderiza a lista apropriada
            const showFavorites = tab.id === 'show-favorites-button';
            // A lógica de renderização foi movida para os modais
        });
    });
}

/**
 * Ativa ou desativa o estado visual do botão de seleção de mapa.
 * @param {string|null} type - 'origin', 'destination' ou null para desativar ambos.
 */
export function setSelectionButtonState(type) {
    if (dom.selectDestinationButton) {
        dom.selectDestinationButton.classList.remove('selection-active');
        dom.mapMessage.style.display = 'none'; // Oculta por padrão

        if (type === 'destination') {
            dom.selectDestinationButton.classList.add('selection-active');
            dom.mapMessage.textContent = 'Clique no mapa para selecionar o destino';
            dom.mapMessage.style.display = 'block';
        }
    }
}

// Chame a função para configurar as abas
setupTabs();

/**
 * Atualiza o console de depuração com novos dados.
 * @param {object} data - O objeto de dados a ser exibido.
 */
export function updateDebugConsole(data) {
    if (dom.debugConsole) {
        dom.debugConsole.textContent = JSON.stringify(data, null, 2);
    }
}

/**
 * Configura a funcionalidade do painel recolhível.
 */
export function setupCollapsiblePanel() {
    const toggleButton = dom.togglePanelButton;
    const panel = dom.collapsiblePanel;
    const mapContainer = dom.mapContainer;

    if (toggleButton && panel && mapContainer) {
        toggleButton.addEventListener('click', () => {
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
                mapContainer.style.height = '50vh';
            } else {
                mapContainer.style.height = '100vh';
            }
            // É crucial invalidar o tamanho do mapa após a transição para que ele se redimensione corretamente.
            setTimeout(() => {
                if (state.map) {
                    state.map.invalidateSize();
                }
            }, 300); // 300ms é a duração da transição
        });
    }
}

/**
 * Mostra uma página específica dentro do painel e esconde as outras.
 * @param {string} pageId - O ID da página a ser exibida.
 */
export function showPage(pageId) {
    const pageContents = document.querySelectorAll('.page-content');
    pageContents.forEach(content => {
        content.classList.add('hidden');
        content.classList.remove('active');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
    }
}

/**
 * Configura um listener para o VisualViewport para ajustar a interface quando o teclado virtual aparece.
 * Isso evita que o painel inferior seja ocultado pelo teclado em dispositivos móveis.
 */
function setupViewportListener() {
    // Verifica se a API VisualViewport é suportada pelo navegador
    if (window.visualViewport) {
        const panelContainer = document.getElementById('panel-container');
        if (!panelContainer) {
            console.error('Elemento #panel-container não encontrado para o ajuste do viewport.');
            return;
        }





        const handleViewportChange = () => {
            // A altura total da janela interna
            const windowHeight = window.innerHeight;
            // A altura da área visível (descontando o teclado, etc.)
            const viewportHeight = window.visualViewport.height;
            
            // Calcula a altura do teclado (ou outro elemento da UI do sistema)
            const keyboardHeight = windowHeight - viewportHeight;

            // Define um threshold para evitar ajustes por pequenas mudanças de UI
            if (keyboardHeight > 50) {
                // Move o painel para cima, para ficar acima do teclado
                panelContainer.style.bottom = `${keyboardHeight}px`;
            } else {
                // Reseta a posição do painel quando o teclado desaparece
                panelContainer.style.bottom = '0px';
            }
        };

       

        // Adiciona o listener para o evento de resize da VisualViewport
        window.visualViewport.addEventListener('resize', handleViewportChange);
        
        // Chama a função uma vez para o caso de o teclado já estar aberto no carregamento da página
        handleViewportChange();
    } else {
        console.warn('A API VisualViewport não é suportada neste navegador. O ajuste do painel pode não funcionar corretamente.');
    }
}

// Chama a função para configurar o listener assim que o script for carregado.
// Como este é um módulo, isso será executado uma vez quando o módulo for importado pela primeira vez.
setupViewportListener();
