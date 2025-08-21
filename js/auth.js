import { dom } from './dom.js';
import { showPushNotification } from './ui.js';

export function setupAuthEventListeners() {
    dom.authButton.addEventListener('click', () => {
        dom.loginModal.classList.add('visible');
    });

    dom.closeModalButton.addEventListener('click', () => {
        dom.loginModal.classList.remove('visible');
        dom.loginErrorMessage.textContent = '';
    });

    dom.loginButton.addEventListener('click', () => {
        showPushNotification("Função de login temporariamente desativada.", "info");
    });

    dom.goToRegisterButton.addEventListener('click', () => {
        dom.loginModal.classList.remove('visible');
        dom.registerModal.classList.add('visible');
        dom.loginErrorMessage.textContent = '';
    });

    dom.forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        dom.loginModal.classList.remove('visible');
        dom.forgotPasswordModal.classList.add('visible');
        dom.loginErrorMessage.textContent = '';
    });

    dom.closeRegisterModalButton.addEventListener('click', () => {
        dom.registerModal.classList.remove('visible');
        dom.registerErrorMessage.textContent = '';
    });

    dom.backToLoginButton.addEventListener('click', () => {
        dom.registerModal.classList.remove('visible');
        dom.loginModal.classList.add('visible');
        dom.registerErrorMessage.textContent = '';
    });

    dom.createAccountButton.addEventListener('click', () => {
        const name = dom.registerNameInput.value.trim();
        const phone = dom.registerPhoneInput.value.trim();
        const password = dom.registerPasswordInput.value;
        const confirmPassword = dom.registerConfirmPasswordInput.value;
        
        dom.registerErrorMessage.textContent = '';

        if (!name || !phone) {
            dom.registerErrorMessage.textContent = 'Nome e telefone são obrigatórios.';
            return;
        }
        if (password.length < 6) {
            dom.registerErrorMessage.textContent = 'A senha deve ter no mínimo 6 caracteres.';
            return;
        }
        if (password !== confirmPassword) {
            dom.registerErrorMessage.textContent = 'As senhas não coincidem.';
            return;
        }

        showPushNotification("Função de cadastro temporariamente desativada.", "info");
    });

    dom.closeForgotModalButton.addEventListener('click', () => {
        dom.forgotPasswordModal.classList.remove('visible');
        dom.forgotErrorMessage.textContent = '';
    });

    dom.backToLoginFromForgotButton.addEventListener('click', () => {
        dom.forgotPasswordModal.classList.remove('visible');
        dom.loginModal.classList.add('visible');
        dom.forgotErrorMessage.textContent = '';
    });

    dom.sendCodeButton.addEventListener('click', () => {
        const phone = dom.forgotPhoneInput.value.trim();
        dom.forgotErrorMessage.textContent = '';

        if (!phone) {
            dom.forgotErrorMessage.textContent = 'Por favor, insira seu número de telefone.';
            return;
        }

        showPushNotification(`Um código de verificação foi enviado para ${phone}.`, 'info');
        
        dom.forgotPasswordModal.classList.remove('visible');
        dom.verifyCodeModal.classList.add('visible');
    });

    dom.closeVerifyModalButton.addEventListener('click', () => {
        dom.verifyCodeModal.classList.remove('visible');
        dom.verifyErrorMessage.textContent = '';
    });

    dom.backToLoginFromVerifyButton.addEventListener('click', () => {
        dom.verifyCodeModal.classList.remove('visible');
        dom.loginModal.classList.add('visible');
        dom.verifyErrorMessage.textContent = '';
    });

    dom.resetPasswordButton.addEventListener('click', () => {
        const code = dom.verifyCodeInput.value.trim();
        const newPassword = dom.newPasswordInput.value;
        const confirmNewPassword = dom.confirmNewPasswordInput.value;

        dom.verifyErrorMessage.textContent = '';

        if (code.length !== 6 || !/^\d+$/.test(code)) {
            dom.verifyErrorMessage.textContent = 'O código de verificação deve ter 6 dígitos.';
            return;
        }
        if (newPassword.length < 6) {
            dom.verifyErrorMessage.textContent = 'A nova senha deve ter no mínimo 6 caracteres.';
            return;
        }
        if (newPassword !== confirmNewPassword) {
            dom.verifyErrorMessage.textContent = 'As novas senhas não coincidem.';
            return;
        }

        showPushNotification('Senha redefinida com sucesso!', 'success');
        
        dom.verifyCodeInput.value = '';
        dom.newPasswordInput.value = '';
        dom.confirmNewPasswordInput.value = '';
        dom.verifyCodeModal.classList.remove('visible');
        dom.loginModal.classList.add('visible');
    });
}
