import { dom } from './dom.js';
import { showPushNotification } from './ui.js';

export function setupAuthEventListeners() {
    dom.authMenuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dom.authMenu.classList.toggle('hidden');
    });

    dom.authMenuLogin.addEventListener('click', () => {
        dom.authMenu.classList.add('hidden');
        dom.welcomeModal.style.display = 'flex';
    });

    document.addEventListener('click', (e) => {
        if (!dom.authMenu.contains(e.target) && !dom.authMenuButton.contains(e.target)) {
            dom.authMenu.classList.add('hidden');
        }
    });

    dom.authMenuProfile.addEventListener('click', () => {
        showPushNotification("Função de perfil ainda não implementada.", "info");
        dom.authMenu.classList.add('hidden');
    });

    dom.authMenuLogout.addEventListener('click', () => {
        localStorage.removeItem('user_token');
        window.location.reload();
    });

    dom.authMenuHelp.addEventListener('click', () => {
        showPushNotification("Função de ajuda ainda não implementada.", "info");
        dom.authMenu.classList.add('hidden');
    });

    dom.loginButton.addEventListener('click', () => {
        const phone = dom.loginPhoneInput.value.trim();
        if (!phone) {
            dom.loginErrorMessage.textContent = 'Por favor, insira seu telefone.';
            return;
        }
        showPushNotification(`Enviando código para ${phone}...`, "info");
        // Simula o envio do código e a transição para a tela de verificação
        setTimeout(() => {
            dom.welcomeModal.style.display = 'none';
            dom.verifyCodeModal.classList.add('visible');
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
