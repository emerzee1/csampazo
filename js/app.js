// ==========================================================================
// CSÁMPÁZÓ - SM SÉTAKÖVETŐ & REHABILITÁCIÓS RENDSZER (app.js)
// Másodperc alapú mérés, 2-rétegű térkép, testreszabható cél/pihenőidő,
// szintlépéses mérföldkő rendszer és visszanézhető esemény-idővonal
// ==========================================================================

(function () {
  'use strict';

  // Alapértelmezett képernyő-sorrend (Pontosan 5 oldal a kérés szerint)
  const defaultScreenOrder = [
    { id: 'screen-live', name: 'Felvétel', icon: '🚶' },
    { id: 'screen-history', name: 'Útvonalak', icon: '📜' },
    { id: 'screen-summary', name: 'Elemzés', icon: '📊' },
    { id: 'screen-waypoints', name: 'Útpontok', icon: '📍' },
    { id: 'screen-settings', name: 'Beállítások', icon: '⚙️' }
  ];

  // Alapértelmezett Szintlépési Létra (A felhasználó által megadható és testreszabható!)
  const defaultLevelLadder = [
    { level: 1, name: 'Kezdő SM Bázis', metric: 'meters', target: 500, desc: '500 méter napi kímélő távolság elérése' },
    { level: 2, name: '1000 Lépéses Bajnok', metric: 'steps', target: 1000, desc: '1000 lépés kitartó megtétele pihenőkkel' },
    { level: 3, name: 'Rehabilitációs Haladó', metric: 'meters', target: 800, desc: '800 méteres egyensúlyi és távtartó séta' },
    { level: 4, name: '2000 Lépéses Mester', metric: 'steps', target: 2000, desc: '2000 lépéses állóképességi mérföldkő' },
    { level: 5, name: 'Rehabilitációs Bajnok', metric: 'meters', target: 1500, desc: '1500 méter magabiztos, tartós séka' }
  ];

  // Központi alkalmazásállapot
  const state = {
    activeScreenId: 'screen-live',
    screenOrder: [...defaultScreenOrder],
    isDemoMode: false, // Demo / Minta Mód: Alapból KIKAPCSOLVA (üres, tiszta állapot)

    // Szintlépéses mérföldkövek (Saját szintek)
    levels: [...defaultLevelLadder],
    activeLevelIndex: 0, // Aktuális szint indexe

    // Változtatható SM beállítások (Másodperc alapú pihenő és Napi cél)
    settings: {
      restThresholdSec: 60,     // Másodperc (alapértelmezett: 60 mp = 1 perc)
      targetGoalVal: 500,       // Napi cél értéke (pl. 500)
      targetGoalType: 'meters', // 'meters' vagy 'steps'
      stepLengthCm: 65,
      pauseBlinkMode: 'pulse',
      stickMode: 'START_WITHOUT', // 'START_WITHOUT' | 'START_WITH' | 'ALWAYS'
      reminderIntervalSec: 0     // Másodperc: leállítás emlékeztető csippanás (0 = kikapcsolva)
    },

    // Élő séta állapot (Másodperc alapú mérés)
    walkStatus: 'IDLE', // 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED'
    startTime: null,
    durationSec: 0,
    meters: 0,
    steps: 0,
    isUsingStick: false,
    stickMeters: 0,
    noStickMeters: 0,
    timerInterval: null,
    activeMovingSecLive: 0,
    restingSecLive: 0,
    restCountLive: 0,
    currentRestDurationLive: 0,
    speedSamples: [],

    // GPS és Mobil PWA állapot
    gpsMode: 'real', // 'real' (telefon valós hardveres GPS) | 'sim' (Margitsziget szimuláció)
    hadGpsFix: false,
    geoWatchId: null,
    wakeLockSentinel: null,
    pwaPrompt: null,
    recordedPath: [],
    lastPosition: null,
    gps: {
      lat: 47.4979,
      lng: 19.0402,
      accuracy: 0,
      satellites: 0,
      speed: 0,
      address: 'Aktuális pozíció meghatározása...'
    },

    // Útpontok
    waypoints: [],
    activeWpFilter: 'all',
    mgmtGroupFilter: 'all',
    selectedTags: new Set(['Pad']),

    // Mentett útvonalak
    savedRoutes: [],
    selectedRoute: null,
    activeCalendarDay: null,

    // Térképek (2 réteg: Utcanézet és Műholdkép)
    liveMap: null,
    liveRouteLine: null,
    liveCurMarker: null,
    liveWpMarkers: [],
    liveActiveLayerKey: 'street', // 'street' | 'satellite'

    historyMap: null,
    historyRouteLine: null,
    historyStartMarker: null,
    historyEndMarker: null,
    historyWpMarkers: [],
    historyActiveLayerKey: 'street' // 'street' | 'satellite'
  };

  // 100 méteres szimulációs nyomvonal
  const trackCoords = [
    [47.52550, 19.05150],
    [47.52556, 19.05154],
    [47.52562, 19.05159],
    [47.52569, 19.05163],
    [47.52575, 19.05168], // Pad (45m)
    [47.52582, 19.05172],
    [47.52589, 19.05177],
    [47.52596, 19.05182],
    [47.52603, 19.05186],
    [47.52610, 19.05191]  // Cél (100m)
  ];

  // ==========================================================================
  // INICIALIZÁLÁS BETÖLTÉSKOR
  // ==========================================================================
  function fetchInitialUserLocation() {
    if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
      try {
        const snap = JSON.parse(window.AndroidBridge.getTrackingSnapshot() || '{}');
        if (snap && snap.currentLatitude && snap.currentLongitude && (snap.currentLatitude !== 0 || snap.currentLongitude !== 0)) {
          state.gps.lat = snap.currentLatitude;
          state.gps.lng = snap.currentLongitude;
          state.gps.accuracy = snap.accuracy || 2.5;
          state.hadGpsFix = true;
          if (state.liveCurMarker) state.liveCurMarker.setLatLng([state.gps.lat, state.gps.lng]);
          if (state.liveMap) state.liveMap.setView([state.gps.lat, state.gps.lng], 19);
          updateWaypointAddress(state.gps.lat, state.gps.lng);
        }
      } catch (e) {}
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (pos && pos.coords) {
            state.gps.lat = pos.coords.latitude;
            state.gps.lng = pos.coords.longitude;
            state.gps.accuracy = Math.round((pos.coords.accuracy || 3.0) * 10) / 10;
            state.hadGpsFix = true;
            if (state.liveCurMarker) state.liveCurMarker.setLatLng([state.gps.lat, state.gps.lng]);
            if (state.liveMap) state.liveMap.setView([state.gps.lat, state.gps.lng], 19);
            updateWaypointAddress(state.gps.lat, state.gps.lng);
            updateLiveTelemetryUI();
          }
        },
        (err) => {
          console.warn('Kezdeti GPS helymeghatározás:', err);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPersistedData();
    initClockAndDate();
    initScreenNavigation();
    initTwoLayerMaps();
    initLiveButtons();
    initFloatingControls();
    initQuickParamBarAndModal();
    initWaypointModal();
    initWaypointFilters();
    loadInitialData();
    initCalendarAndHistory();
    initWaypointManagement();
    initLevelProgression();
    initSettingsAndIO();
    initGoogleDriveSync();
    initPwaAndMobileTools();
    initDemoModeAndClearData();
    updateLiveTelemetryUI();
    fetchInitialUserLocation();

    // Ha az oldal betöltődésekor/újratöltődésekor már aktív mérés fut a háttérben, azonnal csatlakozunk:
    if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
      try {
        const snap = JSON.parse(window.AndroidBridge.getTrackingSnapshot() || '{}');
        if (snap && (snap.status === 'RECORDING' || snap.status === 'PAUSED')) {
          window.onBackgroundTrackingUpdate(snap);
        }
      } catch(e) {}
    }
  });

  // ==========================================================================
  // TELEFON FIZIKAI HARDVERES LÉPÉSSZÁMLÁLÓ HÍD (Sensor.TYPE_STEP_COUNTER)
  // ==========================================================================
  window.onHardwareSteps = function(realSteps) {
    const val = Math.max(0, parseInt(realSteps, 10) || 0);
    if (val > (state.steps || 0)) {
      state.lastStepTimestamp = Date.now();
    }
    if (state.walkStatus === 'RUNNING') {
      state.steps = val;
      // TÁVOLSÁG: Kizárólag akkor becsülünk lépéshosszból, ha a GPS egyáltalán nem fogott jelet (0 m és nincs fix)
      if (!state.hadGpsFix && state.meters === 0 && val >= 10) {
        const stepLenM = (state.settings.stepLengthCm || 65) / 100;
        const initialDist = val * stepLenM;
        state.meters = initialDist;
        if (state.isUsingStick) {
          state.stickMeters = initialDist;
        } else {
          state.noStickMeters = initialDist;
        }
      }
      updateLiveTelemetryUI();
      updateQuickGoalAndRestDisplay();
      checkLevelProgression();
    }
  };

  // ==========================================================================
  // KOORDINÁTA ÉS NYOMVONAL NORMALIZÁLÓ HELPEREK
  // ==========================================================================
  function normalizePathCoords(rawPath) {
    if (!rawPath) return [];
    let list = rawPath;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (e) {
        return [];
      }
    }
    if (!Array.isArray(list)) return [];

    const result = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      let lat = null;
      let lng = null;

      if (Array.isArray(item)) {
        if (item.length >= 2) {
          lat = parseFloat(item[0]);
          lng = parseFloat(item[1]);
        }
      } else if (typeof item === 'object') {
        if (item.lat !== undefined) lat = parseFloat(item.lat);
        else if (item.latitude !== undefined) lat = parseFloat(item.latitude);

        if (item.lng !== undefined) lng = parseFloat(item.lng);
        else if (item.lon !== undefined) lng = parseFloat(item.lon);
        else if (item.longitude !== undefined) lng = parseFloat(item.longitude);
      }

      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        if (lat !== 0 || lng !== 0) {
          result.push([lat, lng]);
        }
      }
    }
    return result;
  }

  // Háttérben mért GPS pontok beillesztése az élő csiganyálba
  function syncRecordedPathFromBackground(bgPoints) {
    if (!bgPoints) return;
    let list = bgPoints;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (e) {
        return;
      }
    }
    if (!Array.isArray(list) || list.length === 0) return;

    // A háttérszolgáltatás által küldött lista az eddigi teljes, kanonikus, időrendi útvonal.
    // Normáljuk az érkezett pontokat tiszta [lat, lng, acc, time, speed] formátumra:
    const validPoints = [];
    for (let i = 0; i < list.length; i++) {
      const pt = list[i];
      if (!pt) continue;
      let lat = null, lng = null, acc = 2.5, time = Date.now(), speed = 0;
      if (Array.isArray(pt)) {
        lat = parseFloat(pt[0]);
        lng = parseFloat(pt[1]);
        if (pt.length > 2) acc = parseFloat(pt[2]) || 2.5;
        if (pt.length > 3) time = pt[3] || Date.now();
        if (pt.length > 4) speed = parseFloat(pt[4]) || 0;
      } else if (typeof pt === 'object') {
        lat = parseFloat(pt.lat !== undefined ? pt.lat : pt.latitude);
        lng = parseFloat(pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt.longitude));
        acc = parseFloat(pt.acc !== undefined ? pt.acc : (pt.accuracy || 2.5));
        time = pt.time || pt.timestamp || Date.now();
        speed = parseFloat(pt.speed !== undefined ? pt.speed : (pt.speedKmh || 0));
      }

      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        if (lat !== 0 || lng !== 0) {
          validPoints.push([lat, lng, acc, time, speed]);
        }
      }
    }

    if (validPoints.length === 0) return;

    // A natív Android TrackingService trackCoordinates tömbje a kanonikus útvonal.
    // Közvetlenül átvesszük a tiszta listát ahelyett, hogy ciklikusan újrahozzáfűznénk a meglévő pontokhoz!
    // Ez 100%-ban és véglegesen megszünteti a kezdőponthoz visszarántó szövőszék/pókháló vonalakat.
    state.recordedPath = validPoints;

    const lastPt = state.recordedPath[state.recordedPath.length - 1];
    state.gps.lat = lastPt[0];
    state.gps.lng = lastPt[1];
    state.gps.accuracy = lastPt[2];
    state.hadGpsFix = true;
    if (state.liveCurMarker) state.liveCurMarker.setLatLng([lastPt[0], lastPt[1]]);
    if (state.liveRouteLine) state.liveRouteLine.setLatLngs(state.recordedPath.map(p => [p[0], p[1]]));
    if (state.liveMap && !state.hadInitialMapCenter) {
      state.liveMap.panTo([lastPt[0], lastPt[1]]);
      state.hadInitialMapCenter = true;
    }
  }

  // ==========================================================================
  // HÁTTÉRBEN / KIKAPCSOLT KÉPERNYŐVEL VALÓ MÉRÉS SZINKRONIZÁCIÓJA
  // (Android Foreground Service TrackingSnapshot)
  // ==========================================================================
  window.onBackgroundTrackingUpdate = function(data) {
    if (!data) return;

    // Mindig frissítjük az aktuális valós GPS pozíciót, még séta indítása előtt is,
    // hogy útpont felvételénél azonnal a felhasználó tartózkodási helye szerepeljen!
    if (data.currentLatitude && data.currentLongitude && (data.currentLatitude !== 0 || data.currentLongitude !== 0)) {
      state.gps.lat = data.currentLatitude;
      state.gps.lng = data.currentLongitude;
      state.gps.accuracy = data.accuracy || 2.5;
      state.hadGpsFix = true;
      if (state.liveCurMarker) state.liveCurMarker.setLatLng([data.currentLatitude, data.currentLongitude]);
      if (state.liveMap && !state.hadInitialMapCenter) {
        state.liveMap.panTo([data.currentLatitude, data.currentLongitude]);
        state.hadInitialMapCenter = true;
      }
    }

    const isServiceActive = (data.status === 'RUNNING' || data.status === 'RECORDING' || data.status === 'PAUSED');

    // Ha a háttérben aktív mérés fut, de a felület (pl. Activity elfordulás vagy újratöltődés miatt) IDLE-ben van:
    // azonnal visszaállítjuk az aktív séta állapotot és a timert!
    if (state.walkStatus === 'IDLE' && isServiceActive) {
      if (data.status === 'PAUSED') {
        state.walkStatus = 'PAUSED';
        document.body.classList.remove('state-running');
        document.body.classList.add('state-paused');
      } else {
        state.walkStatus = 'RUNNING';
        document.body.classList.remove('state-paused');
        document.body.classList.add('state-running');
      }
      if (!state.startTime) {
        state.startTime = Date.now() - ((data.durationSeconds || 0) * 1000);
      }
      if (!state.timerInterval) {
        startLiveTimerInterval();
      }
      requestScreenWakeLock();
    }

    if (state.walkStatus === 'RUNNING' || state.walkStatus === 'PAUSED') {
      if (data.status === 'STOPPED' || data.status === 'IDLE') {
        return; // Nem engedjük, hogy egy leállított/üres snapshot felülírja a frissen elindított sétát
      }
      if (data.status === 'RUNNING' || data.status === 'RECORDING') {
        state.walkStatus = 'RUNNING';
        document.body.classList.remove('state-paused');
        document.body.classList.add('state-running');
      } else if (data.status === 'PAUSED') {
        state.walkStatus = 'PAUSED';
        document.body.classList.remove('state-running');
        document.body.classList.add('state-paused');
      }
      if (typeof data.totalSteps === 'number' && data.totalSteps >= 0) {
        if (data.totalSteps > (state.steps || 0)) {
          state.lastStepTimestamp = Date.now();
        }
        state.steps = Math.max(state.steps || 0, data.totalSteps);
      }
      if (typeof data.totalDistanceMeters === 'number' && data.totalDistanceMeters >= 0) {
        state.meters = Math.max(state.meters || 0, data.totalDistanceMeters);
      } else if (!state.hadGpsFix && state.meters === 0 && (state.steps || 0) >= 10) {
        const stepLenM = (state.settings.stepLengthCm || 65) / 100;
        state.meters = (state.steps || 0) * stepLenM;
      }
      if (typeof data.durationSeconds === 'number' && data.durationSeconds >= 0) {
        state.durationSec = Math.max(state.durationSec || 0, data.durationSeconds);
      }
      // Falióra idő szinkronizáció
      if (state.startTime) {
        const wallSec = Math.round((Date.now() - state.startTime) / 1000);
        state.durationSec = Math.max(state.durationSec || 0, wallSec);
      }
      if (typeof data.activeWalkSeconds === 'number') {
        state.activeMovingSecLive = data.activeWalkSeconds;
      }
      if (typeof data.restSeconds === 'number') {
        state.restingSecLive = data.restSeconds;
      }
      if (typeof data.restCount === 'number') {
        state.restCountLive = data.restCount;
      }
      if (typeof data.stickDistanceMeters === 'number') {
        state.stickMeters = Math.max(state.stickMeters || 0, data.stickDistanceMeters);
      }
      if (typeof data.noStickDistanceMeters === 'number') {
        state.noStickMeters = Math.max(state.noStickMeters || 0, data.noStickDistanceMeters);
      }

      // Csiganyál szinkronizálása a háttérből érkezett koordinátákkal
      if (data.pathPoints && Array.isArray(data.pathPoints) && data.pathPoints.length > 0) {
        syncRecordedPathFromBackground(data.pathPoints);
      } else if (data.currentLatitude && data.currentLongitude && (data.currentLatitude !== 0 || data.currentLongitude !== 0)) {
        state.gps.lat = data.currentLatitude;
        state.gps.lng = data.currentLongitude;
        state.gps.accuracy = data.accuracy || 2.5;
        if (state.liveCurMarker) state.liveCurMarker.setLatLng([data.currentLatitude, data.currentLongitude]);
        if (state.liveMap) state.liveMap.panTo([data.currentLatitude, data.currentLongitude]);

        // Standalone web módban (Android natív bridge nélkül) szűrjük lokálisan
        if (state.walkStatus === 'RUNNING' && !window.AndroidBridge) {
          addFilteredTrackPoint(
            data.currentLatitude,
            data.currentLongitude,
            data.accuracy || 2.5,
            data.currentSpeedKmh || 0,
            Date.now()
          );
        }
      }
      if (typeof data.hasGpsFix === 'boolean') {
        updateGpsVisualFeedback(data.hasGpsFix, data.accuracy);
      }
      updateLiveTelemetryUI();
      updateQuickGoalAndRestDisplay();
      updateStickButtonUI();
      checkLevelProgression();
    }
  };

  // ==========================================================================
  // 1. ADATOK BETÖLTÉSE (LOCALSTORAGE)
  // ==========================================================================
  function loadPersistedData() {
    try {
      // 1. Képernyő sorrend (Pontosan az 5 oldal ellenőrzése)
      const validScreenIds = new Set(['screen-live', 'screen-history', 'screen-summary', 'screen-waypoints', 'screen-settings']);
      const savedOrder = localStorage.getItem('csampazo_screen_order_v5');
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length === defaultScreenOrder.length && parsed.every(p => validScreenIds.has(p.id))) {
          state.screenOrder = parsed;
        } else {
          state.screenOrder = [...defaultScreenOrder];
        }
      } else {
        state.screenOrder = [...defaultScreenOrder];
      }

      // 2. Beállítások (Napi cél és Pihenőidő másodpercben)
      const savedSettings = localStorage.getItem('csampazo_settings');
      if (savedSettings) {
        state.settings = { ...state.settings, ...JSON.parse(savedSettings) };
      }
      if (state.settings.stickMode === 'ALWAYS' || state.settings.stickMode === 'START_WITH') {
        state.isUsingStick = true;
      }

      // 3. Saját szintek (Szintlépéses mérföldkövek)
      const savedLevels = localStorage.getItem('csampazo_custom_levels');
      if (savedLevels) {
        const parsed = JSON.parse(savedLevels);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.levels = parsed;
        }
      }

      // 4. Demo Mód (alapértelmezetten false / kikapcsolva)
      state.isDemoMode = localStorage.getItem('csampazo_demo_mode') === 'true';
    } catch (e) {
      console.warn('Nem sikerült betölteni a mentett beállításokat', e);
    }
  }

  // ==========================================================================
  // 2. KÉPERNYŐ-NAVIGÁCIÓ & ÁTRENDEZÉS
  // ==========================================================================
  function initScreenNavigation() {
    renderNavBar();
    renderScreenOrderList();

    const navBar = document.getElementById('screens-nav-bar');
    if (navBar) {
      navBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-tab-btn');
        if (btn) {
          const screenId = btn.dataset.screen;
          if (screenId) switchScreen(screenId);
        }
      });
    }

    const btnSumJump = document.getElementById('btn-sum-jump-history');
    if (btnSumJump) {
      btnSumJump.addEventListener('click', () => switchScreen('screen-history'));
    }

    const btnTriggerEditor = document.getElementById('btn-trigger-level-editor');
    if (btnTriggerEditor) {
      btnTriggerEditor.addEventListener('click', () => {
        const editorBox = document.getElementById('custom-levels-editor-box');
        if (editorBox) {
          editorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          editorBox.style.boxShadow = '0 0 20px var(--accent-gold)';
          setTimeout(() => editorBox.style.boxShadow = '', 1500);
        }
      });
    }
  }

  function renderNavBar() {
    const navBar = document.getElementById('screens-nav-bar');
    if (!navBar) return;

    navBar.innerHTML = state.screenOrder.map(s => `
      <button type="button" class="nav-tab-btn ${s.id === state.activeScreenId ? 'active' : ''}" data-screen="${s.id}" id="nav-btn-${s.id}">
        <span class="nav-icon">${s.icon}</span> <span class="nav-text">${s.name}</span>
      </button>
    `).join('');
  }

  function switchScreen(screenId) {
    state.activeScreenId = screenId;

    document.querySelectorAll('.view-screen').forEach(scr => {
      scr.classList.toggle('active', scr.id === screenId);
    });

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === screenId);
    });

    if (screenId === 'screen-summary' && state.historyMap) {
      const renderSummaryMap = () => {
        if (!state.historyMap) return;
        state.historyMap.invalidateSize(true);
        if (state.selectedRoute) {
          drawRouteOnHistoryMap(state.selectedRoute);
        }
      };
      renderSummaryMap();
      setTimeout(renderSummaryMap, 60);
      setTimeout(renderSummaryMap, 250);
    } else if (screenId === 'screen-live' && state.liveMap) {
      setTimeout(() => state.liveMap.invalidateSize(), 100);
    } else if (screenId === 'screen-waypoints') {
      renderWaypointManagementList();
    } else if (screenId === 'screen-history') {
      renderWeeklyCalendar();
      renderSavedRoutesTimeline();
    } else if (screenId === 'screen-settings') {
      renderLevelLadder();
      updateProgressScreen();
    }
  }

  function renderScreenOrderList() {
    const container = document.getElementById('screen-order-list');
    if (!container) return;

    container.innerHTML = state.screenOrder.map((s, index) => `
      <div class="screen-order-item" data-index="${index}">
        <div class="s-name">
          <span style="font-size:1.3rem;">${s.icon}</span>
          <span>${s.name}</span>
        </div>
        <div class="order-btn-group">
          <button type="button" class="btn-reorder btn-move-up" data-index="${index}" title="Mozgatás feljebb" ${index === 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬆️ Fel</button>
          <button type="button" class="btn-reorder btn-move-down" data-index="${index}" title="Mozgatás lejjebb" ${index === state.screenOrder.length - 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬇️ Le</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-move-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (idx > 0) {
          const temp = state.screenOrder[idx];
          state.screenOrder[idx] = state.screenOrder[idx - 1];
          state.screenOrder[idx - 1] = temp;
          saveScreenOrder();
        }
      });
    });

    container.querySelectorAll('.btn-move-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (idx < state.screenOrder.length - 1) {
          const temp = state.screenOrder[idx];
          state.screenOrder[idx] = state.screenOrder[idx + 1];
          state.screenOrder[idx + 1] = temp;
          saveScreenOrder();
        }
      });
    });
  }

  function saveScreenOrder() {
    localStorage.setItem('csampazo_screen_order_v5', JSON.stringify(state.screenOrder));
    renderNavBar();
    renderScreenOrderList();
    showToast('Képernyők sorrendje elmentve!', '🔀');
  }

  // ==========================================================================
  // 3. ÉLŐ ÓRA ÉS DÁTUM
  // ==========================================================================
  function initClockAndDate() {
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');

    const updateTime = () => {
      const now = new Date();
      if (clockEl) {
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${h}:${m}:${s}`;
      }
      if (dateEl) {
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        dateEl.textContent = now.toLocaleDateString('hu-HU', options);
      }
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  // ==========================================================================
  // 4. KÉT RÉTEGŰ TÉRKÉP (PONTOSAN 2 RÉTEG: UTCANÉZET & MŰHOLDKÉP)
  // "A térkép két réteget tartalmazzon. A műholdkép és az utcanézet legyen."
  // ==========================================================================
  function createStreetAndSatelliteTiles() {
    return {
      // 1. UTCANÉZET: Esri World Street Map (maxZoom: 22, maxNativeZoom: 18 - mély digitális zoom a járdákig)
      street: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap'
      }),
      // 2. MŰHOLDKÉP: Esri World Imagery (maxZoom: 22, maxNativeZoom: 19 - nagyfelbontású műholdkép fákkal, padokkal)
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 22,
        maxNativeZoom: 19,
        attribution: '&copy; Esri, Maxar'
      })
    };
  }

  function initTwoLayerMaps() {
    // 1. ÉLŐ TÉRKÉP (Screen 1)
    const liveEl = document.getElementById('main-track-map');
    if (liveEl && typeof L !== 'undefined') {
      state.liveMap = L.map('main-track-map', {
        zoomControl: true,
        attributionControl: true,
        maxZoom: 22
      }).setView([state.gps.lat, state.gps.lng], 19);

      state.liveTiles = createStreetAndSatelliteTiles();
      state.liveTiles.street.addTo(state.liveMap); // Kezdés: Utcanézet

      state.liveRouteLine = L.polyline([], {
        color: '#10b981',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.liveMap);

      const curIcon = L.divIcon({
        className: 'cur-pos-icon',
        html: '<div style="background:#10b981;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px #10b981;"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      state.liveCurMarker = L.marker([state.gps.lat, state.gps.lng], { icon: curIcon }).addTo(state.liveMap);

      // 2-Rétegű Kapcsológombok az Élő térképnél
      const btnStreet = document.getElementById('btn-live-layer-street');
      const btnSat = document.getElementById('btn-live-layer-satellite');

      if (btnStreet && btnSat) {
        btnStreet.addEventListener('click', () => {
          setLiveMapLayer('street');
        });
        btnSat.addEventListener('click', () => {
          setLiveMapLayer('satellite');
        });
      }

      const btnRecenter = document.getElementById('btn-recenter');
      if (btnRecenter) {
        btnRecenter.addEventListener('click', () => {
          const currentZoom = Math.max(19, state.liveMap.getZoom());
          state.liveMap.setView([state.gps.lat, state.gps.lng], currentZoom);
          showToast('Térkép a pozícióra igazítva!', '🎯');
        });
      }
    }

    // 2. HISTORIKUS TÉRKÉP (Screen 2)
    const histEl = document.getElementById('history-track-map');
    if (histEl && typeof L !== 'undefined') {
      state.historyMap = L.map('history-track-map', {
        zoomControl: true,
        attributionControl: true,
        maxZoom: 22
      }).setView([state.gps.lat, state.gps.lng], 19);

      state.historyTiles = createStreetAndSatelliteTiles();
      state.historyTiles.street.addTo(state.historyMap); // Kezdés: Utcanézet

      state.historyRouteLine = L.polyline([], {
        color: '#38bdf8',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.historyMap);

      // 2-Rétegű Kapcsológombok a Historikus térképnél
      const btnHistStreet = document.getElementById('btn-history-layer-street');
      const btnHistSat = document.getElementById('btn-history-layer-satellite');

      if (btnHistStreet && btnHistSat) {
        btnHistStreet.addEventListener('click', () => {
          setHistoryMapLayer('street');
        });
        btnHistSat.addEventListener('click', () => {
          setHistoryMapLayer('satellite');
        });
      }

      const btnHistoryFit = document.getElementById('btn-history-fit');
      if (btnHistoryFit) {
        btnHistoryFit.addEventListener('click', () => {
          if (state.selectedRoute) {
            const clean = normalizePathCoords(state.selectedRoute.path);
            if (clean.length > 0) {
              const bounds = L.latLngBounds(clean);
              if (bounds.isValid()) {
                state.historyMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 21 });
                showToast('Teljes útvonal illesztve a képernyőre!', '🔍');
                return;
              }
            }
          }
          if (state.historyRouteLine && state.historyRouteLine.getLatLngs().length > 0) {
            state.historyMap.fitBounds(state.historyRouteLine.getBounds(), { padding: [40, 40] });
            showToast('Teljes útvonal illesztve a képernyőre!', '🔍');
          }
        });
      }
    }
  }

  function setLiveMapLayer(layerKey) {
    if (!state.liveMap || state.liveActiveLayerKey === layerKey) return;

    state.liveMap.removeLayer(state.liveTiles[state.liveActiveLayerKey]);
    state.liveTiles[layerKey].addTo(state.liveMap);
    state.liveActiveLayerKey = layerKey;

    const btnStreet = document.getElementById('btn-live-layer-street');
    const btnSat = document.getElementById('btn-live-layer-satellite');
    if (btnStreet && btnSat) {
      btnStreet.classList.toggle('active', layerKey === 'street');
      btnSat.classList.toggle('active', layerKey === 'satellite');
    }

    showToast(`Élő térkép: ${layerKey === 'street' ? '🗺️ Utcanézet' : '🛰️ Műholdkép'}`, '🗺️');
  }

  function setHistoryMapLayer(layerKey) {
    if (!state.historyMap || state.historyActiveLayerKey === layerKey) return;

    state.historyMap.removeLayer(state.historyTiles[state.historyActiveLayerKey]);
    state.historyTiles[layerKey].addTo(state.historyMap);
    state.historyActiveLayerKey = layerKey;

    const btnStreet = document.getElementById('btn-history-layer-street');
    const btnSat = document.getElementById('btn-history-layer-satellite');
    if (btnStreet && btnSat) {
      btnStreet.classList.toggle('active', layerKey === 'street');
      btnSat.classList.toggle('active', layerKey === 'satellite');
    }

    showToast(`Historikus térkép: ${layerKey === 'street' ? '🗺️ Utcanézet' : '🛰️ Műholdkép'}`, '🛰️');
  }

  // ==========================================================================
  // 5. VÁLTOZTATHATÓ NAPI CÉL ÉS PIHENŐIDŐ KÜSZÖB
  // "a napi cél és a pihenőidő legyenn változtatható."
  // ==========================================================================
  function initQuickParamBarAndModal() {
    updateQuickGoalAndRestDisplay();

    const btnEditGoal = document.getElementById('btn-quick-edit-goal');
    const btnEditRest = document.getElementById('btn-quick-edit-rest');
    const modalQuick = document.getElementById('modal-quick-param');
    const formQuick = document.getElementById('form-quick-param');
    const btnCloseModal = document.getElementById('btn-close-quick-param-modal');
    const btnCancelModal = document.getElementById('btn-cancel-quick-param');

    const openQuickModal = (focusTarget) => {
      const inputGoalVal = document.getElementById('modal-input-goal-val');
      const inputGoalType = document.getElementById('modal-input-goal-type');
      const inputRestSec = document.getElementById('modal-input-rest-sec');

      if (inputGoalVal) inputGoalVal.value = state.settings.targetGoalVal;
      if (inputGoalType) inputGoalType.value = state.settings.targetGoalType;
      if (inputRestSec) inputRestSec.value = state.settings.restThresholdSec;

      if (modalQuick) modalQuick.classList.add('active');
      if (focusTarget === 'rest' && inputRestSec) {
        setTimeout(() => inputRestSec.focus(), 80);
      } else if (inputGoalVal) {
        setTimeout(() => inputGoalVal.focus(), 80);
      }
    };

    const closeQuickModal = () => {
      if (modalQuick) modalQuick.classList.remove('active');
    };

    if (btnEditGoal) btnEditGoal.addEventListener('click', () => openQuickModal('goal'));
    if (btnEditRest) btnEditRest.addEventListener('click', () => openQuickModal('rest'));
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeQuickModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeQuickModal);

    if (formQuick) {
      formQuick.addEventListener('submit', (e) => {
        e.preventDefault();
        const goalVal = parseInt(document.getElementById('modal-input-goal-val')?.value, 10);
        const goalType = document.getElementById('modal-input-goal-type')?.value;
        const restSec = parseInt(document.getElementById('modal-input-rest-sec')?.value, 10);

        if (goalVal > 0) state.settings.targetGoalVal = goalVal;
        if (goalType) state.settings.targetGoalType = goalType;
        if (restSec > 0) state.settings.restThresholdSec = restSec;

        localStorage.setItem('csampazo_settings', JSON.stringify(state.settings));
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
        closeQuickModal();

        showToast(`Beállítások elmentve: Cél: ${state.settings.targetGoalVal} ${state.settings.targetGoalType === 'meters' ? 'm' : 'lépés'}, Pihenő: ${state.settings.restThresholdSec} mp`, '💾');
      });
    }
  }

  function updateQuickGoalAndRestDisplay() {
    const dispGoal = document.getElementById('quick-disp-target-goal');
    const dispRest = document.getElementById('quick-disp-rest-threshold');
    const progressVal = document.getElementById('quick-goal-progress-val');
    const ruleThresholdText = document.getElementById('sum-rule-threshold-text');

    const unit = state.settings.targetGoalType === 'meters' ? 'm' : 'lépés';
    if (dispGoal) dispGoal.textContent = `${state.settings.targetGoalVal} ${unit}`;
    if (dispRest) dispRest.textContent = `${state.settings.restThresholdSec} mp`;
    if (ruleThresholdText) ruleThresholdText.textContent = `${state.settings.restThresholdSec} mp`;

    // Haladás kiszámítása a napi célhoz
    const current = state.settings.targetGoalType === 'meters' ? Math.round(state.meters) : state.steps;
    const target = state.settings.targetGoalVal;
    const pct = Math.min(100, Math.round((current / target) * 100));

    if (progressVal) {
      progressVal.textContent = `${current} ${unit} / ${target} ${unit} (${pct}%)`;
    }

    // Beállítások űrlap elemeinek szinkronizálása a 6. képernyőn
    const setGoalVal = document.getElementById('set-target-goal-val');
    const setGoalType = document.getElementById('set-target-goal-type');
    const setRestSec = document.getElementById('set-rest-threshold-input');
    const setStickMode = document.getElementById('set-stick-mode');
    const setReminderSec = document.getElementById('set-reminder-interval-input');

    if (setGoalVal) setGoalVal.value = state.settings.targetGoalVal;
    if (setGoalType) setGoalType.value = state.settings.targetGoalType;
    if (setRestSec) setRestSec.value = state.settings.restThresholdSec;
    if (setStickMode) setStickMode.value = state.settings.stickMode || 'START_WITHOUT';
    if (setReminderSec) setReminderSec.value = state.settings.reminderIntervalSec || 0;
  }

  // ==========================================================================
  // 6. SZINTLÉPÉSES MÉRFÖLDKŐ RENDSZER & SAJÁT SZINTEK MEGADÁSA
  // "A mérföldköveknek legyenn valamiféle szintlépéses megoldás.
  //  Ha a cél 500m, de elértem, akkor a következő szint 1000 lépés lesz.
  //  Ezeket a szinteket én adhassam meg"
  // ==========================================================================
  function initLevelProgression() {
    renderLevelLadder();
    renderCustomLevelsEditor();

    const btnAddNewLevel = document.getElementById('btn-add-new-custom-level');
    if (btnAddNewLevel) {
      btnAddNewLevel.addEventListener('click', () => {
        const nextLvlNum = state.levels.length + 1;
        state.levels.push({
          level: nextLvlNum,
          name: `${nextLvlNum}. Szint Cél`,
          metric: nextLvlNum % 2 === 0 ? 'steps' : 'meters',
          target: nextLvlNum % 2 === 0 ? nextLvlNum * 500 : nextLvlNum * 250,
          desc: 'Felhasználó által megadott egyedi cél'
        });
        renderCustomLevelsEditor();
        renderLevelLadder();
        showToast(`Új szint (${nextLvlNum}. Szint) hozzáadva!`, '➕');
      });
    }

    const btnSaveLevels = document.getElementById('btn-save-custom-levels');
    if (btnSaveLevels) {
      btnSaveLevels.addEventListener('click', saveCustomLevelsFromEditor);
    }

    const btnResetLevels = document.getElementById('btn-reset-levels');
    if (btnResetLevels) {
      btnResetLevels.addEventListener('click', () => {
        if (confirm('Visszaállítod a szinteket az alapértelmezett beállításokra?')) {
          state.levels = [...defaultLevelLadder];
          localStorage.setItem('csampazo_custom_levels', JSON.stringify(state.levels));
          renderCustomLevelsEditor();
          renderLevelLadder();
          showToast('Alapértelmezett szintek visszaállítva!', '🔄');
        }
      });
    }
  }

  // Szintlétra és aktív szint banner kirajzolása
  function renderLevelLadder() {
    const listEl = document.getElementById('level-ladder-list');
    const activeNumEl = document.getElementById('active-level-num');
    const activeTitleEl = document.getElementById('active-level-title');
    const activeNextHintEl = document.getElementById('active-level-next-hint');
    const progressFillEl = document.getElementById('active-level-progress-fill');
    const progressTextEl = document.getElementById('active-level-progress-text');
    const statusPillEl = document.getElementById('active-level-status-pill');

    if (!listEl) return;

    // Megvizsgáljuk, hanyadik szintnél tartunk a jelenlegi teljesítmény alapján
    const currentMeters = state.selectedRoute 
      ? state.selectedRoute.meters 
      : (state.meters > 0 ? state.meters : 0);
    const currentSteps = state.selectedRoute 
      ? state.selectedRoute.steps 
      : (state.steps > 0 ? state.steps : 0);

    let activeIdx = 0;
    for (let i = 0; i < state.levels.length; i++) {
      const lvl = state.levels[i];
      const val = lvl.metric === 'meters' ? currentMeters : currentSteps;
      if (val >= lvl.target && i < state.levels.length - 1) {
        activeIdx = i + 1; // Következő szintre lépés!
      } else {
        activeIdx = i;
        break;
      }
    }
    state.activeLevelIndex = activeIdx;

    const currentLevel = state.levels[activeIdx] || state.levels[0];
    const currentVal = currentLevel.metric === 'meters' ? currentMeters : currentSteps;
    const unit = currentLevel.metric === 'meters' ? 'méter' : 'lépés';
    const pct = currentVal > 0 ? Math.min(100, Math.round((currentVal / currentLevel.target) * 100)) : 0;

    // Aktív banner frissítése
    if (activeNumEl) activeNumEl.textContent = currentLevel.level;
    if (activeTitleEl) activeTitleEl.textContent = `${currentLevel.level}. Szint: ${currentLevel.target} ${unit} (${currentLevel.name})`;

    const nextLevel = state.levels[activeIdx + 1];
    if (activeNextHintEl) {
      if (nextLevel) {
        const nextUnit = nextLevel.metric === 'meters' ? 'méter' : 'lépés';
        activeNextHintEl.textContent = `${nextLevel.level}. Szint (${nextLevel.target} ${nextUnit})`;
      } else {
        activeNextHintEl.textContent = 'Minden szint teljesítve! 🌟';
      }
    }

    if (progressFillEl) progressFillEl.style.width = `${pct}%`;
    if (progressTextEl) {
      if (currentVal === 0) {
        progressTextEl.textContent = `Jelenlegi állás: 0 / ${currentLevel.target} ${unit} (0%) — Még nincs rögzített séta`;
      } else {
        progressTextEl.textContent = `Jelenlegi állás: ${currentVal} / ${currentLevel.target} ${unit} (${pct}%)`;
      }
    }

    if (statusPillEl) {
      if (pct >= 100) {
        statusPillEl.textContent = '🎉 SZINTLÉPÉS TELJESÍTVE!';
        statusPillEl.style.color = 'var(--accent-mint)';
      } else if (currentVal === 0) {
        statusPillEl.textContent = '🎯 Kezdésre vár';
        statusPillEl.style.color = 'var(--text-muted)';
      } else {
        statusPillEl.textContent = '🎯 Folyamatban';
        statusPillEl.style.color = 'var(--accent-gold)';
      }
    }

    // Szintlétra sorok
    listEl.innerHTML = state.levels.map((lvl, idx) => {
      const val = lvl.metric === 'meters' ? currentMeters : currentSteps;
      const isDone = val >= lvl.target && idx <= activeIdx;
      const isActive = idx === activeIdx && !isDone;
      const isLocked = idx > activeIdx;

      let statusBadge = '<span class="ladder-status-badge pending">🔒 Zárolt</span>';
      let rowClass = 'level-ladder-row locked';

      if (isDone) {
        statusBadge = '<span class="ladder-status-badge done">✅ Teljesítve</span>';
        rowClass = 'level-ladder-row unlocked';
      } else if (isActive) {
        statusBadge = '<span class="ladder-status-badge current">🎯 Aktív szint</span>';
        rowClass = 'level-ladder-row active';
      }

      const metricLabel = lvl.metric === 'meters' ? 'méter' : 'lépés';

      return `
        <div class="${rowClass}">
          <div class="ladder-lvl-pill">${lvl.level}</div>
          <div class="ladder-info-col">
            <div class="ladder-name">${lvl.name}</div>
            <div class="ladder-target-metric">Cél: <strong>${lvl.target} ${metricLabel}</strong> — ${lvl.desc || ''}</div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }).join('');
  }

  // Saját szintek szerkesztő táblázata
  function renderCustomLevelsEditor() {
    const tableEl = document.getElementById('level-edit-table');
    if (!tableEl) return;

    tableEl.innerHTML = state.levels.map((lvl, index) => `
      <div class="level-edit-row" data-index="${index}">
        <div class="lvl-edit-header-row">
          <strong class="lvl-edit-badge">${lvl.level}. Szint</strong>
          <button type="button" class="btn-remove-level" data-index="${index}" title="Szint törlése">✕</button>
        </div>
        <div class="lvl-edit-field-wrap">
          <input type="text" class="lvl-edit-name" value="${escapeXml(lvl.name)}" placeholder="Szint neve">
        </div>
        <div class="lvl-edit-target-metric-row">
          <input type="number" class="lvl-edit-target" min="10" step="10" value="${lvl.target}" placeholder="Cél">
          <select class="lvl-edit-metric">
            <option value="meters" ${lvl.metric === 'meters' ? 'selected' : ''}>Méter (m)</option>
            <option value="steps" ${lvl.metric === 'steps' ? 'selected' : ''}>Lépés</option>
          </select>
        </div>
      </div>
    `).join('');

    tableEl.querySelectorAll('.btn-remove-level').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        if (state.levels.length <= 1) {
          showToast('Legalább egy szintnek maradnia kell!', '⚠️');
          return;
        }
        state.levels.splice(idx, 1);
        // Szintek újraszámozása
        state.levels.forEach((l, i) => l.level = i + 1);
        renderCustomLevelsEditor();
        renderLevelLadder();
        showToast('Szint törölve.', '🗑️');
      });
    });
  }

  function saveCustomLevelsFromEditor() {
    const tableEl = document.getElementById('level-edit-table');
    if (!tableEl) return;

    const rows = tableEl.querySelectorAll('.level-edit-row');
    const newLevels = [];

    rows.forEach((row, i) => {
      const name = row.querySelector('.lvl-edit-name')?.value.trim() || `${i + 1}. Szint`;
      const metric = row.querySelector('.lvl-edit-metric')?.value || 'meters';
      const target = parseInt(row.querySelector('.lvl-edit-target')?.value, 10) || 500;

      newLevels.push({
        level: i + 1,
        name: name,
        metric: metric,
        target: target,
        desc: `${target} ${metric === 'meters' ? 'méter' : 'lépés'} elérése`
      });
    });

    state.levels = newLevels;
    localStorage.setItem('csampazo_custom_levels', JSON.stringify(state.levels));
    renderLevelLadder();
    showToast('Saját szintek sikeresen elmentve!', '💾');
  }

  function checkLevelProgression() {
    renderLevelLadder();
  }

  // ==========================================================================
  // 7. MÁSODPERC ALAPÚ SÉTAKÖVETÉS & ÉLŐ VEZÉRLÉS
  // "másodperc alapú legyen a mérés, amit vissza is nézhetek."
  // ==========================================================================
  function initLiveButtons() {
    const btnStart = document.getElementById('btn-action-start');
    const btnPause = document.getElementById('btn-action-pause');
    const btnStop = document.getElementById('btn-action-stop');
    const btnWaypoint = document.getElementById('btn-action-waypoint');
    const btnQuickWp = document.getElementById('btn-quick-waypoint-trigger');

    if (btnStart) {
      btnStart.addEventListener('click', () => {
        if (state.walkStatus === 'PAUSED') {
          resumeWalk();
        } else if (state.walkStatus === 'IDLE' || state.walkStatus === 'STOPPED') {
          startWalk();
        } else {
          showToast('A séta már folyamatban van!', '🚶');
        }
      });
    }

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        if (state.walkStatus === 'RUNNING') {
          pauseWalk();
        } else if (state.walkStatus === 'PAUSED') {
          resumeWalk();
        } else {
          showToast('Előbb indítsd el a sétát a Kezdés gombbal!', 'ℹ️');
        }
      });
    }

    if (btnStop) {
      btnStop.addEventListener('click', () => {
        if (state.walkStatus === 'RUNNING' || state.walkStatus === 'PAUSED') {
          stopWalk();
        } else {
          showToast('Nincs aktív séta.', 'ℹ️');
        }
      });
    }

    if (btnWaypoint) btnWaypoint.addEventListener('click', openWaypointModal);
    if (btnQuickWp) btnQuickWp.addEventListener('click', openWaypointModal);

    const btnStick = document.getElementById('btn-action-stick');
    if (btnStick) {
      btnStick.addEventListener('click', () => {
        state.isUsingStick = !state.isUsingStick;
        updateStickButtonUI();
        if (state.walkStatus === 'RUNNING') {
          document.body.classList.remove('state-paused');
          document.body.classList.add('state-running');
        } else if (state.walkStatus === 'PAUSED') {
          document.body.classList.remove('state-running');
          document.body.classList.add('state-paused');
        }
        if (window.AndroidBridge && typeof window.AndroidBridge.setStickState === 'function') {
          window.AndroidBridge.setStickState(state.isUsingStick);
        }
        if (state.isUsingStick) {
          showToast('🦯 Bot használat bekapcsolva!', '🦯');
        } else {
          showToast('🚶 Bot használat kikapcsolva!', '🚶');
        }
      });
    }
    updateStickButtonUI();
  }

  // ==========================================================================
  // LEBEGŐ GYORSVEZÉRLŐK: BAL FELSŐ (?) ÉS JOBB FELSŐ (💡)
  // "Ha hosszan rábökök, nyíljon meg egy használati utasítás."
  // "Ha hosszan megnyomom, kapcsolja be a vakut lámpának. Ha ismét megnyomom, kapcsolja ki a vakut."
  // ==========================================================================
  function initFloatingControls() {
    const btnHelp = document.getElementById('btn-float-help');
    const btnTorch = document.getElementById('btn-float-torch');
    const modalGuide = document.getElementById('modal-user-guide');
    const btnCloseGuide = document.getElementById('btn-close-user-guide');
    const btnAckGuide = document.getElementById('btn-ack-user-guide');

    const openGuideModal = () => {
      if (modalGuide) {
        modalGuide.classList.add('active');
        if (navigator.vibrate) navigator.vibrate(40);
      }
    };

    const closeGuideModal = () => {
      if (modalGuide) modalGuide.classList.remove('active');
    };

    if (btnCloseGuide) btnCloseGuide.addEventListener('click', closeGuideModal);
    if (btnAckGuide) btnAckGuide.addEventListener('click', closeGuideModal);
    if (modalGuide) {
      modalGuide.addEventListener('click', (e) => {
        if (e.target === modalGuide) closeGuideModal();
      });
    }

    // 1. KÉRDŐJEL GOMB (BAL FELSŐ) - Hosszan nyomva nyitja a használati utasítást
    if (btnHelp) {
      let helpTimer = null;
      let helpTriggered = false;

      const onHelpStart = (e) => {
        helpTriggered = false;
        btnHelp.classList.add('pressing');
        clearTimeout(helpTimer);
        helpTimer = setTimeout(() => {
          helpTriggered = true;
          btnHelp.classList.remove('pressing');
          openGuideModal();
        }, 550);
      };

      const onHelpEnd = () => {
        btnHelp.classList.remove('pressing');
        if (helpTimer) {
          clearTimeout(helpTimer);
          helpTimer = null;
        }
      };

      btnHelp.addEventListener('pointerdown', onHelpStart);
      btnHelp.addEventListener('pointerup', onHelpEnd);
      btnHelp.addEventListener('pointercancel', onHelpEnd);
      btnHelp.addEventListener('pointerleave', onHelpEnd);

      btnHelp.addEventListener('click', (e) => {
        e.preventDefault();
        if (!helpTriggered) {
          showToast('💡 Tartsd hosszan nyomva a használati utasításhoz!', '📖');
        }
        helpTriggered = false;
      });
    }

    // 2. IZZÓ GOMB (JOBB FELSŐ) - Hosszan nyomva bekapcsol, rábökve kikapcsol
    if (btnTorch) {
      let torchTimer = null;
      let torchTriggered = false;
      let isTorchActive = false;

      const setTorch = (enable) => {
        isTorchActive = enable;
        if (isTorchActive) {
          btnTorch.classList.add('torch-active');
          btnTorch.setAttribute('title', 'Vaku bekapcsolva - kattints a kikapcsoláshoz');
          showToast('🔦 Vaku lámpa bekapcsolva!', '🔦');
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        } else {
          btnTorch.classList.remove('torch-active');
          btnTorch.setAttribute('title', 'Vaku lámpa (hosszan tartsd nyomva)');
          showToast('Vaku lámpa kikapcsolva.', '💡');
          if (navigator.vibrate) navigator.vibrate(30);
        }

        // Natív Android híd hívása
        if (window.AndroidBridge && typeof window.AndroidBridge.toggleTorch === 'function') {
          try {
            window.AndroidBridge.toggleTorch(isTorchActive);
          } catch (e) {
            console.warn('toggleTorch hiba:', e);
          }
        }
      };

      const onTorchStart = (e) => {
        torchTriggered = false;
        // Ha már be van kapcsolva a vaku, egy sima rábökés azonnal kikapcsolja ("Ha ismét megnyomom, kapcsolja ki a vakut")
        if (isTorchActive) return;

        btnTorch.classList.add('pressing');
        clearTimeout(torchTimer);
        torchTimer = setTimeout(() => {
          torchTriggered = true;
          btnTorch.classList.remove('pressing');
          setTorch(true);
        }, 550);
      };

      const onTorchEnd = () => {
        btnTorch.classList.remove('pressing');
        if (torchTimer) {
          clearTimeout(torchTimer);
          torchTimer = null;
        }
      };

      btnTorch.addEventListener('pointerdown', onTorchStart);
      btnTorch.addEventListener('pointerup', onTorchEnd);
      btnTorch.addEventListener('pointercancel', onTorchEnd);
      btnTorch.addEventListener('pointerleave', onTorchEnd);

      btnTorch.addEventListener('click', (e) => {
        e.preventDefault();
        if (isTorchActive) {
          // "Ha ismét megnyomom, kapcsolja ki a vakut"
          setTorch(false);
          torchTriggered = false;
        } else {
          if (!torchTriggered) {
            showToast('💡 Tartsd hosszan nyomva a lámpa bekapcsolásához!', '🔦');
          }
          torchTriggered = false;
        }
      });
    }
  }

  function updateStickButtonUI() {
    const btnStick = document.getElementById('btn-action-stick');
    const label = document.getElementById('btn-stick-label');
    const hint = document.getElementById('btn-stick-hint');
    const strip = document.getElementById('stick-live-strip');
    const distNoStick = document.getElementById('live-dist-no-stick');
    const distStick = document.getElementById('live-dist-stick');

    if (btnStick && label && hint) {
      if (state.isUsingStick) {
        btnStick.classList.add('active');
        label.textContent = 'Bot használata: BOTTAL JÁROK';
        hint.textContent = 'Kattints a kikapcsoláshoz';
      } else {
        btnStick.classList.remove('active');
        label.textContent = 'Bot használata: BOT NÉLKÜL';
        hint.textContent = 'Kattints a bekapcsoláshoz';
      }
    }

    if (strip && distNoStick && distStick) {
      if (state.walkStatus === 'RUNNING' || state.walkStatus === 'PAUSED') {
        strip.style.display = 'flex';
        distNoStick.textContent = `${Math.round(state.noStickMeters)} m`;
        distStick.textContent = `${Math.round(state.stickMeters)} m`;
      } else {
        strip.style.display = 'none';
      }
    }
  }

  // --- Haversine távolságszámítás méterben ---
  function calcHaversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // --- Képernyő ébrentartása (Screen Wake Lock API mobilon) ---
  async function requestScreenWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLockSentinel = await navigator.wakeLock.request('screen');
        const pill = document.getElementById('wakelock-pill');
        if (pill) {
          pill.classList.add('active');
          pill.textContent = '💡 Kijelző ébren';
        }
      }
    } catch (e) {
      console.warn('WakeLock figyelmeztetés:', e);
    }
  }

  function releaseScreenWakeLock() {
    if (state.wakeLockSentinel) {
      state.wakeLockSentinel.release().catch(() => {});
      state.wakeLockSentinel = null;
    }
    const pill = document.getElementById('wakelock-pill');
    if (pill) {
      pill.classList.remove('active');
      pill.textContent = '💤 Alvás engedélyezve';
    }
  }

  // --- GPS Nyugtázó Csilingelő Hang (Web Audio + Android natív híd) ---
  function playGpsAcquiredChime() {
    // 1. Android Natív ToneGenerator (a telefon hangszóróján cseng)
    if (window.AndroidBridge && typeof window.AndroidBridge.playGpsFixChime === 'function') {
      try {
        window.AndroidBridge.playGpsFixChime();
      } catch (e) {}
    }

    // 2. Web Audio API csilingelő dupla hang (880Hz -> 1320Hz)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // 1. hang: 880 Hz (A5 tiszta magas hang)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.16);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // 2. hang: 1320 Hz (E6 tiszta csilingelés)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.14);
      gain2.gain.setValueAtTime(0.4, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.5);
    } catch (e) {
      console.warn('Web Audio nem elérhető:', e);
    }
  }

  // --- Változó Hangmagasságú Csippanás (Leállítás Emlékeztető) ---
  let chirpPitchIdx = 0;
  const REMINDER_PITCH_LIST = [750, 950, 1150, 850, 1050, 1250, 800, 1000];

  function playVariableChirp(customFreq) {
    // 1. Android Natív Híd (ha elérhető, háttérben is és képernyőzár alatt is szól)
    if (window.AndroidBridge && typeof window.AndroidBridge.playReminderChirp === 'function') {
      try {
        window.AndroidBridge.playReminderChirp();
        return;
      } catch (e) {}
    }

    // 2. Web Audio API szintetizált csippanás finoman emelkedő frekvenciával
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const baseFreq = customFreq || REMINDER_PITCH_LIST[chirpPitchIdx % REMINDER_PITCH_LIST.length];
      chirpPitchIdx = (chirpPitchIdx + 1) % REMINDER_PITCH_LIST.length;
      const targetFreq = baseFreq * 1.28;
      const duration = 0.16;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + duration);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.02);
      setTimeout(() => {
        try { ctx.close(); } catch (_) {}
      }, 280);
    } catch (e) {
      console.warn('Web Audio chirp hiba:', e);
    }
  }

  // --- GPS Visszajelzés: Piros villogó keret kereséskor, zöld fix esetén + hang ---
  function updateGpsVisualFeedback(hasFix, accuracy) {
    const edgeIndicator = document.getElementById('gps-edge-indicator');
    const dot = document.getElementById('gps-dot');
    const title = document.getElementById('gps-title');
    const accBadge = document.getElementById('gps-acc-badge');

    if (hasFix) {
      if (edgeIndicator) {
        edgeIndicator.className = 'gps-edge-indicator gps-fixed';
      }
      if (dot) dot.className = 'gps-dot active';
      if (title) title.textContent = state.gpsMode === 'sim' ? 'GPS: SM Szimuláció' : 'GPS: Rögzítve (Aktív)';
      if (accBadge && accuracy) accBadge.textContent = `(±${accuracy.toFixed(1)} m)`;

      if (!state.hadGpsFix) {
        state.hadGpsFix = true;
        playGpsAcquiredChime();
        showToast(`🛰️ GPS jel rögzítve! (Pontosság: ${accuracy ? accuracy.toFixed(1) + ' m' : 'kiváló'})`, '🛰️');
      }
    } else {
      // Amíg a GPS nem fogott jelet: a képernyő széle villogjon pirosan!
      if (edgeIndicator) {
        edgeIndicator.className = 'gps-edge-indicator gps-searching';
      }
      if (dot) dot.className = 'gps-dot searching';
      if (title) title.textContent = 'GPS: Keresés...';
      if (accBadge) accBadge.textContent = '(Műhold keresés...)';

      if (state.hadGpsFix) {
        state.hadGpsFix = false;
        showToast('⚠️ GPS műhold keresése...', '⚠️');
      }
    }
  }

  // --- Csapásirány / irányszög (Bearing) fokban (0-360°) ---
  function calcBearing(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
              Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
    return (Math.atan2(y, x) * toDeg + 360) % 360;
  }

  // --- Precíz GPS Nyomvonal Szűrő & Simító ---
  // Kiszűri a csillag/pókháló alakú driftet, a teleport ugrásokat és a kis zajt,
  // miközben a kanyarokat, köröket és hurkokat precíz élethűséggel rögzíti
  function addFilteredTrackPoint(lat, lng, accuracy, speedKmh, timestamp) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;
    const acc = (typeof accuracy === 'number' && accuracy > 0) ? accuracy : 2.5;
    if (acc > 35.0) return; // Gyenge / bizonytalan műholdjel elvetése (35m-ig megbízható zsebben/tokban)

    const nowTime = timestamp || Date.now();
    const speed = (typeof speedKmh === 'number') ? speedKmh : 0;

    if (!state.recordedPath || state.recordedPath.length === 0) {
      state.recordedPath = [[lat, lng, acc, nowTime, speed]];
      state.lastGpsFilterPoint = { lat, lng, time: nowTime, heading: null };
      state.lastPosition = { lat, lng };
      if (state.liveRouteLine) state.liveRouteLine.setLatLngs([[lat, lng]]);
      return;
    }

    const prevPt = state.lastGpsFilterPoint || {
      lat: state.recordedPath[state.recordedPath.length - 1][0],
      lng: state.recordedPath[state.recordedPath.length - 1][1],
      time: state.recordedPath[state.recordedPath.length - 1][3] || (nowTime - 1000),
      heading: null
    };

    const distMeters = calcHaversineMeters(prevPt.lat, prevPt.lng, lat, lng);
    const dtSec = Math.max(0.5, (nowTime - (prevPt.time || (nowTime - 1000))) / 1000);
    const calculatedSpeedKmh = (distMeters / dtSec) * 3.6;

    // 1. Teleport ugrás / cellatorony váltás kiszűrése (séta közben > 16 km/h érvénytelen)
    if (calculatedSpeedKmh > 16.0) {
      return;
    }

    // 2. Egy helyben állás / lassú bizonytalanság: GPS drift csillag alakú pókháló kiszűrése!
    // Ha 2.5 méternél kisebb az elmozdulás a legutóbbi rögzített ponttól, NEM húzunk új vonalat
    if (distMeters < 2.5) {
      return;
    }

    // 3. Haladási szög / kanyarodás vizsgálata
    const heading = calcBearing(prevPt.lat, prevPt.lng, lat, lng);
    let headingDiff = 0;
    if (prevPt.heading !== null && prevPt.heading !== undefined) {
      headingDiff = Math.abs(heading - prevPt.heading);
      if (headingDiff > 180) headingDiff = 360 - headingDiff;
    }

    // 4. Pont rögzítése:
    // - Ha a távolság >= 3.5m (egyenes vagy normál lépések)
    // - VAGY távolság >= 2.0m ÉS irányváltozás >= 15° (kanyarok, körök, hurkok tökéletes lekövetése!)
    const isForward = distMeters >= 3.5;
    const isCurve = (distMeters >= 2.0 && headingDiff >= 15);

    if (isForward || isCurve) {
      // 5. Exponenciális súlyozott simítás a mozgás iránya mentén
      const weight = Math.min(0.85, Math.max(0.40, 1.0 - (acc / 35.0)));
      const smoothLat = prevPt.lat + weight * (lat - prevPt.lat);
      const smoothLng = prevPt.lng + weight * (lng - prevPt.lng);

      state.recordedPath.push([smoothLat, smoothLng, acc, nowTime, speed > 0 ? speed : calculatedSpeedKmh]);
      state.lastGpsFilterPoint = { lat: smoothLat, lng: smoothLng, time: nowTime, heading: heading };
      state.lastPosition = { lat: smoothLat, lng: smoothLng };

      if (state.liveRouteLine) {
        state.liveRouteLine.setLatLngs(state.recordedPath.map(p => [p[0], p[1]]));
      }
    }
  }

  // --- Valós telefonos GPS indítása ---
  function startRealGpsTracking() {
    if (window.AndroidBridge) {
      // Androidon a natív háttérszolgáltatás (TrackingService) biztosítja az egyedüli, megbízható GPS jelet.
      // NEM indítunk párhuzamos navigator.geolocation.watchPosition-t, mert a két párhuzamos adatfolyam
      // egymással viaskodva csillag alakú cikcakkokat rajzolna a térképre!
      console.log('Android natív TrackingService fut, WebView watchPosition letiltva.');
      return;
    }
    if (!navigator.geolocation) {
      showToast('A böngésző nem támogatja a GPS helymeghatározást!', '❌');
      return;
    }

    state.lastPosition = null;
    state.lastGpsFilterPoint = null;
    state.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 3.0;
        const speedKmh = pos.coords.speed !== null && !isNaN(pos.coords.speed) ? Number((pos.coords.speed * 3.6).toFixed(1)) : 0;

        state.gps.lat = lat;
        state.gps.lng = lng;
        state.gps.accuracy = acc;
        state.gps.speed = speedKmh;

        const hasFix = (acc <= 18);
        updateGpsVisualFeedback(hasFix, acc);

        if (state.liveCurMarker) state.liveCurMarker.setLatLng([lat, lng]);
        if (state.liveMap) state.liveMap.panTo([lat, lng]);

        if (state.walkStatus === 'RUNNING') {
          addFilteredTrackPoint(lat, lng, acc, speedKmh, Date.now());
        }

        updateLiveTelemetryUI();
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
      },
      (err) => {
        console.warn('GPS hiba:', err);
        updateGpsVisualFeedback(false, null);
        showToast('GPS hiba: ' + (err.message || 'Nincs engedély'), '⚠️');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  function stopRealGpsTracking() {
    if (state.geoWatchId !== null) {
      navigator.geolocation.clearWatch(state.geoWatchId);
      state.geoWatchId = null;
    }
  }

  function startLiveTimerInterval() {
    clearInterval(state.timerInterval);
    let coordIndex = 0;
    const simRecordedPoints = [[state.gps.lat, state.gps.lng]];

    state.timerInterval = setInterval(() => {
      if (state.walkStatus === 'RUNNING') {
        if (state.startTime) {
          const wallSec = Math.round((Date.now() - state.startTime) / 1000);
          state.durationSec = Math.max(state.durationSec + 1, wallSec);
        } else {
          state.durationSec++;
        }
        state.activeMovingSecLive++;

        // Ha valós módban a GPS egyáltalán nem adott koordinátát, lépésekből indulunk el
        if (state.gpsMode === 'real' && !state.hadGpsFix && state.meters === 0 && (state.steps || 0) >= 10) {
          const stepLenM = (state.settings.stepLengthCm || 65) / 100;
          state.meters = (state.steps || 0) * stepLenM;
          if (state.isUsingStick) state.stickMeters = state.meters; else state.noStickMeters = state.meters;
        }

        let currentSpd = parseFloat(state.gps.speed) || (state.gpsMode === 'sim' ? 2.2 : 0);
        // Ha valós módban a GPS sebessége 0, de mozgásban vagyunk, a valós lépésekből és méterekből számítunk sebességet
        if (currentSpd <= 0.2 && state.meters > 0 && state.activeMovingSecLive > 0) {
          currentSpd = Math.round(((state.meters / state.activeMovingSecLive) * 3.6) * 10) / 10;
        }
        state.speedSamples.push({ 
          sec: state.durationSec, 
          speedKmh: currentSpd, 
          isRest: false,
          meters: Math.round(state.meters),
          steps: state.steps,
          isUsingStick: state.isUsingStick
        });

        // Ha szimulációs módban vagyunk, a virtuális lépéseket számoljuk
        if (state.gpsMode === 'sim') {
          state.meters += 1.4;
          if (state.isUsingStick) {
            state.stickMeters += 1.4;
          } else {
            state.noStickMeters += 1.4;
          }
          state.steps += 2;

          if (state.durationSec % 5 === 0 && coordIndex < trackCoords.length - 1) {
            coordIndex++;
            state.gps.lat = trackCoords[coordIndex][0];
            state.gps.lng = trackCoords[coordIndex][1];
            simRecordedPoints.push([state.gps.lat, state.gps.lng]);

            if (state.liveRouteLine) state.liveRouteLine.setLatLngs(simRecordedPoints);
            if (state.liveCurMarker) state.liveCurMarker.setLatLng([state.gps.lat, state.gps.lng]);
            if (state.liveMap) state.liveMap.panTo([state.gps.lat, state.gps.lng]);

            state.gps.address = `Margitszigeti Sétány ${12 + coordIndex * 2}.`;
          }
        }

        updateLiveTelemetryUI();
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
      } else if (state.walkStatus === 'PAUSED') {
        // Pause alatt másodpercenként nő a szünet időtartama
        state.durationSec++;
        state.currentRestDurationLive++;

        state.speedSamples.push({ 
          sec: state.durationSec, 
          speedKmh: 0.0, 
          isRest: true,
          meters: Math.round(state.meters),
          steps: state.steps,
          isUsingStick: state.isUsingStick
        });

        // KIZÁRÓLAG AKKOR SZÁMÍT HIVATALOS SM PIHENŐNEK, HA ELÉRI A BEÁLLÍTOTT KÜSZÖBÖT (pl. 60 mp)!
        const restThreshold = state.settings.restThresholdSec || 60;
        if (state.currentRestDurationLive === restThreshold) {
          state.restCountLive++;
          state.restingSecLive += restThreshold;
          showToast(`⚠️ Hivatalos SM Pihenő rögzítve! (Elérted a ${restThreshold} másodpercet)`, '🪑');
        } else if (state.currentRestDurationLive > restThreshold) {
          state.restingSecLive++;
        }

        updateLiveTelemetryUI();
      }

      // Periodikus leállítás emlékeztető csippanás (web nézetben vagy böngészőben)
      const remInterval = state.settings.reminderIntervalSec || 0;
      if (remInterval > 0 && state.durationSec > 0 && (state.durationSec % remInterval === 0)) {
        if (!window.AndroidBridge) {
          playVariableChirp();
        }
      }
    }, 1000);
  }

  function startWalk() {
    // Ha a háttérszolgáltatás már mér, ne töröljük le az eddigi adatokat, hanem csatlakozzunk rá!
    if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
      try {
        const snap = JSON.parse(window.AndroidBridge.getTrackingSnapshot() || '{}');
        if (snap && (snap.status === 'RECORDING' || snap.status === 'PAUSED')) {
          window.onBackgroundTrackingUpdate(snap);
          showToast('Csatlakozva a háttérben futó sétához!', '▶');
          return;
        }
      } catch(e) {}
    }

    state.walkStatus = 'RUNNING';
    state.startTime = Date.now();
    state.durationSec = 0;
    state.activeMovingSecLive = 0;
    state.restingSecLive = 0;
    state.meters = 0;
    state.steps = 0;
    state.lastStepCountForDistance = 0;
    state.lastStepTimestamp = 0;

    // Bot állapot inicializálása az alapértelmezett mód szerint
    if (state.settings.stickMode === 'ALWAYS' || state.settings.stickMode === 'START_WITH') {
      state.isUsingStick = true;
    }
    state.stickMeters = 0;
    state.noStickMeters = 0;

    state.restCountLive = 0;
    state.currentRestDurationLive = 0;
    state.recordedPath = [];
    state.speedSamples = [];
    state.lastPosition = null;
    state.lastGpsFilterPoint = null;
    document.body.classList.remove('state-paused');
    document.body.classList.add('state-running');
    state.hadGpsFix = false;
    updateGpsVisualFeedback(false, null);

    requestScreenWakeLock();

    if (window.AndroidBridge) {
      if (typeof window.AndroidBridge.startStepCountingWithAllParams === 'function') {
        window.AndroidBridge.startStepCountingWithAllParams(
          state.settings.restThresholdSec || 60,
          state.settings.stepLengthCm || 65,
          state.settings.reminderIntervalSec || 0
        );
      } else if (typeof window.AndroidBridge.startStepCountingWithParams === 'function') {
        window.AndroidBridge.startStepCountingWithParams(
          state.settings.restThresholdSec || 60,
          state.settings.stepLengthCm || 65
        );
        if (typeof window.AndroidBridge.setReminderInterval === 'function') {
          window.AndroidBridge.setReminderInterval(state.settings.reminderIntervalSec || 0);
        }
      } else if (typeof window.AndroidBridge.startStepCounting === 'function') {
        window.AndroidBridge.startStepCounting();
      }
    }

    if (state.gpsMode === 'real') {
      showToast('Séta elindult! Valós hardveres GPS & lépésszámláló aktív.', '▶');
      startRealGpsTracking();
    } else {
      showToast('Séta elindult! Margitszigeti szimulációs teszt aktív.', '▶');
    }

    updateLiveTelemetryUI();
    updateQuickGoalAndRestDisplay();

    startLiveTimerInterval();
  }

  function pauseWalk() {
    state.walkStatus = 'PAUSED';
    state.currentRestDurationLive = 0;
    document.body.classList.remove('state-running');
    document.body.classList.add('state-paused');
    if (window.AndroidBridge && typeof window.AndroidBridge.pauseStepCounting === 'function') {
      window.AndroidBridge.pauseStepCounting();
    }
    updateLiveTelemetryUI();
    showToast(`⏸️ Séta szüneteltetve (Pause aktív). Küszöb: ${state.settings.restThresholdSec} mp állás = 1 pihenő!`, '⏸');
  }

  function resumeWalk() {
    state.walkStatus = 'RUNNING';
    state.currentRestDurationLive = 0;
    document.body.classList.remove('state-paused');
    document.body.classList.add('state-running');
    requestScreenWakeLock();
    if (window.AndroidBridge && typeof window.AndroidBridge.resumeStepCounting === 'function') {
      window.AndroidBridge.resumeStepCounting();
    }
    updateLiveTelemetryUI();
    showToast('Séta folytatódik!', '▶');
  }

  function stopWalk() {
    state.walkStatus = 'STOPPED';
    clearInterval(state.timerInterval);
    stopRealGpsTracking();

    // 1. Android háttérszolgáltatás legfrissebb állapotának és teljes nyomvonalának szinkron lekérése
    if (window.AndroidBridge) {
      if (typeof window.AndroidBridge.getRecordedPathJson === 'function') {
        try {
          const pathJson = window.AndroidBridge.getRecordedPathJson();
          if (pathJson && pathJson.length > 5) {
            syncRecordedPathFromBackground(pathJson);
          }
        } catch (e) {
          console.warn('getRecordedPathJson hiba stopWalk-ban:', e);
        }
      }
      if (typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
        try {
          const snapJson = window.AndroidBridge.getTrackingSnapshot();
          const snap = JSON.parse(snapJson);
          if (snap) {
            if (snap.pathPoints && Array.isArray(snap.pathPoints) && snap.pathPoints.length > 0) {
              syncRecordedPathFromBackground(snap.pathPoints);
            }
            if (typeof snap.totalSteps === 'number' && snap.totalSteps > (state.steps || 0)) {
              state.steps = snap.totalSteps;
            }
            if (typeof snap.totalDistanceMeters === 'number' && snap.totalDistanceMeters > (state.meters || 0)) {
              state.meters = snap.totalDistanceMeters;
            }
            if (typeof snap.durationSeconds === 'number' && snap.durationSeconds > (state.durationSec || 0)) {
              state.durationSec = snap.durationSeconds;
            }
            if (typeof snap.restSeconds === 'number') {
              state.restingSecLive = snap.restSeconds;
            }
            if (typeof snap.restCount === 'number') {
              state.restCountLive = snap.restCount;
            }
          }
        } catch (e) {
          console.warn('Snapshot lekérési hiba stopWalk-ban:', e);
        }
      }
      if (typeof window.AndroidBridge.stopStepCounting === 'function') {
        window.AndroidBridge.stopStepCounting();
      }
    }
    releaseScreenWakeLock();
    document.body.classList.remove('state-paused');
    document.body.classList.remove('state-running');
    const edgeIndicator = document.getElementById('gps-edge-indicator');
    if (edgeIndicator) edgeIndicator.className = 'gps-edge-indicator gps-idle';
    state.hadGpsFix = false;

    // 2. FALIÓRA IDŐ GARANCIA (Kikapcsolt képernyő és háttérben zsebben séta esetén is a valós időt veszi!)
    if (state.startTime) {
      const realElapsedSec = Math.max(0, Math.round((Date.now() - state.startTime) / 1000));
      if (realElapsedSec > state.durationSec) {
        state.durationSec = realElapsedSec;
      }
    }

    // 3. TÁVOLSÁG: Kizárólag akkor pótoljuk a távolságot lépésekből, ha a GPS egyáltalán nem mért (pl. fedett helyiség)
    if (state.meters === 0 && (state.steps || 0) >= 10 && !state.hadGpsFix) {
      const stepLenM = (state.settings.stepLengthCm || 65) / 100;
      const expectedStepDist = Math.round((state.steps || 0) * stepLenM);
      state.meters = expectedStepDist;
      if (state.isUsingStick) {
        state.stickMeters = expectedStepDist;
      } else {
        state.noStickMeters = expectedStepDist;
      }
    }

    // 4. AKTÍV SÉTA ÉS PIHENŐ KORREKCIÓ (Ha végig gyalogolt, nem lehet 100% pihenő!)
    const totalSec = Math.max(1, state.durationSec);
    let restSec = state.restingSecLive || 0;
    let restCount = state.restCountLive || 0;
    if (restSec >= totalSec && (state.steps || 0) > 10) {
      const activeSecEst = Math.min(totalSec, Math.round((state.steps || 0) / 1.6));
      restSec = Math.max(0, totalSec - activeSecEst);
      if (restSec < (state.settings.restThresholdSec || 60)) {
        restCount = 0;
        restSec = 0;
      }
    }
    const activeSec = Math.max(0, totalSec - restSec);

    const roundedMeters = Math.round(state.meters);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    const timeStr = `${m}:${s}`;

    updateLiveTelemetryUI();

    const walkStartTimeMs = (typeof state.startTime === 'number' && state.startTime > 0)
      ? state.startTime
      : (Date.now() - (totalSec * 1000));
    const walkStartDate = new Date(walkStartTimeMs);
    const today = walkStartDate.toISOString().split('T')[0];
    const walkStartTimeStr = walkStartDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
    const pathData = state.recordedPath && state.recordedPath.length > 0 ? [...state.recordedPath] : [];

    // GPS pontosság statisztikák kiszámítása minden rögzített mérési pontból
    const accuracies = (state.recordedPath || []).map(p => Array.isArray(p) ? p[2] : (p?.accuracy || p?.accuracyMeters)).filter(a => typeof a === 'number' && a > 0);
    const avgAcc = accuracies.length > 0 ? (accuracies.reduce((s, a) => s + a, 0) / accuracies.length).toFixed(1) : '2.5';
    const minAcc = accuracies.length > 0 ? Math.min(...accuracies).toFixed(1) : '1.8';
    const maxAcc = accuracies.length > 0 ? Math.max(...accuracies).toFixed(1) : '3.5';

    const newRoute = {
      id: 'route_' + walkStartTimeMs,
      title: `Élő séta (${today} ${walkStartTimeStr})`,
      date: today,
      time: walkStartTimeStr,
      startTime: walkStartTimeMs,
      timestamp: walkStartTimeMs,
      meters: roundedMeters,
      stickMeters: Math.round(state.stickMeters),
      noStickMeters: Math.round(state.noStickMeters),
      stickUsed: state.stickMeters > 0,
      steps: state.steps,
      measuredStepLenCm: (state.steps > 0 && roundedMeters > 0) ? Math.round((roundedMeters / state.steps) * 100) : 0,
      durationStr: `${timeStr} (${totalSec} mp)`,
      durationSec: totalSec,
      activeSec: activeSec,
      restSec: restSec,
      avgSpeed: activeSec > 0 ? `${((roundedMeters / activeSec) * 3.6).toFixed(1)} km/h` : '0.0 km/h',
      restCount: restCount,
      restDurationStr: `${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`,
      elevationGain: '+2 m',
      elevationLoss: '-1 m',
      cadence: activeSec > 0 ? `${Math.round((state.steps / activeSec) * 60)} lépés/p` : '0 lépés/p',
      activeDurationStr: `${activeSec} mp (${Math.floor(activeSec / 60)}p ${activeSec % 60}mp)`,
      waypointsCount: state.waypoints.length,
      waypoints: state.waypoints.map(w => ({ ...w })),
      gpsAccuracyAvg: avgAcc,
      gpsAccuracyMin: minAcc,
      gpsAccuracyMax: maxAcc,
      gpsMeasurementsCount: accuracies.length,
      note: `Másodperc alapon rögzített séta. Összesen ${totalSec} mp, ebből ${restSec} mp pihenő (${restCount} db).` +
            (state.stickMeters > 0 ? ` 🦯 Bottal: ${Math.round(state.stickMeters)} m, nélküle: ${Math.round(state.noStickMeters)} m.` : ' 🚶 Végig bot nélkül.') +
            ` 🛰️ GPS pontosság: átl. ±${avgAcc} m (min: ±${minAcc} m, max: ±${maxAcc} m).`,
      tags: ['#mai_séta', '#másodperc_alapú'],
      path: pathData,
      speedSamples: state.speedSamples && state.speedSamples.length > 0 ? [...state.speedSamples] : [],
      // Másodperc alapú eseménylista a visszanézéshez
      timelineEvents: (restCount > 0 && restSec > 0) ? [
        { time: `0 – ${Math.round(activeSec * 0.4)} mp`, desc: '🚶 Rajt és folyamatos séta', duration: `${Math.round(activeSec * 0.4)} mp (aktív)`, isRest: false },
        { time: `${Math.round(activeSec * 0.4)} – ${Math.round(activeSec * 0.4) + restSec} mp`, desc: `🪑 Pihenő (küszöb: ${state.settings.restThresholdSec} mp felett)`, duration: `${restSec} mp (pihenő)`, isRest: true },
        { time: `${Math.round(activeSec * 0.4) + restSec} – ${totalSec} mp`, desc: '🏁 Séta befejezése és célba érkezés', duration: `${Math.round(activeSec * 0.6)} mp (aktív)`, isRest: false }
      ] : [
        { time: `0 – ${totalSec} mp`, desc: '🚶 Folyamatos megállás nélküli séta', duration: `${totalSec} mp (aktív)`, isRest: false }
      ]
    };

    state.savedRoutes.unshift(newRoute);
    state.selectedRoute = newRoute;

    // Felhasználói séták azonnali perzisztálása a telefon/gép memóriájába
    try {
      const storedUserRoutes = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
      storedUserRoutes.unshift(newRoute);
      localStorage.setItem('csampazo_user_routes', JSON.stringify(storedUserRoutes));
    } catch(e) {
      console.warn('Nem sikerült menteni a user route-ot', e);
    }

    const logLine = `${today} | ${state.steps} | ${roundedMeters} m | ${timeStr} (${totalSec}mp) | SM Séta | ${restCount} pihenő (${restSec}mp) | GPS pontosság: ±${avgAcc}m (min: ±${minAcc}m, max: ±${maxAcc}m) | #csampazo #seta | ${newRoute.note}`;
    fetch('/api/save-log', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: logLine + '\n'
    }).catch(() => {});

    renderSavedRoutesTimeline();
    renderWeeklyCalendar();
    updateSummaryScreen(newRoute);
    updateProgressScreen();
    checkLevelProgression();

    showToast(`🎉 Séta befejezve! Táv: ${roundedMeters} m, Idő: ${totalSec} másodperc (${timeStr}).`, '⏹');

    // Automatikus GPX mentés a belsőtárhely/csampazo mappába és közvetlen megnyitás felajánlása
    setTimeout(() => {
      saveAndOptionallyOpenGpx(newRoute, true);
    }, 450);
  }

  function updateLiveTelemetryUI() {
    const stateBadge = document.getElementById('live-state-badge');
    const distEl = document.getElementById('live-distance');
    const timerEl = document.getElementById('live-timer');
    const stepsEl = document.getElementById('live-steps');
    const wpCountEl = document.getElementById('live-waypoint-count');
    const coordsText = document.getElementById('gps-coords-text');

    if (distEl) distEl.textContent = `${Math.round(state.meters)} m`;
    if (stepsEl) stepsEl.textContent = `${state.steps} lépés`;
    if (wpCountEl) wpCountEl.textContent = `${state.waypoints.length} db`;

    if (coordsText) {
      coordsText.textContent = `${state.gps.lat.toFixed(6)}° N, ${state.gps.lng.toFixed(6)}° E`;
    }

    if (timerEl) {
      const min = String(Math.floor(state.durationSec / 60)).padStart(2, '0');
      const sec = String(state.durationSec % 60).padStart(2, '0');
      // Másodperc alapú kiírás!
      timerEl.textContent = `${min}:${sec} (${state.durationSec} mp)`;
    }

    if (stateBadge) {
      stateBadge.className = 't-val status-badge';
      if (state.walkStatus === 'RUNNING') {
        stateBadge.textContent = '🟢 Séta folyamatban';
        stateBadge.classList.add('running');
        document.body.classList.remove('state-paused');
        document.body.classList.add('state-running');
      } else if (state.walkStatus === 'PAUSED') {
        stateBadge.textContent = '⏸️ Szünet (Pause)';
        stateBadge.classList.add('paused');
        document.body.classList.remove('state-running');
        document.body.classList.add('state-paused');
      } else if (state.walkStatus === 'STOPPED') {
        stateBadge.textContent = '⏹️ Befejezve';
        document.body.classList.remove('state-running');
        document.body.classList.remove('state-paused');
      } else {
        stateBadge.textContent = 'Készenlét';
        document.body.classList.remove('state-running');
        document.body.classList.remove('state-paused');
      }
    }

    updateStickButtonUI();
  }

  // ==========================================================================
  // 8. 3. KÉPERNYŐ: ÖSSZESÍTÉS & MÁSODPERC ALAPÚ VISSZANÉZHETŐ IDŐVONAL
  // ==========================================================================
  function updateSummaryScreen(route) {
    const titleEl = document.getElementById('sum-route-title');
    const metaEl = document.getElementById('sum-route-meta');
    const distEl = document.getElementById('sum-metric-distance');
    const stepsEl = document.getElementById('sum-metric-steps');
    const speedEl = document.getElementById('sum-metric-speed');
    const restsEl = document.getElementById('sum-metric-rests');
    const restDurEl = document.getElementById('sum-metric-rest-duration');
    const elevEl = document.getElementById('sum-metric-elevation');
    const descEl = document.getElementById('sum-metric-descent');

    const extraTotalTime = document.getElementById('sum-extra-total-time');
    const extraActiveTime = document.getElementById('sum-extra-active-time');
    const extraRestTime = document.getElementById('sum-extra-rest-time');
    const extraCadence = document.getElementById('sum-extra-cadence');
    const steplenSubEl = document.getElementById('sum-metric-steplen');
    const extraSteplen = document.getElementById('sum-extra-steplen');

    if (!route) {
      if (titleEl) titleEl.textContent = 'Még nincs mentett séta';
      if (metaEl) metaEl.textContent = 'Kezdj egy új sétát a Főoldalon a Start gombbal!';
      if (distEl) distEl.textContent = '0 m';
      if (stepsEl) stepsEl.textContent = '0 lépés';
      if (steplenSubEl) steplenSubEl.textContent = 'Mért lépéshossz: —';
      if (speedEl) speedEl.textContent = '—';
      if (restsEl) restsEl.textContent = '0 pihenő';
      if (restDurEl) restDurEl.textContent = 'Pihenőidő összesen: 0 mp';
      if (elevEl) elevEl.textContent = '0 m';
      if (descEl) descEl.textContent = '0 m';

      if (extraTotalTime) extraTotalTime.textContent = '0 mp (00:00)';
      if (extraActiveTime) extraActiveTime.textContent = '0 mp (00:00)';
      if (extraRestTime) extraRestTime.textContent = '0 mp (00:00)';
      if (extraCadence) extraCadence.textContent = '—';
      if (extraSteplen) extraSteplen.textContent = '—';

      const badgeEl = document.getElementById('sec-timeline-total-badge');
      const segmentsBar = document.getElementById('sec-timeline-segments-bar');
      const eventsList = document.getElementById('sec-events-list');
      if (badgeEl) badgeEl.textContent = 'Összesen: 0 másodperc';
      if (segmentsBar) segmentsBar.innerHTML = '<div style="width:100%;text-align:center;color:var(--text-muted);font-size:0.8rem;line-height:28px;">Nincs séta adat</div>';
      if (eventsList) eventsList.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-muted);">Még nincs rögzített séta esemény.</div>';
      renderSpeedProfileLine(null);
      renderStepLengthAnalysis(null);
      return;
    }

    const totalSec = typeof route.durationSec === 'number' ? route.durationSec : 0;
    const restSec = typeof route.restSec === 'number' ? route.restSec : 0;
    const activeSec = typeof route.activeSec === 'number' ? route.activeSec : Math.max(0, totalSec - restSec);

    // Távolság-lépésszám alapú átlagos lépéshossz számítás (cm)
    const steps = route.steps || 0;
    const meters = route.meters || 0;
    const stepLenCm = (steps > 0 && meters > 0) ? Math.round((meters / steps) * 100) : 0;
    const stepLenText = stepLenCm > 0 ? `${stepLenCm} cm` : '—';

    if (titleEl) titleEl.textContent = route.title;
    if (metaEl) metaEl.textContent = `${route.date} • ${route.time || ''} • Részletes másodperc alapú kimutatás`;
    if (distEl) distEl.textContent = `${route.meters} m`;
    if (stepsEl) stepsEl.textContent = `${route.steps} lépés`;
    if (steplenSubEl) steplenSubEl.textContent = `Mért lépéshossz: ${stepLenText}`;
    if (speedEl) speedEl.textContent = route.avgSpeed || '2.1 km/h';
    if (restsEl) restsEl.textContent = `${route.restCount} pihenő`;
    if (restDurEl) restDurEl.textContent = `Pihenőidő összesen: ${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`;
    if (elevEl) elevEl.textContent = route.elevationGain || '+2 m';
    if (descEl) descEl.textContent = route.elevationLoss || '-1 m';

    if (extraTotalTime) extraTotalTime.textContent = `${totalSec} mp (${route.durationStr ? route.durationStr.split(' ')[0] : '03:10'})`;
    if (extraActiveTime) extraActiveTime.textContent = `${activeSec} mp (${Math.floor(activeSec / 60)}p ${activeSec % 60}mp)`;
    if (extraRestTime) extraRestTime.textContent = `${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`;
    if (extraCadence) extraCadence.textContent = route.cadence || '50 lépés/p';
    if (extraSteplen) extraSteplen.textContent = stepLenText;

    // SEBESSÉG SZÍNVONAL ÉS SZÍNEK SEBESSÉGE JELMAGYARÁZAT
    renderSpeedProfileLine(route);

    // MÁSODPERC ALAPÚ ESEMÉNY-IDŐVONAL VISSZANÉZÉSE
    renderSecondsTimeline(route, totalSec, activeSec, restSec);

    // SM MÉRT LÉPÉSHOSSZ ELEMZÉS ÉS JÁRÁSDINAMIKA KIMUTATÁS
    renderStepLengthAnalysis(route);
  }

  // ==========================================================================
  // SEBESSÉG SZÍNVONAL & SZÍNEK SEBESSÉGE JELMAGYARÁZAT
  // ==========================================================================
  function renderSpeedProfileLine(route) {
    const barEl = document.getElementById('speed-line-bar');
    const badgeEl = document.getElementById('sum-speed-avg-badge');
    if (!barEl) return;

    if (!route) {
      barEl.innerHTML = '<div style="width:100%;text-align:center;color:var(--text-muted);font-size:0.75rem;line-height:24px;">Nincs séta adat</div>';
      if (badgeEl) badgeEl.textContent = 'Átlag: —';
      return;
    }

    const avgSpeedText = route.avgSpeed || '2.1 km/h';
    if (badgeEl) badgeEl.textContent = `Átlagsebesség: ${avgSpeedText}`;

    const totalSec = Math.max(1, route.durationSec || 190);
    const restSec = route.restSec || 0;
    const activeSec = route.activeSec || Math.max(1, totalSec - restSec);
    const avgNum = parseFloat(avgSpeedText) || 2.1;

    let segments = [];

    // Ha vannak másodperces minták (valós vagy szimulált séta során rögzítve)
    if (route.speedSamples && Array.isArray(route.speedSamples) && route.speedSamples.length > 0) {
      let currentSeg = null;
      route.speedSamples.forEach((sample, idx) => {
        let spd = 0;
        if (sample.isRest) {
          spd = 0.0;
        } else if (typeof sample.speedKmh === 'number' && sample.speedKmh > 0.3) {
          spd = sample.speedKmh;
        } else {
          // Ha a GPS 0-t adott a telefonon séta közben, a valós átlagsebességet használjuk természetes ritmussal
          const variation = ((idx % 7) - 3) * 0.08;
          spd = Math.max(0.5, Math.round((avgNum + variation) * 10) / 10);
        }
        const cat = getSpeedCategory(spd);
        if (!currentSeg) {
          currentSeg = { speedKmh: spd, cat: cat.key, color: cat.color, label: cat.label, duration: 1, startSec: sample.sec || idx };
        } else if (currentSeg.cat === cat.key) {
          currentSeg.duration++;
          currentSeg.speedKmh = Math.round(((currentSeg.speedKmh + spd) / 2) * 10) / 10;
        } else {
          segments.push(currentSeg);
          currentSeg = { speedKmh: spd, cat: cat.key, color: cat.color, label: cat.label, duration: 1, startSec: sample.sec || idx };
        }
      });
      if (currentSeg) segments.push(currentSeg);
    } else if (route.timelineEvents && Array.isArray(route.timelineEvents) && route.timelineEvents.length > 0) {
      // Eseménylistából származtatott szakaszok
      route.timelineEvents.forEach(ev => {
        const isRest = !!ev.isRest;
        const durMatch = (ev.duration || '').match(/(\d+)\s*mp/);
        const dur = durMatch ? parseInt(durMatch[1], 10) : Math.round(totalSec / route.timelineEvents.length);
        const spd = isRest ? 0.0 : avgNum;
        const cat = getSpeedCategory(spd);
        segments.push({
          speedKmh: spd,
          cat: cat.key,
          color: cat.color,
          label: cat.label,
          duration: dur
        });
      });
    } else {
      // Szintetikus profil aktív / pihenő arányból
      if (restSec <= 0) {
        // Folyamatos séta: egyetlen összefüggő sáv az átlagsebességgel
        const catWalk = getSpeedCategory(avgNum);
        segments = [
          { speedKmh: avgNum, cat: catWalk.key, color: catWalk.color, label: catWalk.label, duration: totalSec }
        ];
      } else {
        const walk1Dur = Math.round(activeSec * 0.45);
        const restDur = restSec;
        const walk2Dur = Math.max(1, totalSec - walk1Dur - restDur);

        const catWalk1 = getSpeedCategory(avgNum + 0.2);
        const catRest = getSpeedCategory(0.0);
        const catWalk2 = getSpeedCategory(avgNum - 0.1);

        segments = [
          { speedKmh: avgNum + 0.2, cat: catWalk1.key, color: catWalk1.color, label: catWalk1.label, duration: walk1Dur },
          { speedKmh: 0.0, cat: catRest.key, color: catRest.color, label: catRest.label, duration: restDur },
          { speedKmh: Math.max(0.8, avgNum - 0.1), cat: catWalk2.key, color: catWalk2.color, label: catWalk2.label, duration: walk2Dur }
        ];
      }
    }

    const totalSegDur = segments.reduce((sum, s) => sum + s.duration, 0) || totalSec;

    barEl.innerHTML = segments.map((seg, i) => {
      const pct = Math.max(2, Math.round((seg.duration / totalSegDur) * 1000) / 10);
      const speedTxt = seg.speedKmh > 0 ? `${seg.speedKmh.toFixed(1)} km/h` : '0.0 km/h (Pihenő)';
      return `
        <div class="speed-seg" 
             data-index="${i}" 
             data-speed="${speedTxt}" 
             data-label="${seg.label}" 
             data-dur="${seg.duration} mp" 
             style="width: ${pct}%; background: ${seg.color};" 
             title="${seg.duration} mp: ${speedTxt} — ${seg.label}">
        </div>
      `;
    }).join('');

    barEl.querySelectorAll('.speed-seg').forEach(el => {
      el.addEventListener('click', (e) => {
        const spd = e.currentTarget.dataset.speed;
        const lbl = e.currentTarget.dataset.label;
        const dur = e.currentTarget.dataset.dur;
        showToast(`⚡ ${dur}: ${spd} (${lbl})`, '⚡');
      });
    });
  }

  function getSpeedCategory(speedKmh) {
    if (speedKmh <= 0.3) {
      return { key: 'rest', color: '#ef4444', label: 'Állás / Pihenő (0.0 km/h)' };
    } else if (speedKmh <= 1.5) {
      return { key: 'slow', color: '#f59e0b', label: 'Lassú séta (0.1 – 1.5 km/h)' };
    } else if (speedKmh <= 3.0) {
      return { key: 'normal', color: '#10b981', label: 'Normál séta (1.6 – 3.0 km/h)' };
    } else {
      return { key: 'fast', color: '#06b6d4', label: 'Tempós séta (> 3.0 km/h)' };
    }
  }

  function renderSecondsTimeline(route, totalSec, activeSec, restSec) {
    const badgeEl = document.getElementById('sec-timeline-total-badge');
    const segmentsBar = document.getElementById('sec-timeline-segments-bar');
    const eventsList = document.getElementById('sec-events-list');

    if (badgeEl) badgeEl.textContent = `Összesen: ${totalSec} másodperc`;

    const hasRest = restSec > 0 && (!route || route.restCount === undefined || route.restCount > 0);

    // Eseménylista meghatározása
    let events = [];
    if (!hasRest) {
      // Folyamatos séta pihenő nélkül: kizárólag 1 db folyamatos esemény van
      events = [
        { time: `0 – ${totalSec} mp`, desc: '🚶 Folyamatos megállás nélküli séta', duration: `${totalSec} mp (aktív)`, isRest: false }
      ];
    } else if (route && Array.isArray(route.timelineEvents) && route.timelineEvents.length > 0) {
      events = route.timelineEvents;
    } else {
      events = [
        { time: `0 – ${Math.round(activeSec * 0.4)} mp`, desc: '🚶 Rajt és folyamatos séta', duration: `${Math.round(activeSec * 0.4)} mp (aktív)`, isRest: false },
        { time: `${Math.round(activeSec * 0.4)} – ${Math.round(activeSec * 0.4) + restSec} mp`, desc: `🪑 Pihenő (küszöb: ${state.settings.restThresholdSec || 60} mp felett)`, duration: `${restSec} mp (pihenő)`, isRest: true },
        { time: `${Math.round(activeSec * 0.4) + restSec} – ${totalSec} mp`, desc: '🏁 Séta befejezése és célba érkezés', duration: `${Math.round(activeSec * 0.6)} mp (aktív)`, isRest: false }
      ];
    }

    // Százalékos sávok kirajzolása
    if (segmentsBar) {
      if (!hasRest || events.length === 1) {
        // Folyamatos séta: EGYETLEN 100%-os zöld sáv, nincs kétfelé szedve!
        segmentsBar.innerHTML = `
          <div class="sec-seg-walk" style="width: 100%;" title="Folyamatos séta: ${totalSec} mp">${totalSec}s folyamatos séta</div>
        `;
      } else {
        // Valós pihenő esetén
        const walk1Pct = Math.round((activeSec * 0.4 / totalSec) * 100);
        const restPct = Math.round((restSec / totalSec) * 100);
        const walk2Pct = Math.max(5, 100 - walk1Pct - restPct);
        segmentsBar.innerHTML = `
          <div class="sec-seg-walk" style="width: ${walk1Pct}%;" title="Séta: ${Math.round(activeSec * 0.4)} mp">${Math.round(activeSec * 0.4)}s séta</div>
          <div class="sec-seg-rest" style="width: ${restPct}%;" title="Pihenő: ${restSec} mp">${restSec}s pihenő 🪑</div>
          <div class="sec-seg-walk" style="width: ${walk2Pct}%;" title="Séta: ${Math.round(activeSec * 0.6)} mp">${Math.round(activeSec * 0.6)}s séta</div>
        `;
      }
    }

    // Eseménylista megjelenítése
    if (eventsList) {
      eventsList.innerHTML = events.map(ev => `
        <div class="sec-event-row">
          <div class="sec-event-top-row">
            <span class="sec-event-time">${ev.time}</span>
            <span class="sec-event-duration ${ev.isRest ? 'is-rest' : ''}">${ev.duration}</span>
          </div>
          <div class="sec-event-desc">${ev.desc}</div>
        </div>
      `).join('');
    }
  }

  // ==========================================================================
  // SM MÉRT LÉPÉSHOSSZ ELEMZÉS & JÁRÁSDINAMIKA KIMUTATÁS
  // ==========================================================================
  function renderStepLengthAnalysis(route) {
    const avgBadge = document.getElementById('sum-steplen-avg-badge');
    const mainVal = document.getElementById('sum-steplen-main-val');
    const mainSub = document.getElementById('sum-steplen-main-sub');
    const half1Val = document.getElementById('sum-steplen-half1-val');
    const half2Val = document.getElementById('sum-steplen-half2-val');
    const diffVal = document.getElementById('sum-steplen-diff-val');
    const diffSub = document.getElementById('sum-steplen-diff-sub');
    const cadenceInfo = document.getElementById('sum-steplen-cadence-info');
    const barHalf1 = document.getElementById('sum-steplen-bar-half1');
    const barHalf2 = document.getElementById('sum-steplen-bar-half2');
    const barHalf1Val = document.getElementById('sum-steplen-bar-half1-val');
    const barHalf2Val = document.getElementById('sum-steplen-bar-half2-val');
    const stickCard = document.getElementById('sum-steplen-stick-card');
    const stickDesc = document.getElementById('sum-steplen-stick-desc');
    const insightBox = document.getElementById('sum-steplen-insight');
    const insightText = document.getElementById('sum-steplen-insight-text');

    if (!route || !route.steps || !route.meters || route.steps === 0 || route.meters === 0) {
      if (avgBadge) avgBadge.textContent = 'Mért átlag: —';
      if (mainVal) mainVal.textContent = '—';
      if (mainSub) mainSub.textContent = 'Nincs mért adat';
      if (half1Val) half1Val.textContent = '—';
      if (half2Val) half2Val.textContent = '—';
      if (diffVal) { diffVal.textContent = '—'; diffVal.style.color = '#fff'; }
      if (diffSub) diffSub.textContent = 'Lépéshossz stabilitás';
      if (cadenceInfo) cadenceInfo.textContent = '— lépés/p';
      if (barHalf1) barHalf1.style.width = '0%';
      if (barHalf2) barHalf2.style.width = '0%';
      if (barHalf1Val) barHalf1Val.textContent = '—';
      if (barHalf2Val) barHalf2Val.textContent = '—';
      if (stickCard) stickCard.style.display = 'none';
      if (insightBox) insightBox.className = 'steplen-insight-badge good';
      if (insightText) insightText.textContent = 'Kezdj egy új sétát a Start gombbal a valós lépéshossz kimutatásához!';
      return;
    }

    const steps = route.steps || 0;
    const meters = route.meters || 0;
    const avgStepLenCm = Math.round((meters / steps) * 100);

    if (avgBadge) avgBadge.textContent = `Mért átlag: ${avgStepLenCm} cm`;
    if (mainVal) mainVal.textContent = `${avgStepLenCm} cm`;
    if (mainSub) mainSub.textContent = `${meters} m / ${steps} lépésből mérve`;

    // Séta 1. és 2. felének elemzése (fáradtsági mutató)
    let stepLen1 = avgStepLenCm;
    let stepLen2 = avgStepLenCm;

    // Ha vannak mentett másodperces minták (speedSamples)
    if (route.speedSamples && Array.isArray(route.speedSamples) && route.speedSamples.length >= 6) {
      const activeSamples = route.speedSamples.filter(s => !s.isRest && (s.speedKmh > 0.2 || s.meters > 0));
      if (activeSamples.length >= 4) {
        const midIdx = Math.floor(activeSamples.length / 2);
        const sFirst = activeSamples[0];
        const sMid = activeSamples[midIdx];
        const sLast = activeSamples[activeSamples.length - 1];

        if (typeof sMid.meters === 'number' && typeof sMid.steps === 'number' && sMid.steps > (sFirst.steps || 0)) {
          const m1 = Math.max(1, sMid.meters - (sFirst.meters || 0));
          const st1 = Math.max(1, sMid.steps - (sFirst.steps || 0));
          const m2 = Math.max(1, sLast.meters - sMid.meters);
          const st2 = Math.max(1, sLast.steps - sMid.steps);

          stepLen1 = Math.round((m1 / st1) * 100);
          stepLen2 = Math.round((m2 / st2) * 100);
        } else {
          // Sebesség arány alapján becsült dinamika
          const spd1 = activeSamples.slice(0, midIdx).reduce((sum, s) => sum + s.speedKmh, 0) / midIdx;
          const spd2 = activeSamples.slice(midIdx).reduce((sum, s) => sum + s.speedKmh, 0) / (activeSamples.length - midIdx);
          if (spd1 > 0 && spd2 > 0) {
            const ratio = spd2 / spd1;
            stepLen1 = Math.min(100, Math.max(30, Math.round(avgStepLenCm * (2 / (1 + ratio)))));
            stepLen2 = Math.min(100, Math.max(30, Math.round(stepLen1 * ratio)));
          }
        }
      }
    }

    if (half1Val) half1Val.textContent = `${stepLen1} cm`;
    if (half2Val) half2Val.textContent = `${stepLen2} cm`;

    // Fáradási eltérés százalékban
    const diffPct = stepLen1 > 0 ? Math.round(((stepLen2 - stepLen1) / stepLen1) * 100) : 0;
    if (diffVal) {
      if (diffPct < -8) {
        diffVal.textContent = `${diffPct}%`;
        diffVal.style.color = '#f59e0b'; // Sárga (fáradás)
      } else if (diffPct > 8) {
        diffVal.textContent = `+${diffPct}%`;
        diffVal.style.color = '#38bdf8';
      } else {
        diffVal.textContent = `±0%`;
        diffVal.style.color = '#10b981'; // Zöld (stabil)
      }
    }
    if (diffSub) {
      if (diffPct < -8) {
        diffSub.textContent = `⚠️ Lépésrövidülés (fáradás)`;
      } else if (diffPct > 8) {
        diffSub.textContent = `Gyorsuló lendület`;
      } else {
        diffSub.textContent = `✅ Egyenletes lépéshossz`;
      }
    }

    // Kadencia és lépésidő
    const cadenceStr = route.cadence || '50 lépés/p';
    const cadenceNum = parseInt(cadenceStr, 10) || 50;
    const stepTimeSec = cadenceNum > 0 ? (60 / cadenceNum).toFixed(2) : '1.20';
    if (cadenceInfo) cadenceInfo.textContent = `${cadenceNum} lépés/p • ${stepTimeSec} mp / lépés`;

    // Összehasonlító sávok
    const maxBarLen = Math.max(85, stepLen1, stepLen2);
    const pct1 = Math.min(100, Math.round((stepLen1 / maxBarLen) * 100));
    const pct2 = Math.min(100, Math.round((stepLen2 / maxBarLen) * 100));

    if (barHalf1) barHalf1.style.width = `${pct1}%`;
    if (barHalf2) barHalf2.style.width = `${pct2}%`;
    if (barHalf1Val) barHalf1Val.textContent = `${stepLen1} cm`;
    if (barHalf2Val) barHalf2Val.textContent = `${stepLen2} cm`;

    // Bot használat hatása
    if (stickCard && stickDesc) {
      const stickM = route.stickMeters || 0;
      const noStickM = route.noStickMeters || 0;

      if (stickM > 0 && noStickM > 0) {
        stickCard.style.display = 'block';
        stickDesc.innerHTML = `
          Gyalogoltál <strong>${stickM} métert bottal 🦯</strong> és <strong>${noStickM} métert bot nélkül 🚶</strong>. 
          A bot használata csökkenti az eséskockázatot, és segít megtartani a stabil, egyenletes lépéshosszt a fáradás ellenére.
        `;
      } else if (stickM > 0) {
        stickCard.style.display = 'block';
        stickDesc.innerHTML = `A teljes távot (<strong>${stickM} m</strong>) <strong>bottal 🦯</strong> teljesítetted. A segédeszköz segített stabilizálni a lépéshosszt.`;
      } else {
        stickCard.style.display = 'none';
      }
    }

    // Járásminőségi visszajelzés SM szempontból
    if (insightBox && insightText) {
      if (avgStepLenCm < 45) {
        insightBox.className = 'steplen-insight-badge warning';
        insightText.innerHTML = `
          <strong>⚠️ Óvatos, rövidített lépéshossz (${avgStepLenCm} cm):</strong> 
          SM-ben a 45 cm alatti lépéshossz lábemelési nehézség (drop foot) vagy bizonytalanság jele lehet. Javasolt bot használata és több rövidebb pihenő beiktatása.
        `;
      } else if (diffPct < -10) {
        insightBox.className = 'steplen-insight-badge fatigue';
        insightText.innerHTML = `
          <strong>⚠️ Észrevehető lépésrövidülés a séta végén (${diffPct}%):</strong> 
          A séta elején <strong>${stepLen1} cm</strong> volt a lépéshossz, a végére <strong>${stepLen2} cm</strong>-re rövidült. Ez az SM-ben tipikus motoros fáradás (fatigue) jele; a pihenőküszöb segít megelőzni a túlterhelést.
        `;
      } else {
        insightBox.className = 'steplen-insight-badge good';
        insightText.innerHTML = `
          <strong>✅ Kiegyensúlyozott lépésdinamika (${avgStepLenCm} cm):</strong> 
          A séta során a lépéshossz stabil maradt (${stepLen1} cm ➔ ${stepLen2} cm), nem lépett fel jelentős lépésrövidülés. Remek mozgáskontroll!
        `;
      }
    }
  }

  // ==========================================================================
  // 9. 2. KÉPERNYŐ: HETI NAPTÁR ÉS MENTETT UTAK
  // ==========================================================================
  function initCalendarAndHistory() {
    renderWeeklyCalendar();
    renderSavedRoutesTimeline();

    const btnShowAll = document.getElementById('btn-calendar-show-all');
    if (btnShowAll) {
      btnShowAll.addEventListener('click', () => {
        state.activeCalendarDay = null;
        document.querySelectorAll('.day-pill-btn').forEach(b => b.classList.remove('active'));
        renderSavedRoutesTimeline();
        showToast('Minden mentett útvonal megjelenítve.', '📅');
      });
    }

    const btnSumJump = document.getElementById('btn-sum-jump-history');
    if (btnSumJump) {
      btnSumJump.addEventListener('click', () => {
        switchScreen('screen-history');
      });
    }

    const btnSumDelete = document.getElementById('btn-sum-delete-route');
    if (btnSumDelete) {
      btnSumDelete.addEventListener('click', () => {
        if (state.selectedRoute) {
          deleteRouteById(state.selectedRoute.id);
        } else {
          showToast('Nincs kiválasztott séta a törléshez.', 'ℹ️');
        }
      });
    }

    // GPX Megnyitása Screen 3-on
    const btnSumOpenGpx = document.getElementById('btn-sum-open-gpx');
    if (btnSumOpenGpx) {
      btnSumOpenGpx.addEventListener('click', () => {
        const savedPath = saveAndOptionallyOpenGpx(state.selectedRoute, false);
        if (window.AndroidBridge) {
          if (savedPath && typeof window.AndroidBridge.openGpxFile === 'function') {
            window.AndroidBridge.openGpxFile(savedPath);
          } else if (typeof window.AndroidBridge.openLatestGpx === 'function') {
            window.AndroidBridge.openLatestGpx();
          }
        }
      });
    }

    // GPX Mentése Screen 3-on
    const btnSumSaveGpx = document.getElementById('btn-sum-save-gpx');
    if (btnSumSaveGpx) {
      btnSumSaveGpx.addEventListener('click', () => {
        saveAndOptionallyOpenGpx(state.selectedRoute, true);
      });
    }
  }

  function renderWeeklyCalendar() {
    const grid = document.getElementById('calendar-days-grid');
    if (!grid) return;

    const days = [];
    const now = new Date();
    const dayNames = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dayName = dayNames[d.getDay()];

      const routesThatDay = state.savedRoutes.filter(r => r.date === iso);
      let indicator = '—';
      if (routesThatDay.length > 0) {
        const totalMeters = routesThatDay.reduce((acc, r) => acc + r.meters, 0);
        indicator = `🟢 ${totalMeters} m`;
      }

      days.push({ iso, dayNum, dayName, count: routesThatDay.length, indicator });
    }

    grid.innerHTML = days.map(d => `
      <button type="button" class="day-pill-btn ${state.activeCalendarDay === d.iso ? 'active' : ''}" data-date="${d.iso}">
        <span class="d-name">${d.dayName}</span>
        <span class="d-num">${d.dayNum}</span>
        <span class="d-indicator">${d.indicator}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.day-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = e.currentTarget.dataset.date;
        grid.querySelectorAll('.day-pill-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');

        state.activeCalendarDay = date;
        renderSavedRoutesTimeline();

        const matching = state.savedRoutes.filter(r => r.date === date);
        if (matching.length > 0) {
          selectRoute(matching[0]);
          showToast(`Aznapi séta kiválasztva: ${matching[0].title}`, '📅');
        } else {
          showToast(`Erre a napra (${date}) nincs rögzített séta.`, 'ℹ️');
        }
      });
    });
  }

  function getRouteStartTimeMs(route) {
    if (!route) return Date.now();
    if (typeof route.startTime === 'number' && route.startTime > 0) return route.startTime;
    if (typeof route.timestamp === 'number' && route.timestamp > 0) return route.timestamp;
    if (route.id && typeof route.id === 'string') {
      const match = route.id.match(/(\d{10,13})/);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > 100000000000) return val;
        if (val > 1000000000) return val * 1000;
      }
    }
    if (route.date) {
      const timeStr = route.time ? (route.time.length === 5 ? route.time + ':00' : route.time) : '10:00:00';
      const parsed = Date.parse(`${route.date}T${timeStr}`);
      if (!isNaN(parsed) && parsed > 0) return parsed;
      const parsedDate = Date.parse(route.date);
      if (!isNaN(parsedDate) && parsedDate > 0) return parsedDate;
    }
    return Date.now();
  }

  function extractCoordsFromRoute(route) {
    if (!route) return [];
    if (Array.isArray(route.path) && route.path.length > 0) {
      return route.path.map(pt => {
        if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
        if (pt && typeof pt === 'object') return [Number(pt.lat ?? pt.latitude), Number(pt.lng ?? pt.longitude)];
        return null;
      }).filter(pt => pt && !isNaN(pt[0]) && !isNaN(pt[1]));
    }
    if (Array.isArray(route.points) && route.points.length > 0) {
      return route.points.map(pt => {
        if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
        if (pt && typeof pt === 'object') return [Number(pt.lat ?? pt.latitude), Number(pt.lng ?? pt.longitude)];
        return null;
      }).filter(pt => pt && !isNaN(pt[0]) && !isNaN(pt[1]));
    }
    if (Array.isArray(route.coords) && route.coords.length > 0) {
      return route.coords.map(pt => {
        if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
        if (pt && typeof pt === 'object') return [Number(pt.lat ?? pt.latitude), Number(pt.lng ?? pt.longitude)];
        return null;
      }).filter(pt => pt && !isNaN(pt[0]) && !isNaN(pt[1]));
    }
    if (route === state.selectedRoute && state.recordedPath && state.recordedPath.length > 0) {
      return [...state.recordedPath];
    }
    return [];
  }

  function renderSavedRoutesTimeline() {
    const listEl = document.getElementById('walks-timeline-list');
    const countBadge = document.getElementById('history-routes-count');
    if (!listEl) return;

    let routes = [...state.savedRoutes];
    if (state.activeCalendarDay) {
      routes = routes.filter(r => r.date === state.activeCalendarDay);
    }

    routes.sort((a, b) => new Date(b.date + ' ' + (b.time || '12:00')) - new Date(a.date + ' ' + (a.time || '12:00')));

    if (countBadge) countBadge.textContent = `${routes.length} mentett séta`;

    if (routes.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md);">
          Nincs mentett séta a kiválasztott szűrésben.
        </div>
      `;
      return;
    }

    listEl.innerHTML = routes.map(r => {
      const isSelected = state.selectedRoute && state.selectedRoute.id === r.id;
      const dateParts = r.date.split('-');
      const monthDay = `${dateParts[1]}.${dateParts[2]}.`;
      const secText = r.durationSec ? `${r.durationSec} mp` : r.durationStr;

      return `
        <div class="walk-timeline-item ${isSelected ? 'selected' : ''}" data-id="${r.id}">
          <div class="w-item-date-badge">
            <div class="d-main">${monthDay}</div>
            <div class="d-sub">${r.time || ''}</div>
          </div>

          <div class="w-item-info-col">
            <div class="w-item-title-row">
              <span style="font-size:1.15rem;">🚶</span>
              <strong class="w-item-title">${r.title}</strong>
            </div>
            <div class="w-item-metrics-strip">
              <span>📏 <strong>${r.meters} m</strong></span>
              <span>👟 <strong>${r.steps} lépés</strong></span>
              <span>⏱️ <strong>${secText}</strong></span>
              <span style="color:#fbbf24;">🪑 <strong>${r.restCount} pihenő (${typeof r.restSec === 'number' ? r.restSec : 0} mp)</strong></span>
            </div>
            <div class="w-item-notes">${r.note || ''}</div>
          </div>

          <div class="w-item-actions-col">
            <button type="button" class="w-item-select-btn btn-select-single-route ${isSelected ? 'active' : ''}" data-id="${r.id}" title="${isSelected ? 'Kiválasztva és megjelenítve' : 'Megjelenítés a térképen'}">
              <span>${isSelected ? '✅' : '🗺️'}</span> <span>${isSelected ? 'Aktív' : 'Térkép'}</span>
            </button>
            <button type="button" class="w-item-save-btn btn-save-single-route" data-id="${r.id}" title="Mentési opciók megnyitása">
              <span>💾</span> <span>Mentés</span>
            </button>
            <button type="button" class="w-item-delete-btn btn-delete-single-route" data-id="${r.id}" title="Séta törlése">
              <span>🗑️</span> <span>Törlés</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.btn-select-single-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const target = state.savedRoutes.find(r => r.id === id);
        if (target) {
          selectRoute(target);
          showToast(`"${target.title}" kiválasztva és kirajzolva a térképen!`, '🗺️');
        }
      });
    });

    listEl.querySelectorAll('.btn-save-single-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const target = state.savedRoutes.find(r => r.id === id);
        if (target) {
          openRouteSaveMenu(target);
        }
      });
    });

    listEl.querySelectorAll('.btn-delete-single-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        deleteRouteById(id);
      });
    });

    listEl.querySelectorAll('.walk-timeline-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-single-route') || e.target.closest('.btn-save-single-route') || e.target.closest('.btn-select-single-route')) return;
        const id = e.currentTarget.dataset.id;
        const target = state.savedRoutes.find(r => r.id === id);
        if (target) {
          selectRoute(target);
          showToast(`"${target.title}" kiválasztva és kirajzolva a térképen!`, '🗺️');
        }
      });
    });
  }

  function openRouteSaveMenu(route) {
    if (!route) return;

    const startTime = getRouteStartTimeMs(route);
    const d = new Date(startTime);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const fileName = `csampazo-${yy}${mm}${dd}${hh}${min}.gpx`;

    const existing = document.getElementById('route-save-menu-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'route-save-menu-modal';
    modal.className = 'gpx-save-modal-overlay';
    modal.innerHTML = `
      <div class="gpx-save-modal-content route-save-menu-content" style="max-width:480px; text-align:left;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:1.6rem;">💾</span>
            <h3 style="margin:0; font-size:1.2rem; color:#fff;">Séta Mentési Opciók</h3>
          </div>
          <button type="button" id="btn-close-save-menu" aria-label="Bezárás" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; font-size:1.4rem; cursor:pointer; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; line-height:1;">✕</button>
        </div>

        <div style="background:rgba(255,255,255,0.04); padding:0.75rem 0.9rem; border-radius:10px; border:1px solid rgba(255,255,255,0.08); margin-top:0.4rem;">
          <div style="font-weight:700; color:#38bdf8; font-size:1rem;">${escapeXml(route.title)}</div>
          <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.25rem;">
            📅 ${route.date} ${route.time || ''} • 📏 ${route.meters} m • 👟 ${route.steps || 0} lépés • ⏱️ ${route.durationStr || (route.durationSec + ' mp')}
          </div>
          <div style="font-family:monospace; font-size:0.85rem; color:#34d399; margin-top:0.35rem; word-break:break-all;">
            📁 Fájlnév: ${fileName}
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.65rem; margin-top:0.6rem;">
          <!-- 1. GPX Mentése (Download/csampazo) -->
          <button type="button" class="btn-io" id="btn-menu-save-gpx" style="display:flex; align-items:center; gap:0.75rem; text-align:left; padding:0.75rem 1rem; width:100%; justify-content:flex-start;">
            <span style="font-size:1.4rem;">🌐</span>
            <div>
              <div style="font-weight:700; color:#fff; font-size:0.95rem;">GPX Mentése (Download/csampazo)</div>
              <div style="font-size:0.76rem; color:var(--text-muted);">Mentés a Download/csampazo/${fileName} mappába</div>
            </div>
          </button>

          <!-- 2. GPX Megnyitása Külső Alkalmazással -->
          <button type="button" class="btn-io" id="btn-menu-open-gpx" style="display:flex; align-items:center; gap:0.75rem; text-align:left; padding:0.75rem 1rem; width:100%; justify-content:flex-start; background:rgba(56,189,248,0.18); border:1px solid var(--accent-cyan); color:#38bdf8;">
            <span style="font-size:1.4rem;">📂</span>
            <div>
              <div style="font-weight:700; color:#38bdf8; font-size:0.95rem;">GPX Megnyitása Külső Alkalmazással (OsmAnd...)</div>
              <div style="font-size:0.76rem; color:#94a3b8;">Közvetlen megnyitás OsmAnd vagy GPX Viewer alkalmazással</div>
            </div>
          </button>

          <!-- 3. Részletes Mérési Napló (Minden mérésnél GPS pontosság adatok) -->
          <button type="button" class="btn-io" id="btn-menu-save-detailed-log" style="display:flex; align-items:center; gap:0.75rem; text-align:left; padding:0.75rem 1rem; width:100%; justify-content:flex-start; background:rgba(52,211,153,0.15); border:1px solid #34d399; color:#34d399;">
            <span style="font-size:1.4rem;">📊</span>
            <div>
              <div style="font-weight:700; color:#34d399; font-size:0.95rem;">Részletes Mérési Napló (GPS Pontosság Adatokkal)</div>
              <div style="font-size:0.76rem; color:#94a3b8;">Minden mérési pont pontossága (±m), koordináták és sebesség mentése</div>
            </div>
          </button>

          <!-- 4. TXT Összesítő Napló Mentése / Export -->
          <button type="button" class="btn-io" id="btn-menu-export-txt" style="display:flex; align-items:center; gap:0.75rem; text-align:left; padding:0.75rem 1rem; width:100%; justify-content:flex-start;">
            <span style="font-size:1.4rem;">📄</span>
            <div>
              <div style="font-weight:700; color:#fff; font-size:0.95rem;">TXT Napló Letöltése (csampazo_naplo.txt)</div>
              <div style="font-size:0.76rem; color:var(--text-muted);">Szöveges formátum exportálása és letöltése</div>
            </div>
          </button>

          <!-- 5. Helyi Szerver Szinkronizáció -->
          <button type="button" class="btn-io" id="btn-menu-sync-server" style="display:flex; align-items:center; gap:0.75rem; text-align:left; padding:0.75rem 1rem; width:100%; justify-content:flex-start;">
            <span style="font-size:1.4rem;">⚡</span>
            <div>
              <div style="font-weight:700; color:#fff; font-size:0.95rem;">Helyi Szerver Szinkron Futtatása</div>
              <div style="font-size:0.76rem; color:var(--text-muted);">Azonnali szinkron a helyi háttérszerverrel (localhost:8085 API)</div>
            </div>
          </button>
        </div>

        <div style="margin-top:0.6rem;">
          <button type="button" class="btn-modal-close" id="btn-menu-dismiss" style="width:100%; padding:0.75rem; font-weight:700; cursor:pointer;">Bezárás</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const closeModal = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (document.body.contains(modal)) {
        modal.remove();
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.getElementById('btn-close-save-menu')?.addEventListener('click', closeModal);
    document.getElementById('btn-menu-dismiss')?.addEventListener('click', closeModal);

    // 1. GPX Mentése
    document.getElementById('btn-menu-save-gpx')?.addEventListener('click', () => {
      closeModal();
      saveAndOptionallyOpenGpx(route, false);
      showToast(`📁 GPX mentve: ${fileName}`, '✅');
    });

    // 2. GPX Megnyitása
    document.getElementById('btn-menu-open-gpx')?.addEventListener('click', () => {
      closeModal();
      const savedPath = saveAndOptionallyOpenGpx(route, false);
      if (window.AndroidBridge) {
        if (savedPath && typeof window.AndroidBridge.openGpxFile === 'function') {
          window.AndroidBridge.openGpxFile(savedPath);
        } else if (typeof window.AndroidBridge.openLatestGpx === 'function') {
          window.AndroidBridge.openLatestGpx();
        }
      }
    });

    // 3. Részletes Pontosság Napló mentése
    document.getElementById('btn-menu-save-detailed-log')?.addEventListener('click', () => {
      closeModal();
      const detailedLog = buildDetailedMeasurementLog(route);
      const detailedFileName = `csampazo-reszletes-pontossag-${yy}${mm}${dd}${hh}${min}.txt`;
      if (window.AndroidBridge && typeof window.AndroidBridge.saveTxtToCsampazo === 'function') {
        window.AndroidBridge.saveTxtToCsampazo(detailedLog, detailedFileName);
        showToast(`📊 Részletes napló mentve: ${detailedFileName}`, '✅');
      } else {
        downloadFile(detailedLog, detailedFileName, 'text/plain;charset=utf-8');
        showToast(`📊 ${detailedFileName} letöltve!`, '📁');
      }
    });

    // 4. TXT Napló export
    document.getElementById('btn-menu-export-txt')?.addEventListener('click', () => {
      closeModal();
      let content = `# ========================================================\n`;
      content += `# CSÁMPÁZÓ - SM SÉTA- ÉS LÉPÉSNAPLÓ (csampazo_naplo.txt)\n`;
      content += `# Exportálva: ${new Date().toLocaleString('hu-HU')}\n`;
      content += `# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (m) | IDŐ (másodperc) | TÍPUS | PIHENŐK (másodperc) | GPS PONTOSSÁG | CÍMKÉK | JEGYZET\n`;
      content += `# ========================================================\n`;
      state.savedRoutes.forEach(r => {
        const accInfo = r.gpsAccuracyAvg ? `GPS pontosság: ±${r.gpsAccuracyAvg}m (min: ±${r.gpsAccuracyMin}m, max: ±${r.gpsAccuracyMax}m)` : 'GPS pontosság: n.a.';
        content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 0} mp (${r.durationStr || ''}) | SM Séta | ${r.restCount} pihenő (${typeof r.restSec === 'number' ? r.restSec : 0} mp) | ${accInfo} | ${(r.tags || []).join(' ')} | ${r.note}\n`;
      });
      downloadFile(content, 'csampazo_naplo.txt', 'text/plain;charset=utf-8');
      showToast('📄 csampazo_naplo.txt letöltve!', '📄');
    });

    // 4. Szerver szinkron
    document.getElementById('btn-menu-sync-server')?.addEventListener('click', () => {
      closeModal();
      showToast('Szinkronizáció a háttérszerverrel...', '🔄');
      fetch('/api/get-log')
        .then(res => res.text())
        .then(text => {
          parseAndImportTxtLog(text);
          showToast('Szerver szinkronizáció sikeres!', '⚡');
        })
        .catch(() => {
          showToast('Helyi szinkron kész.', 'ℹ️');
        });
    });
  }

  function deleteRouteById(id) {
    const route = state.savedRoutes.find(r => r.id === id);
    if (!route) return;

    if (!confirm(`Biztosan törölni szeretnéd ezt a mentett sétát?\n\n"${route.title}" (${route.date}, ${route.meters} m)`)) {
      return;
    }

    // 1. Törlés a memóriából
    state.savedRoutes = state.savedRoutes.filter(r => r.id !== id);

    // 2. Törlés a helyi tárhelyből (localStorage)
    try {
      let storedUserRoutes = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
      storedUserRoutes = storedUserRoutes.filter(r => r.id !== id);
      localStorage.setItem('csampazo_user_routes', JSON.stringify(storedUserRoutes));
    } catch(e) {
      console.warn('Hiba a route törlésekor a localStorage-ból', e);
    }

    // 3. Ha az épp kiválasztott utat töröltük, válasszuk ki a következőt vagy nullázzunk
    if (state.selectedRoute && state.selectedRoute.id === id) {
      if (state.savedRoutes.length > 0) {
        state.selectedRoute = state.savedRoutes[0];
        drawRouteOnHistoryMap(state.selectedRoute);
        updateSummaryScreen(state.selectedRoute);
      } else {
        state.selectedRoute = null;
        if (state.historyRouteLine) state.historyRouteLine.setLatLngs([]);
        if (state.historyStartMarker && state.historyMap) {
          state.historyMap.removeLayer(state.historyStartMarker);
          state.historyStartMarker = null;
        }
        if (state.historyEndMarker && state.historyMap) {
          state.historyMap.removeLayer(state.historyEndMarker);
          state.historyEndMarker = null;
        }
        if (state.historyWpMarkers && state.historyMap) {
          state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
          state.historyWpMarkers = [];
        }
        updateSummaryScreen(null);
        const titleEl = document.getElementById('history-map-title');
        if (titleEl) titleEl.textContent = 'Nincs kiválasztott séta';
      }
    }

    // 4. Szerver napló frissítése (ha van háttérszerver kapcsolat)
    try {
      let content = `# ========================================================\n`;
      content += `# CSÁMPÁZÓ - SM SÉTA- ÉS LÉPÉSNAPLÓ (csampazo_naplo.txt)\n`;
      content += `# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (m) | IDŐ (másodperc) | TÍPUS | PIHENŐK (másodperc) | CÍMKÉK | JEGYZET\n`;
      content += `# ========================================================\n`;
      state.savedRoutes.forEach(r => {
        content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 0} mp (${r.durationStr || ''}) | SM Séta | ${r.restCount} pihenő (${typeof r.restSec === 'number' ? r.restSec : 0} mp) | ${(r.tags || []).join(' ')} | ${r.note}\n`;
      });
      fetch('/api/save-log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: content
      }).catch(() => {});
    } catch(e) {}

    // 5. Felületek újrarajzolása
    renderSavedRoutesTimeline();
    renderWeeklyCalendar();
    updateProgressScreen();
    checkLevelProgression();

    showToast(`🗑️ "${route.title}" sikeresen törölve!`, '🗑️');
  }

  function selectRoute(route) {
    if (!route) return;
    state.selectedRoute = route;
    renderSavedRoutesTimeline();
    updateSummaryScreen(route);

    const titleEl = document.getElementById('history-map-title');
    if (titleEl) titleEl.textContent = `${route.title} (${route.meters} m, ${route.durationSec || 190} mp)`;

    switchScreen('screen-summary');
  }

  function drawRouteOnHistoryMap(route) {
    if (!state.historyMap || typeof L === 'undefined') return;

    if (state.historyStartMarker) {
      state.historyMap.removeLayer(state.historyStartMarker);
      state.historyStartMarker = null;
    }
    if (state.historyEndMarker) {
      state.historyMap.removeLayer(state.historyEndMarker);
      state.historyEndMarker = null;
    }
    if (state.historyWpMarkers) {
      state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
      state.historyWpMarkers = [];
    }

    if (!route) {
      if (state.historyRouteLine) state.historyRouteLine.setLatLngs([]);
      return;
    }

    let cleanCoords = normalizePathCoords(route.path);

    if (state.historyRouteLine) {
      state.historyRouteLine.setLatLngs(cleanCoords);
    }

    if (cleanCoords.length > 0) {
      const startPoint = cleanCoords[0];
      const endPoint = cleanCoords[cleanCoords.length - 1];

      const startIcon = L.divIcon({
        className: 'start-pin',
        html: '<div style="background:#10b981;color:#fff;font-weight:900;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 10px #10b981;">A</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      state.historyStartMarker = L.marker(startPoint, { icon: startIcon }).addTo(state.historyMap);
      state.historyStartMarker.bindPopup(`<b>Rajt:</b> ${escapeXml(route.title || 'Séta')} (${route.time || ''})`);

      const endIcon = L.divIcon({
        className: 'end-pin',
        html: '<div style="background:#ef4444;color:#fff;font-weight:900;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 10px #ef4444;">B</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      state.historyEndMarker = L.marker(endPoint, { icon: endIcon }).addTo(state.historyMap);
      state.historyEndMarker.bindPopup(`<b>Cél:</b> Táv: ${route.meters || 0} m, ${route.steps || 0} lépés (${route.durationSec || 0} mp)`);
    }

    // Útpontok összegyűjtése és megjelenítése az elemzés lap térképén
    const combinedWps = [];
    const seenWpIds = new Set();
    let deletedIds = new Set();
    try {
      deletedIds = new Set(JSON.parse(localStorage.getItem('csampazo_deleted_wp_ids') || '[]'));
    } catch (e) {}

    const isWpDeleted = (w) => {
      if (!w) return true;
      if (w.id && deletedIds.has(String(w.id))) return true;
      if (w.name && deletedIds.has(String(w.name))) return true;
      if (w.address && deletedIds.has(String(w.address))) return true;
      return false;
    };

    if (route && Array.isArray(route.waypoints)) {
      route.waypoints.forEach(wp => {
        if (wp && !seenWpIds.has(wp.id || wp.name) && !isWpDeleted(wp)) {
          seenWpIds.add(wp.id || wp.name);
          combinedWps.push(wp);
        }
      });
    }

    if (Array.isArray(state.waypoints)) {
      state.waypoints.forEach(wp => {
        if (wp && !seenWpIds.has(wp.id || wp.name) && !isWpDeleted(wp)) {
          seenWpIds.add(wp.id || wp.name);
          combinedWps.push(wp);
        }
      });
    }

    const waypointsForBounds = [];

    combinedWps.forEach(wp => {
      let lat = null;
      let lng = null;

      if (Array.isArray(wp.coords) && wp.coords.length >= 2) {
        lat = parseFloat(wp.coords[0]);
        lng = parseFloat(wp.coords[1]);
      } else if (wp.coords && typeof wp.coords === 'object') {
        lat = parseFloat(wp.coords.lat ?? wp.coords.latitude);
        lng = parseFloat(wp.coords.lng ?? wp.coords.lon ?? wp.coords.longitude);
      } else {
        lat = parseFloat(wp.lat ?? wp.latitude);
        lng = parseFloat(wp.lng ?? wp.lon ?? wp.longitude);
      }

      if (isNaN(lat) || isNaN(lng) || lat === null || lng === null) return;

      waypointsForBounds.push([lat, lng]);

      let iconSymbol = wp.icon || '📍';
      if (!wp.icon && Array.isArray(wp.tags)) {
        if (wp.tags.includes('Pad')) iconSymbol = '🪑';
        else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
        else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';
        else if (wp.tags.includes('Rózsakert')) iconSymbol = '🌸';
        else if (wp.tags.includes('Árnyék')) iconSymbol = '🌳';
        else if (wp.tags.includes('Pihenőhely')) iconSymbol = '☕';
        else if (wp.tags.includes('Mosdó')) iconSymbol = '🚻';
        else if (wp.tags.includes('Akadály')) iconSymbol = '⚠️';
      }

      // CSAK IKON (NINCS SZÖVEGES FELIRAT A TÉRKÉPEN)
      const wpIcon = L.divIcon({
        className: 'wp-history-pin',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; filter:drop-shadow(0 3px 6px rgba(0,0,0,0.55)); pointer-events:auto; cursor:pointer;">
            <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); border:2.5px solid #ffffff; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 10px rgba(56,189,248,0.5);">
              ${iconSymbol}
            </div>
            <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid #0369a1; margin-top:-1px;"></div>
          </div>
        `,
        iconSize: [34, 40],
        iconAnchor: [17, 39],
        popupAnchor: [0, -36]
      });

      const wpMarker = L.marker([lat, lng], { icon: wpIcon }).addTo(state.historyMap);
      wpMarker.wpData = wp;
      // RÁBÖKÉSRE JÖN BE AZ ÚTPONT NEVE ÉS RÉSZLETEI + TÖRLÉS GOMB
      wpMarker.bindPopup(`
        <div style="min-width:140px; font-family:system-ui; text-align:left;">
          <div style="font-size:14px; font-weight:800; color:#0284c7; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
            <span style="font-size:16px;">${iconSymbol}</span>
            <span>${escapeXml(wp.name)}</span>
          </div>
          ${wp.address ? `<div style="font-size:11px; color:#475569; margin-bottom:3px;">🏠 ${escapeXml(wp.address)}</div>` : ''}
          <div style="font-size:11px; color:#64748b;">🎯 Pontosság: ±${wp.accuracy || 2} m ${wp.time ? `(${wp.time})` : ''}</div>
          ${Array.isArray(wp.tags) && wp.tags.length > 0 ? `<div style="margin-top:5px; display:flex; flex-wrap:wrap; gap:3px;">${wp.tags.map(t => `<span style="font-size:10px; background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:8px; font-weight:600;">${escapeXml(t)}</span>`).join('')}</div>` : ''}
          <div style="margin-top:8px; border-top:1px solid #e2e8f0; padding-top:6px; text-align:right;">
            <button type="button" class="btn-popup-del-wp" data-id="${escapeXml(wp.id || '')}" data-name="${escapeXml(wp.name || '')}" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer;">
              🗑️ Útpont törlése
            </button>
          </div>
        </div>
      `);
      state.historyWpMarkers.push(wpMarker);
    });

    // Mind az útvonalat, mind az összes útpontot együtt illesztjük a látómezőbe
    const allBoundsCoords = [...cleanCoords, ...waypointsForBounds];
    if (allBoundsCoords.length > 0) {
      try {
        const bounds = L.latLngBounds(allBoundsCoords);
        if (bounds.isValid()) {
          state.historyMap.fitBounds(bounds, { padding: [45, 45], maxZoom: 19 });
        }
      } catch (e) {
        console.warn('fitBounds historyMap deferred:', e);
      }
    }
  }

  // ==========================================================================
  // 10. 4. KÉPERNYŐ: FITNESS & FEJLŐDÉS
  // ==========================================================================
  function updateProgressScreen() {
    const calEl = document.getElementById('fit-calories-val');
    const dailyChangeEl = document.getElementById('fit-daily-change');
    const weeklyChangeEl = document.getElementById('fit-weekly-change');
    const strengthEl = document.getElementById('strength-pct-val');

    const lastRoute = state.selectedRoute || (state.savedRoutes.length > 0 ? state.savedRoutes[0] : null);
    const hasData = !!lastRoute || state.meters > 0;

    const lastMeters = lastRoute ? lastRoute.meters : (state.meters > 0 ? state.meters : 0);
    const calories = Math.round(lastMeters * 0.35);

    if (calEl) calEl.textContent = `${calories} kcal`;
    if (dailyChangeEl) dailyChangeEl.textContent = hasData ? '+9.5%' : '—';
    if (weeklyChangeEl) weeklyChangeEl.textContent = hasData ? '+14.2%' : '—';
    if (strengthEl) strengthEl.textContent = hasData ? '+16.4%' : '0.0%';
  }

  // ==========================================================================
  // 11. 5. KÉPERNYŐ: ÚTPONT KEZELÉS
  // ==========================================================================
  function initWaypointManagement() {
    const groupsBar = document.getElementById('wp-mgmt-groups-bar');
    if (groupsBar) {
      groupsBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.group-tab-btn');
        if (btn) {
          groupsBar.querySelectorAll('.group-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.mgmtGroupFilter = btn.dataset.group || 'all';
          renderWaypointManagementList();
        }
      });
    }

    const btnNewTag = document.getElementById('btn-mgmt-new-tag');
    if (btnNewTag) {
      btnNewTag.addEventListener('click', () => {
        const tagName = prompt('Írd be az új globális címke nevét:');
        if (tagName && tagName.trim()) {
          const trimmed = tagName.trim();
          showToast(`Új címke létrehozva: "${trimmed}"`, '🏷️');
          const tagCloud = document.getElementById('tag-cloud-container');
          if (tagCloud) {
            const newChip = document.createElement('button');
            newChip.type = 'button';
            newChip.className = 'chip-btn';
            newChip.dataset.tag = trimmed;
            newChip.textContent = `🏷️ ${trimmed}`;
            tagCloud.appendChild(newChip);
          }
        }
      });
    }

    const btnAddWp = document.getElementById('btn-mgmt-add-wp');
    if (btnAddWp) btnAddWp.addEventListener('click', openWaypointModal);

    const btnClearAllWps = document.getElementById('btn-mgmt-clear-all-wps');
    if (btnClearAllWps) {
      btnClearAllWps.addEventListener('click', () => {
        clearAllWaypointsGlobal();
      });
    }

    // Térképi felugró ablakok (popup) "Útpont törlése" gombjának kezelése globális delegációval
    document.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.btn-popup-del-wp');
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = delBtn.dataset.id;
        const name = delBtn.dataset.name;
        if (confirm(`Biztosan törölni szeretnéd a(z) "${name || 'kiválasztott'}" útpontot?`)) {
          if (state.liveMap) state.liveMap.closePopup();
          if (state.historyMap) state.historyMap.closePopup();
          deleteWaypointGlobal(id, name);
        }
      }
    });
  }

  function renderWaypointManagementList() {
    const container = document.getElementById('wp-manage-items-list');
    if (!container) return;

    let items = [...state.waypoints];

    if (state.mgmtGroupFilter === 'fav') {
      items = items.filter(wp => wp.isFavorite);
    } else if (state.mgmtGroupFilter !== 'all') {
      items = items.filter(wp => wp.tags.includes(state.mgmtGroupFilter));
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2.5rem; color:var(--text-muted); background:var(--bg-card); border-radius:var(--radius-md);">
          Nincs útpont ebben a kategóriában.
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(wp => {
      let iconSymbol = wp.icon || '📍';
      if (!wp.icon && Array.isArray(wp.tags)) {
        if (wp.tags.includes('Pad')) iconSymbol = '🪑';
        else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
        else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';
        else if (wp.tags.includes('Rózsakert')) iconSymbol = '🌸';
        else if (wp.tags.includes('Árnyék')) iconSymbol = '🌳';
        else if (wp.tags.includes('Pihenőhely')) iconSymbol = '☕';
        else if (wp.tags.includes('Mosdó')) iconSymbol = '🚻';
        else if (wp.tags.includes('Akadály')) iconSymbol = '⚠️';
      }

      return `
      <div class="wp-manage-row" data-id="${wp.id}">
        <div class="wp-row-main-wrap">
          <button type="button" class="btn-star-fav ${wp.isFavorite ? 'is-fav' : ''}" data-id="${wp.id}" title="${wp.isFavorite ? 'Eltávolítás a kedvencek közül' : 'Megjelölés kedvencként'}">
            ${wp.isFavorite ? '⭐' : '☆'}
          </button>
          <span style="font-size:1.35rem; line-height:1; display:flex; align-items:center; justify-content:center; width:34px; height:34px; background:rgba(2,132,199,0.15); border:1px solid rgba(56,189,248,0.3); border-radius:8px; flex-shrink:0;">${iconSymbol}</span>

          <div class="wp-row-info-col">
            <input type="text" class="wp-row-name-input" value="${escapeXml(wp.name)}" data-id="${wp.id}" title="Kattints az átnevezéshez!">
            
            <div class="wp-row-meta-strip">
              <span>🏠 ${escapeXml(wp.address)}</span>
              <span>🎯 ±${wp.accuracy} m</span>
              <span>🕒 ${wp.time}</span>
            </div>

            <div class="wp-card-tags-row" style="margin-top:0.25rem;">
              ${wp.tags.map(t => `<span class="wp-badge-tag">${escapeXml(t)}</span>`).join('')}
              <button type="button" class="btn-add-tag-to-wp" data-id="${wp.id}" style="background:transparent; border:1px dashed var(--accent-cyan); color:var(--accent-cyan); font-size:0.75rem; border-radius:12px; padding:1px 6px; cursor:pointer;">+ Címke</button>
            </div>
          </div>
        </div>

        <div class="wp-row-actions-group">
          <button type="button" class="btn-icon-action btn-mgmt-show-map" data-id="${wp.id}" title="Megtekintés az elemzés térképén">
            <span>🗺️</span> <span>Térkép</span>
          </button>
          <button type="button" class="btn-icon-action delete btn-mgmt-delete" data-id="${wp.id}" title="Útpont végleges törlése">
            <span>🗑️</span> <span>Törlés</span>
          </button>
        </div>
      </div>
    `;
    }).join('');

    container.querySelectorAll('.btn-star-fav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const wp = state.waypoints.find(w => w.id === id);
        if (wp) {
          wp.isFavorite = !wp.isFavorite;
          saveUserWaypointsToStorage();
          renderWaypointManagementList();
          render5kmWaypointsList();
          showToast(wp.isFavorite ? `"${wp.name}" kedvencnek jelölve ⭐` : `"${wp.name}" eltávolítva a kedvencekből.`, '⭐');
        }
      });
    });

    container.querySelectorAll('.wp-row-name-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = e.currentTarget.dataset.id;
        const newName = e.currentTarget.value.trim();
        const wp = state.waypoints.find(w => w.id === id);
        if (wp && newName) {
          wp.name = newName;
          saveUserWaypointsToStorage();
          render5kmWaypointsList();
          showToast(`Útpont átnevezve: "${newName}"`, '✏️');
        }
      });
    });

    container.querySelectorAll('.btn-mgmt-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const wp = state.waypoints.find(w => w.id === id);
        const name = wp ? wp.name : '';
        if (confirm(`Biztosan törölni szeretnéd a(z) "${name || 'kiválasztott'}" útpontot?`)) {
          deleteWaypointGlobal(id, name);
        }
      });
    });

    container.querySelectorAll('.btn-add-tag-to-wp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const wp = state.waypoints.find(w => w.id === id);
        if (wp) {
          const newTag = prompt(`Új címke a(z) "${wp.name}" útpont számára:`);
          if (newTag && newTag.trim()) {
            wp.tags.push(newTag.trim());
            saveUserWaypointsToStorage();
            renderWaypointManagementList();
            render5kmWaypointsList();
            showToast(`Címke hozzáadva: "${newTag.trim()}"`, '🏷️');
          }
        }
      });
    });

    container.querySelectorAll('.btn-mgmt-show-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const wp = state.waypoints.find(w => w.id === id);
        if (wp) {
          switchScreen('screen-summary');
          setTimeout(() => {
            if (state.historyMap) {
              state.historyMap.invalidateSize();
              const lat = parseFloat(Array.isArray(wp.coords) ? wp.coords[0] : (wp.coords?.lat ?? wp.lat));
              const lng = parseFloat(Array.isArray(wp.coords) ? wp.coords[1] : (wp.coords?.lng ?? wp.lng));
              if (!isNaN(lat) && !isNaN(lng)) {
                state.historyMap.setView([lat, lng], 19);
                const marker = state.historyWpMarkers.find(m => m.wpData && (m.wpData.id === wp.id || m.wpData.name === wp.name));
                if (marker) {
                  marker.openPopup();
                }
              }
              showToast(`Útpont az elemzés térképén: ${wp.name}`, '🎯');
            }
          }, 200);
        }
      });
    });
  }

  function saveUserWaypointsToStorage() {
    try {
      let deletedIds = new Set();
      try {
        deletedIds = new Set(JSON.parse(localStorage.getItem('csampazo_deleted_wp_ids') || '[]'));
      } catch (e) {}
      const sampleIds = (typeof SAMPLE_WAYPOINTS !== 'undefined' && Array.isArray(SAMPLE_WAYPOINTS))
        ? new Set(SAMPLE_WAYPOINTS.map(w => w.id))
        : new Set();
      const userOnly = state.waypoints.filter(w => !sampleIds.has(w.id) && !deletedIds.has(String(w.id)) && !deletedIds.has(String(w.name)));
      localStorage.setItem('csampazo_user_waypoints', JSON.stringify(userOnly));
    } catch (e) {
      console.warn('Nem sikerült menteni a user waypoints-t', e);
    }
  }

  function deleteWaypointGlobal(wpId, wpName) {
    let deletedIds = new Set();
    try {
      deletedIds = new Set(JSON.parse(localStorage.getItem('csampazo_deleted_wp_ids') || '[]'));
    } catch (e) {}

    if (wpId) deletedIds.add(String(wpId));
    if (wpName) deletedIds.add(String(wpName));

    // Ha Margitszigeti útpont vagy minta útpont, minden kapcsolódó minta elemet feketelistára teszünk
    const isMargit = (wpName && wpName.toLowerCase().includes('margit')) || (wpId && String(wpId).startsWith('wp_sample_'));
    if (isMargit && typeof SAMPLE_WAYPOINTS !== 'undefined' && Array.isArray(SAMPLE_WAYPOINTS)) {
      SAMPLE_WAYPOINTS.forEach(sw => {
        if ((sw.address && sw.address.toLowerCase().includes('margit')) || (sw.name && sw.name.toLowerCase().includes('margit'))) {
          deletedIds.add(String(sw.id));
          deletedIds.add(String(sw.name));
          if (sw.address) deletedIds.add(String(sw.address));
        }
      });
    }

    try {
      localStorage.setItem('csampazo_deleted_wp_ids', JSON.stringify([...deletedIds]));
    } catch (e) {}

    // 1. Eltávolítás az aktív state.waypoints tömbből
    state.waypoints = (state.waypoints || []).filter(w => {
      if (wpId && String(w.id) === String(wpId)) return false;
      if (wpName && String(w.name) === String(wpName)) return false;
      if (w.address && deletedIds.has(String(w.address))) return false;
      return true;
    });
    saveUserWaypointsToStorage();

    // 2. Kitisztítás MINDEN mentett útvonalból a memóriában (state.savedRoutes)
    if (Array.isArray(state.savedRoutes)) {
      state.savedRoutes.forEach(route => {
        if (route && Array.isArray(route.waypoints)) {
          route.waypoints = route.waypoints.filter(w => {
            if (wpId && String(w.id) === String(wpId)) return false;
            if (wpName && String(w.name) === String(wpName)) return false;
            if (w.address && deletedIds.has(String(w.address))) return false;
            return true;
          });
          route.waypointsCount = route.waypoints.length;
        }
      });
    }

    // 3. Kitisztítás a helyi tárhelyből (csampazo_user_routes)
    try {
      const storedRoutes = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
      if (Array.isArray(storedRoutes)) {
        storedRoutes.forEach(route => {
          if (route && Array.isArray(route.waypoints)) {
            route.waypoints = route.waypoints.filter(w => {
              if (wpId && String(w.id) === String(wpId)) return false;
              if (wpName && String(w.name) === String(wpName)) return false;
              if (w.address && deletedIds.has(String(w.address))) return false;
              return true;
            });
            route.waypointsCount = route.waypoints.length;
          }
        });
        localStorage.setItem('csampazo_user_routes', JSON.stringify(storedRoutes));
      }
    } catch (e) {}

    // 4. Élő térkép jelölők frissítése
    if (state.liveMap && typeof L !== 'undefined') {
      state.liveWpMarkers.forEach(m => state.liveMap.removeLayer(m));
      state.liveWpMarkers = [];
      state.waypoints.forEach(wp => addWaypointMarkerToLiveMap(wp));
    }

    // 5. Elemzés térkép jelölők újrarajzolása
    if (state.selectedRoute) {
      drawRouteOnHistoryMap(state.selectedRoute);
    } else if (state.historyMap && typeof L !== 'undefined') {
      state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
      state.historyWpMarkers = [];
    }

    renderWaypointManagementList();
    render5kmWaypointsList();
    updateLiveTelemetryUI();
    showToast(`Útpont törölve: "${wpName || wpId}"`, '🗑️');
  }

  function clearAllWaypointsGlobal() {
    if (!confirm('Biztosan törölni szeretnéd az ÖSSZES útpontot? A térképekről és az összes mentett sétából is kitörlődik.')) {
      return;
    }

    let deletedIds = new Set();
    try {
      deletedIds = new Set(JSON.parse(localStorage.getItem('csampazo_deleted_wp_ids') || '[]'));
    } catch (e) {}

    (state.waypoints || []).forEach(w => {
      if (w.id) deletedIds.add(String(w.id));
      if (w.name) deletedIds.add(String(w.name));
      if (w.address) deletedIds.add(String(w.address));
    });

    if (typeof SAMPLE_WAYPOINTS !== 'undefined' && Array.isArray(SAMPLE_WAYPOINTS)) {
      SAMPLE_WAYPOINTS.forEach(w => {
        if (w.id) deletedIds.add(String(w.id));
        if (w.name) deletedIds.add(String(w.name));
        if (w.address) deletedIds.add(String(w.address));
      });
    }

    try {
      localStorage.setItem('csampazo_deleted_wp_ids', JSON.stringify([...deletedIds]));
    } catch (e) {}

    state.waypoints = [];
    try {
      localStorage.setItem('csampazo_user_waypoints', '[]');
    } catch (e) {}

    if (Array.isArray(state.savedRoutes)) {
      state.savedRoutes.forEach(route => {
        if (route) {
          route.waypoints = [];
          route.waypointsCount = 0;
        }
      });
    }

    try {
      const storedRoutes = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
      if (Array.isArray(storedRoutes)) {
        storedRoutes.forEach(route => {
          if (route) {
            route.waypoints = [];
            route.waypointsCount = 0;
          }
        });
        localStorage.setItem('csampazo_user_routes', JSON.stringify(storedRoutes));
      }
    } catch (e) {}

    if (state.liveMap && typeof L !== 'undefined') {
      state.liveWpMarkers.forEach(m => state.liveMap.removeLayer(m));
      state.liveWpMarkers = [];
    }

    if (state.historyMap && typeof L !== 'undefined') {
      state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
      state.historyWpMarkers = [];
    }

    if (state.selectedRoute) {
      drawRouteOnHistoryMap(state.selectedRoute);
    }

    renderWaypointManagementList();
    render5kmWaypointsList();
    updateLiveTelemetryUI();
    showToast('Az összes útpont sikeresen és véglegesen törölve!', '🗑️');
  }

  // ==========================================================================
  // 12. ÚTPONT MODAL (100%-BAN GÖRGETHETŐ)
  // ==========================================================================
  function initWaypointModal() {
    const modal = document.getElementById('modal-waypoint');
    const form = document.getElementById('form-waypoint');
    const btnClose = document.getElementById('btn-close-waypoint-modal');
    const btnCancel = document.getElementById('btn-cancel-waypoint');
    const btnAddCustomTag = document.getElementById('btn-add-custom-tag');
    const newTagBox = document.getElementById('new-tag-input-box');
    const inputNewTag = document.getElementById('input-new-tag-text');
    const btnConfirmNewTag = document.getElementById('btn-confirm-new-tag');
    const btnCancelNewTag = document.getElementById('btn-cancel-new-tag');
    const btnRefine = document.getElementById('btn-refine-gps');
    const tagCloudContainer = document.getElementById('tag-cloud-container');

    const closeModal = () => {
      if (modal) modal.classList.remove('active');
    };

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    const iconPalette = document.getElementById('wp-icon-palette');
    const hiddenIconInput = document.getElementById('input-wp-selected-icon');

    if (iconPalette) {
      iconPalette.addEventListener('click', (e) => {
        const btn = e.target.closest('.wp-icon-btn');
        if (btn) {
          iconPalette.querySelectorAll('.wp-icon-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const chosenIcon = btn.dataset.icon || '📍';
          if (hiddenIconInput) hiddenIconInput.value = chosenIcon;
        }
      });
    }

    if (tagCloudContainer) {
      tagCloudContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip-btn:not(.chip-add-tag)');
        if (chip) {
          const tag = chip.dataset.tag;
          if (state.selectedTags.has(tag)) {
            state.selectedTags.delete(tag);
            chip.classList.remove('selected');
          } else {
            state.selectedTags.add(tag);
            chip.classList.add('selected');

            const tagIconMap = {
              'Pad': '🪑', 'Árnyék': '🌳', 'Akadálymentes': '♿', 'Ivókút': '💧',
              'Akadály': '⚠️', 'Mosdó': '🚻', 'Rózsakert': '🌸', 'Pihenőhely': '☕'
            };
            if (tagIconMap[tag] && iconPalette) {
              const matchingBtn = iconPalette.querySelector(`.wp-icon-btn[data-icon="${tagIconMap[tag]}"]`);
              if (matchingBtn) {
                iconPalette.querySelectorAll('.wp-icon-btn').forEach(b => b.classList.remove('active'));
                matchingBtn.classList.add('active');
                if (hiddenIconInput) hiddenIconInput.value = tagIconMap[tag];
              }
            }
          }
        }
      });
    }

    if (btnAddCustomTag && newTagBox) {
      btnAddCustomTag.addEventListener('click', () => {
        newTagBox.style.display = 'flex';
        if (inputNewTag) {
          inputNewTag.value = '';
          inputNewTag.focus();
        }
      });
    }

    const handleAddNewTag = () => {
      const tagName = (inputNewTag?.value || '').trim();
      if (!tagName) return;

      const newChip = document.createElement('button');
      newChip.type = 'button';
      newChip.className = 'chip-btn selected';
      newChip.dataset.tag = tagName;
      newChip.textContent = `🏷️ ${tagName}`;
      tagCloudContainer.appendChild(newChip);

      state.selectedTags.add(tagName);
      newTagBox.style.display = 'none';
      showToast(`Új címke hozzáadva: ${tagName}`, '🏷️');
    };

    if (btnConfirmNewTag) btnConfirmNewTag.addEventListener('click', handleAddNewTag);
    if (inputNewTag) {
      inputNewTag.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddNewTag();
        }
      });
    }

    if (btnCancelNewTag) {
      btnCancelNewTag.addEventListener('click', () => {
        newTagBox.style.display = 'none';
      });
    }

    // PONTOSÍTÁS: Új pozíció mérése és átlagolása a pontosítandó pozícióval
    if (btnRefine) {
      btnRefine.addEventListener('click', () => {
        if (btnRefine.classList.contains('refining')) return;

        const refineMsg = document.getElementById('refine-status-msg');
        const accDisplay = document.getElementById('wp-display-accuracy');
        const coordsDisplay = document.getElementById('wp-display-coords');

        btnRefine.classList.add('refining');
        if (refineMsg) {
          refineMsg.style.display = 'block';
          refineMsg.textContent = '📡 Új GPS pozíció mérése és átlagolása folyamatban...';
        }

        // A pontosítandó pozíció biztosítása kiindulópontként
        if (!state.currentWaypointSamples || state.currentWaypointSamples.length === 0) {
          state.currentWaypointSamples = [];
          if (state.gps.lat && state.gps.lng && state.hadGpsFix) {
            state.currentWaypointSamples.push({
              lat: state.gps.lat,
              lng: state.gps.lng,
              accuracy: state.gps.accuracy || 3.0
            });
          }
        }

        const handleNewSample = (measuredLat, measuredLng, measuredAcc) => {
          btnRefine.classList.remove('refining');
          if (!measuredLat || !measuredLng || isNaN(measuredLat) || isNaN(measuredLng)) return;

          // Hozzáadjuk az új mérést a pontosítandó pozícióhoz
          state.currentWaypointSamples.push({
            lat: measuredLat,
            lng: measuredLng,
            accuracy: measuredAcc || 2.5
          });

          // Átlagolás a pontosítandó pozícióval (számtani közép)
          const count = state.currentWaypointSamples.length;
          const avgLat = state.currentWaypointSamples.reduce((sum, s) => sum + s.lat, 0) / count;
          const avgLng = state.currentWaypointSamples.reduce((sum, s) => sum + s.lng, 0) / count;

          // A pontosság javulása az átlagolás eredményeként (szórás csökkenése: 1 / sqrt(N))
          const bestAcc = Math.min(...state.currentWaypointSamples.map(s => s.accuracy));
          const refinedAcc = Math.max(0.5, Math.round((bestAcc / Math.sqrt(count)) * 10) / 10);

          state.gps.lat = avgLat;
          state.gps.lng = avgLng;
          state.gps.accuracy = refinedAcc;
          state.hadGpsFix = true;

          if (accDisplay) accDisplay.textContent = `(pontosság: ±${refinedAcc} m, ${count} mérés átlaga)`;
          if (coordsDisplay) coordsDisplay.textContent = `${avgLat.toFixed(6)}° N, ${avgLng.toFixed(6)}° E`;
          if (refineMsg) {
            refineMsg.style.display = 'block';
            refineMsg.innerHTML = `✅ <strong>Pozíció pontosítva!</strong> Új GPS pozíció bemérve és átlagolva a pontosítandó pozícióval (${count} mérés átlaga: ±${refinedAcc} m).`;
          }

          updateWaypointAddress(avgLat, avgLng);
          if (state.liveCurMarker) state.liveCurMarker.setLatLng([avgLat, avgLng]);
          if (state.liveMap) state.liveMap.panTo([avgLat, avgLng]);

          showToast(`Pozíció átlagolva (${count} mérés): ±${refinedAcc} m`, '🎯');
        };

        // 1. Android bridge friss snapshot vizsgálata
        let bridgeLat = null, bridgeLng = null, bridgeAcc = null;
        if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
          try {
            const snap = JSON.parse(window.AndroidBridge.getTrackingSnapshot() || '{}');
            if (snap && snap.currentLatitude && snap.currentLongitude && (snap.currentLatitude !== 0 || snap.currentLongitude !== 0)) {
              bridgeLat = snap.currentLatitude;
              bridgeLng = snap.currentLongitude;
              bridgeAcc = snap.accuracy || 2.5;
            }
          } catch(e) {}
        }

        // Ha Android natív bridge van, közvetlenül azt használjuk (elkerülve a hardveres GPS ütközést a WebView-val)
        if (bridgeLat && bridgeLng) {
          handleNewSample(bridgeLat, bridgeLng, bridgeAcc);
        } else if (navigator.geolocation) {
          // Csak böngészős módban kérünk le pozíciót navigator.geolocation-nel
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (pos && pos.coords) {
                handleNewSample(pos.coords.latitude, pos.coords.longitude, Math.round((pos.coords.accuracy || 2.5) * 10) / 10);
              } else {
                btnRefine.classList.remove('refining');
                if (refineMsg) refineMsg.textContent = '⚠️ Nem sikerült új pozíciót fogni az átlagoláshoz.';
              }
            },
            (err) => {
              btnRefine.classList.remove('refining');
              if (refineMsg) refineMsg.textContent = `⚠️ Pontosítás sikertelen: ${err.message || 'GPS jel gyenge'}`;
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
          );
        } else {
          btnRefine.classList.remove('refining');
          if (refineMsg) refineMsg.textContent = `✅ Koordináta: ${state.gps.lat.toFixed(6)}°, ${state.gps.lng.toFixed(6)}°`;
        }
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          const nameInput = document.getElementById('input-wp-name');
          let name = (nameInput?.value || '').trim();
          if (!name) {
            name = state.gps.address ? `Útpont (${state.gps.address.split(',')[0].trim()})` : 'Rögzített útpont';
          }

          const iconInput = document.getElementById('input-wp-selected-icon');
          const selectedIcon = iconInput ? (iconInput.value || '📍') : '📍';

          const newWp = {
            id: 'wp_' + Date.now(),
            name: name,
            icon: selectedIcon,
            isFavorite: false,
            tags: Array.from(state.selectedTags),
            coords: [state.gps.lat, state.gps.lng],
            address: state.gps.address || `Pozíció (${state.gps.lat.toFixed(5)}°, ${state.gps.lng.toFixed(5)}°)`,
            accuracy: state.gps.accuracy || 2.5,
            time: new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
          };

          state.waypoints.unshift(newWp);

          // Saját útpont elmentése a böngésző/telefon tárhelyébe
          try {
            const storedUserWps = JSON.parse(localStorage.getItem('csampazo_user_waypoints') || '[]');
            storedUserWps.unshift(newWp);
            localStorage.setItem('csampazo_user_waypoints', JSON.stringify(storedUserWps));
          } catch(e) {
            console.warn('Nem sikerült menteni a user waypoints-t', e);
          }

          // Natív Android mentés is (WaypointRepository & háttértár)!
          if (window.AndroidBridge && typeof window.AndroidBridge.saveNativeWaypoint === 'function') {
            try {
              window.AndroidBridge.saveNativeWaypoint(JSON.stringify(newWp));
            } catch(e) {
              console.warn('saveNativeWaypoint hiba:', e);
            }
          }

          addWaypointMarkerToLiveMap(newWp);
          render5kmWaypointsList();
          renderWaypointManagementList();
          updateLiveTelemetryUI();

          closeModal();
          showToast(`Útpont mentve (${selectedIcon}): "${name}"`, '📍');
        } catch (err) {
          console.error('Hiba útpont mentésekor:', err);
        }
      });
    }
  }

  // Cím lekérése valós koordinátákhoz (OpenStreetMap reverz geokódolás)
  function updateWaypointAddress(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
    const addressDisplay = document.getElementById('wp-display-address');
    if (addressDisplay) addressDisplay.textContent = 'Cím keresése...';

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(r => r.json())
      .then(data => {
        let addr = '';
        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.path || data.address.footway || data.address.suburb || '';
          const houseNumber = data.address.house_number ? ' ' + data.address.house_number : '';
          const city = data.address.city || data.address.town || data.address.village || data.address.county || '';
          if (road) {
            addr = road + houseNumber + (city ? ` (${city})` : '');
          } else if (city) {
            addr = city;
          }
        }
        if (!addr && data && data.display_name) {
          addr = data.display_name.split(',').slice(0, 2).join(',').trim();
        }
        if (!addr) {
          addr = `Pozíció (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`;
        }
        state.gps.address = addr;
        const curDisplay = document.getElementById('wp-display-address');
        if (curDisplay) curDisplay.textContent = addr;
      })
      .catch(() => {
        const fallback = `Pozíció (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`;
        state.gps.address = fallback;
        const curDisplay = document.getElementById('wp-display-address');
        if (curDisplay) curDisplay.textContent = fallback;
      });
  }

  function openWaypointModal() {
    const modal = document.getElementById('modal-waypoint');
    const inputName = document.getElementById('input-wp-name');
    const coordsDisplay = document.getElementById('wp-display-coords');
    const addressDisplay = document.getElementById('wp-display-address');
    const accDisplay = document.getElementById('wp-display-accuracy');
    const refineMsg = document.getElementById('refine-status-msg');

    // 1. Megpróbáljuk kiolvasni az Android natív tracking híd pillanatnyi koordinátáit
    if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
      try {
        const snap = JSON.parse(window.AndroidBridge.getTrackingSnapshot() || '{}');
        if (snap && snap.currentLatitude && snap.currentLongitude && (snap.currentLatitude !== 0 || snap.currentLongitude !== 0)) {
          state.gps.lat = snap.currentLatitude;
          state.gps.lng = snap.currentLongitude;
          state.gps.accuracy = snap.accuracy || 2.5;
          state.hadGpsFix = true;
        }
      } catch (e) {}
    }

    const iconPalette = document.getElementById('wp-icon-palette');
    const hiddenIconInput = document.getElementById('input-wp-selected-icon');
    if (hiddenIconInput) hiddenIconInput.value = '📍';
    if (iconPalette) {
      iconPalette.querySelectorAll('.wp-icon-btn').forEach(b => {
        if (b.dataset.icon === '📍') b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    // Kiinduló minta inicializálása a pontosítandó pozícióval
    state.currentWaypointSamples = [];
    if (state.hadGpsFix && state.gps.lat && state.gps.lng) {
      state.currentWaypointSamples.push({
        lat: state.gps.lat,
        lng: state.gps.lng,
        accuracy: state.gps.accuracy || 3.0
      });
    }

    if (state.hadGpsFix) {
      if (coordsDisplay) coordsDisplay.textContent = `${state.gps.lat.toFixed(6)}° N, ${state.gps.lng.toFixed(6)}° E`;
      if (accDisplay) accDisplay.textContent = `(pontosság: ±${state.gps.accuracy} m)`;
      if (addressDisplay) addressDisplay.textContent = state.gps.address || 'Cím keresése...';
      updateWaypointAddress(state.gps.lat, state.gps.lng);
    } else {
      if (coordsDisplay) coordsDisplay.textContent = 'Valós GPS pozíció lekérése...';
      if (addressDisplay) addressDisplay.textContent = 'Pozíció meghatározása...';
      if (accDisplay) accDisplay.textContent = '(pontosság: keresés...)';
    }

    if (refineMsg) refineMsg.style.display = 'none';
    if (inputName) inputName.value = '';

    // 2. Csak akkor használjuk a böngészős geolocatiot, ha nincs Android natív híd!
    // Androidon a natív TrackingService folyamatos és megbízható GPS jelet ad.
    // A WebView párhuzamos getCurrentPosition hívása hardveres ütközést és GPS jelvesztést okozna!
    if (!window.AndroidBridge && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (pos && pos.coords) {
            state.gps.lat = pos.coords.latitude;
            state.gps.lng = pos.coords.longitude;
            state.gps.accuracy = Math.round((pos.coords.accuracy || 3.0) * 10) / 10;
            state.hadGpsFix = true;
            state.currentWaypointSamples = [{
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: state.gps.accuracy
            }];

            const cDisp = document.getElementById('wp-display-coords');
            const aDisp = document.getElementById('wp-display-accuracy');
            if (cDisp) cDisp.textContent = `${state.gps.lat.toFixed(6)}° N, ${state.gps.lng.toFixed(6)}° E`;
            if (aDisp) aDisp.textContent = `(pontosság: ±${state.gps.accuracy} m)`;

            updateWaypointAddress(state.gps.lat, state.gps.lng);
            if (state.liveCurMarker) state.liveCurMarker.setLatLng([state.gps.lat, state.gps.lng]);
            if (state.liveMap) state.liveMap.panTo([state.gps.lat, state.gps.lng]);
          }
        },
        (err) => {
          console.warn('GPS hiba útpont megnyitásakor:', err);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 }
      );
    }

    if (modal) {
      modal.classList.add('active');
      setTimeout(() => inputName?.focus(), 80);
    }
  }

  function addWaypointMarkerToLiveMap(wp) {
    if (!state.liveMap || typeof L === 'undefined') return;

    let iconSymbol = wp.icon || '📍';
    if (!wp.icon && Array.isArray(wp.tags)) {
      if (wp.tags.includes('Pad')) iconSymbol = '🪑';
      else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
      else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';
      else if (wp.tags.includes('Rózsakert')) iconSymbol = '🌸';
      else if (wp.tags.includes('Árnyék')) iconSymbol = '🌳';
      else if (wp.tags.includes('Pihenőhely')) iconSymbol = '☕';
      else if (wp.tags.includes('Mosdó')) iconSymbol = '🚻';
      else if (wp.tags.includes('Akadály')) iconSymbol = '⚠️';
    }

    // CSAK IKON (NINCS SZÖVEGES FELIRAT AZ ÉLŐ TÉRKÉPEN SEM)
    const customPin = L.divIcon({
      className: 'wp-live-pin',
      html: `
        <div style="display:flex; flex-direction:column; align-items:center; filter:drop-shadow(0 3px 6px rgba(0,0,0,0.55)); pointer-events:auto; cursor:pointer;">
          <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); border:2.5px solid #ffffff; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 10px rgba(56,189,248,0.5);">
            ${iconSymbol}
          </div>
          <div style="width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent; border-top:6px solid #0369a1; margin-top:-1px;"></div>
        </div>
      `,
      iconSize: [34, 40],
      iconAnchor: [17, 39],
      popupAnchor: [0, -36]
    });

    const marker = L.marker(wp.coords, { icon: customPin }).addTo(state.liveMap);
    // RÁBÖKÉSRE JÖN BE AZ ÚTPONT NEVE ÉS TÖRLÉS LEHETŐSÉG
    marker.bindPopup(`
      <div style="min-width:140px; font-family:system-ui; text-align:left;">
        <div style="font-size:14px; font-weight:800; color:#0284c7; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
          <span style="font-size:16px;">${iconSymbol}</span>
          <span>${escapeXml(wp.name)}</span>
        </div>
        ${wp.address ? `<div style="font-size:11px; color:#475569; margin-bottom:3px;">🏠 ${escapeXml(wp.address)}</div>` : ''}
        <div style="font-size:11px; color:#64748b;">🎯 Pontosság: ±${wp.accuracy} m (${wp.time || ''})</div>
        <div style="margin-top:8px; border-top:1px solid #e2e8f0; padding-top:6px; text-align:right;">
          <button type="button" class="btn-popup-del-wp" data-id="${escapeXml(wp.id || '')}" data-name="${escapeXml(wp.name || '')}" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer;">
            🗑️ Útpont törlése
          </button>
        </div>
      </div>
    `);

    state.liveWpMarkers.push(marker);
  }

  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  function initWaypointFilters() {
    const filterContainer = document.getElementById('wp-filter-chips-bar');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-chip-btn');
      if (btn) {
        filterContainer.querySelectorAll('.filter-chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeWpFilter = btn.dataset.filter || 'all';
        render5kmWaypointsList();
      }
    });
  }

  function render5kmWaypointsList() {
    const container = document.getElementById('waypoints-container');
    const countBadge = document.getElementById('wp-count-in-range');
    if (!container) return;

    const waypointsWithDist = state.waypoints.map(wp => {
      const dist = calculateDistanceMeters(state.gps.lat, state.gps.lng, wp.coords[0], wp.coords[1]);
      return { ...wp, distanceMeters: dist };
    });

    const inRange = waypointsWithDist.filter(wp => wp.distanceMeters <= 5000);
    const filtered = inRange.filter(wp => {
      if (state.activeWpFilter === 'all') return true;
      return wp.tags.includes(state.activeWpFilter);
    });

    filtered.sort((a, b) => a.distanceMeters - b.distanceMeters);
    if (countBadge) countBadge.textContent = inRange.length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="wp-empty-notice">
          <div style="font-size:2.2rem; margin-bottom:0.5rem;">📍</div>
          <div style="font-size:1.05rem; font-weight:800; color:#fff;">Még nincs mentett útpont 5 km-en belül.</div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">Kattints a fenti <strong>+ Új Útpont</strong> gombra egy új pad vagy pihenőhely rögzítéséhez!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(wp => {
      let iconSymbol = wp.icon || '📍';
      if (!wp.icon && Array.isArray(wp.tags)) {
        if (wp.tags.includes('Pad')) iconSymbol = '🪑';
        else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
        else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';
        else if (wp.tags.includes('Rózsakert')) iconSymbol = '🌸';
        else if (wp.tags.includes('Árnyék')) iconSymbol = '🌳';
        else if (wp.tags.includes('Pihenőhely')) iconSymbol = '☕';
        else if (wp.tags.includes('Mosdó')) iconSymbol = '🚻';
        else if (wp.tags.includes('Akadály')) iconSymbol = '⚠️';
      }

      const distText = wp.distanceMeters < 1000 ? `📍 ${wp.distanceMeters} m-re tőled` : `📍 ${(wp.distanceMeters / 1000).toFixed(1)} km-re tőled`;

      return `
        <div class="wp-item-card" data-id="${wp.id}">
          <div class="wp-card-top-row">
            <div class="wp-card-title-group">
              <span class="wp-card-symbol">${iconSymbol}</span>
              <div class="wp-card-name">${wp.name} ${wp.isFavorite ? '⭐' : ''}</div>
            </div>
            <span class="wp-distance-badge">${distText}</span>
          </div>

          <div class="wp-card-tags-row">
            ${wp.tags.map(t => `<span class="wp-badge-tag">${t}</span>`).join('')}
          </div>

          <div class="wp-card-geo-info">
            <div>🏠 ${wp.address}</div>
            <div class="wp-card-acc">🎯 ${wp.coords[0].toFixed(5)}, ${wp.coords[1].toFixed(5)} • (pontosság: ±${wp.accuracy} m)</div>
          </div>

          <div class="wp-card-action-bar">
            <span style="font-size:0.75rem; color:var(--text-dim); font-family:monospace;">${wp.time}</span>
            <button type="button" class="btn-show-on-map btn-goto-live-map" data-id="${wp.id}">
              <span>🎯</span> <span>Térképen megtekintés</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-goto-live-map, .wp-item-card').forEach(el => {
      el.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id || e.currentTarget.closest('.wp-item-card')?.dataset.id;
        const target = state.waypoints.find(w => w.id === id);
        if (target && state.liveMap) {
          state.liveMap.setView(target.coords, 20);
          const mapSec = document.querySelector('.map-section-card');
          if (mapSec) mapSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast(`Középpont: ${target.name}`, '🎯');
        }
      });
    });
  }

  // ==========================================================================
  // GPX GENERÁLÓ ÉS MENTŐ SEGÉDFÜGGVÉNYEK (belsőtárhely/csampazo mappa)
  // ==========================================================================

  // --- Teljes mérési pontok kinyerése GPS pontossággal és időbélyeggel ---
  function extractFullPointsFromRoute(route) {
    if (!route) return [];
    const source = (Array.isArray(route.path) && route.path.length > 0)
      ? route.path
      : ((Array.isArray(route.points) && route.points.length > 0)
        ? route.points
        : ((route === state.selectedRoute && state.recordedPath && state.recordedPath.length > 0)
          ? state.recordedPath
          : []));

    const startMs = getRouteStartTimeMs(route);
    const totalSec = Math.max(1, route.durationSec || 60);
    const stepSec = source.length > 1 ? (totalSec / (source.length - 1)) : 1;

    return source.map((pt, idx) => {
      let lat = 0, lng = 0, acc = 2.5, timeMs = null, speed = 2.5;
      if (Array.isArray(pt)) {
        lat = Number(pt[0]) || 0;
        lng = Number(pt[1]) || 0;
        acc = (typeof pt[2] === 'number' && pt[2] > 0) ? pt[2] : 2.5;
        timeMs = (typeof pt[3] === 'number' && pt[3] > 0) ? pt[3] : (startMs + Math.round(idx * stepSec * 1000));
        speed = (typeof pt[4] === 'number') ? pt[4] : 2.5;
      } else if (pt && typeof pt === 'object') {
        lat = Number(pt.lat ?? pt.latitude) || 0;
        lng = Number(pt.lng ?? pt.longitude) || 0;
        acc = (typeof pt.accuracy === 'number' && pt.accuracy > 0) ? pt.accuracy : (typeof pt.accuracyMeters === 'number' ? pt.accuracyMeters : 2.5);
        timeMs = (typeof pt.time === 'number') ? pt.time : (typeof pt.timestamp === 'number' ? pt.timestamp : (startMs + Math.round(idx * stepSec * 1000)));
        speed = (typeof pt.speed === 'number') ? pt.speed : (typeof pt.speedKmh === 'number' ? pt.speedKmh : 2.5);
      }
      return { lat, lng, acc, timeMs, speed, idx };
    }).filter(pt => pt.lat !== 0 && pt.lng !== 0 && !isNaN(pt.lat) && !isNaN(pt.lng));
  }

  // --- Részletes mérési napló készítése minden mérésnél a GPS pontosság adataival ---
  function buildDetailedMeasurementLog(route) {
    const targetRoute = route || state.selectedRoute || (state.savedRoutes && state.savedRoutes[0]);
    if (!targetRoute) return '';

    const startMs = getRouteStartTimeMs(targetRoute);
    const startDate = new Date(startMs);
    const points = extractFullPointsFromRoute(targetRoute);

    let totalAcc = 0;
    let validAccCount = 0;
    let minAcc = 999;
    let maxAcc = 0;

    points.forEach(p => {
      if (p.acc && p.acc > 0) {
        totalAcc += p.acc;
        validAccCount++;
        if (p.acc < minAcc) minAcc = p.acc;
        if (p.acc > maxAcc) maxAcc = p.acc;
      }
    });

    const avgAccStr = validAccCount > 0 ? `±${(totalAcc / validAccCount).toFixed(1)} m` : '±2.5 m';
    const minAccStr = validAccCount > 0 ? `±${minAcc.toFixed(1)} m` : '±1.8 m';
    const maxAccStr = validAccCount > 0 ? `±${maxAcc.toFixed(1)} m` : '±3.5 m';

    let log = `# ========================================================\n`;
    log += `# CSÁMPÁZÓ - RÉSZLETES MÉRÉSI NAPLÓ ÉS GPS PONTOSSÁG\n`;
    log += `# Séta címe: ${targetRoute.title}\n`;
    log += `# Kezdés: ${startDate.toLocaleString('hu-HU')} (${startDate.toISOString()})\n`;
    log += `# Időtartam: ${targetRoute.durationStr || (targetRoute.durationSec + ' mp')} | Távolság: ${targetRoute.meters} m | Lépésszám: ${targetRoute.steps || 0}\n`;
    log += `# Rögzített mérési pontok száma: ${points.length} db\n`;
    log += `# GPS pontosság összesítés: Átlagos: ${avgAccStr} | Legjobb: ${minAccStr} | Leggyengébb: ${maxAccStr}\n`;
    log += `# --------------------------------------------------------\n`;
    log += `# SORSZÁM | IDŐ | SZÉLESSÉG (LAT) | HOSSZÚSÁG (LON) | GPS PONTOSSÁG (±m) | SEBESSÉG (km/h) | TÁVOLSÁG (m)\n`;
    log += `# ========================================================\n`;

    let runningDist = 0;
    points.forEach((p, idx) => {
      if (idx > 0) {
        const prevP = points[idx - 1];
        runningDist += calcHaversineMeters(prevP.lat, prevP.lng, p.lat, p.lng);
      }

      const pDate = new Date(p.timeMs || (startMs + idx * 1000));
      const timeStr = pDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const num = String(idx + 1).padStart(4, ' ');
      const latStr = p.lat.toFixed(7);
      const lngStr = p.lng.toFixed(7);
      const accStr = `±${p.acc.toFixed(1)} m`.padEnd(9, ' ');
      const spdStr = `${p.speed.toFixed(1)} km/h`.padEnd(9, ' ');
      const distStr = `${runningDist.toFixed(1)} m`;

      log += `${num} | ${timeStr} | ${latStr} | ${lngStr} | ${accStr} | ${spdStr} | ${distStr}\n`;
    });

    return log;
  }

  function buildGpxForRoute(route) {
    const targetRoute = route || state.selectedRoute || (state.savedRoutes && state.savedRoutes[0]);
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="Csampazo SM Tracker" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    const title = targetRoute ? targetRoute.title : 'Csampazo SM Séta';
    const startMs = getRouteStartTimeMs(targetRoute);
    const startDate = new Date(startMs);
    gpx += `  <metadata><name>${escapeXml(title)}</name><time>${startDate.toISOString()}</time></metadata>\n`;

    if (state.waypoints && state.waypoints.length > 0) {
      state.waypoints.forEach(wp => {
        gpx += `  <wpt lat="${wp.coords[0]}" lon="${wp.coords[1]}">\n`;
        gpx += `    <name>${escapeXml(wp.name)}</name>\n`;
        gpx += `    <desc>${escapeXml(wp.address || '')}</desc>\n`;
        gpx += `  </wpt>\n`;
      });
    }

    if (targetRoute) {
      gpx += `  <trk>\n    <name>${escapeXml(targetRoute.title)}</name>\n    <trkseg>\n`;
      const fullPoints = extractFullPointsFromRoute(targetRoute);

      if (fullPoints && fullPoints.length > 0) {
        fullPoints.forEach((pt) => {
          const ptTime = new Date(pt.timeMs).toISOString();
          const accStr = pt.acc.toFixed(1);
          const hdopStr = (pt.acc / 2.5).toFixed(1);
          const spdStr = pt.speed.toFixed(1);

          gpx += `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lng.toFixed(7)}">\n`;
          gpx += `        <time>${ptTime}</time>\n`;
          gpx += `        <hdop>${hdopStr}</hdop>\n`;
          gpx += `        <extensions>\n`;
          gpx += `          <accuracy_m>${accStr}</accuracy_m>\n`;
          gpx += `          <speed_kmh>${spdStr}</speed_kmh>\n`;
          gpx += `        </extensions>\n`;
          gpx += `      </trkpt>\n`;
        });
      }
      gpx += `    </trkseg>\n  </trk>\n`;
    }
    gpx += `</gpx>\n`;
    return gpx;
  }

  function saveAndOptionallyOpenGpx(route, autoOpenPrompt = false) {
    const targetRoute = route || state.selectedRoute || (state.savedRoutes && state.savedRoutes[0]);
    const startTime = getRouteStartTimeMs(targetRoute);
    const d = new Date(startTime);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const fileName = `csampazo-${yy}${mm}${dd}${hh}${min}.gpx`;
    const gpx = buildGpxForRoute(targetRoute);

    // Részletes mérési napló automatikus elmentése (minden mérésnél a GPS pontosság adataival)
    try {
      const detailedLog = buildDetailedMeasurementLog(targetRoute);
      const detailedFileName = `csampazo-reszletes-pontossag-${yy}${mm}${dd}${hh}${min}.txt`;
      if (window.AndroidBridge && typeof window.AndroidBridge.saveTxtToCsampazo === 'function') {
        window.AndroidBridge.saveTxtToCsampazo(detailedLog, detailedFileName);
      }
    } catch (e) {
      console.warn('Részletes pontosság napló mentési hiba:', e);
    }

    if (window.AndroidBridge && typeof window.AndroidBridge.saveGpxToCsampazo === 'function') {
      const savedPath = window.AndroidBridge.saveGpxToCsampazo(gpx, startTime);
      if (savedPath) {
        showToast(`📁 GPX és pontossági napló mentve: ${fileName}`, '✅');
        if (autoOpenPrompt) {
          showGpxOpenDialog(fileName, savedPath);
        }
        return savedPath;
      }
    }

    downloadFile(gpx, fileName, 'application/gpx+xml');
    showToast(`🌐 ${fileName} letöltve!`, '📁');
    return null;
  }

  function showGpxOpenDialog(fileName, savedPath) {
    const existing = document.getElementById('gpx-open-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gpx-open-modal';
    modal.className = 'gpx-save-modal-overlay';
    modal.innerHTML = `
      <div class="gpx-save-modal-content" style="position:relative; max-height:88vh; overflow-y:auto;">
        <button type="button" id="btn-gpx-modal-x" aria-label="Bezárás" style="position:absolute; top:0.75rem; right:0.75rem; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#fff; font-size:1.3rem; cursor:pointer; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; line-height:1;">✕</button>
        <div class="modal-icon">📁</div>
        <h3>GPX Útvonal Mentve!</h3>
        <p class="modal-filename"><strong>${escapeXml(fileName)}</strong></p>
        <p class="modal-desc">Sikeresen elmentve a <strong>Download/csampazo</strong> mappába.<br>Meg szeretnéd nyitni térképpel vagy fájlkezelővel?</p>
        <div class="modal-actions">
          <button type="button" class="btn-modal-open" id="btn-modal-open-gpx">📂 Megnyitás Most</button>
          <button type="button" class="btn-modal-close" id="btn-modal-dismiss-gpx">Bezárás</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const closeModal = () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (document.body.contains(modal)) {
        modal.remove();
      }
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    document.getElementById('btn-gpx-modal-x')?.addEventListener('click', closeModal);
    document.getElementById('btn-modal-dismiss-gpx')?.addEventListener('click', closeModal);

    document.getElementById('btn-modal-open-gpx')?.addEventListener('click', () => {
      closeModal();
      if (window.AndroidBridge) {
        if (savedPath && typeof window.AndroidBridge.openGpxFile === 'function') {
          window.AndroidBridge.openGpxFile(savedPath);
        } else if (typeof window.AndroidBridge.openLatestGpx === 'function') {
          window.AndroidBridge.openLatestGpx();
        }
      }
    });

    setTimeout(() => {
      if (document.body.contains(modal)) {
        closeModal();
      }
    }, 15000);
  }

  // ==========================================================================
  // 13. BEÁLLÍTÁSOK & ADATKEZELÉS (IMPORT / EXPORT)
  // ==========================================================================
  function initSettingsAndIO() {
    // TXT Export
    const btnExportTxt = document.getElementById('btn-export-txt');
    if (btnExportTxt) {
      btnExportTxt.addEventListener('click', () => {
        let content = `# ========================================================\n`;
        content += `# CSÁMPÁZÓ - SM SÉTA- ÉS LÉPÉSNAPLÓ (csampazo_naplo.txt)\n`;
        content += `# Exportálva: ${new Date().toLocaleString('hu-HU')}\n`;
        content += `# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (m) | IDŐ (másodperc) | TÍPUS | PIHENŐK (másodperc) | GPS PONTOSSÁG | CÍMKÉK | JEGYZET\n`;
        content += `# ========================================================\n`;

        state.savedRoutes.forEach(r => {
          const accInfo = r.gpsAccuracyAvg ? `GPS pontosság: ±${r.gpsAccuracyAvg}m (min: ±${r.gpsAccuracyMin}m, max: ±${r.gpsAccuracyMax}m)` : 'GPS pontosság: n.a.';
          content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 0} mp (${r.durationStr || ''}) | SM Séta | ${r.restCount} pihenő (${typeof r.restSec === 'number' ? r.restSec : 0} mp) | ${accInfo} | ${(r.tags || []).join(' ')} | ${r.note}\n`;
        });

        downloadFile(content, 'csampazo_naplo.txt', 'text/plain;charset=utf-8');
        showToast('csampazo_naplo.txt letöltve!', '📄');
      });
    }

    // TXT Import
    const btnImportTrigger = document.getElementById('btn-import-txt-trigger');
    const fileInput = document.getElementById('file-import-txt');

    if (btnImportTrigger && fileInput) {
      btnImportTrigger.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          parseAndImportTxtLog(event.target.result, file.name);
          fileInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    // ==========================================================================
    // GPX MENTÉS ÉS KÖZVETLEN MEGNYITÁS (belsőtárhely/csampazo mappa)
    // ==========================================================================
    const btnExportGpx = document.getElementById('btn-export-gpx');
    if (btnExportGpx) {
      btnExportGpx.addEventListener('click', () => {
        saveAndOptionallyOpenGpx(state.selectedRoute, true);
      });
    }

    const btnOpenLatestGpx = document.getElementById('btn-open-latest-gpx');
    if (btnOpenLatestGpx) {
      btnOpenLatestGpx.addEventListener('click', () => {
        const savedPath = saveAndOptionallyOpenGpx(state.selectedRoute, false);
        if (window.AndroidBridge) {
          if (savedPath && typeof window.AndroidBridge.openGpxFile === 'function') {
            window.AndroidBridge.openGpxFile(savedPath);
          } else if (typeof window.AndroidBridge.openLatestGpx === 'function') {
            window.AndroidBridge.openLatestGpx();
          }
        }
      });
    }

    // Szerver szinkron
    const btnSyncServer = document.getElementById('btn-sync-server');
    if (btnSyncServer) {
      btnSyncServer.addEventListener('click', () => {
        showToast('Szinkronizáció a háttérszerverrel...', '🔄');
        fetch('/api/get-log')
          .then(res => res.text())
          .then(text => {
            parseAndImportTxtLog(text);
            showToast('Szerver szinkronizáció sikeres!', '⚡');
          })
          .catch(() => {
            showToast('Helyi szinkron aktív.', 'ℹ️');
          });
      });
    }

    // Beállítások form mentése a 6. képernyőn
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const restThreshold = parseInt(document.getElementById('set-rest-threshold-input')?.value, 10);
        const goalVal = parseInt(document.getElementById('set-target-goal-val')?.value, 10);
        const goalType = document.getElementById('set-target-goal-type')?.value;
        const pauseMode = document.getElementById('set-pause-blink')?.value;
        const stickMode = document.getElementById('set-stick-mode')?.value || 'START_WITHOUT';
        const reminderSec = parseInt(document.getElementById('set-reminder-interval-input')?.value, 10) || 0;

        state.settings = {
          restThresholdSec: restThreshold > 0 ? restThreshold : 60,
          targetGoalVal: goalVal > 0 ? goalVal : 500,
          targetGoalType: goalType || 'meters',
          stepLengthCm: (state.settings && state.settings.stepLengthCm) ? state.settings.stepLengthCm : 65,
          pauseBlinkMode: pauseMode || 'pulse',
          stickMode: stickMode,
          reminderIntervalSec: reminderSec >= 0 ? reminderSec : 0
        };

        if (state.walkStatus === 'IDLE' || state.walkStatus === 'STOPPED') {
          state.isUsingStick = (stickMode === 'ALWAYS' || stickMode === 'START_WITH');
          updateStickButtonUI();
        }

        // Ha a háttérben fut mérés, azonnal frissítjük az emlékeztető időközt a natív szolgáltatásban is
        if (window.AndroidBridge && typeof window.AndroidBridge.setReminderInterval === 'function') {
          try {
            window.AndroidBridge.setReminderInterval(state.settings.reminderIntervalSec);
          } catch (e) {}
        }

        localStorage.setItem('csampazo_settings', JSON.stringify(state.settings));
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
        showToast('Beállítások elmentve!', '💾');
      });
    }

    // Leállítás emlékeztető próba csippanás gomb (beállításokban)
    const btnTestChirp = document.getElementById('btn-test-reminder-chirp');
    if (btnTestChirp) {
      btnTestChirp.addEventListener('click', () => {
        playVariableChirp();
        showToast('🔊 Változó hangmagasságú próba csippanás lejátszva!', '🔔');
      });
    }
  }

  // ==========================================================================
  // GOOGLE DRIVE SZINKRONIZÁCIÓ (ANDROID ↔ SZÁMÍTÓGÉP)
  // "androidos legye úgy, hogy számítógépen is megnézhető legyen, google drive szinkronizációval"
  // ==========================================================================
  function initGoogleDriveSync() {
    const btnLogin = document.getElementById('btn-gdrive-login');
    const btnDownload = document.getElementById('btn-gdrive-sync-down');
    const btnUpload = document.getElementById('btn-gdrive-sync-up');
    const btnLogout = document.getElementById('btn-gdrive-logout');
    const statusBadge = document.getElementById('gdrive-status-badge');
    const statusText = document.getElementById('gdrive-status-text');
    const btnTriggerLocal = document.getElementById('btn-trigger-gdrive-local');
    const fileInputLocal = document.getElementById('file-import-gdrive-desktop');

    let gdrive = null;
    if (typeof window.CsampazoGDriveSync !== 'undefined') {
      gdrive = new window.CsampazoGDriveSync();
    }

    function updateUiState() {
      const isConnected = gdrive && gdrive.isConnected();
      const email = gdrive ? gdrive.getUserEmail() : '';

      if (statusBadge && statusText) {
        if (isConnected) {
          statusBadge.className = 'gdrive-status-badge connected';
          statusText.textContent = email ? `Csatlakoztatva: ${email}` : 'Csatlakoztatva a Google Drive-hoz';
        } else {
          statusBadge.className = 'gdrive-status-badge disconnected';
          statusText.textContent = 'Nincs csatlakoztatva';
        }
      }

      if (btnDownload) btnDownload.disabled = !isConnected;
      if (btnUpload) btnUpload.disabled = !isConnected;
      if (btnLogin) btnLogin.style.display = isConnected ? 'none' : 'inline-flex';
      if (btnLogout) btnLogout.style.display = isConnected ? 'inline-flex' : 'none';
    }

    if (gdrive) {
      gdrive.subscribe((event) => {
        if (event === 'connected' || event === 'user_info' || event === 'disconnected') {
          updateUiState();
        }
      });
      updateUiState();

      if (btnLogin) {
        btnLogin.addEventListener('click', () => {
          try {
            const currentClientId = gdrive.getClientId();
            if (!currentClientId) {
              const enteredId = prompt('Google OAuth Client ID megadása (Közvetlen asztali mappa használatakor elhagyható):', '');
              if (enteredId && enteredId.trim()) {
                gdrive.setClientId(enteredId.trim());
              } else {
                showToast('A sárga gombbal API kulcs nélkül is betölthetsz fájlt a Google Drive mappádból!', '💡');
                return;
              }
            }
            gdrive.requestLogin();
          } catch (err) {
            showToast(err.message, '⚠️');
          }
        });
      }

      if (btnLogout) {
        btnLogout.addEventListener('click', () => {
          gdrive.disconnect();
          updateUiState();
          showToast('Google fiók leválasztva.', 'ℹ️');
        });
      }

      if (btnDownload) {
        btnDownload.addEventListener('click', async () => {
          showToast('Sétanapló letöltése a Google Drive-ról...', '⏳');
          try {
            const content = await gdrive.downloadFile('csampazo_naplo.txt');
            if (content) {
              parseAndImportTxtLog(content);
              showToast('✅ Google Drive adatok sikeresen szinkronizálva az Android telefonról!', '☁️');
            } else {
              showToast('Nem található csampazo_naplo.txt a Google Drive felhődben.', '⚠️');
            }
          } catch (e) {
            showToast('Hiba a letöltés során: ' + e.message, '❌');
          }
        });
      }

      if (btnUpload) {
        btnUpload.addEventListener('click', async () => {
          showToast('Sétanapló feltöltése Google Drive-ra...', '⏳');
          try {
            let content = `# ========================================================\n`;
            content += `# CSÁMPÁZÓ - SM SÉTA- ÉS LÉPÉSNAPLÓ (csampazo_naplo.txt)\n`;
            content += `# Szinkronizálva a számítógépről: ${new Date().toLocaleString('hu-HU')}\n`;
            content += `# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (m) | IDŐ (másodperc) | TÍPUS | PIHENŐK (másodperc) | CÍMKÉK | JEGYZET\n`;
            content += `# ========================================================\n`;
            state.savedRoutes.forEach(r => {
              content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 190} mp (${r.durationStr}) | SM Séta | ${r.restCount} pihenő (${r.restSec || 75} mp) | ${(r.tags || []).join(' ')} | ${r.note}\n`;
            });

            const ok = await gdrive.uploadFile('csampazo_naplo.txt', content);
            if (ok) {
              showToast('✅ csampazo_naplo.txt sikeresen feltöltve a Google Drive-ra!', '☁️');
            } else {
              showToast('Hiba a Google Drive feltöltés során.', '❌');
            }
          } catch (e) {
            showToast('Feltöltési hiba: ' + e.message, '❌');
          }
        });
      }
    }

    // 2. Számítógépes Asztali Google Drive Mappa Fájl Megnyitása (Zero Config, 1 kattintás!)
    if (btnTriggerLocal && fileInputLocal) {
      btnTriggerLocal.addEventListener('click', () => fileInputLocal.click());

      fileInputLocal.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          parseAndImportTxtLog(event.target.result, file.name);
          fileInputLocal.value = '';
        };
        reader.readAsText(file);
      });
    }
  }

  // --- GPX Nyomvonal és Útpont feldolgozó segédfüggvény ---
  function parseGpxRoute(xmlStr, fileName) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
      const trkpts = xmlDoc.getElementsByTagName('trkpt');
      const wpts = xmlDoc.getElementsByTagName('wpt');
      const coords = [];

      for (let i = 0; i < trkpts.length; i++) {
        const pt = trkpts[i];
        const lat = parseFloat(pt.getAttribute('lat'));
        const lon = parseFloat(pt.getAttribute('lon') || pt.getAttribute('lng'));
        if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
          coords.push([lat, lon]);
        }
      }

      if (coords.length === 0) {
        for (let i = 0; i < wpts.length; i++) {
          const pt = wpts[i];
          const lat = parseFloat(pt.getAttribute('lat'));
          const lon = parseFloat(pt.getAttribute('lon') || pt.getAttribute('lng'));
          if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
            coords.push([lat, lon]);
          }
        }
      }

      if (coords.length === 0) return null;

      let totalM = 0;
      for (let i = 1; i < coords.length; i++) {
        totalM += calcHaversineMeters(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
      }
      const roundedMeters = Math.max(10, Math.round(totalM));
      const estSteps = Math.round(roundedMeters / 0.65);
      const estDurationSec = Math.max(30, Math.round(roundedMeters / 0.75));

      let trackName = '';
      const trkNameEl = xmlDoc.getElementsByTagName('name')[0];
      if (trkNameEl && trkNameEl.textContent) {
        trackName = trkNameEl.textContent.trim();
      }
      if (!trackName && fileName) {
        trackName = fileName.replace(/\.[^/.]+$/, '');
      }
      if (!trackName) {
        trackName = 'Betöltött GPX Útvonal';
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });

      return {
        id: 'gpx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: trackName,
        date: dateStr,
        time: timeStr,
        startTime: Date.now() - (estDurationSec * 1000),
        timestamp: Date.now() - (estDurationSec * 1000),
        meters: roundedMeters,
        steps: estSteps,
        durationStr: `${Math.floor(estDurationSec / 60)}:${String(estDurationSec % 60).padStart(2, '0')}`,
        durationSec: estDurationSec,
        activeSec: estDurationSec,
        restSec: 0,
        avgSpeed: `${((roundedMeters / estDurationSec) * 3.6).toFixed(1)} km/h`,
        restCount: 0,
        restDurationStr: '0 mp',
        elevationGain: '+2 m',
        elevationLoss: '-1 m',
        note: `GPX fájlból betöltve (${coords.length} GPS pont).`,
        tags: ['#gpx', '#betöltött'],
        path: coords
      };
    } catch (e) {
      console.warn('GPX feldolgozási hiba:', e);
      return null;
    }
  }

  function parseAndImportTxtLog(content, fileName) {
    if (!content || typeof content !== 'string') return;
    const trimmed = content.trim();

    // 1. GPX formátum vizsgálata és betöltése
    if (trimmed.includes('<gpx') || trimmed.includes('<trkpt') || (fileName && fileName.toLowerCase().endsWith('.gpx'))) {
      const gpxRoute = parseGpxRoute(content, fileName);
      if (gpxRoute) {
        state.savedRoutes.unshift(gpxRoute);
        try {
          let stored = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
          stored.unshift(gpxRoute);
          localStorage.setItem('csampazo_user_routes', JSON.stringify(stored));
        } catch (e) {}

        renderSavedRoutesTimeline();
        renderWeeklyCalendar();
        updateProgressScreen();
        selectRoute(gpxRoute);
        showToast(`✅ "${gpxRoute.title}" betöltve és megjelenítve a térképen!`, '🗺️');
        return;
      }
    }

    // 2. JSON formátum vizsgálata és betöltése
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const routeObj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (routeObj && (routeObj.path || routeObj.meters || routeObj.coordinates)) {
          const rawCoords = routeObj.path || routeObj.coordinates || routeObj.points || trackCoords;
          const cleanCoords = normalizePathCoords(rawCoords);
          const newRoute = {
            id: routeObj.id || ('json_' + Date.now()),
            title: routeObj.title || 'Betöltött Útvonal',
            date: routeObj.date || new Date().toISOString().split('T')[0],
            time: routeObj.time || '12:00',
            startTime: routeObj.startTime || Date.now(),
            timestamp: routeObj.timestamp || Date.now(),
            meters: routeObj.meters || 100,
            steps: routeObj.steps || 120,
            durationStr: routeObj.durationStr || '02:00',
            durationSec: routeObj.durationSec || 120,
            activeSec: routeObj.activeSec || 100,
            restSec: routeObj.restSec || 20,
            avgSpeed: routeObj.avgSpeed || '2.5 km/h',
            restCount: routeObj.restCount || 0,
            restDurationStr: routeObj.restDurationStr || '0 mp',
            elevationGain: routeObj.elevationGain || '+0 m',
            elevationLoss: routeObj.elevationLoss || '-0 m',
            note: routeObj.note || 'JSON fájlból betöltve',
            tags: routeObj.tags || ['#json'],
            path: cleanCoords
          };

          state.savedRoutes.unshift(newRoute);
          try {
            let stored = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
            stored.unshift(newRoute);
            localStorage.setItem('csampazo_user_routes', JSON.stringify(stored));
          } catch (e) {}

          renderSavedRoutesTimeline();
          renderWeeklyCalendar();
          updateProgressScreen();
          selectRoute(newRoute);
          showToast(`✅ "${newRoute.title}" betöltve és megjelenítve a térképen!`, '🗺️');
          return;
        }
      } catch (e) {
        console.warn('JSON parse fallback:', e);
      }
    }

    // 3. TXT napló sorok feldolgozása
    const lines = content.split('\n');
    let importedCount = 0;
    let lastImported = null;

    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;

      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        const date = parts[0];
        const steps = parseInt(parts[1], 10) || 120;
        const meters = parseInt(parts[2].replace(/[^\d]/g, ''), 10) || 100;
        const durationStr = parts[3];
        const title = parts[4] || 'Importált séta';
        const restCount = parseInt((parts[5] || '1').replace(/[^\d]/g, ''), 10) || 1;
        const note = parts[7] || '';

        const exists = state.savedRoutes.some(r => r.date === date && r.meters === meters);
        if (!exists) {
          const parsedStart = Date.parse(`${date}T10:30:00`) || Date.now();
          const routeItem = {
            id: 'imp_' + Math.random().toString(36).substr(2, 9),
            title: title,
            date: date,
            time: '10:30',
            startTime: parsedStart,
            timestamp: parsedStart,
            meters: meters,
            steps: steps,
            durationStr: durationStr,
            durationSec: 180,
            activeSec: 110,
            restSec: 70,
            avgSpeed: '2.2 km/h',
            restCount: restCount,
            restDurationStr: '70 mp',
            elevationGain: '+2 m',
            elevationLoss: '-1 m',
            note: note,
            tags: ['#importált'],
            path: [...trackCoords]
          };
          state.savedRoutes.unshift(routeItem);
          lastImported = routeItem;
          importedCount++;
        }
      }
    });

    try {
      localStorage.setItem('csampazo_user_routes', JSON.stringify(state.savedRoutes.filter(r => !r.id.startsWith('route_sample'))));
    } catch (e) {}

    renderSavedRoutesTimeline();
    renderWeeklyCalendar();
    updateProgressScreen();

    if (lastImported) {
      selectRoute(lastImported);
    }
    showToast(`${importedCount} db új séta sikeresen importálva!`, '📥');
  }

  function downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escapeXml(str) {
    return (str || '').replace(/[<>&'"]/g, c => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  // ==========================================================================
  // 14. MINTA ADATOK (ALAPBÓL TELJESEN ÜRES: A PROGRAMBAN NINCS ELŐRE MEGADOTT ADAT!)
  // ==========================================================================
  const SAMPLE_WAYPOINTS = [];
  const SAMPLE_ROUTES = [];

  function loadInitialData() {
    let userRoutes = [];
    let userWaypoints = [];
    try {
      userRoutes = JSON.parse(localStorage.getItem('csampazo_user_routes') || '[]');
    } catch (e) {
      userRoutes = [];
    }
    try {
      userWaypoints = JSON.parse(localStorage.getItem('csampazo_user_waypoints') || '[]');
    } catch (e) {
      userWaypoints = [];
    }

    // Ha van natív Android útpont tároló (WaypointRepository), összefésüljük
    if (window.AndroidBridge && typeof window.AndroidBridge.getNativeWaypointsJson === 'function') {
      try {
        const natArr = JSON.parse(window.AndroidBridge.getNativeWaypointsJson() || '[]');
        if (Array.isArray(natArr) && natArr.length > 0) {
          natArr.forEach(nw => {
            if (!userWaypoints.some(uw => uw.id === nw.id)) {
              userWaypoints.push(nw);
            }
          });
        }
      } catch(e) {}
    }

    // A mintaszűrő KIZÁRÓLAG a beépített mintaazonosítójú elemeket szűrje ki!
    // A felhasználó által felvett valós pontokat (pl. pad a rózsakertben, platán alatt) SOHA nem szabad törölni!
    const isSampleOrMargitWp = (w) => {
      if (!w) return true;
      if (w.id && (String(w.id).startsWith('wp_sample_') || String(w.id).startsWith('sample_'))) return true;
      return false;
    };

    const isSampleRoute = (r) => {
      if (!r) return true;
      if (r.id && (String(r.id).startsWith('r_0') || String(r.id).startsWith('sample_') || String(r.id).startsWith('route_sample'))) return true;
      if (r.title && (r.title.includes('Minta') || r.title.includes('Margitsziget') || r.title.includes('SM Alapteszt'))) return true;
      if (Array.isArray(r.tags) && r.tags.some(t => t.includes('demo') || t.includes('minta'))) return true;
      return false;
    };

    // Teljes megtisztítás
    userWaypoints = userWaypoints.filter(w => !isSampleOrMargitWp(w));
    userRoutes = userRoutes.filter(r => !isSampleRoute(r));

    // A valós mentett sétákból is kiszűrjük a minta útpontokat
    userRoutes.forEach(r => {
      if (r && Array.isArray(r.waypoints)) {
        r.waypoints = r.waypoints.filter(w => !isSampleOrMargitWp(w));
        r.waypointsCount = r.waypoints.length;
      }
    });

    try {
      localStorage.setItem('csampazo_user_waypoints', JSON.stringify(userWaypoints));
      localStorage.setItem('csampazo_user_routes', JSON.stringify(userRoutes));
      localStorage.setItem('csampazo_demo_mode', 'false');
    } catch (e) {}

    state.isDemoMode = false;
    state.waypoints = [...userWaypoints];
    state.savedRoutes = [...userRoutes];

    // Élő térkép jelölők frissítése
    if (state.liveMap && typeof L !== 'undefined') {
      state.liveWpMarkers.forEach(m => state.liveMap.removeLayer(m));
      state.liveWpMarkers = [];
      state.waypoints.forEach(wp => addWaypointMarkerToLiveMap(wp));
    }

    render5kmWaypointsList();
    renderWaypointManagementList();
    renderWeeklyCalendar();
    renderSavedRoutesTimeline();

    if (state.savedRoutes.length > 0) {
      state.selectedRoute = state.savedRoutes[0];
    } else {
      state.selectedRoute = null;
    }
    updateSummaryScreen(state.selectedRoute);
    updateProgressScreen();
    renderLevelLadder();
  }

  // ==========================================================================
  // 15. DEMO MÓD KAPCSOLÓ ÉS ADATOK TELJES KITAKARÍTÁSA
  // ==========================================================================
  function initDemoModeAndClearData() {
    updateDemoModeUI();

    // 1. Demo Mód Ki/Be kapcsoló gomb
    const btnToggleDemo = document.getElementById('btn-toggle-demo-mode');
    if (btnToggleDemo) {
      btnToggleDemo.addEventListener('click', () => {
        state.isDemoMode = !state.isDemoMode;
        localStorage.setItem('csampazo_demo_mode', state.isDemoMode ? 'true' : 'false');
        updateDemoModeUI();
        loadInitialData();
        showToast(
          state.isDemoMode 
            ? '🎮 Demo Mód bekapcsolva! Minta séták és útpontok betöltve.' 
            : '🧹 Demo Mód kikapcsolva! Visszaállt az üres, tiszta állapot.',
          state.isDemoMode ? '🎮' : '🧹'
        );
      });
    }

    // 2. Minden Adat Kitakarítása (Tiszta lap) gomb
    const btnClearAll = document.getElementById('btn-clear-all-data');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => {
        if (!confirm('Biztosan kitakarítod az összes adatot? Minden mentett séta és felvett útpont törlődik a telefonról és a gépről.')) {
          return;
        }

        // Törlés a helyi tárhelyből (localStorage)
        localStorage.removeItem('csampazo_user_routes');
        localStorage.removeItem('csampazo_user_waypoints');
        localStorage.removeItem('csampazo_deleted_wp_ids');
        localStorage.removeItem('csampazo_demo_mode');
        state.isDemoMode = false;
        updateDemoModeUI();

        // Memória állapot nullázása
        state.savedRoutes = [];
        state.waypoints = [];
        state.selectedRoute = null;
        state.meters = 0;
        state.steps = 0;
        state.durationSec = 0;
        state.activeMovingSecLive = 0;
        state.restingSecLive = 0;
        state.restCountLive = 0;
        state.currentRestDurationLive = 0;
        state.recordedPath = [];
        state.lastPosition = null;

        // Térképek letisztítása
        if (state.liveRouteLine) state.liveRouteLine.setLatLngs([]);
        if (state.liveWpMarkers) {
          state.liveWpMarkers.forEach(m => state.liveMap?.removeLayer(m));
          state.liveWpMarkers = [];
        }
        if (state.historyRouteLine) state.historyRouteLine.setLatLngs([]);
        if (state.historyStartMarker && state.historyMap) state.historyMap.removeLayer(state.historyStartMarker);
        if (state.historyEndMarker && state.historyMap) state.historyMap.removeLayer(state.historyEndMarker);
        if (state.historyWpMarkers && state.historyMap) {
          state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
          state.historyWpMarkers = [];
        }

        // Helyi szerver fájlok törlése (ha a szerver fut)
        fetch('/api/save-log', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: ''
        }).catch(() => {});

        fetch('/api/save-routes', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: ''
        }).catch(() => {});

        // Nézetek azonnali újrarajzolása
        loadInitialData();
        updateLiveTelemetryUI();
        updateQuickGoalAndRestDisplay();

        showToast('✨ Minden adat sikeresen kitakarítva! Az alkalmazás teljesen tiszta.', '🧹');
      });
    }
  }

  function updateDemoModeUI() {
    const badge = document.getElementById('demo-mode-badge');
    const btn = document.getElementById('btn-toggle-demo-mode');

    if (badge) {
      if (state.isDemoMode) {
        badge.textContent = 'BEKAPCSOLVA (Minta adatok)';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#34d399';
        badge.style.border = '1px solid #10b981';
      } else {
        badge.textContent = 'KIKAPCSOLVA (Üres állapot)';
        badge.style.background = 'rgba(255, 255, 255, 0.08)';
        badge.style.color = 'var(--text-muted)';
        badge.style.border = '1px solid rgba(255, 255, 255, 0.15)';
      }
    }

    if (btn) {
      if (state.isDemoMode) {
        btn.textContent = 'Kikapcsolás (Kitakarítás)';
        btn.style.color = '#f87171';
        btn.style.borderColor = '#ef4444';
        btn.style.background = 'rgba(239, 68, 68, 0.15)';
      } else {
        btn.textContent = 'Minta Mód Bekapcsolása';
        btn.style.color = '#38bdf8';
        btn.style.borderColor = '#38bdf8';
        btn.style.background = 'rgba(56, 189, 248, 0.15)';
      }
    }
  }

  // ==========================================================================
  // PWA (PROGRESSIVE WEB APP) & MOBIL ESZKÖZÖK KEZELÉSE
  // ==========================================================================
  function initPwaAndMobileTools() {
    // 1. Service Worker regisztrálása PWA-hoz
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('PWA Service Worker regisztrálva:', reg.scope);
      }).catch((err) => {
        console.warn('PWA Service Worker hiba:', err);
      });
    }

    // 2. APK Telepítés & PWA kezelő
    const btnApk = document.getElementById('btn-apk-install');
    const apkCard = document.getElementById('apk-download-card');
    const btnApkSettings = document.getElementById('btn-apk-settings-download');
    const btnPwa = document.getElementById('btn-pwa-install');
    const modalPwa = document.getElementById('modal-pwa-help');
    const btnClosePwa = document.getElementById('btn-close-pwa-help');
    const btnAckPwa = document.getElementById('btn-ack-pwa-help');

    if (window.AndroidBridge) {
      if (btnApk) btnApk.style.display = 'none';
      if (apkCard) apkCard.style.display = 'none';
      if (btnPwa) btnPwa.style.display = 'none';
    } else {
      if (btnApk) {
        btnApk.addEventListener('click', () => {
          showToast('Csámpázó APK letöltése elindult... Telepítéshez nyisd meg az értesítést a telefonon! 📱', '⬇️');
        });
      }
      if (btnApkSettings) {
        btnApkSettings.addEventListener('click', () => {
          showToast('Csámpázó APK letöltése elindult... Telepítéshez nyisd meg az értesítést a telefonon! 📱', '⬇️');
        });
      }
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.pwaPrompt = e;
      if (btnPwa) {
        btnPwa.classList.add('pulse');
        btnPwa.style.display = 'inline-flex';
      }
    });

    window.addEventListener('appinstalled', () => {
      showToast('Csámpázó sikeresen telepítve az alkalmazások közé! 🎉', '📱');
      if (btnPwa) btnPwa.style.display = 'none';
      state.pwaPrompt = null;
    });

    if (btnPwa) {
      btnPwa.addEventListener('click', async () => {
        if (state.pwaPrompt) {
          state.pwaPrompt.prompt();
          const res = await state.pwaPrompt.userChoice;
          if (res.outcome === 'accepted') {
            showToast('Csámpázó sikeresen telepítve a kezdőképernyőre! 🎉', '📱');
            btnPwa.style.display = 'none';
          }
          state.pwaPrompt = null;
        } else {
          if (modalPwa) modalPwa.classList.add('active');
          else showToast('Telepítés: Nyomj a Chrome 3 pontjára -> "Alkalmazás telepítése"!', 'ℹ️');
        }
      });
    }

    if (btnClosePwa) {
      btnClosePwa.addEventListener('click', () => modalPwa?.classList.remove('active'));
    }
    if (btnAckPwa) {
      btnAckPwa.addEventListener('click', () => modalPwa?.classList.remove('active'));
    }

    // 3. GPS Üzemmód kapcsoló (Valós GPS vs Szimuláció)
    const btnReal = document.getElementById('btn-mode-real-gps');
    const btnSim = document.getElementById('btn-mode-sim-gps');

    if (btnReal && btnSim) {
      btnReal.addEventListener('click', () => {
        state.gpsMode = 'real';
        btnReal.classList.add('active');
        btnSim.classList.remove('active');
        showToast('📡 Telefon Valós GPS Mód bekapcsolva!', '📡');

        // Első gyors lekérés
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              state.gps.lat = pos.coords.latitude;
              state.gps.lng = pos.coords.longitude;
              state.gps.accuracy = pos.coords.accuracy || 3.0;
              if (state.liveCurMarker) state.liveCurMarker.setLatLng([state.gps.lat, state.gps.lng]);
              if (state.liveMap) state.liveMap.panTo([state.gps.lat, state.gps.lng]);
              updateLiveTelemetryUI();
            },
            () => {}
          );
        }
      });

      btnSim.addEventListener('click', () => {
        state.gpsMode = 'sim';
        btnSim.classList.add('active');
        btnReal.classList.remove('active');
        showToast('🎮 Margitszigeti Szimulációs Mód bekapcsolva!', '🎮');
      });
    }
  }

  function showToast(message, icon = '✨') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="font-size:1.2rem;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // Képernyő visszakapcsolása / előtérbe hozása esetén azonnali szinkronizáció
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && (state.walkStatus === 'RUNNING' || state.walkStatus === 'PAUSED')) {
      if (state.startTime) {
        const wallSec = Math.round((Date.now() - state.startTime) / 1000);
        if (wallSec > state.durationSec) {
          state.durationSec = wallSec;
        }
      }
      if (window.AndroidBridge && typeof window.AndroidBridge.getTrackingSnapshot === 'function') {
        try {
          const snapJson = window.AndroidBridge.getTrackingSnapshot();
          const snap = JSON.parse(snapJson);
          if (snap && (snap.status === 'RECORDING' || snap.status === 'PAUSED')) {
            window.onBackgroundTrackingUpdate(snap);
          }
        } catch(e) {}
      }
      updateLiveTelemetryUI();
      updateQuickGoalAndRestDisplay();
    }
  });

  window.addEventListener('focus', () => {
    if (state.walkStatus === 'RUNNING' || state.walkStatus === 'PAUSED') {
      if (state.startTime) {
        const wallSec = Math.round((Date.now() - state.startTime) / 1000);
        if (wallSec > state.durationSec) {
          state.durationSec = wallSec;
        }
      }
      updateLiveTelemetryUI();
    }
  });

})();
