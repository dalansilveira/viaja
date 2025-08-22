import * as state from './state.js';
import { dom } from './dom.js';
import { handleMapClick } from './ui.js';
import { formatTime, estimateFare } from './utils.js';

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
export function addOrMoveMarker(coords, type, name, id = null) {
    let marker;

    if (type === 'origin') {
        marker = state.originMarker;
    } else if (id && state.destinationMarkers[id]) {
        marker = state.destinationMarkers[id];
    }

    if (marker) {
        marker.setLatLng(coords);
    } else {
        const pinClass = type === 'origin' ? 'pin-blue-svg' : 'pin-green-svg';
        const markerHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-8 h-8 ${pinClass}">
                                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                            </svg>`;
        const customIcon = L.divIcon({
            html: markerHtml,
            className: 'leaflet-div-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 20]
        });
        marker = L.marker(coords, { icon: customIcon }).addTo(state.map).bindTooltip(name, { permanent: false, direction: 'top' });

        if (type === 'origin') {
            state.setOriginMarker(marker);
        } else if (id) {
            state.addDestinationMarker(id, marker);
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

    const waypoints = [];
    if (state.currentOrigin) {
        waypoints.push(L.latLng(state.currentOrigin.latlng.lat, state.currentOrigin.latlng.lng));
    }

    const destinationInputs = dom.destinationContainer.querySelectorAll('.destination-input');
    destinationInputs.forEach(input => {
        if (input.dataset.lat && input.dataset.lng) {
            waypoints.push(L.latLng(parseFloat(input.dataset.lat), parseFloat(input.dataset.lng)));
        }
    });

    if (waypoints.length < 2) {
        return;
    }

    const control = L.Routing.control({
        waypoints: waypoints,
        lineOptions: {
            styles: [{color: '#3b82f6', weight: 6, opacity: 0.7}]
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
