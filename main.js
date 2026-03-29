const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const EmailService = require('./src/emailService');
const Store = require('electron-store');

let googleApis;
try { googleApis = require('googleapis'); } catch (e) { googleApis = null; }

const store = new Store({
  encryptionKey: 'mailloader-secure-key-2024',
  schema: {
    accounts: { type: 'array', default: [] },
    activeAccount: { type: 'number', default: -1 },
    theme: { type: 'string', default: 'light' },
    accentColor: { type: 'string', default: '#1a73e8' },
    bgImage: { type: 'string', default: '' },
    glassEnabled: { type: 'boolean', default: false },
    glassOpacity: { type: 'number', default: 0.8 },
    liquidEnabled: { type: 'boolean', default: false },
    selectedLogo: { type: 'string', default: 'logo.ico' },
    contacts: { type: 'array', default: [] },
    lastSeenUid: { type: 'number', default: 0 },
    notificationSound: { type: 'string', default: 'default' },
    quickReplies: { type: 'array', default: [] },
    driveTokens: { type: 'object', default: {} },
    driveTokensPerAccount: { type: 'object', default: {} },
    geminiApiKey: { type: 'string', default: '' },
    geminiModel: { type: 'string', default: 'gemini-1.5-flash' },
    githubTokensPerAccount: { type: 'object', default: {} },
    evdsKeysPerAccount: { type: 'object', default: {} },
    twelveDataKeysPerAccount: { type: 'object', default: {} },
    twelveDataCache: { type: 'object', default: {} }
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
    glassOpacity: store.get('glassOpacity', 0.8),
    liquidEnabled: store.get('liquidEnabled', false)
  };
});

ipcMain.handle('save-theme-settings', (_, settings) => {
  if (settings.theme) store.set('theme', settings.theme);
  if (settings.accentColor) store.set('accentColor', settings.accentColor);
  if (settings.bgImage !== undefined) store.set('bgImage', settings.bgImage);
  if (settings.glassEnabled !== undefined) store.set('glassEnabled', settings.glassEnabled);
  if (settings.glassOpacity !== undefined) store.set('glassOpacity', settings.glassOpacity);
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

      // Tell renderer to play sound, show custom popup, and refresh
      if (mainWindow) {
        mainWindow.webContents.send('play-sound');
        mainWindow.webContents.send('new-mail-arrived', newEmails.length);
        mainWindow.webContents.send('show-notification-popup', {
          count: newEmails.length,
          from: newest.from,
          subject: newest.subject
        });
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

// ============ Bulk Delete ============
ipcMain.handle('delete-multiple-emails', async (_, uids, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };
    await service.deleteMultipleEmails(uids, folder);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-non-favorites', async (_, folder = 'INBOX') => {
  try {
    const service = await getActiveService();
    if (!service) return { success: false, error: 'No active account' };
    const uids = await service.getNonFlaggedUids(folder);
    if (uids.length === 0) return { success: true, count: 0 };
    await service.deleteMultipleEmails(uids, folder);
    return { success: true, count: uids.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ Quick Replies / Templates ============
ipcMain.handle('get-quick-replies', () => store.get('quickReplies', []));

ipcMain.handle('save-quick-reply', (_, reply) => {
  const replies = store.get('quickReplies', []);
  if (reply.id) {
    const idx = replies.findIndex(r => r.id === reply.id);
    if (idx >= 0) replies[idx] = reply;
    else replies.push(reply);
  } else {
    reply.id = Date.now().toString();
    replies.push(reply);
  }
  store.set('quickReplies', replies);
  return replies;
});

ipcMain.handle('remove-quick-reply', (_, id) => {
  const replies = store.get('quickReplies', []).filter(r => r.id !== id);
  store.set('quickReplies', replies);
  return replies;
});

// ============ Google Drive ============
let driveConfig = { clientId: '', clientSecret: '' };
try { driveConfig = require('./src/driveConfig'); } catch (e) { /* driveConfig.js not found */ }

const DRIVE_CLIENT_ID = driveConfig.clientId;
const DRIVE_CLIENT_SECRET = driveConfig.clientSecret;

function createDriveOAuth2Client() {
  if (!googleApis) return null;
  return new googleApis.google.auth.OAuth2(DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, 'http://localhost');
}

function getActiveAccountEmail() {
  const activeIndex = store.get('activeAccount', -1);
  const accounts = store.get('accounts', []);
  if (activeIndex >= 0 && activeIndex < accounts.length) return accounts[activeIndex].email;
  return null;
}

function getDriveTokensForAccount() {
  const email = getActiveAccountEmail();
  if (!email) return {};
  const allTokens = store.get('driveTokensPerAccount', {});
  return allTokens[email] || {};
}

function setDriveTokensForAccount(tokens) {
  const email = getActiveAccountEmail();
  if (!email) return;
  const allTokens = store.get('driveTokensPerAccount', {});
  allTokens[email] = tokens;
  store.set('driveTokensPerAccount', allTokens);
}

function getDriveClient() {
  const oauth2Client = createDriveOAuth2Client();
  if (!oauth2Client) return null;
  const tokens = getDriveTokensForAccount();
  if (!tokens.access_token) return null;
  oauth2Client.setCredentials(tokens);
  oauth2Client.on('tokens', (newTokens) => {
    const current = getDriveTokensForAccount();
    setDriveTokensForAccount({ ...current, ...newTokens });
  });
  return googleApis.google.drive({ version: 'v3', auth: oauth2Client });
}

ipcMain.handle('drive-is-connected', () => {
  const tokens = getDriveTokensForAccount();
  return !!tokens.access_token;
});

ipcMain.handle('drive-auth', async () => {
  const oauth2Client = createDriveOAuth2Client();
  if (!oauth2Client) return { success: false, error: 'Client ID ve Client Secret ayarlanmamış' };

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent'
  });

  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow,
      modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { authWindow.close(); } catch (e) {}
      resolve(result);
    };

    authWindow.loadURL(authUrl);

    const handleUrl = async (url) => {
      if (!url.startsWith('http://localhost')) return;
      try {
        const urlObj = new URL(url);
        const code = urlObj.searchParams.get('code');
        if (code) {
          const { tokens } = await oauth2Client.getToken(code);
          setDriveTokensForAccount(tokens);
          finish({ success: true });
        }
      } catch (err) {
        finish({ success: false, error: err.message });
      }
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith('http://localhost')) {
        event.preventDefault();
        handleUrl(url);
      }
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http://localhost')) {
        event.preventDefault();
        handleUrl(url);
      }
    });

    authWindow.on('closed', () => {
      finish({ success: false, error: 'Yetkilendirme iptal edildi' });
    });
  });
});

ipcMain.handle('drive-disconnect', () => {
  setDriveTokensForAccount({});
  return true;
});

ipcMain.handle('drive-list-files', async (_, folderId) => {
  try {
    const drive = getDriveClient();
    if (!drive) return { success: false, error: 'Drive bağlantısı yok' };

    const query = folderId
      ? `'${folderId}' in parents and trashed = false`
      : `'root' in parents and trashed = false`;

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)',
      orderBy: 'folder,name',
      pageSize: 100
    });

    return { success: true, files: res.data.files || [] };
  } catch (error) {
    if (error.code === 401) {
      setDriveTokensForAccount({});
      return { success: false, error: 'Oturum süresi doldu, tekrar bağlanın' };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('drive-upload-file', async (_, folderId) => {
  try {
    const drive = getDriveClient();
    if (!drive) return { success: false, error: 'Drive bağlantısı yok' };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Drive\'a Dosya Yükle',
      properties: ['openFile', 'multiSelections']
    });

    if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'İptal edildi' };

    const uploaded = [];
    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath);
      const fileMetadata = { name: fileName };
      if (folderId) fileMetadata.parents = [folderId];

      const media = { body: fs.createReadStream(filePath) };
      const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name'
      });
      uploaded.push(res.data);
    }

    return { success: true, files: uploaded };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('drive-download-file', async (_, fileId, fileName) => {
  try {
    const drive = getDriveClient();
    if (!drive) return { success: false, error: 'Drive bağlantısı yok' };

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Dosyayı İndir',
      defaultPath: fileName || 'download'
    });

    if (result.canceled || !result.filePath) return { success: false, error: 'İptal edildi' };

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    const dest = fs.createWriteStream(result.filePath);

    await new Promise((resolve, reject) => {
      res.data.pipe(dest);
      dest.on('finish', resolve);
      dest.on('error', reject);
    });

    shell.showItemInFolder(result.filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============ GitHub Integration ============
const https = require('https');

function getGithubTokenForAccount() {
  const email = getActiveAccountEmail();
  if (!email) return '';
  const allTokens = store.get('githubTokensPerAccount', {});
  return allTokens[email] || '';
}

function setGithubTokenForAccount(token) {
  const email = getActiveAccountEmail();
  if (!email) return;
  const allTokens = store.get('githubTokensPerAccount', {});
  allTokens[email] = token;
  store.set('githubTokensPerAccount', allTokens);
}

function githubApiRequest(endpoint, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, 'https://api.github.com');
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'User-Agent': 'MailLoader',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`
      }
    };
    if (bodyStr) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 204) { resolve(null); return; }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        } else if (res.statusCode === 401) {
          reject(new Error('Token geçersiz veya süresi dolmuş'));
        } else {
          try { const err = JSON.parse(data); reject(new Error(err.message || `HTTP ${res.statusCode}`)); } catch (e) { reject(new Error(`HTTP ${res.statusCode}`)); }
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function githubApiRequestRaw(endpoint, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, 'https://api.github.com');
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'MailLoader',
        'Accept': 'application/vnd.github.v3.raw',
        'Authorization': `Bearer ${token}`
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// 1. Connection
ipcMain.handle('github-is-connected', () => {
  return !!getGithubTokenForAccount();
});

ipcMain.handle('github-connect', (_, token) => {
  setGithubTokenForAccount(token);
  return { success: true };
});

ipcMain.handle('github-disconnect', () => {
  setGithubTokenForAccount('');
  return true;
});

// 2. Get authenticated user
ipcMain.handle('github-get-user', async () => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const user = await githubApiRequest('/user', token);
    return { success: true, user: { login: user.login, name: user.name, avatar_url: user.avatar_url, bio: user.bio, public_repos: user.public_repos, followers: user.followers, following: user.following, html_url: user.html_url } };
  } catch (error) { return { success: false, error: error.message }; }
});

// 3. List repos (with optional search)
ipcMain.handle('github-list-repos', async (_, search) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    let repos;
    if (search) {
      const result = await githubApiRequest(`/search/repositories?q=${encodeURIComponent(search)}+user:${encodeURIComponent((await githubApiRequest('/user', token)).login)}&per_page=50`, token);
      repos = result.items || [];
    } else {
      repos = await githubApiRequest('/user/repos?sort=updated&per_page=100', token);
    }
    return { success: true, repos: repos.map(r => ({
      id: r.id, name: r.name, full_name: r.full_name, description: r.description,
      private: r.private, html_url: r.html_url, language: r.language,
      stargazers_count: r.stargazers_count, forks_count: r.forks_count,
      open_issues_count: r.open_issues_count, updated_at: r.updated_at,
      default_branch: r.default_branch, fork: r.fork, archived: r.archived,
      owner: { login: r.owner?.login, avatar_url: r.owner?.avatar_url }
    })) };
  } catch (error) {
    if (error.message.includes('geçersiz')) setGithubTokenForAccount('');
    return { success: false, error: error.message };
  }
});

// 4. Create repo
ipcMain.handle('github-create-repo', async (_, name, description, isPrivate) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const repo = await githubApiRequest('/user/repos', token, 'POST', {
      name, description, private: isPrivate, auto_init: true
    });
    return { success: true, repo: { name: repo.name, full_name: repo.full_name, html_url: repo.html_url } };
  } catch (error) { return { success: false, error: error.message }; }
});

// 5. Delete repo
ipcMain.handle('github-delete-repo', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, 'DELETE');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 6. Star repo
ipcMain.handle('github-star-repo', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, 'PUT');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 7. Unstar repo
ipcMain.handle('github-unstar-repo', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token, 'DELETE');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 8. Check if starred
ipcMain.handle('github-is-starred', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/user/starred/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
    return { starred: true };
  } catch (error) {
    return { starred: false };
  }
});

// 9. Fork repo
ipcMain.handle('github-fork-repo', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    const forked = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/forks`, token, 'POST');
    return { success: true, repo: { full_name: forked.full_name, html_url: forked.html_url } };
  } catch (error) { return { success: false, error: error.message }; }
});

// 10. List branches
ipcMain.handle('github-list-branches', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    const branches = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`, token);
    return { success: true, branches: branches.map(b => ({ name: b.name, sha: b.commit.sha, protected: b.protected })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 11. Create branch
ipcMain.handle('github-create-branch', async (_, owner, repo, branchName, fromSha) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, token, 'POST', {
      ref: `refs/heads/${branchName}`, sha: fromSha
    });
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 12. Delete branch
ipcMain.handle('github-delete-branch', async (_, owner, repo, branchName) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branchName)}`, token, 'DELETE');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 13. List commits
ipcMain.handle('github-list-commits', async (_, owner, repo, branch) => {
  try {
    const token = getGithubTokenForAccount();
    const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';
    const commits = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=30${branchParam}`, token);
    return { success: true, commits: commits.map(c => ({
      sha: c.sha, message: c.commit.message, date: c.commit.author.date,
      author: { login: c.author?.login || c.commit.author.name, avatar_url: c.author?.avatar_url }
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 14. List issues
ipcMain.handle('github-list-issues', async (_, owner, repo, state) => {
  try {
    const token = getGithubTokenForAccount();
    const stateParam = state || 'open';
    const issues = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${stateParam}&per_page=50`, token);
    return { success: true, issues: issues.filter(i => !i.pull_request).map(i => ({
      number: i.number, title: i.title, state: i.state, body: i.body,
      labels: i.labels.map(l => ({ name: l.name, color: l.color })),
      user: { login: i.user.login, avatar_url: i.user.avatar_url },
      created_at: i.created_at, comments: i.comments
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 15. Create issue
ipcMain.handle('github-create-issue', async (_, owner, repo, title, body, labels) => {
  try {
    const token = getGithubTokenForAccount();
    const payload = { title, body };
    if (labels && labels.length > 0) payload.labels = labels;
    const issue = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, token, 'POST', payload);
    return { success: true, issue: { number: issue.number, title: issue.title } };
  } catch (error) { return { success: false, error: error.message }; }
});

// 16. Update issue (close/reopen/edit)
ipcMain.handle('github-update-issue', async (_, owner, repo, issueNumber, updates) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, token, 'PATCH', updates);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 17. Add comment to issue/PR
ipcMain.handle('github-add-comment', async (_, owner, repo, issueNumber, body) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, token, 'POST', { body });
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 18. List issue comments
ipcMain.handle('github-list-comments', async (_, owner, repo, issueNumber) => {
  try {
    const token = getGithubTokenForAccount();
    const comments = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=50`, token);
    return { success: true, comments: comments.map(c => ({
      id: c.id, body: c.body, user: { login: c.user.login, avatar_url: c.user.avatar_url }, created_at: c.created_at
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 19. List pull requests
ipcMain.handle('github-list-pulls', async (_, owner, repo, state) => {
  try {
    const token = getGithubTokenForAccount();
    const stateParam = state || 'open';
    const pulls = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=${stateParam}&per_page=50`, token);
    return { success: true, pulls: pulls.map(p => ({
      number: p.number, title: p.title, state: p.state, body: p.body,
      head: { ref: p.head.ref }, base: { ref: p.base.ref },
      user: { login: p.user.login, avatar_url: p.user.avatar_url },
      created_at: p.created_at, merged_at: p.merged_at, draft: p.draft,
      labels: p.labels.map(l => ({ name: l.name, color: l.color }))
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 20. List contents with branch ref
ipcMain.handle('github-list-contents', async (_, owner, repo, pathStr, ref) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const safePath = (pathStr || '').replace(/\.\.\//g, '');
    let endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`;
    if (ref) endpoint += `?ref=${encodeURIComponent(ref)}`;
    const contents = await githubApiRequest(endpoint, token);
    const items = Array.isArray(contents) ? contents : [contents];
    return { success: true, files: items.map(f => ({
      name: f.name, path: f.path, type: f.type, size: f.size,
      download_url: f.download_url, sha: f.sha
    })) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 21. Get file content (for preview)
ipcMain.handle('github-get-file-content', async (_, owner, repo, path, ref) => {
  try {
    const token = getGithubTokenForAccount();
    const safePath = (path || '').replace(/\.\.\//g, '');
    let endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`;
    if (ref) endpoint += `?ref=${encodeURIComponent(ref)}`;
    const content = await githubApiRequestRaw(endpoint, token);
    return { success: true, content };
  } catch (error) { return { success: false, error: error.message }; }
});

// 22. Create file
ipcMain.handle('github-create-file', async (_, owner, repo, path, content, message, branch) => {
  try {
    const token = getGithubTokenForAccount();
    const safePath = (path || '').replace(/\.\.\//g, '');
    const payload = { message: message || `Create ${safePath}`, content: Buffer.from(content).toString('base64') };
    if (branch) payload.branch = branch;
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`, token, 'PUT', payload);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 23. Update file
ipcMain.handle('github-update-file', async (_, owner, repo, path, content, sha, message, branch) => {
  try {
    const token = getGithubTokenForAccount();
    const safePath = (path || '').replace(/\.\.\//g, '');
    const payload = { message: message || `Update ${safePath}`, content: Buffer.from(content).toString('base64'), sha };
    if (branch) payload.branch = branch;
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`, token, 'PUT', payload);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 24. Delete file
ipcMain.handle('github-delete-file', async (_, owner, repo, path, sha, message, branch) => {
  try {
    const token = getGithubTokenForAccount();
    const safePath = (path || '').replace(/\.\.\//g, '');
    const payload = { message: message || `Delete ${safePath}`, sha };
    if (branch) payload.branch = branch;
    await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safePath}`, token, 'DELETE', payload);
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 25. Download file
ipcMain.handle('github-download-file', async (_, downloadUrl, fileName) => {
  try {
    if (!downloadUrl) return { success: false, error: 'İndirme URL\'si yok' };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Dosyayı İndir',
      defaultPath: fileName || 'download'
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'İptal edildi' };

    const token = getGithubTokenForAccount();
    await new Promise((resolve, reject) => {
      const makeReq = (url) => {
        const parsed = new URL(url);
        const options = {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: {
            'User-Agent': 'MailLoader',
            'Authorization': `Bearer ${token}`
          }
        };
        const req = https.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            makeReq(res.headers.location);
            return;
          }
          const dest = fs.createWriteStream(result.filePath);
          res.pipe(dest);
          dest.on('finish', resolve);
          dest.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      };
      makeReq(downloadUrl);
    });

    shell.showItemInFolder(result.filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 26. Download repo as ZIP
ipcMain.handle('github-download-zip', async (_, owner, repo, branch) => {
  try {
    const token = getGithubTokenForAccount();
    const ref = branch || 'main';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Repoyu İndir (ZIP)',
      defaultPath: `${repo}-${ref}.zip`
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'İptal edildi' };

    await new Promise((resolve, reject) => {
      const makeReq = (url) => {
        const parsed = new URL(url);
        const options = {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          headers: {
            'User-Agent': 'MailLoader',
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        };
        const req = https.request(options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            makeReq(res.headers.location);
            return;
          }
          const dest = fs.createWriteStream(result.filePath);
          res.pipe(dest);
          dest.on('finish', resolve);
          dest.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      };
      makeReq(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(ref)}`);
    });

    shell.showItemInFolder(result.filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 27. List starred repos
ipcMain.handle('github-list-starred', async () => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const repos = await githubApiRequest('/user/starred?per_page=100&sort=updated', token);
    return { success: true, repos: repos.map(r => ({
      id: r.id, name: r.name, full_name: r.full_name, description: r.description,
      private: r.private, html_url: r.html_url, language: r.language,
      stargazers_count: r.stargazers_count, forks_count: r.forks_count,
      owner: { login: r.owner?.login, avatar_url: r.owner?.avatar_url }
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 28. Search all repos (global)
ipcMain.handle('github-search-repos', async (_, query) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const result = await githubApiRequest(`/search/repositories?q=${encodeURIComponent(query)}&per_page=30&sort=stars`, token);
    return { success: true, repos: (result.items || []).map(r => ({
      id: r.id, name: r.name, full_name: r.full_name, description: r.description,
      private: r.private, html_url: r.html_url, language: r.language,
      stargazers_count: r.stargazers_count, forks_count: r.forks_count,
      owner: { login: r.owner?.login, avatar_url: r.owner?.avatar_url }
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 29. List gists
ipcMain.handle('github-list-gists', async () => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const gists = await githubApiRequest('/gists?per_page=30', token);
    return { success: true, gists: gists.map(g => ({
      id: g.id, description: g.description || '(Açıklama yok)',
      files: Object.keys(g.files), public: g.public,
      created_at: g.created_at, html_url: g.html_url
    })) };
  } catch (error) { return { success: false, error: error.message }; }
});

// 30. Create gist
ipcMain.handle('github-create-gist', async (_, description, filename, content, isPublic) => {
  try {
    const token = getGithubTokenForAccount();
    if (!token) return { success: false, error: 'GitHub bağlantısı yok' };
    const gist = await githubApiRequest('/gists', token, 'POST', {
      description, public: isPublic,
      files: { [filename]: { content } }
    });
    return { success: true, gist: { id: gist.id, html_url: gist.html_url } };
  } catch (error) { return { success: false, error: error.message }; }
});

// 31. Delete gist
ipcMain.handle('github-delete-gist', async (_, gistId) => {
  try {
    const token = getGithubTokenForAccount();
    await githubApiRequest(`/gists/${gistId}`, token, 'DELETE');
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});

// 32. Get repo README
ipcMain.handle('github-get-readme', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    const content = await githubApiRequestRaw(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, token);
    return { success: true, content };
  } catch (error) { return { success: false, error: error.message }; }
});

// 33. Get repo languages
ipcMain.handle('github-get-languages', async (_, owner, repo) => {
  try {
    const token = getGithubTokenForAccount();
    const langs = await githubApiRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`, token);
    return { success: true, languages: langs };
  } catch (error) { return { success: false, error: error.message }; }
});

// ============ TCMB EVDS Integration ============
function getEvdsKeyForAccount() {
  const email = getActiveAccountEmail();
  if (!email) return '';
  const allKeys = store.get('evdsKeysPerAccount', {});
  return allKeys[email] || '';
}

function setEvdsKeyForAccount(key) {
  const email = getActiveAccountEmail();
  if (!email) return;
  const allKeys = store.get('evdsKeysPerAccount', {});
  allKeys[email] = key;
  store.set('evdsKeysPerAccount', allKeys);
}

function evdsApiRequest(endpoint, apiKey, params = {}) {
  return new Promise((resolve, reject) => {
    params.type = 'json';
    const paramStr = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const fullPath = `/igmevdsms-dis/${endpoint}${paramStr}`;
    const options = {
      hostname: 'evds3.tcmb.gov.tr',
      path: fullPath,
      method: 'GET',
      headers: {
        'User-Agent': 'MailLoader',
        'Accept': 'application/json',
        'key': apiKey
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('API anahtarı geçersiz veya süresi dolmuş'));
        } else {
          reject(new Error(`EVDS API Hatası: HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// EVDS 1. Connection
ipcMain.handle('evds-is-connected', () => {
  return !!getEvdsKeyForAccount();
});

ipcMain.handle('evds-connect', async (_, apiKey) => {
  try {
    const result = await evdsApiRequest('categories/', apiKey);
    if (!result || (Array.isArray(result) && result.length === 0)) {
      return { success: false, error: 'API anahtarı geçersiz' };
    }
    setEvdsKeyForAccount(apiKey);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('evds-disconnect', () => {
  setEvdsKeyForAccount('');
  return true;
});

// EVDS 2. Get categories
ipcMain.handle('evds-get-categories', async () => {
  try {
    const apiKey = getEvdsKeyForAccount();
    if (!apiKey) return { success: false, error: 'EVDS bağlantısı yok' };
    const raw = await evdsApiRequest('categories/', apiKey);
    if (!raw || !Array.isArray(raw)) return { success: false, error: 'Veri alınamadı' };
    const categories = raw.map(c => ({
      id: c.CATEGORY_ID,
      titleTr: c.TOPIC_TITLE_TR,
      titleEng: c.TOPIC_TITLE_ENG
    }));
    return { success: true, categories };
  } catch (error) {
    if (error.message.includes('geçersiz')) setEvdsKeyForAccount('');
    return { success: false, error: error.message };
  }
});

// EVDS 3. Get data groups for a category
ipcMain.handle('evds-get-datagroups', async (_, categoryId) => {
  try {
    const apiKey = getEvdsKeyForAccount();
    if (!apiKey) return { success: false, error: 'EVDS bağlantısı yok' };
    const params = { mode: 0 };
    if (categoryId) params.code = categoryId;
    const raw = await evdsApiRequest('datagroups/', apiKey, params);
    if (!raw || !Array.isArray(raw)) return { success: false, error: 'Veri alınamadı' };
    const groups = raw.filter(g => !categoryId || String(g.CATEGORY_ID) === String(categoryId)).map(g => ({
      categoryId: g.CATEGORY_ID,
      code: g.DATAGROUP_CODE,
      nameTr: g.DATAGROUP_NAME,
      nameEng: g.DATAGROUP_NAME_ENG,
      frequency: g.FREQUENCY_STR,
      startDate: g.START_DATE,
      endDate: g.END_DATE
    }));
    return { success: true, groups };
  } catch (error) { return { success: false, error: error.message }; }
});

// EVDS 4. Get series list for a data group
ipcMain.handle('evds-get-series-list', async (_, datagroupCode) => {
  try {
    const apiKey = getEvdsKeyForAccount();
    if (!apiKey) return { success: false, error: 'EVDS bağlantısı yok' };
    const raw = await evdsApiRequest('serieList/', apiKey, { code: datagroupCode });
    if (!raw || !Array.isArray(raw)) return { success: false, error: 'Veri alınamadı' };
    const series = raw.map(s => ({
      code: s.SERIE_CODE,
      nameTr: s.SERIE_NAME,
      nameEng: s.SERIE_NAME_ENG,
      datagroupCode: s.DATAGROUP_CODE,
      frequency: s.FREQUENCY_STR,
      startDate: s.START_DATE,
      endDate: s.END_DATE,
      aggregation: s.DEFAULT_AGG_METHOD_STR
    }));
    return { success: true, series };
  } catch (error) { return { success: false, error: error.message }; }
});

// EVDS 5. Get series data
ipcMain.handle('evds-get-series-data', async (_, seriesCode, startDate, endDate, frequency) => {
  try {
    const apiKey = getEvdsKeyForAccount();
    if (!apiKey) return { success: false, error: 'EVDS bağlantısı yok' };
    const params = {
      series: seriesCode,
      startDate: startDate || '01-01-2020',
      endDate: endDate || new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '-')
    };
    if (frequency) params.frequency = frequency;
    const raw = await evdsApiRequest('', apiKey, params);
    const items = raw?.items || raw || [];
    return { success: true, data: Array.isArray(items) ? items : [], totalCount: raw?.totalCount || 0 };
  } catch (error) { return { success: false, error: error.message }; }
});

// ============ Twelve Data Integration ============
const tdCache = {};

function getTwelveDataKeyForAccount() {
  const email = getActiveAccountEmail();
  if (!email) return '';
  const allKeys = store.get('twelveDataKeysPerAccount', {});
  return allKeys[email] || '';
}

function setTwelveDataKeyForAccount(key) {
  const email = getActiveAccountEmail();
  if (!email) return;
  const allKeys = store.get('twelveDataKeysPerAccount', {});
  allKeys[email] = key;
  store.set('twelveDataKeysPerAccount', allKeys);
}

function tdCacheGet(key, ttlMs) {
  const entry = tdCache[key];
  if (entry && (Date.now() - entry.ts < ttlMs)) return entry.data;
  return null;
}

function tdCacheSet(key, data) {
  tdCache[key] = { data, ts: Date.now() };
}

function twelveDataApiRequest(endpoint, apiKey, params = {}) {
  return new Promise((resolve, reject) => {
    params.apikey = apiKey;
    const paramStr = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const fullPath = `/${endpoint}?${paramStr}`;
    const options = {
      hostname: 'api.twelvedata.com',
      path: fullPath,
      method: 'GET',
      headers: {
        'User-Agent': 'MailLoader',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('API kredi limiti aşıldı. Lütfen bir dakika bekleyin.'));
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('API anahtarı geçersiz'));
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            if (json.code === 400 || json.code === 401 || json.code === 403 || json.status === 'error') {
              reject(new Error(json.message || 'API Hatası'));
            } else {
              resolve(json);
            }
          } catch (e) { resolve(data); }
        } else {
          reject(new Error(`Twelve Data API Hatası: HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// TD 1. Connection
ipcMain.handle('td-is-connected', () => {
  return !!getTwelveDataKeyForAccount();
});

ipcMain.handle('td-connect', async (_, apiKey) => {
  try {
    const result = await twelveDataApiRequest('api_usage', apiKey);
    if (result) {
      setTwelveDataKeyForAccount(apiKey);
      return { success: true };
    }
    return { success: false, error: 'API anahtarı geçersiz' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('td-disconnect', () => {
  setTwelveDataKeyForAccount('');
  return true;
});

// TD 2. Search symbols
ipcMain.handle('td-search-symbol', async (_, query) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = `td_search_${query}`;
    const cached = tdCacheGet(cacheKey, 5 * 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('symbol_search', apiKey, { symbol: query, outputsize: 30 });
    const response = { success: true, symbols: (result.data || []).map(s => ({
      symbol: s.symbol, name: s.instrument_name, type: s.instrument_type,
      country: s.country, exchange: s.exchange, currency: s.currency
    })) };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 3. Get quote (comprehensive single symbol info)
ipcMain.handle('td-get-quote', async (_, symbol) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = `td_quote_${symbol}`;
    const cached = tdCacheGet(cacheKey, 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('quote', apiKey, { symbol });
    const response = { success: true, quote: result };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 4. Get price (cheapest endpoint, batch capable)
ipcMain.handle('td-get-price', async (_, symbols) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const cacheKey = `td_price_${symbolStr}`;
    const cached = tdCacheGet(cacheKey, 30 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('price', apiKey, { symbol: symbolStr });
    const response = { success: true, prices: result };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 5. Get time series (OHLCV data)
ipcMain.handle('td-get-time-series', async (_, symbol, interval, outputsize, startDate, endDate) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const params = { symbol, interval: interval || '1day', outputsize: outputsize || 30 };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const cacheKey = `td_ts_${symbol}_${params.interval}_${params.outputsize}_${startDate || ''}_${endDate || ''}`;
    const cached = tdCacheGet(cacheKey, 2 * 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('time_series', apiKey, params);
    const response = { success: true, meta: result.meta || {}, values: result.values || [] };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 6. Get exchange rate
ipcMain.handle('td-get-exchange-rate', async (_, symbol) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = `td_exrate_${symbol}`;
    const cached = tdCacheGet(cacheKey, 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('exchange_rate', apiKey, { symbol });
    const response = { success: true, rate: result };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 7. List stocks (reference data - cache 24h)
ipcMain.handle('td-get-stocks', async (_, exchange) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = `td_stocks_${exchange || 'all'}`;
    const cached = tdCacheGet(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) return cached;
    const params = {};
    if (exchange) params.exchange = exchange;
    const result = await twelveDataApiRequest('stocks', apiKey, params);
    const stocks = (result.data || []).slice(0, 200).map(s => ({
      symbol: s.symbol, name: s.name, currency: s.currency,
      exchange: s.exchange, country: s.country, type: s.type
    }));
    const response = { success: true, stocks };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 8. List forex pairs (reference data - cache 24h)
ipcMain.handle('td-get-forex-pairs', async () => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = 'td_forex';
    const cached = tdCacheGet(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('forex_pairs', apiKey);
    const pairs = (result.data || []).slice(0, 200).map(p => ({
      symbol: p.symbol, group: p.currency_group, base: p.currency_base, quote: p.currency_quote
    }));
    const response = { success: true, pairs };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 9. List crypto (reference data - cache 24h)
ipcMain.handle('td-get-crypto', async () => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const cacheKey = 'td_crypto';
    const cached = tdCacheGet(cacheKey, 24 * 60 * 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest('cryptocurrencies', apiKey);
    const cryptos = (result.data || []).slice(0, 200).map(c => ({
      symbol: c.symbol, exchange: c.available_exchanges?.[0] || '',
      base: c.currency_base, quote: c.currency_quote
    }));
    const response = { success: true, cryptos };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 10. Get technical indicator
ipcMain.handle('td-get-indicator', async (_, indicator, symbol, interval, params) => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const reqParams = { symbol, interval: interval || '1day', outputsize: 30, ...(params || {}) };
    const cacheKey = `td_ind_${indicator}_${symbol}_${reqParams.interval}_${JSON.stringify(params || {})}`;
    const cached = tdCacheGet(cacheKey, 2 * 60 * 1000);
    if (cached) return cached;
    const result = await twelveDataApiRequest(indicator, apiKey, reqParams);
    const response = { success: true, meta: result.meta || {}, values: result.values || [] };
    tdCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// TD 11. API usage info
ipcMain.handle('td-get-usage', async () => {
  try {
    const apiKey = getTwelveDataKeyForAccount();
    if (!apiKey) return { success: false, error: 'Twelve Data bağlantısı yok' };
    const result = await twelveDataApiRequest('api_usage', apiKey);
    return { success: true, usage: result };
  } catch (error) { return { success: false, error: error.message }; }
});

// ============ Yahoo Finance Integration (API-keyiz, yfinance tarzı) ============
let yfSession = { cookies: '', crumb: null, crumbTs: 0 };
const yfCache = {};

function yfCacheGet(key, ttlMs) {
  const entry = yfCache[key];
  if (entry && (Date.now() - entry.ts < ttlMs)) return entry.data;
  return null;
}

function yfCacheSet(key, data) {
  yfCache[key] = { data, ts: Date.now() };
}

const YF_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function yfHttpsGet(url, cookies) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': YF_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    };
    if (cookies) options.headers['Cookie'] = cookies;
    const req = https.request(options, (res) => {
      // Capture Set-Cookie headers
      const setCookies = res.headers['set-cookie'] || [];
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data, setCookies, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

async function yfGetCookieAndCrumb() {
  // Reuse if fresh (5 min)
  if (yfSession.crumb && (Date.now() - yfSession.crumbTs < 5 * 60 * 1000)) {
    return { cookies: yfSession.cookies, crumb: yfSession.crumb };
  }

  // Step 1: Get cookies from fc.yahoo.com
  const cookieResp = await yfHttpsGet('https://fc.yahoo.com', '');
  const cookieParts = [];
  for (const sc of cookieResp.setCookies) {
    const name = sc.split(';')[0];
    if (name) cookieParts.push(name);
  }
  const cookies = cookieParts.join('; ');

  // Step 2: Get crumb using cookies
  const crumbResp = await yfHttpsGet('https://query1.finance.yahoo.com/v1/test/getcrumb', cookies);
  if (crumbResp.statusCode === 429) {
    throw new Error('Yahoo Finance rate limit aşıldı. Biraz bekleyin.');
  }
  const crumb = crumbResp.body;
  if (!crumb || crumb.includes('<html>')) {
    throw new Error('Yahoo Finance crumb alınamadı');
  }

  yfSession = { cookies, crumb, crumbTs: Date.now() };
  return { cookies, crumb };
}

async function yahooFinanceRequest(endpoint, params = {}) {
  const { cookies, crumb } = await yfGetCookieAndCrumb();
  params.crumb = crumb;
  const paramStr = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const url = `https://query2.finance.yahoo.com${endpoint}${paramStr ? '?' + paramStr : ''}`;
  const resp = await yfHttpsGet(url, cookies);

  if (resp.statusCode === 429) {
    throw new Error('Yahoo Finance rate limit aşıldı');
  }
  if (resp.statusCode === 401 || resp.statusCode === 403) {
    // Reset session and retry once
    yfSession = { cookies: '', crumb: null, crumbTs: 0 };
    const session2 = await yfGetCookieAndCrumb();
    params.crumb = session2.crumb;
    const paramStr2 = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const url2 = `https://query2.finance.yahoo.com${endpoint}${paramStr2 ? '?' + paramStr2 : ''}`;
    const resp2 = await yfHttpsGet(url2, session2.cookies);
    if (resp2.statusCode >= 400) throw new Error(`Yahoo Finance Hatası: HTTP ${resp2.statusCode}`);
    try { return JSON.parse(resp2.body); } catch (e) { return resp2.body; }
  }
  if (resp.statusCode >= 400) {
    throw new Error(`Yahoo Finance Hatası: HTTP ${resp.statusCode}`);
  }
  try { return JSON.parse(resp.body); } catch (e) { return resp.body; }
}

async function yahooFinanceChartRequest(symbol, params = {}) {
  const { cookies, crumb } = await yfGetCookieAndCrumb();
  params.crumb = crumb;
  const paramStr = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${paramStr}`;
  const resp = await yfHttpsGet(url, cookies);
  if (resp.statusCode === 429) throw new Error('Yahoo Finance rate limit aşıldı');
  if (resp.statusCode >= 400) throw new Error(`Yahoo Finance Hatası: HTTP ${resp.statusCode}`);
  try { return JSON.parse(resp.body); } catch (e) { return resp.body; }
}

// YF 1. Connection test
ipcMain.handle('yf-test-connection', async () => {
  try {
    await yfGetCookieAndCrumb();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// YF 2. Search symbols
ipcMain.handle('yf-search', async (_, query) => {
  try {
    const cacheKey = `yf_search_${query}`;
    const cached = yfCacheGet(cacheKey, 10 * 60 * 1000);
    if (cached) return cached;
    const result = await yahooFinanceRequest('/v1/finance/search', {
      q: query, quotesCount: 15, newsCount: 0, listsCount: 0, enableFuzzyQuery: false
    });
    const quotes = (result.quotes || []).map(q => ({
      symbol: q.symbol, name: q.shortname || q.longname || q.symbol,
      type: q.quoteType || q.typeDisp || '', exchange: q.exchange || q.exchDisp || '',
      sector: q.sector || '', industry: q.industry || ''
    }));
    const response = { success: true, quotes };
    yfCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// YF 3. Get quotes (batch, up to 50 symbols)
ipcMain.handle('yf-get-quote', async (_, symbols) => {
  try {
    const symbolStr = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const cacheKey = `yf_quote_${symbolStr}`;
    const cached = yfCacheGet(cacheKey, 30 * 1000);
    if (cached) return cached;
    const result = await yahooFinanceRequest('/v7/finance/quote', { symbols: symbolStr });
    const quotes = (result.quoteResponse?.result || []).map(q => ({
      symbol: q.symbol, name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice, change: q.regularMarketChange,
      changePercent: q.regularMarketChangePercent,
      open: q.regularMarketOpen, high: q.regularMarketDayHigh,
      low: q.regularMarketDayLow, prevClose: q.regularMarketPreviousClose,
      volume: q.regularMarketVolume, avgVolume: q.averageDailyVolume3Month,
      marketCap: q.marketCap, fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow, currency: q.currency,
      exchange: q.fullExchangeName || q.exchange, type: q.quoteType,
      bid: q.bid, ask: q.ask, trailingPE: q.trailingPE,
      epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
      dividendYield: q.dividendYield, marketState: q.marketState
    }));
    const response = { success: true, quotes };
    yfCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// YF 4. Get chart (historical OHLCV data)
ipcMain.handle('yf-get-chart', async (_, symbol, interval, range) => {
  try {
    const cacheKey = `yf_chart_${symbol}_${interval}_${range}`;
    const cached = yfCacheGet(cacheKey, 60 * 1000);
    if (cached) return cached;
    const result = await yahooFinanceChartRequest(symbol, {
      interval: interval || '1d', range: range || '1mo', includePrePost: false
    });
    const chart = result.chart?.result?.[0];
    if (!chart) return { success: false, error: 'Veri bulunamadı' };
    const timestamps = chart.timestamp || [];
    const quote = chart.indicators?.quote?.[0] || {};
    const adjClose = chart.indicators?.adjclose?.[0]?.adjclose || [];
    const values = timestamps.map((ts, i) => ({
      datetime: new Date(ts * 1000).toISOString().split('T')[0],
      open: quote.open?.[i] ?? null, high: quote.high?.[i] ?? null,
      low: quote.low?.[i] ?? null, close: quote.close?.[i] ?? null,
      adjClose: adjClose[i] ?? null, volume: quote.volume?.[i] ?? null
    })).filter(v => v.close !== null);
    const meta = chart.meta || {};
    const response = {
      success: true,
      meta: { symbol: meta.symbol, currency: meta.currency, exchange: meta.exchangeName, type: meta.instrumentType },
      values
    };
    yfCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// YF 5. Get quote summary (detailed info)
ipcMain.handle('yf-get-summary', async (_, symbol) => {
  try {
    const cacheKey = `yf_summary_${symbol}`;
    const cached = yfCacheGet(cacheKey, 2 * 60 * 1000);
    if (cached) return cached;
    const result = await yahooFinanceRequest(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
      modules: 'price,summaryDetail,defaultKeyStatistics'
    });
    const summary = result.quoteSummary?.result?.[0] || {};
    const response = { success: true, summary };
    yfCacheSet(cacheKey, response);
    return response;
  } catch (error) { return { success: false, error: error.message }; }
});

// ============ Binance API (No Key Required) ============

const BINANCE_API = 'https://api.binance.com';

function binanceGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(BINANCE_API + endpoint);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

const bnCache = {};
function bnCacheGet(key, ttl) { const e = bnCache[key]; return e && Date.now() - e.ts < ttl ? e.data : null; }
function bnCacheSet(key, data) { bnCache[key] = { data, ts: Date.now() }; }

ipcMain.handle('bn-test-connection', async () => {
  try {
    await binanceGet('/api/v3/ping');
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('bn-get-prices', async (_, symbols) => {
  try {
    const key = `prices:${Array.isArray(symbols) ? symbols.join(',') : 'all'}`;
    const cached = bnCacheGet(key, 15000);
    if (cached) return cached;
    let data;
    if (Array.isArray(symbols) && symbols.length > 0) {
      data = await binanceGet(`/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    } else {
      data = await binanceGet('/api/v3/ticker/price');
    }
    const result = { success: true, prices: data };
    bnCacheSet(key, result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('bn-get-ticker24', async (_, symbol) => {
  try {
    const key = `ticker24:${symbol}`;
    const cached = bnCacheGet(key, 30000);
    if (cached) return cached;
    const data = await binanceGet(`/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
    const result = { success: true, ticker: data };
    bnCacheSet(key, result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('bn-get-klines', async (_, symbol, interval, limit) => {
  try {
    const key = `klines:${symbol}:${interval}:${limit}`;
    const cached = bnCacheGet(key, 60000);
    if (cached) return cached;
    const lim = limit || 100;
    const raw = await binanceGet(`/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${lim}`);
    const klines = raw.map(k => ({
      openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4],
      volume: k[5], closeTime: k[6], quoteVolume: k[7], trades: k[8]
    }));
    const result = { success: true, klines };
    bnCacheSet(key, result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('bn-search', async (_, query) => {
  try {
    const key = `bnSearch:${query}`;
    const cached = bnCacheGet(key, 600000);
    if (cached) return cached;
    const info = await binanceGet('/api/v3/exchangeInfo');
    const q = query.toUpperCase();
    const matches = info.symbols.filter(s => s.status === 'TRADING' &&
      (s.symbol.includes(q) || s.baseAsset.includes(q) || s.quoteAsset.includes(q))
    ).slice(0, 40).map(s => ({
      symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset
    }));
    const result = { success: true, symbols: matches };
    bnCacheSet(key, result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('bn-get-top-pairs', async () => {
  try {
    const cached = bnCacheGet('topPairs', 60000);
    if (cached) return cached;
    const data = await binanceGet('/api/v3/ticker/24hr');
    const usdt = data.filter(t => t.symbol.endsWith('USDT'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 30)
      .map(t => ({
        symbol: t.symbol, price: t.lastPrice, change: t.priceChangePercent,
        high: t.highPrice, low: t.lowPrice, volume: t.quoteVolume
      }));
    const result = { success: true, pairs: usdt };
    bnCacheSet('topPairs', result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

// ============ OpenWeather + Ticker ============

const OW_KEY = '47a3d367442061f94c75fcadd200fb5b';

function owGet(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL('https://api.openweathermap.org' + endpoint);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

ipcMain.handle('get-weather', async (_, lat, lon) => {
  try {
    const data = await owGet(`/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=tr&appid=${OW_KEY}`);
    return {
      success: true,
      temp: Math.round(data.main.temp),
      desc: data.weather[0].description,
      icon: data.weather[0].icon,
      city: data.name,
      humidity: data.main.humidity,
      wind: data.wind.speed,
      feelsLike: Math.round(data.main.feels_like)
    };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-weather-by-city', async (_, city) => {
  try {
    const data = await owGet(`/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=tr&appid=${OW_KEY}`);
    return {
      success: true,
      temp: Math.round(data.main.temp),
      desc: data.weather[0].description,
      icon: data.weather[0].icon,
      city: data.name,
      humidity: data.main.humidity,
      wind: data.wind.speed,
      feelsLike: Math.round(data.main.feels_like)
    };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-ticker-rates', async () => {
  try {
    const cached = bnCacheGet('tickerRates', 30000);
    if (cached) return cached;
    const pairs = ['USDTTRY', 'BTCUSDT', 'ETHUSDT', 'EURUSDT'];
    const data = await binanceGet(`/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(pairs))}`);
    const map = {};
    data.forEach(d => { map[d.symbol] = parseFloat(d.price); });
    const result = { success: true, rates: map };
    bnCacheSet('tickerRates', result);
    return result;
  } catch (e) { return { success: false, error: e.message }; }
});

// ============ API Keys Manager ============
ipcMain.handle('get-all-api-keys', () => {
  const email = getActiveAccountEmail();
  const ghTokens = store.get('githubTokensPerAccount', {});
  const evdsKeys = store.get('evdsKeysPerAccount', {});
  const tdKeys = store.get('twelveDataKeysPerAccount', {});
  return {
    github: email ? (ghTokens[email] || '') : '',
    evds: email ? (evdsKeys[email] || '') : '',
    twelveData: email ? (tdKeys[email] || '') : '',
    geminiApiKey: store.get('geminiApiKey', ''),
    geminiModel: store.get('geminiModel', 'gemini-2.0-flash'),
    activeEmail: email || ''
  };
});

ipcMain.handle('save-all-api-keys', (_, keys) => {
  const email = getActiveAccountEmail();
  if (!email) return { success: false, error: 'Aktif hesap yok' };
  if (keys.github !== undefined) setGithubTokenForAccount(keys.github);
  if (keys.evds !== undefined) setEvdsKeyForAccount(keys.evds);
  if (keys.twelveData !== undefined) setTwelveDataKeyForAccount(keys.twelveData);
  if (keys.geminiApiKey !== undefined) store.set('geminiApiKey', keys.geminiApiKey);
  if (keys.geminiModel !== undefined) store.set('geminiModel', keys.geminiModel);
  return { success: true };
});

// ============ Gemini AI Settings ============
ipcMain.handle('get-gemini-settings', () => {
  return {
    apiKey: store.get('geminiApiKey', ''),
    model: store.get('geminiModel', 'gemini-2.0-flash')
  };
});

ipcMain.handle('save-gemini-settings', (_, settings) => {
  if (settings.apiKey !== undefined) store.set('geminiApiKey', settings.apiKey);
  if (settings.model !== undefined) store.set('geminiModel', settings.model);
  return true;
});

ipcMain.handle('gemini-chat', async (_, { messages, emailContext }) => {
  try {
    const apiKey = store.get('geminiApiKey', '');
    if (!apiKey) return { success: false, error: 'Gemini API anahtarı ayarlanmamış. Ayarlar\'dan ekleyin.' };

    const model = store.get('geminiModel', 'gemini-1.5-flash');
    const https = require('https');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemPrompt = `SADECE JSON ÇIKTISI ÜRET. ASLA KONUŞMA. ASLA AÇIKLAMA YAPMA.
Girdi ne olursa olsun tek yanıtın şu formatta bir JSON olmalıdır: {"type":"email","body":"metin"}

KURALLAR:
- Girdi dilini koru (İngilizce yaz denmedikçe).
- Sadece kullanıcı verisini kullan, uydurma.
- Markdown (**, #, \`\`\`) ASLA KULLANMA.
- Sadece e-posta metnini oluştur.

ÖRNEK:
Girdi: emreye selam nasılsın
Yanıt: {"type":"email","body":"Selam Emre,\\n\\nNasılsın? Merak ettim.\\n\\nSevgiler"}`;

    const contents = [];
    
    // System prompt as first message
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });
    
    // Model confirmation
    contents.push({
      role: 'model',
      parts: [{ text: 'ANLADIM. Sadece JSON formatında e-posta oluşturacağım. Asla açıklama yapmayacağım.' }]
    });
    
    // Add email context if exists
    if (emailContext) {
      contents.push({
        role: 'user',
        parts: [{ text: `BAĞLAM: Kimden: ${emailContext.from}, Konu: ${emailContext.subject}, Gövde: ${emailContext.body}` }]
      });
    }

    // Add conversation messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }

    const requestBody = JSON.stringify({
      contents: contents,
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    });

    return new Promise((resolve) => {
      const urlObj = new URL(url);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              resolve({ success: false, error: json.error.message || 'API hatası' });
              return;
            }
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve({ success: true, response: text });
          } catch (e) {
            resolve({ success: false, error: 'API yanıtı okunamadı' });
          }
        });
      });
      req.on('error', (e) => {
        resolve({ success: false, error: e.message });
      });
      req.write(requestBody);
      req.end();
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});
