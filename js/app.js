// ==========================================================================
// CSÁMPÁZÓ - SM SÉTAKÖVETŐ & REHABILITÁCIÓS RENDSZER (app.js)
// Másodperc alapú mérés, 2-rétegű térkép, testreszabható cél/pihenőidő,
// szintlépéses mérföldkő rendszer és visszanézhető esemény-idővonal
// ==========================================================================

(function () {
  'use strict';

  // Alapértelmezett képernyő-sorrend
  const defaultScreenOrder = [
    { id: 'screen-live', name: 'Élő Séta', icon: '🚶' },
    { id: 'screen-history', name: 'Térkép & Naptár', icon: '🗺️' },
    { id: 'screen-summary', name: 'Útvonal Összesítés', icon: '📊' },
    { id: 'screen-progress', name: 'Fejlődés & Szintek', icon: '📈' },
    { id: 'screen-waypoints', name: 'Útpont Kezelés', icon: '📍' },
    { id: 'screen-settings', name: 'Beállítások & Adatok', icon: '⚙️' }
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
      stickMode: 'START_WITHOUT' // 'START_WITHOUT' | 'START_WITH' | 'ALWAYS'
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

    // GPS és Mobil PWA állapot
    gpsMode: 'real', // 'real' (telefon valós hardveres GPS) | 'sim' (Margitsziget szimuláció)
    geoWatchId: null,
    wakeLockSentinel: null,
    pwaPrompt: null,
    recordedPath: [],
    lastPosition: null,
    gps: {
      lat: 47.525750,
      lng: 19.051680,
      accuracy: 2.4, // méter
      satellites: 14,
      speed: 0,
      address: 'Margitszigeti Sétány 12.'
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
  document.addEventListener('DOMContentLoaded', () => {
    loadPersistedData();
    initClockAndDate();
    initScreenNavigation();
    initTwoLayerMaps();
    initLiveButtons();
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
  });

  // ==========================================================================
  // 1. ADATOK BETÖLTÉSE (LOCALSTORAGE)
  // ==========================================================================
  function loadPersistedData() {
    try {
      // 1. Képernyő sorrend
      const savedOrder = localStorage.getItem('csampazo_screen_order');
      if (savedOrder) {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length === defaultScreenOrder.length) {
          state.screenOrder = parsed;
        }
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

    if (screenId === 'screen-history' && state.historyMap) {
      setTimeout(() => {
        state.historyMap.invalidateSize();
        if (state.selectedRoute) drawRouteOnHistoryMap(state.selectedRoute);
      }, 100);
    } else if (screenId === 'screen-live' && state.liveMap) {
      setTimeout(() => state.liveMap.invalidateSize(), 100);
    } else if (screenId === 'screen-waypoints') {
      renderWaypointManagementList();
    } else if (screenId === 'screen-progress') {
      renderLevelProgression();
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
    localStorage.setItem('csampazo_screen_order', JSON.stringify(state.screenOrder));
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
      // 1. UTCANÉZET: Esri World Street Map (hivatalos, stabil, megbízható utcanézet, nem dob 'API KEY REQUIRED' vízjelet, mint a CartoDB)
      street: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap'
      }),
      // 2. MŰHOLDKÉP: Esri World Imagery (valós nagyfelbontású műholdfelvétel fákkal, padokkal)
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
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
        maxZoom: 19
      }).setView([state.gps.lat, state.gps.lng], 18);

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
          state.liveMap.setView([state.gps.lat, state.gps.lng], 18);
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
        maxZoom: 19
      }).setView([47.5258, 19.0518], 18);

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
          if (state.selectedRoute && state.historyRouteLine && state.historyRouteLine.getLatLngs().length > 0) {
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

    if (setGoalVal) setGoalVal.value = state.settings.targetGoalVal;
    if (setGoalType) setGoalType.value = state.settings.targetGoalType;
    if (setRestSec) setRestSec.value = state.settings.restThresholdSec;
    if (setStickMode) setStickMode.value = state.settings.stickMode || 'START_WITHOUT';
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
    // Aktuális mérési alap: kiválasztott séta vagy élő mérés (demo módban minta érték)
    const fallbackMeters = state.isDemoMode ? 410 : 0;
    const fallbackSteps = state.isDemoMode ? 620 : 0;
    const currentMeters = state.selectedRoute 
      ? state.selectedRoute.meters 
      : (state.meters > 0 ? state.meters : fallbackMeters);
    const currentSteps = state.selectedRoute 
      ? state.selectedRoute.steps 
      : (state.steps > 0 ? state.steps : fallbackSteps);

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
        <strong style="color:var(--accent-gold); font-size:0.95rem;">${lvl.level}. Szint</strong>
        <input type="text" class="lvl-edit-name" value="${lvl.name}" placeholder="Szint neve">
        <select class="lvl-edit-metric">
          <option value="meters" ${lvl.metric === 'meters' ? 'selected' : ''}>Méter (m)</option>
          <option value="steps" ${lvl.metric === 'steps' ? 'selected' : ''}>Lépés</option>
        </select>
        <input type="number" class="lvl-edit-target" min="10" step="10" value="${lvl.target}" placeholder="Cél">
        <button type="button" class="btn-remove-level" data-index="${index}" title="Szint törlése">✕</button>
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
        if (state.isUsingStick) {
          showToast('🦯 Bot használat bekapcsolva!', '🦯');
        } else {
          showToast('🚶 Bot használat kikapcsolva!', '🚶');
        }
      });
    }
    updateStickButtonUI();
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

  // --- Valós telefonos GPS indítása ---
  function startRealGpsTracking() {
    if (!navigator.geolocation) {
      showToast('A böngésző nem támogatja a GPS helymeghatározást!', '❌');
      return;
    }

    state.lastPosition = null;
    state.geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 3.0;
        const speedKmh = pos.coords.speed !== null && !isNaN(pos.coords.speed) ? (pos.coords.speed * 3.6).toFixed(1) : 0;

        state.gps.lat = lat;
        state.gps.lng = lng;
        state.gps.accuracy = acc;
        state.gps.speed = speedKmh;

        // Frissítjük a térkép jelölőt és pozíciót
        if (state.liveCurMarker) state.liveCurMarker.setLatLng([lat, lng]);
        if (state.liveMap) state.liveMap.panTo([lat, lng]);

        const accBadge = document.getElementById('gps-acc-badge');
        if (accBadge) accBadge.textContent = `(±${acc.toFixed(1)} m)`;

        const dot = document.getElementById('gps-dot');
        const title = document.getElementById('gps-title');
        if (dot) dot.classList.add('active');
        if (title) title.textContent = 'GPS: Valós (Aktív)';

        // Ha a séta épp aktívan fut (nem szünetel)
        if (state.walkStatus === 'RUNNING') {
          if (state.lastPosition) {
            const deltaMeters = calcHaversineMeters(state.lastPosition.lat, state.lastPosition.lng, lat, lng);
            // SM finomhangolás: 0.5 métertől 40 méterig adja hozzá, ha megbízható a pontosság
            if (deltaMeters >= 0.5 && deltaMeters < 40 && acc <= 35) {
              state.meters += deltaMeters;
              if (state.isUsingStick) {
                state.stickMeters += deltaMeters;
              } else {
                state.noStickMeters += deltaMeters;
              }
              const stepLenM = (state.settings.stepLengthCm || 65) / 100;
              state.steps = Math.round(state.meters / stepLenM);
              state.recordedPath.push([lat, lng]);

              if (state.liveRouteLine) state.liveRouteLine.setLatLngs(state.recordedPath);
            }
          } else {
            state.recordedPath.push([lat, lng]);
            if (state.liveRouteLine) state.liveRouteLine.setLatLngs(state.recordedPath);
          }
          state.lastPosition = { lat, lng };
        }

        updateLiveTelemetryUI();
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
      },
      (err) => {
        console.warn('GPS hiba:', err);
        const title = document.getElementById('gps-title');
        if (title) title.textContent = 'GPS: Keresés...';
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

  function startWalk() {
    state.walkStatus = 'RUNNING';
    state.startTime = Date.now();
    state.durationSec = 0;
    state.activeMovingSecLive = 0;
    state.restingSecLive = 0;
    state.meters = 0;
    state.steps = 0;

    // Bot állapot inicializálása az alapértelmezett mód szerint
    if (state.settings.stickMode === 'ALWAYS' || state.settings.stickMode === 'START_WITH') {
      state.isUsingStick = true;
    }
    state.stickMeters = 0;
    state.noStickMeters = 0;

    state.restCountLive = 0;
    state.currentRestDurationLive = 0;
    state.recordedPath = [];
    state.lastPosition = null;
    document.body.classList.remove('state-paused');

    requestScreenWakeLock();

    if (state.gpsMode === 'real') {
      showToast('Séta elindult! Valós hardveres GPS mérés aktív.', '▶');
      startRealGpsTracking();
    } else {
      showToast('Séta elindult! Margitszigeti szimulációs teszt aktív.', '▶');
    }

    updateLiveTelemetryUI();
    updateQuickGoalAndRestDisplay();

    let coordIndex = 0;
    const simRecordedPoints = [[state.gps.lat, state.gps.lng]];

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (state.walkStatus === 'RUNNING') {
        state.durationSec++;
        state.activeMovingSecLive++;

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
        // Pause alatt másodpercenként nő a pihenőidő
        state.durationSec++;
        state.restingSecLive++;
        state.currentRestDurationLive++;

        // Ha a szünet eléri a beállított küszöböt (pl. 60 mp), pihenőként könyvelődik el
        if (state.currentRestDurationLive === state.settings.restThresholdSec) {
          state.restCountLive++;
          showToast(`⚠️ Hivatalos SM Pihenő rögzítve! (Elérted a ${state.settings.restThresholdSec} másodpercet)`, '🪑');
        }

        updateLiveTelemetryUI();
      }
    }, 1000);
  }

  function pauseWalk() {
    state.walkStatus = 'PAUSED';
    state.currentRestDurationLive = 0;
    document.body.classList.add('state-paused');
    updateLiveTelemetryUI();
    showToast(`⏸️ Séta szüneteltetve (Pause aktív). Küszöb: ${state.settings.restThresholdSec} mp állás = 1 pihenő!`, '⏸');
  }

  function resumeWalk() {
    state.walkStatus = 'RUNNING';
    document.body.classList.remove('state-paused');
    requestScreenWakeLock();
    updateLiveTelemetryUI();
    showToast('Séta folytatódik!', '▶');
  }

  function stopWalk() {
    state.walkStatus = 'STOPPED';
    clearInterval(state.timerInterval);
    stopRealGpsTracking();
    releaseScreenWakeLock();
    document.body.classList.remove('state-paused');

    const roundedMeters = Math.round(state.meters);
    const m = String(Math.floor(state.durationSec / 60)).padStart(2, '0');
    const s = String(state.durationSec % 60).padStart(2, '0');
    const timeStr = `${m}:${s}`;

    updateLiveTelemetryUI();

    const today = new Date().toISOString().split('T')[0];
    const totalSec = state.durationSec || 190;
    const restSec = state.restingSecLive || 75;
    const activeSec = Math.max(1, totalSec - restSec);
    const restCount = state.restCountLive > 0 ? state.restCountLive : 1;
    const pathData = state.recordedPath && state.recordedPath.length > 1 ? [...state.recordedPath] : [...trackCoords];

    const newRoute = {
      id: 'route_' + Date.now(),
      title: `Élő séta (${today})`,
      date: today,
      time: new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }),
      meters: roundedMeters || 110,
      stickMeters: Math.round(state.stickMeters),
      noStickMeters: Math.round(state.noStickMeters),
      stickUsed: state.stickMeters > 0,
      steps: state.steps || 158,
      durationStr: `${timeStr} (${totalSec} mp)`,
      durationSec: totalSec,
      activeSec: activeSec,
      restSec: restSec,
      avgSpeed: '2.1 km/h',
      restCount: restCount,
      restDurationStr: `${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`,
      elevationGain: '+2 m',
      elevationLoss: '-1 m',
      cadence: '50 lépés/p',
      activeDurationStr: `${activeSec} mp (${Math.floor(activeSec / 60)}p ${activeSec % 60}mp)`,
      waypointsCount: state.waypoints.length,
      note: `Másodperc alapon rögzített séta. Összesen ${totalSec} mp, ebből ${restSec} mp pihenő.` +
            (state.stickMeters > 0 ? ` 🦯 Bottal: ${Math.round(state.stickMeters)} m, nélküle: ${Math.round(state.noStickMeters)} m.` : ' 🚶 Végig bot nélkül.'),
      tags: ['#mai_séta', '#másodperc_alapú'],
      path: pathData,
      // Másodperc alapú eseménylista a visszanézéshez
      timelineEvents: [
        { time: `0 – ${Math.round(activeSec * 0.4)} mp`, desc: '🚶 Rajt és séta a sétányon', duration: `${Math.round(activeSec * 0.4)} mp (aktív)`, isRest: false },
        { time: `${Math.round(activeSec * 0.4)} – ${Math.round(activeSec * 0.4) + restSec} mp`, desc: `🪑 Pihenő a padnál (küszöb: ${state.settings.restThresholdSec} mp felett)`, duration: `${restSec} mp (pihenő)`, isRest: true },
        { time: `${Math.round(activeSec * 0.4) + restSec} – ${totalSec} mp`, desc: '🏁 Séta befejezése a célhoz', duration: `${Math.round(activeSec * 0.6)} mp (aktív)`, isRest: false }
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

    const logLine = `${today} | ${state.steps} | ${roundedMeters} m | ${timeStr} (${totalSec}mp) | SM Séta | ${restCount} pihenő (${restSec}mp) | #csampazo #seta | ${newRoute.note}`;
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
      } else if (state.walkStatus === 'PAUSED') {
        stateBadge.textContent = '⏸️ Szünet (Pause)';
        stateBadge.classList.add('paused');
      } else if (state.walkStatus === 'STOPPED') {
        stateBadge.textContent = '⏹️ Befejezve';
      } else {
        stateBadge.textContent = 'Készenlét';
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

    if (!route) {
      if (titleEl) titleEl.textContent = 'Még nincs mentett séta';
      if (metaEl) metaEl.textContent = 'Kezdj egy új sétát a Főoldalon, vagy kapcsold be a Demo Módot a Beállításokban!';
      if (distEl) distEl.textContent = '0 m';
      if (stepsEl) stepsEl.textContent = '0 lépés';
      if (speedEl) speedEl.textContent = '—';
      if (restsEl) restsEl.textContent = '0 pihenő';
      if (restDurEl) restDurEl.textContent = 'Pihenőidő összesen: 0 mp';
      if (elevEl) elevEl.textContent = '0 m';
      if (descEl) descEl.textContent = '0 m';

      if (extraTotalTime) extraTotalTime.textContent = '0 mp (00:00)';
      if (extraActiveTime) extraActiveTime.textContent = '0 mp (00:00)';
      if (extraRestTime) extraRestTime.textContent = '0 mp (00:00)';
      if (extraCadence) extraCadence.textContent = '—';

      const badgeEl = document.getElementById('sec-timeline-total-badge');
      const segmentsBar = document.getElementById('sec-timeline-segments-bar');
      const eventsList = document.getElementById('sec-events-list');
      if (badgeEl) badgeEl.textContent = 'Összesen: 0 másodperc';
      if (segmentsBar) segmentsBar.innerHTML = '<div style="width:100%;text-align:center;color:var(--text-muted);font-size:0.8rem;line-height:28px;">Nincs séta adat</div>';
      if (eventsList) eventsList.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--text-muted);">Még nincs rögzített séta esemény.</div>';
      return;
    }

    const totalSec = route.durationSec || 190;
    const restSec = route.restSec || 75;
    const activeSec = route.activeSec || Math.max(1, totalSec - restSec);

    if (titleEl) titleEl.textContent = route.title;
    if (metaEl) metaEl.textContent = `${route.date} • ${route.time || ''} • Részletes másodperc alapú kimutatás`;
    if (distEl) distEl.textContent = `${route.meters} m`;
    if (stepsEl) stepsEl.textContent = `${route.steps} lépés`;
    if (speedEl) speedEl.textContent = route.avgSpeed || '2.1 km/h';
    if (restsEl) restsEl.textContent = `${route.restCount} pihenő`;
    if (restDurEl) restDurEl.textContent = `Pihenőidő összesen: ${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`;
    if (elevEl) elevEl.textContent = route.elevationGain || '+2 m';
    if (descEl) descEl.textContent = route.elevationLoss || '-1 m';

    if (extraTotalTime) extraTotalTime.textContent = `${totalSec} mp (${route.durationStr ? route.durationStr.split(' ')[0] : '03:10'})`;
    if (extraActiveTime) extraActiveTime.textContent = `${activeSec} mp (${Math.floor(activeSec / 60)}p ${activeSec % 60}mp)`;
    if (extraRestTime) extraRestTime.textContent = `${restSec} mp (${Math.floor(restSec / 60)}p ${restSec % 60}mp)`;
    if (extraCadence) extraCadence.textContent = route.cadence || '50 lépés/p';

    // MÁSODPERC ALAPÚ ESEMÉNY-IDŐVONAL VISSZANÉZÉSE
    renderSecondsTimeline(route, totalSec, activeSec, restSec);
  }

  function renderSecondsTimeline(route, totalSec, activeSec, restSec) {
    const badgeEl = document.getElementById('sec-timeline-total-badge');
    const segmentsBar = document.getElementById('sec-timeline-segments-bar');
    const eventsList = document.getElementById('sec-events-list');

    if (badgeEl) badgeEl.textContent = `Összesen: ${totalSec} másodperc`;

    // Százalékos sávok
    const walk1Pct = Math.round((activeSec * 0.4 / totalSec) * 100);
    const restPct = Math.round((restSec / totalSec) * 100);
    const walk2Pct = Math.max(5, 100 - walk1Pct - restPct);

    if (segmentsBar) {
      segmentsBar.innerHTML = `
        <div class="sec-seg-walk" style="width: ${walk1Pct}%;" title="Séta: ${Math.round(activeSec * 0.4)} mp">${Math.round(activeSec * 0.4)}s séta</div>
        <div class="sec-seg-rest" style="width: ${restPct}%;" title="Pihenő: ${restSec} mp (Pad)">${restSec}s pihenő 🪑</div>
        <div class="sec-seg-walk" style="width: ${walk2Pct}%;" title="Séta: ${Math.round(activeSec * 0.6)} mp">${Math.round(activeSec * 0.6)}s séta</div>
      `;
    }

    // Eseménylista
    if (eventsList) {
      const events = route.timelineEvents || [
        { time: `0 – ${Math.round(activeSec * 0.4)} mp`, desc: '🚶 Rajt és folyamatos séta', duration: `${Math.round(activeSec * 0.4)} mp (aktív)`, isRest: false },
        { time: `${Math.round(activeSec * 0.4)} – ${Math.round(activeSec * 0.4) + restSec} mp`, desc: `🪑 Pihenő a padnál (küszöb: ${state.settings.restThresholdSec} mp érvényesült)`, duration: `${restSec} mp (pihenő)`, isRest: true },
        { time: `${Math.round(activeSec * 0.4) + restSec} – ${totalSec} mp`, desc: '🏁 Séta és célvonal beérés', duration: `${Math.round(activeSec * 0.6)} mp (aktív)`, isRest: false }
      ];

      eventsList.innerHTML = events.map(ev => `
        <div class="sec-event-row">
          <span class="sec-event-time">${ev.time}</span>
          <span class="sec-event-desc">${ev.desc}</span>
          <span class="sec-event-duration ${ev.isRest ? 'is-rest' : ''}">${ev.duration}</span>
        </div>
      `).join('');
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
              <span style="color:#fbbf24;">🪑 <strong>${r.restCount} pihenő (${r.restSec || 75} mp)</strong></span>
            </div>
            <div class="w-item-notes">${r.note || ''}</div>
          </div>

          <div class="w-item-actions-col">
            <div class="w-item-select-btn">
              ${isSelected ? '✅ Megjelenítve' : 'Térképre ➔'}
            </div>
            <button type="button" class="w-item-delete-btn btn-delete-single-route" data-id="${r.id}" title="Séta törlése">
              <span>🗑️</span> <span>Törlés</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.btn-delete-single-route').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        deleteRouteById(id);
      });
    });

    listEl.querySelectorAll('.walk-timeline-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-single-route')) return;
        const id = e.currentTarget.dataset.id;
        const target = state.savedRoutes.find(r => r.id === id);
        if (target) {
          selectRoute(target);
          showToast(`"${target.title}" kiválasztva és kirajzolva a térképen!`, '🗺️');
        }
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
        content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 190} mp (${r.durationStr}) | SM Séta | ${r.restCount} pihenő (${r.restSec || 75} mp) | ${(r.tags || []).join(' ')} | ${r.note}\n`;
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
    state.selectedRoute = route;
    renderSavedRoutesTimeline();
    drawRouteOnHistoryMap(route);
    updateSummaryScreen(route);

    const titleEl = document.getElementById('history-map-title');
    if (titleEl) titleEl.textContent = `${route.title} (${route.meters} m, ${route.durationSec || 190} mp)`;
  }

  function drawRouteOnHistoryMap(route) {
    if (!state.historyMap || typeof L === 'undefined') return;

    if (state.historyStartMarker) state.historyMap.removeLayer(state.historyStartMarker);
    if (state.historyEndMarker) state.historyMap.removeLayer(state.historyEndMarker);
    state.historyWpMarkers.forEach(m => state.historyMap.removeLayer(m));
    state.historyWpMarkers = [];

    const coords = route.path && route.path.length > 0 ? route.path : trackCoords;
    state.historyRouteLine.setLatLngs(coords);

    const startPoint = coords[0];
    const endPoint = coords[coords.length - 1];

    const startIcon = L.divIcon({
      className: 'start-pin',
      html: '<div style="background:#10b981;color:#fff;font-weight:900;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 10px #10b981;">A</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    state.historyStartMarker = L.marker(startPoint, { icon: startIcon }).addTo(state.historyMap);
    state.historyStartMarker.bindPopup(`<b>Rajt:</b> ${route.title} (${route.time || ''})`);

    const endIcon = L.divIcon({
      className: 'end-pin',
      html: '<div style="background:#ef4444;color:#fff;font-weight:900;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 10px #ef4444;">B</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    state.historyEndMarker = L.marker(endPoint, { icon: endIcon }).addTo(state.historyMap);
    state.historyEndMarker.bindPopup(`<b>Cél:</b> Táv: ${route.meters} m, ${route.steps} lépés (${route.durationSec || 190} mp)`);

    state.waypoints.forEach(wp => {
      const wpIcon = L.divIcon({
        className: 'wp-history-pin',
        html: `<div style="background:#0284c7;color:#fff;font-size:11px;font-weight:bold;padding:2px 6px;border-radius:8px;border:1px solid #fff;white-space:nowrap;">📍 ${wp.name}</div>`,
        iconSize: [90, 20],
        iconAnchor: [45, 20]
      });
      const wpMarker = L.marker(wp.coords, { icon: wpIcon }).addTo(state.historyMap);
      state.historyWpMarkers.push(wpMarker);
    });

    state.historyMap.fitBounds(state.historyRouteLine.getBounds(), { padding: [50, 50] });
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
    const hasData = !!lastRoute || state.meters > 0 || state.isDemoMode;

    const lastMeters = lastRoute ? lastRoute.meters : (state.meters > 0 ? state.meters : (state.isDemoMode ? 110 : 0));
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

    container.innerHTML = items.map(wp => `
      <div class="wp-manage-row" data-id="${wp.id}">
        <button type="button" class="btn-star-fav ${wp.isFavorite ? 'is-fav' : ''}" data-id="${wp.id}" title="${wp.isFavorite ? 'Eltávolítás a kedvencek közül' : 'Megjelölés kedvencként'}">
          ${wp.isFavorite ? '⭐' : '☆'}
        </button>

        <div class="wp-row-info-col">
          <input type="text" class="wp-row-name-input" value="${wp.name}" data-id="${wp.id}" title="Kattints az átnevezéshez!">
          
          <div class="wp-row-meta-strip">
            <span>🏠 ${wp.address}</span>
            <span>🎯 ±${wp.accuracy} m</span>
            <span>🕒 ${wp.time}</span>
          </div>

          <div class="wp-card-tags-row" style="margin-top:0.25rem;">
            ${wp.tags.map(t => `<span class="wp-badge-tag">${t}</span>`).join('')}
            <button type="button" class="btn-add-tag-to-wp" data-id="${wp.id}" style="background:transparent; border:1px dashed var(--accent-cyan); color:var(--accent-cyan); font-size:0.75rem; border-radius:12px; padding:1px 6px; cursor:pointer;">+ Címke</button>
          </div>
        </div>

        <div class="wp-row-actions-group">
          <button type="button" class="btn-icon-action btn-mgmt-show-map" data-id="${wp.id}" title="Megtekintés a térképen">
            <span>🗺️</span> <span>Térkép</span>
          </button>
          <button type="button" class="btn-icon-action delete btn-mgmt-delete" data-id="${wp.id}" title="Útpont végleges törlése">
            <span>🗑️</span> <span>Törlés</span>
          </button>
        </div>
      </div>
    `).join('');

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
        if (wp && confirm(`Biztosan törölni szeretnéd a(z) "${wp.name}" útpontot?`)) {
          state.waypoints = state.waypoints.filter(w => w.id !== id);
          saveUserWaypointsToStorage();
          renderWaypointManagementList();
          render5kmWaypointsList();
          updateLiveTelemetryUI();
          showToast(`Útpont törölve: "${wp.name}"`, '🗑️');
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
          switchScreen('screen-history');
          if (state.historyMap) {
            state.historyMap.setView(wp.coords, 18);
            showToast(`Útpont a térképen: ${wp.name}`, '🎯');
          }
        }
      });
    });
  }

  function saveUserWaypointsToStorage() {
    try {
      const sampleIds = new Set(SAMPLE_WAYPOINTS.map(w => w.id));
      const userOnly = state.waypoints.filter(w => !sampleIds.has(w.id));
      localStorage.setItem('csampazo_user_waypoints', JSON.stringify(userOnly));
    } catch(e) {
      console.warn('Nem sikerült menteni a user waypoints-t', e);
    }
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

    // PONTOSÍTÁS
    if (btnRefine) {
      btnRefine.addEventListener('click', () => {
        const refineMsg = document.getElementById('refine-status-msg');
        const accDisplay = document.getElementById('wp-display-accuracy');
        const coordsDisplay = document.getElementById('wp-display-coords');

        btnRefine.classList.add('refining');
        if (refineMsg) {
          refineMsg.style.display = 'block';
          refineMsg.textContent = '📡 GPS mintavételezés és többpontos átlagolás folyamatban...';
        }

        setTimeout(() => {
          btnRefine.classList.remove('refining');
          state.gps.accuracy = Math.round((Math.random() * 0.4 + 1.0) * 10) / 10;

          if (accDisplay) accDisplay.textContent = `(pontosság: ±${state.gps.accuracy} m)`;
          if (coordsDisplay) coordsDisplay.textContent = `${state.gps.lat.toFixed(6)}° N, ${state.gps.lng.toFixed(6)}° E`;
          if (refineMsg) refineMsg.textContent = `✅ GPS pontosítva! Új pontosság: (±${state.gps.accuracy} m)`;

          showToast(`GPS pontosság: ±${state.gps.accuracy} méter`, '🎯');
        }, 1100);
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('input-wp-name');
        const name = (nameInput?.value || '').trim();
        if (!name) return;

        const newWp = {
          id: 'wp_' + Date.now(),
          name: name,
          isFavorite: false,
          tags: Array.from(state.selectedTags),
          coords: [state.gps.lat, state.gps.lng],
          address: state.gps.address,
          accuracy: state.gps.accuracy,
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

        addWaypointMarkerToLiveMap(newWp);
        render5kmWaypointsList();
        renderWaypointManagementList();
        updateLiveTelemetryUI();

        closeModal();
        showToast(`Útpont mentve: "${name}"`, '📍');
      });
    }
  }

  function openWaypointModal() {
    const modal = document.getElementById('modal-waypoint');
    const inputName = document.getElementById('input-wp-name');
    const coordsDisplay = document.getElementById('wp-display-coords');
    const addressDisplay = document.getElementById('wp-display-address');
    const accDisplay = document.getElementById('wp-display-accuracy');
    const refineMsg = document.getElementById('refine-status-msg');

    if (coordsDisplay) coordsDisplay.textContent = `${state.gps.lat.toFixed(6)}° N, ${state.gps.lng.toFixed(6)}° E`;
    if (addressDisplay) addressDisplay.textContent = state.gps.address;
    if (accDisplay) accDisplay.textContent = `(pontosság: ±${state.gps.accuracy} m)`;
    if (refineMsg) refineMsg.style.display = 'none';
    if (inputName) inputName.value = '';

    if (modal) {
      modal.classList.add('active');
      setTimeout(() => inputName?.focus(), 80);
    }
  }

  function addWaypointMarkerToLiveMap(wp) {
    if (!state.liveMap || typeof L === 'undefined') return;

    let iconSymbol = '📍';
    if (wp.tags.includes('Pad')) iconSymbol = '🪑';
    else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
    else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';

    const customPin = L.divIcon({
      className: 'wp-leaflet-pin',
      html: `
        <div style="background:#0284c7;color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;box-shadow:0 3px 10px rgba(0,0,0,0.5);border:2px solid #fff;white-space:nowrap;display:flex;align-items:center;gap:4px;">
          <span>${iconSymbol}</span> <span>${wp.name}</span>
        </div>
      `,
      iconSize: [110, 26],
      iconAnchor: [55, 26]
    });

    const marker = L.marker(wp.coords, { icon: customPin }).addTo(state.liveMap);
    marker.bindPopup(`
      <div style="font-size:13px; font-weight:700;">${wp.name}</div>
      <div style="font-size:11px; color:#64748b;">🏠 ${wp.address}</div>
      <div style="font-size:11px; color:#0284c7;">🎯 Pontosság: ±${wp.accuracy} m (${wp.time})</div>
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
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">Kattints a fenti nagy <strong>📍 Útpont</strong> gombra egy új pad vagy hely rögzítéséhez, vagy kapcsold be a <strong>Demo Módot</strong> a Beállításokban!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(wp => {
      let iconSymbol = '📍';
      if (wp.tags.includes('Pad')) iconSymbol = '🪑';
      else if (wp.tags.includes('Ivókút')) iconSymbol = '💧';
      else if (wp.tags.includes('Akadálymentes')) iconSymbol = '♿';

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
          state.liveMap.setView(target.coords, 18);
          const mapSec = document.querySelector('.map-section-card');
          if (mapSec) mapSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          showToast(`Középpont: ${target.name}`, '🎯');
        }
      });
    });
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
        content += `# Formátum: DÁTUM | LÉPÉSSZÁM | TÁV (m) | IDŐ (másodperc) | TÍPUS | PIHENŐK (másodperc) | CÍMKÉK | JEGYZET\n`;
        content += `# ========================================================\n`;

        state.savedRoutes.forEach(r => {
          content += `${r.date} | ${r.steps} | ${r.meters} m | ${r.durationSec || 190} mp (${r.durationStr}) | SM Séta | ${r.restCount} pihenő (${r.restSec || 75} mp) | ${(r.tags || []).join(' ')} | ${r.note}\n`;
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
          parseAndImportTxtLog(event.target.result);
          fileInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    // GPX Export
    const btnExportGpx = document.getElementById('btn-export-gpx');
    if (btnExportGpx) {
      btnExportGpx.addEventListener('click', () => {
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        gpx += `<gpx version="1.1" creator="Csampazo SM Tracker" xmlns="http://www.topografix.com/GPX/1/1">\n`;
        gpx += `  <metadata><name>Csampazo Utak</name><time>${new Date().toISOString()}</time></metadata>\n`;

        state.waypoints.forEach(wp => {
          gpx += `  <wpt lat="${wp.coords[0]}" lon="${wp.coords[1]}">\n`;
          gpx += `    <name>${escapeXml(wp.name)}</name>\n`;
          gpx += `    <desc>${escapeXml(wp.address)}</desc>\n`;
          gpx += `  </wpt>\n`;
        });

        if (state.selectedRoute) {
          gpx += `  <trk>\n    <name>${escapeXml(state.selectedRoute.title)}</name>\n    <trkseg>\n`;
          const coords = state.selectedRoute.path || trackCoords;
          coords.forEach(pt => {
            gpx += `      <trkpt lat="${pt[0]}" lon="${pt[1]}"></trkpt>\n`;
          });
          gpx += `    </trkseg>\n  </trk>\n`;
        }

        gpx += `</gpx>\n`;
        downloadFile(gpx, 'csampazo_utak.gpx', 'application/gpx+xml');
        showToast('csampazo_utak.gpx letöltve!', '🌐');
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
        const stepLength = parseInt(document.getElementById('set-step-length')?.value, 10);
        const pauseMode = document.getElementById('set-pause-blink')?.value;
        const stickMode = document.getElementById('set-stick-mode')?.value || 'START_WITHOUT';

        state.settings = {
          restThresholdSec: restThreshold > 0 ? restThreshold : 60,
          targetGoalVal: goalVal > 0 ? goalVal : 500,
          targetGoalType: goalType || 'meters',
          stepLengthCm: stepLength || 65,
          pauseBlinkMode: pauseMode || 'pulse',
          stickMode: stickMode
        };

        if (state.walkStatus === 'IDLE' || state.walkStatus === 'STOPPED') {
          state.isUsingStick = (stickMode === 'ALWAYS' || stickMode === 'START_WITH');
          updateStickButtonUI();
        }

        localStorage.setItem('csampazo_settings', JSON.stringify(state.settings));
        updateQuickGoalAndRestDisplay();
        checkLevelProgression();
        showToast('Beállítások elmentve!', '💾');
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
          parseAndImportTxtLog(event.target.result);
          showToast(`✅ "${file.name}" sikeresen betöltve a számítógépre!`, '📂');
          fileInputLocal.value = '';
        };
        reader.readAsText(file);
      });
    }
  }

  function parseAndImportTxtLog(content) {
    const lines = content.split('\n');
    let importedCount = 0;

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
          state.savedRoutes.push({
            id: 'imp_' + Math.random().toString(36).substr(2, 9),
            title: title,
            date: date,
            time: '10:30',
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
          });
          importedCount++;
        }
      }
    });

    renderSavedRoutesTimeline();
    renderWeeklyCalendar();
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
  // 14. MINTA ADATOK & DEMO MÓD KEZELÉSE (ALAPBÓL ÜRES!)
  // ==========================================================================
  const SAMPLE_WAYPOINTS = [
    {
      id: 'wp_sample_1',
      name: 'Pad a platán árnyékában',
      isFavorite: true,
      tags: ['Pad', 'Árnyék', 'Pihenőhely'],
      coords: [47.52575, 19.05168],
      address: 'Margitszigeti Sétány 12.',
      accuracy: 2.1,
      time: '11:15'
    },
    {
      id: 'wp_sample_2',
      name: 'Akadálymentes ivókút',
      isFavorite: true,
      tags: ['Ivókút', 'Akadálymentes'],
      coords: [47.52620, 19.05200],
      address: 'Margitszigeti Sétány 16.',
      accuracy: 1.8,
      time: '11:18'
    },
    {
      id: 'wp_sample_3',
      name: 'Rózsakerti fedett pihenőpad',
      isFavorite: false,
      tags: ['Pad', 'Rózsakert', 'Árnyék'],
      coords: [47.52710, 19.05260],
      address: 'Margitszigeti Rózsakert 2.',
      accuracy: 2.3,
      time: '11:22'
    },
    {
      id: 'wp_sample_4',
      name: 'Szökőkút akadálymentes rámpa',
      isFavorite: false,
      tags: ['Akadálymentes', 'Pihenőhely'],
      coords: [47.53050, 19.05020],
      address: 'Margitszigeti Főtér 1.',
      accuracy: 2.0,
      time: '11:26'
    },
    {
      id: 'wp_sample_5',
      name: 'Duna-parti árnyas padsor',
      isFavorite: false,
      tags: ['Pad', 'Árnyék'],
      coords: [47.52380, 19.04940],
      address: 'Duna Sétány 5.',
      accuracy: 2.5,
      time: '11:29'
    },
    {
      id: 'wp_sample_6',
      name: 'Szent István park kímélő bejárat',
      isFavorite: true,
      tags: ['Akadálymentes', 'Pad'],
      coords: [47.51920, 19.05310],
      address: 'Újpesti Rakpart 18.',
      accuracy: 1.9,
      time: '11:31'
    }
  ];

  const SAMPLE_ROUTES = [
    {
      id: 'r_07',
      title: '100m SM Alapteszt (Minta Séta)',
      date: '2026-10-12',
      time: '11:20',
      meters: 110,
      steps: 158,
      durationStr: '03:10',
      durationSec: 190,
      activeSec: 115,
      restSec: 75,
      avgSpeed: '2.1 km/h',
      restCount: 1,
      restDurationStr: '75 mp (01:15)',
      elevationGain: '+2 m',
      elevationLoss: '-1 m',
      cadence: '50 lépés/p',
      activeDurationStr: '115 mp (01:55)',
      waypointsCount: 2,
      note: 'Minta séta a bemutatóhoz. 190 másodperc összesen, 75 mp pihenő a padnál.',
      tags: ['#demo', '#100m_teszt'],
      path: [...trackCoords],
      timelineEvents: [
        { time: '0 – 45 mp', desc: '🚶 Rajt és folyamatos séta a Margitszigeti Sétányon', duration: '45 mp (aktív)', isRest: false },
        { time: '45 – 120 mp', desc: '🪑 Pihenő a platán alatti padnál (küszöb: 60 mp érvényesült)', duration: '75 mp (pihenő)', isRest: true },
        { time: '120 – 190 mp', desc: '🏁 Továbbindulás és beérkezés a célvonalhoz', duration: '70 mp (aktív)', isRest: false }
      ]
    },
    {
      id: 'r_06',
      title: 'Gyógytorna utáni levezető séta',
      date: '2026-10-11',
      time: '16:45',
      meters: 95,
      steps: 140,
      durationStr: '02:45',
      durationSec: 165,
      activeSec: 100,
      restSec: 65,
      avgSpeed: '2.0 km/h',
      restCount: 1,
      restDurationStr: '65 mp',
      elevationGain: '+1 m',
      elevationLoss: '0 m',
      cadence: '51 lépés/p',
      activeDurationStr: '100 mp',
      waypointsCount: 1,
      note: 'Gyógytorna utáni levezető séta, 165 másodperc, 65 mp megállás.',
      tags: ['#demo', '#levezető'],
      path: [
        [47.52550, 19.05150],
        [47.52560, 19.05158],
        [47.52570, 19.05165],
        [47.52580, 19.05175],
        [47.52590, 19.05185]
      ]
    },
    {
      id: 'r_05',
      title: 'Hétvégi Növelt Táv Rekord',
      date: '2026-10-10',
      time: '14:10',
      meters: 125,
      steps: 185,
      durationStr: '03:30',
      durationSec: 210,
      activeSec: 130,
      restSec: 80,
      avgSpeed: '2.1 km/h',
      restCount: 2,
      restDurationStr: '80 mp (2x megállás)',
      elevationGain: '+3 m',
      elevationLoss: '-2 m',
      cadence: '53 lépés/p',
      activeDurationStr: '130 mp',
      waypointsCount: 3,
      note: 'Új rekord: 125 méter! 210 másodperc, két pihenővel kényelmesen ment.',
      tags: ['#demo', '#rekord'],
      path: [
        [47.52540, 19.05140],
        [47.52555, 19.05152],
        [47.52570, 19.05165],
        [47.52585, 19.05178],
        [47.52600, 19.05190],
        [47.52615, 19.05202]
      ]
    }
  ];

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

    if (state.isDemoMode) {
      // Demo mód bekapcsolva: Minta adatok + felhasználói adatok
      state.waypoints = [...SAMPLE_WAYPOINTS, ...userWaypoints];
      state.savedRoutes = [...SAMPLE_ROUTES, ...userRoutes];
    } else {
      // Alapértelmezett: Tiszta, üres állapot (csak a felhasználó valós adatai!)
      state.waypoints = [...userWaypoints];
      state.savedRoutes = [...userRoutes];
    }

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

    // 2. PWA Telepítés gomb eseménykezelő
    const btnPwa = document.getElementById('btn-pwa-install');
    const modalPwa = document.getElementById('modal-pwa-help');
    const btnClosePwa = document.getElementById('btn-close-pwa-help');
    const btnAckPwa = document.getElementById('btn-ack-pwa-help');

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

})();
