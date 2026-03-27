const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mailAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Account management
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  getActiveAccount: () => ipcRenderer.invoke('get-active-account'),
  setActiveAccount: (index) => ipcRenderer.invoke('set-active-account', index),
  addAccount: (data) => ipcRenderer.invoke('add-account', data),
  removeAccount: (index) => ipcRenderer.invoke('remove-account', index),

  // Email operations
  fetchEmails: (folder, page, perPage) => ipcRenderer.invoke('fetch-emails', folder, page, perPage),
  fetchEmail: (uid, folder) => ipcRenderer.invoke('fetch-email', uid, folder),
  sendEmail: (data) => ipcRenderer.invoke('send-email', data),
  getFolders: () => ipcRenderer.invoke('get-folders'),
  deleteEmail: (uid, folder) => ipcRenderer.invoke('delete-email', uid, folder),
  markRead: (uid, folder) => ipcRenderer.invoke('mark-read', uid, folder),
  markStarred: (uid, starred, folder) => ipcRenderer.invoke('mark-starred', uid, starred, folder),
  searchEmails: (query, folder) => ipcRenderer.invoke('search-emails', query, folder),

  // Utility
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  forceQuit: () => ipcRenderer.invoke('force-quit'),

  // Theme
  getThemeSettings: () => ipcRenderer.invoke('get-theme-settings'),
  saveThemeSettings: (settings) => ipcRenderer.invoke('save-theme-settings', settings),
  pickBgImage: () => ipcRenderer.invoke('pick-bg-image'),

  // Logo
  getAvailableLogos: () => ipcRenderer.invoke('get-available-logos'),
  getSelectedLogo: () => ipcRenderer.invoke('get-selected-logo'),
  setSelectedLogo: (logo) => ipcRenderer.invoke('set-selected-logo', logo),

  // Contacts
  getContacts: () => ipcRenderer.invoke('get-contacts'),
  saveContact: (contact) => ipcRenderer.invoke('save-contact', contact),
  removeContact: (email) => ipcRenderer.invoke('remove-contact', email),

  // Notifications & Sound
  getNotificationSound: () => ipcRenderer.invoke('get-notification-sound'),
  setNotificationSound: (sound) => ipcRenderer.invoke('set-notification-sound', sound),
  getAvailableSounds: () => ipcRenderer.invoke('get-available-sounds'),

  // Events from main
  onPlaySound: (callback) => ipcRenderer.on('play-sound', callback),
  onPlaySentSound: (callback) => ipcRenderer.on('play-sent-sound', callback),
  onNewMail: (callback) => ipcRenderer.on('new-mail-arrived', (_, count) => callback(count)),

  // Attachments
  pickAttachments: () => ipcRenderer.invoke('pick-attachments'),
  saveAttachment: (data) => ipcRenderer.invoke('save-attachment', data),

  // Sound path resolver
  getSoundPath: (file) => ipcRenderer.invoke('get-sound-path', file)
});
