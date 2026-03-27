<div align="center">

# MailLoader


**Modern Masaüstü E-posta İstemcisi**

*Geliştirildi & Lisanslandı: **VULPAX digital** — 2026*

---

</div>

## 📦 Kurulum (Son Kullanıcı)

> Geliştirici değilseniz — sadece programı kullanmak istiyorsanız:

1. `dist` klasöründeki **`MailLoader Setup 1.0.2.exe`** dosyasına çift tıklayın bulamazsanız direkt ** https://drive.google.com/file/d/1wE7bYj3B1DauAfTqbVO42wMNKG4mQrq0/view?usp=sharing ** linki ile indirebilirsiniz. 
2. Kurulum sihirbazını takip edin, kurulum klasörünü seçin
3. **Kur** butonuna basın — kurulum 30 saniyede tamamlanır
4. Masaüstündeki **MailLoader** ikonuna çift tıklayıp açın
5. E-posta adresinizi, adınızı ve şifrenizi (uygulama şifresi) girin

---

## ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| 📥 **E-posta Okuma** | Gelen kutusu, gönderilenler, spam ve tüm klasörler |
| 📤 **E-posta Gönderme** | Yeni e-posta yaz, dosya ekle ve gönder |
| ↩️ **Yanıtla / İlet** | E-postalara yanıt ver veya başkalarına ilet |
| 📎 **Ek İndirme** | Gelen e-postalardaki ekleri kaydet |
| 🖼️ **HTML E-posta** | Resimli ve biçimli e-postaları tam görüntüle |
| 🔗 **Link Açma** | E-posta içindeki linklere tıklayarak tarayıcıda aç |
| 👥 **Kişiler** | Sol panelden kişi ekle, kaldır, mail gönder |
| 🔔 **Bildirimler** | Yeni e-posta gelince sistem bildirimi + ses |
| 🔇 **Sistem Tepsisi** | Kapatınca arka planda çalışmaya devam eder |
| 🎨 **3 Tema** | Açık / Koyu / Gece modu |
| 🌈 **Vurgu Rengi** | 8 hazır renk + özel renk seçici |
| 🖼️ **Arkaplan Resmi** | Kendi resminizi arkaplan yapın |
| ✨ **Efektler** | Glass (buzlu cam) ve Liquid (sıvı) animasyon |
| 🔤 **İkon Seçimi** | logo.ico ve logob.ico arasında geçiş |
| 👥 **Çoklu Hesap** | Birden fazla hesap ekle, aralarında geçiş yap |
| 🔍 **Arama** | Gelen kutusunda anlık e-posta arama |
| ⭐ **Yıldızlama** | Önemli e-postaları yıldızla |
| 🗑️ **Silme** | E-postaları sil |
| ☑️ **Toplu Silme** | Seçerek birden fazla e-postayı toplu sil |
| 🛡️ **Favoriler Hariç Sil** | Yıldızlı e-postalar korunarak geri kalanı sil |
| 📝 **Hazır Yanıtlar** | Şablon mesajlar kaydet, yazarken hızlıca ekle |
| ⚙️ **Ayarlar Paneli** | Hazır yanıt ve Google Drive API ayarları |
| ☁️ **Google Drive** | Drive dosyalarını görüntüle, yükle ve indir |

---

## 📧 Desteklenen Sağlayıcılar

| Sağlayıcı | IMAP | SMTP |
|-----------|------|------|
| **Gmail** | `imap.gmail.com:993` | `smtp.gmail.com:587` |
| **Outlook / Hotmail** | `outlook.office365.com:993` | `smtp.office365.com:587` |
| **Yahoo Mail** | `imap.mail.yahoo.com:993` | `smtp.mail.yahoo.com:587` |
| **Yandex Mail** | `imap.yandex.com:993` | `smtp.yandex.com:465` |
| **Özel Sunucu** | Elle girilebilir | Elle girilebilir |

---

## 🔑 Gmail Uygulama Şifresi

Gmail normal şifrenizle çalışmaz. Uygulama şifresi gereklidir:

1. [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) adresine gidin
2. **2 Adımlı Doğrulama** açık olmalı
3. Uygulama adı olarak `MailLoader` yazın → **Oluştur**
4. Oluşturulan **16 haneli şifreyi** MailLoader'a girin

---

## ⌨️ Klavye Kısayolları

| Kısayol | İşlev |
|---------|-------|
| `Ctrl + N` | Yeni e-posta |
| `Ctrl + R` | Açık e-postayı yanıtla |
| `Escape` | Pencereyi kapat / Geri dön |

---

## 📁 Proje Yapısı

```
mailloader/
├── main.js               ← Electron ana süreç, IPC, tray, bildirimler
├── preload.js            ← Güvenli context bridge
├── package.json          ← Bağımlılıklar ve builder yapılandırması
├── LICENSE               ← MIT — VULPAX digital
├── src/
│   ├── emailService.js   ← IMAP/SMTP servisi
│   └── renderer/
│       ├── index.html    ← Ana arayüz
│       ├── styles.css    ← Tema ve bileşen stilleri
│       └── app.js        ← Arayüz mantığı
└── assets/
    ├── logo.ico          ← Uygulama ikonu (varsayılan)
    ├── logob.ico         ← Alternatif ikon
    └── sound/
        ├── gelen.wav     ← Gelen mail bildirimi
        └── giden.wav     ← Gönderilen mail sesi
```

---

## 🛠️ Geliştirici Kurulumu

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modunda başlat
npm start

# Windows kurulum EXE'si üret
npm run build
```

> Çıktı: `dist/MailLoader Setup 1.0.0.exe`

---

## 🛡️ Güvenlik

- Context Isolation aktif — renderer izole ortamda çalışır
- Node Integration kapalı — renderer'dan Node.js erişimi yok
- Preload Script üzerinden güvenli IPC köprüsü
- Content Security Policy uygulanmış
- Şifre ve hesap bilgileri `electron-store` ile şifreli olarak yerel depolanır
- Harici bağlantılar yalnızca `https://`, `http://` ve `mailto:` şemaları

---

## 🛠️ Teknolojiler

| Teknoloji | Sürüm | Kullanım |
|-----------|-------|----------|
| **Electron** | 28 | Masaüstü uygulama çerçevesi |
| **imap** | 0.8 | E-posta okuma (IMAP) |
| **nodemailer** | 6.9 | E-posta gönderme (SMTP) |
| **mailparser** | 3.6 | E-posta ve ek ayrıştırma |
| **electron-store** | 8.1 | Şifreli yerel veri depolama |
| **electron-builder** | 24.9 | Windows installer üretimi |

---

## 📝 Lisans

```
MIT License — Copyright (c) 2026 VULPAX digital
```

Bu yazılım özgürce kullanılabilir, değiştirilebilir ve dağıtılabilir.
Detaylar için [LICENSE](LICENSE) dosyasına bakın.

---

<div align="center">

**MailLoader** &nbsp;·&nbsp; Geliştirici: **VULPAX digital** &nbsp;·&nbsp; 2026

</div>
