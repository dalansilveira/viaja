import { dom } from './dom.js';
import { showPushNotification } from './ui.js';
import { formatPhoneNumber } from './utils.js';
import { saveUserProfile, getUserProfile } from './firestore.js';
import { renderRideHistory, renderFavoritesList } from './history.js';
import { auth } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function setupAuthEventListeners() {
    dom.authMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.authMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!dom.authMenu.contains(e.target) && !dom.authMenuButton.contains(e.target)) {
            dom.authMenu.classList.add('hidden');
        }
    });

    dom.authMenuProfile.addEventListener('click', async () => {
        dom.authMenu.classList.add('hidden');
        dom.profileModal.classList.remove('hidden');
        
        const userUid = localStorage.getItem('user_uid');
        if (!userUid) return;

        const profileData = await getUserProfile(userUid);
        if (profileData) {
            dom.profileName.value = profileData.name || '';
            dom.profileEmail.value = profileData.email || '';
            dom.profileAddress.value = profileData.address || '';
            dom.profileNeighborhood.value = profileData.neighborhood || '';
            dom.profilePhone.value = profileData.phone ? formatPhoneNumber(profileData.phone) : '';
            
            if (profileData.picture) {
                dom.profilePicture.src = profileData.picture;
                dom.profilePicture.classList.remove('hidden');
                document.getElementById('profile-placeholder-svg').classList.add('hidden');
                dom.deleteProfilePictureButton.classList.remove('hidden');
            } else {
                dom.profilePicture.src = '';
                dom.profilePicture.classList.add('hidden');
                document.getElementById('profile-placeholder-svg').classList.remove('hidden');
                dom.deleteProfilePictureButton.classList.add('hidden');
            }
        }
    });

    dom.closeProfileModalButton.addEventListener('click', () => {
        dom.profileModal.classList.add('hidden');
    });

    dom.saveProfileButton.addEventListener('click', async () => {
        const userUid = localStorage.getItem('user_uid');
        if (!userUid) {
            showPushNotification("Você precisa estar logado para salvar o perfil.", "error");
            return;
        }

        const profileData = {
            name: dom.profileName.value,
            address: dom.profileAddress.value,
            neighborhood: dom.profileNeighborhood.value,
            picture: dom.profilePicture.classList.contains('hidden') ? '' : dom.profilePicture.src,
            phone: dom.profilePhone.value.replace(/\D/g, '') // Salva o telefone sem formatação
        };

        await saveUserProfile(userUid, profileData);
        
        showPushNotification("Perfil salvo com sucesso no Firestore!", "success");
        dom.profileModal.classList.add('hidden');
    });

    dom.profilePictureInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                dom.profilePicture.src = e.target.result;
                dom.profilePicture.classList.remove('hidden');
                document.getElementById('profile-placeholder-svg').classList.add('hidden');
                dom.deleteProfilePictureButton.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    dom.deleteProfilePictureButton.addEventListener('click', () => {
        dom.profilePicture.src = '';
        dom.profilePicture.classList.add('hidden');
        document.getElementById('profile-placeholder-svg').classList.remove('hidden');
        dom.deleteProfilePictureButton.classList.add('hidden');
        dom.profilePictureInput.value = ''; // Limpa o input de arquivo
    });

    dom.authMenuPreferences.addEventListener('click', () => {
        showPushNotification("Função de preferências ainda não implementada.", "info");
        dom.authMenu.classList.add('hidden');
    });

    dom.authMenuHistory.addEventListener('click', (e) => {
        e.preventDefault();
        renderRideHistory();
        dom.historyModal.classList.remove('hidden');
        dom.authMenu.classList.add('hidden');
    });

    dom.closeHistoryModalButton.addEventListener('click', () => {
        dom.historyModal.classList.add('hidden');
    });

    dom.authMenuFavorites.addEventListener('click', (e) => {
        e.preventDefault();
        renderFavoritesList();
        dom.favoritesModal.classList.remove('hidden');
        dom.authMenu.classList.add('hidden');
    });

    dom.closeFavoritesModalButton.addEventListener('click', () => {
        dom.favoritesModal.classList.add('hidden');
    });

    dom.authMenuLogout.addEventListener('click', () => {
        auth.signOut().catch((error) => {
            console.error("Erro ao desconectar:", error);
            showPushNotification("Erro ao tentar desconectar.", "error");
        });
        // A lógica onAuthStateChanged em app.js cuidará da limpeza e recarregamento.
    });

    dom.authMenuHelp.addEventListener('click', () => {
        showPushNotification("Função de ajuda ainda não implementada.", "info");
        dom.authMenu.classList.add('hidden');
    });

    // Desativa o botão de login por telefone, já que não será usado.
    dom.loginButton.addEventListener('click', () => {
        showPushNotification("Por favor, use o login com Google.", "info");
    });

    dom.googleLoginButton.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        
        signInWithPopup(auth, provider)
            .then(async (result) => {
                const user = result.user;
                showPushNotification(`Bem-vindo, ${user.displayName}!`, 'success');

                // Verifica se já existe um perfil para não sobrescrever dados
                const existingProfile = await getUserProfile(user.uid);
                if (!existingProfile) {
                    const profileData = {
                        name: user.displayName || '',
                        email: user.email || '',
                        picture: user.photoURL || '',
                        phone: user.phoneNumber || ''
                    };
                    await saveUserProfile(user.uid, profileData);
                }
                // onAuthStateChanged em app.js cuidará de recarregar a página e o estado.
            }).catch((error) => {
                console.error("Erro no login com Google:", error);
                showPushNotification(`Erro no login: ${error.message}`, "error");
            });
    });
}
