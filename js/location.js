// js/location.js
import { AppConfig } from './config.js';

/**
 * Obtém a localização atual do usuário.
 * Se a simulação de localização estiver ativada em AppConfig,
 * retorna uma localização mockada. Caso contrário, usa a API de geolocalização do navegador.
 * @returns {Promise<{latitude: number, longitude: number}>} Uma promessa que resolve com as coordenadas de latitude e longitude.
 */
export async function getCurrentLocation() {
    if (AppConfig.useMockLocation) {
        console.warn("Usando localização mockada via AppConfig.");
        return AppConfig.MOCKED_LOCATION;
    }

    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocalização não é suportada por este navegador."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                reject(error);
            }, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );
    });
}

/**
 * Inicia o rastreamento contínuo da localização do usuário.
 * Se estiver em ambiente de desenvolvimento e a simulação de localização estiver ativada,
 * chama o callback com uma localização mockada em intervalos regulares.
 * @param {function({latitude: number, longitude: number})} callback Função a ser chamada com a localização.
 * @returns {number} O ID do observador de posição.
 */
export function watchUserLocation(callback) {
    if (AppConfig.useMockLocation) {
        console.warn("Usando rastreamento de localização mockada via AppConfig.");
        let mockLat = AppConfig.MOCKED_LOCATION.latitude;
        let mockLon = AppConfig.MOCKED_LOCATION.longitude;

        return setInterval(() => {
            // Simula um pequeno movimento
            mockLat += (Math.random() - 0.5) * 0.0001;
            mockLon += (Math.random() - 0.5) * 0.0001;
            callback({
                latitude: mockLat,
                longitude: mockLon
            });
        }, 5000); // Atualiza a cada 5 segundos
    }

    if (!navigator.geolocation) {
        console.error("Geolocalização não é suportada por este navegador.");
        return -1;
    }

    return navigator.geolocation.watchPosition(
        (position) => {
            callback({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
            });
        },
        (error) => {
            console.error("Erro ao rastrear localização:", error);
        }, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
        }
    );
}

/**
 * Para o rastreamento da localização do usuário.
 * @param {number} watchId O ID do observador de posição retornado por watchUserLocation.
 */
export function clearWatch(watchId) {
    if (AppConfig.useMockLocation) {
        clearInterval(watchId);
    } else {
        if (navigator.geolocation) {
            navigator.geolocation.clearWatch(watchId);
        }
    }
}
