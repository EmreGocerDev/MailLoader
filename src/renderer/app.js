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
      const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('theme-midnight');
      const textColor = isDark ? '#e0e0e0' : '#1f1f1f';
      const bgColor = isDark ? '#1a1a2e' : '#ffffff';
      const linkColor = isDark ? '#6db3f2' : '#1a73e8';
      doc.open();
      doc.write(`
        <html>
        <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: cid: blob:; style-src 'unsafe-inline' https:; font-src https: data:; connect-src https: http:;">
        <base target="_blank">
        <style>
          body { font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; line-height: 1.6; color: ${textColor}; background: ${bgColor}; margin: 0; padding: 0; }
          img { max-width: 100%; height: auto; display: inline-block; }
          a { color: ${linkColor}; cursor: pointer; }
          div, p, span, td, th, li, h1, h2, h3, h4, h5, h6, blockquote, pre { color: inherit !important; }
          table { border-color: ${isDark ? '#444' : '#ddd'} !important; }
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

// Compose overlay click - only close via X button, not outside click
// (removed outside-click-to-close to prevent accidental data loss)

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
  // Escape to close panels/compose or go back
  if (e.key === 'Escape') {
    if (document.getElementById('ai-chat-overlay').style.display !== 'none') {
      closeAiChat();
    } else if (document.getElementById('settings-panel-overlay').style.display !== 'none') {
      closeSettingsPanel();
    } else if (document.getElementById('github-panel-overlay').style.display !== 'none') {
      closeGithubPanel();
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
  glassOpacity: 0.8,
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
  document.documentElement.style.setProperty('--glass-opacity', themeSettings.glassOpacity || 0.8);

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
  document.getElementById('glass-opacity-slider').value = (themeSettings.glassOpacity || 0.8) * 100;
  document.getElementById('glass-opacity-value').textContent = Math.round((themeSettings.glassOpacity || 0.8) * 100) + '%';
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

// Glass opacity slider
document.getElementById('glass-opacity-slider').addEventListener('input', (e) => {
  const value = parseInt(e.target.value) / 100;
  themeSettings.glassOpacity = value;
  document.getElementById('glass-opacity-value').textContent = e.target.value + '%';
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

// ============ GitHub Panel ============

let githubState = {
  currentRepo: null,
  currentPath: '',
  currentBranch: '',
  currentTab: 'repos',
  breadcrumb: [{ path: '', name: 'Repolar' }],
  issueFilter: 'open',
  prFilter: 'open',
  user: null
};

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  'C#': '#178600', 'C++': '#f34b7d', C: '#555555', Go: '#00ADD8', Rust: '#dea584',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Vue: '#41b883', Svelte: '#ff3e00',
  Lua: '#000080', R: '#198CE7', Scala: '#c22d40', Perl: '#0298c3', Haskell: '#5e5086'
};

function openGithubPanel() {
  document.getElementById('github-panel-overlay').style.display = 'flex';
  checkGithubConnection();
}

function closeGithubPanel() {
  document.getElementById('github-panel-overlay').style.display = 'none';
}

document.getElementById('btn-github-tab').addEventListener('click', openGithubPanel);
document.getElementById('btn-github-close').addEventListener('click', closeGithubPanel);
document.getElementById('github-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'github-panel-overlay') closeGithubPanel();
});

// Tab switching
document.querySelectorAll('.gh-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.gh-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    githubState.currentTab = tab.dataset.tab;
    loadGithubTab();
  });
});

function loadGithubTab() {
  const repo = githubState.currentRepo;
  const branchSel = document.getElementById('gh-branch-select');
  const newBtn = document.getElementById('btn-gh-new');
  branchSel.style.display = 'none';
  newBtn.style.display = 'none';

  switch (githubState.currentTab) {
    case 'repos':
      newBtn.style.display = 'flex';
      newBtn.title = 'Yeni Repo';
      if (!repo) { loadGithubRepos(); }
      else { branchSel.style.display = 'inline-block'; loadGithubContents(githubState.currentPath); }
      break;
    case 'issues':
      if (!repo) { showGhNeedRepo('Issues'); return; }
      newBtn.style.display = 'flex';
      newBtn.title = 'Yeni Issue';
      loadGithubIssues();
      break;
    case 'pulls':
      if (!repo) { showGhNeedRepo('Pull Requests'); return; }
      loadGithubPulls();
      break;
    case 'commits':
      if (!repo) { showGhNeedRepo('Commits'); return; }
      branchSel.style.display = 'inline-block';
      loadGithubCommits();
      break;
    case 'branches':
      if (!repo) { showGhNeedRepo('Branches'); return; }
      newBtn.style.display = 'flex';
      newBtn.title = 'Yeni Branch';
      loadGithubBranches();
      break;
    case 'gists':
      newBtn.style.display = 'flex';
      newBtn.title = 'Yeni Gist';
      loadGithubGists();
      break;
    case 'starred':
      loadGithubStarred();
      break;
    case 'search':
      showGithubSearch();
      break;
  }
}

function showGhNeedRepo(label) {
  const el = document.getElementById('gh-content');
  el.innerHTML = `<div class="gh-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7"/></svg><p>${label} için önce bir repo seçin</p><button class="btn-primary btn-sm" onclick="document.querySelector('.gh-tab[data-tab=repos]').click()">Replara Git</button></div>`;
}

function showGhLoading(msg) {
  document.getElementById('gh-content').innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>${msg || 'Yükleniyor...'}</p></div>`;
}

function showGhError(msg) {
  document.getElementById('gh-content').innerHTML = `<div class="gh-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><p>${escapeHtml(msg)}</p></div>`;
}

// Connection
async function checkGithubConnection() {
  const connected = await window.mailAPI.githubIsConnected();
  document.getElementById('github-not-connected').style.display = connected ? 'none' : 'flex';
  document.getElementById('github-connected').style.display = connected ? 'flex' : 'none';
  if (connected) {
    githubState.currentRepo = null;
    githubState.currentPath = '';
    githubState.currentBranch = '';
    githubState.currentTab = 'repos';
    githubState.breadcrumb = [{ path: '', name: 'Repolar' }];
    document.querySelectorAll('.gh-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.gh-tab[data-tab="repos"]').classList.add('active');
    renderGithubBreadcrumb();
    // Load user info
    const userRes = await window.mailAPI.githubGetUser();
    if (userRes.success) {
      githubState.user = userRes.user;
      const hdr = document.getElementById('gh-header-user');
      hdr.style.display = 'flex';
      document.getElementById('gh-user-avatar').src = userRes.user.avatar_url;
      document.getElementById('gh-user-login').textContent = userRes.user.login;
    }
    loadGithubRepos();
  } else {
    document.getElementById('gh-header-user').style.display = 'none';
  }
}

document.getElementById('btn-github-connect').addEventListener('click', async () => {
  const tokenInput = document.getElementById('github-token-input');
  const token = tokenInput.value.trim();
  if (!token) { showToast('Token gerekli', 'error'); return; }
  const btn = document.getElementById('btn-github-connect');
  btn.disabled = true;
  btn.textContent = 'Bağlanıyor...';
  const result = await window.mailAPI.githubConnect(token);
  const repos = await window.mailAPI.githubListRepos();
  btn.disabled = false;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Bağlan`;
  if (repos.success) {
    tokenInput.value = '';
    showToast('GitHub bağlandı!', 'success');
    checkGithubConnection();
  } else {
    await window.mailAPI.githubDisconnect();
    showToast('Token geçersiz: ' + repos.error, 'error');
  }
});

document.getElementById('btn-github-disconnect-panel').addEventListener('click', async () => {
  await window.mailAPI.githubDisconnect();
  showToast('GitHub bağlantısı kesildi', 'info');
  checkGithubConnection();
});

// New button handler
document.getElementById('btn-gh-new').addEventListener('click', () => {
  switch (githubState.currentTab) {
    case 'repos': showCreateRepoModal(); break;
    case 'issues': showCreateIssueModal(); break;
    case 'branches': showCreateBranchModal(); break;
    case 'gists': showCreateGistModal(); break;
  }
});

// ---- REPOS TAB ----
async function loadGithubRepos() {
  showGhLoading('Repolar yükleniyor...');
  const result = await window.mailAPI.githubListRepos();
  if (!result.success) { showGhError(result.error); return; }
  const el = document.getElementById('gh-content');
  if (result.repos.length === 0) {
    el.innerHTML = '<div class="gh-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87"/></svg><p>Repo bulunamadı</p></div>';
    return;
  }
  el.innerHTML = '';
  for (const repo of result.repos) {
    const card = document.createElement('div');
    card.className = 'gh-repo-card';
    const langColor = LANG_COLORS[repo.language] || '#888';
    let badges = '';
    if (repo.private) badges += '<span class="gh-badge gh-badge-private">Özel</span>';
    if (repo.fork) badges += '<span class="gh-badge gh-badge-fork">Fork</span>';
    if (repo.archived) badges += '<span class="gh-badge gh-badge-archived">Arşiv</span>';
    card.innerHTML = `
      <div class="gh-repo-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77"/></svg></div>
      <div class="gh-repo-body">
        <div class="gh-repo-title"><span class="gh-repo-name">${escapeHtml(repo.name)}</span>${badges}</div>
        ${repo.description ? `<div class="gh-repo-desc">${escapeHtml(repo.description)}</div>` : ''}
        <div class="gh-repo-stats">
          ${repo.language ? `<span><span class="github-lang-dot" style="background:${langColor}"></span>${escapeHtml(repo.language)}</span>` : ''}
          <span>⭐ ${repo.stargazers_count || 0}</span>
          <span>🍴 ${repo.forks_count || 0}</span>
          <span>${formatDate(repo.updated_at)}</span>
        </div>
      </div>
      <div class="gh-repo-actions">
        <button class="gh-star-btn" title="Yıldız"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
        <button class="gh-fork-btn" title="Fork"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 01-2 2H8a2 2 0 01-2-2V9"/><line x1="12" y1="12" x2="12" y2="15"/></svg></button>
        <button class="gh-zip-btn" title="ZIP İndir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <button class="gh-open-btn" title="GitHub'da Aç"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
        <button class="gh-danger gh-del-btn" title="Sil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
      </div>
    `;
    // Click to browse
    card.querySelector('.gh-repo-body').addEventListener('click', () => enterRepo(repo));
    card.querySelector('.gh-repo-icon').addEventListener('click', () => enterRepo(repo));
    // Star
    const starBtn = card.querySelector('.gh-star-btn');
    window.mailAPI.githubIsStarred(repo.owner.login, repo.name).then(r => {
      if (r.starred) starBtn.classList.add('gh-starred');
    });
    starBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (starBtn.classList.contains('gh-starred')) {
        await window.mailAPI.githubUnstarRepo(repo.owner.login, repo.name);
        starBtn.classList.remove('gh-starred');
        showToast('Yıldız kaldırıldı', 'info');
      } else {
        await window.mailAPI.githubStarRepo(repo.owner.login, repo.name);
        starBtn.classList.add('gh-starred');
        showToast('Yıldız eklendi', 'success');
      }
    });
    // Fork
    card.querySelector('.gh-fork-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      showToast('Fork yapılıyor...', 'info');
      const r = await window.mailAPI.githubForkRepo(repo.owner.login, repo.name);
      if (r.success) showToast('Fork yapıldı: ' + r.repo.full_name, 'success');
      else showToast('Fork hatası: ' + r.error, 'error');
    });
    // ZIP
    card.querySelector('.gh-zip-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = await window.mailAPI.githubDownloadZip(repo.owner.login, repo.name, repo.default_branch);
      if (r.success) showToast('ZIP indirildi', 'success');
      else if (r.error !== 'İptal edildi') showToast('Hata: ' + r.error, 'error');
    });
    // Open in browser
    card.querySelector('.gh-open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.mailAPI.openExternal(repo.html_url);
    });
    // Delete
    card.querySelector('.gh-del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      showGhConfirmModal(`"${repo.name}" reposunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`, async () => {
        const r = await window.mailAPI.githubDeleteRepo(repo.owner.login, repo.name);
        if (r.success) { showToast('Repo silindi', 'success'); loadGithubRepos(); }
        else showToast('Silme hatası: ' + r.error, 'error');
      });
    });
    el.appendChild(card);
  }
}

function enterRepo(repo) {
  githubState.currentRepo = {
    owner: repo.owner.login, name: repo.name,
    full_name: repo.full_name, default_branch: repo.default_branch,
    html_url: repo.html_url
  };
  githubState.currentPath = '';
  githubState.currentBranch = repo.default_branch;
  githubState.breadcrumb = [
    { path: '', name: 'Repolar' },
    { path: '', name: repo.name }
  ];
  renderGithubBreadcrumb();
  loadBranchSelector();
  loadGithubContents('');
}

async function loadBranchSelector() {
  const sel = document.getElementById('gh-branch-select');
  sel.style.display = 'inline-block';
  sel.innerHTML = '<option>Yükleniyor...</option>';
  const repo = githubState.currentRepo;
  const res = await window.mailAPI.githubListBranches(repo.owner, repo.name);
  sel.innerHTML = '';
  if (res.success) {
    res.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      if (b.name === githubState.currentBranch) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}

document.getElementById('gh-branch-select').addEventListener('change', (e) => {
  githubState.currentBranch = e.target.value;
  if (githubState.currentTab === 'repos') {
    loadGithubContents(githubState.currentPath);
  } else if (githubState.currentTab === 'commits') {
    loadGithubCommits();
  }
});

async function loadGithubContents(pathStr) {
  showGhLoading('Dosyalar yükleniyor...');
  const repo = githubState.currentRepo;
  const result = await window.mailAPI.githubListContents(repo.owner, repo.name, pathStr, githubState.currentBranch);
  const el = document.getElementById('gh-content');

  if (!result.success) { showGhError(result.error); return; }
  if (result.files.length === 0) {
    el.innerHTML = '<div class="gh-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg><p>Bu klasör boş</p></div>';
    return;
  }

  const sorted = result.files.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  el.innerHTML = '';
  sorted.forEach(file => {
    const isDir = file.type === 'dir';
    const item = document.createElement('div');
    item.className = 'drive-file-item';
    item.innerHTML = `
      <div class="drive-file-icon">
        ${isDir
          ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" stroke-width="1"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
          : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
        }
      </div>
      <div class="drive-file-info">
        <span class="drive-file-name">${escapeHtml(file.name)}</span>
        <span class="drive-file-meta">${isDir ? 'Klasör' : formatSize(file.size || 0)}</span>
      </div>
      <div style="display:flex;gap:4px;">
        ${!isDir ? `<button class="drive-download-btn gh-preview-btn" title="Önizle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : ''}
        ${!isDir && file.download_url ? `<button class="drive-download-btn" title="İndir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
        ${!isDir ? `<button class="drive-download-btn gh-del-file-btn gh-danger" title="Sil"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>` : ''}
      </div>
    `;

    if (isDir) {
      item.addEventListener('click', () => {
        githubState.currentPath = file.path;
        githubState.breadcrumb.push({ path: file.path, name: file.name });
        renderGithubBreadcrumb();
        loadGithubContents(file.path);
      });
    }
    // Preview
    const previewBtn = item.querySelector('.gh-preview-btn');
    if (previewBtn) {
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showFilePreview(file);
      });
    }
    // Download
    const dlBtn = item.querySelector('.drive-download-btn:not(.gh-preview-btn):not(.gh-del-file-btn)');
    if (dlBtn && file.download_url) {
      dlBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const res = await window.mailAPI.githubDownloadFile(file.download_url, file.name);
        if (res.success) showToast('Dosya indirildi', 'success');
        else showToast('İndirme hatası: ' + res.error, 'error');
      });
    }
    // Delete file
    const delBtn = item.querySelector('.gh-del-file-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showGhConfirmModal(`"${file.name}" dosyasını silmek istediğinize emin misiniz?`, async () => {
          const r = await window.mailAPI.githubDeleteFile(
            githubState.currentRepo.owner, githubState.currentRepo.name,
            file.path, file.sha, null, githubState.currentBranch
          );
          if (r.success) { showToast('Dosya silindi', 'success'); loadGithubContents(githubState.currentPath); }
          else showToast('Silme hatası: ' + r.error, 'error');
        });
      });
    }
    el.appendChild(item);
  });
}

async function showFilePreview(file) {
  const repo = githubState.currentRepo;
  showGhLoading('Dosya yükleniyor...');
  const res = await window.mailAPI.githubGetFileContent(repo.owner, repo.name, file.path, githubState.currentBranch);
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }
  el.innerHTML = `
    <div class="gh-file-preview">
      <div class="gh-file-preview-header">
        <span class="gh-file-preview-name">${escapeHtml(file.name)}</span>
        <div class="gh-file-preview-actions">
          <button class="btn-secondary btn-sm" id="gh-edit-file-btn">✏️ Düzenle</button>
          ${file.download_url ? `<button class="btn-secondary btn-sm" id="gh-dl-preview-btn">⬇️ İndir</button>` : ''}
          <button class="btn-secondary btn-sm" id="gh-back-from-preview">← Geri</button>
        </div>
      </div>
      <div class="gh-code-block">${escapeHtml(res.content)}</div>
    </div>
  `;
  document.getElementById('gh-back-from-preview').addEventListener('click', () => {
    loadGithubContents(githubState.currentPath);
  });
  const dlBtn = document.getElementById('gh-dl-preview-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', async () => {
      const r = await window.mailAPI.githubDownloadFile(file.download_url, file.name);
      if (r.success) showToast('İndirildi', 'success');
    });
  }
  document.getElementById('gh-edit-file-btn').addEventListener('click', () => {
    showEditFileModal(file, res.content);
  });
}

function showEditFileModal(file, content) {
  openGhModal('Dosya Düzenle: ' + file.name, `
    <div class="form-group">
      <label>İçerik</label>
      <textarea id="gh-edit-content" style="min-height:200px;font-family:monospace;font-size:12px;">${escapeHtml(content)}</textarea>
    </div>
    <div class="form-group">
      <label>Commit Mesajı</label>
      <input id="gh-edit-msg" placeholder="Update ${file.name}">
    </div>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" onclick="closeGhModal()">İptal</button>
      <button class="btn-primary btn-sm" id="gh-save-edit">Kaydet</button>
    </div>
  `);
  document.getElementById('gh-save-edit').addEventListener('click', async () => {
    const newContent = document.getElementById('gh-edit-content').value;
    const msg = document.getElementById('gh-edit-msg').value || `Update ${file.name}`;
    const repo = githubState.currentRepo;
    const r = await window.mailAPI.githubUpdateFile(repo.owner, repo.name, file.path, newContent, file.sha, msg, githubState.currentBranch);
    closeGhModal();
    if (r.success) { showToast('Dosya güncellendi', 'success'); loadGithubContents(githubState.currentPath); }
    else showToast('Hata: ' + r.error, 'error');
  });
}

// ---- ISSUES TAB ----
async function loadGithubIssues() {
  showGhLoading('Issues yükleniyor...');
  const repo = githubState.currentRepo;
  const res = await window.mailAPI.githubListIssues(repo.owner, repo.name, githubState.issueFilter);
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }

  let html = `<div class="gh-filter-bar">
    <button class="gh-filter-btn ${githubState.issueFilter === 'open' ? 'active' : ''}" data-state="open">🟢 Açık</button>
    <button class="gh-filter-btn ${githubState.issueFilter === 'closed' ? 'active' : ''}" data-state="closed">🟣 Kapalı</button>
    <button class="gh-filter-btn ${githubState.issueFilter === 'all' ? 'active' : ''}" data-state="all">Tümü</button>
  </div>`;

  if (res.issues.length === 0) {
    html += '<div class="gh-empty"><p>Issue bulunamadı</p></div>';
  }
  el.innerHTML = html;

  el.querySelectorAll('.gh-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      githubState.issueFilter = btn.dataset.state;
      loadGithubIssues();
    });
  });

  res.issues.forEach(issue => {
    const card = document.createElement('div');
    card.className = 'gh-issue-card';
    const isOpen = issue.state === 'open';
    const labelsHtml = issue.labels.map(l => `<span class="gh-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44;">${escapeHtml(l.name)}</span>`).join('');
    card.innerHTML = `
      <div class="gh-issue-icon ${isOpen ? 'open' : 'closed'}">
        ${isOpen
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        }
      </div>
      <div class="gh-issue-body">
        <div class="gh-issue-title">${escapeHtml(issue.title)} <span style="color:var(--text-tertiary);font-weight:400;">#${issue.number}</span></div>
        <div class="gh-issue-meta">
          <span>${escapeHtml(issue.user.login)}</span>
          <span>${formatDate(issue.created_at)}</span>
          ${issue.comments > 0 ? `<span>💬 ${issue.comments}</span>` : ''}
        </div>
        ${labelsHtml ? `<div class="gh-issue-labels">${labelsHtml}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => showIssueDetail(issue));
    el.appendChild(card);
  });
}

async function showIssueDetail(issue) {
  const el = document.getElementById('gh-content');
  const repo = githubState.currentRepo;
  const isOpen = issue.state === 'open';
  let html = `<div class="gh-detail-view">
    <div class="gh-detail-header">
      <div style="flex:1;">
        <div class="gh-detail-title">${escapeHtml(issue.title)} <span class="gh-detail-number">#${issue.number}</span></div>
        <div class="gh-issue-meta" style="margin-top:4px;">
          <span class="gh-badge ${isOpen ? 'gh-badge-fork' : 'gh-badge-archived'}">${isOpen ? '🟢 Açık' : '🟣 Kapalı'}</span>
          <span>${escapeHtml(issue.user.login)} tarafından</span>
          <span>${formatDate(issue.created_at)}</span>
        </div>
      </div>
      <button class="btn-secondary btn-sm" id="gh-back-issues">← Issues</button>
    </div>
    ${issue.body ? `<div class="gh-detail-body">${escapeHtml(issue.body)}</div>` : ''}
    <div class="gh-detail-actions">
      <button class="btn-${isOpen ? 'secondary' : 'primary'} btn-sm" id="gh-toggle-issue">${isOpen ? '🔒 Kapat' : '🔓 Yeniden Aç'}</button>
    </div>
    <div class="gh-comments-section">
      <div class="gh-comments-title">💬 Yorumlar</div>
      <div id="gh-comments-list"><div class="loading-state"><div class="loading-spinner"></div></div></div>
      <div class="gh-comment-form">
        <textarea id="gh-comment-input" placeholder="Yorum yazın..."></textarea>
        <button class="btn-primary btn-sm" id="gh-send-comment">Gönder</button>
      </div>
    </div>
  </div>`;
  el.innerHTML = html;

  document.getElementById('gh-back-issues').addEventListener('click', () => loadGithubIssues());
  document.getElementById('gh-toggle-issue').addEventListener('click', async () => {
    const newState = isOpen ? 'closed' : 'open';
    const r = await window.mailAPI.githubUpdateIssue(repo.owner, repo.name, issue.number, { state: newState });
    if (r.success) {
      issue.state = newState;
      showToast(`Issue ${newState === 'closed' ? 'kapatıldı' : 'yeniden açıldı'}`, 'success');
      showIssueDetail(issue);
    } else showToast('Hata: ' + r.error, 'error');
  });
  document.getElementById('gh-send-comment').addEventListener('click', async () => {
    const body = document.getElementById('gh-comment-input').value.trim();
    if (!body) return;
    const r = await window.mailAPI.githubAddComment(repo.owner, repo.name, issue.number, body);
    if (r.success) { document.getElementById('gh-comment-input').value = ''; showToast('Yorum eklendi', 'success'); loadIssueComments(issue.number); }
    else showToast('Hata: ' + r.error, 'error');
  });
  loadIssueComments(issue.number);
}

async function loadIssueComments(issueNumber) {
  const repo = githubState.currentRepo;
  const listEl = document.getElementById('gh-comments-list');
  const res = await window.mailAPI.githubListComments(repo.owner, repo.name, issueNumber);
  if (!res.success) { listEl.innerHTML = '<p style="color:var(--text-tertiary);padding:8px;">Yorumlar yüklenemedi</p>'; return; }
  if (res.comments.length === 0) { listEl.innerHTML = '<p style="color:var(--text-tertiary);padding:8px;font-size:12px;">Henüz yorum yok</p>'; return; }
  listEl.innerHTML = '';
  res.comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'gh-comment';
    div.innerHTML = `
      <img class="gh-comment-avatar" src="${c.user.avatar_url}" alt="">
      <div class="gh-comment-body">
        <div class="gh-comment-header"><strong>${escapeHtml(c.user.login)}</strong> · ${formatDate(c.created_at)}</div>
        <div class="gh-comment-text">${escapeHtml(c.body)}</div>
      </div>
    `;
    listEl.appendChild(div);
  });
}

// ---- PULL REQUESTS TAB ----
async function loadGithubPulls() {
  showGhLoading('Pull Requests yükleniyor...');
  const repo = githubState.currentRepo;
  const res = await window.mailAPI.githubListPulls(repo.owner, repo.name, githubState.prFilter);
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }

  let html = `<div class="gh-filter-bar">
    <button class="gh-filter-btn ${githubState.prFilter === 'open' ? 'active' : ''}" data-state="open">🟢 Açık</button>
    <button class="gh-filter-btn ${githubState.prFilter === 'closed' ? 'active' : ''}" data-state="closed">🟣 Kapalı</button>
    <button class="gh-filter-btn ${githubState.prFilter === 'all' ? 'active' : ''}" data-state="all">Tümü</button>
  </div>`;

  if (res.pulls.length === 0) { html += '<div class="gh-empty"><p>Pull Request bulunamadı</p></div>'; }
  el.innerHTML = html;

  el.querySelectorAll('.gh-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      githubState.prFilter = btn.dataset.state;
      loadGithubPulls();
    });
  });

  res.pulls.forEach(pr => {
    const card = document.createElement('div');
    card.className = 'gh-issue-card';
    let iconClass = 'open';
    let icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>';
    if (pr.merged_at) { iconClass = 'merged'; }
    else if (pr.state === 'closed') { iconClass = 'closed'; }
    else if (pr.draft) { iconClass = 'draft'; }

    const labelsHtml = pr.labels.map(l => `<span class="gh-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44;">${escapeHtml(l.name)}</span>`).join('');
    card.innerHTML = `
      <div class="gh-issue-icon ${iconClass}">${icon}</div>
      <div class="gh-issue-body">
        <div class="gh-issue-title">${escapeHtml(pr.title)} <span style="color:var(--text-tertiary);font-weight:400;">#${pr.number}</span>${pr.draft ? '<span class="gh-badge gh-badge-fork" style="margin-left:6px;">Draft</span>' : ''}</div>
        <div class="gh-issue-meta">
          <span>${escapeHtml(pr.user.login)}</span>
          <span>${escapeHtml(pr.head.ref)} → ${escapeHtml(pr.base.ref)}</span>
          <span>${formatDate(pr.created_at)}</span>
        </div>
        ${labelsHtml ? `<div class="gh-issue-labels">${labelsHtml}</div>` : ''}
      </div>
    `;
    card.addEventListener('click', () => showPrDetail(pr));
    el.appendChild(card);
  });
}

async function showPrDetail(pr) {
  const el = document.getElementById('gh-content');
  const repo = githubState.currentRepo;
  let statusText = '🟢 Açık';
  if (pr.merged_at) statusText = '🟣 Merged';
  else if (pr.state === 'closed') statusText = '🔴 Kapalı';

  el.innerHTML = `<div class="gh-detail-view">
    <div class="gh-detail-header">
      <div style="flex:1;">
        <div class="gh-detail-title">${escapeHtml(pr.title)} <span class="gh-detail-number">#${pr.number}</span></div>
        <div class="gh-issue-meta" style="margin-top:4px;">
          <span class="gh-badge gh-badge-fork">${statusText}</span>
          <span>${escapeHtml(pr.user.login)}</span>
          <span>${escapeHtml(pr.head.ref)} → ${escapeHtml(pr.base.ref)}</span>
        </div>
      </div>
      <button class="btn-secondary btn-sm" id="gh-back-prs">← PR'ler</button>
    </div>
    ${pr.body ? `<div class="gh-detail-body">${escapeHtml(pr.body)}</div>` : ''}
    <div class="gh-comments-section">
      <div class="gh-comments-title">💬 Yorumlar</div>
      <div id="gh-comments-list"><div class="loading-state"><div class="loading-spinner"></div></div></div>
      <div class="gh-comment-form">
        <textarea id="gh-comment-input" placeholder="Yorum yazın..."></textarea>
        <button class="btn-primary btn-sm" id="gh-send-comment">Gönder</button>
      </div>
    </div>
  </div>`;

  document.getElementById('gh-back-prs').addEventListener('click', () => loadGithubPulls());
  document.getElementById('gh-send-comment').addEventListener('click', async () => {
    const body = document.getElementById('gh-comment-input').value.trim();
    if (!body) return;
    const r = await window.mailAPI.githubAddComment(repo.owner, repo.name, pr.number, body);
    if (r.success) { document.getElementById('gh-comment-input').value = ''; showToast('Yorum eklendi', 'success'); loadIssueComments(pr.number); }
    else showToast('Hata: ' + r.error, 'error');
  });
  loadIssueComments(pr.number);
}

// ---- COMMITS TAB ----
async function loadGithubCommits() {
  showGhLoading('Commits yükleniyor...');
  const repo = githubState.currentRepo;
  const res = await window.mailAPI.githubListCommits(repo.owner, repo.name, githubState.currentBranch);
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }
  if (res.commits.length === 0) { el.innerHTML = '<div class="gh-empty"><p>Commit bulunamadı</p></div>'; return; }
  el.innerHTML = '';
  res.commits.forEach(commit => {
    const item = document.createElement('div');
    item.className = 'gh-commit-item';
    const msgLines = commit.message.split('\n');
    const firstLine = msgLines[0];
    item.innerHTML = `
      ${commit.author.avatar_url ? `<img class="gh-commit-avatar" src="${commit.author.avatar_url}" alt="">` : '<div class="gh-commit-avatar" style="background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-size:11px;">?</div>'}
      <div class="gh-commit-body">
        <div class="gh-commit-msg">${escapeHtml(firstLine)}</div>
        <div class="gh-commit-info">${escapeHtml(commit.author.login)} · ${formatDate(commit.date)}</div>
      </div>
      <span class="gh-commit-sha">${commit.sha.substring(0, 7)}</span>
    `;
    el.appendChild(item);
  });
}

// ---- BRANCHES TAB ----
async function loadGithubBranches() {
  showGhLoading('Branches yükleniyor...');
  const repo = githubState.currentRepo;
  const res = await window.mailAPI.githubListBranches(repo.owner, repo.name);
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }
  if (res.branches.length === 0) { el.innerHTML = '<div class="gh-empty"><p>Branch bulunamadı</p></div>'; return; }
  el.innerHTML = '';
  res.branches.forEach(branch => {
    const item = document.createElement('div');
    item.className = 'gh-branch-item';
    const isDefault = branch.name === repo.default_branch;
    item.innerHTML = `
      <div class="gh-branch-name">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
        ${escapeHtml(branch.name)}
        ${isDefault ? '<span class="gh-branch-default">default</span>' : ''}
        ${branch.protected ? '<span class="gh-branch-protected">protected</span>' : ''}
      </div>
      <div class="gh-repo-actions">
        <button class="gh-use-branch" title="Bu branch'ı kullan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></button>
        ${!isDefault && !branch.protected ? `<button class="gh-danger gh-del-branch" title="Sil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>` : ''}
      </div>
    `;
    item.querySelector('.gh-use-branch').addEventListener('click', () => {
      githubState.currentBranch = branch.name;
      document.getElementById('gh-branch-select').value = branch.name;
      document.querySelector('.gh-tab[data-tab="repos"]').click();
      showToast(`Branch: ${branch.name}`, 'info');
    });
    const delBtn = item.querySelector('.gh-del-branch');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        showGhConfirmModal(`"${branch.name}" branch'ını silmek istediğinize emin misiniz?`, async () => {
          const r = await window.mailAPI.githubDeleteBranch(repo.owner, repo.name, branch.name);
          if (r.success) { showToast('Branch silindi', 'success'); loadGithubBranches(); }
          else showToast('Hata: ' + r.error, 'error');
        });
      });
    }
    el.appendChild(item);
  });
}

// ---- GISTS TAB ----
async function loadGithubGists() {
  showGhLoading('Gists yükleniyor...');
  const res = await window.mailAPI.githubListGists();
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }
  if (res.gists.length === 0) { el.innerHTML = '<div class="gh-empty"><p>Gist bulunamadı</p></div>'; return; }
  el.innerHTML = '';
  res.gists.forEach(gist => {
    const item = document.createElement('div');
    item.className = 'gh-gist-item';
    item.innerHTML = `
      <div class="gh-gist-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <div class="gh-gist-body">
        <div class="gh-gist-desc">${escapeHtml(gist.description)}</div>
        <div class="gh-gist-files">${gist.files.map(f => escapeHtml(f)).join(', ')} · ${gist.public ? 'Public' : 'Secret'} · ${formatDate(gist.created_at)}</div>
      </div>
      <div class="gh-repo-actions">
        <button class="gh-gist-open" title="Aç"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
        <button class="gh-danger gh-gist-del" title="Sil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
      </div>
    `;
    item.querySelector('.gh-gist-open').addEventListener('click', (e) => {
      e.stopPropagation();
      window.mailAPI.openExternal(gist.html_url);
    });
    item.querySelector('.gh-gist-del').addEventListener('click', (e) => {
      e.stopPropagation();
      showGhConfirmModal('Bu gist\'i silmek istediğinize emin misiniz?', async () => {
        const r = await window.mailAPI.githubDeleteGist(gist.id);
        if (r.success) { showToast('Gist silindi', 'success'); loadGithubGists(); }
        else showToast('Hata: ' + r.error, 'error');
      });
    });
    el.appendChild(item);
  });
}

// ---- STARRED TAB ----
async function loadGithubStarred() {
  showGhLoading('Starred repolar yükleniyor...');
  const res = await window.mailAPI.githubListStarred();
  const el = document.getElementById('gh-content');
  if (!res.success) { showGhError(res.error); return; }
  if (res.repos.length === 0) { el.innerHTML = '<div class="gh-empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><p>Starred repo bulunamadı</p></div>'; return; }
  el.innerHTML = '';
  res.repos.forEach(repo => {
    const card = document.createElement('div');
    card.className = 'gh-repo-card';
    const langColor = LANG_COLORS[repo.language] || '#888';
    card.innerHTML = `
      <div class="gh-repo-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
      <div class="gh-repo-body">
        <div class="gh-repo-title"><span class="gh-repo-name">${escapeHtml(repo.full_name)}</span></div>
        ${repo.description ? `<div class="gh-repo-desc">${escapeHtml(repo.description)}</div>` : ''}
        <div class="gh-repo-stats">
          ${repo.language ? `<span><span class="github-lang-dot" style="background:${langColor}"></span>${escapeHtml(repo.language)}</span>` : ''}
          <span>⭐ ${repo.stargazers_count || 0}</span>
        </div>
      </div>
      <div class="gh-repo-actions">
        <button class="gh-unstar-btn" title="Yıldızı Kaldır"><svg width="14" height="14" viewBox="0 0 24 24" fill="#f0c000" stroke="#f0c000" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
        <button class="gh-open-btn" title="GitHub'da Aç"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
      </div>
    `;
    card.querySelector('.gh-repo-body').addEventListener('click', () => {
      enterRepo(repo);
      document.querySelectorAll('.gh-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.gh-tab[data-tab="repos"]').classList.add('active');
      githubState.currentTab = 'repos';
    });
    card.querySelector('.gh-unstar-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.mailAPI.githubUnstarRepo(repo.owner.login, repo.name);
      showToast('Yıldız kaldırıldı', 'info');
      loadGithubStarred();
    });
    card.querySelector('.gh-open-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.mailAPI.openExternal(repo.html_url);
    });
    el.appendChild(card);
  });
}

// ---- SEARCH TAB ----
function showGithubSearch() {
  const el = document.getElementById('gh-content');
  el.innerHTML = `
    <div class="gh-search-bar">
      <input type="text" id="gh-search-input" placeholder="Repo ara... (ör: react, vue, electron)">
      <button class="btn-primary btn-sm" id="gh-search-btn">Ara</button>
    </div>
    <div id="gh-search-results"></div>
  `;
  const doSearch = async () => {
    const q = document.getElementById('gh-search-input').value.trim();
    if (!q) return;
    const results = document.getElementById('gh-search-results');
    results.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Aranıyor...</p></div>';
    const res = await window.mailAPI.githubSearchRepos(q);
    if (!res.success) { results.innerHTML = `<div class="gh-empty"><p>${escapeHtml(res.error)}</p></div>`; return; }
    if (res.repos.length === 0) { results.innerHTML = '<div class="gh-empty"><p>Sonuç bulunamadı</p></div>'; return; }
    results.innerHTML = '';
    res.repos.forEach(repo => {
      const card = document.createElement('div');
      card.className = 'gh-repo-card';
      const langColor = LANG_COLORS[repo.language] || '#888';
      card.innerHTML = `
        <div class="gh-repo-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7"/></svg></div>
        <div class="gh-repo-body">
          <div class="gh-repo-title"><span class="gh-repo-name">${escapeHtml(repo.full_name)}</span></div>
          ${repo.description ? `<div class="gh-repo-desc">${escapeHtml(repo.description)}</div>` : ''}
          <div class="gh-repo-stats">
            ${repo.language ? `<span><span class="github-lang-dot" style="background:${langColor}"></span>${escapeHtml(repo.language)}</span>` : ''}
            <span>⭐ ${repo.stargazers_count || 0}</span>
            <span>🍴 ${repo.forks_count || 0}</span>
          </div>
        </div>
        <div class="gh-repo-actions">
          <button class="gh-star-search" title="Star"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
          <button class="gh-fork-search" title="Fork"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 01-2 2H8a2 2 0 01-2-2V9"/><line x1="12" y1="12" x2="12" y2="15"/></svg></button>
          <button class="gh-open-search" title="Aç"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>
        </div>
      `;
      card.querySelector('.gh-star-search').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.mailAPI.githubStarRepo(repo.owner.login, repo.name);
        showToast('Starred!', 'success');
      });
      card.querySelector('.gh-fork-search').addEventListener('click', async (e) => {
        e.stopPropagation();
        const r = await window.mailAPI.githubForkRepo(repo.owner.login, repo.name);
        if (r.success) showToast('Fork yapıldı!', 'success');
        else showToast('Hata: ' + r.error, 'error');
      });
      card.querySelector('.gh-open-search').addEventListener('click', (e) => {
        e.stopPropagation();
        window.mailAPI.openExternal(repo.html_url);
      });
      results.appendChild(card);
    });
  };
  document.getElementById('gh-search-btn').addEventListener('click', doSearch);
  document.getElementById('gh-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

// ---- MODALS ----
function openGhModal(title, bodyHtml) {
  document.getElementById('gh-modal-title').textContent = title;
  document.getElementById('gh-modal-body').innerHTML = bodyHtml;
  document.getElementById('gh-modal-overlay').style.display = 'flex';
}
function closeGhModal() {
  document.getElementById('gh-modal-overlay').style.display = 'none';
}
document.getElementById('btn-gh-modal-close').addEventListener('click', closeGhModal);
document.getElementById('gh-modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'gh-modal-overlay') closeGhModal();
});

function showGhConfirmModal(message, onConfirm) {
  openGhModal('Onay', `
    <p style="margin-bottom:16px;">${message}</p>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" id="gh-confirm-cancel">İptal</button>
      <button class="btn-primary btn-sm" id="gh-confirm-ok" style="background:var(--danger);border-color:var(--danger);">Evet, Sil</button>
    </div>
  `);
  document.getElementById('gh-confirm-cancel').addEventListener('click', closeGhModal);
  document.getElementById('gh-confirm-ok').addEventListener('click', () => {
    closeGhModal();
    onConfirm();
  });
}

function showCreateRepoModal() {
  openGhModal('Yeni Repo Oluştur', `
    <div class="form-group"><label>Repo Adı</label><input id="gh-new-repo-name" placeholder="my-project"></div>
    <div class="form-group"><label>Açıklama</label><input id="gh-new-repo-desc" placeholder="İsteğe bağlı"></div>
    <div class="form-group"><label><input type="checkbox" id="gh-new-repo-private"> Özel repo</label></div>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" onclick="closeGhModal()">İptal</button>
      <button class="btn-primary btn-sm" id="gh-create-repo-btn">Oluştur</button>
    </div>
  `);
  document.getElementById('gh-create-repo-btn').addEventListener('click', async () => {
    const name = document.getElementById('gh-new-repo-name').value.trim();
    if (!name) { showToast('Repo adı gerekli', 'error'); return; }
    const desc = document.getElementById('gh-new-repo-desc').value.trim();
    const priv = document.getElementById('gh-new-repo-private').checked;
    const r = await window.mailAPI.githubCreateRepo(name, desc, priv);
    closeGhModal();
    if (r.success) { showToast('Repo oluşturuldu: ' + r.repo.name, 'success'); loadGithubRepos(); }
    else showToast('Hata: ' + r.error, 'error');
  });
}

function showCreateIssueModal() {
  const repo = githubState.currentRepo;
  openGhModal('Yeni Issue', `
    <div class="form-group"><label>Başlık</label><input id="gh-new-issue-title" placeholder="Bug: ..."></div>
    <div class="form-group"><label>Açıklama</label><textarea id="gh-new-issue-body" placeholder="Detaylı açıklama..."></textarea></div>
    <div class="form-group"><label>Etiketler (virgülle ayırın)</label><input id="gh-new-issue-labels" placeholder="bug, help wanted"></div>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" onclick="closeGhModal()">İptal</button>
      <button class="btn-primary btn-sm" id="gh-create-issue-btn">Oluştur</button>
    </div>
  `);
  document.getElementById('gh-create-issue-btn').addEventListener('click', async () => {
    const title = document.getElementById('gh-new-issue-title').value.trim();
    if (!title) { showToast('Başlık gerekli', 'error'); return; }
    const body = document.getElementById('gh-new-issue-body').value;
    const labelsStr = document.getElementById('gh-new-issue-labels').value;
    const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()).filter(Boolean) : [];
    const r = await window.mailAPI.githubCreateIssue(repo.owner, repo.name, title, body, labels);
    closeGhModal();
    if (r.success) { showToast('Issue oluşturuldu: #' + r.issue.number, 'success'); loadGithubIssues(); }
    else showToast('Hata: ' + r.error, 'error');
  });
}

function showCreateBranchModal() {
  const repo = githubState.currentRepo;
  openGhModal('Yeni Branch', `
    <div class="form-group"><label>Branch Adı</label><input id="gh-new-branch-name" placeholder="feature/yeni-ozellik"></div>
    <div class="form-group"><label>Kaynak Branch</label><select id="gh-new-branch-source"><option>Yükleniyor...</option></select></div>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" onclick="closeGhModal()">İptal</button>
      <button class="btn-primary btn-sm" id="gh-create-branch-btn">Oluştur</button>
    </div>
  `);
  // Load branches for source
  window.mailAPI.githubListBranches(repo.owner, repo.name).then(res => {
    const sel = document.getElementById('gh-new-branch-source');
    sel.innerHTML = '';
    if (res.success) {
      res.branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.sha;
        opt.textContent = b.name;
        if (b.name === repo.default_branch) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  });
  document.getElementById('gh-create-branch-btn').addEventListener('click', async () => {
    const name = document.getElementById('gh-new-branch-name').value.trim();
    if (!name) { showToast('Branch adı gerekli', 'error'); return; }
    const sha = document.getElementById('gh-new-branch-source').value;
    const r = await window.mailAPI.githubCreateBranch(repo.owner, repo.name, name, sha);
    closeGhModal();
    if (r.success) { showToast('Branch oluşturuldu', 'success'); loadGithubBranches(); }
    else showToast('Hata: ' + r.error, 'error');
  });
}

function showCreateGistModal() {
  openGhModal('Yeni Gist', `
    <div class="form-group"><label>Açıklama</label><input id="gh-new-gist-desc" placeholder="Gist açıklaması"></div>
    <div class="form-group"><label>Dosya Adı</label><input id="gh-new-gist-file" placeholder="snippet.js"></div>
    <div class="form-group"><label>İçerik</label><textarea id="gh-new-gist-content" style="min-height:120px;font-family:monospace;" placeholder="console.log('Hello');"></textarea></div>
    <div class="form-group"><label><input type="checkbox" id="gh-new-gist-public"> Public gist</label></div>
    <div class="gh-modal-footer">
      <button class="btn-secondary btn-sm" onclick="closeGhModal()">İptal</button>
      <button class="btn-primary btn-sm" id="gh-create-gist-btn">Oluştur</button>
    </div>
  `);
  document.getElementById('gh-create-gist-btn').addEventListener('click', async () => {
    const desc = document.getElementById('gh-new-gist-desc').value.trim();
    const file = document.getElementById('gh-new-gist-file').value.trim();
    const content = document.getElementById('gh-new-gist-content').value;
    if (!file || !content) { showToast('Dosya adı ve içerik gerekli', 'error'); return; }
    const isPublic = document.getElementById('gh-new-gist-public').checked;
    const r = await window.mailAPI.githubCreateGist(desc, file, content, isPublic);
    closeGhModal();
    if (r.success) { showToast('Gist oluşturuldu', 'success'); loadGithubGists(); }
    else showToast('Hata: ' + r.error, 'error');
  });
}

// ---- BREADCRUMB ----
function renderGithubBreadcrumb() {
  const container = document.getElementById('github-breadcrumb');
  container.innerHTML = '';
  githubState.breadcrumb.forEach((item, idx) => {
    const span = document.createElement('span');
    span.className = 'drive-breadcrumb-item';
    span.textContent = item.name;
    if (idx < githubState.breadcrumb.length - 1) {
      span.style.cursor = 'pointer';
      span.style.opacity = '0.7';
      span.addEventListener('click', () => {
        githubState.breadcrumb = githubState.breadcrumb.slice(0, idx + 1);
        if (idx === 0) {
          githubState.currentRepo = null;
          githubState.currentPath = '';
          document.getElementById('gh-branch-select').style.display = 'none';
          renderGithubBreadcrumb();
          loadGithubRepos();
        } else {
          githubState.currentPath = item.path;
          renderGithubBreadcrumb();
          loadGithubContents(item.path);
        }
      });
    }
    container.appendChild(span);
    if (idx < githubState.breadcrumb.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'drive-breadcrumb-sep';
      sep.textContent = ' / ';
      container.appendChild(sep);
    }
  });
}

document.getElementById('btn-github-refresh').addEventListener('click', () => {
  loadGithubTab();
});

document.getElementById('github-go-repos')?.addEventListener('click', () => {
  githubState.currentRepo = null;
  githubState.currentPath = '';
  githubState.breadcrumb = [{ path: '', name: 'Repolar' }];
  document.getElementById('gh-branch-select').style.display = 'none';
  renderGithubBreadcrumb();
  loadGithubRepos();
});

// ============ Notification Popup (WhatsApp-style) ============

let notifPopupTimeout = null;

function showNotificationPopup(data) {
  const popup = document.getElementById('notification-popup');
  const title = document.getElementById('notification-popup-title');
  const body = document.getElementById('notification-popup-body');

  title.textContent = `Yeni E-posta (${data.count})`;
  body.textContent = `${extractName(data.from)} — ${data.subject || '(Konu yok)'}`;

  popup.style.display = 'flex';
  popup.style.animation = 'notifSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)';

  // Auto-hide after 6 seconds
  clearTimeout(notifPopupTimeout);
  notifPopupTimeout = setTimeout(hideNotificationPopup, 6000);
}

function hideNotificationPopup() {
  const popup = document.getElementById('notification-popup');
  popup.style.animation = 'notifSlideOut 0.3s ease forwards';
  setTimeout(() => { popup.style.display = 'none'; }, 300);
  clearTimeout(notifPopupTimeout);
}

document.getElementById('notification-popup').addEventListener('click', (e) => {
  if (e.target.closest('.notification-popup-close')) {
    hideNotificationPopup();
    return;
  }
  // Click on popup opens inbox
  hideNotificationPopup();
  if (!appScreen.classList.contains('active')) return;
  state.currentFolder = 'INBOX';
  state.currentPage = 1;
  setActiveFolder('INBOX');
  document.getElementById('current-folder-title').textContent = 'Gelen Kutusu';
  document.getElementById('email-list-view').style.display = 'flex';
  document.getElementById('email-detail').style.display = 'none';
  loadEmails();
});

document.getElementById('notification-popup-close').addEventListener('click', (e) => {
  e.stopPropagation();
  hideNotificationPopup();
});

// Listen for notification from main process
window.mailAPI.onNotificationPopup((data) => {
  showNotificationPopup(data);
});

// ============ TCMB EVDS Panel ============

const EVDS_CATEGORY_ICONS = {
  1: '💱', 2: '💱', 3: '📊', 4: '💰', 5: '📈', 6: '🏠', 7: '🏗️', 8: '💳',
  9: '📉', 10: '🏦', 11: '📋', 12: '🌍', 13: '📦', 14: '👥', 15: '🏭',
  16: '🔧', 17: '🛒', 18: '⚡', 19: '🚗', 20: '🏢', 21: '📑', 22: '🔬',
  23: '📐', 24: '🎯', 25: '🏛️', 26: '🌐'
};

let evdsState = {
  view: 'categories', // categories | datagroups | series
  categories: [],
  currentCategory: null,
  currentGroup: null,
  selectedSeries: null
};

function openEvdsPanel() {
  document.getElementById('evds-panel-overlay').style.display = 'flex';
  checkEvdsConnection();
}

function closeEvdsPanel() {
  document.getElementById('evds-panel-overlay').style.display = 'none';
}

document.getElementById('btn-evds-tab').addEventListener('click', openEvdsPanel);
document.getElementById('btn-evds-close').addEventListener('click', closeEvdsPanel);
document.getElementById('evds-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'evds-panel-overlay') closeEvdsPanel();
});

async function checkEvdsConnection() {
  const connected = await window.mailAPI.evdsIsConnected();
  document.getElementById('evds-not-connected').style.display = connected ? 'none' : 'block';
  document.getElementById('evds-connected').style.display = connected ? 'flex' : 'none';
  if (connected) {
    evdsState.view = 'categories';
    loadEvdsCategories();
  }
}

document.getElementById('btn-evds-connect').addEventListener('click', async () => {
  const apiKey = document.getElementById('evds-api-key-input').value.trim();
  if (!apiKey) return;
  const btn = document.getElementById('btn-evds-connect');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;"></div> Bağlanıyor...';
  const result = await window.mailAPI.evdsConnect(apiKey);
  if (result.success) {
    document.getElementById('evds-api-key-input').value = '';
    checkEvdsConnection();
  } else {
    alert('Bağlantı hatası: ' + result.error);
  }
  btn.disabled = false;
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Bağlan';
});

document.getElementById('btn-evds-disconnect-panel').addEventListener('click', async () => {
  await window.mailAPI.evdsDisconnect();
  evdsState = { view: 'categories', categories: [], currentCategory: null, currentGroup: null, selectedSeries: null };
  checkEvdsConnection();
});

document.getElementById('btn-evds-refresh').addEventListener('click', () => {
  if (evdsState.view === 'categories') loadEvdsCategories();
  else if (evdsState.view === 'datagroups') loadEvdsDatagroups(evdsState.currentCategory);
  else if (evdsState.view === 'series') loadEvdsSeriesList(evdsState.currentGroup);
});

document.getElementById('evds-go-categories').addEventListener('click', () => {
  evdsState.view = 'categories';
  evdsState.currentCategory = null;
  evdsState.currentGroup = null;
  evdsState.selectedSeries = null;
  document.getElementById('evds-data-viewer').style.display = 'none';
  updateEvdsBreadcrumb();
  loadEvdsCategories();
});

function updateEvdsBreadcrumb() {
  const bc = document.getElementById('evds-breadcrumb');
  let html = '<span class="evds-bc-item evds-bc-root" id="evds-go-categories">Kategoriler</span>';
  if (evdsState.currentCategory) {
    html += '<span class="evds-bc-sep">›</span>';
    if (evdsState.currentGroup) {
      html += `<span class="evds-bc-item" data-cat-id="${evdsState.currentCategory.id}">${evdsState.currentCategory.titleTr}</span>`;
      html += '<span class="evds-bc-sep">›</span>';
      html += `<span class="evds-bc-item evds-bc-current">${evdsState.currentGroup.nameTr}</span>`;
    } else {
      html += `<span class="evds-bc-item evds-bc-current">${evdsState.currentCategory.titleTr}</span>`;
    }
  }
  bc.innerHTML = html;

  // Re-bind breadcrumb click events
  const catRoot = bc.querySelector('#evds-go-categories, .evds-bc-root');
  if (catRoot) {
    catRoot.addEventListener('click', () => {
      evdsState.view = 'categories';
      evdsState.currentCategory = null;
      evdsState.currentGroup = null;
      evdsState.selectedSeries = null;
      document.getElementById('evds-data-viewer').style.display = 'none';
      updateEvdsBreadcrumb();
      loadEvdsCategories();
    });
  }
  const catLink = bc.querySelector('[data-cat-id]');
  if (catLink) {
    catLink.addEventListener('click', () => {
      evdsState.view = 'datagroups';
      evdsState.currentGroup = null;
      evdsState.selectedSeries = null;
      document.getElementById('evds-data-viewer').style.display = 'none';
      updateEvdsBreadcrumb();
      loadEvdsDatagroups(evdsState.currentCategory);
    });
  }
}

async function loadEvdsCategories() {
  const content = document.getElementById('evds-content');
  content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Kategoriler yükleniyor...</p></div>';
  updateEvdsBreadcrumb();

  const result = await window.mailAPI.evdsGetCategories();
  if (!result.success) {
    content.innerHTML = `<div class="evds-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  evdsState.categories = result.categories;

  if (result.categories.length === 0) {
    content.innerHTML = '<div class="evds-empty"><p>Kategori bulunamadı.</p></div>';
    return;
  }

  content.innerHTML = '<div class="evds-cat-grid">' + result.categories.map(cat => `
    <div class="evds-cat-card" data-cat-id="${cat.id}">
      <span class="evds-cat-card-id">${EVDS_CATEGORY_ICONS[cat.id] || '📊'} Kategori ${cat.id}</span>
      <div class="evds-cat-card-title">${escapeHtml(cat.titleTr)}</div>
      <div class="evds-cat-card-title-eng">${escapeHtml(cat.titleEng || '')}</div>
    </div>
  `).join('') + '</div>';

  content.querySelectorAll('.evds-cat-card').forEach(card => {
    card.addEventListener('click', () => {
      const catId = card.dataset.catId;
      const cat = result.categories.find(c => String(c.id) === catId);
      evdsState.currentCategory = cat;
      evdsState.view = 'datagroups';
      loadEvdsDatagroups(cat);
    });
  });
}

async function loadEvdsDatagroups(category) {
  const content = document.getElementById('evds-content');
  content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Veri grupları yükleniyor...</p></div>';
  updateEvdsBreadcrumb();

  const result = await window.mailAPI.evdsGetDatagroups(category.id);
  if (!result.success) {
    content.innerHTML = `<div class="evds-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  if (result.groups.length === 0) {
    content.innerHTML = '<div class="evds-empty"><p>Bu kategoride veri grubu bulunamadı.</p></div>';
    return;
  }

  content.innerHTML = '<div class="evds-group-list">' + result.groups.map(g => `
    <div class="evds-group-item" data-code="${escapeHtml(g.code)}">
      <div class="evds-group-left">
        <div class="evds-group-name">${escapeHtml(g.nameTr)}</div>
        <div class="evds-group-code">${escapeHtml(g.code)}</div>
      </div>
      <div class="evds-group-meta">
        <span>📅 ${g.frequency || '-'}</span>
        <span>${g.startDate || ''} → ${g.endDate || ''}</span>
      </div>
    </div>
  `).join('') + '</div>';

  content.querySelectorAll('.evds-group-item').forEach(item => {
    item.addEventListener('click', () => {
      const code = item.dataset.code;
      const group = result.groups.find(g => g.code === code);
      evdsState.currentGroup = group;
      evdsState.view = 'series';
      loadEvdsSeriesList(group);
    });
  });
}

async function loadEvdsSeriesList(group) {
  const content = document.getElementById('evds-content');
  content.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Seriler yükleniyor...</p></div>';
  updateEvdsBreadcrumb();

  const result = await window.mailAPI.evdsGetSeriesList(group.code);
  if (!result.success) {
    content.innerHTML = `<div class="evds-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  if (result.series.length === 0) {
    content.innerHTML = '<div class="evds-empty"><p>Bu grupta seri bulunamadı.</p></div>';
    return;
  }

  content.innerHTML = '<div class="evds-series-list">' + result.series.map(s => `
    <div class="evds-series-item" data-code="${escapeHtml(s.code)}">
      <div class="evds-series-name">${escapeHtml(s.nameTr)}</div>
      <div class="evds-series-code">${escapeHtml(s.code)}</div>
      <div class="evds-series-info">
        <span>📅 ${s.frequency || '-'}</span>
        <span>📆 ${s.startDate || ''} → ${s.endDate || ''}</span>
        <span>📊 ${s.aggregation || '-'}</span>
      </div>
    </div>
  `).join('') + '</div>';

  // Show data viewer
  document.getElementById('evds-data-viewer').style.display = 'block';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('evds-end-date').value = today;

  content.querySelectorAll('.evds-series-item').forEach(item => {
    item.addEventListener('click', () => {
      content.querySelectorAll('.evds-series-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      evdsState.selectedSeries = result.series.find(s => s.code === item.dataset.code);
    });
  });

  // Auto-select first series
  if (result.series.length > 0) {
    content.querySelector('.evds-series-item').classList.add('selected');
    evdsState.selectedSeries = result.series[0];
  }
}

document.getElementById('btn-evds-fetch-data').addEventListener('click', async () => {
  if (!evdsState.selectedSeries) {
    alert('Lütfen önce bir seri seçin.');
    return;
  }

  const startEl = document.getElementById('evds-start-date');
  const endEl = document.getElementById('evds-end-date');
  const freqEl = document.getElementById('evds-frequency');
  const wrap = document.getElementById('evds-data-table-wrap');

  // Convert YYYY-MM-DD to DD-MM-YYYY
  const startDate = startEl.value ? startEl.value.split('-').reverse().join('-') : '01-01-2020';
  const endDate = endEl.value ? endEl.value.split('-').reverse().join('-') : '';
  const frequency = freqEl.value || null;

  wrap.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Veri getiriliyor...</p></div>';

  const result = await window.mailAPI.evdsGetSeriesData(
    evdsState.selectedSeries.code,
    startDate,
    endDate,
    frequency
  );

  if (!result.success) {
    wrap.innerHTML = `<div class="evds-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  if (!result.data || result.data.length === 0) {
    wrap.innerHTML = '<div class="evds-empty"><p>Bu tarih aralığında veri bulunamadı.</p></div>';
    return;
  }

  // Build table from data
  const items = result.data;
  const allKeys = Object.keys(items[0]).filter(k => k !== 'UNIXTIME');
  const dateKey = allKeys.find(k => k === 'Tarih' || k === 'YEARWEEK') || allKeys[0];
  const dataKeys = allKeys.filter(k => k !== dateKey);

  let html = `<div class="evds-data-count">${items.length} kayıt gösteriliyor</div>`;
  html += '<table class="evds-data-table"><thead><tr>';
  html += `<th>Tarih</th>`;
  dataKeys.forEach(k => {
    html += `<th>${escapeHtml(k)}</th>`;
  });
  html += '</tr></thead><tbody>';

  items.forEach(row => {
    html += '<tr>';
    html += `<td>${escapeHtml(String(row[dateKey] || ''))}</td>`;
    dataKeys.forEach(k => {
      const val = row[k];
      if (val === null || val === undefined || val === '') {
        html += '<td>-</td>';
      } else {
        const num = parseFloat(val);
        const cls = !isNaN(num) && num < 0 ? 'evds-val-negative' : (!isNaN(num) && num > 0 ? 'evds-val-positive' : '');
        const display = !isNaN(num) ? num.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : escapeHtml(String(val));
        html += `<td class="${cls}">${display}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
});

// ============ Twelve Data Panel ============

let tdState = {
  activeTab: 'search',
  watchlist: JSON.parse(localStorage.getItem('td_watchlist') || '[]'),
  currentSymbol: null,
  searchDebounce: null
};

function openTdPanel() {
  document.getElementById('td-panel-overlay').style.display = 'flex';
  checkTdConnection();
}

function closeTdPanel() {
  document.getElementById('td-panel-overlay').style.display = 'none';
}

document.getElementById('btn-td-tab').addEventListener('click', openTdPanel);
document.getElementById('btn-td-close').addEventListener('click', closeTdPanel);
document.getElementById('td-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'td-panel-overlay') closeTdPanel();
});

async function checkTdConnection() {
  const connected = await window.mailAPI.tdIsConnected();
  document.getElementById('td-not-connected').style.display = connected ? 'none' : 'block';
  document.getElementById('td-connected').style.display = connected ? 'flex' : 'none';
  document.getElementById('td-quote-detail').style.display = 'none';
  if (connected) {
    switchTdTab('search');
    loadTdUsage();
  }
}

async function loadTdUsage() {
  try {
    const result = await window.mailAPI.tdGetUsage();
    if (result.success && result.usage) {
      const badge = document.getElementById('td-usage-badge');
      const used = result.usage.current_usage || 0;
      const limit = result.usage.plan_limit || 0;
      badge.textContent = `${used}/${limit} kredi`;
      badge.style.display = 'inline-block';
    }
  } catch (e) { /* ignore */ }
}

document.getElementById('btn-td-connect').addEventListener('click', async () => {
  const apiKey = document.getElementById('td-api-key-input').value.trim();
  if (!apiKey) return;
  const btn = document.getElementById('btn-td-connect');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;"></div> Bağlanıyor...';
  const result = await window.mailAPI.tdConnect(apiKey);
  if (result.success) {
    document.getElementById('td-api-key-input').value = '';
    checkTdConnection();
  } else {
    alert('Bağlantı hatası: ' + result.error);
  }
  btn.disabled = false;
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Bağlan';
});

document.getElementById('btn-td-disconnect-panel').addEventListener('click', async () => {
  await window.mailAPI.tdDisconnect();
  document.getElementById('td-usage-badge').style.display = 'none';
  checkTdConnection();
});

// Tab switching
document.querySelectorAll('.td-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchTdTab(tab.dataset.tab);
  });
});

function switchTdTab(tabName) {
  tdState.activeTab = tabName;
  document.querySelectorAll('.td-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.td-tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById(`td-tab-${tabName}`);
  if (content) content.classList.add('active');
  document.getElementById('td-quote-detail').style.display = 'none';

  if (tabName === 'forex') loadTdForex();
  else if (tabName === 'crypto') loadTdCrypto();
  else if (tabName === 'watchlist') renderTdWatchlist();
}

// Refresh button
document.getElementById('btn-td-refresh').addEventListener('click', () => {
  switchTdTab(tdState.activeTab);
});

// ---- Search ----
document.getElementById('td-search-input').addEventListener('input', (e) => {
  clearTimeout(tdState.searchDebounce);
  const query = e.target.value.trim();
  if (query.length < 2) return;
  tdState.searchDebounce = setTimeout(() => tdSearchSymbols(query), 400);
});

document.getElementById('btn-td-search').addEventListener('click', () => {
  const query = document.getElementById('td-search-input').value.trim();
  if (query.length >= 1) tdSearchSymbols(query);
});

document.getElementById('td-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query.length >= 1) tdSearchSymbols(query);
  }
});

async function tdSearchSymbols(query) {
  const container = document.getElementById('td-search-results');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Aranıyor...</p></div>';
  const result = await window.mailAPI.tdSearchSymbol(query);
  if (!result.success) {
    container.innerHTML = `<div class="td-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.symbols || result.symbols.length === 0) {
    container.innerHTML = '<div class="td-empty"><p>Sonuç bulunamadı.</p></div>';
    return;
  }
  renderTdSymbolList(container, result.symbols);
}

function getSymbolIconClass(type) {
  if (!type) return '';
  const t = type.toLowerCase();
  if (t.includes('stock') || t.includes('equity') || t.includes('common')) return 'stock';
  if (t.includes('forex') || t.includes('currency')) return 'forex';
  if (t.includes('crypto') || t.includes('digital')) return 'crypto';
  return '';
}

function getSymbolIconLetter(symbol) {
  if (!symbol) return '?';
  return symbol.charAt(0).toUpperCase();
}

function renderTdSymbolList(container, symbols) {
  container.innerHTML = symbols.map(s => {
    const inWatchlist = tdState.watchlist.some(w => w.symbol === s.symbol);
    const iconClass = getSymbolIconClass(s.type);
    return `<div class="td-symbol-item" data-symbol="${escapeHtml(s.symbol)}">
      <div class="td-symbol-icon ${iconClass}">${getSymbolIconLetter(s.symbol)}</div>
      <div class="td-symbol-info">
        <div class="td-symbol-name">${escapeHtml(s.name || s.symbol)}</div>
        <div class="td-symbol-meta">
          <span>${escapeHtml(s.type || '')}</span>
          <span>${escapeHtml(s.exchange || '')}</span>
          <span>${escapeHtml(s.country || '')}</span>
        </div>
      </div>
      <div class="td-symbol-ticker">${escapeHtml(s.symbol)}</div>
      <div class="td-symbol-actions">
        <button class="td-btn-watchlist ${inWatchlist ? 'in-watchlist' : ''}" data-symbol="${escapeHtml(s.symbol)}" data-name="${escapeHtml(s.name || s.symbol)}" data-type="${escapeHtml(s.type || '')}" title="${inWatchlist ? 'Takipten Çıkar' : 'Takip Et'}">⭐</button>
      </div>
    </div>`;
  }).join('');

  // Click to view quote
  container.querySelectorAll('.td-symbol-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.td-symbol-actions')) return;
      showTdQuote(item.dataset.symbol);
    });
  });

  // Watchlist toggle
  container.querySelectorAll('.td-btn-watchlist').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTdWatchlist(btn.dataset.symbol, btn.dataset.name, btn.dataset.type);
      btn.classList.toggle('in-watchlist');
    });
  });
}

// ---- Stocks ----
document.getElementById('btn-td-load-stocks').addEventListener('click', async () => {
  const exchange = document.getElementById('td-stocks-exchange').value;
  const container = document.getElementById('td-stocks-list');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Hisseler yükleniyor...</p></div>';
  const result = await window.mailAPI.tdGetStocks(exchange || undefined);
  if (!result.success) {
    container.innerHTML = `<div class="td-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.stocks || result.stocks.length === 0) {
    container.innerHTML = '<div class="td-empty"><p>Hisse bulunamadı.</p></div>';
    return;
  }
  renderTdSymbolList(container, result.stocks.map(s => ({
    symbol: s.symbol, name: s.name, type: 'Stock',
    exchange: s.exchange, country: s.country, currency: s.currency
  })));
});

// ---- Forex ----
async function loadTdForex() {
  const container = document.getElementById('td-forex-list');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Pariteler yükleniyor...</p></div>';
  const result = await window.mailAPI.tdGetForexPairs();
  if (!result.success) {
    container.innerHTML = `<div class="td-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.pairs || result.pairs.length === 0) {
    container.innerHTML = '<div class="td-empty"><p>Forex pariteleri bulunamadı.</p></div>';
    return;
  }
  renderTdSymbolList(container, result.pairs.map(p => ({
    symbol: p.symbol, name: `${p.base} / ${p.quote}`, type: 'Forex',
    exchange: p.group || '', country: ''
  })));
}

// ---- Crypto ----
async function loadTdCrypto() {
  const container = document.getElementById('td-crypto-list');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Kripto paralar yükleniyor...</p></div>';
  const result = await window.mailAPI.tdGetCrypto();
  if (!result.success) {
    container.innerHTML = `<div class="td-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.cryptos || result.cryptos.length === 0) {
    container.innerHTML = '<div class="td-empty"><p>Kripto para bulunamadı.</p></div>';
    return;
  }
  renderTdSymbolList(container, result.cryptos.map(c => ({
    symbol: c.symbol, name: `${c.base} / ${c.quote}`, type: 'Crypto',
    exchange: c.exchange || '', country: ''
  })));
}

// ---- Watchlist ----
function toggleTdWatchlist(symbol, name, type) {
  const idx = tdState.watchlist.findIndex(w => w.symbol === symbol);
  if (idx >= 0) {
    tdState.watchlist.splice(idx, 1);
  } else {
    tdState.watchlist.push({ symbol, name, type });
  }
  localStorage.setItem('td_watchlist', JSON.stringify(tdState.watchlist));
}

async function renderTdWatchlist() {
  const container = document.getElementById('td-watchlist-content');
  if (tdState.watchlist.length === 0) {
    container.innerHTML = '<div class="td-hint">Takip listesi boş. Sembol arayıp ⭐ ile ekleyin.</div>';
    return;
  }
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fiyatlar alınıyor...</p></div>';

  // Batch price request for all watchlist symbols (minimum API usage!)
  const symbols = tdState.watchlist.map(w => w.symbol);
  const result = await window.mailAPI.tdGetPrice(symbols);
  
  let priceMap = {};
  if (result.success && result.prices) {
    // Single symbol returns {price: "..."}, multiple returns {SYMBOL: {price: "..."}}
    if (symbols.length === 1) {
      priceMap[symbols[0]] = result.prices.price || '-';
    } else {
      for (const sym of symbols) {
        priceMap[sym] = result.prices[sym]?.price || '-';
      }
    }
  }

  container.innerHTML = tdState.watchlist.map(w => {
    const price = priceMap[w.symbol] || '-';
    const iconClass = getSymbolIconClass(w.type);
    return `<div class="td-symbol-item" data-symbol="${escapeHtml(w.symbol)}">
      <div class="td-symbol-icon ${iconClass}">${getSymbolIconLetter(w.symbol)}</div>
      <div class="td-symbol-info">
        <div class="td-symbol-name">${escapeHtml(w.name || w.symbol)}</div>
        <div class="td-symbol-meta"><span>${escapeHtml(w.type || '')}</span></div>
      </div>
      <div class="td-symbol-ticker">${escapeHtml(w.symbol)}</div>
      <div class="td-symbol-price">${price !== '-' ? parseFloat(price).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-'}</div>
      <div class="td-symbol-actions">
        <button class="td-btn-remove-watchlist" data-symbol="${escapeHtml(w.symbol)}" title="Takipten Çıkar">✕</button>
      </div>
    </div>`;
  }).join('');

  // Click to view quote
  container.querySelectorAll('.td-symbol-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.td-symbol-actions')) return;
      showTdQuote(item.dataset.symbol);
    });
  });

  // Remove from watchlist
  container.querySelectorAll('.td-btn-remove-watchlist').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTdWatchlist(btn.dataset.symbol, '', '');
      renderTdWatchlist();
    });
  });
}

// ---- Quote Detail ----
document.getElementById('btn-td-back-to-list').addEventListener('click', () => {
  document.getElementById('td-quote-detail').style.display = 'none';
  document.querySelectorAll('.td-tab-content').forEach(c => {
    if (c.id === `td-tab-${tdState.activeTab}`) c.classList.add('active');
  });
});

document.getElementById('btn-td-toggle-watchlist').addEventListener('click', () => {
  if (!tdState.currentSymbol) return;
  toggleTdWatchlist(tdState.currentSymbol, '', '');
  const btn = document.getElementById('btn-td-toggle-watchlist');
  const inWL = tdState.watchlist.some(w => w.symbol === tdState.currentSymbol);
  btn.title = inWL ? 'Takipten Çıkar' : 'Takip Et';
});

async function showTdQuote(symbol) {
  tdState.currentSymbol = symbol;
  // Hide all tab contents, show quote detail
  document.querySelectorAll('.td-tab-content').forEach(c => c.classList.remove('active'));
  const detail = document.getElementById('td-quote-detail');
  detail.style.display = 'flex';

  document.getElementById('td-quote-title').textContent = symbol;
  document.getElementById('td-quote-body').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Yükleniyor...</p></div>';
  document.getElementById('td-ts-table-wrap').innerHTML = '<p class="td-hint">Periyot ve adet seçip "Veri Getir" butonuna tıklayın.</p>';

  // Update watchlist button
  const inWL = tdState.watchlist.some(w => w.symbol === symbol);
  document.getElementById('btn-td-toggle-watchlist').title = inWL ? 'Takipten Çıkar' : 'Takip Et';

  const result = await window.mailAPI.tdGetQuote(symbol);
  const body = document.getElementById('td-quote-body');

  if (!result.success) {
    body.innerHTML = `<div class="td-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  const q = result.quote;
  const price = parseFloat(q.close || q.price || 0);
  const change = parseFloat(q.change || 0);
  const changePct = parseFloat(q.percent_change || 0);
  const changeClass = change >= 0 ? 'positive' : 'negative';
  const changeSign = change >= 0 ? '+' : '';

  const cards = [
    { label: 'Fiyat', value: price.toLocaleString('tr-TR', {maximumFractionDigits: 4}), cls: 'big' },
    { label: 'Değişim', value: `${changeSign}${change.toLocaleString('tr-TR', {maximumFractionDigits: 4})} (${changeSign}${changePct.toFixed(2)}%)`, cls: changeClass },
    { label: 'Açılış', value: q.open ? parseFloat(q.open).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: 'Yüksek', value: q.high ? parseFloat(q.high).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: 'Düşük', value: q.low ? parseFloat(q.low).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: 'Önceki Kapanış', value: q.previous_close ? parseFloat(q.previous_close).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: 'Hacim', value: q.volume ? parseInt(q.volume).toLocaleString('tr-TR') : '-' },
    { label: 'Ortalama Hacim', value: q.average_volume ? parseInt(q.average_volume).toLocaleString('tr-TR') : '-' },
    { label: '52H Yüksek', value: q.fifty_two_week?.high ? parseFloat(q.fifty_two_week.high).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: '52H Düşük', value: q.fifty_two_week?.low ? parseFloat(q.fifty_two_week.low).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-' },
    { label: 'Borsa', value: q.exchange || '-' },
    { label: 'Para Birimi', value: q.currency || '-' }
  ];

  document.getElementById('td-quote-title').textContent = `${q.symbol || symbol} — ${q.name || ''}`;

  body.innerHTML = cards.map(c => `
    <div class="td-quote-card">
      <div class="td-quote-card-label">${c.label}</div>
      <div class="td-quote-card-value ${c.cls || ''}">${c.value}</div>
    </div>
  `).join('');

  loadTdUsage();
}

// ---- Time Series Data ----
document.getElementById('btn-td-fetch-ts').addEventListener('click', async () => {
  if (!tdState.currentSymbol) return;

  const interval = document.getElementById('td-ts-interval').value;
  const outputsize = document.getElementById('td-ts-outputsize').value;
  const indicator = document.getElementById('td-ts-indicator').value;
  const wrap = document.getElementById('td-ts-table-wrap');

  wrap.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Veri getiriliyor...</p></div>';

  // Fetch time series
  const tsResult = await window.mailAPI.tdGetTimeSeries(tdState.currentSymbol, interval, parseInt(outputsize));

  if (!tsResult.success) {
    wrap.innerHTML = `<div class="td-empty"><p>Hata: ${tsResult.error}</p></div>`;
    return;
  }

  if (!tsResult.values || tsResult.values.length === 0) {
    wrap.innerHTML = '<div class="td-empty"><p>Veri bulunamadı.</p></div>';
    return;
  }

  // Optionally fetch indicator
  let indicatorData = null;
  let indicatorKeys = [];
  if (indicator) {
    const indResult = await window.mailAPI.tdGetIndicator(indicator, tdState.currentSymbol, interval, { outputsize: parseInt(outputsize) });
    if (indResult.success && indResult.values) {
      indicatorData = {};
      indResult.values.forEach(v => { indicatorData[v.datetime] = v; });
      if (indResult.values.length > 0) {
        indicatorKeys = Object.keys(indResult.values[0]).filter(k => k !== 'datetime');
      }
    }
  }

  // Build table
  const values = tsResult.values;
  let html = `<div class="td-data-count">${values.length} kayıt${indicator ? ' + ' + indicator.toUpperCase() : ''}</div>`;
  html += '<table class="td-ts-table"><thead><tr>';
  html += '<th>Tarih</th><th>Açılış</th><th>Yüksek</th><th>Düşük</th><th>Kapanış</th><th>Hacim</th>';
  indicatorKeys.forEach(k => { html += `<th>${escapeHtml(k.toUpperCase())}</th>`; });
  html += '</tr></thead><tbody>';

  values.forEach(v => {
    const close = parseFloat(v.close || 0);
    const open = parseFloat(v.open || 0);
    const cls = close >= open ? 'td-val-positive' : 'td-val-negative';
    html += '<tr>';
    html += `<td>${escapeHtml(v.datetime || '')}</td>`;
    html += `<td>${parseFloat(v.open || 0).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</td>`;
    html += `<td>${parseFloat(v.high || 0).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</td>`;
    html += `<td>${parseFloat(v.low || 0).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</td>`;
    html += `<td class="${cls}">${close.toLocaleString('tr-TR', {maximumFractionDigits: 4})}</td>`;
    html += `<td>${v.volume ? parseInt(v.volume).toLocaleString('tr-TR') : '-'}</td>`;
    if (indicatorData) {
      const indRow = indicatorData[v.datetime];
      indicatorKeys.forEach(k => {
        const val = indRow ? indRow[k] : null;
        if (val !== null && val !== undefined && val !== '') {
          html += `<td>${parseFloat(val).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</td>`;
        } else {
          html += '<td>-</td>';
        }
      });
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;

  loadTdUsage();
});

// ============ Yahoo Finance Panel ============

const YF_CATEGORIES = [
  { id: 'bist', label: '🇹🇷 BIST', symbols: [
    { symbol: 'XU100.IS', name: 'BIST 100', type: 'INDEX' },
    { symbol: 'THYAO.IS', name: 'Türk Hava Yolları', type: 'EQUITY' },
    { symbol: 'GARAN.IS', name: 'Garanti BBVA', type: 'EQUITY' },
    { symbol: 'ASELS.IS', name: 'Aselsan', type: 'EQUITY' },
    { symbol: 'SISE.IS', name: 'Şişecam', type: 'EQUITY' },
    { symbol: 'BIMAS.IS', name: 'BİM', type: 'EQUITY' },
    { symbol: 'EREGL.IS', name: 'Ereğli Demir Çelik', type: 'EQUITY' },
    { symbol: 'KCHOL.IS', name: 'Koç Holding', type: 'EQUITY' },
    { symbol: 'SAHOL.IS', name: 'Sabancı Holding', type: 'EQUITY' },
    { symbol: 'AKBNK.IS', name: 'Akbank', type: 'EQUITY' },
    { symbol: 'TUPRS.IS', name: 'Tüpraş', type: 'EQUITY' },
    { symbol: 'YKBNK.IS', name: 'Yapı Kredi', type: 'EQUITY' },
    { symbol: 'PGSUS.IS', name: 'Pegasus', type: 'EQUITY' },
    { symbol: 'TAVHL.IS', name: 'TAV Havalimanları', type: 'EQUITY' },
    { symbol: 'FROTO.IS', name: 'Ford Otosan', type: 'EQUITY' },
    { symbol: 'TOASO.IS', name: 'Tofaş', type: 'EQUITY' },
    { symbol: 'SASA.IS', name: 'Sasa Polyester', type: 'EQUITY' },
    { symbol: 'KOZAL.IS', name: 'Koza Altın', type: 'EQUITY' },
    { symbol: 'PETKM.IS', name: 'Petkim', type: 'EQUITY' },
    { symbol: 'HALKB.IS', name: 'Halkbank', type: 'EQUITY' }
  ]},
  { id: 'us', label: '🇺🇸 ABD Borsası', symbols: [
    { symbol: 'AAPL', name: 'Apple', type: 'EQUITY' },
    { symbol: 'MSFT', name: 'Microsoft', type: 'EQUITY' },
    { symbol: 'GOOGL', name: 'Alphabet', type: 'EQUITY' },
    { symbol: 'AMZN', name: 'Amazon', type: 'EQUITY' },
    { symbol: 'TSLA', name: 'Tesla', type: 'EQUITY' },
    { symbol: 'NVDA', name: 'NVIDIA', type: 'EQUITY' },
    { symbol: 'META', name: 'Meta', type: 'EQUITY' }
  ]},
  { id: 'forex', label: '💱 Döviz', symbols: [
    { symbol: 'USDTRY=X', name: 'Dolar / TL', type: 'CURRENCY' },
    { symbol: 'EURTRY=X', name: 'Euro / TL', type: 'CURRENCY' },
    { symbol: 'GBPTRY=X', name: 'Sterlin / TL', type: 'CURRENCY' },
    { symbol: 'EURUSD=X', name: 'Euro / Dolar', type: 'CURRENCY' },
    { symbol: 'GBPUSD=X', name: 'Sterlin / Dolar', type: 'CURRENCY' },
    { symbol: 'GC=F', name: 'Altın (Vadeli)', type: 'FUTURE' }
  ]},
  { id: 'crypto', label: '₿ Kripto', symbols: [
    { symbol: 'BTC-USD', name: 'Bitcoin', type: 'CRYPTOCURRENCY' },
    { symbol: 'ETH-USD', name: 'Ethereum', type: 'CRYPTOCURRENCY' },
    { symbol: 'SOL-USD', name: 'Solana', type: 'CRYPTOCURRENCY' },
    { symbol: 'BNB-USD', name: 'Binance Coin', type: 'CRYPTOCURRENCY' },
    { symbol: 'XRP-USD', name: 'Ripple', type: 'CRYPTOCURRENCY' },
    { symbol: 'ADA-USD', name: 'Cardano', type: 'CRYPTOCURRENCY' }
  ]},
  { id: 'index', label: '📊 Endeksler', symbols: [
    { symbol: '^GSPC', name: 'S&P 500', type: 'INDEX' },
    { symbol: '^DJI', name: 'Dow Jones', type: 'INDEX' },
    { symbol: '^IXIC', name: 'Nasdaq', type: 'INDEX' },
    { symbol: '^FTSE', name: 'FTSE 100', type: 'INDEX' },
    { symbol: '^GDAXI', name: 'DAX', type: 'INDEX' }
  ]}
];

let yfState = {
  activeTab: 'yf-popular',
  watchlist: JSON.parse(localStorage.getItem('yf_watchlist') || '[]'),
  currentSymbol: null,
  searchDebounce: null,
  connected: false,
  chartData: null,
  chartView: 'chart'
};

function openYfPanel() {
  document.getElementById('yf-panel-overlay').style.display = 'flex';
  checkYfConnection();
}

function closeYfPanel() {
  document.getElementById('yf-panel-overlay').style.display = 'none';
}

document.getElementById('btn-yf-tab').addEventListener('click', openYfPanel);
document.getElementById('btn-yf-close').addEventListener('click', closeYfPanel);
document.getElementById('yf-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'yf-panel-overlay') closeYfPanel();
});

async function checkYfConnection() {
  const result = await window.mailAPI.yfTestConnection();
  yfState.connected = result.success;
  document.getElementById('yf-not-connected').style.display = result.success ? 'none' : 'block';
  document.getElementById('yf-connected').style.display = result.success ? 'flex' : 'none';
  document.getElementById('yf-quote-detail').style.display = 'none';
  if (result.success) {
    switchYfTab('yf-popular');
  }
}

document.getElementById('btn-yf-retry').addEventListener('click', () => {
  checkYfConnection();
});

// Tab switching
document.querySelectorAll('.yf-tab').forEach(tab => {
  tab.addEventListener('click', () => switchYfTab(tab.dataset.tab));
});

function switchYfTab(tabName) {
  yfState.activeTab = tabName;
  document.querySelectorAll('.yf-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.yf-tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById(`yf-tc-${tabName}`);
  if (content) content.classList.add('active');
  document.getElementById('yf-quote-detail').style.display = 'none';

  if (tabName === 'yf-watchlist') renderYfWatchlist();
  else if (tabName === 'yf-popular') loadYfPopular();
}

// ---- Search ----
document.getElementById('yf-search-input').addEventListener('input', (e) => {
  clearTimeout(yfState.searchDebounce);
  const query = e.target.value.trim();
  if (query.length < 2) return;
  yfState.searchDebounce = setTimeout(() => yfSearchSymbols(query), 400);
});

document.getElementById('btn-yf-search').addEventListener('click', () => {
  const query = document.getElementById('yf-search-input').value.trim();
  if (query.length >= 1) yfSearchSymbols(query);
});

document.getElementById('yf-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = e.target.value.trim();
    if (query.length >= 1) yfSearchSymbols(query);
  }
});

async function yfSearchSymbols(query) {
  const container = document.getElementById('yf-search-results');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Aranıyor...</p></div>';
  const result = await window.mailAPI.yfSearch(query);
  if (!result.success) {
    container.innerHTML = `<div class="yf-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.quotes || result.quotes.length === 0) {
    container.innerHTML = '<div class="yf-empty"><p>Sonuç bulunamadı.</p></div>';
    return;
  }
  renderYfSymbolList(container, result.quotes.map(q => ({
    symbol: q.symbol, name: q.name, type: q.type, exchange: q.exchange
  })));
}

function getYfIconClass(type) {
  if (!type) return '';
  const t = type.toUpperCase();
  if (t.includes('EQUITY') || t.includes('STOCK')) return 'equity';
  if (t.includes('CURRENCY') || t.includes('FOREX')) return 'forex';
  if (t.includes('CRYPTO')) return 'crypto';
  if (t.includes('ETF')) return 'etf';
  if (t.includes('INDEX') || t.includes('FUTURE')) return 'index';
  return '';
}

function renderYfSymbolList(container, symbols, withPrices) {
  container.innerHTML = symbols.map(s => {
    const inWL = yfState.watchlist.some(w => w.symbol === s.symbol);
    const iconClass = getYfIconClass(s.type);
    let priceHtml = '';
    if (withPrices && s.price != null) {
      const cls = (s.change || 0) >= 0 ? 'yf-change-positive' : 'yf-change-negative';
      const sign = (s.change || 0) >= 0 ? '+' : '';
      priceHtml = `<div class="yf-symbol-price">${parseFloat(s.price).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</div>
        <div class="yf-symbol-change ${cls}">${sign}${(s.changePercent || 0).toFixed(2)}%</div>`;
    }
    return `<div class="yf-symbol-item" data-symbol="${escapeHtml(s.symbol)}">
      <div class="yf-symbol-icon ${iconClass}">${(s.symbol || '?').charAt(0).toUpperCase()}</div>
      <div class="yf-symbol-info">
        <div class="yf-symbol-name">${escapeHtml(s.name || s.symbol)}</div>
        <div class="yf-symbol-meta">
          <span>${escapeHtml(s.type || '')}</span>
          <span>${escapeHtml(s.exchange || '')}</span>
        </div>
      </div>
      <div class="yf-symbol-ticker">${escapeHtml(s.symbol)}</div>
      ${priceHtml}
      <div class="yf-symbol-actions">
        <button class="yf-btn-wl ${inWL ? 'in-wl' : ''}" data-symbol="${escapeHtml(s.symbol)}" data-name="${escapeHtml(s.name || s.symbol)}" data-type="${escapeHtml(s.type || '')}" title="${inWL ? 'Takipten Çıkar' : 'Takip Et'}">⭐</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.yf-symbol-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.yf-symbol-actions')) return;
      showYfQuote(item.dataset.symbol);
    });
  });

  container.querySelectorAll('.yf-btn-wl').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleYfWatchlist(btn.dataset.symbol, btn.dataset.name, btn.dataset.type);
      btn.classList.toggle('in-wl');
    });
  });
}

// ---- Watchlist ----
function toggleYfWatchlist(symbol, name, type) {
  const idx = yfState.watchlist.findIndex(w => w.symbol === symbol);
  if (idx >= 0) {
    yfState.watchlist.splice(idx, 1);
  } else {
    yfState.watchlist.push({ symbol, name, type });
  }
  localStorage.setItem('yf_watchlist', JSON.stringify(yfState.watchlist));
}

async function renderYfWatchlist() {
  const container = document.getElementById('yf-watchlist-content');
  if (yfState.watchlist.length === 0) {
    container.innerHTML = '<div class="yf-hint">Takip listesi boş. Sembol arayıp ⭐ ile ekleyin.</div>';
    return;
  }
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fiyatlar alınıyor...</p></div>';

  const symbols = yfState.watchlist.map(w => w.symbol);
  const result = await window.mailAPI.yfGetQuote(symbols);

  if (!result.success) {
    container.innerHTML = `<div class="yf-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  const quoteMap = {};
  (result.quotes || []).forEach(q => { quoteMap[q.symbol] = q; });

  const symbolsWithPrices = yfState.watchlist.map(w => {
    const q = quoteMap[w.symbol] || {};
    return {
      symbol: w.symbol, name: q.name || w.name, type: q.type || w.type,
      exchange: q.exchange || '', price: q.price, change: q.change,
      changePercent: q.changePercent
    };
  });

  renderYfSymbolList(container, symbolsWithPrices, true);

  // Add remove buttons
  container.querySelectorAll('.yf-btn-wl').forEach(btn => {
    btn.classList.add('in-wl');
  });
}

// ---- Popular ----
async function loadYfPopular() {
  const container = document.getElementById('yf-popular-grid');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fiyatlar alınıyor...</p></div>';

  const allSymbols = YF_CATEGORIES.flatMap(c => c.symbols.map(s => s.symbol));
  const result = await window.mailAPI.yfGetQuote(allSymbols);

  if (!result.success) {
    container.innerHTML = `<div class="yf-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  const quoteMap = {};
  (result.quotes || []).forEach(q => { quoteMap[q.symbol] = q; });

  container.innerHTML = YF_CATEGORIES.map(cat => {
    const itemsHtml = cat.symbols.map(s => {
      const q = quoteMap[s.symbol] || {};
      const inWL = yfState.watchlist.some(w => w.symbol === s.symbol);
      const iconClass = getYfIconClass(s.type);
      let priceHtml = '';
      if (q.price != null) {
        const cls = (q.change || 0) >= 0 ? 'yf-change-positive' : 'yf-change-negative';
        const sign = (q.change || 0) >= 0 ? '+' : '';
        priceHtml = `<div class="yf-symbol-price">${parseFloat(q.price).toLocaleString('tr-TR', {maximumFractionDigits: 4})}</div>
          <div class="yf-symbol-change ${cls}">${sign}${(q.changePercent || 0).toFixed(2)}%</div>`;
      }
      return `<div class="yf-symbol-item" data-symbol="${escapeHtml(s.symbol)}">
        <div class="yf-symbol-icon ${iconClass}">${(s.symbol || '?').charAt(0).toUpperCase()}</div>
        <div class="yf-symbol-info">
          <div class="yf-symbol-name">${escapeHtml(q.name || s.name)}</div>
          <div class="yf-symbol-meta"><span>${escapeHtml(s.type || '')}</span><span>${escapeHtml(q.exchange || '')}</span></div>
        </div>
        <div class="yf-symbol-ticker">${escapeHtml(s.symbol)}</div>
        ${priceHtml}
        <div class="yf-symbol-actions">
          <button class="yf-btn-wl ${inWL ? 'in-wl' : ''}" data-symbol="${escapeHtml(s.symbol)}" data-name="${escapeHtml(q.name || s.name)}" data-type="${escapeHtml(s.type || '')}" title="${inWL ? 'Takipten Çıkar' : 'Takip Et'}">⭐</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="yf-category-section" data-cat="${cat.id}">
      <div class="yf-category-header">
        <span class="yf-category-title">${cat.label}</span>
        <span class="yf-category-arrow">▼</span>
      </div>
      <div class="yf-category-items">${itemsHtml}</div>
    </div>`;
  }).join('');

  // Bind click events
  container.querySelectorAll('.yf-symbol-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.yf-symbol-actions')) return;
      showYfQuote(item.dataset.symbol);
    });
  });

  container.querySelectorAll('.yf-btn-wl').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleYfWatchlist(btn.dataset.symbol, btn.dataset.name, btn.dataset.type);
      btn.classList.toggle('in-wl');
    });
  });

  // Category collapse toggle
  container.querySelectorAll('.yf-category-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.yf-category-section').classList.toggle('collapsed');
    });
  });
}

// ---- Quote Detail ----
document.getElementById('btn-yf-back').addEventListener('click', () => {
  document.getElementById('yf-quote-detail').style.display = 'none';
  document.querySelectorAll('.yf-tab-content').forEach(c => {
    if (c.id === `yf-tc-${yfState.activeTab}`) c.classList.add('active');
  });
});

document.getElementById('btn-yf-toggle-wl').addEventListener('click', () => {
  if (!yfState.currentSymbol) return;
  toggleYfWatchlist(yfState.currentSymbol, '', '');
});

async function showYfQuote(symbol) {
  yfState.currentSymbol = symbol;
  document.querySelectorAll('.yf-tab-content').forEach(c => c.classList.remove('active'));
  const detail = document.getElementById('yf-quote-detail');
  detail.style.display = 'flex';

  document.getElementById('yf-quote-title').textContent = symbol;
  document.getElementById('yf-quote-body').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Yükleniyor...</p></div>';
  document.getElementById('yf-chart-table-wrap').innerHTML = '<p class="yf-hint">Periyot ve aralık seçip "Veri Getir" butonuna tıklayın.</p>';
  document.getElementById('yf-chart-canvas-wrap').style.display = 'none';
  yfState.chartData = null;

  const result = await window.mailAPI.yfGetQuote(symbol);
  const body = document.getElementById('yf-quote-body');

  if (!result.success) {
    body.innerHTML = `<div class="yf-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  const q = (result.quotes || [])[0];
  if (!q) {
    body.innerHTML = '<div class="yf-empty"><p>Veri bulunamadı.</p></div>';
    return;
  }

  const price = q.price || 0;
  const change = q.change || 0;
  const changePct = q.changePercent || 0;
  const changeClass = change >= 0 ? 'positive' : 'negative';
  const changeSign = change >= 0 ? '+' : '';

  const fmtNum = (v) => v != null ? parseFloat(v).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-';
  const fmtBig = (v) => v != null ? parseFloat(v).toLocaleString('tr-TR', {maximumFractionDigits: 0}) : '-';

  const cards = [
    { label: 'Fiyat', value: fmtNum(price), cls: 'big' },
    { label: 'Değişim', value: `${changeSign}${fmtNum(change)} (${changeSign}${changePct.toFixed(2)}%)`, cls: changeClass },
    { label: 'Açılış', value: fmtNum(q.open) },
    { label: 'Yüksek', value: fmtNum(q.high) },
    { label: 'Düşük', value: fmtNum(q.low) },
    { label: 'Önceki Kapanış', value: fmtNum(q.prevClose) },
    { label: 'Hacim', value: q.volume ? fmtBig(q.volume) : '-' },
    { label: 'Ort. Hacim (3A)', value: q.avgVolume ? fmtBig(q.avgVolume) : '-' },
    { label: '52H Yüksek', value: fmtNum(q.fiftyTwoWeekHigh) },
    { label: '52H Düşük', value: fmtNum(q.fiftyTwoWeekLow) },
    { label: 'Piyasa Değeri', value: q.marketCap ? fmtBig(q.marketCap) : '-' },
    { label: 'F/K Oranı', value: q.trailingPE ? fmtNum(q.trailingPE) : '-' },
    { label: 'EPS', value: q.epsTrailingTwelveMonths ? fmtNum(q.epsTrailingTwelveMonths) : '-' },
    { label: 'Borsa', value: q.exchange || '-' },
    { label: 'Para Birimi', value: q.currency || '-' },
    { label: 'Piyasa Durumu', value: q.marketState || '-' }
  ];

  document.getElementById('yf-quote-title').textContent = `${q.symbol || symbol} — ${q.name || ''}`;

  body.innerHTML = cards.map(c => `
    <div class="yf-quote-card">
      <div class="yf-quote-card-label">${c.label}</div>
      <div class="yf-quote-card-value ${c.cls || ''}">${c.value}</div>
    </div>
  `).join('');
}

// ---- Chart Data ----
document.getElementById('btn-yf-view-chart').addEventListener('click', () => {
  yfState.chartView = 'chart';
  document.getElementById('btn-yf-view-chart').classList.add('active');
  document.getElementById('btn-yf-view-table').classList.remove('active');
  if (yfState.chartData) {
    document.getElementById('yf-chart-canvas-wrap').style.display = 'block';
    document.getElementById('yf-chart-table-wrap').style.display = 'none';
  }
});

document.getElementById('btn-yf-view-table').addEventListener('click', () => {
  yfState.chartView = 'table';
  document.getElementById('btn-yf-view-table').classList.add('active');
  document.getElementById('btn-yf-view-chart').classList.remove('active');
  if (yfState.chartData) {
    document.getElementById('yf-chart-canvas-wrap').style.display = 'none';
    document.getElementById('yf-chart-table-wrap').style.display = 'block';
  }
});

function drawYfChart(values) {
  const canvas = document.getElementById('yf-chart-canvas');
  const wrap = document.getElementById('yf-chart-canvas-wrap');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth - 32;
  const h = 300;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 24, right: 65, bottom: 44, left: 12 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const closes = values.map(v => v.close).filter(v => v != null);
  if (closes.length < 2) return;
  const minVal = Math.min(...closes);
  const maxVal = Math.max(...closes);
  const range = maxVal - minVal || 1;

  // Determine chart color based on trend
  const first = closes[0];
  const last = closes[closes.length - 1];
  const isUp = last >= first;
  const lineColor = isUp ? '#27ae60' : '#e74c3c';

  ctx.clearRect(0, 0, w, h);

  // Grid lines + Y labels
  ctx.textAlign = 'left';
  ctx.font = '10px system-ui, sans-serif';
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (ch / 5) * i;
    ctx.strokeStyle = 'rgba(128,128,128,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();

    const val = maxVal - (range / 5) * i;
    ctx.fillStyle = 'rgba(128,128,128,0.6)';
    ctx.fillText(val.toLocaleString('tr-TR', { maximumFractionDigits: 2 }), w - pad.right + 6, y + 4);
  }

  // X labels
  const labelCount = Math.min(7, values.length);
  const step = Math.max(1, Math.floor((values.length - 1) / (labelCount - 1)));
  ctx.textAlign = 'center';
  for (let i = 0; i < values.length; i += step) {
    const x = pad.left + (i / (values.length - 1)) * cw;
    const dt = values[i].datetime || '';
    const short = dt.length > 10 ? dt.substring(5, 10) : dt.substring(0, 10);
    ctx.fillStyle = 'rgba(128,128,128,0.6)';
    ctx.fillText(short, x, h - pad.bottom + 16);
  }

  // Build points
  const points = values.map((v, i) => ({
    x: pad.left + (i / (values.length - 1)) * cw,
    y: pad.top + (1 - ((v.close || minVal) - minVal) / range) * ch
  }));

  // Gradient fill under line
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  gradient.addColorStop(0, lineColor + '50');
  gradient.addColorStop(0.6, lineColor + '18');
  gradient.addColorStop(1, lineColor + '00');

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.lineTo(points[points.length - 1].x, pad.top + ch);
  ctx.lineTo(points[0].x, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Smooth line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // End dot
  const lp = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Price label on last point
  ctx.fillStyle = lineColor;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(last.toLocaleString('tr-TR', { maximumFractionDigits: 2 }), lp.x + 10, lp.y + 4);

  // Hover interaction
  const tooltip = document.getElementById('yf-chart-tooltip');
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / dpr / rect.width);
    if (mx < pad.left || mx > w - pad.right) { tooltip.style.display = 'none'; return; }
    const ratio = (mx - pad.left) / cw;
    const idx = Math.round(ratio * (values.length - 1));
    if (idx < 0 || idx >= values.length) { tooltip.style.display = 'none'; return; }
    const v = values[idx];
    const pt = points[idx];

    // Redraw + crosshair
    ctx.clearRect(0, 0, w * dpr, h * dpr);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Redraw grid
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch / 5) * i;
      ctx.strokeStyle = 'rgba(128,128,128,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      const val = maxVal - (range / 5) * i;
      ctx.fillStyle = 'rgba(128,128,128,0.6)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(val.toLocaleString('tr-TR', { maximumFractionDigits: 2 }), w - pad.right + 6, y + 4);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < values.length; i += step) {
      const x = pad.left + (i / (values.length - 1)) * cw;
      const dt = values[i].datetime || '';
      const short = dt.length > 10 ? dt.substring(5, 10) : dt.substring(0, 10);
      ctx.fillStyle = 'rgba(128,128,128,0.6)';
      ctx.fillText(short, x, h - pad.bottom + 16);
    }
    // Fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) {
      const pv = points[j - 1]; const cr = points[j];
      ctx.bezierCurveTo((pv.x+cr.x)/2, pv.y, (pv.x+cr.x)/2, cr.y, cr.x, cr.y);
    }
    ctx.lineTo(points[points.length - 1].x, pad.top + ch);
    ctx.lineTo(points[0].x, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let j = 1; j < points.length; j++) {
      const pv = points[j - 1]; const cr = points[j];
      ctx.bezierCurveTo((pv.x+cr.x)/2, pv.y, (pv.x+cr.x)/2, cr.y, cr.x, cr.y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Crosshair
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(128,128,128,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, pad.top);
    ctx.lineTo(pt.x, pad.top + ch);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.left, pt.y);
    ctx.lineTo(w - pad.right, pt.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Hover dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    const fmtN = (n) => n != null ? parseFloat(n).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-';
    tooltip.innerHTML = `<strong>${v.datetime || ''}</strong><br>A: ${fmtN(v.open)} Y: ${fmtN(v.high)} D: ${fmtN(v.low)}<br><strong>K: ${fmtN(v.close)}</strong> H: ${v.volume ? parseInt(v.volume).toLocaleString('tr-TR') : '-'}`;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX - wrap.getBoundingClientRect().left + 12, w - 180) + 'px';
    tooltip.style.top = (e.clientY - wrap.getBoundingClientRect().top - 60) + 'px';
  };
  canvas.onmouseleave = () => {
    tooltip.style.display = 'none';
    // Redraw clean
    drawYfChart(values);
  };
}

function renderYfTable(values, currency) {
  let html = `<div class="yf-data-count">${values.length} kayıt — ${currency || ''}</div>`;
  html += '<table class="yf-chart-table"><thead><tr>';
  html += '<th>Tarih</th><th>Açılış</th><th>Yüksek</th><th>Düşük</th><th>Kapanış</th><th>Düz. Kapanış</th><th>Hacim</th>';
  html += '</tr></thead><tbody>';
  values.forEach(v => {
    const close = v.close || 0;
    const open = v.open || 0;
    const cls = close >= open ? 'yf-val-positive' : 'yf-val-negative';
    const fmtN = (n) => n != null ? parseFloat(n).toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '-';
    html += '<tr>';
    html += `<td>${escapeHtml(v.datetime || '')}</td>`;
    html += `<td>${fmtN(v.open)}</td>`;
    html += `<td>${fmtN(v.high)}</td>`;
    html += `<td>${fmtN(v.low)}</td>`;
    html += `<td class="${cls}">${fmtN(v.close)}</td>`;
    html += `<td>${fmtN(v.adjClose)}</td>`;
    html += `<td>${v.volume ? parseInt(v.volume).toLocaleString('tr-TR') : '-'}</td>`;
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

document.getElementById('btn-yf-fetch-chart').addEventListener('click', async () => {
  if (!yfState.currentSymbol) return;

  const interval = document.getElementById('yf-chart-interval').value;
  const range = document.getElementById('yf-chart-range').value;
  const canvasWrap = document.getElementById('yf-chart-canvas-wrap');
  const tableWrap = document.getElementById('yf-chart-table-wrap');

  canvasWrap.style.display = 'none';
  tableWrap.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Veri getiriliyor...</p></div>';
  tableWrap.style.display = 'block';

  const result = await window.mailAPI.yfGetChart(yfState.currentSymbol, interval, range);

  if (!result.success) {
    tableWrap.innerHTML = `<div class="yf-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  if (!result.values || result.values.length === 0) {
    tableWrap.innerHTML = '<div class="yf-empty"><p>Veri bulunamadı.</p></div>';
    return;
  }

  const values = result.values;
  yfState.chartData = { values, currency: result.meta?.currency || '' };

  // Render table
  tableWrap.innerHTML = renderYfTable(values, yfState.chartData.currency);

  // Render chart on canvas
  canvasWrap.style.display = 'block';
  drawYfChart(values);

  // Show based on selected view
  if (yfState.chartView === 'chart') {
    canvasWrap.style.display = 'block';
    tableWrap.style.display = 'none';
  } else {
    canvasWrap.style.display = 'none';
    tableWrap.style.display = 'block';
  }
});

// ============ Binance Panel ============

let bnState = {
  activeTab: 'bn-top',
  watchlist: JSON.parse(localStorage.getItem('bn_watchlist') || '[]'),
  currentSymbol: null,
  searchDebounce: null,
  connected: false,
  chartData: null,
  chartView: 'chart'
};

function openBnPanel() {
  document.getElementById('bn-panel-overlay').style.display = 'flex';
  checkBnConnection();
}

function closeBnPanel() {
  document.getElementById('bn-panel-overlay').style.display = 'none';
}

document.getElementById('btn-bn-tab').addEventListener('click', openBnPanel);
document.getElementById('btn-bn-close').addEventListener('click', closeBnPanel);
document.getElementById('bn-panel-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'bn-panel-overlay') closeBnPanel();
});

async function checkBnConnection() {
  const result = await window.mailAPI.bnTestConnection();
  bnState.connected = result.success;
  document.getElementById('bn-not-connected').style.display = result.success ? 'none' : 'block';
  document.getElementById('bn-connected').style.display = result.success ? 'flex' : 'none';
  document.getElementById('bn-pair-detail').style.display = 'none';
  if (result.success) switchBnTab('bn-top');
}

document.getElementById('btn-bn-retry').addEventListener('click', checkBnConnection);

document.querySelectorAll('.bn-tab').forEach(tab => {
  tab.addEventListener('click', () => switchBnTab(tab.dataset.tab));
});

function switchBnTab(tabName) {
  bnState.activeTab = tabName;
  document.querySelectorAll('.bn-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.bn-tab-content').forEach(c => c.classList.remove('active'));
  const content = document.getElementById(`bn-tc-${tabName}`);
  if (content) content.classList.add('active');
  document.getElementById('bn-pair-detail').style.display = 'none';
  if (tabName === 'bn-top') loadBnTop();
  else if (tabName === 'bn-watchlist') renderBnWatchlist();
}

// ---- Top Pairs ----
async function loadBnTop() {
  const container = document.getElementById('bn-top-content');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Yükleniyor...</p></div>';
  const result = await window.mailAPI.bnGetTopPairs();
  if (!result.success) {
    container.innerHTML = `<div class="bn-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  renderBnPairList(container, result.pairs);
}

function renderBnPairList(container, pairs) {
  container.innerHTML = pairs.map(p => {
    const inWL = bnState.watchlist.includes(p.symbol);
    const change = parseFloat(p.change || 0);
    const cls = change >= 0 ? 'bn-change-positive' : 'bn-change-negative';
    const sign = change >= 0 ? '+' : '';
    const price = parseFloat(p.price);
    return `<div class="bn-pair-item" data-symbol="${escapeHtml(p.symbol)}">
      <div class="bn-pair-icon">${p.symbol.replace(/USDT$|BTC$|BUSD$|TRY$/,'').substring(0,2)}</div>
      <div class="bn-pair-info">
        <div class="bn-pair-name">${escapeHtml(p.symbol)}</div>
        <div class="bn-pair-meta">${p.volume ? 'Vol: $' + parseFloat(p.volume).toLocaleString('en-US',{maximumFractionDigits:0}) : ''}</div>
      </div>
      <div>
        <div class="bn-pair-price">${price.toLocaleString('tr-TR', {maximumFractionDigits: price < 1 ? 6 : 2})}</div>
        <div class="bn-pair-change ${cls}">${sign}${change.toFixed(2)}%</div>
      </div>
      <div class="bn-pair-actions">
        <button class="bn-btn-wl ${inWL ? 'in-wl' : ''}" data-symbol="${escapeHtml(p.symbol)}" title="${inWL ? 'Takipten Çıkar' : 'Takip Et'}">⭐</button>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.bn-pair-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.bn-pair-actions')) return;
      showBnPair(item.dataset.symbol);
    });
  });

  container.querySelectorAll('.bn-btn-wl').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBnWatchlist(btn.dataset.symbol);
      btn.classList.toggle('in-wl');
    });
  });
}

// ---- Search ----
document.getElementById('bn-search-input').addEventListener('input', (e) => {
  clearTimeout(bnState.searchDebounce);
  const query = e.target.value.trim();
  if (query.length < 2) return;
  bnState.searchDebounce = setTimeout(() => bnSearchSymbols(query), 400);
});

document.getElementById('btn-bn-search').addEventListener('click', () => {
  const q = document.getElementById('bn-search-input').value.trim();
  if (q.length >= 1) bnSearchSymbols(q);
});

document.getElementById('bn-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    if (q.length >= 1) bnSearchSymbols(q);
  }
});

async function bnSearchSymbols(query) {
  const container = document.getElementById('bn-search-results');
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Aranıyor...</p></div>';
  const result = await window.mailAPI.bnSearch(query);
  if (!result.success) {
    container.innerHTML = `<div class="bn-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.symbols || result.symbols.length === 0) {
    container.innerHTML = '<div class="bn-empty"><p>Sonuç bulunamadı.</p></div>';
    return;
  }
  // Get prices for results
  const priceResult = await window.mailAPI.bnGetPrices(result.symbols.map(s => s.symbol));
  const priceMap = {};
  if (priceResult.success) priceResult.prices.forEach(p => { priceMap[p.symbol] = p.price; });

  const pairs = result.symbols.map(s => ({
    symbol: s.symbol, price: priceMap[s.symbol] || '0', change: null,
    volume: null
  }));
  renderBnPairList(container, pairs);
}

// ---- Watchlist ----
function toggleBnWatchlist(symbol) {
  const idx = bnState.watchlist.indexOf(symbol);
  if (idx >= 0) bnState.watchlist.splice(idx, 1);
  else bnState.watchlist.push(symbol);
  localStorage.setItem('bn_watchlist', JSON.stringify(bnState.watchlist));
}

async function renderBnWatchlist() {
  const container = document.getElementById('bn-watchlist-content');
  if (bnState.watchlist.length === 0) {
    container.innerHTML = '<div class="bn-hint">Takip listesi boş. Çift seçip ⭐ ile ekleyin.</div>';
    return;
  }
  container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Fiyatlar alınıyor...</p></div>';
  const priceResult = await window.mailAPI.bnGetPrices(bnState.watchlist);
  if (!priceResult.success) {
    container.innerHTML = `<div class="bn-empty"><p>Hata: ${priceResult.error}</p></div>`;
    return;
  }
  const priceMap = {};
  priceResult.prices.forEach(p => { priceMap[p.symbol] = p.price; });
  const pairs = bnState.watchlist.map(s => ({
    symbol: s, price: priceMap[s] || '0', change: null, volume: null
  }));
  renderBnPairList(container, pairs);
}

// ---- Pair Detail ----
document.getElementById('btn-bn-back').addEventListener('click', () => {
  document.getElementById('bn-pair-detail').style.display = 'none';
  document.querySelectorAll('.bn-tab-content').forEach(c => {
    if (c.id === `bn-tc-${bnState.activeTab}`) c.classList.add('active');
  });
});

document.getElementById('btn-bn-toggle-wl').addEventListener('click', () => {
  if (!bnState.currentSymbol) return;
  toggleBnWatchlist(bnState.currentSymbol);
});

async function showBnPair(symbol) {
  bnState.currentSymbol = symbol;
  document.querySelectorAll('.bn-tab-content').forEach(c => c.classList.remove('active'));
  const detail = document.getElementById('bn-pair-detail');
  detail.style.display = 'flex';

  document.getElementById('bn-pair-title').textContent = symbol;
  document.getElementById('bn-pair-body').innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Yükleniyor...</p></div>';
  document.getElementById('bn-chart-table-wrap').innerHTML = '<p class="bn-hint">Periyot ve adet seçip "Veri Getir" butonuna tıklayın.</p>';
  document.getElementById('bn-chart-canvas-wrap').style.display = 'none';
  bnState.chartData = null;

  const result = await window.mailAPI.bnGetTicker24(symbol);
  const body = document.getElementById('bn-pair-body');

  if (!result.success) {
    body.innerHTML = `<div class="bn-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }

  const t = result.ticker;
  const price = parseFloat(t.lastPrice || 0);
  const change = parseFloat(t.priceChangePercent || 0);
  const changeClass = change >= 0 ? 'positive' : 'negative';
  const changeSign = change >= 0 ? '+' : '';
  const fN = (v) => v ? parseFloat(v).toLocaleString('tr-TR', {maximumFractionDigits: parseFloat(v) < 1 ? 8 : 4}) : '-';
  const fB = (v) => v ? parseFloat(v).toLocaleString('tr-TR', {maximumFractionDigits: 0}) : '-';

  const cards = [
    { label: 'Son Fiyat', value: fN(t.lastPrice), cls: 'big' },
    { label: 'Değişim (24s)', value: `${changeSign}${fN(t.priceChange)} (${changeSign}${change.toFixed(2)}%)`, cls: changeClass },
    { label: 'Yüksek (24s)', value: fN(t.highPrice) },
    { label: 'Düşük (24s)', value: fN(t.lowPrice) },
    { label: 'Açılış', value: fN(t.openPrice) },
    { label: 'Önceki Kapanış', value: fN(t.prevClosePrice) },
    { label: 'Ağr. Ort. Fiyat', value: fN(t.weightedAvgPrice) },
    { label: 'Hacim', value: fB(t.volume) },
    { label: 'Kotasyon Hacmi', value: '$' + fB(t.quoteVolume) },
    { label: 'İşlem Sayısı', value: t.count ? parseInt(t.count).toLocaleString('tr-TR') : '-' }
  ];

  document.getElementById('bn-pair-title').textContent = symbol;
  body.innerHTML = cards.map(c => `
    <div class="bn-pair-card">
      <div class="bn-pair-card-label">${c.label}</div>
      <div class="bn-pair-card-value ${c.cls || ''}">${c.value}</div>
    </div>
  `).join('');
}

// ---- Binance Chart ----
document.getElementById('btn-bn-view-chart').addEventListener('click', () => {
  bnState.chartView = 'chart';
  document.getElementById('btn-bn-view-chart').classList.add('active');
  document.getElementById('btn-bn-view-table').classList.remove('active');
  if (bnState.chartData) {
    document.getElementById('bn-chart-canvas-wrap').style.display = 'block';
    document.getElementById('bn-chart-table-wrap').style.display = 'none';
  }
});

document.getElementById('btn-bn-view-table').addEventListener('click', () => {
  bnState.chartView = 'table';
  document.getElementById('btn-bn-view-table').classList.add('active');
  document.getElementById('btn-bn-view-chart').classList.remove('active');
  if (bnState.chartData) {
    document.getElementById('bn-chart-canvas-wrap').style.display = 'none';
    document.getElementById('bn-chart-table-wrap').style.display = 'block';
  }
});

function drawBnChart(klines) {
  const canvas = document.getElementById('bn-chart-canvas');
  const wrap = document.getElementById('bn-chart-canvas-wrap');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth - 32;
  const h = 300;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const pad = { top: 24, right: 65, bottom: 44, left: 12 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  const closes = klines.map(k => parseFloat(k.close));
  if (closes.length < 2) return;
  const minVal = Math.min(...closes);
  const maxVal = Math.max(...closes);
  const range = maxVal - minVal || 1;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const isUp = last >= first;
  const lineColor = isUp ? '#27ae60' : '#e74c3c';

  ctx.clearRect(0, 0, w, h);

  ctx.textAlign = 'left';
  ctx.font = '10px system-ui, sans-serif';
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (ch / 5) * i;
    ctx.strokeStyle = 'rgba(128,128,128,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    const val = maxVal - (range / 5) * i;
    ctx.fillStyle = 'rgba(128,128,128,0.6)';
    ctx.fillText(val.toLocaleString('tr-TR', { maximumFractionDigits: val < 1 ? 6 : 2 }), w - pad.right + 6, y + 4);
  }

  const labelCount = Math.min(7, klines.length);
  const step = Math.max(1, Math.floor((klines.length - 1) / (labelCount - 1)));
  ctx.textAlign = 'center';
  for (let i = 0; i < klines.length; i += step) {
    const x = pad.left + (i / (klines.length - 1)) * cw;
    const d = new Date(klines[i].openTime);
    const short = `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
    ctx.fillStyle = 'rgba(128,128,128,0.6)';
    ctx.fillText(short, x, h - pad.bottom + 16);
  }

  const points = klines.map((k, i) => ({
    x: pad.left + (i / (klines.length - 1)) * cw,
    y: pad.top + (1 - (parseFloat(k.close) - minVal) / range) * ch
  }));

  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  gradient.addColorStop(0, lineColor + '50');
  gradient.addColorStop(0.6, lineColor + '18');
  gradient.addColorStop(1, lineColor + '00');

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]; const curr = points[i];
    ctx.bezierCurveTo((prev.x+curr.x)/2, prev.y, (prev.x+curr.x)/2, curr.y, curr.x, curr.y);
  }
  ctx.lineTo(points[points.length - 1].x, pad.top + ch);
  ctx.lineTo(points[0].x, pad.top + ch);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]; const curr = points[i];
    ctx.bezierCurveTo((prev.x+curr.x)/2, prev.y, (prev.x+curr.x)/2, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const lp = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = lineColor;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(last.toLocaleString('tr-TR', { maximumFractionDigits: last < 1 ? 6 : 2 }), lp.x + 10, lp.y + 4);

  const tooltip = document.getElementById('bn-chart-tooltip');
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / dpr / rect.width);
    if (mx < pad.left || mx > w - pad.right) { tooltip.style.display = 'none'; return; }
    const ratio = (mx - pad.left) / cw;
    const idx = Math.round(ratio * (klines.length - 1));
    if (idx < 0 || idx >= klines.length) { tooltip.style.display = 'none'; return; }
    const k = klines[idx];
    const fN = (n) => parseFloat(n).toLocaleString('tr-TR', {maximumFractionDigits: parseFloat(n) < 1 ? 8 : 4});
    const d = new Date(k.openTime);
    tooltip.innerHTML = `<strong>${d.toLocaleString('tr-TR')}</strong><br>A: ${fN(k.open)} Y: ${fN(k.high)} D: ${fN(k.low)}<br><strong>K: ${fN(k.close)}</strong> H: ${parseFloat(k.volume).toLocaleString('tr-TR',{maximumFractionDigits:0})}`;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(e.clientX - wrap.getBoundingClientRect().left + 12, w - 180) + 'px';
    tooltip.style.top = (e.clientY - wrap.getBoundingClientRect().top - 60) + 'px';
  };
  canvas.onmouseleave = () => { tooltip.style.display = 'none'; };
}

document.getElementById('btn-bn-fetch-chart').addEventListener('click', async () => {
  if (!bnState.currentSymbol) return;

  const interval = document.getElementById('bn-chart-interval').value;
  const limit = parseInt(document.getElementById('bn-chart-limit').value);
  const canvasWrap = document.getElementById('bn-chart-canvas-wrap');
  const tableWrap = document.getElementById('bn-chart-table-wrap');

  canvasWrap.style.display = 'none';
  tableWrap.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Veri getiriliyor...</p></div>';
  tableWrap.style.display = 'block';

  const result = await window.mailAPI.bnGetKlines(bnState.currentSymbol, interval, limit);
  if (!result.success) {
    tableWrap.innerHTML = `<div class="bn-empty"><p>Hata: ${result.error}</p></div>`;
    return;
  }
  if (!result.klines || result.klines.length === 0) {
    tableWrap.innerHTML = '<div class="bn-empty"><p>Veri bulunamadı.</p></div>';
    return;
  }

  const klines = result.klines;
  bnState.chartData = klines;

  let html = `<div class="bn-data-count">${klines.length} kayıt</div>`;
  html += '<table class="bn-chart-table"><thead><tr>';
  html += '<th>Tarih</th><th>Açılış</th><th>Yüksek</th><th>Düşük</th><th>Kapanış</th><th>Hacim</th><th>İşlem</th>';
  html += '</tr></thead><tbody>';
  klines.forEach(k => {
    const c = parseFloat(k.close); const o = parseFloat(k.open);
    const cls = c >= o ? 'bn-val-positive' : 'bn-val-negative';
    const fN = (n) => parseFloat(n).toLocaleString('tr-TR', {maximumFractionDigits: parseFloat(n) < 1 ? 8 : 4});
    const d = new Date(k.openTime);
    html += `<tr><td>${d.toLocaleDateString('tr-TR')} ${d.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</td>`;
    html += `<td>${fN(k.open)}</td><td>${fN(k.high)}</td><td>${fN(k.low)}</td>`;
    html += `<td class="${cls}">${fN(k.close)}</td>`;
    html += `<td>${parseFloat(k.volume).toLocaleString('tr-TR',{maximumFractionDigits:0})}</td>`;
    html += `<td>${k.trades ? parseInt(k.trades).toLocaleString('tr-TR') : '-'}</td></tr>`;
  });
  html += '</tbody></table>';
  tableWrap.innerHTML = html;

  canvasWrap.style.display = 'block';
  drawBnChart(klines);

  if (bnState.chartView === 'chart') {
    canvasWrap.style.display = 'block';
    tableWrap.style.display = 'none';
  } else {
    canvasWrap.style.display = 'none';
    tableWrap.style.display = 'block';
  }
});

// ============ Toolbar Ticker + Weather ============

let tickerInterval = null;

async function updateTickerRates() {
  try {
    const result = await window.mailAPI.getTickerRates();
    if (result.success && result.rates) {
      const r = result.rates;
      const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      if (r.USDTTRY) el('ticker-usdtry', parseFloat(r.USDTTRY).toFixed(2));
      if (r.BTCUSDT) el('ticker-btc', '$' + parseFloat(r.BTCUSDT).toLocaleString('en-US', {maximumFractionDigits: 0}));
      if (r.ETHUSDT) el('ticker-eth', '$' + parseFloat(r.ETHUSDT).toLocaleString('en-US', {maximumFractionDigits: 0}));
      if (r.EURUSDT) el('ticker-eur', parseFloat(r.EURUSDT).toFixed(4));
    }
  } catch (e) { /* silent */ }
}

async function updateWeather() {
  try {
    const result = await window.mailAPI.getWeatherByCity('Istanbul');
    if (result.success) {
      const iconMap = {
        '01d': '☀️', '01n': '🌙', '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️', '04d': '☁️', '04n': '☁️',
        '09d': '🌧️', '09n': '🌧️', '10d': '🌦️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️', '13d': '❄️', '13n': '❄️',
        '50d': '🌫️', '50n': '🌫️'
      };
      const icon = iconMap[result.icon] || '🌡️';
      document.getElementById('ticker-weather-icon').textContent = icon;
      document.getElementById('ticker-weather-text').textContent = `${result.city} ${result.temp}°C`;
      document.getElementById('ticker-weather').title = `${result.city}: ${result.desc}, Hissedilen ${result.feelsLike}°C, Nem %${result.humidity}, Rüzgar ${result.wind} m/s`;
    }
  } catch (e) { /* silent */ }
}

function startTicker() {
  updateTickerRates();
  updateWeather();
  tickerInterval = setInterval(updateTickerRates, 30000);
  setInterval(updateWeather, 600000);
}

startTicker();

// ============ API Keys Panel ============

const apikeysOverlay = document.getElementById('apikeys-panel-overlay');
const btnApiKeys = document.getElementById('btn-api-keys');
const btnApiKeysClose = document.getElementById('btn-apikeys-close');
const btnApiKeysSave = document.getElementById('btn-apikeys-save');

btnApiKeys.addEventListener('click', openApiKeysPanel);
btnApiKeysClose.addEventListener('click', closeApiKeysPanel);
apikeysOverlay.addEventListener('click', (e) => {
  if (e.target === apikeysOverlay) closeApiKeysPanel();
});

document.querySelectorAll('.apikey-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  });
});

// External link handlers
['apikeys-gh-link', 'apikeys-evds-link', 'apikeys-td-link', 'apikeys-gemini-link'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const urls = {
        'apikeys-gh-link': 'https://github.com/settings/tokens',
        'apikeys-evds-link': 'https://evds2.tcmb.gov.tr/',
        'apikeys-td-link': 'https://twelvedata.com/',
        'apikeys-gemini-link': 'https://aistudio.google.com/apikey'
      };
      if (window.mailAPI.openExternal) window.mailAPI.openExternal(urls[id]);
    });
  }
});

async function openApiKeysPanel() {
  apikeysOverlay.style.display = 'flex';
  try {
    const data = await window.mailAPI.getAllApiKeys();
    const accountInfo = document.getElementById('apikeys-account-info');
    accountInfo.textContent = data.activeEmail ? `📧 Aktif hesap: ${data.activeEmail}` : '⚠️ Aktif hesap yok';

    const ghInput = document.getElementById('apikeys-github');
    const evdsInput = document.getElementById('apikeys-evds');
    const tdInput = document.getElementById('apikeys-td');
    const geminiInput = document.getElementById('apikeys-gemini');

    ghInput.value = data.github || '';
    evdsInput.value = data.evds || '';
    tdInput.value = data.twelveData || '';
    geminiInput.value = data.geminiApiKey || '';

    setKeyStatus('apikeys-github-status', data.github);
    setKeyStatus('apikeys-evds-status', data.evds);
    setKeyStatus('apikeys-td-status', data.twelveData);
    setKeyStatus('apikeys-gemini-status', data.geminiApiKey);
  } catch (err) {
    console.error('API Keys panel load error:', err);
  }
}

function setKeyStatus(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (value) {
    el.textContent = '✅ Anahtar kayıtlı';
    el.className = 'apikey-status connected';
  } else {
    el.textContent = '⚪ Henüz girilmemiş';
    el.className = 'apikey-status empty';
  }
}

function closeApiKeysPanel() {
  apikeysOverlay.style.display = 'none';
  document.getElementById('apikeys-save-status').textContent = '';
}

btnApiKeysSave.addEventListener('click', async () => {
  const statusEl = document.getElementById('apikeys-save-status');
  try {
    await window.mailAPI.saveAllApiKeys({
      github: document.getElementById('apikeys-github').value.trim(),
      evds: document.getElementById('apikeys-evds').value.trim(),
      twelveData: document.getElementById('apikeys-td').value.trim(),
      geminiApiKey: document.getElementById('apikeys-gemini').value.trim()
    });
    statusEl.textContent = '✅ Kaydedildi!';
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
  } catch (err) {
    statusEl.textContent = '❌ Hata: ' + err.message;
  }
});

// ============ About / Features Panel ============

const aboutOverlay = document.getElementById('about-panel-overlay');
const btnAbout = document.getElementById('btn-about');
const btnAboutClose = document.getElementById('btn-about-close');

btnAbout.addEventListener('click', () => { aboutOverlay.style.display = 'flex'; });
btnAboutClose.addEventListener('click', () => { aboutOverlay.style.display = 'none'; });
aboutOverlay.addEventListener('click', (e) => {
  if (e.target === aboutOverlay) aboutOverlay.style.display = 'none';
});

// ============ Gemini AI Settings ============

async function loadGeminiSettings() {
  try {
    const settings = await window.mailAPI.getGeminiSettings();
    document.getElementById('gemini-api-key').value = settings.apiKey || '';
    const model = settings.model || 'gemini-1.5-flash';
    const select = document.getElementById('gemini-model');
    
    // Check if model is a predefined option
    const predefinedModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.5-flash', 'gemini-1.0-pro'];
    if (predefinedModels.includes(model)) {
      select.value = model;
      document.getElementById('custom-model-group').style.display = 'none';
    } else {
      // Custom model
      select.value = 'custom';
      document.getElementById('gemini-custom-model').value = model;
      document.getElementById('custom-model-group').style.display = 'block';
    }
  } catch (e) { /* ignore */ }
}

document.getElementById('toggle-api-key')?.addEventListener('click', () => {
  const input = document.getElementById('gemini-api-key');
  input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('gemini-model')?.addEventListener('change', (e) => {
  const customGroup = document.getElementById('custom-model-group');
  if (e.target.value === 'custom') {
    customGroup.style.display = 'block';
    document.getElementById('gemini-custom-model').focus();
  } else {
    customGroup.style.display = 'none';
  }
});

document.getElementById('btn-save-gemini')?.addEventListener('click', async () => {
  const apiKey = document.getElementById('gemini-api-key').value.trim();
  let model = document.getElementById('gemini-model').value;
  
  if (model === 'custom') {
    const customModel = document.getElementById('gemini-custom-model').value.trim();
    if (!customModel) {
      showToast('Özel model adı gerekli', 'error');
      return;
    }
    model = customModel;
  }
  
  await window.mailAPI.saveGeminiSettings({ apiKey, model });
  showToast('Gemini ayarları kaydedildi', 'success');
});

document.getElementById('gemini-api-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.mailAPI.openExternal('https://aistudio.google.com/apikey');
});

// Load gemini settings when settings panel opens
const settingsEl = document.getElementById('settings-panel-overlay');
new MutationObserver(() => {
  if (settingsEl.style.display !== 'none') loadGeminiSettings();
}).observe(settingsEl, { attributes: true, attributeFilter: ['style'] });

// ============ AI Chat for Email Compose ============

let aiChatState = {
  messages: [],
  emailContext: null,
  generatedEmail: null
};

function openAiChat() {
  // Check if there's email context (replying)
  const subject = document.getElementById('compose-subject').value;
  const to = document.getElementById('compose-to').value;
  const body = document.getElementById('compose-body').value;

  if (state.currentEmail) {
    aiChatState.emailContext = {
      from: state.currentEmail.from,
      subject: state.currentEmail.subject,
      body: state.currentEmail.text || '',
      to: to
    };
  } else {
    aiChatState.emailContext = null;
  }

  aiChatState.messages = [];
  aiChatState.generatedEmail = null;

  // Update UI
  const contextEl = document.getElementById('ai-chat-context');
  if (aiChatState.emailContext) {
    contextEl.style.display = 'block';
    document.getElementById('ai-chat-subject').textContent = aiChatState.emailContext.subject || '(Konu yok)';
    document.getElementById('ai-chat-from').textContent = `Kimden: ${extractName(aiChatState.emailContext.from)}`;
  } else {
    contextEl.style.display = 'none';
  }

  document.getElementById('ai-chat-messages').innerHTML = '';
  document.getElementById('ai-chat-actions').style.display = 'none';
  document.getElementById('ai-chat-overlay').style.display = 'flex';
  document.getElementById('ai-chat-input').value = '';
  document.getElementById('ai-chat-input').focus();

  // Add initial system message
  addAiMessage('system', aiChatState.emailContext
    ? 'E-postayı inceliyorum. "Bu e-postaya yanıt oluştur" yazabilir veya özel talimatlarınızı verebilirsiniz.'
    : 'Yeni bir e-posta oluşturmamı istiyorsanız nasıl bir e-posta yazayım anlatın.'
  );
}

function closeAiChat() {
  document.getElementById('ai-chat-overlay').style.display = 'none';
}

function addAiMessage(role, content) {
  const container = document.getElementById('ai-chat-messages');
  const msg = document.createElement('div');
  msg.className = `ai-msg ${role}`;
  msg.textContent = content;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function addAiTypingIndicator() {
  const container = document.getElementById('ai-chat-messages');
  const msg = document.createElement('div');
  msg.className = 'ai-msg assistant';
  msg.id = 'ai-typing-indicator';
  msg.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function removeAiTypingIndicator() {
  const el = document.getElementById('ai-typing-indicator');
  if (el) el.remove();
}

async function sendAiMessage() {
  const input = document.getElementById('ai-chat-input');
  const userText = input.value.trim();
  if (!userText) return;

  input.value = '';
  addAiMessage('user', userText);
  aiChatState.messages.push({ role: 'user', content: userText });

  addAiTypingIndicator();

  try {
    const result = await window.mailAPI.geminiChat({
      messages: aiChatState.messages,
      emailContext: aiChatState.emailContext
    });

    removeAiTypingIndicator();

    if (!result.success) {
      addAiMessage('system', 'Hata: ' + result.error);
      return;
    }

    const responseText = result.response;
    aiChatState.messages.push({ role: 'assistant', content: responseText });

    // Try to parse JSON response
    let parsed = null;
    try {
      // Extract JSON from response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON, treat as plain text
    }

    if (parsed && parsed.type === 'question') {
      addAiMessage('assistant', parsed.question);
    } else if (parsed && parsed.type === 'email') {
      aiChatState.generatedEmail = parsed.body;
      const msgEl = document.createElement('div');
      msgEl.className = 'ai-msg assistant';
      msgEl.innerHTML = `<div>E-posta yanıtı hazır:</div><div class="ai-msg-email">${escapeHtml(parsed.body)}</div>`;
      document.getElementById('ai-chat-messages').appendChild(msgEl);
      document.getElementById('ai-chat-messages').scrollTop = document.getElementById('ai-chat-messages').scrollHeight;
      document.getElementById('ai-chat-actions').style.display = 'flex';
    } else {
      // Plain text response - could be email or conversation
      addAiMessage('assistant', responseText);
      // If it looks like an email, offer to use it
      if (responseText.length > 50 && !responseText.startsWith('{')) {
        aiChatState.generatedEmail = responseText;
        document.getElementById('ai-chat-actions').style.display = 'flex';
      }
    }
  } catch (error) {
    removeAiTypingIndicator();
    addAiMessage('system', 'Bağlantı hatası: ' + error.message);
  }
}

document.getElementById('btn-ai-compose')?.addEventListener('click', openAiChat);
document.getElementById('btn-ai-chat-close')?.addEventListener('click', closeAiChat);

document.getElementById('btn-ai-chat-send')?.addEventListener('click', sendAiMessage);

document.getElementById('ai-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAiMessage();
  }
});

document.getElementById('btn-ai-use-email')?.addEventListener('click', () => {
  if (aiChatState.generatedEmail) {
    document.getElementById('compose-body').value = aiChatState.generatedEmail;
    closeAiChat();
    showToast('E-posta metni yapay zeka ile dolduruldu', 'success');
  }
});

document.getElementById('btn-ai-regenerate')?.addEventListener('click', () => {
  document.getElementById('ai-chat-actions').style.display = 'none';
  aiChatState.generatedEmail = null;
  aiChatState.messages.push({ role: 'user', content: 'Lütfen farklı bir yanıt oluştur.' });
  addAiMessage('user', 'Lütfen farklı bir yanıt oluştur.');
  addAiTypingIndicator();

  window.mailAPI.geminiChat({
    messages: aiChatState.messages,
    emailContext: aiChatState.emailContext
  }).then(result => {
    removeAiTypingIndicator();
    if (!result.success) {
      addAiMessage('system', 'Hata: ' + result.error);
      return;
    }
    const responseText = result.response;
    aiChatState.messages.push({ role: 'assistant', content: responseText });

    let parsed = null;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {}

    if (parsed && parsed.type === 'email') {
      aiChatState.generatedEmail = parsed.body;
      const msgEl = document.createElement('div');
      msgEl.className = 'ai-msg assistant';
      msgEl.innerHTML = `<div>E-posta yanıtı hazır:</div><div class="ai-msg-email">${escapeHtml(parsed.body)}</div>`;
      document.getElementById('ai-chat-messages').appendChild(msgEl);
      document.getElementById('ai-chat-messages').scrollTop = document.getElementById('ai-chat-messages').scrollHeight;
      document.getElementById('ai-chat-actions').style.display = 'flex';
    } else {
      addAiMessage('assistant', responseText);
      if (responseText.length > 50) {
        aiChatState.generatedEmail = responseText;
        document.getElementById('ai-chat-actions').style.display = 'flex';
      }
    }
  }).catch(err => {
    removeAiTypingIndicator();
    addAiMessage('system', 'Hata: ' + err.message);
  });
});

// ============ Fix Input Field Focus Issues ============
// Prevent overlay animations from blocking input focus
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    // Force focus with a small delay to prevent animation-related focus stealing
    setTimeout(() => {
      if (document.activeElement !== target) {
        target.focus();
      }
    }, 10);
  }
});
