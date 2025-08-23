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

    const baseUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=5&addressdetails=1`;
    let nominatimUrl = baseUrl;

    if (currentUserCoords) {
        const offset = 0.125;
        const viewbox = `${currentUserCoords.lng - offset},${currentUserCoords.lat + offset},${currentUserCoords.lng + offset},${currentUserCoords.lat - offset}`;
        nominatimUrl += `&viewbox=${viewbox}&bounded=1`;
    }

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(nominatimUrl)}`;

    try {
        const response = await fetch(proxyUrl);
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
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(nominatimUrl)}`;
    try {
        const response = await fetch(proxyUrl);
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
        const response = await fetch('http://ip-api.com/json');
        const data = await response.json();
        if (data && data.status === 'success' && data.lat && data.lon) {
            return {
                lat: data.lat,
                lng: data.lon
            };
        }
        return null;
    } catch (error) {
        console.error("Erro ao obter a localização por IP:", error);
        return null;
    }
}
