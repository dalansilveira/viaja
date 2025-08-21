
// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Cria uma instância para armazenar os dados da aplicação
const store = new Store();

let mainWindow;
let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, '..', 'imgs/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-splash.js')
    }
  });
  splashWindow.loadFile('splash.html');
}

function createWindow() {
  // Define as dimensões padrão e carrega as últimas salvas, se existirem.
  const defaultBounds = { width: 800, height: 600 };
  const savedBounds = store.get('windowBounds', defaultBounds);

  // Cria a janela do navegador, mas não a exibe ainda.
  mainWindow = new BrowserWindow({
    x: savedBounds.x,
    y: savedBounds.y,
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 450,
    minHeight: 700,
    icon: path.join(__dirname, '..', 'imgs/logo.png'), // Adiciona um ícone à janela
    show: false, // Importante: não mostrar a janela principal imediatamente
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js')
    }
  });

  // Removemos a maximização forçada para que a janela possa ser restaurada
  // para o tamanho que tinha quando foi fechada. Se ela foi fechada maximizada,
  // o Electron geralmente a restaurará maximizada.
  // mainWindow.maximize();

  // Envia atualizações de progresso para a tela de splash
  const wc = mainWindow.webContents;

  wc.on('did-start-loading', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('update-progress', 20); // Começou a carregar
    }
  });

  wc.once('dom-ready', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('update-progress', 60); // DOM pronto
    }
  });

  wc.on('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('update-progress', 100); // Carregamento finalizado
    }
  });

  // e carrega o teste.html do seu app.
  mainWindow.loadFile('index.html');

  mainWindow.setMenu(null); // Remove o menu padrão (File, Edit, etc.)

  // Salva a posição e o tamanho da janela quando ela for fechada.
  mainWindow.on('close', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });

  // Quando a janela principal estiver pronta para ser exibida,
  // fechamos a tela de splash e mostramos a janela principal.
  mainWindow.once('ready-to-show', () => {
    // Um pequeno atraso garante que o usuário veja a barra de progresso em 100%.
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow.show();
    }, 1200); // Atraso de 200ms
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
