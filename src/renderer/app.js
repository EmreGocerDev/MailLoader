// MailLoader — Renderer Application
// ============================================

const AVATAR_COLORS = [
  '#1a73e8', '#e8453c', '#f4b400', '#0f9d58',
  '#ab47bc', '#00acc1', '#ff7043', '#5c6bc0',
  '#26a69a', '#ec407a', '#7e57c2', '#42a5f5'
];

function getAvatarColor(str) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const clean = name.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean[0]?.toUpperCase() || '?';
}

function extractName(from) {
  if (!from) return 'Bilinmeyen';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.replace(/<[^>]+>/, '').trim() || from;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const emailDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (emailDay.getTime() === today.getTime()) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  const diffDays = Math.floor((today - emailDay) / 86400000);
  if (diffDays < 7) {
    return date.toLocaleDateString('tr-TR', { weekday: 'short' });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============ State ============

let state = {
  currentFolder: 'INBOX',
  currentPage: 1,
  emails: [],
  currentEmail: null,
  folders: [],
  searching: false,
  contacts: [],
  selectedUids: new Set(),
  quickReplies: [],
  driveCurrentFolder: null,
  driveBreadcrumb: [{ id: null, name: 'Drive' }]
};

// Detect if current folder is a sent folder
function isSentFolder(folder) {
  if (!folder) return false;
  const f = folder.toLowerCase();
  return f.includes('sent') || f === '[gmail]/sent mail';
}

// ============ Window Controls ============

document.getElementById('btn-minimize').addEventListener('click', () => window.mailAPI.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.mailAPI.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.mailAPI.close());

// ============ Login ============

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');

document.getElementById('login-provider').addEventListener('change', (e) => {
  document.getElementById('custom-fields').style.display = e.target.value === 'custom' ? 'block' : 'none';
});

document.getElementById('toggle-password').addEventListener('click', () => {
  const input = document.getElementById('login-password');
  input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('btn-login').addEventListener('click', handleLogin);

// Enter key on password field
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleLogin();
});

async function handleLogin() {
  const btn = document.getElementById('btn-login');
  const errorEl = document.getElementById('login-error');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const name = document.getElementById('login-name').value.trim();
  const provider = document.getElementById('login-provider').value;

  if (!email || !password) {
    errorEl.textContent = 'E-posta ve şifre gerekli.';
    errorEl.style.display = 'block';
    return;
  }

  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loader').style.display = 'flex';
  btn.disabled = true;
  errorEl.style.display = 'none';

  const accountData = { email, password, name: name || email.split('@')[0], provider };

  if (provider === 'custom') {
    accountData.imapHost = document.getElementById('login-imap-host').value.trim();
    accountData.imapPort = document.getElementById('login-imap-port').value;
    accountData.smtpHost = document.getElementById('login-smtp-host').value.trim();
    accountData.smtpPort = document.getElementById('login-smtp-port').value;
  }

  const result = await window.mailAPI.addAccount(accountData);

  btn.querySelector('.btn-text').style.display = '';
  btn.querySelector('.btn-loader').style.display = 'none';
  btn.disabled = false;

  if (result.success) {
    showApp();
  } else {
    errorEl.textContent = `Giriş başarısız: ${result.error}`;
    errorEl.style.display = 'block';
  }
}

// ============ App Init ============

async function init() {
  const accounts = await window.mailAPI.getAccounts();
  const activeIdx = await window.mailAPI.getActiveAccount();

  if (accounts.length > 0 && activeIdx >= 0) {
    showApp();
  } else if (accounts.length > 0) {
    showSavedAccounts(accounts);
  }
}

function showSavedAccounts(accounts) {
  const container = document.getElementById('saved-accounts');
  const list = document.getElementById('account-list');

  if (accounts.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = '';

  accounts.forEach((acc, idx) => {
    const color = getAvatarColor(acc.email);
    const initials = getInitials(acc.name || acc.email);
    const item = document.createElement('div');
    item.className = 'account-item';
    item.innerHTML = `
      <div class="avatar" style="background:${escapeHtml(color)}">${escapeHtml(initials)}</div>
      <div class="account-info">
        <span class="account-name">${escapeHtml(acc.name || acc.email)}</span>
        <span class="account-email">${escapeHtml(acc.email)}</span>
      </div>
      <button class="remove-account" data-index="${idx}" title="Kaldır">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    item.addEventListener('click', async (e) => {
      if (e.target.closest('.remove-account')) return;
      await window.mailAPI.setActiveAccount(idx);
      showApp();
    });

    const removeBtn = item.querySelector('.remove-account');
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.mailAPI.removeAccount(idx);
      const updated = await window.mailAPI.getAccounts();
      showSavedAccounts(updated);
    });

    list.appendChild(item);
  });
}

async function showApp() {
  loginScreen.classList.remove('active');
  appScreen.classList.add('active');

  await loadSidebar();
  loadContacts();
  loadEmails();
}

function showLogin() {
  appScreen.classList.remove('active');
  loginScreen.classList.add('active');

  // Clear form
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-name').value = '';
  document.getElementById('login-error').style.display = 'none';

  // Load saved accounts
  window.mailAPI.getAccounts().then(showSavedAccounts);
}

// ============ Sidebar ============

async function loadSidebar() {
  const accounts = await window.mailAPI.getAccounts();
  const activeIdx = await window.mailAPI.getActiveAccount();
  const activeAccount = accounts[activeIdx];

  if (activeAccount) {
    const color = getAvatarColor(activeAccount.email);
    const initials = getInitials(activeAccount.name || activeAccount.email);
    document.getElementById('sidebar-avatar').style.background = color;
    document.getElementById('sidebar-avatar').textContent = initials;
    document.getElementById('sidebar-name').textContent = activeAccount.name || activeAccount.email;
    document.getElementById('sidebar-email').textContent = activeAccount.email;
  }

  // Load folders
  try {
    const result = await window.mailAPI.getFolders();
    if (result.success) {
      state.folders = result.folders;
      renderOtherFolders(result.folders);
    }
  } catch (e) { /* ignore */ }

  // Dropdown accounts
  renderDropdownAccounts(accounts, activeIdx);
}

function renderOtherFolders(folders) {
  const container = document.getElementById('other-folders');
  const knownFolders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Junk', 'Spam', 'Starred',
    '[Gmail]', 'INBOX.Sent', 'INBOX.Drafts', 'INBOX.Trash', 'Deleted Items',
    '[Gmail]/Sent Mail', '[Gmail]/Drafts', '[Gmail]/Starred', '[Gmail]/Trash',
    '[Gmail]/All Mail', '[Gmail]/Spam', '[Gmail]/Important', 'Flagged', 'Notes'];

  const other = folders.filter(f => !knownFolders.includes(f.path) && !f.path.startsWith('[Gmail]'));
  container.innerHTML = '';

  other.forEach(f => {
    const item = document.createElement('div');
    item.className = 'folder-item';
    item.dataset.folder = f.path;
    item.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <span>${escapeHtml(f.name)}</span>
    `;
    item.addEventListener('click', () => selectFolder(f.path, f.name));
    container.appendChild(item);
  });
}

function renderDropdownAccounts(accounts, activeIdx) {
  const container = document.getElementById('dropdown-accounts');
  container.innerHTML = '';

  accounts.forEach((acc, idx) => {
    const color = getAvatarColor(acc.email);
    const initials = getInitials(acc.name || acc.email);
    const item = document.createElement('div');
    item.className = `dropdown-item${idx === activeIdx ? ' active' : ''}`;
    item.innerHTML = `
      <div class="avatar" style="background:${escapeHtml(color)}; width:28px; height:28px; font-size:11px;">${escapeHtml(initials)}</div>
      <span>${escapeHtml(acc.email)}</span>
    `;
    item.addEventListener('click', async () => {
      await window.mailAPI.setActiveAccount(idx);
      document.getElementById('account-dropdown').style.display = 'none';
      document.getElementById('current-account').classList.remove('open');
      await loadSidebar();
      state.currentFolder = 'INBOX';
      state.currentPage = 1;
      setActiveFolder('INBOX');
      loadEmails();
      showToast(`${acc.email} hesabına geçildi`, 'info');
    });
    container.appendChild(item);
  });
}

// Account dropdown toggle
document.getElementById('current-account').addEventListener('click', () => {
  const dd = document.getElementById('account-dropdown');
  const ca = document.getElementById('current-account');
  if (dd.style.display === 'none') {
    dd.style.display = 'block';
    ca.classList.add('open');
  } else {
    dd.style.display = 'none';
    ca.classList.remove('open');
  }
});

// Close dropdown on click outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.account-switcher')) {
    document.getElementById('account-dropdown').style.display = 'none';
    document.getElementById('current-account').classList.remove('open');
  }
});

// Add account
document.getElementById('btn-add-account').addEventListener('click', () => {
  document.getElementById('account-dropdown').style.display = 'none';
  showLogin();
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
  const activeIdx = await window.mailAPI.getActiveAccount();
  await window.mailAPI.removeAccount(activeIdx);
  const accounts = await window.mailAPI.getAccounts();
  if (accounts.length > 0) {
    await window.mailAPI.setActiveAccount(0);
    await loadSidebar();
    loadEmails();
  } else {
    showLogin();
  }
  document.getElementById('account-dropdown').style.display = 'none';
});

// ============ Folder Navigation ============

const folderNav = document.getElementById('folder-nav');
folderNav.addEventListener('click', (e) => {
  const item = e.target.closest('.folder-item');
  if (!item) return;

  const folderStr = item.dataset.folder;
  const name = item.querySelector('span').textContent;
  selectFolder(folderStr, name);
});

function selectFolder(folderStr, name) {
  // Folder string might be comma-separated alternatives
  const folders = folderStr.split(',');
  state.currentFolder = folders[0]; // try first
  state.currentPage = 1;

  setActiveFolder(folderStr);
  document.getElementById('current-folder-title').textContent = name || folderStr;

  // Show email list, hide detail
  document.getElementById('email-list-view').style.display = 'flex';
  document.getElementById('email-detail').style.display = 'none';

  loadEmails(folders);
}

function setActiveFolder(folderStr) {
  document.querySelectorAll('.folder-item').forEach(item => {
    item.classList.toggle('active', item.dataset.folder === folderStr);
  });
}

// ============ Email List ============

async function loadEmails(folderAlternatives) {
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');
  const listEl = document.getElementById('email-list');

  // Clear list except loading/empty
  listEl.querySelectorAll('.email-row').forEach(el => el.remove());
  loadingEl.style.display = 'flex';
  emptyEl.style.display = 'none';

  const folders = folderAlternatives || [state.currentFolder];
  let result = null;

  for (const folder of folders) {
    result = await window.mailAPI.fetchEmails(folder, state.currentPage, 50);
    if (result.success && result.emails.length > 0) {
      state.currentFolder = folder;
      break;
    }
    if (result.success) {
      state.currentFolder = folder;
    }
  }

  loadingEl.style.display = 'none';

  if (!result || !result.success) {
    emptyEl.style.display = 'flex';
    emptyEl.querySelector('p').textContent = result?.error || 'Bir hata oluştu';
    return;
  }

  state.emails = result.emails;

  if (result.emails.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }

  document.getElementById('email-count').textContent = `${result.emails.length} e-posta`;
  renderEmailList(result.emails);
}

function renderEmailList(emails) {
  const listEl = document.getElementById('email-list');
  listEl.querySelectorAll('.email-row').forEach(el => el.remove());
  const inSent = isSentFolder(state.currentFolder);
  state.selectedUids.clear();
  updateBulkActions();

  emails.forEach((email, idx) => {
    // In Sent folder, show recipient instead of sender
    const displayField = inSent ? (email.to || email.from) : email.from;
    const name = inSent ? extractName(email.to || email.from) : extractName(email.from);
    const color = getAvatarColor(displayField);
    const initials = getInitials(name);
    const row = document.createElement('div');
    row.className = `email-row${!email.seen ? ' unread' : ''}`;
    row.style.animationDelay = `${idx * 0.02}s`;

    row.innerHTML = `
      <label class="email-checkbox-label" title="Seç">
        <input type="checkbox" class="email-checkbox" data-uid="${email.uid}">
        <span class="custom-checkbox"></span>
      </label>
      <button class="star-btn${email.flagged ? ' starred' : ''}" data-uid="${email.uid}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${email.flagged ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>
      <div class="email-avatar" style="background:${color}">${escapeHtml(initials)}</div>
      <div class="email-meta">
        <div class="email-top">
          <span class="email-from">${escapeHtml(name)}</span>
          <span class="email-date">${formatDate(email.dateStr || email.date)}</span>
        </div>
        <div class="email-subject">${escapeHtml(email.subject || '(Konu yok)')}</div>
      </div>
    `;

    // Checkbox toggle
    const checkbox = row.querySelector('.email-checkbox');
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        state.selectedUids.add(email.uid);
      } else {
        state.selectedUids.delete(email.uid);
      }
      row.classList.toggle('selected', checkbox.checked);
      updateBulkActions();
    });

    // Prevent checkbox label click from opening email
    row.querySelector('.email-checkbox-label').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Star toggle
    row.querySelector('.star-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const isStarred = btn.classList.contains('starred');
      btn.classList.toggle('starred');
      const svg = btn.querySelector('svg polygon');
      if (svg) svg.setAttribute('fill', isStarred ? 'none' : 'currentColor');
      await window.mailAPI.markStarred(email.uid, !isStarred, state.currentFolder);
    });

    // Open email
    row.addEventListener('click', () => openEmail(email));

    listEl.appendChild(row);
  });
}

// ============ Email Detail ============

async function openEmail(email) {
  document.getElementById('email-list-view').style.display = 'none';
  document.getElementById('email-detail').style.display = 'flex';

  const detailEl = document.getElementById('detail-content');
  detailEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;">
      <div class="loading-spinner"></div>
    </div>
  `;

  // Mark as read
  if (!email.seen) {
    window.mailAPI.markRead(email.uid, state.currentFolder);
  }

  const result = await window.mailAPI.fetchEmail(email.uid, state.currentFolder);

  if (!result.success) {
    detailEl.innerHTML = `<p style="color:var(--danger);padding:20px;">Hata: ${escapeHtml(result.error)}</p>`;
    return;
  }

  state.currentEmail = result.email;
  const e = result.email;
  const fromName = extractName(e.from);
  const color = getAvatarColor(e.from);
  const initials = getInitials(fromName);

  let bodyHtml;
  if (e.html) {
    // Render HTML in iframe without sandbox to allow images
    bodyHtml = `<iframe id="email-iframe" style="width:100%;border:none;min-height:200px;"></iframe>`;
  } else {
    bodyHtml = `<div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(e.text)}</div>`;
  }

  let attachmentsHtml = '';
  if (e.attachments && e.attachments.length > 0) {
    attachmentsHtml = `
      <div class="detail-attachments">
        <h4>Ekler (${e.attachments.length})</h4>
        ${e.attachments.map((a, idx) => `
          <div class="attachment-item attachment-download" data-att-idx="${idx}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            <span>${escapeHtml(a.filename || 'Ek')}</span>
            <span style="color:var(--text-tertiary)">${formatSize(a.size)}</span>
            <svg class="download-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
        `).join('')}
      </div>
    `;
  }

  detailEl.innerHTML = `
    <h1 class="detail-subject">${escapeHtml(e.subject)}</h1>
    <div class="detail-header">
      <div class="avatar" style="background:${color}">${escapeHtml(initials)}</div>
      <div class="detail-header-info">
        <div class="detail-from">${escapeHtml(fromName)}</div>
        <div class="detail-to">Kime: ${escapeHtml(e.to)}${e.cc ? ` | CC: ${escapeHtml(e.cc)}` : ''}</div>
      </div>
      <div class="detail-date">${formatFullDate(e.date)}</div>
    </div>
    <div class="detail-body">${bodyHtml}</div>
    ${attachmentsHtml}
  `;

  // Attachment download handlers
  detailEl.querySelectorAll('.attachment-download').forEach(item => {
    item.addEventListener('click', async () => {
      const idx = parseInt(item.dataset.attIdx);
      const att = e.attachments[idx];
      if (!att || !att.content) {
        showToast('Bu ek indirilemedi', 'error');
        return;
      }
      const saved = await window.mailAPI.saveAttachment({
        filename: att.filename || 'attachment',
        content: att.content,
        contentType: att.contentType
      });
      if (saved) showToast('Ek kaydedildi', 'success');
    });
  });

  // If HTML email, set iframe content
  if (e.html) {
    const iframe = document.getElementById('email-iframe');
    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(`
        <html>
        <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: cid: blob:; style-src 'unsafe-inline' https:; font-src https: data:; connect-src https: http:;">
        <base target="_blank">
        <style>
          body { font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1f1f; margin: 0; padding: 0; }
          img { max-width: 100%; height: auto; display: inline-block; }
          a { color: #1a73e8; cursor: pointer; }
        </style></head>
        <body>${e.html}</body>
        </html>
      `);
      doc.close();

      // Make all links open in external browser
      doc.addEventListener('click', (ev) => {
        const a = ev.target.closest('a');
        if (a && a.href) {
          ev.preventDefault();
          const href = a.href;
          if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
            window.mailAPI.openExternal(href);
          }
        }
      });

      // Auto-resize iframe
      const resizeIframe = () => {
        try { iframe.style.height = doc.body.scrollHeight + 20 + 'px'; } catch(e) {}
      };
      resizeIframe();
      setTimeout(resizeIframe, 500);
      setTimeout(resizeIframe, 2000);
      // Resize again after images load
      const imgs = doc.querySelectorAll('img');
      imgs.forEach(img => {
        img.addEventListener('load', resizeIframe);
        img.addEventListener('error', resizeIframe);
      });
    });

    // Trigger load
    iframe.src = 'about:blank';
  }
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// Back button
document.getElementById('btn-back').addEventListener('click', () => {
  document.getElementById('email-detail').style.display = 'none';
  document.getElementById('email-list-view').style.display = 'flex';
  state.currentEmail = null;
});

// Reply
document.getElementById('btn-reply').addEventListener('click', () => {
  if (!state.currentEmail) return;
  const e = state.currentEmail;
  openCompose({
    to: e.fromAddress || extractEmailAddress(e.from),
    subject: e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`,
    body: `\n\n--- Orijinal Mesaj ---\nKimden: ${e.from}\nTarih: ${formatFullDate(e.date)}\nKonu: ${e.subject}\n\n${e.text || ''}`,
    title: 'Yanıtla'
  });
});

// Forward
document.getElementById('btn-forward').addEventListener('click', () => {
  if (!state.currentEmail) return;
  const e = state.currentEmail;
  openCompose({
    subject: e.subject.startsWith('Fwd:') ? e.subject : `Fwd: ${e.subject}`,
    body: `\n\n--- İletilen Mesaj ---\nKimden: ${e.from}\nTarih: ${formatFullDate(e.date)}\nKonu: ${e.subject}\nKime: ${e.to}\n\n${e.text || ''}`,
    title: 'İlet'
  });
});

// Delete
document.getElementById('btn-delete-email').addEventListener('click', async () => {
  if (!state.currentEmail) return;
  const result = await window.mailAPI.deleteEmail(state.currentEmail.uid, state.currentFolder);
  if (result.success) {
    showToast('E-posta silindi', 'success');
    document.getElementById('email-detail').style.display = 'none';
    document.getElementById('email-list-view').style.display = 'flex';
    state.currentEmail = null;
    loadEmails();
  } else {
    showToast('Silme hatası: ' + result.error, 'error');
  }
});

function extractEmailAddress(from) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

// ============ Compose ============

let composeAttachments = [];

document.getElementById('btn-compose').addEventListener('click', () => {
  openCompose({ title: 'Yeni E-posta' });
});

function openCompose({ to = '', cc = '', subject = '', body = '', title = 'Yeni E-posta' } = {}) {
  composeAttachments = [];
  renderComposeAttachments();
  document.getElementById('compose-to').value = to;
  document.getElementById('compose-cc').value = cc;
  document.getElementById('compose-subject').value = subject;
  document.getElementById('compose-body').value = body;
  document.getElementById('compose-title').textContent = title;
  document.getElementById('compose-overlay').style.display = 'flex';
}

function closeCompose() {
  document.getElementById('compose-overlay').style.display = 'none';
  composeAttachments = [];
  renderComposeAttachments();
}

document.getElementById('btn-compose-close').addEventListener('click', closeCompose);
document.getElementById('btn-discard').addEventListener('click', closeCompose);

document.getElementById('compose-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('compose-overlay')) closeCompose();
});

document.getElementById('btn-send').addEventListener('click', async () => {
  const btn = document.getElementById('btn-send');
  const to = document.getElementById('compose-to').value.trim();
  const cc = document.getElementById('compose-cc').value.trim();
  const subject = document.getElementById('compose-subject').value.trim();
  const body = document.getElementById('compose-body').value;

  if (!to) {
    showToast('Alıcı adresi gerekli', 'error');
    return;
  }

  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loader').style.display = 'flex';
  btn.disabled = true;

  const emailData = { to, cc, subject, text: body };
  if (composeAttachments.length > 0) {
    emailData.attachments = composeAttachments.map(a => ({
      filename: a.filename,
      path: a.path
    }));
  }

  const result = await window.mailAPI.sendEmail(emailData);

  btn.querySelector('.btn-text').style.display = '';
  btn.querySelector('.btn-loader').style.display = 'none';
  btn.disabled = false;

  if (result.success) {
    showToast('E-posta gönderildi!', 'success');
    closeCompose();
  } else {
    showToast('Gönderme hatası: ' + result.error, 'error');
  }
});

// Attachment button
document.getElementById('btn-attach').addEventListener('click', async () => {
  const files = await window.mailAPI.pickAttachments();
  if (files && files.length > 0) {
    composeAttachments.push(...files);
    renderComposeAttachments();
  }
});

function renderComposeAttachments() {
  const list = document.getElementById('compose-attachment-list');
  list.innerHTML = '';
  composeAttachments.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'compose-attachment-item';
    item.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
      </svg>
      <span class="compose-attachment-name">${escapeHtml(file.filename)}</span>
      <span class="compose-attachment-size">${formatSize(file.size)}</span>
      <button class="compose-attachment-remove" data-idx="${idx}" title="Kaldır">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    item.querySelector('.compose-attachment-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      composeAttachments.splice(idx, 1);
      renderComposeAttachments();
    });
    list.appendChild(item);
  });
}

// ============ Search ============

let searchTimeout = null;
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  searchClear.style.display = query ? 'flex' : 'none';

  clearTimeout(searchTimeout);
  if (query.length >= 2) {
    searchTimeout = setTimeout(() => performSearch(query), 500);
  } else if (!query) {
    state.searching = false;
    loadEmails();
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  state.searching = false;
  loadEmails();
});

async function performSearch(query) {
  state.searching = true;
  const listEl = document.getElementById('email-list');
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');

  listEl.querySelectorAll('.email-row').forEach(el => el.remove());
  loadingEl.style.display = 'flex';
  emptyEl.style.display = 'none';

  document.getElementById('current-folder-title').textContent = `Arama: "${query}"`;

  const result = await window.mailAPI.searchEmails(query, state.currentFolder);
  loadingEl.style.display = 'none';

  if (!result.success || result.emails.length === 0) {
    emptyEl.style.display = 'flex';
    emptyEl.querySelector('p').textContent = 'Sonuç bulunamadı';
    return;
  }

  document.getElementById('email-count').textContent = `${result.emails.length} sonuç`;
  renderEmailList(result.emails);
}

// ============ Refresh ============

document.getElementById('btn-refresh').addEventListener('click', () => {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  loadEmails().then(() => {
    setTimeout(() => btn.classList.remove('spinning'), 500);
    showToast('E-postalar yenilendi', 'info');
  });
});

// ============ Keyboard Shortcuts ============

document.addEventListener('keydown', (e) => {
  // Escape to close compose/theme panel or go back
  if (e.key === 'Escape') {
    if (document.getElementById('settings-panel-overlay').style.display !== 'none') {
      closeSettingsPanel();
    } else if (document.getElementById('drive-panel-overlay').style.display !== 'none') {
      closeDrivePanel();
    } else if (document.getElementById('theme-panel-overlay').style.display !== 'none') {
      closeThemePanel();
    } else if (document.getElementById('compose-overlay').style.display !== 'none') {
      closeCompose();
    } else if (document.getElementById('email-detail').style.display !== 'none') {
      document.getElementById('btn-back').click();
    }
  }

  // Ctrl+N for new email
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    document.getElementById('btn-compose').click();
  }

  // Ctrl+R for reply (when viewing email)
  if (e.ctrlKey && e.key === 'r' && state.currentEmail) {
    e.preventDefault();
    document.getElementById('btn-reply').click();
  }
});

// ============ App Password Link ============

document.getElementById('app-password-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.mailAPI.openExternal('https://myaccount.google.com/apppasswords');
});

// ============ Contacts System ============

async function loadContacts() {
  state.contacts = await window.mailAPI.getContacts();
  renderContacts();
}

function renderContacts() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';
  state.contacts.forEach(contact => {
    const color = getAvatarColor(contact.email);
    const initials = getInitials(contact.name || contact.email);
    const item = document.createElement('div');
    item.className = 'contact-item';
    item.innerHTML = `
      <div class="avatar" style="background:${escapeHtml(color)}; width:28px; height:28px; font-size:11px;">${escapeHtml(initials)}</div>
      <div class="contact-info">
        <span class="contact-name">${escapeHtml(contact.name || contact.email)}</span>
        <span class="contact-email">${escapeHtml(contact.email)}</span>
      </div>
      <button class="contact-remove" title="Kaldır">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    // Click to compose email to contact
    item.addEventListener('click', (e) => {
      if (e.target.closest('.contact-remove')) return;
      openCompose({ to: contact.email, title: 'Yeni E-posta' });
    });
    item.querySelector('.contact-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      state.contacts = await window.mailAPI.removeContact(contact.email);
      renderContacts();
      showToast('Kişi kaldırıldı', 'info');
    });
    list.appendChild(item);
  });
}

document.getElementById('btn-add-contact').addEventListener('click', () => {
  const dialog = document.getElementById('contact-dialog-overlay');
  document.getElementById('contact-dialog-name').value = '';
  document.getElementById('contact-dialog-email').value = '';
  dialog.style.display = 'flex';
  document.getElementById('contact-dialog-name').focus();
});

document.getElementById('contact-dialog-cancel').addEventListener('click', () => {
  document.getElementById('contact-dialog-overlay').style.display = 'none';
});

document.getElementById('contact-dialog-save').addEventListener('click', async () => {
  const name = document.getElementById('contact-dialog-name').value.trim();
  const email = document.getElementById('contact-dialog-email').value.trim();
  if (!name || !email) {
    showToast('Ad ve e-posta gerekli', 'error');
    return;
  }
  state.contacts = await window.mailAPI.saveContact({ name, email });
  renderContacts();
  showToast('Kişi eklendi', 'success');
  document.getElementById('contact-dialog-overlay').style.display = 'none';
});

document.getElementById('contact-dialog-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'contact-dialog-overlay') {
    document.getElementById('contact-dialog-overlay').style.display = 'none';
  }
});

// ============ Notification Sound ============

let incomingSound = null;
let outgoingSound = null;

async function initSounds() {
  try {
    const gelenPath = await window.mailAPI.getSoundPath('gelen.wav');
    const gidenPath = await window.mailAPI.getSoundPath('giden.wav');
    if (gelenPath) incomingSound = new Audio('file:///' + gelenPath.replace(/\\/g, '/'));
    if (gidenPath) outgoingSound = new Audio('file:///' + gidenPath.replace(/\\/g, '/'));
  } catch (e) {
    // Fallback — try relative path
    incomingSound = new Audio('../../assets/sound/gelen.wav');
    outgoingSound = new Audio('../../assets/sound/giden.wav');
  }
}

function playIncomingSound() {
  if (incomingSound) {
    incomingSound.currentTime = 0;
    incomingSound.play().catch(() => {});
  }
}

function playOutgoingSound() {
  if (outgoingSound) {
    outgoingSound.currentTime = 0;
    outgoingSound.play().catch(() => {});
  }
}

// Listen to main process events
window.mailAPI.onPlaySound(() => playIncomingSound());
window.mailAPI.onPlaySentSound(() => playOutgoingSound());
window.mailAPI.onNewMail((count) => {
  showToast(`${count} yeni e-posta geldi!`, 'success');
  // Auto-refresh if in INBOX
  if (state.currentFolder === 'INBOX') {
    loadEmails();
  }
});

// ============ Theme System ============

let themeSettings = {
  theme: 'light',
  accentColor: '#1a73e8',
  bgImage: '',
  glassEnabled: false,
  liquidEnabled: false
};

let liquidAnimId = null;

async function loadTheme() {
  try {
    const saved = await window.mailAPI.getThemeSettings();
    if (saved) Object.assign(themeSettings, saved);
  } catch (e) { /* use defaults */ }
  applyTheme();
}

function applyTheme() {
  // Theme mode
  document.body.classList.remove('theme-dark', 'theme-midnight');
  if (themeSettings.theme === 'dark') document.body.classList.add('theme-dark');
  else if (themeSettings.theme === 'midnight') document.body.classList.add('theme-midnight');

  // Accent color
  document.documentElement.style.setProperty('--primary', themeSettings.accentColor);
  // Derive hover/light variants
  document.documentElement.style.setProperty('--primary-hover', adjustColor(themeSettings.accentColor, -20));
  document.documentElement.style.setProperty('--primary-light', adjustColor(themeSettings.accentColor, 85, true));

  // Background image
  const bgLayer = document.getElementById('bg-image-layer');
  if (themeSettings.bgImage) {
    bgLayer.style.backgroundImage = `url(${themeSettings.bgImage})`;
    bgLayer.classList.add('active');
  } else {
    bgLayer.style.backgroundImage = '';
    bgLayer.classList.remove('active');
  }

  // Glass effect
  document.body.classList.toggle('glass-enabled', !!themeSettings.glassEnabled);

  // Liquid effect
  if (themeSettings.liquidEnabled) {
    startLiquid();
    document.getElementById('liquid-canvas').classList.add('active');
  } else {
    stopLiquid();
    document.getElementById('liquid-canvas').classList.remove('active');
  }

  // Update theme panel UI
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === themeSettings.theme);
  });
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === themeSettings.accentColor);
  });
  document.getElementById('custom-color').value = themeSettings.accentColor;
  document.getElementById('toggle-glass').checked = !!themeSettings.glassEnabled;
  document.getElementById('toggle-liquid').checked = !!themeSettings.liquidEnabled;
}

function adjustColor(hex, amount, lighten = false) {
  hex = hex.replace('#', '');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  if (lighten) {
    r = Math.min(255, r + Math.round((255 - r) * amount / 100));
    g = Math.min(255, g + Math.round((255 - g) * amount / 100));
    b = Math.min(255, b + Math.round((255 - b) * amount / 100));
  } else {
    r = Math.max(0, r + amount);
    g = Math.max(0, g + amount);
    b = Math.max(0, b + amount);
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function saveTheme() {
  window.mailAPI.saveThemeSettings(themeSettings);
}

// Theme Panel open/close
function openThemePanel() {
  document.getElementById('theme-panel-overlay').style.display = 'flex';
  loadLogoPicker();
  loadSoundPicker();
}

function closeThemePanel() {
  document.getElementById('theme-panel-overlay').style.display = 'none';
}

document.getElementById('btn-theme').addEventListener('click', openThemePanel);
document.getElementById('btn-theme-close').addEventListener('click', closeThemePanel);
document.getElementById('theme-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'theme-panel-overlay') closeThemePanel();
});

// Theme mode buttons
document.querySelectorAll('.theme-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    themeSettings.theme = btn.dataset.theme;
    applyTheme();
    saveTheme();
  });
});

// Color swatches
document.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    themeSettings.accentColor = sw.dataset.color;
    applyTheme();
    saveTheme();
  });
});

// Custom color input
document.getElementById('custom-color').addEventListener('input', (e) => {
  themeSettings.accentColor = e.target.value;
  applyTheme();
  saveTheme();
});

// Background image pick
document.getElementById('btn-pick-bg').addEventListener('click', async () => {
  const result = await window.mailAPI.pickBgImage();
  if (result) {
    themeSettings.bgImage = result;
    applyTheme();
    saveTheme();
    showToast('Arkaplan resmi ayarlandı', 'success');
  }
});

// Clear background image
document.getElementById('btn-clear-bg').addEventListener('click', () => {
  themeSettings.bgImage = '';
  applyTheme();
  saveTheme();
  showToast('Arkaplan resmi kaldırıldı', 'info');
});

// Glass toggle
document.getElementById('toggle-glass').addEventListener('change', (e) => {
  themeSettings.glassEnabled = e.target.checked;
  applyTheme();
  saveTheme();
});

// Liquid toggle
document.getElementById('toggle-liquid').addEventListener('change', (e) => {
  themeSettings.liquidEnabled = e.target.checked;
  applyTheme();
  saveTheme();
});

// ============ Logo Picker ============

async function loadLogoPicker() {
  const logos = await window.mailAPI.getAvailableLogos();
  const selected = await window.mailAPI.getSelectedLogo();
  const container = document.getElementById('logo-picker');
  container.innerHTML = '';
  logos.forEach(logo => {
    const btn = document.createElement('button');
    btn.className = `logo-option${logo === selected ? ' active' : ''}`;
    btn.textContent = logo.replace('.ico', '');
    btn.title = logo;
    btn.addEventListener('click', async () => {
      await window.mailAPI.setSelectedLogo(logo);
      container.querySelectorAll('.logo-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast('İkon değiştirildi', 'success');
    });
    container.appendChild(btn);
  });
}

// ============ Sound Picker ============

async function loadSoundPicker() {
  const sounds = await window.mailAPI.getAvailableSounds();
  const current = await window.mailAPI.getNotificationSound();
  const select = document.getElementById('notification-sound');
  select.innerHTML = '';
  sounds.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s === 'default' ? 'Windows Varsayılan' : s;
    if (s === current) opt.selected = true;
    select.appendChild(opt);
  });
}

document.getElementById('notification-sound').addEventListener('change', (e) => {
  window.mailAPI.setNotificationSound(e.target.value);
  showToast('Bildirim sesi değiştirildi', 'success');
});

document.getElementById('btn-test-sound').addEventListener('click', () => {
  playIncomingSound();
});

// ============ Liquid Animation ============

function startLiquid() {
  if (liquidAnimId) return;
  const canvas = document.getElementById('liquid-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const blobs = [];
  for (let i = 0; i < 6; i++) {
    blobs.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: 80 + Math.random() * 120,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      hue: Math.random() * 360
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blobs.forEach(blob => {
      blob.x += blob.vx;
      blob.y += blob.vy;
      if (blob.x < -blob.radius) blob.x = canvas.width + blob.radius;
      if (blob.x > canvas.width + blob.radius) blob.x = -blob.radius;
      if (blob.y < -blob.radius) blob.y = canvas.height + blob.radius;
      if (blob.y > canvas.height + blob.radius) blob.y = -blob.radius;
      blob.hue = (blob.hue + 0.1) % 360;

      const grad = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
      grad.addColorStop(0, `hsla(${blob.hue}, 70%, 60%, 0.4)`);
      grad.addColorStop(1, `hsla(${blob.hue}, 70%, 60%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    liquidAnimId = requestAnimationFrame(draw);
  }

  draw();

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

function stopLiquid() {
  if (liquidAnimId) {
    cancelAnimationFrame(liquidAnimId);
    liquidAnimId = null;
    const canvas = document.getElementById('liquid-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ============ Init ============
loadTheme();
initSounds();
init();

// ============ Bulk Selection & Delete ============

function updateBulkActions() {
  const count = state.selectedUids.size;
  const bulkBar = document.getElementById('bulk-actions');
  const bulkCount = document.getElementById('bulk-count');
  const selectAll = document.getElementById('select-all-checkbox');

  if (count > 0) {
    bulkBar.style.display = 'flex';
    bulkCount.textContent = `${count} seçili`;
  } else {
    bulkBar.style.display = 'none';
  }

  // Update select-all state
  const checkboxes = document.querySelectorAll('.email-checkbox');
  if (checkboxes.length > 0 && count === checkboxes.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else if (count > 0) {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
}

document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
  const checked = e.target.checked;
  const checkboxes = document.querySelectorAll('.email-checkbox');
  state.selectedUids.clear();

  checkboxes.forEach(cb => {
    cb.checked = checked;
    const uid = parseInt(cb.dataset.uid);
    const row = cb.closest('.email-row');
    if (checked) {
      state.selectedUids.add(uid);
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
  });
  updateBulkActions();
});

document.getElementById('btn-delete-selected').addEventListener('click', async () => {
  if (state.selectedUids.size === 0) return;
  const count = state.selectedUids.size;
  if (!confirm(`${count} e-posta silinecek. Emin misiniz?`)) return;

  const uids = Array.from(state.selectedUids);
  const result = await window.mailAPI.deleteMultipleEmails(uids, state.currentFolder);
  if (result.success) {
    showToast(`${count} e-posta silindi`, 'success');
    state.selectedUids.clear();
    updateBulkActions();
    loadEmails();
  } else {
    showToast('Silme hatası: ' + result.error, 'error');
  }
});

document.getElementById('btn-delete-non-favorites').addEventListener('click', async () => {
  if (!confirm('Favoriler (yıldızlı) hariç tüm e-postalar silinecek. Emin misiniz?')) return;

  const result = await window.mailAPI.deleteNonFavorites(state.currentFolder);
  if (result.success) {
    showToast(`${result.count} e-posta silindi (favoriler korundu)`, 'success');
    state.selectedUids.clear();
    updateBulkActions();
    loadEmails();
  } else {
    showToast('Silme hatası: ' + result.error, 'error');
  }
});

// ============ Settings Panel ============

function openSettingsPanel() {
  document.getElementById('settings-panel-overlay').style.display = 'flex';
  loadQuickReplies();
  loadDriveCredentials();
}

function closeSettingsPanel() {
  document.getElementById('settings-panel-overlay').style.display = 'none';
}

document.getElementById('btn-settings').addEventListener('click', openSettingsPanel);
document.getElementById('btn-settings-close').addEventListener('click', closeSettingsPanel);
document.getElementById('settings-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'settings-panel-overlay') closeSettingsPanel();
});

// ============ Quick Replies / Templates ============

async function loadQuickReplies() {
  state.quickReplies = await window.mailAPI.getQuickReplies();
  renderQuickReplyList();
}

function renderQuickReplyList() {
  const list = document.getElementById('quick-reply-list');
  list.innerHTML = '';
  if (state.quickReplies.length === 0) {
    list.innerHTML = '<div class="settings-empty">Henüz şablon eklenmemiş.</div>';
    return;
  }
  state.quickReplies.forEach(qr => {
    const item = document.createElement('div');
    item.className = 'quick-reply-item';
    item.innerHTML = `
      <div class="qr-item-content">
        <strong>${escapeHtml(qr.name)}</strong>
        <p>${escapeHtml(qr.body).substring(0, 100)}${qr.body.length > 100 ? '...' : ''}</p>
      </div>
      <button class="qr-remove-btn" data-id="${escapeHtml(qr.id)}" title="Sil">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    item.querySelector('.qr-remove-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      state.quickReplies = await window.mailAPI.removeQuickReply(qr.id);
      renderQuickReplyList();
      showToast('Şablon silindi', 'info');
    });
    list.appendChild(item);
  });
}

document.getElementById('btn-save-qr').addEventListener('click', async () => {
  const name = document.getElementById('qr-name').value.trim();
  const body = document.getElementById('qr-body').value.trim();
  if (!name || !body) {
    showToast('Şablon adı ve içeriği gerekli', 'error');
    return;
  }
  state.quickReplies = await window.mailAPI.saveQuickReply({ name, body });
  renderQuickReplyList();
  document.getElementById('qr-name').value = '';
  document.getElementById('qr-body').value = '';
  showToast('Şablon eklendi', 'success');
});

// Template Sidebar in Compose
document.getElementById('btn-toggle-templates').addEventListener('click', async () => {
  const sidebar = document.getElementById('template-sidebar');
  const isVisible = sidebar.style.display !== 'none';
  sidebar.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) {
    await loadQuickReplies();
    renderTemplateSidebar();
  }
});

document.getElementById('btn-close-templates').addEventListener('click', () => {
  document.getElementById('template-sidebar').style.display = 'none';
});

function renderTemplateSidebar() {
  const list = document.getElementById('template-sidebar-list');
  list.innerHTML = '';
  if (state.quickReplies.length === 0) {
    list.innerHTML = '<div class="template-empty">Henüz hazır yanıt yok. Ayarlardan ekleyin.</div>';
    return;
  }
  state.quickReplies.forEach(qr => {
    const item = document.createElement('div');
    item.className = 'template-item';
    item.innerHTML = `
      <strong>${escapeHtml(qr.name)}</strong>
      <p>${escapeHtml(qr.body).substring(0, 80)}${qr.body.length > 80 ? '...' : ''}</p>
    `;
    item.addEventListener('click', () => {
      const textarea = document.getElementById('compose-body');
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      textarea.value = text.substring(0, start) + qr.body + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + qr.body.length;
    });
    list.appendChild(item);
  });
}

// Load templates when compose opens
const origOpenCompose = openCompose;
// already defined above, we override by wrapping
const _openComposeBase = openCompose;

// ============ Google Drive Credentials ============

async function loadDriveCredentials() {
  const creds = await window.mailAPI.driveGetCredentials();
  document.getElementById('drive-client-id').value = creds.clientId || '';
  document.getElementById('drive-client-secret').value = creds.clientSecret || '';
}

document.getElementById('btn-save-drive-creds').addEventListener('click', async () => {
  const clientId = document.getElementById('drive-client-id').value.trim();
  const clientSecret = document.getElementById('drive-client-secret').value.trim();
  await window.mailAPI.driveSetCredentials(clientId, clientSecret);
  showToast('Google Drive API bilgileri kaydedildi', 'success');
});

// ============ Google Drive Panel ============

function openDrivePanel() {
  document.getElementById('drive-panel-overlay').style.display = 'flex';
  checkDriveConnection();
}

function closeDrivePanel() {
  document.getElementById('drive-panel-overlay').style.display = 'none';
}

document.getElementById('btn-drive-tab').addEventListener('click', openDrivePanel);
document.getElementById('btn-drive-close').addEventListener('click', closeDrivePanel);
document.getElementById('drive-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'drive-panel-overlay') closeDrivePanel();
});

async function checkDriveConnection() {
  const connected = await window.mailAPI.driveIsConnected();
  document.getElementById('drive-not-connected').style.display = connected ? 'none' : 'flex';
  document.getElementById('drive-connected').style.display = connected ? 'flex' : 'none';
  if (connected) {
    state.driveCurrentFolder = null;
    state.driveBreadcrumb = [{ id: null, name: 'Drive' }];
    renderDriveBreadcrumb();
    loadDriveFiles();
  }
}

document.getElementById('btn-drive-connect').addEventListener('click', async () => {
  const btn = document.getElementById('btn-drive-connect');
  btn.disabled = true;
  btn.textContent = 'Bağlanıyor...';

  const result = await window.mailAPI.driveAuth();
  btn.disabled = false;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Google ile Bağlan`;

  if (result.success) {
    showToast('Google Drive bağlandı!', 'success');
    checkDriveConnection();
  } else {
    showToast('Bağlantı hatası: ' + result.error, 'error');
  }
});

document.getElementById('btn-drive-disconnect-panel').addEventListener('click', async () => {
  await window.mailAPI.driveDisconnect();
  showToast('Google Drive bağlantısı kesildi', 'info');
  checkDriveConnection();
});

async function loadDriveFiles(folderId) {
  const listEl = document.getElementById('drive-file-list');
  listEl.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Dosyalar yükleniyor...</p></div>';

  const result = await window.mailAPI.driveListFiles(folderId || null);

  if (!result.success) {
    listEl.innerHTML = `<div class="drive-error"><p>${escapeHtml(result.error)}</p></div>`;
    return;
  }

  if (result.files.length === 0) {
    listEl.innerHTML = '<div class="drive-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><p>Bu klasör boş</p></div>';
    return;
  }

  listEl.innerHTML = '';
  result.files.forEach(file => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const item = document.createElement('div');
    item.className = 'drive-file-item';
    item.innerHTML = `
      <div class="drive-file-icon">
        ${isFolder
          ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" stroke-width="1"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
          : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        }
      </div>
      <div class="drive-file-info">
        <span class="drive-file-name">${escapeHtml(file.name)}</span>
        <span class="drive-file-meta">${isFolder ? 'Klasör' : formatSize(parseInt(file.size) || 0)}${file.modifiedTime ? ' · ' + formatDate(file.modifiedTime) : ''}</span>
      </div>
      ${!isFolder ? `<button class="drive-download-btn" title="İndir">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>` : ''}
    `;

    if (isFolder) {
      item.addEventListener('click', () => {
        state.driveCurrentFolder = file.id;
        state.driveBreadcrumb.push({ id: file.id, name: file.name });
        renderDriveBreadcrumb();
        loadDriveFiles(file.id);
      });
    } else {
      const downloadBtn = item.querySelector('.drive-download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const res = await window.mailAPI.driveDownloadFile(file.id, file.name);
          if (res.success) showToast('Dosya indirildi', 'success');
          else showToast('İndirme hatası: ' + res.error, 'error');
        });
      }
    }

    listEl.appendChild(item);
  });
}

function renderDriveBreadcrumb() {
  const container = document.getElementById('drive-breadcrumb');
  container.innerHTML = '';
  state.driveBreadcrumb.forEach((item, idx) => {
    const span = document.createElement('span');
    span.className = 'drive-breadcrumb-item';
    span.textContent = item.name;
    if (idx < state.driveBreadcrumb.length - 1) {
      span.style.cursor = 'pointer';
      span.style.opacity = '0.7';
      span.addEventListener('click', () => {
        state.driveBreadcrumb = state.driveBreadcrumb.slice(0, idx + 1);
        state.driveCurrentFolder = item.id;
        renderDriveBreadcrumb();
        loadDriveFiles(item.id);
      });
    }
    container.appendChild(span);
    if (idx < state.driveBreadcrumb.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'drive-breadcrumb-sep';
      sep.textContent = ' / ';
      container.appendChild(sep);
    }
  });
}

document.getElementById('btn-drive-upload').addEventListener('click', async () => {
  const result = await window.mailAPI.driveUploadFile(state.driveCurrentFolder);
  if (result.success) {
    showToast(`${result.files.length} dosya yüklendi`, 'success');
    loadDriveFiles(state.driveCurrentFolder);
  } else if (result.error !== 'İptal edildi') {
    showToast('Yükleme hatası: ' + result.error, 'error');
  }
});

document.getElementById('btn-drive-refresh').addEventListener('click', () => {
  loadDriveFiles(state.driveCurrentFolder);
});

document.getElementById('drive-go-root')?.addEventListener('click', () => {
  state.driveCurrentFolder = null;
  state.driveBreadcrumb = [{ id: null, name: 'Drive' }];
  renderDriveBreadcrumb();
  loadDriveFiles(null);
});
