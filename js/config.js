export const AppConfig = {
    // Número mínimo de caracteres para acionar a busca do "texto fantasma".
    MIN_GHOST_QUERY_LENGTH: 6,

    // Número mínimo de caracteres para acionar a busca na API de geocodificação.
    MIN_GEO_API_QUERY_LENGTH: 2,

    // Tempo (em ms) de espera após o usuário parar de digitar para iniciar a busca.
    INPUT_DEBOUNCE_DELAY: 300,

    // Raio (em km) para priorizar buscas de endereço por proximidade.
    GEO_API_PROXIMITY_RADIUS_KM: 50,

    // Definição das tarifas de transporte
    VEHICLE_RATES: {
        'Moto': { base: 6.00, perKm: 1.50, minFare: 8.00 },
        'Carro': { base: 8.00, perKm: 2.50, minFare: 12.00 },
        'Lotação': { base: 5.00, perKm: 1.00, minFare: 7.00 },
        'Entrega': { base: 7.00, perKm: 2.00, minFare: 10.00 }
    },
};
