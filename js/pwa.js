import { dom } from './dom.js';
import * as state from './state.js';

export function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.setDeferredPrompt(e);

        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        if (isMobile && !isStandalone) {
            dom.installBanner.classList.remove('hidden');
            dom.installBanner.classList.add('visible');
        }
    });

    dom.installButton.addEventListener('click', async () => {
        if (!state.deferredPrompt) return;

        dom.installBanner.classList.remove('visible');
        dom.installBanner.classList.add('hidden');

        state.deferredPrompt.prompt();
        state.setDeferredPrompt(null);
    });

    window.addEventListener('appinstalled', () => {
        state.setDeferredPrompt(null);
    });

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./js/sw.js').then(registration => {
                console.log('ServiceWorker registrado com sucesso: ', registration.scope);
            }).catch(error => {
                console.log('Falha ao registrar o ServiceWorker: ', error);
            });
        });
    }
}
