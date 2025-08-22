export let map;
export let originMarker;
export let destinationMarkers = [];
export let routeControl;
export let currentOrigin = null;
export let currentDestination = null; // Pode ser usado para o destino final
export let currentSelectionMode = null;
export let deferredPrompt = null;
export let currentUserCoords = null;
export let activeDestinationInput = null;

export const tripData = {
    distance: 0,
    time: 0,
    fare: 0,
    vehicle: ''
};

export const defaultCoords = [-18.5807, -46.5160];

export const vehicleRates = {
    'Moto': { base: 6.00, perKm: 1.50, minFare: 8.00 },
    'Carro': { base: 8.00, perKm: 2.50, minFare: 12.00 },
    'Lotação': { base: 5.00, perKm: 1.00, minFare: 7.00 },
    'Entrega': { base: 7.00, perKm: 2.00, minFare: 10.00 }
};

export function setMap(mapInstance) {
    map = mapInstance;
}

export function setOriginMarker(marker) {
    originMarker = marker;
}

export function addDestinationMarker(id, marker) {
    // Remove qualquer marcador existente com o mesmo ID antes de adicionar um novo
    removeDestinationMarker(id);
    destinationMarkers.push({ id, marker });
}

export function removeDestinationMarker(id) {
    const markerIndex = destinationMarkers.findIndex(m => m.id === id);
    if (markerIndex > -1) {
        const { marker } = destinationMarkers[markerIndex];
        if (map && map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
        destinationMarkers.splice(markerIndex, 1);
    }
}

export function setRouteControl(control) {
    routeControl = control;
}

export function setCurrentOrigin(origin) {
    currentOrigin = origin;
}

export function setCurrentDestination(destination) {
    currentDestination = destination;
}

export function setCurrentSelectionMode(mode) {
    currentSelectionMode = mode;
}

export function setDeferredPrompt(prompt) {
    deferredPrompt = prompt;
}

export function setCurrentUserCoords(coords) {
    currentUserCoords = coords;
}

export function setActiveDestinationInput(input) {
    activeDestinationInput = input;
}

export function resetTripData() {
    tripData.distance = 0;
    tripData.time = 0;
    tripData.fare = 0;
    tripData.vehicle = '';
}
