import * as state from './state.js';
import { dom } from './dom.js';
import { handleMapClick } from './ui.js';
import { formatTime, estimateFare, formatPlaceForDisplay } from './utils.js';
import { reverseGeocode } from './api.js';

let currentTileLayer;

/**
 * Define o tema do mapa (claro ou escuro).
 * @param {boolean} isDark - True para tema escuro, false para tema claro.
 */
export function setMapTheme(isDark) {
    if (!state.map) return;

    if (currentTileLayer) {
        state.map.removeLayer(currentTileLayer);
    }

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    currentTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map);
}

/**
 * Inicializa o mapa com as coordenadas fornecidas.
 * @param {number} lat - Latitude inicial.
 * @param {number} lng - Longitude inicial.
 * @param {boolean} isDark - Se o tema inicial deve ser escuro.
 */
export function initializeMap(lat, lng, isDark) {
    if (state.map) {
        state.map.remove();
    }
    const mapInstance = L.map('map').setView([lat, lng], 13);
    state.setMap(mapInstance);

    setMapTheme(isDark);

    mapInstance.on('click', handleMapClick);
}

/**
 * Adiciona ou move um marcador no mapa.
 * @param {object} coords - Coordenadas do marcador.
 * @param {string} type - Tipo de marcador ('origin' ou 'destination').
 * @param {string} name - Nome para a tooltip do marcador.
 */
export function addOrMoveMarker(coords, type, name) {
    let marker = type === 'origin' ? state.originMarker : state.destinationMarker;

    const pinClass = type === 'origin' ? 'pin-blue-svg' : 'pin-green-svg';
    const markerHtml = `<div class="marker-container">
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
    } else {
        marker = L.marker(coords, { 
            icon: customIcon,
            draggable: true 
        }).addTo(state.map);

        marker.on('dragstart', () => {
            state.setIsDraggingMarker(true);
        });

        marker.on('dragend', async (e) => {
            state.setIsDraggingMarker(false);
            const newLatLng = e.target.getLatLng();
            const inputEl = type === 'origin' ? dom.originInput : dom.destinationInput;

            if (inputEl) {
                inputEl.value = 'Buscando endereço...';
                try {
                    const fullAddressData = await reverseGeocode(newLatLng.lat, newLatLng.lng);
                    const addressText = formatPlaceForDisplay(fullAddressData) || 'Endereço desconhecido';
                    
                    inputEl.value = addressText;
                    inputEl.dataset.lat = newLatLng.lat;
                    inputEl.dataset.lng = newLatLng.lng;
                    fullAddressData.display_name = addressText;

                    if (type === 'origin') {
                        state.setCurrentOrigin({ latlng: newLatLng, data: fullAddressData });
                    } else {
                        state.setCurrentDestination({ latlng: newLatLng, data: fullAddressData });
                    }
                } catch (error) {
                    console.error("Erro ao buscar endereço:", error);
                    inputEl.value = 'Erro ao buscar endereço';
                } finally {
                    traceRoute();
                }
            } else {
                traceRoute();
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
 */
export function traceRoute() {
    if (state.routeControl) {
        state.map.removeControl(state.routeControl);
        state.setRouteControl(null);
    }
    dom.routeInfoDisplay.classList.add('hidden');

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

    const control = L.Routing.control({
        waypoints: waypoints,
        lineOptions: {
            styles: [
                // Contorno (casing)
                { color: 'black', opacity: 0.3, weight: 12 },
                // Linha principal
                { color: routeColor, weight: 9, opacity: 0.8 }
            ]
        },
        createMarker: function() { return null; },
        show: false,
        addWaypoints: false,
        routeWhileDragging: true,
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
        
        state.map.fitBounds(route.coordinates, { padding: [50, 50] });
    });

    state.setRouteControl(control);
}
