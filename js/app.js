import { dom } from './dom.js';
import * as state from './state.js';
import { debounce, formatTime, formatPlaceForDisplay, estimateFare } from './utils.js';
import { getLocationByIP, reverseGeocode } from './api.js';
import { initializeMap, addOrMoveMarker, traceRoute, setMapTheme } from './map.js';
import { displayAddressSuggestions, toggleMapVisibility, switchPanel, showPushNotification, toggleTheme } from './ui.js';
import { renderHistoryList } from './history.js';
import { setupAuthEventListeners } from './auth.js';
import { setupPWA } from './pwa.js';

function clearFieldsAndMap() {
    // Limpa o estado da origem
    state.setCurrentOrigin(null);
    if (state.originMarker) {
        state.map.removeLayer(state.originMarker);
        state.setOriginMarker(null);
    }
    dom.originInput.value = '';

    // Limpa todos os destinos
    const destinationContainer = dom.destinationContainer;
    const destinationItems = destinationContainer.querySelectorAll('.destination-item');
    
    // Remove todos os itens de destino, exceto o primeiro
    destinationItems.forEach((item, index) => {
        if (index > 0) {
            item.remove();
        }
    });

    // Limpa o primeiro campo de destino
    const firstDestinationInput = destinationContainer.querySelector('.destination-input');
    if (firstDestinationInput) {
        firstDestinationInput.value = '';
        delete firstDestinationInput.dataset.lat;
        delete firstDestinationInput.dataset.lng;
    }

    // Remove todos os marcadores de destino do mapa e do estado
    if (state.destinationMarkers) {
        Object.keys(state.destinationMarkers).forEach(id => {
            state.removeDestinationMarker(id);
        });
    }
    state.setCurrentDestination(null);


    // Limpa a rota e a UI
    if (state.routeControl) {
        state.map.removeControl(state.routeControl);
        state.setRouteControl(null);
    }
    dom.submitButton.disabled = true;
    state.resetTripData();
    dom.estimatedDistanceTimeEl.textContent = '';
    dom.routeInfoDisplay.textContent = '';
    dom.routeInfoDisplay.classList.add('hidden');
    
    dom.vehicleButtons.forEach(button => {
        button.querySelector('.vehicle-price').textContent = '';
    });
    
    toggleMapVisibility(false);
}

async function handleCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            state.setCurrentUserCoords({ lat: latitude, lng: longitude });

            toggleMapVisibility(true);

            const fullAddressData = await reverseGeocode(latitude, longitude);
            const addressText = formatPlaceForDisplay(fullAddressData) || 'Sua Localização';

            fullAddressData.display_name = addressText;
            state.setCurrentOrigin({ latlng: { lat: latitude, lng: longitude }, data: fullAddressData });
            dom.originInput.value = addressText;

            const targetIconHtml = `<svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-blue-500 animate-pulse" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`;
            const targetIcon = L.divIcon({
                html: targetIconHtml,
                className: 'leaflet-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            if (state.originMarker) state.map.removeLayer(state.originMarker);
            const marker = L.marker(state.currentOrigin.latlng, { icon: targetIcon }).addTo(state.map);
            state.setOriginMarker(marker);

            state.map.setView([latitude, longitude], 16);
            if (state.currentDestination) {
                traceRoute();
            }
            dom.submitButton.disabled = !state.currentDestination;
            showPushNotification("Localização atual definida como origem", "success", 3000);
        },
        (error) => {
            console.error("Erro ao obter a localização: ", error);
            let message = "Não foi possível obter sua localização.";
            if (error.code === error.PERMISSION_DENIED) {
                message = "Você negou o acesso à localização.";
            }
            showPushNotification(message, "error", 5000);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function setupDragAndDrop() {
    const container = dom.destinationContainer;
    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
        // Permite arrastar apenas se não for o primeiro item
        if (e.target.classList.contains('destination-item') && e.target !== container.querySelector('.destination-item')) {
            draggedItem = e.target;
            setTimeout(() => {
                draggedItem.style.opacity = '0.5';
            }, 0);
        } else {
            e.preventDefault();
        }
    });

    container.addEventListener('dragend', (e) => {
        if (draggedItem) {
            setTimeout(() => {
                draggedItem.style.opacity = '1';
                draggedItem = null;
            }, 0);
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
            container.appendChild(draggedItem);
        } else {
            container.insertBefore(draggedItem, afterElement);
        }
    });

    container.addEventListener('drop', () => {
        traceRoute();
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.destination-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
}

function setupEventListeners() {
    setupDragAndDrop();
    dom.submitButton.addEventListener('click', () => {
        if (state.currentOrigin && state.currentDestination) {
            switchPanel('vehicle-selection-panel');
            state.setCurrentSelectionMode(null);
        }
    });

    dom.clearButton.addEventListener('click', clearFieldsAndMap);
    dom.currentLocationButton.addEventListener('click', handleCurrentLocation);

    dom.selectOriginButton.addEventListener('click', () => {
        state.setCurrentSelectionMode('origin');
        toggleMapVisibility(true);
    });

    dom.selectDestinationButton.addEventListener('click', () => {
        state.setCurrentSelectionMode('destination');
        toggleMapVisibility(true);
    });

    dom.addDestinationButton.addEventListener('click', () => {
        const destinationContainer = dom.destinationContainer;
        const allDestinationInputs = destinationContainer.querySelectorAll('.destination-input');

        let allFilled = true;
        allDestinationInputs.forEach(input => {
            if (input.value.trim() === '') {
                allFilled = false;
            }
        });

        if (!allFilled) {
            showPushNotification('Preencha todas as paradas antes de adicionar uma nova.', 'warning');
            return;
        }

        const originalItem = destinationContainer.querySelector('.destination-item');
        const newItem = originalItem.cloneNode(true);
        const destId = `dest_${Date.now()}`;

        newItem.classList.add('mt-2');
        newItem.dataset.id = destId;

        const newInput = newItem.querySelector('.destination-input');
        newInput.value = '';
        newInput.id = `destination-input-${destId}`;
        newInput.dataset.id = destId;

        const newSuggestions = newItem.querySelector('.autocomplete-suggestions');
        newSuggestions.id = `destination-suggestions-${destId}`;
        newSuggestions.innerHTML = '';
        newInput.addEventListener('input', debounce((e) => displayAddressSuggestions(e.target, newSuggestions), 300));

        const buttonContainer = newItem.querySelector('.flex');
        const selectOnMapButton = newItem.querySelector('#select-destination-button');
        if (selectOnMapButton) {
            selectOnMapButton.id = `select-destination-button-${destId}`;
            selectOnMapButton.addEventListener('click', () => {
                state.setCurrentSelectionMode('destination');
                state.setActiveDestinationInput(newInput);
                toggleMapVisibility(true);
            });
        }

        const addButton = newItem.querySelector('#add-destination-button');
        if (addButton) {
            addButton.remove();
        }

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'select-in-field-button';
        removeButton.title = 'Remover parada';
        removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>`;
        removeButton.addEventListener('click', () => {
            state.removeDestinationMarker(destId, state.map);
            newItem.remove();
            traceRoute();
        });
        
        if (buttonContainer) {
            buttonContainer.appendChild(removeButton);
        }

        destinationContainer.appendChild(newItem);
    });

    dom.vehicleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const vehicleType = button.dataset.vehicle;
            const estimatedPrice = estimateFare(state.tripData.distance, vehicleType);
            
            state.tripData.vehicle = vehicleType;
            state.tripData.fare = estimatedPrice;
            
            dom.statusMessage.textContent = `Procurando ${vehicleType} disponível...`;
            dom.statusDistance.textContent = `Distância: ${state.tripData.distance.toFixed(2)} km | Tempo: ${formatTime(state.tripData.time)}`;
            dom.statusPrice.textContent = `Preço estimado: ${estimatedPrice}`;
            
            if (state.currentOrigin && state.currentOrigin.data) {
                dom.statusOriginText.textContent = state.currentOrigin.data.display_name;
            }
            if (state.currentDestination && state.currentDestination.data) {
                dom.statusDestinationText.textContent = state.currentDestination.data.display_name;
            }
            
            switchPanel('ride-status-panel');
        });
    });

    dom.backToFormButton.addEventListener('click', () => switchPanel('ride-request-panel'));
    dom.cancelButton.addEventListener('click', () => {
        switchPanel('ride-request-panel');
        clearFieldsAndMap();
    });

    dom.originInput.addEventListener('input', debounce((e) => displayAddressSuggestions(e.target, dom.originSuggestions), 300));
    dom.destinationInput.addEventListener('input', debounce((e) => displayAddressSuggestions(e.target, dom.destinationSuggestions), 300));

    document.addEventListener('click', (e) => {
        // Se o clique não foi dentro de um input de origem ou de seu container de sugestões
        if (!dom.originInput.contains(e.target) && !dom.originSuggestions.contains(e.target)) {
            dom.originSuggestions.style.display = 'none';
        }

        // Itera sobre todos os itens de destino
        const destinationItems = dom.destinationContainer.querySelectorAll('.destination-item');
        destinationItems.forEach(item => {
            const input = item.querySelector('.destination-input');
            const suggestions = item.querySelector('.autocomplete-suggestions');
            if (input && suggestions) {
                if (!input.contains(e.target) && !suggestions.contains(e.target)) {
                    suggestions.style.display = 'none';
                }
            }
        });
    });

    dom.themeToggle.addEventListener('click', () => {
        toggleTheme();
        setMapTheme(document.body.classList.contains('dark'));
    });
    dom.toggleMapButton.addEventListener('click', () => toggleMapVisibility(null, true));
}

async function initializeApp() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    if (isDark) {
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
    }
    
    const logoElement = document.querySelector('h1 img');
    if (logoElement) {
        logoElement.src = isDark ? 'imgs/logodark.png' : 'imgs/logo.png';
    }
    
    renderHistoryList();
    setupEventListeners();
    setupAuthEventListeners();
    setupPWA();

    const ipLocation = await getLocationByIP();
    if (ipLocation) {
        state.setCurrentUserCoords(ipLocation);
        initializeMap(ipLocation.lat, ipLocation.lng, isDark);
    } else {
        showPushNotification("Não foi possível obter a localização. Usando localização padrão.", "warning", 4000);
        initializeMap(state.defaultCoords[0], state.defaultCoords[1], isDark);
    }
}

window.onload = initializeApp;
