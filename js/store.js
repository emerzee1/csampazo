// Csámpázó - Data Store, Local Storage & TXT File Sync Module
(function (window) {
  'use strict';

  const STORAGE_KEYS = {
    ENTRIES: 'csampazo_entries_v1',
    PROFILE: 'csampazo_profile_v1',
    PROFILES_LIST: 'csampazo_profiles_list_v1',
    ACTIVE_PROFILE_ID: 'csampazo_active_profile_id_v1',
    LAST_SERVER_SYNC: 'csampazo_last_server_sync_v1'
  };

  const DEFAULT_PROFILE = {
    id: 'user_default',
    name: 'Péter',
    avatar: '👟',
    height: 180, // cm
    weight: 78.0, // kg
    dailyStepGoal: 150, // SM alapteszthez tartozó lépésszám
    dailyMeterGoal: 100, // 100 méter SM alaptáv
    strideLength: 65, // cm (SM óvatosabb lépéshossz)
    createdAt: Date.now()
  };

  const SAMPLE_ENTRIES = [
    {
      id: 'entry_20261006',
      date: '2026-10-06',
      steps: 135,
      km: 0.09,
      meters: 92,
      minutes: 2.7,
      type: '100m SM Alapteszt',
      rests: 1,
      kcal: 18,
      tags: ['#könnyű', '#reggel'],
      notes: '15 mp pihenő a padnál 60 méternél, jó egyensúly'
    },
    {
      id: 'entry_20261007',
      date: '2026-10-07',
      steps: 152,
      km: 0.10,
      meters: 104,
      minutes: 3.1,
      type: '100m SM Alapteszt',
      rests: 2,
      kcal: 22,
      tags: ['#cél_teljesítve', '#délután'],
      notes: 'Sikeres 100 méter, két rövid megállással stabil járás'
    },
    {
      id: 'entry_20261008',
      date: '2026-10-08',
      steps: 98,
      km: 0.07,
      meters: 65,
      minutes: 1.9,
      type: 'Kímélő séta',
      rests: 1,
      kcal: 14,
      tags: ['#fáradékonyság'],
      notes: 'Enyhe lábnehezedés miatt ma 65 méternél megálltam'
    },
    {
      id: 'entry_20261009',
      date: '2026-10-09',
      steps: 148,
      km: 0.10,
      meters: 101,
      minutes: 2.8,
      type: '100m SM Alapteszt',
      rests: 1,
      kcal: 21,
      tags: ['#jó_forma', '#park'],
      notes: 'Margitszigeti rózsakert mellett, szép egyenletes lépések'
    },
    {
      id: 'entry_20261010',
      date: '2026-10-10',
      steps: 185,
      km: 0.13,
      meters: 125,
      minutes: 3.5,
      type: 'Növelt táv',
      rests: 2,
      kcal: 28,
      tags: ['#hétvége', '#rekord'],
      notes: 'Új rekord: 125 méter! Két pihenővel kényelmesen ment'
    },
    {
      id: 'entry_20261011',
      date: '2026-10-11',
      steps: 140,
      km: 0.10,
      meters: 95,
      minutes: 2.7,
      type: '100m SM Alapteszt',
      rests: 1,
      kcal: 20,
      tags: ['#gyógytorna'],
      notes: 'Gyógytorna utáni kímélő séta, jó közérzet'
    },
    {
      id: 'entry_20261012',
      date: '2026-10-12',
      steps: 158,
      km: 0.11,
      meters: 110,
      minutes: 3.2,
      type: '100m SM Alapteszt',
      rests: 1,
      kcal: 24,
      tags: ['#mai_séta', '#térkép'],
      notes: 'Mai térképes séta elmentve a naplóba, 100 méter felett!'
    }
  ];

  class Store {
    constructor() {
      this.listeners = [];
      this.isServerConnected = false;
      this._init();
    }

    _init() {
      // Check profiles
      let profiles = this.getProfiles();
      if (!profiles || profiles.length === 0) {
        profiles = [DEFAULT_PROFILE];
        localStorage.setItem(STORAGE_KEYS.PROFILES_LIST, JSON.stringify(profiles));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, DEFAULT_PROFILE.id);
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(DEFAULT_PROFILE));
      }

      // Check entries
      let entries = this.getEntries();
      if (!entries || entries.length === 0) {
        this.saveEntries(SAMPLE_ENTRIES);
      }

      // Auto ping server to check if server.ps1 is running
      this.checkServerConnection();
    }

    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    _notify(event, data) {
      this.listeners.forEach(fn => {
        try { fn(event, data); } catch (e) { console.error('Store listener error:', e); }
      });
    }

    // --- PROFILES ---
    getProfiles() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROFILES_LIST);
        return raw ? JSON.parse(raw) : [DEFAULT_PROFILE];
      } catch (e) {
        return [DEFAULT_PROFILE];
      }
    }

    getActiveProfile() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
        return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
      } catch (e) {
        return DEFAULT_PROFILE;
      }
    }

    updateActiveProfile(updates) {
      const current = this.getActiveProfile();
      const updated = { ...current, ...updates };
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));

      // Also update in profiles list
      const list = this.getProfiles().map(p => p.id === updated.id ? updated : p);
      localStorage.setItem(STORAGE_KEYS.PROFILES_LIST, JSON.stringify(list));

      this._notify('profile_changed', updated);
      this.syncToServer();
      return updated;
    }

    // --- ENTRIES (WALKS & STEPS) ---
    getEntries() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.ENTRIES);
        const entries = raw ? JSON.parse(raw) : [];
        return entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      } catch (e) {
        return [];
      }
    }

    saveEntries(entries) {
      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
      this._notify('entries_changed', entries);
      this.syncToServer();
    }

    addEntry(entry) {
      const entries = this.getEntries();
      const newEntry = {
        id: 'entry_' + Date.now(),
        date: entry.date || new Date().toISOString().split('T')[0],
        steps: parseInt(entry.steps, 10) || 0,
        km: parseFloat(entry.km) || this.estimateKm(entry.steps),
        minutes: parseInt(entry.minutes, 10) || 0,
        type: entry.type || 'Séta',
        kcal: parseInt(entry.kcal, 10) || this.estimateKcal(entry.steps, entry.minutes),
        tags: Array.isArray(entry.tags) ? entry.tags : (entry.tags ? entry.tags.split(' ').filter(Boolean) : []),
        notes: entry.notes || ''
      };

      // Check if entry for date already exists, merge or append
      const existingIdx = entries.findIndex(e => e.date === newEntry.date);
      if (existingIdx >= 0) {
        entries[existingIdx] = { ...entries[existingIdx], ...newEntry };
      } else {
        entries.unshift(newEntry);
      }

      this.saveEntries(entries);
      return newEntry;
    }

    updateEntry(id, updates) {
      let entries = this.getEntries();
      entries = entries.map(e => e.id === id ? { ...e, ...updates } : e);
      this.saveEntries(entries);
    }

    deleteEntry(id) {
      let entries = this.getEntries();
      entries = entries.filter(e => e.id !== id);
      this.saveEntries(entries);
    }

    // Helper: Estimate distance in km from steps
    estimateKm(steps) {
      const profile = this.getActiveProfile();
      const strideCm = profile.strideLength || (profile.height ? profile.height * 0.415 : 75);
      return Math.round((steps * strideCm / 100000) * 10) / 10;
    }

    // Helper: Estimate calories
    estimateKcal(steps, minutes) {
      const profile = this.getActiveProfile();
      const weight = profile.weight || 75;
      // Walking burning approx ~0.04 - 0.05 kcal per step based on body weight
      const kcalFromSteps = Math.round(steps * 0.04 * (weight / 70));
      return kcalFromSteps || 250;
    }

    // --- TXT FORMAT SERIALIZER & PARSER ---
    serializeToTxt() {
      const profile = this.getActiveProfile();
      const entries = this.getEntries();

      let lines = [
        '# ========================================================',
        '# CSÁMPÁZÓ - LÉPÉS ÉS SÉTANAPLÓ (csampazo_naplo.txt)',
        '# Nyisd meg és szerkeszd Jegyzettömbben (Notepad) vagy a Google Drive-on!',
        '# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (km) | IDŐ (perc) | TÍPUS | KALÓRIA (kcal) | CÍMKÉK | JEGYZET',
        '# ========================================================',
        `# PROFIL: Név: ${profile.name || 'Péter'} | Magasság: ${profile.height || 180} cm | Testsúly: ${profile.weight || 78} kg | Napi cél: ${profile.dailyStepGoal || 10000} | Lépéshossz: ${profile.strideLength || 75} cm`,
        '# --------------------------------------------------------'
      ];

      entries.forEach(e => {
        const tagsStr = (e.tags || []).join(' ');
        const line = `${e.date} | ${e.steps} | ${e.km} | ${e.minutes} | ${e.type || 'Séta'} | ${e.kcal || 0} | ${tagsStr} | ${e.notes || ''}`;
        lines.push(line);
      });

      return lines.join('\n');
    }

    parseFromTxt(text) {
      if (!text || typeof text !== 'string') return null;

      const lines = text.split(/\r?\n/);
      const parsedEntries = [];
      const profileUpdates = {};

      lines.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;

        // Check header profile
        if (line.startsWith('# PROFIL:')) {
          const parts = line.replace('# PROFIL:', '').split('|');
          parts.forEach(p => {
            const [k, v] = p.split(':').map(s => s && s.trim());
            if (k && v) {
              if (k.toLowerCase().includes('név')) profileUpdates.name = v;
              if (k.toLowerCase().includes('magasság')) profileUpdates.height = parseInt(v, 10);
              if (k.toLowerCase().includes('testsúly') || k.toLowerCase().includes('súly')) profileUpdates.weight = parseFloat(v);
              if (k.toLowerCase().includes('cél')) profileUpdates.dailyStepGoal = parseInt(v, 10);
              if (k.toLowerCase().includes('hossz')) profileUpdates.strideLength = parseInt(v, 10);
            }
          });
          return;
        }

        // Ignore comment lines
        if (line.startsWith('#')) return;

        // Entry line: DÁTUM | LÉPÉSSZÁM | TÁV | IDŐ | TÍPUS | KALÓRIA | CÍMKÉK | JEGYZET
        const parts = line.split('|').map(s => s.trim());
        if (parts.length >= 2) {
          const date = parts[0];
          const steps = parseInt(parts[1], 10) || 0;
          const km = parts.length > 2 ? (parseFloat(parts[2]) || 0) : 0;
          const minutes = parts.length > 3 ? (parseInt(parts[3], 10) || 0) : 0;
          const type = parts.length > 4 && parts[4] ? parts[4] : 'Séta';
          const kcal = parts.length > 5 ? (parseInt(parts[5], 10) || 0) : 0;
          const tags = parts.length > 6 && parts[6] ? parts[6].split(' ').filter(Boolean) : [];
          const notes = parts.length > 7 ? parts.slice(7).join(' | ') : '';

          if (date && date.match(/^\d{4}-\d{2}-\d{2}/)) {
            parsedEntries.push({
              id: 'entry_' + date.replace(/[^0-9]/g, ''),
              date: date.substring(0, 10),
              steps,
              km,
              minutes,
              type,
              kcal,
              tags,
              notes
            });
          }
        }
      });

      if (Object.keys(profileUpdates).length > 0) {
        this.updateActiveProfile(profileUpdates);
      }

      if (parsedEntries.length > 0) {
        this.saveEntries(parsedEntries);
      }

      return { entries: parsedEntries, profile: profileUpdates };
    }

    // --- SERVER SYNC (server.ps1 HTTP API) ---
    async checkServerConnection() {
      try {
        const res = await fetch('/api/status', { method: 'GET' });
        if (res.ok) {
          this.isServerConnected = true;
          this._notify('server_connected', true);
          return true;
        }
      } catch (e) {
        this.isServerConnected = false;
        this._notify('server_connected', false);
      }
      return false;
    }

    async syncToServer() {
      if (!this.isServerConnected) {
        const isAlive = await this.checkServerConnection();
        if (!isAlive) return false;
      }

      try {
        const txt = this.serializeToTxt();
        const res = await fetch('/api/save-log', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: txt
        });
        if (res.ok) {
          localStorage.setItem(STORAGE_KEYS.LAST_SERVER_SYNC, new Date().toISOString());
          this._notify('server_synced', true);
          return true;
        }
      } catch (e) {
        console.warn('Sync to server failed:', e);
      }
      return false;
    }

    async pullFromServer() {
      try {
        const res = await fetch('/api/get-log');
        if (res.ok) {
          const txt = await res.text();
          if (txt && txt.trim().length > 0) {
            this.parseFromTxt(txt);
            return true;
          }
        }
      } catch (e) {
        console.warn('Pull from server failed:', e);
      }
      return false;
    }
  }

  window.CsampazoStore = Store;
})(window);
