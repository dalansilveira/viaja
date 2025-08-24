import { db } from './firebase-config.js';
import { doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp, limit, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeText } from './utils.js';

/**
 * Salva ou atualiza os dados do perfil de um usuário no Firestore.
 * @param {string} userId - O ID do usuário (UID do Firebase Auth).
 * @param {object} profileData - Um objeto contendo os dados do perfil (nome, endereço, etc.).
 */
export async function saveUserProfile(userId, profileData) {
  if (!userId) {
    console.error("ID do usuário é necessário para salvar o perfil.");
    return;
  }
  try {
    // Cria uma referência para o documento do usuário na subcoleção 'users'
    const userDocRef = doc(db, "viaja1", "dados", "users", userId);
    // Usa setDoc com merge: true para criar ou atualizar o documento
    await setDoc(userDocRef, profileData, { merge: true });
    console.log("Perfil do usuário salvo com sucesso:", userId);
  } catch (error) {
    console.error("Erro ao salvar o perfil do usuário:", error);
  }
}

/**
 * Busca os dados do perfil de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<object|null>} Os dados do perfil ou null se não encontrado.
 */
export async function getUserProfile(userId) {
  if (!userId) {
    console.error("ID do usuário é necessário para buscar o perfil.");
    return null;
  }
  try {
    const userDocRef = doc(db, "viaja1", "dados", "users", userId);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      console.log("Perfil encontrado:", docSnap.data());
      return docSnap.data();
    } else {
      console.log("Nenhum perfil encontrado para o usuário:", userId);
      return null;
    }
  } catch (error) {
    console.error("Erro ao buscar o perfil do usuário:", error);
        return null;
    }
}

/**
 * Atualiza o status de uma corrida existente.
 * @param {string} rideId - O ID da corrida a ser atualizada.
 * @param {string} newStatus - O novo status para a corrida (ex: 'canceled', 'completed').
 * @returns {Promise<boolean>} True se a atualização for bem-sucedida, false caso contrário.
 */
export async function updateRideStatus(rideId, newStatus) {
    if (!rideId || !newStatus) {
        console.error("ID da corrida e novo status são necessários.");
        return false;
    }

    const rideRef = doc(db, "viaja1", "dados", "corridas", rideId);

    try {
        await setDoc(rideRef, { status: newStatus }, { merge: true });
        console.log(`Status da corrida ${rideId} atualizado para ${newStatus}.`);
        return true;
    } catch (error) {
        console.error(`Erro ao atualizar status da corrida ${rideId}:`, error);
        return false;
    }
}

/**
 * Salva uma sugestão de endereço no cache global do Firestore se ela não existir.
 * @param {object} place - O objeto de local da API de geocodificação.
 */
export async function saveSuggestionToCache(place) {
    // Se o objetivo é apenas um índice de nomes de ruas, a rua é o único campo obrigatório.
    if (!place || !place.address || !place.address.road) {
        return;
    }

    const { road, suburb, city, state } = place.address;
    const { lat, lon } = place;

    const suggestionsRef = collection(db, "viaja1", "dados", "sugestoes_cache");
    
    // Verifica se uma rua com o mesmo nome normalizado já existe no cache.
    // A verificação de cidade e bairro foi removida conforme a solicitação.
    const q = query(suggestionsRef, 
        where("rua_lowercase", "==", normalizeText(road))
    );

    try {
        const querySnapshot = await getDocs(q);
        // Salva apenas se não encontrar nenhuma entrada com o mesmo nome de rua.
        if (querySnapshot.empty) {
            const newSuggestionRef = doc(suggestionsRef);
            await setDoc(newSuggestionRef, {
                id: newSuggestionRef.id,
                rua: road,
                rua_lowercase: normalizeText(road),
                // Os outros dados ainda são salvos para uso posterior, se necessário.
                bairro: suburb || '',
                cidade: city || '',
                uf: state || '',
                lat: lat,
                lng: lon,
                createdAt: serverTimestamp()
            });
            console.log("Nova rua salva no cache:", road);
        } else {
            // Opcional: log para indicar que a duplicata foi encontrada e ignorada.
            console.log(`Rua duplicada encontrada no cache, não será salva: "${road}"`);
        }
    } catch (error) {
        console.error("Erro ao salvar sugestão no cache:", error);
    }
}

/**
 * Consulta o cache de sugestões para encontrar uma correspondência de autocompletar.
 * @param {string} queryText - O texto parcial da rua.
 * @returns {Promise<object|null>} O documento de sugestão correspondente ou nulo.
 */
export async function querySuggestionCache(queryText) {
    console.log(`Consultando cache do Firestore para: "${queryText}"`);
    if (!queryText || queryText.length < 3) return null;

    const suggestionsRef = collection(db, "viaja1", "dados", "sugestoes_cache");
    
    // Consulta por ruas que começam com o texto digitado (normalizado)
    const normalizedQuery = normalizeText(queryText);
    const q = query(suggestionsRef,
        where("rua_lowercase", ">=", normalizedQuery),
        where("rua_lowercase", "<=", normalizedQuery + '\uf8ff'),
        limit(1)
    );

    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const bestMatch = querySnapshot.docs[0].data();
            console.log("Resultado da consulta ao cache:", bestMatch);
            return bestMatch;
        } else {
            console.log("Nenhum resultado encontrado no cache para a consulta.");
        }
        return null;
    } catch (error) {
        console.error("Erro ao consultar o cache de sugestões:", error);
        return null;
    }
}

/**
 * (APENAS PARA MIGRAÇÃO) Move os dados da coleção 'users' para a nova subcoleção.
 * Esta função deve ser chamada manualmente uma vez a partir do console do navegador.
 */
export async function migrateUserData() {
    console.log("Iniciando migração de dados de usuários...");
    const oldUsersRef = collection(db, "users");
    const oldUsersSnap = await getDocs(oldUsersRef);

    if (oldUsersSnap.empty) {
        console.log("Nenhum usuário encontrado na coleção antiga. Nenhuma migração necessária.");
        return;
    }

    let migratedCount = 0;
    for (const userDoc of oldUsersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const newUserRef = doc(db, "viaja1", "dados", "users", userId);

        try {
            await setDoc(newUserRef, userData);
            console.log(`Usuário ${userId} migrado com sucesso.`);
            // ATENÇÃO: A exclusão do documento antigo deve ser feita com cuidado.
            // Por segurança, vamos deixar isso comentado por enquanto.
            // await deleteDoc(userDoc.ref);
            migratedCount++;
        } catch (error) {
            console.error(`Erro ao migrar usuário ${userId}:`, error);
        }
    }
    console.log(`Migração concluída. ${migratedCount} de ${oldUsersSnap.size} usuários migrados.`);
}

/**
 * (APENAS PARA MIGRAÇÃO) Adiciona o campo 'rua_lowercase' aos documentos existentes no cache.
 * Esta função deve ser chamada manualmente uma vez a partir do console do navegador.
 */
export async function migrateSuggestionCache() {
    console.log("Iniciando migração do cache de sugestões...");
    const suggestionsRef = collection(db, "viaja1", "dados", "sugestoes_cache");
    
    try {
        const snapshot = await getDocs(suggestionsRef);

        if (snapshot.empty) {
            console.log("Nenhuma sugestão no cache. Nenhuma migração necessária.");
            return;
        }

        let migratedCount = 0;
        const promises = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // Verifica se o campo 'rua' existe e se o campo 'rua_lowercase' precisa ser atualizado
            if (data.rua && typeof data.rua === 'string') {
                const normalizedValue = normalizeText(data.rua);
                // Atualiza apenas se o valor normalizado for diferente do que já existe
                if (data.rua_lowercase !== normalizedValue) {
                    const updatePromise = setDoc(doc.ref, { rua_lowercase: normalizedValue }, { merge: true });
                    promises.push(updatePromise);
                    migratedCount++;
                }
            }
        });

        if (promises.length === 0) {
            console.log("Todos os documentos já estão atualizados. Nenhuma migração necessária.");
            return;
        }

        await Promise.all(promises);
        console.log(`Migração do cache concluída. ${migratedCount} de ${snapshot.size} documentos atualizados.`);

    } catch (error) {
        console.error("Erro durante a migração do cache de sugestões:", error);
    }
}

/**
 * Salva uma corrida confirmada no Firestore.
 * @param {object} rideData - Um objeto contendo todos os dados da viagem.
 * @returns {Promise<string|null>} O ID da corrida salva ou nulo em caso de erro.
 */
export async function saveRide(rideData) {
    if (!rideData || !rideData.userId) {
        console.error("Dados da corrida ou ID do usuário ausentes.");
        return null;
    }

    // Cria um objeto "limpo" para o Firestore, evitando referências circulares.
    const cleanRideData = {
        userId: rideData.userId,
        origin: {
            lat: rideData.origin.latlng.lat,
            lng: rideData.origin.latlng.lng,
            address: rideData.origin.data.display_name || ''
        },
        destination: {
            lat: rideData.destination.latlng.lat,
            lng: rideData.destination.latlng.lng,
            address: rideData.destination.data.display_name || ''
        },
        trip: rideData.trip, // tripData já é um objeto limpo
        status: 'pending',
        createdAt: serverTimestamp()
    };

    try {
        const ridesRef = collection(db, "viaja1", "dados", "corridas");
        const newRideRef = doc(ridesRef);
        
        // Adiciona o ID gerado ao objeto antes de salvar
        cleanRideData.id = newRideRef.id;

        await setDoc(newRideRef, cleanRideData);

        console.log("Corrida salva com sucesso:", newRideRef.id);
        return newRideRef.id;
    } catch (error) {
        console.error("Erro ao salvar a corrida:", error);
        return null;
    }
}

/**
 * Busca por uma corrida em andamento para um determinado usuário.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<object|null>} Os dados da corrida em andamento ou nulo se não houver.
 */
export async function getOngoingRide(userId) {
    if (!userId) return null;

    const ridesRef = collection(db, "viaja1", "dados", "corridas");
    const q = query(
        ridesRef,
        where("userId", "==", userId),
        where("status", "==", "pending"),
        limit(1)
    );

    try {
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const rideData = querySnapshot.docs[0].data();
            console.log("Corrida em andamento encontrada:", rideData);
            return rideData;
        }
        return null;
    } catch (error) {
        console.error("Erro ao buscar corrida em andamento:", error);
        return null;
    }
}

// --- Funções para Histórico e Favoritos ---

/**
 * Adiciona um local ao histórico de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @param {object} place - O objeto do local a ser salvo.
 */
export async function addHistory(userId, place) {
    // Usa uma combinação de lat/lng como ID único, já que place_id pode não existir.
    const placeId = place.place_id || `${place.lat},${place.lon}`;
    if (!userId || !place) return;
    
    try {
        const historyRef = doc(db, "viaja1", "dados", "users", userId, "history", placeId);
        await setDoc(historyRef, {
            ...place,
            id: placeId, // Garante que o ID esteja no documento
            savedAt: serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error("Erro ao salvar no histórico do Firestore:", error);
    }
}

/**
 * Busca o histórico de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array>} Uma lista de locais do histórico.
 */
export async function getHistory(userId) {
    if (!userId) return [];
    try {
        const historyCol = collection(db, "viaja1", "dados", "users", userId, "history");
        const q = query(historyCol, orderBy("savedAt", "desc"), limit(20)); // Pega os 20 mais recentes
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Erro ao buscar histórico do Firestore:", error);
        return [];
    }
}

/**
 * Adiciona um local aos favoritos de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @param {object} place - O objeto do local a ser salvo.
 */
export async function addFavorite(userId, place) {
    if (!userId || !place || !place.place_id) return;
    try {
        const favoriteRef = doc(db, "viaja1", "dados", "users", userId, "favorites", place.place_id.toString());
        await setDoc(favoriteRef, {
            ...place,
            savedAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao salvar favorito no Firestore:", error);
    }
}

/**
 * Remove um local dos favoritos de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @param {string} placeId - O ID do local a ser removido.
 */
export async function removeFavorite(userId, placeId) {
    if (!userId || !placeId) return;
    try {
        const favoriteRef = doc(db, "viaja1", "dados", "users", userId, "favorites", placeId.toString());
        await deleteDoc(favoriteRef);
    } catch (error) {
        console.error("Erro ao remover favorito do Firestore:", error);
    }
}

/**
 * Busca os favoritos de um usuário no Firestore.
 * @param {string} userId - O ID do usuário.
 * @returns {Promise<Array>} Uma lista de locais favoritos.
 */
export async function getFavorites(userId) {
    if (!userId) return [];
    try {
        const favoritesCol = collection(db, "viaja1", "dados", "users", userId, "favorites");
        const q = query(favoritesCol, orderBy("savedAt", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Erro ao buscar favoritos do Firestore:", error);
        return [];
    }
}
