// Csámpázó - Google Drive Direct Cloud Sync Module (GIS + Drive API v3)
(function (window) {
  'use strict';

  const STORAGE_KEYS = {
    CLIENT_ID: 'csampazo_gdrive_client_id_v1',
    ACCESS_TOKEN: 'csampazo_gdrive_token_v1',
    TOKEN_EXPIRES: 'csampazo_gdrive_token_exp_v1',
    USER_EMAIL: 'csampazo_gdrive_email_v1',
    AUTO_SYNC: 'csampazo_gdrive_auto_v1'
  };

  const FILE_NAMES = {
    LOG: 'csampazo_naplo.txt',
    ROUTES: 'csampazo_utvonalak.txt'
  };

  const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

  class GoogleDriveSync {
    constructor() {
      this.tokenClient = null;
      this.isSyncing = false;
      this.listeners = [];
    }

    getClientId() {
      return localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '';
    }

    setClientId(id) {
      localStorage.setItem(STORAGE_KEYS.CLIENT_ID, (id || '').trim());
    }

    getUserEmail() {
      return localStorage.getItem(STORAGE_KEYS.USER_EMAIL) || '';
    }

    isConnected() {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const expires = parseInt(localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRES), 10) || 0;
      return !!(token && Date.now() < expires);
    }

    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    _notify(event, data) {
      this.listeners.forEach(fn => {
        try { fn(event, data); } catch (e) { console.error('GDrive listener error:', e); }
      });
    }

    initTokenClient(callback) {
      const clientId = this.getClientId();
      if (!clientId || !window.google?.accounts?.oauth2) {
        return false;
      }

      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) {
            console.error('Google Auth Error:', resp);
            this._notify('auth_error', resp);
            return;
          }
          const expiresAt = Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000;
          localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, resp.access_token);
          localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRES, expiresAt.toString());

          // Fetch user info
          this._fetchUserInfo(resp.access_token);
          this._notify('connected', true);
          if (callback) callback();
        }
      });
      return true;
    }

    requestLogin() {
      if (!this.initTokenClient()) {
        throw new Error('Adj meg egy érvényes Google OAuth Client ID-t a Beállításokban!');
      }
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    async _fetchUserInfo(token) {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const user = await res.json();
          if (user.email) {
            localStorage.setItem(STORAGE_KEYS.USER_EMAIL, user.email);
            this._notify('user_info', user);
          }
        }
      } catch (e) {
        console.warn('Could not fetch user info:', e);
      }
    }

    disconnect() {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRES);
      localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
      this._notify('disconnected', true);
    }

    async uploadFile(filename, content) {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) throw new Error('Nincs érvényes Google bejelentkezés');

      // Check if file exists in drive
      const query = encodeURIComponent(`name = '${filename}' and trashed = false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await searchRes.json();
      const existingFile = data.files && data.files.length > 0 ? data.files[0] : null;

      if (existingFile) {
        // Update
        const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'text/plain; charset=utf-8'
          },
          body: content
        });
        return updateRes.ok;
      } else {
        // Create multipart
        const metadata = { name: filename, mimeType: 'text/plain' };
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelim = "\r\n--" + boundary + "--";

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
          content +
          closeDelim;

        const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
        return createRes.ok;
      }
    }

    async downloadFile(filename) {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) throw new Error('Nincs érvényes Google bejelentkezés');

      const query = encodeURIComponent(`name = '${filename}' and trashed = false`);
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await searchRes.json();
      const existingFile = data.files && data.files.length > 0 ? data.files[0] : null;

      if (!existingFile) return null;

      const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fileRes.ok) {
        return await fileRes.text();
      }
      return null;
    }
  }

  window.CsampazoGDriveSync = GoogleDriveSync;
})(window);
