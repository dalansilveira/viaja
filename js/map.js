import * as state from './state.js';
import { dom } from './dom.js';
import { handleMapClick, showPushNotification, showPage } from './ui.js';
import { formatTime, estimateFare, formatPlaceForDisplay } from './utils.js';
import { reverseGeocode, getLocationByIP } from './api.js';

let currentTileLayer;

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
    // Se o rastreamento de localização estiver ativo, o marcador de origem nunca deve ser arrastável.
    if (type === 'origin' && state.isTrackingLocation) {
        isDraggable = false;
    }

    let marker = type === 'origin' ? state.originMarker : state.destinationMarker;

    const pinClass = type === 'origin' ? 'pin-blue-svg' : 'pin-green-svg';
    const trackingClass = (type === 'origin' && state.isTrackingLocation) ? 'tracking-active' : '';
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
        } else {
            state.setDestinationMarker(marker);
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

    addOrMoveMarker(state.currentOrigin.latlng, 'origin', 'Origem');
    addOrMoveMarker(state.currentDestination.latlng, 'destination', 'Destino');

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
 * Inicia o rastreamento contínuo da localização do usuário.
 */
export function startLocationTracking() {
    if (state.locationWatchId) {
        stopLocationTracking();
    }

    const handlePositionUpdate = async (lat, lng) => {
        const newLatLng = { lat, lng };
        state.setCurrentUserCoords(newLatLng);

        // Atualiza o marcador de origem, tornando-o não arrastável
        addOrMoveMarker(newLatLng, 'origin', 'Sua Localização', false);

        // Atualiza o campo de texto de origem com o novo endereço
        const fullAddressData = await reverseGeocode(lat, lng);
        const addressText = formatPlaceForDisplay(fullAddressData) || 'Localização atual';
        fullAddressData.display_name = addressText;
        state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });

        state.map.setView(newLatLng, 13);
    };

    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            handlePositionUpdate(position.coords.latitude, position.coords.longitude);
        },
        async (error) => {
            console.error("Erro no rastreamento de localização por GPS: ", error);
            try {
                const ipLocation = await getLocationByIP();
                if (ipLocation) {
                    handlePositionUpdate(ipLocation.lat, ipLocation.lng);
                } else {
                    stopLocationTracking();
                }
            } catch (ipError) {
                console.error("Erro ao buscar localização por IP:", ipError);
                stopLocationTracking();
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        }
    );

    state.setLocationWatchId(watchId);
    state.setIsTrackingLocation(true);
}

/**
 * Para o rastreamento contínuo da localização do usuário.
 */
export function stopLocationTracking() {
    if (state.locationWatchId !== null) {
        navigator.geolocation.clearWatch(state.locationWatchId);
        state.setLocationWatchId(null);
    }
    state.setIsTrackingLocation(false);
    state.setCurrentUserCoords(null); // Limpa a última localização conhecida

    // Torna o marcador de origem arrastável novamente
    if (state.originMarker) {
        const iconElement = state.originMarker.getElement();
        if (iconElement) {
            const container = iconElement.querySelector('.marker-container');
            if (container) container.classList.remove('tracking-active');
        }
        if (state.originMarker.dragging) {
            state.originMarker.dragging.enable();
        }
    }
}
