const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const PROVIDER_CONFIGS = {
  gmail: {
    imap: { host: 'imap.gmail.com', port: 993, tls: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false }
  },
  outlook: {
    imap: { host: 'outlook.office365.com', port: 993, tls: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false }
  },
  yahoo: {
    imap: { host: 'imap.mail.yahoo.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587, secure: false }
  },
  yandex: {
    imap: { host: 'imap.yandex.com', port: 993, tls: true },
    smtp: { host: 'smtp.yandex.com', port: 465, secure: true }
  },
  custom: {
    imap: { host: '', port: 993, tls: true },
    smtp: { host: '', port: 587, secure: false }
  }
};

class EmailService {
  constructor(accountData) {
    this.accountData = accountData;
    this.imap = null;
    this.provider = accountData.provider || 'custom';
    this.config = PROVIDER_CONFIGS[this.provider] || PROVIDER_CONFIGS.custom;
    
    if (this.provider === 'custom') {
      this.config = {
        imap: {
          host: accountData.imapHost,
          port: parseInt(accountData.imapPort) || 993,
          tls: accountData.imapTls !== false
        },
        smtp: {
          host: accountData.smtpHost,
          port: parseInt(accountData.smtpPort) || 587,
          secure: accountData.smtpSecure || false
        }
      };
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.accountData.email,
        password: this.accountData.password,
        host: this.config.imap.host,
        port: this.config.imap.port,
        tls: this.config.imap.tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
        connTimeout: 15000
      });

      this.imap.once('ready', () => { this._connected = true; resolve(); });
      this.imap.once('error', (err) => { this._connected = false; reject(err); });
      this.imap.once('end', () => { this._connected = false; });
      this.imap.connect();
    });
  }

  disconnect() {
    if (this.imap) {
      try { this.imap.end(); } catch (e) { /* ignore */ }
    }
    this._connected = false;
  }

  async _ensureConnected() {
    if (!this._connected || !this.imap || this.imap.state === 'disconnected') {
      await this.connect();
    }
  }

  _openBox(folder) {
    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  async fetchEmails(folder = 'INBOX', page = 1, perPage = 50) {
    await this._ensureConnected();
    const box = await this._openBox(folder);
    const total = box.messages.total;

    if (total === 0) return [];

    const end = Math.max(total - (page - 1) * perPage, 1);
    const start = Math.max(end - perPage + 1, 1);

    return new Promise((resolve, reject) => {
      const emails = [];
      let pending = 0;
      let fetchEnded = false;
      const fetch = this.imap.seq.fetch(`${start}:${end}`, {
        bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
        struct: false
      });

      const tryResolve = () => {
        if (fetchEnded && pending === 0) {
          emails.sort((a, b) => (b.uid || 0) - (a.uid || 0));
          resolve(emails);
        }
      };

      fetch.on('message', (msg, seqno) => {
        const email = { seqno };
        pending++;
        let headerBuf = Buffer.alloc(0);

        msg.on('body', (stream) => {
          const chunks = [];
          stream.on('data', (chunk) => { chunks.push(chunk); });
          stream.on('end', () => {
            headerBuf = Buffer.concat(chunks);
          });
        });

        msg.once('attributes', (attrs) => {
          email.uid = attrs.uid;
          email.flags = attrs.flags;
          email.date = attrs.date;
        });

        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(headerBuf, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
            email.from = parsed.from?.text || '';
            email.to = parsed.to?.text || '';
            email.subject = parsed.subject || '';
            email.dateStr = parsed.date?.toISOString() || '';
          } catch (e) {
            email.subject = '(Parse error)';
          }
          email.seen = (email.flags || []).includes('\\Seen');
          email.flagged = (email.flags || []).includes('\\Flagged');
          emails.push(email);
          pending--;
          tryResolve();
        });
      });

      fetch.once('error', reject);
      fetch.once('end', () => {
        fetchEnded = true;
        tryResolve();
      });
    });
  }

  async fetchEmail(uid, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);

    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(uid, { bodies: '', struct: true });

      fetch.on('message', (msg) => {
        const chunks = [];

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => { chunks.push(chunk); });
        });

        msg.once('attributes', (attrs) => {
          msg._attrs = attrs;
        });

        msg.once('end', async () => {
          try {
            const rawBuffer = Buffer.concat(chunks);
            const parsed = await simpleParser(rawBuffer);

            // Resolve cid: image references to data URIs
            let html = parsed.html || '';
            if (html && parsed.attachments) {
              for (const att of parsed.attachments) {
                if (att.contentId) {
                  const cid = att.contentId.replace(/[<>]/g, '');
                  const dataUri = `data:${att.contentType};base64,${att.content.toString('base64')}`;
                  html = html.split(`cid:${cid}`).join(dataUri);
                }
              }
            }

            resolve({
              uid,
              from: parsed.from?.text || '',
              fromAddress: parsed.from?.value?.[0]?.address || '',
              to: parsed.to?.text || '',
              cc: parsed.cc?.text || '',
              subject: parsed.subject || '(No Subject)',
              date: parsed.date?.toISOString() || '',
              html: html,
              text: parsed.text || '',
              attachments: (parsed.attachments || []).map(a => ({
                filename: a.filename,
                size: a.size,
                contentType: a.contentType,
                content: a.content ? a.content.toString('base64') : null
              }))
            });
          } catch (e) {
            reject(e);
          }
        });
      });

      fetch.once('error', reject);
    });
  }

  async sendEmail(emailData) {
    const transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.accountData.email,
        pass: this.accountData.password
      },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"${this.accountData.name || this.accountData.email}" <${this.accountData.email}>`,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html || undefined
    };

    if (emailData.cc) mailOptions.cc = emailData.cc;
    if (emailData.bcc) mailOptions.bcc = emailData.bcc;
    if (emailData.inReplyTo) mailOptions.inReplyTo = emailData.inReplyTo;
    if (emailData.references) mailOptions.references = emailData.references;

    if (emailData.attachments && emailData.attachments.length > 0) {
      mailOptions.attachments = emailData.attachments.map(a => ({
        filename: a.filename,
        path: a.path
      }));
    }

    await transporter.sendMail(mailOptions);
    transporter.close();
  }

  async getFolders() {
    return new Promise((resolve, reject) => {
      this.imap.getBoxes((err, boxes) => {
        if (err) return reject(err);
        const folders = [];
        const parseBoxes = (boxObj, prefix = '') => {
          for (const [name, box] of Object.entries(boxObj)) {
            const fullName = prefix ? `${prefix}${box.delimiter}${name}` : name;
            folders.push({
              name: name,
              path: fullName,
              delimiter: box.delimiter,
              flags: box.attribs
            });
            if (box.children) {
              parseBoxes(box.children, fullName);
            }
          }
        };
        parseBoxes(boxes);
        resolve(folders);
      });
    });
  }

  // Check for new emails (returns count of unseen)
  async checkNewEmails(folder = 'INBOX') {
    await this._ensureConnected();
    const box = await this._openBox(folder);
    return { total: box.messages.total, unseen: box.messages.new || 0 };
  }

  // Get latest N email headers (for notification)
  async getLatestHeaders(folder = 'INBOX', count = 5) {
    await this._ensureConnected();
    const box = await this._openBox(folder);
    const total = box.messages.total;
    if (total === 0) return [];
    const start = Math.max(total - count + 1, 1);

    return new Promise((resolve, reject) => {
      const emails = [];
      let pending = 0;
      let fetchEnded = false;
      const fetch = this.imap.seq.fetch(`${start}:${total}`, {
        bodies: 'HEADER.FIELDS (FROM SUBJECT DATE)',
        struct: false
      });

      const tryResolve = () => {
        if (fetchEnded && pending === 0) {
          emails.sort((a, b) => (b.uid || 0) - (a.uid || 0));
          resolve(emails);
        }
      };

      fetch.on('message', (msg) => {
        const email = {};
        pending++;
        msg.on('body', (stream) => {
          const chunks = [];
          stream.on('data', (chunk) => { chunks.push(chunk); });
          stream.on('end', () => { email._buf = Buffer.concat(chunks); });
        });
        msg.once('attributes', (attrs) => {
          email.uid = attrs.uid;
          email.flags = attrs.flags;
        });
        msg.once('end', async () => {
          try {
            const parsed = await simpleParser(email._buf || Buffer.alloc(0), { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
            email.from = parsed.from?.text || '';
            email.subject = parsed.subject || '';
          } catch (e) {}
          delete email._buf;
          email.seen = (email.flags || []).includes('\\Seen');
          emails.push(email);
          pending--;
          tryResolve();
        });
      });
      fetch.once('error', reject);
      fetch.once('end', () => { fetchEnded = true; tryResolve(); });
    });
  }

  async deleteEmail(uid, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Deleted'], (err) => {
        if (err) return reject(err);
        this.imap.expunge((err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  }

  async deleteMultipleEmails(uids, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uids, ['\\Deleted'], (err) => {
        if (err) return reject(err);
        this.imap.expunge((err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  }

  async getNonFlaggedUids(folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      this.imap.search([['UNFLAGGED']], (err, uids) => {
        if (err) return reject(err);
        resolve(uids || []);
      });
    });
  }

  async markAsRead(uid, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async markStarred(uid, starred, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      const method = starred ? 'addFlags' : 'delFlags';
      this.imap[method](uid, ['\\Flagged'], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async searchEmails(query, folder = 'INBOX') {
    await this._ensureConnected();
    await this._openBox(folder);
    return new Promise((resolve, reject) => {
      const criteria = [['OR', ['FROM', query], ['SUBJECT', query]]];
      this.imap.search(criteria, (err, uids) => {
        if (err) return reject(err);
        if (!uids || uids.length === 0) return resolve([]);

        const emails = [];
        let pending = 0;
        let fetchEnded = false;
        const fetch = this.imap.fetch(uids.slice(-50), {
          bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
          struct: false
        });

        const tryResolve = () => {
          if (fetchEnded && pending === 0) {
            emails.sort((a, b) => (b.uid || 0) - (a.uid || 0));
            resolve(emails);
          }
        };

        fetch.on('message', (msg) => {
          const email = {};
          pending++;

          msg.on('body', (stream) => {
            const chunks = [];
            stream.on('data', (chunk) => { chunks.push(chunk); });
            stream.on('end', () => { email._headerBuf = Buffer.concat(chunks); });
          });

          msg.once('attributes', (attrs) => {
            email.uid = attrs.uid;
            email.flags = attrs.flags;
            email.date = attrs.date;
          });

          msg.once('end', async () => {
            try {
              const parsed = await simpleParser(email._headerBuf || Buffer.alloc(0), { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
              email.from = parsed.from?.text || '';
              email.to = parsed.to?.text || '';
              email.subject = parsed.subject || '';
              email.dateStr = parsed.date?.toISOString() || '';
            } catch (e) {
              email.subject = '(Parse error)';
            }
            delete email._headerBuf;
            email.seen = (email.flags || []).includes('\\Seen');
            email.flagged = (email.flags || []).includes('\\Flagged');
            emails.push(email);
            pending--;
            tryResolve();
          });
        });

        fetch.once('error', reject);
        fetch.once('end', () => {
          fetchEnded = true;
          tryResolve();
        });
      });
    });
  }
}

module.exports = EmailService;
