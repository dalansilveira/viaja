import { dom } from './dom.js';
import * as state from './state.js';
import { saveAppState, loadAppState } from './state.js';
import { debounce, formatTime, formatPlaceForDisplay, estimateFare, isMobileDevice } from './utils.js';
import { getLocationByIP, reverseGeocode } from './api.js';
import { initializeMap, addOrMoveMarker, traceRoute, setMapTheme, startLocationTracking, stopLocationTracking } from './map.js';
import { displayAddressSuggestions, refreshMap, switchPanel, showPushNotification, toggleTheme, toggleGpsModal, setSelectionButtonState } from './ui.js';
import { saveDestinationToHistory } from './history.js';
import { setupAuthEventListeners } from './auth.js';
import { setupPWA } from './pwa.js';
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function clearFieldsAndMap() {
    // 1. Limpar estado e marcador de destino
    state.setCurrentDestination(null);
    if (state.destinationMarker) {
        state.map.removeLayer(state.destinationMarker);
        state.setDestinationMarker(null);
    }
    dom.destinationInput.value = '';
    delete dom.destinationInput.dataset.lat;
    delete dom.destinationInput.dataset.lng;
    dom.destinationInput.closest('.input-group').classList.remove('input-filled');

    // 2. Limpar a rota do mapa e da UI
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
    
    refreshMap();
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

function requestRide() {
    if (state.currentOrigin && state.currentDestination) {
        // Salva o destino primário no histórico ao solicitar a corrida
        if (state.currentDestination.data) {
            saveDestinationToHistory(state.currentDestination.data);
        }
        dom.vehicleSelectionModal.classList.remove('hidden');
        state.setCurrentSelectionMode(null);
    }
}

function setupAppEventListeners() {
    dom.toggleLocationButton.addEventListener('click', handleLocationToggle);

    dom.recenterMapButton.addEventListener('click', clearFieldsAndMap);

    dom.activateGpsButton.addEventListener('click', handleCurrentLocation);

    dom.cancelGpsButton.addEventListener('click', () => {
        toggleGpsModal(false);
        // Opcional: pode adicionar alguma lógica aqui se o usuário cancelar
    });

    dom.submitButton.addEventListener('click', requestRide);
    dom.goButton.addEventListener('click', requestRide);


    dom.closeVehicleSelectionModalButton.addEventListener('click', () => {
        dom.vehicleSelectionModal.classList.add('hidden');
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
            
            dom.vehicleSelectionModal.classList.add('hidden');
            switchPanel('ride-status-panel');
        });
    });

    dom.cancelButton.addEventListener('click', () => {
        switchPanel('ride-request-panel');
        clearFieldsAndMap();
    });

    dom.destinationInput.addEventListener('input', debounce((e) => {
        displayAddressSuggestions(e.target, dom.destinationSuggestions);
        if (e.target.value === '') {
            state.setCurrentDestination(null);
            if (state.destinationMarker) {
                state.map.removeLayer(state.destinationMarker);
                state.setDestinationMarker(null);
            }
            traceRoute(); // Limpa a rota e os círculos
            dom.destinationInput.closest('.input-group').classList.remove('input-filled');
        }
    }, 300));

    document.addEventListener('click', (e) => {
        // Se o clique não foi dentro de um input de destino ou de seu container de sugestões
        if (!dom.destinationInput.contains(e.target) && !dom.destinationSuggestions.contains(e.target)) {
            dom.destinationSuggestions.style.display = 'none';
        }
    });

    dom.themeToggle.addEventListener('click', () => {
        toggleTheme();
        setMapTheme(document.body.classList.contains('dark'));
    });

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
    refreshMap();

    if (!state.currentOrigin && !state.currentDestination) return;

    if (state.currentOrigin) {
        addOrMoveMarker(state.currentOrigin.latlng, 'origin', 'Origem');
    }

    if (state.currentDestination) {
        dom.destinationInput.value = state.currentDestination.data.display_name;
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
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Usuário está logado
            console.log("Usuário logado:", user.uid);
            localStorage.setItem('user_uid', user.uid);
            if (user.phoneNumber) {
                localStorage.setItem('user_phone', user.phoneNumber.replace('+55', ''));
            }
            dom.welcomeModal.style.display = 'none';
            initializeApp();
        } else {
            // Usuário está deslogado
            console.log("Nenhum usuário logado.");
            localStorage.removeItem('user_uid');
            localStorage.removeItem('user_phone');
            dom.welcomeModal.style.display = 'flex';
            dom.loginPhoneInput.focus();
        }
    });
}

async function initializeMapAndLocation(isDark) {
    let initialCoords = null;
    let initialZoom = 2;

    // 1. Tenta obter as coordenadas do estado salvo
    if (state.currentOrigin) {
        initialCoords = state.currentOrigin.latlng;
        initialZoom = 13;
    }

    // 2. Se não houver estado salvo, tenta obter a localização por IP como um fallback rápido
    if (!initialCoords) {
        try {
            const ipLocation = await getLocationByIP();
            if (ipLocation) {
                initialCoords = { lat: ipLocation.lat, lng: ipLocation.lng };
                initialZoom = 13;
            }
        } catch (error) {
            console.error("Não foi possível obter a localização por IP na inicialização", error);
        }
    }
    
    // 3. Se ainda não houver coordenadas, usa um padrão genérico
    if (!initialCoords) {
        initialCoords = { lat: 0, lng: 0 };
    }

    // 4. Inicializa o mapa com as melhores coordenadas encontradas
    initializeMap(initialCoords.lat, initialCoords.lng, initialZoom, isDark);

    // 5. Se havia um estado salvo, restaura a UI completa
    if (state.currentOrigin) {
        restoreUIFromState();
    }

    // 6. SEMPRE tenta iniciar o rastreamento de localização por padrão, se disponível
    if (navigator.geolocation) {
        startLocationTracking();
        dom.toggleLocationButton.classList.add('active');
        // Se ainda não tivermos uma origem definida, o rastreamento cuidará disso
    } else {
        // Se não houver geolocalização e não foi possível encontrar a localização por outros meios, mostra o modal
        if (initialZoom === 2) { // Isso significa que estamos na localização genérica 0,0
            toggleGpsModal(true);
        }
    }
}

async function initializeApp() {
    const isDark = document.body.classList.contains('dark');
    setupAppEventListeners();
    setupPWA();

    // Limpa o estado salvo anteriormente para garantir que não seja restaurado
    localStorage.removeItem('viaja_appState');
    loadAppState(); // Agora não fará nada, mas mantemos a chamada por segurança

    await initializeMapAndLocation(isDark);

    // Foca no campo de destino após a inicialização
    dom.destinationInput.focus();
}

// A função window.onload foi movida para o final do arquivo para garantir que todas as funções estejam definidas.
// No entanto, a lógica de autenticação precisa ser ajustada.
// A chamada para setupRecaptcha() será feita a partir daqui.

document.addEventListener('DOMContentLoaded', () => {
    // Aplica o tema imediatamente
    applyTheme();

    const splashScreen = document.getElementById('splash-screen');
    splashScreen.style.opacity = '1';

    // Configura os listeners de autenticação que dependem do DOM
    setupAuthEventListeners();
    setupInitialEventListeners();
    setupOnlineStatusChecker();

    // A verificação de autenticação agora decide o que fazer a seguir
    checkAuthAndInitialize();

    // Esconde a splash screen após uma pequena espera
    setTimeout(() => {
        splashScreen.style.opacity = '0';
        splashScreen.addEventListener('transitionend', () => splashScreen.remove());
    }, 1500);
});

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

window.addEventListener('storage', (event) => {
    if (event.key === 'viaja_appState') {
        console.log('Estado da aplicação atualizado em outra aba. Recarregando...');
        loadAppState();
        restoreUIFromState();
    }
});
