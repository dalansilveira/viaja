/**
 * Limita a taxa de execução de uma função.
 * @param {Function} func A função a ser debounced.
 * @param {number} delay O atraso em milissegundos.
 */
export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

/**
 * Formata um objeto de local da API para uma string simplificada e legível.
 * @param {object} place - O objeto de local completo retornado pela API Nominatim.
 * @returns {string} Uma string de endereço formatada e limpa, ou uma string vazia.
 */
export function formatPlaceForDisplay(place) {
    if (!place || !place.address) return '';
    
    const address = place.address;
    const finalParts = [];

    // 1. Nome do Ponto de Interesse (POI) ou nome do edifício
    const poiName = place.name || address.tourism || address.amenity || address.shop || address.office || address.building;
    if (poiName) {
        finalParts.push(poiName);
    }

    // 2. Rua e Número (adiciona se não for redundante com o nome do POI)
    const road = address.road || '';
    const houseNumber = address.house_number || '';
    if (road && road.toLowerCase() !== (poiName || '').toLowerCase()) {
        finalParts.push(road + (houseNumber ? `, ${houseNumber}` : ''));
    }

    // 3. Bairro
    const suburb = address.suburb || address.city_district || '';
    if (suburb) {
        finalParts.push(suburb);
    }

    // 4. Cidade e Estado
    const city = address.city || address.town || address.village || '';
    const state = address.state || '';
    if (city) {
        finalParts.push(city + (state ? ` - ${state}` : ''));
    } else if (state) {
        finalParts.push(state);
    }

    // Remove duplicatas (ex: bairro com mesmo nome da cidade) e junta.
    return [...new Set(finalParts)].join(', ');
}

/**
 * Formata segundos em uma string de tempo legível (ex: "15 min").
 * @param {number} totalSeconds - O tempo total em segundos.
 * @returns {string} O tempo formatado.
 */
export function formatTime(totalSeconds) {
    if (totalSeconds < 60) {
        return "< 1 min";
    }
    const minutes = Math.round(totalSeconds / 60);
    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
        return `${hours} h`;
    }
    return `${hours} h ${remainingMinutes} min`;
}

// Definição das tarifas de transporte
export const vehicleRates = {
    'Moto': { base: 6.00, perKm: 1.50, minFare: 8.00 },
    'Carro': { base: 8.00, perKm: 2.50, minFare: 12.00 },
    'Lotação': { base: 5.00, perKm: 1.00, minFare: 7.00 },
    'Entrega': { base: 7.00, perKm: 2.00, minFare: 10.00 }
};

/**
 * Estima a tarifa com base na distância e no tipo de veículo.
 * @param {number} distanceKm - Distância em quilômetros.
 * @param {string} vehicleType - Tipo de veículo.
 * @returns {string} Preço formatado em R$.
 */
export function estimateFare(distanceKm, vehicleType) {
    const rates = vehicleRates[vehicleType];
    if (!rates) return "R$ --";
    
    const totalFare = rates.base + (distanceKm * rates.perKm);
    const finalFare = Math.max(totalFare, rates.minFare);
    return `R$ ${finalFare.toFixed(2).replace('.', ',')}`;
}

export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Calcula a caixa delimitadora (bounding box) para uma determinada coordenada e raio.
 * @param {number} lat - Latitude do centro.
 * @param {number} lng - Longitude do centro.
 * @param {number} radiusKm - Raio em quilômetros.
 * @returns {object} Um objeto com { minLat, minLng, maxLat, maxLng }.
 */
export function calculateBoundingBox(lat, lng, radiusKm) {
    const latRad = lat * (Math.PI / 180);
    
    // Raio da Terra em km
    const earthRadius = 6371;
    
    // Mudança em latitude e longitude
    const latDelta = radiusKm / earthRadius * (180 / Math.PI);
    const lngDelta = radiusKm / (earthRadius * Math.cos(latRad)) * (180 / Math.PI);
    
    return {
        minLat: lat - latDelta,
        minLng: lng - lngDelta,
        maxLat: lat + latDelta,
        maxLng: lng + lngDelta
    };
}

/**
 * Formata um número de telefone no padrão (xx) xxxxx-xxxx.
 * @param {string} phone - O número de telefone a ser formatado.
 * @returns {string} O número de telefone formatado.
 */
export function formatPhoneNumber(phone) {
    const cleaned = ('' + phone).replace(/\D/g, '');
    if (cleaned.length === 11) {
        return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    if (cleaned.length === 10) {
    return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
}

/**
 * Calcula a distância haversina entre duas coordenadas.
 * @param {{lat: number, lng: number}} coords1 - Coordenadas do primeiro ponto.
 * @param {{lat: number, lon: number}} coords2 - Coordenadas do segundo ponto (lon, não lng).
 * @returns {number} A distância em quilômetros.
 */
export function haversineDistance(coords1, coords2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Raio da Terra em km

    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lon - coords1.lng); // Note a diferença: lon vs lng
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

/**
 * Normaliza um texto, removendo acentos e convertendo para minúsculas.
 * @param {string} text - O texto a ser normalizado.
 * @returns {string} O texto normalizado.
 */
export function normalizeText(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD") // Decompõe os caracteres acentuados
        .replace(/[\u0300-\u036f]/g, ""); // Remove os diacríticos (acentos)
}
