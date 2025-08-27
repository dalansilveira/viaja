import * as state from './state.js';
import { dom } from './dom.js';
import { handleMapClick, showPushNotification, showPage } from './ui.js';
import { formatTime, estimateFare, formatPlaceForDisplay, formatAddressForTooltip, debounce } from './utils.js';
import { reverseGeocode, getUserLocation } from './api.js';

let currentTileLayer;
let animationFrameId = null;

/**
 * Define o tema do mapa (claro ou escuro) usando Stadia Maps.
 * @param {boolean} isDark - True para tema escuro, false para tema claro.
 */
export function setMapTheme(isDark) {
    if (!state.map) return;

    if (currentTileLayer) {
        state.map.removeLayer(currentTileLayer);
    }

    const apiKey = 'ee0be6db-d7a2-402c-bb48-6c0c1d155df6';
    const styleId = isDark ? 'alidade_smooth_dark' : 'alidade_smooth';
    const tileUrl = `https://tiles.stadiamaps.com/tiles/${styleId}/{z}/{x}/{y}.png?api_key=${apiKey}`;
    const attribution = '© <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> © <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="http://openstreetmap.org" target="_blank">OpenStreetMap</a> contributors';

    currentTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: attribution
    }).addTo(state.map);

    // Garante que o filtro de inversão de cor seja removido, caso exista
    const tilePane = state.map.getPane('tilePane');
    if (tilePane) {
        tilePane.style.filter = 'none';
    }
}

/**
 * Inicializa o mapa com as coordenadas e o zoom fornecidos.
 * @param {number} lat - Latitude inicial.
 * @param {number} lng - Longitude inicial.
 * @param {number} [zoom=13] - Nível de zoom inicial.
 * @param {boolean} isDark - Se o tema inicial deve ser escuro.
 */
export function initializeMap(lat, lng, zoom = 13, isDark) {
    if (state.map) {
        state.map.remove();
    }
    const mapInstance = L.map('map', { zoomControl: false }).setView([lat, lng], zoom);
    state.setMap(mapInstance);

    setMapTheme(isDark);

    mapInstance.on('click', handleMapClick);
}

/**
 * Adiciona ou move um marcador no mapa.
 * @param {object} coords - Coordenadas do marcador.
 * @param {string} type - Tipo de marcador ('origin' ou 'destination').
 * @param {string} name - Nome para a tooltip do marcador.
 * @param {boolean} isDraggable - Se o marcador pode ser arrastado.
 */
export function addOrMoveMarker(coords, type, name, isDraggable = true) {
    let marker = type === 'origin' ? state.originMarker : state.destinationMarker;

    const pinClass = type === 'origin' ? 'pin-blue-svg' : 'pin-green-svg';
    let trackingClass = '';
    if (type === 'origin') {
        trackingClass = 'tracking-active';
    } else if (type === 'destination') {
        trackingClass = 'tracking-active-green';
    }
    const markerHtml = `<div class="marker-container ${trackingClass}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-10 h-10 ${pinClass} pin-shadow">
                                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                            </svg>
                        </div>`;
    
    const customIcon = L.divIcon({
        html: markerHtml,
        className: 'leaflet-div-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 40]
    });

    if (marker) {
        marker.setLatLng(coords);
        marker.setIcon(customIcon);
        if (marker.dragging) {
            isDraggable ? marker.dragging.enable() : marker.dragging.disable();
        }
        // Remove o tooltip antigo e adiciona um novo para garantir a atualização
        if (marker.getTooltip()) {
            marker.unbindTooltip();
        }
        if (type === 'origin' && name) { // Mover para o pino de origem
            marker.bindTooltip(name, {
                permanent: true,
                direction: 'bottom',
                offset: [0, 10],
                className: 'destination-tooltip' // Manter a classe de estilo
            }).openTooltip();
        }
    } else {
        marker = L.marker(coords, { 
            icon: customIcon,
            draggable: isDraggable 
        }).addTo(state.map);

        marker.on('dragstart', () => {
            state.setIsDraggingMarker(true);
        });

        marker.on('dragend', async (e) => {
            state.setIsDraggingMarker(false);
            const newLatLng = e.target.getLatLng();

            if (type === 'destination') {
                const inputEl = dom.destinationInput;
                if (inputEl) {
                    try {
                        const fullAddressData = await reverseGeocode(newLatLng.lat, newLatLng.lng);
                        const addressText = formatPlaceForDisplay(fullAddressData) || 'Endereço desconhecido';
                        
                        inputEl.value = addressText;
                        inputEl.dataset.lat = newLatLng.lat;
                        inputEl.dataset.lng = newLatLng.lng;
                        fullAddressData.display_name = addressText;

                        state.setCurrentDestination({ latlng: newLatLng, data: fullAddressData });
                    } catch (error) {
                        console.error("Erro ao buscar endereço:", error);
                        inputEl.value = 'Erro ao buscar endereço';
                    } finally {
                        traceRoute();
                    }
                }
            } else if (type === 'origin') {
                try {
                    const fullAddressData = await reverseGeocode(newLatLng.lat, newLatLng.lng);
                    state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });
                } catch (error) {
                    console.error("Erro ao buscar endereço de origem:", error);
                } finally {
                    // Apenas traça a rota se já houver um destino
                    if (state.currentDestination) {
                        traceRoute();
                    }
                }
            }
        });

        if (type === 'origin') {
            state.setOriginMarker(marker);
            if (name) { // Adicionar tooltip ao pino de origem na criação
                marker.bindTooltip(name, {
                    permanent: true,
                    direction: 'bottom',
                    offset: [0, 10],
                    className: 'destination-tooltip'
                }).openTooltip();
            }

            // Lógica para toque longo (hold) no marcador de origem
            let holdTimer;
            const HOLD_DURATION = 700; // ms

            const markerElement = marker.getElement();
            if (markerElement) {
                const startHold = (e) => {
                    e.stopPropagation(); // Impede que o evento chegue ao mapa
                    // O marcador já é criado como não arrastável, então não precisamos desabilitá-lo aqui.
                    holdTimer = setTimeout(() => {
                        marker.dragging.enable();
                        state.setIsOriginPinClickDraggable(true); // Habilita o arrasto por clique
                        // Desabilita o arrasto do mapa para evitar conflito
                        if (state.map && state.map.dragging) {
                            state.map.dragging.disable();
                        }
                        // Opcional: feedback visual para o usuário que o arrasto foi habilitado
                        markerElement.classList.add('draggable-active');
                        // Remove a animação de ondas
                        const container = markerElement.querySelector('.marker-container');
                        if (container) container.classList.remove('tracking-active');
                    }, HOLD_DURATION);
                };

                const enableMapDragging = () => {
                    if (state.map && state.map.dragging) {
                        state.map.dragging.enable();
                    }
                };

                state.map.addEventListener('mousedown', enableMapDragging);
                state.map.addEventListener('touchstart', enableMapDragging, { passive: true });

                const endHold = () => {
                    clearTimeout(holdTimer);
                    markerElement.classList.remove('draggable-active');
                    // A lógica de reabilitação do arrasto do mapa e da animação será tratada no dragend
                };

                markerElement.addEventListener('mousedown', startHold);
                markerElement.addEventListener('touchstart', startHold, { passive: true });
                markerElement.addEventListener('mouseup', endHold);
                markerElement.addEventListener('touchend', endHold);
                markerElement.addEventListener('mouseleave', endHold); // Para desktop, se o mouse sair do elemento
            }

            marker.on('dragend', () => {
                state.setIsDraggingMarker(false);
                state.setIsOriginPinClickDraggable(false); // Desabilita o arrasto por clique após o término do arrasto
                // Desabilita o arrasto novamente após o término
                if (marker.dragging.enabled()) {
                    marker.dragging.disable();
                }
                // Reabilita o arrasto do mapa
                if (state.map && state.map.dragging) {
                    state.map.dragging.enable();
                }
                        // Remove a classe de feedback visual
                const currentMarkerElement = marker.getElement();
                if (currentMarkerElement) {
                    currentMarkerElement.classList.remove('draggable-active');
                    const container = currentMarkerElement.querySelector('.marker-container');
                    if (container) container.classList.add('tracking-active');
                }
                // Reexibe o balão de dica
                if (name) {
                    marker.bindTooltip(name, {
                        permanent: true,
                        direction: 'bottom',
                        offset: [0, 10],
                        className: 'destination-tooltip'
                    }).openTooltip();
                }
                // Lógica de geocodificação reversa e traçado de rota
                const newLatLng = marker.getLatLng();
                try {
                    reverseGeocode(newLatLng.lat, newLatLng.lng).then(fullAddressData => {
                        state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });
                        if (state.currentDestination) {
                            traceRoute();
                        }
                    }).catch(error => {
                        console.error("Erro ao buscar endereço de origem:", error);
                    });
                } catch (error) {
                    console.error("Erro ao buscar endereço de origem:", error);
                }
            });

        } else {
            state.setDestinationMarker(marker);
            // Removido o tooltip do pino de destino
        }
    }
}

/**
 * Traça uma rota entre a origem e todos os destinos no mapa, na ordem correta.
 * @param {boolean} fitBounds - Se deve ajustar o zoom para a rota.
 */
export function traceRoute(fitBounds = false) {
    if (state.routeControl) {
        state.map.removeControl(state.routeControl);
        state.setRouteControl(null);
    }
    dom.routeInfoDisplay.classList.add('hidden');
    dom.destinationInput.classList.add('rounded-r-lg');

    // Remove os círculos de início e fim existentes
    if (state.startCircle) {
        state.map.removeLayer(state.startCircle);
        state.setStartCircle(null);
    }
    if (state.endCircle) {
        state.map.removeLayer(state.endCircle);
        state.setEndCircle(null);
    }

    if (!state.currentOrigin || !state.currentDestination) {
        return;
    }
    
    const waypoints = [
        L.latLng(state.currentOrigin.latlng.lat, state.currentOrigin.latlng.lng),
        L.latLng(state.currentDestination.latlng.lat, state.currentDestination.latlng.lng)
    ];

    const originName = state.currentOrigin.data ? formatAddressForTooltip(state.currentOrigin.data) : 'Origem'; // Usa a nova função de formatação
    addOrMoveMarker(state.currentOrigin.latlng, 'origin', originName);
    addOrMoveMarker(state.currentDestination.latlng, 'destination', 'Destino'); // Não precisa de nome para tooltip aqui

    if (waypoints.length < 2) {
        return;
    }

    const isDarkMode = document.body.classList.contains('dark');
    const routeColor = isDarkMode ? '#FFD700' : '#3b82f6';
    const casingColor = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)';

    const control = L.Routing.control({
        waypoints: waypoints,
        lineOptions: {
            styles: [
                { color: casingColor, opacity: 1, weight: 7 },
                { color: routeColor, weight: 4, opacity: 1 }
            ]
        },
        createMarker: function() { return null; },
        show: false,
        addWaypoints: false,
        routeWhileDragging: false,
        collapsible: false,
        showAlternatives: false
    }).addTo(state.map);

    control.on('routesfound', function(e) {
        const route = e.routes[0];
        const distanceMeters = route.summary.totalDistance;
        const timeSeconds = route.summary.totalTime;

        // Adiciona círculos nas extremidades da rota
        const startLatLng = route.coordinates[0];
        const endLatLng = route.coordinates[route.coordinates.length - 1];

        const circleOptions = {
            radius: 7,
            fillColor: routeColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        };

        const startCircle = L.circleMarker(startLatLng, circleOptions).addTo(state.map);
        const endCircle = L.circleMarker(endLatLng, circleOptions).addTo(state.map);

        state.setStartCircle(startCircle);
        state.setEndCircle(endCircle);

        state.tripData.distance = distanceMeters / 1000;
        state.tripData.time = timeSeconds;

        const formattedTime = formatTime(timeSeconds);
        const routeInfoText = `Distância: ${state.tripData.distance.toFixed(2)} km | Tempo Aprox.: ${formattedTime}`;
        
        dom.routeInfoDisplay.textContent = routeInfoText;
        dom.routeInfoDisplay.classList.remove('hidden');
        dom.estimatedDistanceTimeEl.textContent = routeInfoText;
        
        dom.vehicleButtons.forEach(button => {
            const vehicleType = button.dataset.vehicle;
            const price = estimateFare(state.tripData.distance, vehicleType);
            button.querySelector('.vehicle-price').textContent = price;
        });
        
        if (fitBounds) {
            state.map.fitBounds(route.coordinates, { padding: [50, 50] });
        }

        // Abre o painel na página 3 para seleção de veículo
        const panel = dom.collapsiblePanel;
        if (panel && !panel.classList.contains('open')) {
            dom.togglePanelButton.click();
        }
        showPage('page3');
    });

    state.setRouteControl(control);
}

/**
 * Busca a localização atual do usuário uma única vez.
 */
export async function updateUserLocationOnce() { // Adicionado 'async' aqui
   
    return new Promise((resolve, reject) => { // Retorna uma Promise
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const newLatLng = { lat: latitude, lng: longitude };

            state.setCurrentUserCoords(newLatLng);
            const fullAddressData = await reverseGeocode(latitude, longitude);
            const addressText = formatAddressForTooltip(fullAddressData) || 'Localização atual';
            if(fullAddressData) {
                fullAddressData.display_name = addressText;
            }
            state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });
            addOrMoveMarker(newLatLng, 'origin', addressText, false); // Usa o endereço formatado, arrasto desabilitado por padrão
            state.map.setView(newLatLng, 16); // Zoom mais próximo para localização única
            resolve(); // Resolve a Promise em caso de sucesso do GPS
        },
        async (error) => {
            console.error("Erro ao obter localização por GPS: ", error);
            showPushNotification('Não foi possível obter sua localização GPS. Tentando por IP...', 'warning');
            try {
                const userLocation = await getUserLocation();
                if (userLocation) {
                    const newLatLng = { lat: ipLocation.lat, lng: ipLocation.lng };
                    state.setCurrentUserCoords(newLatLng);
                    const fullAddressData = await reverseGeocode(ipLocation.lat, ipLocation.lng);
                    const addressText = formatAddressForTooltip(fullAddressData) || 'Localização aproximada';
                    state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });
                    addOrMoveMarker(newLatLng, 'origin', addressText, false); // Usa o endereço formatado, arrasto desabilitado por padrão
                    state.map.setView(newLatLng, 13);
                    showPushNotification('Localização aproximada encontrada.', 'info');
                    resolve(); // Resolve a Promise em caso de fallback por IP bem-sucedido
                } else {
                    showPushNotification('Não foi possível obter sua localização.', 'error');
                    reject(new Error('Não foi possível obter sua localização.')); // Rejeita se o fallback por IP falhar
                }
            } catch (ipError) {
                console.error("Erro ao buscar localização por IP:", ipError);
                showPushNotification('Não foi possível obter sua localização.', 'error');
                reject(ipError); // Rejeita em caso de erro no fallback por IP
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 8000, // Aumenta o timeout para dar mais chance ao GPS
            maximumAge: 0
        }
    );
}); // Fecha a Promise
}

function createDriverMarker(coords) {
    const driverIconHtml = `
        <div class="relative flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-gray-800 dark:text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8a1 1 0 001 1h1a1 1 0 001-1v-1h12v1a1 1 0 001 1h1a1 1 0 001-1v-8l-2.08-5.99zM6.5 16a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM5 10l1.5-4.5h11L19 10H5z"/>
            </svg>
        </div>`;
    const driverIcon = L.divIcon({
        html: driverIconHtml,
        className: 'leaflet-div-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    const marker = L.marker(coords, { icon: driverIcon, zIndexOffset: 1000 }).addTo(state.map);
    state.setDriverMarker(marker);
}

export function simulateDriverEnRoute(originCoords) {
    // Remove a rota principal (usuário -> destino) para evitar conflitos
    if (state.routeControl) {
        state.map.removeControl(state.routeControl);
        state.setRouteControl(null);
    }
    // Remove os círculos de início e fim da rota principal
    if (state.startCircle) {
        state.map.removeLayer(state.startCircle);
        state.setStartCircle(null);
    }
    if (state.endCircle) {
        state.map.removeLayer(state.endCircle);
        state.setEndCircle(null);
    }

    // Não remove o pino de destino aqui, ele será reexibido quando o motorista chegar à origem.
    // if (state.destinationMarker) {
    //     state.map.removeLayer(state.destinationMarker);
    // }

    // 1. Ponto de partida aleatório para o motorista (até 2km de distância)
    const maxDistanceKm = 2; // Distância máxima em km
    const maxDistanceDegrees = maxDistanceKm / 111.32; // Aproximadamente 1 grau de latitude = 111.32 km

    const angle = Math.random() * 2 * Math.PI; // Ângulo aleatório em radianos
    const distanceFactor = Math.random(); // Fator para variar a distância de 0 a 1
    const randomDistanceDegrees = distanceFactor * maxDistanceDegrees;

    const startLat = originCoords.lat + randomDistanceDegrees * Math.cos(angle);
    const startLng = originCoords.lng + randomDistanceDegrees * Math.sin(angle) / Math.cos(originCoords.lat * Math.PI / 180); // Ajuste para longitude
    const driverStartCoords = L.latLng(startLat, startLng);

    createDriverMarker(driverStartCoords);

    // 2. Calcula a rota do motorista até o usuário
    const control = L.Routing.control({
        waypoints: [driverStartCoords, L.latLng(originCoords.lat, originCoords.lng)],
        createMarker: () => null,
        lineOptions: {
            styles: [{color: '#22c55e', opacity: 0.8, weight: 5}]
        },
        show: false
    }).addTo(state.map);

    control.on('routesfound', (e) => {
        const route = e.routes[0];
        const routeCoords = route.coordinates;
        state.map.fitBounds(route.coordinates, { padding: [50, 50] });

        // Remove o controle de rota original, pois vamos manipular a linha manualmente
        state.map.removeControl(control);

        // Cria nossa própria polilinha para que possamos atualizá-la
        const driverRoutePolyline = L.polyline(routeCoords, {
            color: '#22c55e',
            opacity: 0.8,
            weight: 5
        }).addTo(state.map);

        const duration = Math.random() * 40000; // Duração variável até 40 segundos (40.000 ms)
        let startTime = null;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = (timestamp - startTime) / duration;

            if (progress < 1) {
                // Calcula o índice atual na matriz de coordenadas
                const currentIndex = Math.floor(progress * (routeCoords.length - 1));
                const newPos = routeCoords[currentIndex];

                if (state.driverMarker) {
                    state.driverMarker.setLatLng(newPos);
                }

                // Cria a nova rota, mais curta
                const remainingRoute = routeCoords.slice(currentIndex);
                driverRoutePolyline.setLatLngs(remainingRoute);

                animationFrameId = requestAnimationFrame(animate);
            } else {
                if (state.driverMarker) {
                    state.driverMarker.setLatLng(L.latLng(originCoords.lat, originCoords.lng));
                }
                showPushNotification('Seu motorista chegou!', 'success');
                if (driverRoutePolyline) {
                    state.map.removeLayer(driverRoutePolyline);
                }

                // Nova lógica: Motorista chegou ao ponto de origem, agora vai para o destino
                if (state.currentOrigin && state.currentDestination) {
                    // Reexibe o pino de destino
                    addOrMoveMarker(state.currentDestination.latlng, 'destination', 'Destino');

                    const isDarkMode = document.body.classList.contains('dark');
                    const routeColor = isDarkMode ? '#FFD700' : '#3b82f6';
                    const casingColor = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.6)';

                    // Calcula a rota do motorista (agora no ponto de origem) até o destino
                    const driverToDestinationControl = L.Routing.control({
                        waypoints: [L.latLng(originCoords.lat, originCoords.lng), L.latLng(state.currentDestination.latlng.lat, state.currentDestination.latlng.lng)],
                        createMarker: () => null,
                        lineOptions: {
                            styles: [
                                { color: casingColor, opacity: 1, weight: 7 },
                                { color: routeColor, weight: 4, opacity: 1 }
                            ]
                        },
                        show: false
                    }).addTo(state.map);

                    driverToDestinationControl.on('routesfound', (e) => {
                        const finalRoute = e.routes[0];
                        const finalRouteCoords = finalRoute.coordinates;
                        state.map.fitBounds(finalRoute.coordinates, { padding: [50, 50] });

                        state.map.removeControl(driverToDestinationControl);

                        const finalRoutePolyline = L.polyline(finalRouteCoords, {
                            color: routeColor, // Usar a cor da rota definida
                            opacity: 1,
                            weight: 4
                        }).addTo(state.map);

                        const finalDuration = Math.random() * 40000; // Duração variável até 40 segundos (40.000 ms)
                        let finalStartTime = null;

                        function animateFinalRoute(timestamp) {
                            if (!finalStartTime) finalStartTime = timestamp;
                            const finalProgress = (timestamp - finalStartTime) / finalDuration;

                            if (finalProgress < 1) {
                                const finalCurrentIndex = Math.floor(finalProgress * (finalRouteCoords.length - 1));
                                const finalNewPos = finalRouteCoords[finalCurrentIndex];

                                if (state.driverMarker) {
                                    state.driverMarker.setLatLng(finalNewPos);
                                }

                                const finalRemainingRoute = finalRouteCoords.slice(finalCurrentIndex);
                                finalRoutePolyline.setLatLngs(finalRemainingRoute);

                                animationFrameId = requestAnimationFrame(animateFinalRoute);
                            } else {
                                if (state.driverMarker) {
                                    state.driverMarker.setLatLng(L.latLng(state.currentDestination.latlng.lat, state.currentDestination.latlng.lng));
                                }
                                showPushNotification('Você chegou ao seu destino!', 'success');
                                if (finalRoutePolyline) {
                                    state.map.removeLayer(finalRoutePolyline);
                                }
                                // Mover o pin de origem para o destino final
                                if (state.originMarker && state.currentDestination) {
                                    state.originMarker.setLatLng(state.currentDestination.latlng);
                                    // Atualizar o estado de origem para refletir a nova posição
                                    state.setCurrentOrigin(state.currentDestination);
                                }
                                // Remover o pin de destino
                                if (state.destinationMarker) {
                                    state.map.removeLayer(state.destinationMarker);
                                    state.setDestinationMarker(null);
                                }
                                // Parar a simulação do motorista (remove o marcador do motorista)
                                stopDriverSimulation();
                                showPushNotification('Viagem concluída!', 'success');
                                showPage('page1'); // Volta para a página inicial
                            }
                        }
                        animationFrameId = requestAnimationFrame(animateFinalRoute);
                    });
                }
            }
        }
        animationFrameId = requestAnimationFrame(animate);
    });
}

export function stopDriverSimulation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (state.driverMarker) {
        state.map.removeLayer(state.driverMarker);
        state.setDriverMarker(null);
    }
    // Garante que a rota principal seja removida se a simulação for parada manualmente
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
    // O pino de destino não é removido aqui, pois pode ser necessário para a próxima interação do usuário.
    // A lógica de limpeza completa será tratada por clearFieldsAndMap ou clearRouteOnly em app.js
}
