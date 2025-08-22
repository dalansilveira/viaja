import { dom } from './dom.js';
import * as state from './state.js';
import { debounce, formatTime, formatPlaceForDisplay, estimateFare, isMobileDevice } from './utils.js';
import { getLocationByIP, reverseGeocode } from './api.js';
import { initializeMap, addOrMoveMarker, traceRoute, setMapTheme } from './map.js';
import { displayAddressSuggestions, toggleMapVisibility, switchPanel, showPushNotification, toggleTheme, toggleGpsModal } from './ui.js';
import { renderHistoryList, saveDestinationToHistory } from './history.js';
import { setupAuthEventListeners } from './auth.js';
import { setupPWA } from './pwa.js';

function clearFieldsAndMap() {
    // 1. Limpar estado e marcador de origem
    state.setCurrentOrigin(null);
    if (state.originMarker) {
        state.map.removeLayer(state.originMarker);
        state.setOriginMarker(null);
    }
    dom.originInput.value = '';
    delete dom.originInput.dataset.lat;
    delete dom.originInput.dataset.lng;
    dom.originInput.parentElement.classList.remove('input-filled');

    // 2. Limpar estado e marcador de destino
    state.setCurrentDestination(null);
    if (state.destinationMarker) {
        state.map.removeLayer(state.destinationMarker);
        state.setDestinationMarker(null);
    }
    dom.destinationInput.value = '';
    delete dom.destinationInput.dataset.lat;
    delete dom.destinationInput.dataset.lng;
    dom.destinationInput.closest('.input-group').classList.remove('input-filled');


    // 4. Limpar a rota do mapa e da UI
    if (state.routeControl) {
        state.map.removeControl(state.routeControl);
        state.setRouteControl(null);
    }
    if (state.startCircle) {
        state.map.removeLayer(state.startCircle);
        state.setStartCircle(null);
    }
    if (state.endCircle) {
        state.map.removeLayer(state.endCircle);
        state.setEndCircle(null);
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

function setupInitialEventListeners() {
    dom.continueWithoutLoginButton.addEventListener('click', () => {
        dom.welcomeModal.style.display = 'none';
        initializeApp();
    });
}

function setupAppEventListeners() {
    dom.activateGpsButton.addEventListener('click', () => {
        toggleGpsModal(false);
        handleCurrentLocation(); // Tenta novamente obter a localização
    });

    dom.cancelGpsButton.addEventListener('click', () => {
        toggleGpsModal(false);
        // Opcional: pode adicionar alguma lógica aqui se o usuário cancelar
    });

    dom.submitButton.addEventListener('click', () => {
        if (state.currentOrigin && state.currentDestination) {
            // Salva o destino primário no histórico ao solicitar a corrida
            if (state.currentDestination.data) {
                saveDestinationToHistory(state.currentDestination.data);
            }
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

    dom.selectDestinationButton.addEventListener('click', (e) => {
        state.setCurrentSelectionMode('destination');
        toggleMapVisibility(true);
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

        if (!dom.destinationInput.contains(e.target) && !dom.destinationSuggestions.contains(e.target)) {
            dom.destinationSuggestions.style.display = 'none';
        }
    });

    dom.themeToggle.addEventListener('click', () => {
        toggleTheme();
        setMapTheme(document.body.classList.contains('dark'));
    });
    dom.toggleMapButton.addEventListener('click', () => toggleMapVisibility(null, true));
}

function applyTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    document.body.classList.toggle('dark', isDark);
    
    const logoElements = document.querySelectorAll('img[alt="Logo Via Já"]');
    logoElements.forEach(logo => {
        logo.src = isDark ? 'imgs/logodark.png' : 'imgs/logo.png';
    });
}

function checkAuthAndInitialize() {
    // Simulação: verificar se o usuário está logado (ex: checando um token no localStorage)
    const isLoggedIn = localStorage.getItem('user_token');

    if (isLoggedIn) {
        dom.welcomeModal.style.display = 'none';
        initializeApp();
    } else {
        dom.welcomeModal.style.display = 'flex';
        dom.loginPhoneInput.focus(); // Foco no campo de telefone
    }
}

async function initializeApp() {
    const isDark = document.body.classList.contains('dark');
    setupAppEventListeners();
    renderHistoryList();
    setupPWA();

    // A inicialização do mapa e do GPS só ocorre após a interação com o modal
    if (isMobileDevice()) {
        // Em dispositivos móveis, tenta usar o GPS e solicita ativação se necessário
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                state.setCurrentUserCoords({ lat: latitude, lng: longitude });
                initializeMap(latitude, longitude, isDark);
                const fullAddressData = await reverseGeocode(latitude, longitude);
                const addressText = formatPlaceForDisplay(fullAddressData) || 'Sua Localização';
                fullAddressData.display_name = addressText;
                state.setCurrentOrigin({ latlng: { lat: latitude, lng: longitude }, data: fullAddressData });
                dom.originInput.value = addressText;
                dom.originInput.parentElement.classList.add('input-filled');
            },
            async (error) => {
                toggleGpsModal(true); // Exibe o modal de ativação do GPS
                dom.originInput.readOnly = false;
                dom.originInput.placeholder = 'Digite o endereço de origem';
                initializeMap(state.defaultCoords[0], state.defaultCoords[1], isDark);
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    } else {
        // Em desktops, usa a geolocalização por IP diretamente
        const ipLocation = await getLocationByIP();
        if (ipLocation) {
            state.setCurrentUserCoords(ipLocation);
            initializeMap(ipLocation.lat, ipLocation.lng, isDark);
            const fullAddressData = await reverseGeocode(ipLocation.lat, ipLocation.lng);
            const addressText = formatPlaceForDisplay(fullAddressData) || 'Localização Aproximada';
            fullAddressData.display_name = addressText;
            state.setCurrentOrigin({ latlng: ipLocation, data: fullAddressData });
            dom.originInput.value = addressText;
            dom.originInput.parentElement.classList.add('input-filled');
        } else {
            showPushNotification("Não foi possível obter a localização.", "error", 4000);
            initializeMap(state.defaultCoords[0], state.defaultCoords[1], isDark);
        }
        dom.originInput.readOnly = false; // Permite edição em desktop
    }

    // Foca no campo de destino após a inicialização
    dom.destinationInput.focus();
}

window.onload = () => {
    // Aplica o tema imediatamente para garantir que a splash screen tenha a aparência correta
    applyTheme();

    const splashScreen = document.getElementById('splash-screen');
    
    // Garante que a splash screen esteja visível no início
    splashScreen.style.opacity = '1';

    // Simula o carregamento de preferências e outros dados
    setTimeout(() => {
        // Inicia a transição de desaparecimento
        splashScreen.style.opacity = '0';
        
        // Remove a splash screen do DOM após a transição para não interferir com cliques
        splashScreen.addEventListener('transitionend', () => {
            splashScreen.remove();
        });

        // Continua com a inicialização do app
        setupAuthEventListeners();
        setupInitialEventListeners();
        checkAuthAndInitialize();
    }, 2000); // Mantém a splash por 2 segundos
};
