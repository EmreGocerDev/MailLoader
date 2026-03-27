const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const EmailService = require('./src/emailService');
const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'mailloader-secure-key-2024',
  schema: {
    accounts: { type: 'array', default: [] },
    activeAccount: { type: 'number', default: -1 },
    theme: { type: 'string', default: 'light' },
    accentColor: { type: 'string', default: '#1a73e8' },
    bgImage: { type: 'string', default: '' },
    glassEnabled: { type: 'boolean', default: false },
    liquidEnabled: { type: 'boolean', default: false },
    selectedLogo: { type: 'string', default: 'logo.ico' },
    contacts: { type: 'array', default: [] },
    lastSeenUid: { type: 'number', default: 0 },
    notificationSound: { type: 'string', default: 'default' }
  }
});

let mainWindow;
let tray = null;
let isQuitting = false;
let mailCheckInterval = null;
const emailServices = new Map();

function getIconPath() {
  const logo = store.get('selectedLogo', 'logo.ico');
  return path.join(__dirname, 'assets', logo);
}

function createTray() {
  const iconPath = getIconPath();
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'MailLoader Aç', click: () => { mainWindow?.show(); } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('MailLoader');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: getIconPath(),
    backgroundColor: '#f8f9fa',
    show: false
  });

  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray on close
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createTray();
  createWindow();
  startMailCheck();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Don't quit — tray keeps app alive
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createWindow();
  }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.hide());

// Account management
ipcMain.handle('get-accounts', () => {
  const accounts = store.get('accounts', []);
  return accounts.map(a => ({ email: a.email, name: a.name, provider: a.provider }));
});

ipcMain.handle('get-active-account', () => store.get('activeAccount', -1));

ipcMain.handle('set-active-account', (_, index) => {
  store.set('activeAccount', index);
  return true;
});

ipcMain.handle('add-account', async (_, accountData) => {
  try {
    const service = new EmailService(accountData);
    await service.connect();

    const accounts = store.get('accounts', []);
    const existingIndex = accounts.findIndex(a => a.email === accountData.email);

    if (existingIndex >= 0) {
      accounts[existingIndex] = accountData;
      emailServices.set(existingIndex, service);
    } else {
      accounts.push(accountData);
      emailServices.set(accounts.length - 1, service);
    }

    store.set('accounts', accounts);
    store.set('activeAccount', existingIndex >= 0 ? existingIndex : accounts.length - 1);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-account', (_, index) => {
  const accounts = store.get('accounts', []);
  if (index >= 0 && index < accounts.length) {
    const service = emailServices.get(index);
    if (service) service.disconnect();
    emailServices.delete(index);
    accounts.splice(index, 1);
    store.set('accounts', accounts);

    const active = store.get('activeAccount', -1);
    if (active >= accounts.length) {
      store.set('activeAccount', accounts.length - 1);
    }
    return true;
  }
  return false;
});

// Email operations
async function getActiveService() {
  const activeIndex = store.get('activeAccount', -1);
  const accounts = store.get('accounts', []);

  if (activeIndex < 0 || activeIndex >= accounts.length) return null;

  if (!emailServices.has(activeIndex)) {
    const service = new EmailService(accounts[activeIndex]);
    await service.connect();
    emailServices.set(activeIndex, service);
  }

  return emailServices.get(activeIndex);
}

ipcMain.handle('fetch-emails', async (_, folder = 'INBOX', page = 1, perPage = 50) => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    const emails = await service.fetchEmails(folder, page, perPage);
    return { success: true, emails };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('fetch-email', async (_, uid, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    const email = await service.fetchEmail(uid, folder);
    return { success: true, email };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-email', async (_, emailData) => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    await service.sendEmail(emailData);
    // Play outgoing sound
    if (mainWindow) {
      mainWindow.webContents.send('play-sent-sound');
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-folders', async () => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    const folders = await service.getFolders();
    return { success: true, folders };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-email', async (_, uid, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    await service.deleteEmail(uid, folder);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mark-read', async (_, uid, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    await service.markAsRead(uid, folder);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mark-starred', async (_, uid, starred, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    await service.markStarred(uid, starred, folder);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('search-emails', async (_, query, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };

    const emails = await service.searchEmails(query, folder);
    return { success: true, emails };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-external', (_, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('pick-attachments', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Dosya Ekle',
    properties: ['openFile', 'multiSelections']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths.map(fp => ({
      filename: path.basename(fp),
      path: fp,
      size: fs.statSync(fp).size
    }));
  }
  return [];
});

ipcMain.handle('save-attachment', async (_, { filename, content, contentType }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Eki Kaydet',
    defaultPath: filename || 'attachment'
  });
  if (!result.canceled && result.filePath) {
    const buf = Buffer.from(content, 'base64');
    fs.writeFileSync(result.filePath, buf);
    shell.showItemInFolder(result.filePath);
    return true;
  }
  return false;
});

ipcMain.handle('get-sound-path', (_, soundFile) => {
  const safe = path.basename(soundFile);
  const fullPath = path.join(__dirname, 'assets', 'sound', safe);
  if (fs.existsSync(fullPath)) return fullPath;
  return null;
});

// Theme settings
ipcMain.handle('get-theme-settings', () => {
  return {
    theme: store.get('theme', 'light'),
    accentColor: store.get('accentColor', '#1a73e8'),
    bgImage: store.get('bgImage', ''),
    glassEnabled: store.get('glassEnabled', false),
    liquidEnabled: store.get('liquidEnabled', false)
  };
});

ipcMain.handle('save-theme-settings', (_, settings) => {
  if (settings.theme) store.set('theme', settings.theme);
  if (settings.accentColor) store.set('accentColor', settings.accentColor);
  if (settings.bgImage !== undefined) store.set('bgImage', settings.bgImage);
  if (settings.glassEnabled !== undefined) store.set('glassEnabled', settings.glassEnabled);
  if (settings.liquidEnabled !== undefined) store.set('liquidEnabled', settings.liquidEnabled);
  return true;
});

ipcMain.handle('pick-bg-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Arkaplan Resmi Seç',
    filters: [{ name: 'Resimler', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1);
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const base64 = `data:image/${mime};base64,${data.toString('base64')}`;
    store.set('bgImage', base64);
    return base64;
  }
  return null;
});

// ============ Logo Selection ============
ipcMain.handle('get-available-logos', () => {
  const assetsDir = path.join(__dirname, 'assets');
  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.ico'));
  return files;
});

ipcMain.handle('get-selected-logo', () => store.get('selectedLogo', 'logo.ico'));

ipcMain.handle('set-selected-logo', (_, logoFile) => {
  const safe = path.basename(logoFile);
  const fullPath = path.join(__dirname, 'assets', safe);
  if (!fs.existsSync(fullPath)) return false;
  store.set('selectedLogo', safe);
  // Update tray icon
  if (tray) tray.setImage(fullPath);
  // Update window icon
  if (mainWindow) mainWindow.setIcon(fullPath);
  return true;
});

// ============ Contacts ============
ipcMain.handle('get-contacts', () => store.get('contacts', []));

ipcMain.handle('save-contact', (_, contact) => {
  const contacts = store.get('contacts', []);
  const existing = contacts.findIndex(c => c.email === contact.email);
  if (existing >= 0) {
    contacts[existing] = { ...contacts[existing], ...contact };
  } else {
    contacts.push({ name: contact.name, email: contact.email, addedAt: new Date().toISOString() });
  }
  store.set('contacts', contacts);
  return contacts;
});

ipcMain.handle('remove-contact', (_, email) => {
  const contacts = store.get('contacts', []).filter(c => c.email !== email);
  store.set('contacts', contacts);
  return contacts;
});

// ============ Notification Sound ============
ipcMain.handle('get-notification-sound', () => store.get('notificationSound', 'default'));

ipcMain.handle('set-notification-sound', (_, sound) => {
  store.set('notificationSound', sound);
  return true;
});

ipcMain.handle('get-available-sounds', () => {
  const soundDir = path.join(__dirname, 'assets', 'sound');
  if (!fs.existsSync(soundDir)) {
    fs.mkdirSync(soundDir, { recursive: true });
  }
  const custom = fs.readdirSync(soundDir).filter(f => /\.(wav|mp3|ogg)$/i.test(f));
  return ['default', ...custom];
});

ipcMain.handle('play-notification-sound', () => {
  if (mainWindow) {
    mainWindow.webContents.send('play-sound');
  }
  return true;
});

// ============ Background Mail Check ============
async function startMailCheck() {
  // Seed lastSeenUid on first run so we don't flood notifications
  try {
    const lastSeen = store.get('lastSeenUid', 0);
    if (lastSeen === 0) {
      const service = await getActiveService();
      if (service) {
        const headers = await service.getLatestHeaders('INBOX', 1);
        if (headers.length > 0) {
          store.set('lastSeenUid', Math.max(...headers.map(e => e.uid)));
        }
      }
    }
  } catch (e) { /* ignore seed errors */ }

  // Check every 60 seconds
  if (mailCheckInterval) clearInterval(mailCheckInterval);
  mailCheckInterval = setInterval(checkForNewMail, 60000);
}

async function checkForNewMail() {
  try {
    const activeIndex = store.get('activeAccount', -1);
    const accounts = store.get('accounts', []);
    if (activeIndex < 0 || activeIndex >= accounts.length) return;

    let service = emailServices.get(activeIndex);
    if (!service) {
      service = new EmailService(accounts[activeIndex]);
      await service.connect();
      emailServices.set(activeIndex, service);
    }

    const headers = await service.getLatestHeaders('INBOX', 3);
    const lastSeenUid = store.get('lastSeenUid', 0);
    const newEmails = headers.filter(e => e.uid > lastSeenUid && !e.seen);

    if (newEmails.length > 0) {
      store.set('lastSeenUid', Math.max(...headers.map(e => e.uid)));

      // Show system notification
      const newest = newEmails[0];
      const notification = new Notification({
        title: `Yeni E-posta (${newEmails.length})`,
        body: `${newest.from}\n${newest.subject}`,
        icon: getIconPath(),
        silent: true // We play our own sound
      });
      notification.on('click', () => {
        mainWindow?.show();
      });
      notification.show();

      // Tell renderer to play sound and refresh
      if (mainWindow) {
        mainWindow.webContents.send('play-sound');
        mainWindow.webContents.send('new-mail-arrived', newEmails.length);
      }
    }
  } catch (e) {
    // Silently fail background checks
  }
}

// Force quit handler
ipcMain.handle('force-quit', () => {
  isQuitting = true;
  for (const [, service] of emailServices) {
    service.disconnect();
  }
  app.quit();
});
