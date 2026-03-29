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
  deleteMultipleEmails: (uids, folder) => ipcRenderer.invoke('delete-multiple-emails', uids, folder),
  deleteNonFavorites: (folder) => ipcRenderer.invoke('delete-non-favorites', folder),
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
  getSoundPath: (file) => ipcRenderer.invoke('get-sound-path', file),

  // Quick Replies / Templates
  getQuickReplies: () => ipcRenderer.invoke('get-quick-replies'),
  saveQuickReply: (reply) => ipcRenderer.invoke('save-quick-reply', reply),
  removeQuickReply: (id) => ipcRenderer.invoke('remove-quick-reply', id),

  // Google Drive
  driveIsConnected: () => ipcRenderer.invoke('drive-is-connected'),
  driveAuth: () => ipcRenderer.invoke('drive-auth'),
  driveDisconnect: () => ipcRenderer.invoke('drive-disconnect'),
  driveListFiles: (folderId) => ipcRenderer.invoke('drive-list-files', folderId),
  driveUploadFile: (folderId) => ipcRenderer.invoke('drive-upload-file', folderId),
  driveDownloadFile: (fileId, fileName) => ipcRenderer.invoke('drive-download-file', fileId, fileName),

  // GitHub
  githubIsConnected: () => ipcRenderer.invoke('github-is-connected'),
  githubConnect: (token) => ipcRenderer.invoke('github-connect', token),
  githubDisconnect: () => ipcRenderer.invoke('github-disconnect'),
  githubGetUser: () => ipcRenderer.invoke('github-get-user'),
  githubListRepos: (search) => ipcRenderer.invoke('github-list-repos', search),
  githubCreateRepo: (name, desc, priv) => ipcRenderer.invoke('github-create-repo', name, desc, priv),
  githubDeleteRepo: (owner, repo) => ipcRenderer.invoke('github-delete-repo', owner, repo),
  githubStarRepo: (owner, repo) => ipcRenderer.invoke('github-star-repo', owner, repo),
  githubUnstarRepo: (owner, repo) => ipcRenderer.invoke('github-unstar-repo', owner, repo),
  githubIsStarred: (owner, repo) => ipcRenderer.invoke('github-is-starred', owner, repo),
  githubForkRepo: (owner, repo) => ipcRenderer.invoke('github-fork-repo', owner, repo),
  githubListBranches: (owner, repo) => ipcRenderer.invoke('github-list-branches', owner, repo),
  githubCreateBranch: (owner, repo, name, sha) => ipcRenderer.invoke('github-create-branch', owner, repo, name, sha),
  githubDeleteBranch: (owner, repo, name) => ipcRenderer.invoke('github-delete-branch', owner, repo, name),
  githubListCommits: (owner, repo, branch) => ipcRenderer.invoke('github-list-commits', owner, repo, branch),
  githubListIssues: (owner, repo, state) => ipcRenderer.invoke('github-list-issues', owner, repo, state),
  githubCreateIssue: (owner, repo, title, body, labels) => ipcRenderer.invoke('github-create-issue', owner, repo, title, body, labels),
  githubUpdateIssue: (owner, repo, num, updates) => ipcRenderer.invoke('github-update-issue', owner, repo, num, updates),
  githubAddComment: (owner, repo, num, body) => ipcRenderer.invoke('github-add-comment', owner, repo, num, body),
  githubListComments: (owner, repo, num) => ipcRenderer.invoke('github-list-comments', owner, repo, num),
  githubListPulls: (owner, repo, state) => ipcRenderer.invoke('github-list-pulls', owner, repo, state),
  githubListContents: (owner, repo, path, ref) => ipcRenderer.invoke('github-list-contents', owner, repo, path, ref),
  githubGetFileContent: (owner, repo, path, ref) => ipcRenderer.invoke('github-get-file-content', owner, repo, path, ref),
  githubCreateFile: (owner, repo, path, content, msg, branch) => ipcRenderer.invoke('github-create-file', owner, repo, path, content, msg, branch),
  githubUpdateFile: (owner, repo, path, content, sha, msg, branch) => ipcRenderer.invoke('github-update-file', owner, repo, path, content, sha, msg, branch),
  githubDeleteFile: (owner, repo, path, sha, msg, branch) => ipcRenderer.invoke('github-delete-file', owner, repo, path, sha, msg, branch),
  githubDownloadFile: (url, name) => ipcRenderer.invoke('github-download-file', url, name),
  githubDownloadZip: (owner, repo, branch) => ipcRenderer.invoke('github-download-zip', owner, repo, branch),
  githubListStarred: () => ipcRenderer.invoke('github-list-starred'),
  githubSearchRepos: (query) => ipcRenderer.invoke('github-search-repos', query),
  githubListGists: () => ipcRenderer.invoke('github-list-gists'),
  githubCreateGist: (desc, file, content, pub) => ipcRenderer.invoke('github-create-gist', desc, file, content, pub),
  githubDeleteGist: (id) => ipcRenderer.invoke('github-delete-gist', id),
  githubGetReadme: (owner, repo) => ipcRenderer.invoke('github-get-readme', owner, repo),
  githubGetLanguages: (owner, repo) => ipcRenderer.invoke('github-get-languages', owner, repo),

  // TCMB EVDS
  evdsIsConnected: () => ipcRenderer.invoke('evds-is-connected'),
  evdsConnect: (apiKey) => ipcRenderer.invoke('evds-connect', apiKey),
  evdsDisconnect: () => ipcRenderer.invoke('evds-disconnect'),
  evdsGetCategories: () => ipcRenderer.invoke('evds-get-categories'),
  evdsGetDatagroups: (categoryId) => ipcRenderer.invoke('evds-get-datagroups', categoryId),
  evdsGetSeriesList: (datagroupCode) => ipcRenderer.invoke('evds-get-series-list', datagroupCode),
  evdsGetSeriesData: (seriesCode, startDate, endDate, frequency) => ipcRenderer.invoke('evds-get-series-data', seriesCode, startDate, endDate, frequency),

  // Twelve Data
  tdIsConnected: () => ipcRenderer.invoke('td-is-connected'),
  tdConnect: (apiKey) => ipcRenderer.invoke('td-connect', apiKey),
  tdDisconnect: () => ipcRenderer.invoke('td-disconnect'),
  tdSearchSymbol: (query) => ipcRenderer.invoke('td-search-symbol', query),
  tdGetQuote: (symbol) => ipcRenderer.invoke('td-get-quote', symbol),
  tdGetPrice: (symbols) => ipcRenderer.invoke('td-get-price', symbols),
  tdGetTimeSeries: (symbol, interval, outputsize, startDate, endDate) => ipcRenderer.invoke('td-get-time-series', symbol, interval, outputsize, startDate, endDate),
  tdGetExchangeRate: (symbol) => ipcRenderer.invoke('td-get-exchange-rate', symbol),
  tdGetStocks: (exchange) => ipcRenderer.invoke('td-get-stocks', exchange),
  tdGetForexPairs: () => ipcRenderer.invoke('td-get-forex-pairs'),
  tdGetCrypto: () => ipcRenderer.invoke('td-get-crypto'),
  tdGetIndicator: (indicator, symbol, interval, params) => ipcRenderer.invoke('td-get-indicator', indicator, symbol, interval, params),
  tdGetUsage: () => ipcRenderer.invoke('td-get-usage'),

  // Yahoo Finance (API-keyiz)
  yfTestConnection: () => ipcRenderer.invoke('yf-test-connection'),
  yfSearch: (query) => ipcRenderer.invoke('yf-search', query),
  yfGetQuote: (symbols) => ipcRenderer.invoke('yf-get-quote', symbols),
  yfGetChart: (symbol, interval, range) => ipcRenderer.invoke('yf-get-chart', symbol, interval, range),
  yfGetSummary: (symbol) => ipcRenderer.invoke('yf-get-summary', symbol),

  // Binance (API-keyiz)
  bnTestConnection: () => ipcRenderer.invoke('bn-test-connection'),
  bnGetPrices: (symbols) => ipcRenderer.invoke('bn-get-prices', symbols),
  bnGetTicker24: (symbol) => ipcRenderer.invoke('bn-get-ticker24', symbol),
  bnGetKlines: (symbol, interval, limit) => ipcRenderer.invoke('bn-get-klines', symbol, interval, limit),
  bnSearch: (query) => ipcRenderer.invoke('bn-search', query),
  bnGetTopPairs: () => ipcRenderer.invoke('bn-get-top-pairs'),

  // Weather + Ticker
  getWeather: (lat, lon) => ipcRenderer.invoke('get-weather', lat, lon),
  getWeatherByCity: (city) => ipcRenderer.invoke('get-weather-by-city', city),
  getTickerRates: () => ipcRenderer.invoke('get-ticker-rates'),

  // API Keys Manager
  getAllApiKeys: () => ipcRenderer.invoke('get-all-api-keys'),
  saveAllApiKeys: (keys) => ipcRenderer.invoke('save-all-api-keys', keys),

  // Gemini AI
  getGeminiSettings: () => ipcRenderer.invoke('get-gemini-settings'),
  saveGeminiSettings: (settings) => ipcRenderer.invoke('save-gemini-settings', settings),
  geminiChat: (data) => ipcRenderer.invoke('gemini-chat', data),

  // Notification popup from main
  onNotificationPopup: (callback) => ipcRenderer.on('show-notification-popup', (_, data) => callback(data))
});
