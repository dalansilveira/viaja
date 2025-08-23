// ATENÇÃO: Em um ambiente de produção, esta chave deveria ser protegida
// e não estar diretamente no código do frontend.
import { calculateBoundingBox } from './utils.js';
import { updateDebugConsole } from './ui.js';

const OPENCAGE_API_KEY = '49810e6bb57044b990140e0accfa637e';

/**
 * Busca sugestões de endereço com base em uma consulta usando OpenCageData.
 * @param {string} query - O termo de busca.
 * @param {object} [proximityCoords] - As coordenadas {lat, lng} para priorizar os resultados.
 * @returns {Promise<Array>} Uma lista de locais correspondentes.
 */
export async function fetchAddressSuggestions(query, proximityCoords = null) {
    if (query.length < 2) {
        return [];
    }

    let url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_API_KEY}&countrycode=br&limit=7&language=pt`;

    if (proximityCoords) {
        const bounds = calculateBoundingBox(proximityCoords.lat, proximityCoords.lng, 50); // Raio de 50 km
        url += `&bounds=${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();
        updateDebugConsole(data); // Atualiza o console de depuração

        if (data.results && Array.isArray(data.results)) {
            // Mapeia a resposta do OpenCage para o formato que o app espera
            return data.results.map(place => ({
                lat: place.geometry.lat,
                lon: place.geometry.lng,
                display_name: place.formatted,
                address: {
                    road: place.components.road,
                    suburb: place.components.suburb,
                    city: place.components.city || place.components.town,
                    state: place.components.state,
                    postcode: place.components.postcode
                }
            }));
        }
        return [];
    } catch (error) {
        console.error('Erro ao buscar sugestões de endereço:', error);
        return [];
    }
}

/**
 * Obtém o endereço de uma coordenada usando OpenCageData.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @returns {Promise<object>} O objeto de dados completo do primeiro resultado.
 */
export async function reverseGeocode(lat, lng) {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${OPENCAGE_API_KEY}&language=pt&limit=1`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const place = data.results[0];
            // Retorna um objeto no formato similar ao que o app esperava do Nominatim
            return {
                lat: place.geometry.lat,
                lon: place.geometry.lng,
                display_name: place.formatted,
                address: {
                    road: place.components.road,
                    suburb: place.components.suburb,
                    city: place.components.city || place.components.town,
                    state: place.components.state,
                    postcode: place.components.postcode
                }
            };
        }
        return { error: 'Endereço desconhecido', address: {} };
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
