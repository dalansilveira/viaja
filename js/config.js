export const AppConfig = {
    // Número mínimo de caracteres para acionar a busca do "texto fantasma".
    MIN_GHOST_QUERY_LENGTH: 6,

    // Número mínimo de caracteres para acionar a busca na API de geocodificação.
    MIN_GEO_API_QUERY_LENGTH: 3,

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

    // Chave da API para o serviço OpenCageData
    OPENCAGE_API_KEY: 'f9ac031b19484703bfb57a553a0d9c4b',

    // Cores para o mapa e rotas
    MAP_THEME_COLORS: {
        light: {
            mainRoute: { routeColor: '#3b82f6', casingColor: 'rgba(0, 0, 0, 0.6)' }, // Azul / Preto
            driverToOrigin: { routeColor: '#8b5cf6', casingColor: 'rgba(107, 114, 128, 0.6)' }, // Purple / Dark Gray
            driverToDestination: { routeColor: '#f97316', casingColor: 'rgba(107, 114, 128, 0.6)' } // Orange / Dark Gray
        },
        dark: {
            mainRoute: { routeColor: '#FFD700', casingColor: 'rgba(255, 255, 255, 0.8)' }, // Gold / White
            driverToOrigin: { routeColor: '#06b6d4', casingColor: 'rgba(209, 213, 219, 0.8)' }, // Cyan / Light Gray
            driverToDestination: { routeColor: '#10b981', casingColor: 'rgba(209, 213, 219, 0.8)' } // Green / Light Gray
        }
    },

    // Tempos de animação de rotas (em ms)
    ROUTE_ANIMATION_DURATIONS: {
        driverToOriginMax: 20000, // Duração máxima para a rota do motorista até a origem (40 segundos)
        driverToDestinationMax: 20000 // Duração máxima para a rota da origem até o destino (40 segundos)
    },

    // Definições de zoom do mapa
    MAP_ZOOM_LEVELS: {
        DEFAULT: 10, // Zoom padrão para inicialização do mapa
        USER_LOCATION_GPS: 16, // Zoom para localização do usuário via GPS
        USER_LOCATION_IP_FALLBACK: 10, // Zoom para localização do usuário via IP (fallback)
        MAX_TILE_ZOOM: 19, // Zoom máximo para o tile layer
        FIT_BOUNDS_PADDING: 50 // Padding para fitBounds
    }
};
