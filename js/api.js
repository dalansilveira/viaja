import { formatPlaceForDisplay } from './utils.js';
import { currentUserCoords } from './state.js';

/**
 * Busca sugestões de endereço com base em uma consulta.
 * @param {string} query - O termo de busca.
 * @returns {Promise<Array>} Uma lista de locais correspondentes.
 */
export async function fetchAddressSuggestions(query) {
    if (query.length < 3) {
        return [];
    }

    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=5&addressdetails=1`;

    if (currentUserCoords) {
        const offset = 0.125;
        const viewbox = `${currentUserCoords.lng - offset},${currentUserCoords.lat + offset},${currentUserCoords.lng + offset},${currentUserCoords.lat - offset}`;
        url += `&viewbox=${viewbox}&bounded=1`;
    }

    try {
        const response = await fetch(url);
        const results = await response.json();
        return results.map(place => {
            const displayAddress = formatPlaceForDisplay(place) || place.display_name.split(',').slice(0, 3).join(',');
            return { ...place, display_name: displayAddress };
        });
    } catch (error) {
        console.error('Erro ao buscar sugestões de endereço:', error);
        return [];
    }
}

/**
 * Obtém o endereço de uma coordenada usando geocodificação reversa.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {Promise<object>} O objeto de dados completo da API de geocodificação.
 */
export async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erro na geocodificação reversa:', error);
        return { error: 'Endereço desconhecido', address: {} };
    }
}

/**
 * Obtém a localização do usuário com base no IP.
 * @returns {Promise<object|null>} As coordenadas de latitude e longitude ou nulo.
 */
export async function getLocationByIP() {
    try {
        const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const data = await response.json();
        if (data && data.latitude && data.longitude) {
            return {
                lat: parseFloat(data.latitude),
                lng: parseFloat(data.longitude)
            };
        }
        return null;
    } catch (error) {
        console.error("Erro ao obter a localização por IP:", error);
        return null;
    }
}
