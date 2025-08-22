import { dom } from './dom.js';
import { showPushNotification } from './ui.js';
import { formatPhoneNumber } from './utils.js';

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

    dom.authMenuProfile.addEventListener('click', () => {
        dom.authMenu.classList.add('hidden');
        dom.profileModal.classList.remove('hidden');
        
        // Preenche o telefone do usuário se estiver logado
        const userPhone = localStorage.getItem('user_phone');
        if (userPhone) {
            dom.profilePhone.value = formatPhoneNumber(userPhone);
        }

        // Recupera e preenche os dados do perfil salvos
        const savedProfile = localStorage.getItem('user_profile');
        if (savedProfile) {
            const profileData = JSON.parse(savedProfile);
            dom.profileName.value = profileData.name || '';
            dom.profileAddress.value = profileData.address || '';
            dom.profileNeighborhood.value = profileData.neighborhood || '';
            
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

    dom.saveProfileButton.addEventListener('click', () => {
        const profileData = {
            name: dom.profileName.value,
            address: dom.profileAddress.value,
            neighborhood: dom.profileNeighborhood.value,
            picture: dom.profilePicture.classList.contains('hidden') ? '' : dom.profilePicture.src
        };

        localStorage.setItem('user_profile', JSON.stringify(profileData));
        
        showPushNotification("Perfil salvo com sucesso!", "success");
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

    dom.authMenuLogout.addEventListener('click', () => {
        // Remove todos os dados do usuário do localStorage
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_phone');
        localStorage.removeItem('user_profile');
        
        showPushNotification("Você foi desconectado.", "info");
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    });

    dom.authMenuHelp.addEventListener('click', () => {
        showPushNotification("Função de ajuda ainda não implementada.", "info");
        dom.authMenu.classList.add('hidden');
    });

    dom.googleLoginButton.addEventListener('click', () => {
        showPushNotification("Login com Google ainda não implementado.", "info");
    });

    dom.loginPhoneInput.addEventListener('input', (e) => {
        const input = e.target;
        let value = input.value.replace(/\D/g, '');
        
        if (value.length > 11) {
            value = value.slice(0, 11);
        }

        if (value.length > 10) { // Celular com 9º dígito
            value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
        } else if (value.length > 6) { // Celular com 8 dígitos ou Fixo
            value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        } else if (value.length > 2) {
            value = value.replace(/^(\d{2})(\d*)/, '($1) $2');
        } else {
            value = value.replace(/^(\d*)/, '($1');
        }
        
        input.value = value;
    });

    dom.loginButton.addEventListener('click', () => {
        const phone = dom.loginPhoneInput.value.trim().replace(/\D/g, '');
        if (phone.length < 10 || phone.length > 11) {
            dom.loginErrorMessage.textContent = 'Por favor, insira um telefone válido.';
            return;
        }
        showPushNotification(`Enviando código para ${formatPhoneNumber(phone)}...`, "info");
        localStorage.setItem('user_phone', phone); // Salva o telefone para usar no perfil
        // Simula o envio do código e a transição para a tela de verificação
        setTimeout(() => {
            dom.welcomeModal.style.display = 'none';
            dom.verifyCodeModal.classList.add('visible');
            dom.verifyCodeInput.focus(); // Foco no campo de código
        }, 1000);
    });

    dom.closeVerifyModalButton.addEventListener('click', () => {
        dom.verifyCodeModal.classList.remove('visible');
    });

    dom.backToLoginFromVerifyButton.addEventListener('click', () => {
        dom.verifyCodeModal.classList.remove('visible');
        dom.welcomeModal.style.display = 'flex';
    });

    dom.verifyCodeButton.addEventListener('click', () => {
        const code = dom.verifyCodeInput.value.trim();
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            dom.verifyErrorMessage.textContent = 'O código deve ter 6 dígitos.';
            return;
        }
        // Simulação de verificação de código
        showPushNotification('Login bem-sucedido!', 'success');
        localStorage.setItem('user_token', 'fake_user_token'); // Simula a criação de um token de sessão
        
        setTimeout(() => {
            dom.verifyCodeModal.classList.remove('visible');
            window.location.reload(); // Recarrega a página para acionar a lógica de inicialização do app
        }, 1000);
    });
}
