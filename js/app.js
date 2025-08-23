import { dom } from './dom.js';
import * as state from './state.js';
import { saveAppState, loadAppState } from './state.js';
import { debounce, formatTime, formatPlaceForDisplay, estimateFare, isMobileDevice } from './utils.js';
import { getLocationByIP, reverseGeocode } from './api.js';
import { initializeMap, addOrMoveMarker, traceRoute, setMapTheme, startLocationTracking, stopLocationTracking } from './map.js';
import { displayAddressSuggestions, toggleMapVisibility, switchPanel, showPushNotification, toggleTheme, toggleGpsModal, setSelectionButtonState } from './ui.js';
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
    dom.destinationNumberInput.value = '';
    delete dom.destinationInput.dataset.lat;
    delete dom.destinationInput.dataset.lng;
    dom.destinationInput.closest('.input-group').classList.remove('input-filled');

    // 3. Desativar o rastreamento de localização se estiver ativo
    if (state.isTrackingLocation) {
        stopLocationTracking();
        dom.toggleLocationButton.classList.remove('active');
    }

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
    dom.submitButton.classList.add('hidden');
    state.resetTripData();
    dom.estimatedDistanceTimeEl.textContent = '';
    dom.routeInfoDisplay.textContent = '';
    dom.routeInfoDisplay.classList.add('hidden');
    
    dom.vehicleButtons.forEach(button => {
        button.querySelector('.vehicle-price').textContent = '';
    });
    
    toggleMapVisibility(false);
}


function setupInitialEventListeners() {
    dom.continueWithoutLoginButton.addEventListener('click', () => {
        dom.welcomeModal.style.display = 'none';
        initializeApp();
    });
}

function handleLocationToggle() {
    if (state.isTrackingLocation) {
        stopLocationTracking();
        dom.toggleLocationButton.classList.remove('active');
    } else {
        dom.originInput.value = 'Buscando sua localização...';
        startLocationTracking();
        dom.toggleLocationButton.classList.add('active');
    }
}

function handleCurrentLocation() {
    toggleGpsModal(false);
    if (!state.isTrackingLocation) {
        startLocationTracking();
        dom.toggleLocationButton.classList.add('active');
    }
}

function setupAppEventListeners() {
    dom.toggleLocationButton.addEventListener('click', handleLocationToggle);

    dom.recenterMapButton.addEventListener('click', () => {
        if (state.routeControl) {
            const bounds = state.routeControl.getBounds();
            if (bounds) {
                state.map.fitBounds(bounds, { padding: [50, 50] });
            }
        } else if (state.currentUserCoords) {
            state.map.setView(state.currentUserCoords, 15);
        } else if (state.currentOrigin) {
            state.map.setView(state.currentOrigin.latlng, 15);
        }
    });

    dom.activateGpsButton.addEventListener('click', handleCurrentLocation);

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

    dom.selectOriginButton.addEventListener('click', () => {
        // Se o rastreamento estiver ativo, desative-o primeiro.
        if (state.isTrackingLocation) {
            stopLocationTracking();
            dom.toggleLocationButton.classList.remove('active');
        }

        const newMode = state.currentSelectionMode === 'origin' ? null : 'origin';
        state.setCurrentSelectionMode(newMode);
        setSelectionButtonState(newMode);
        toggleMapVisibility(newMode !== null);
    });

    dom.selectDestinationButton.addEventListener('click', () => {
        const newMode = state.currentSelectionMode === 'destination' ? null : 'destination';
        state.setCurrentSelectionMode(newMode);
        setSelectionButtonState(newMode);
        toggleMapVisibility(newMode !== null);
    });

    dom.vehicleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const vehicleType = button.dataset.vehicle;
            const estimatedPrice = estimateFare(state.tripData.distance, vehicleType);
            
            state.tripData.vehicle = vehicleType;
            state.tripData.fare = estimatedPrice;
            
            saveAppState(); // Salva o estado após selecionar o veículo

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
    dom.destinationNumberInput.addEventListener('input', () => {
        if (state.currentDestination) {
            state.currentDestination.number = dom.destinationNumberInput.value;
            saveAppState();
        }
    });

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

    const shareButton = document.getElementById('share-button');
    if (shareButton) {
        shareButton.addEventListener('click', async () => {
            if (navigator.share) {
                try {
                    // Buscar o start_url do manifest.json
                    const response = await fetch('manifest.json');
                    const manifest = await response.json();
                    const shareUrl = manifest.start_url || window.location.href;

                    await navigator.share({
                        title: 'Via Já',
                        text: 'Confira este incrível aplicativo de mobilidade!',
                        url: shareUrl
                    });
                    showPushNotification('Aplicativo compartilhado com sucesso!', 'success');
                } catch (error) {
                    console.error('Erro ao compartilhar:', error);
                    showPushNotification('Erro ao compartilhar o aplicativo.', 'error');
                }
            } else {
                showPushNotification('A função de compartilhamento não é suportada neste navegador.', 'info');
            }
        });
    }

    document.querySelectorAll('.address-textarea').forEach(textarea => {
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        });
    });
}

function restoreUIFromState() {
    toggleMapVisibility(state.isMapVisible);

    if (!state.currentOrigin && !state.currentDestination) return;

    if (state.currentOrigin) {
        dom.originInput.value = state.currentOrigin.data.display_name;
        addOrMoveMarker(state.currentOrigin.latlng, 'origin', 'Origem');
        dom.originInput.parentElement.classList.add('input-filled');
    }

    if (state.currentDestination) {
        dom.destinationInput.value = state.currentDestination.data.display_name;
        dom.destinationNumberInput.value = state.currentDestination.number || '';
        addOrMoveMarker(state.currentDestination.latlng, 'destination', 'Destino');
        dom.destinationInput.closest('.input-group').classList.add('input-filled');
    }

    if (state.currentOrigin && state.currentDestination) {
        traceRoute(true); // O 'true' força o ajuste do zoom
        dom.submitButton.disabled = false;
    }

    if (state.tripData.vehicle) {
        // Se um veículo foi selecionado, restaura o painel de status
        const { vehicle, fare, distance, time } = state.tripData;
        dom.statusMessage.textContent = `Procurando ${vehicle} disponível...`;
        dom.statusDistance.textContent = `Distância: ${distance.toFixed(2)} km | Tempo: ${formatTime(time)}`;
        dom.statusPrice.textContent = `Preço estimado: ${fare}`;
        dom.statusOriginText.textContent = state.currentOrigin.data.display_name;
        dom.statusDestinationText.textContent = state.currentDestination.data.display_name;
        switchPanel('ride-status-panel');
    }
}

function applyTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    document.body.classList.toggle('dark', isDark);
    
    const logoElements = document.querySelectorAll('img[alt="Logo Via Já"]');
    logoElements.forEach(logo => {
        logo.src = isDark ? 'imgs/logodark.webp' : 'imgs/logo.webp';
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

async function initializeMapAndLocation(isDark) {
    // 1. Check for saved state and restore if it exists
    if (state.currentOrigin) {
        initializeMap(state.currentOrigin.latlng.lat, state.currentOrigin.latlng.lng, 13, isDark);
        restoreUIFromState();
        return; // Exit after restoring state
    }

    // 2. No saved state, find user location.
    const initializeWithGeneric = () => {
        initializeMap(0, 0, 2, isDark);
        toggleGpsModal(true);
    };

    if (navigator.geolocation) {
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        const onSuccess = (position) => {
            initializeMap(position.coords.latitude, position.coords.longitude, 13, isDark);
        };

        const onError = async () => {
            // Fallback to IP location
            try {
                const ipLocation = await getLocationByIP();
                if (ipLocation) {
                    initializeMap(ipLocation.lat, ipLocation.lng, 13, isDark);
                } else {
                    initializeWithGeneric();
                }
            } catch (error) {
                initializeWithGeneric();
            }
        };

        navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    } else {
        // Geolocation not supported, go straight to fallback
        try {
            const ipLocation = await getLocationByIP();
            if (ipLocation) {
                initializeMap(ipLocation.lat, ipLocation.lng, 13, isDark);
            } else {
                initializeWithGeneric();
            }
        } catch (error) {
            initializeWithGeneric();
        }
    }
}

async function initializeApp() {
    const isDark = document.body.classList.contains('dark');
    setupAppEventListeners();
    renderHistoryList();
    setupPWA();

    loadAppState(); // Carrega o estado salvo

    await initializeMapAndLocation(isDark);

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
        setupOnlineStatusChecker();
    }, 2000); // Mantém a splash por 2 segundos
};

function setupOnlineStatusChecker() {
    const offlineDialog = document.getElementById('offline-dialog');

    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineDialog.classList.add('hidden');
        } else {
            offlineDialog.classList.remove('hidden');
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Verificação inicial
    updateOnlineStatus();

    // Verificação periódica para garantir
    setInterval(updateOnlineStatus, 10000); // Verifica a cada 10 segundos
}
