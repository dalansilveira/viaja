import { db } from './firebase-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    // Cria uma referência para o documento do usuário na coleção 'users'
    const userDocRef = doc(db, "users", userId);
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
    const userDocRef = doc(db, "users", userId);
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
