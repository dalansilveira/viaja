import { dom } from './dom.js';
import * as state from './state.js';
import { saveAppState, loadAppState } from './state.js';
import { debounce, formatTime, formatPlaceForDisplay, estimateFare, isMobileDevice, normalizeText } from './utils.js';
import { getUserLocation, reverseGeocode } from './api.js';
import { initializeMap, addOrMoveMarker, traceRoute, setMapTheme, updateUserLocationOnce, simulateDriverEnRoute, stopDriverSimulation } from './map.js';
import { displayAddressSuggestions, refreshMap, switchPanel, showPushNotification, toggleTheme, toggleGpsModal, setSelectionButtonState, setupCollapsiblePanel, showPage } from './ui.js';
import { saveDestinationToHistory } from './history.js';
import { setupAuthEventListeners } from './auth.js';
import { querySuggestionCache, saveRide, getOngoingRide, updateRideStatus } from './firestore.js';
import { setupPWA } from './pwa.js';
import { auth } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { AppConfig } from './config.js';

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
    state.resetTripData();
    dom.estimatedDistanceTimeEl.textContent = '';
    dom.routeInfoDisplay.textContent = '';
    dom.routeInfoDisplay.classList.add('hidden');
    
    dom.vehicleButtons.forEach(button => {
        button.querySelector('.vehicle-price').textContent = '';
    });
    
    refreshMap();
}

function clearRouteOnly() {
    // Limpa a rota do mapa e da UI
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
    state.resetTripData();
    dom.estimatedDistanceTimeEl.textContent = '';
    dom.routeInfoDisplay.textContent = '';
    dom.routeInfoDisplay.classList.add('hidden');
    
    dom.vehicleButtons.forEach(button => {
        button.querySelector('.vehicle-price').textContent = '';
    });

    // Reseta o estado do destino para permitir uma nova seleção, mas não limpa o input
    state.setCurrentDestination(null);
    if (state.destinationMarker) {
        state.map.removeLayer(state.destinationMarker);
        state.setDestinationMarker(null);
    }
    dom.destinationInput.closest('.input-group').classList.remove('input-filled');
}


function setupInitialEventListeners() {
    dom.continueWithoutLoginButton.addEventListener('click', () => {
        dom.welcomeModal.style.display = 'none';
        initializeApp();
    });
}

function handleCurrentLocation() {
    toggleGpsModal(false);
    updateUserLocationOnce();
}

export function requestRide() {
    if (state.currentOrigin && state.currentDestination) {
        // Abre o painel na página 3
        const panel = dom.collapsiblePanel;
        if (panel && !panel.classList.contains('open')) {
            dom.togglePanelButton.click();
        }
        showPage('page3');

        state.setCurrentSelectionMode(null);
    }
}

const addressPrefixes = [
    'Rua', 'R.', 'Avenida', 'Av.', 'Praça', 'Pç.', 'Travessa', 'Tr.',
    'Estrada', 'Estr.', 'Rodovia', 'Rod.', 'Alameda', 'Al.', 'Largo',
    'Viela', 'Via', 'Trevo', 'Passarela'
];

function generateFakeDriver() {
    const names = ['Carlos', 'Mariana', 'João', 'Ana', 'Lucas', 'Sofia'];
    const cars = [
        { model: 'Fiat Mobi', color: 'Branco' },
        { model: 'Hyundai HB20', color: 'Prata' },
        { model: 'Chevrolet Onix', color: 'Preto' },
        { model: 'Renault Kwid', color: 'Vermelho' }
    ];
    const plates = ['BRA2E19', 'ABC1234', 'XYZ8901', 'RST4567'];
    const photos = [
        'https://i.pravatar.cc/150?img=68',
        'https://i.pravatar.cc/150?img=32',
        'https://i.pravatar.cc/150?img=60',
        'https://i.pravatar.cc/150?img=1'
    ];

    return {
        name: names[Math.floor(Math.random() * names.length)],
        car: cars[Math.floor(Math.random() * cars.length)],
        plate: plates[Math.floor(Math.random() * plates.length)],
        photo: photos[Math.floor(Math.random() * photos.length)]
    };
}

function setupAppEventListeners() {
    let simRunning = false;
    document.getElementById('test-driver-sim').addEventListener('click', () => {
        if (simRunning) {
            stopDriverSimulation();
            simRunning = false;
        } else {
            if (state.currentOrigin) {
                simulateDriverEnRoute(state.currentOrigin.latlng);
                simRunning = true;
            } else {
                showPushNotification('Defina uma origem primeiro.', 'warning');
            }
        }
    });

    dom.toggleLocationButton.addEventListener('click', updateUserLocationOnce);

    dom.recenterMapButton.addEventListener('click', clearFieldsAndMap);

    dom.activateGpsButton.addEventListener('click', handleCurrentLocation);

    dom.cancelGpsButton.addEventListener('click', () => {
        toggleGpsModal(false);
        // Opcional: pode adicionar alguma lógica aqui se o usuário cancelar
    });

    dom.vehicleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const vehicleType = button.dataset.vehicle;
            const estimatedPrice = estimateFare(state.tripData.distance, vehicleType);
            
            state.tripData.vehicle = vehicleType;
            state.tripData.fare = estimatedPrice;
            
            saveAppState();

            // Preenche os dados na página de confirmação
            document.getElementById('confirm-distance').textContent = `${state.tripData.distance.toFixed(2)} km`;
            document.getElementById('confirm-time').textContent = formatTime(state.tripData.time);
            document.getElementById('confirm-vehicle').textContent = vehicleType;
            document.getElementById('confirm-fare').textContent = estimatedPrice;

            // Mostra a página de confirmação
            showPage('page4');
        });
    });

    document.getElementById('back-to-vehicles-button').addEventListener('click', () => {
        showPage('page3');
    });

    document.getElementById('confirm-ride-button').addEventListener('click', async () => {
        const auth = getAuth();
        const userId = auth.currentUser?.uid;
        if (!userId) {
            showPushNotification("Você precisa estar logado para solicitar uma corrida.", "error");
            return;
        }

        const rideData = {
            userId: userId,
            origin: state.currentOrigin,
            destination: state.currentDestination,
            trip: state.tripData
        };

        const rideId = await saveRide(rideData);

        if (rideId) {
            // Salva o destino no histórico APÓS a corrida ser confirmada e salva
            if (state.currentDestination.data) {
                // Cria um objeto "limpo" para o histórico, evitando referências circulares
                const place = state.currentDestination.data;
                const historyEntry = {
                    place_id: place.place_id || `${place.lat},${place.lon}`,
                    display_name: place.display_name,
                    lat: place.lat,
                    lon: place.lon,
                    address: {
                        road: place.address.road || '',
                        suburb: place.address.suburb || '',
                        city: place.address.city || '',
                        state: place.address.state || '',
                        postcode: place.address.postcode || '',
                        country: place.address.country || '',
                        house_number: place.address.house_number || ''
                    }
                };
                console.log("Tentando salvar no histórico:", historyEntry);
                saveDestinationToHistory(historyEntry);
            }

            // Trava a interface para evitar alterações
            dom.destinationInput.disabled = true;
            if (state.originMarker) {
                state.originMarker.dragging.disable();
            }
            if (state.destinationMarker) {
                state.destinationMarker.dragging.disable();
            }
            
            // Lógica para iniciar a busca pela corrida
            dom.statusMessage.textContent = `Procurando ${state.tripData.vehicle} disponível...`;
            dom.statusDistance.textContent = `Distância: ${state.tripData.distance.toFixed(2)} km | Tempo: ${formatTime(state.tripData.time)}`;
            dom.statusPrice.textContent = `Preço estimado: ${state.tripData.fare}`;
            
            if (state.currentOrigin && state.currentOrigin.data) {
                dom.statusOriginText.textContent = state.currentOrigin.data.display_name;
            }
            if (state.currentDestination && state.currentDestination.data) {
                dom.statusDestinationText.textContent = state.currentDestination.data.display_name;
            }
            
            showPage('page5');

            // Simula a aceitação da corrida e mostra a tela do motorista
            setTimeout(() => {
                const driver = generateFakeDriver();
                
                document.getElementById('driver-photo').src = driver.photo;
                document.getElementById('driver-name').textContent = `${driver.name} aceitou sua corrida.`;
                document.getElementById('driver-eta').textContent = 'Chegando em aproximadamente 1 min...';
                document.getElementById('driver-vehicle-model').textContent = `${driver.car.model} - ${driver.car.color}`;
                document.getElementById('driver-vehicle-plate').textContent = driver.plate;

                showPage('page6');

                // Inicia a simulação do motorista no mapa
                if (state.currentOrigin) {
                    simulateDriverEnRoute(state.currentOrigin.latlng);
                }
            }, 2000);
        } else {
            showPushNotification("Ocorreu um erro ao salvar sua corrida. Tente novamente.", "error");
        }
    });

    dom.cancelButton.addEventListener('click', async () => {
        const auth = getAuth();
        const userId = auth.currentUser?.uid;
        if (userId) {
            const ongoingRide = await getOngoingRide(userId);
            if (ongoingRide && ongoingRide.id) {
                const success = await updateRideStatus(ongoingRide.id, 'canceled');
                if (success) {
                    showPushNotification("Sua corrida foi cancelada.", "info");
                } else {
                    showPushNotification("Não foi possível cancelar a corrida. Tente novamente.", "error");
                }
            }
        }

        clearFieldsAndMap();
        const panel = dom.collapsiblePanel;
        if (panel && panel.classList.contains('open')) {
            dom.togglePanelButton.click();
        }
        showPage('page1'); // Volta para a página inicial do painel
    });

    // Força a abertura do teclado em dispositivos móveis de forma agressiva
    dom.destinationInput.addEventListener('touchstart', (e) => {
        // Apenas foca no input, permitindo que outros listeners sejam acionados.
        // e.stopImmediatePropagation(); // Removido para permitir outros listeners
        dom.destinationInput.focus();
    }, { capture: true }); // Usa a fase de captura para ser o primeiro a receber o evento

    dom.destinationInput.addEventListener('focus', (e) => {
        // Lógica do focus listener temporariamente comentada para depuração.
        // const vehiclePage = document.getElementById('page3');
        // const isVehicleSelectionActive = vehiclePage && !vehiclePage.classList.contains('hidden');

        // // CONDIÇÃO: Se já temos um destino E estamos na tela de veículos...
        // if (state.currentDestination && isVehicleSelectionActive) {
        //     // AÇÃO 1: Limpa APENAS a rota, mantendo o texto do input.
        //     clearRouteOnly();
        //     // AÇÃO 2: Volta o painel para a página 2 (sugestões de endereço).
        //     showPage('page2');

        //     // AÇÃO 3: Posiciona o cursor no final do texto para edição.
        //     const input = e.target;
        //     const end = input.value.length;
        //     input.setSelectionRange(end, end);

        //     // AÇÃO 4 (NOVA): Popula a lista de sugestões com base no texto atual.
        //     const abortController = new AbortController();
        //     displayAddressSuggestions(input, dom.destinationSuggestions, abortController.signal);

        //     // AÇÃO 5: Interrompe a função aqui.
        //     return;
        // }

        // // Comportamento original mantido para todos os outros casos.
        // dom.autocompleteGhost.style.display = 'block';
        // const abortController = new AbortController();
        // displayAddressSuggestions(e.target, dom.destinationSuggestions, abortController.signal);
    });

    dom.destinationInput.addEventListener('blur', () => {
        // Usa um pequeno atraso para garantir que o evento 'mousedown' no fantasma possa ser acionado
        // antes que o elemento seja ocultado. O e.preventDefault() no mousedown deve prevenir o blur,
        // mas isso funciona como uma camada extra de segurança.
        setTimeout(() => {
            dom.autocompleteGhost.style.display = 'none';
        }, 150);
    });

    let currentAbortController;
    let currentInlineSuggestion = null; // Variável para armazenar a sugestão completa

    dom.destinationInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value;
        dom.autocompleteGhost.value = '';
        currentInlineSuggestion = null; // Reseta a sugestão a cada input

        if (state.currentDestination) return;

        // Cancela a requisição anterior se houver uma em andamento
        if (currentAbortController) {
            currentAbortController.abort();
        }
        // Cria um novo AbortController para a requisição atual
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // Lógica de autocompletar in-line (consulta o cache)
        const findSuggestionAndDisplay = async () => {
            // Se o usuário já digitou um número, não mostra a sugestão in-line.
            const hasNumber = /, \d+$/.test(query);
            if (hasNumber) {
                return;
            }

            if (query.length < AppConfig.MIN_GHOST_QUERY_LENGTH) {
                return;
            }

            let suggestion = null;
            
            // Cria uma lista de possíveis buscas, começando pela busca direta
            const searchTerms = [query, ...addressPrefixes.map(p => `${p} ${query}`)];

            for (const term of searchTerms) {
                console.log(`[DEBUG] Tentando consultar cache com: "${term}"`);
                suggestion = await querySuggestionCache(term);
                if (suggestion) {
                    console.log(`[DEBUG] Sugestão encontrada para "${term}":`, suggestion);
                    break; // Encontrou uma correspondência, para o loop
                }
            }

            if (suggestion) {
                // Armazena a sugestão completa e correta para ser usada ao aceitar.
                currentInlineSuggestion = suggestion.rua;

                // Encontra a parte da sugestão que corresponde à busca (com ou sem prefixo)
                const normalizedQuery = normalizeText(query);
                const normalizedSuggestion = normalizeText(suggestion.rua);
                
                let suggestionMatch = '';
                if (normalizedSuggestion.includes(normalizedQuery)) {
                    const startIndex = normalizedSuggestion.indexOf(normalizedQuery);
                    suggestionMatch = suggestion.rua.substring(startIndex);
            }
            

        } else {
                console.log(`[DEBUG] Nenhuma sugestão encontrada para "${query}" com ou sem prefixos.`);
            }
        };

        findSuggestionAndDisplay();

        // Lógica da lista de sugestões (consulta a API com o signal)
        displayAddressSuggestions(e.target, dom.destinationSuggestions, signal);

        if (query === '') {
            state.setCurrentDestination(null);
            if (state.destinationMarker) {
                state.map.removeLayer(state.destinationMarker);
                state.setDestinationMarker(null);
            }
            traceRoute(); // Limpa a rota e os círculos
            dom.destinationInput.closest('.input-group').classList.remove('input-filled');
        }
    }, AppConfig.INPUT_DEBOUNCE_DELAY));

    const handleGhostTextCompletion = (e) => {
        //  console.log(`Evento '${e.type}' disparado no texto fantasma.`);
        // Previne o comportamento padrão (como perder o foco do input)
        e.preventDefault();

        if (currentInlineSuggestion) {
            let finalValue = currentInlineSuggestion;
            const hasNumber = /, \d+$/.test(finalValue);

            if (!hasNumber) {
                finalValue += ', Nº ';
            }

            dom.destinationInput.value = finalValue;
            dom.autocompleteGhost.value = '';
            currentInlineSuggestion = null;

            // Dispara a busca de sugestões com o valor completo
            const abortController = new AbortController();
            displayAddressSuggestions(dom.destinationInput, dom.destinationSuggestions, abortController.signal);

            // Foca no input e move o cursor para o final
            dom.destinationInput.focus();
            dom.destinationInput.setSelectionRange(finalValue.length, finalValue.length);
        }
    };

    dom.autocompleteGhost.addEventListener('mousedown', handleGhostTextCompletion);
    dom.autocompleteGhost.addEventListener('touchstart', handleGhostTextCompletion);

    dom.destinationInput.addEventListener('keydown', (e) => {
        // Usa a sugestão completa armazenada ao invés do valor do "fantasma"
        if ((e.key === 'Tab' || e.key === 'Enter') && currentInlineSuggestion) {
            e.preventDefault();

            let finalValue = currentInlineSuggestion;
            const hasNumber = /, \d+$/.test(finalValue);

            if (!hasNumber) {
                finalValue += ', Nº ';
            }

            dom.destinationInput.value = finalValue;
            dom.autocompleteGhost.value = '';
            currentInlineSuggestion = null; // Limpa a sugestão após o uso

            // Cria um novo AbortController para a nova busca
            const abortController = new AbortController();
            displayAddressSuggestions(dom.destinationInput, dom.destinationSuggestions, abortController.signal);

            // Move o cursor para o final do texto
            dom.destinationInput.focus();
            dom.destinationInput.setSelectionRange(finalValue.length, finalValue.length);
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
    }

    if (state.tripData.vehicle) {
        // Se um veículo foi selecionado, restaura o painel de status
        const { vehicle, fare, distance, time } = state.tripData;
        dom.statusMessage.textContent = `Procurando ${vehicle} disponível...`;
        dom.statusDistance.textContent = `Distância: ${distance.toFixed(2)} km | Tempo: ${formatTime(time)}`;
        dom.statusPrice.textContent = `Preço estimado: ${fare}`;
        dom.statusOriginText.textContent = state.currentOrigin.data.display_name;
        dom.statusDestinationText.textContent = state.currentDestination.data.display_name;
        showPage('page5');
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
    dom.loadingModal.classList.remove('hidden'); // Mostra a modal de carregamento

    let initialCoords = null;
    let initialZoom = 2;

    // 1. Tenta obter a localização precisa do usuário primeiro
    if (!initialCoords) {
        try {
            const userLocation = await getUserLocation();
            if (userLocation) {
                initialCoords = { lat: userLocation.lat, lng: userLocation.lng };
                initialZoom = 15; // Zoom maior para localização precisa
            }
        } catch (error) {
            console.warn("Não foi possível obter a localização precisa via GPS. O usuário pode ter negado a permissão.", error);
        }
    }
    
    // 3. Se ainda não houver coordenadas, usa um padrão genérico
    if (!initialCoords) {
        initialCoords = { lat: 0, lng: 0 };
    }

    // 4. Inicializa o mapa com as melhores coordenadas encontradas
    initializeMap(initialCoords.lat, initialCoords.lng, initialZoom, isDark);

    // 6. SEMPRE tenta iniciar o rastreamento de localização por padrão, se disponível
    if (navigator.geolocation) {
        await updateUserLocationOnce(); // Espera a localização ser atualizada
        // Se ainda não tivermos uma origem definida, o rastreamento cuidará disso
    } else {
        // Se não houver geolocalização e não foi possível encontrar a localização por outros meios, mostra o modal
        if (initialZoom === 2) { // Isso significa que estamos na localização genérica 0,0
            toggleGpsModal(true);
        }
    }

    dom.loadingModal.classList.add('hidden'); // Esconde a modal de carregamento
}

async function initializeApp() {
    const isDark = document.body.classList.contains('dark');
    setupAppEventListeners();
    setupCollapsiblePanel();
    setupPWA();

    // Impede que o Leaflet "capture" os eventos de clique nos contêineres de input
  /*  const inputContainers = [
        document.getElementById('destination-container'),
        document.getElementById('panel-container')
    ];
    inputContainers.forEach(container => {
        if (container) {
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);
        }
    });*/

    // Desativa a restauração de estado para evitar problemas
    localStorage.removeItem('viaja_appState');
    
    await initializeMapAndLocation(isDark);

    // Verifica se é a primeira visita
    const hasVisited = localStorage.getItem('hasVisited');
    if (!hasVisited) {
        const panel = dom.collapsiblePanel;
        if (panel && !panel.classList.contains('open')) {
            dom.togglePanelButton.click();
        }
        showPage('page1');
        localStorage.setItem('hasVisited', 'true');
    }

    // Garante que o painel esteja aberto e foca no campo de destino após a inicialização
    const panel = dom.collapsiblePanel;
    if (panel && !panel.classList.contains('open')) {
        dom.togglePanelButton.click();
    }

    
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
