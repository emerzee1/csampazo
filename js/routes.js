// Csámpázó - Routes & Walks Manager Module
(function (window) {
  'use strict';

  const STORAGE_KEY = 'csampazo_routes_data_v1';

  const INITIAL_ROUTES = [
    {
      id: 'utvonal_margitsziget_rozsakert_01',
      title: 'Margitsziget - Rózsakert Kímélő Séta (100 m)',
      distanceKm: 0.1,
      distanceMeters: 100,
      elevationM: 0,
      durationMin: 3,
      difficulty: 'SM Kímélő (Könnyű)',
      type: 'Akadálymentes, Sétány',
      tags: ['#100m_alapteszt', '#padok', '#sík', '#biztonságos'],
      rating: 5,
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
      description: 'Ideális 100 méteres SM alapteszt sétaútvonal a Margitszigeti Rózsakert mentén. Sima aszfalt, 35 és 70 méternél háttámlás padokkal a pihenéshez. Nincsenek lépcsők vagy szintkülönbségek.'
    },
    {
      id: 'utvonal_varosliget_topart_02',
      title: 'Városliget - Tóparti Kímélő Sétány (150 m)',
      distanceKm: 0.15,
      distanceMeters: 150,
      elevationM: 0,
      durationMin: 4,
      difficulty: 'SM Kímélő (Könnyű)',
      type: 'Park, Vízpart',
      tags: ['#tópart', '#akadálymentes', '#pihenőhelyek'],
      rating: 5,
      imageUrl: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&q=80',
      description: 'Csendes, tóparti séta a Millennium Háza és a tó között. Sima térkő burkolat, sűrűn elhelyezett pihenőpadok, tiszta levegő és zöld környezet.'
    },
    {
      id: 'utvonal_millenaris_03',
      title: 'Millenáris Park - Tavak körüli Séta (120 m)',
      distanceKm: 0.12,
      distanceMeters: 120,
      elevationM: 0,
      durationMin: 3,
      difficulty: 'SM Kímélő (Könnyű)',
      type: 'Városi park, Sík',
      tags: ['#modern', '#sík', '#padok'],
      rating: 4,
      imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
      description: 'Kellemes bel-budai kímélő séta a Millenáris Park dísztavai mentén. Tökéletes burkolat, szélvédett részek, kényelmes pihenőkkel.'
    },
    {
      id: 'utvonal_normafa_terasz_04',
      title: 'Normafa - Panoráma Terasz Kímélő Séta (80 m)',
      distanceKm: 0.08,
      distanceMeters: 80,
      elevationM: 0,
      durationMin: 2,
      difficulty: 'SM Kímélő (Rövid)',
      type: 'Természet, Kilátó',
      tags: ['#friss_levegő', '#rövid', '#padok', '#panoráma'],
      rating: 5,
      imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
      description: 'Rövid, 80 méteres kényelmes séta a Normafa síház előtti sík gumiburkolatú sétányon. Friss hegyi levegő és panoráma megerőltető túrázás nélkül.'
    }
  ];

  class RoutesManager {
    constructor() {
      this.listeners = [];
      this._init();
    }

    _init() {
      const routes = this.getRoutes();
      if (!routes || routes.length === 0) {
        this.saveRoutes(INITIAL_ROUTES);
      }
    }

    subscribe(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter(l => l !== listener);
      };
    }

    _notify(event, data) {
      this.listeners.forEach(fn => {
        try { fn(event, data); } catch (e) { console.error('RoutesManager listener error:', e); }
      });
    }

    getRoutes() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : INITIAL_ROUTES;
      } catch (e) {
        return INITIAL_ROUTES;
      }
    }

    saveRoutes(routes) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
      this._notify('routes_changed', routes);
      this.syncToServer();
    }

    addRoute(route) {
      const routes = this.getRoutes();
      const newRoute = {
        id: 'utvonal_' + Date.now(),
        title: route.title || 'Új sétaútvonal',
        distanceKm: parseFloat(route.distanceKm) || 5.0,
        elevationM: parseInt(route.elevationM, 10) || 0,
        durationMin: parseInt(route.durationMin, 10) || 60,
        difficulty: route.difficulty || 'Könnyű',
        type: route.type || 'Séta',
        tags: Array.isArray(route.tags) ? route.tags : (route.tags ? route.tags.split(' ').filter(Boolean) : []),
        rating: parseInt(route.rating, 10) || 5,
        imageUrl: route.imageUrl || 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
        description: route.description || ''
      };
      routes.unshift(newRoute);
      this.saveRoutes(routes);
      return newRoute;
    }

    deleteRoute(id) {
      let routes = this.getRoutes();
      routes = routes.filter(r => r.id !== id);
      this.saveRoutes(routes);
    }

    // --- TXT FORMAT SERIALIZER & PARSER ---
    serializeToTxt() {
      const routes = this.getRoutes();
      let lines = [
        '# ========================================================',
        '# CSÁMPÁZÓ - SÉTA- ÉS TÚRAÚTVONALAK (csampazo_utvonalak.txt)',
        '# Nyisd meg és szerkeszd Jegyzettömbben vagy az alkalmazásban!',
        '# ========================================================',
        ''
      ];

      routes.forEach(r => {
        lines.push('[UTVONAL]');
        lines.push(`ID: ${r.id}`);
        lines.push(`CIM: ${r.title}`);
        lines.push(`TAV: ${r.distanceKm} km`);
        lines.push(`SZINT: +${r.elevationM || 0} m`);
        lines.push(`IDO: ${r.durationMin} perc`);
        lines.push(`NEHEZSEG: ${r.difficulty}`);
        lines.push(`TIPUS: ${r.type}`);
        lines.push(`CIMKE: ${(r.tags || []).join(' ')}`);
        lines.push(`ERTEKELES: ${r.rating}`);
        lines.push(`FOTO: ${r.imageUrl || ''}`);
        lines.push('LEIRAS:');
        lines.push(r.description || '');
        lines.push('[/UTVONAL]');
        lines.push('');
      });

      return lines.join('\n');
    }

    parseFromTxt(text) {
      if (!text || typeof text !== 'string') return null;
      const blocks = text.split('[UTVONAL]');
      const parsed = [];

      blocks.forEach(block => {
        if (!block.includes('[/UTVONAL]')) return;
        const inner = block.split('[/UTVONAL]')[0].trim();
        const lines = inner.split(/\r?\n/);
        const item = {
          tags: []
        };
        let isDesc = false;
        let descLines = [];

        lines.forEach(l => {
          const trimmed = l.trim();
          if (isDesc) {
            descLines.push(l);
            return;
          }

          if (trimmed.startsWith('ID:')) item.id = trimmed.replace('ID:', '').trim();
          else if (trimmed.startsWith('CIM:')) item.title = trimmed.replace('CIM:', '').trim();
          else if (trimmed.startsWith('TAV:')) item.distanceKm = parseFloat(trimmed.replace('TAV:', '').replace('km', '').trim()) || 0;
          else if (trimmed.startsWith('SZINT:')) item.elevationM = parseInt(trimmed.replace('SZINT:', '').replace('+', '').replace('m', '').trim(), 10) || 0;
          else if (trimmed.startsWith('IDO:')) item.durationMin = parseInt(trimmed.replace('IDO:', '').replace('perc', '').trim(), 10) || 0;
          else if (trimmed.startsWith('NEHEZSEG:')) item.difficulty = trimmed.replace('NEHEZSEG:', '').trim();
          else if (trimmed.startsWith('TIPUS:')) item.type = trimmed.replace('TIPUS:', '').trim();
          else if (trimmed.startsWith('CIMKE:')) item.tags = trimmed.replace('CIMKE:', '').trim().split(' ').filter(Boolean);
          else if (trimmed.startsWith('ERTEKELES:')) item.rating = parseInt(trimmed.replace('ERTEKELES:', '').trim(), 10) || 5;
          else if (trimmed.startsWith('FOTO:')) item.imageUrl = trimmed.replace('FOTO:', '').trim();
          else if (trimmed === 'LEIRAS:') isDesc = true;
        });

        item.description = descLines.join('\n').trim();
        if (item.title) parsed.push(item);
      });

      if (parsed.length > 0) {
        this.saveRoutes(parsed);
      }
      return parsed;
    }

    async syncToServer() {
      try {
        const txt = this.serializeToTxt();
        await fetch('/api/save-routes', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: txt
        });
      } catch (e) {
        // silent if offline
      }
    }
  }

  window.CsampazoRoutesManager = RoutesManager;
})(window);
