// ATENÇÃO: Em um ambiente de produção, esta chave deveria ser protegida
// e não estar diretamente no código do frontend.
import { calculateBoundingBox } from './utils.js';
import { updateDebugConsole } from './ui.js';
import { AppConfig } from './config.js';
import { updateUserLastLocation } from './firestore.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as state from './state.js';

/**
 * Busca sugestões de endereço com base em uma consulta usando OpenCageData.
 * @param {string} query - O termo de busca.
 * @param {object} [proximityCoords] - As coordenadas {lat, lng} para priorizar os resultados.
 * @returns {Promise<Array>} Uma lista de locais correspondentes.
 */
export async function fetchAddressSuggestions(query, proximityCoords = null, signal) {
    if (query.length < AppConfig.MIN_GEO_API_QUERY_LENGTH) {
        return [];
    }

    let url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${AppConfig.OPENCAGE_API_KEY}&countrycode=br&limit=7&language=pt`;

    if (proximityCoords) {
        const bounds = calculateBoundingBox(proximityCoords.lat, proximityCoords.lng, AppConfig.GEO_API_PROXIMITY_RADIUS_KM);
        url += `&bounds=${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    }

    try {
        console.log(`[API] Enviando requisição para OpenCage (Sugestões) com a chave: ${AppConfig.OPENCAGE_API_KEY}`);
        const response = await fetch(url, { signal });
        const data = await response.json();

        const userId = getAuth().currentUser?.uid;
        if (userId && state.currentUserCoords) {
            updateUserLastLocation(userId, state.currentUserCoords);
        }
        
        if (data.rate && data.rate.remaining) {
            console.log(`[COTA OPENCAGE] Requisições restantes hoje: ${data.rate.remaining}`);
        }

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
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${AppConfig.OPENCAGE_API_KEY}&language=pt&limit=1`;

    try {
        console.log(`[API] Enviando requisição para OpenCage (Reversa) com a chave: ${AppConfig.OPENCAGE_API_KEY}`);
        const response = await fetch(url);
        const data = await response.json();

        const userId = getAuth().currentUser?.uid;
        if (userId && state.currentUserCoords) {
            updateUserLastLocation(userId, state.currentUserCoords);
        }

        if (data.rate && data.rate.remaining) {
            console.log(`[COTA OPENCAGE] Requisições restantes hoje: ${data.rate.remaining}`);
        }

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
 * Obtém a localização do usuário usando a API de Geolocalização do navegador.
 * @returns {Promise<object|null>} As coordenadas de latitude e longitude ou nulo.
 */
export function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            console.error("Geolocalização não é suportada por este navegador.");
            reject(new Error("Geolocalização não suportada"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                console.error("Erro ao obter a localização:", error);
                reject(error);
            }
        );
    });
}
