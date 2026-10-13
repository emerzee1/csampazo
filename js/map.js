// Csámpázó - OpenStreetMap / Leaflet Map & SM Live Walk Simulator Module
(function (window) {
  'use strict';

  class SMWalkMapManager {
    constructor() {
      this.map = null;
      this.routeLine = null;
      this.startMarker = null;
      this.currentMarker = null;
      this.endMarker = null;
      this.restMarkers = [];
      this.activeWalk = null;
      this.timer = null;
      this.layers = {};
      this.currentLayerKey = 'cartoDark';

      // 100 méteres SM alapteszt kímélő útvonal Margitszigeti Rózsakertnél
      this.baseCoords = [
        [47.52550, 19.05150],
        [47.52556, 19.05154],
        [47.52562, 19.05159],
        [47.52569, 19.05163],
        [47.52575, 19.05168], // 45m - Pad (Pihenő)
        [47.52582, 19.05172],
        [47.52589, 19.05177],
        [47.52596, 19.05182],
        [47.52603, 19.05186],
        [47.52610, 19.05191]  // 100m - Cél
      ];
    }

    init(containerId = 'live-walk-map') {
      const container = document.getElementById(containerId);
      if (!container || this.map) return;

      if (typeof L === 'undefined') {
        console.error('Leaflet is not loaded');
        return;
      }

      this.map = L.map(containerId, {
        zoomControl: true,
        attributionControl: true
      }).setView([47.52575, 19.05168], 19);

      // Megbízható, blokkolásmentes, nagy sebességű csempeszolgáltatók (Fastly CDN & ESRI)
      this.layers.cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
      });

      this.layers.cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
      });

      this.layers.esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, OpenStreetMap'
      });

      this.layers.esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar'
      });

      // Alapértelmezett: Esri Utcanézet
      this.layers.esriStreet.addTo(this.map);
      this.currentLayerKey = 'esriStreet';

      // Rétegválasztó gomb jobb felül
      const baseMaps = {
        "🌙 Sötét kímélő": this.layers.cartoDark,
        "🗺️ Színes park": this.layers.cartoVoyager,
        "🛰️ Műhold (Padok)": this.layers.esriSat,
        "🏙️ Utcai térkép": this.layers.esriStreet
      };
      L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);

      this.routeLine = L.polyline([], {
        color: '#10b981',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Kezdeti minta útvonal kirajzolása
      this.drawRoutePreview(this.baseCoords);
    }

    cycleLayer() {
      if (!this.map) return 'cartoDark';
      const keys = ['cartoDark', 'cartoVoyager', 'esriSat', 'esriStreet'];
      const currentIndex = keys.indexOf(this.currentLayerKey);
      const nextKey = keys[(currentIndex + 1) % keys.length];

      if (this.layers[this.currentLayerKey]) {
        this.map.removeLayer(this.layers[this.currentLayerKey]);
      }
      if (this.layers[nextKey]) {
        this.layers[nextKey].addTo(this.map);
      }
      this.currentLayerKey = nextKey;
      return nextKey;
    }

    drawRoutePreview(coords) {
      if (!this.map) return;
      this.clearMapOverlays();

      this.routeLine.setLatLngs(coords);

      const startIcon = L.divIcon({
        className: 'custom-map-pin start-pin',
        html: '<div style="background:#10b981;color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid #fff;">🚩 Rajt (0 m)</div>',
        iconSize: [80, 24],
        iconAnchor: [40, 24]
      });
      this.startMarker = L.marker(coords[0], { icon: startIcon }).addTo(this.map);

      // 45m-es Pad / Pihenőhely jelölő
      const benchIcon = L.divIcon({
        className: 'custom-map-pin bench-pin',
        html: '<div style="background:#f59e0b;color:#070b14;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid #fff;">🪑 Pad (Pihenő)</div>',
        iconSize: [90, 24],
        iconAnchor: [45, 24]
      });
      const benchMarker = L.marker(coords[4], { icon: benchIcon }).addTo(this.map);
      this.restMarkers.push(benchMarker);

      // Cél jelölő (100 m)
      const endIcon = L.divIcon({
        className: 'custom-map-pin end-pin',
        html: '<div style="background:#06b6d4;color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.4);border:2px solid #fff;">🎯 Cél (100 m)</div>',
        iconSize: [80, 24],
        iconAnchor: [40, 24]
      });
      this.endMarker = L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(this.map);

      this.map.fitBounds(this.routeLine.getBounds(), { padding: [40, 40] });
    }

    clearMapOverlays() {
      if (this.startMarker) this.map.removeLayer(this.startMarker);
      if (this.currentMarker) this.map.removeLayer(this.currentMarker);
      if (this.endMarker) this.map.removeLayer(this.endMarker);
      this.restMarkers.forEach(m => this.map.removeLayer(m));
      this.restMarkers = [];
      this.routeLine.setLatLngs([]);
    }

    startSimulation(onTick, onComplete) {
      if (this.timer) clearInterval(this.timer);

      this.clearMapOverlays();
      let stepIndex = 0;
      let durationSec = 0;
      let meters = 0;
      let steps = 0;
      let rests = 0;
      let isResting = false;
      const walkPoints = [];

      // Start Marker
      const startIcon = L.divIcon({
        className: 'custom-map-pin start-pin',
        html: '<div style="background:#10b981;color:#fff;padding:3px 7px;border-radius:10px;font-size:11px;font-weight:bold;border:2px solid #fff;">🚩 Rajt (0m)</div>',
        iconSize: [75, 22],
        iconAnchor: [37, 22]
      });
      this.startMarker = L.marker(this.baseCoords[0], { icon: startIcon }).addTo(this.map);

      const curIcon = L.divIcon({
        className: 'custom-map-pin cur-pin',
        html: '<div style="background:#34d399;color:#070b14;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px #34d399;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      this.currentMarker = L.marker(this.baseCoords[0], { icon: curIcon }).addTo(this.map);

      const recordedCoords = [this.baseCoords[0]];
      this.routeLine.setLatLngs(recordedCoords);

      let restCounter = 0;

      this.timer = setInterval(() => {
        durationSec++;

        // 45 méternél (padnál) pihenő (fáradtság megelőzése / egyensúly)
        if (meters >= 45 && meters < 48 && rests === 0) {
          isResting = true;
          restCounter++;
          if (restCounter === 1) {
            rests = 1;
            const restMarker = L.marker(this.baseCoords[4], {
              icon: L.divIcon({
                className: 'bench-pin',
                html: '<div style="background:#f59e0b;color:#000;padding:2px 6px;border-radius:8px;font-size:10px;font-weight:bold;border:1px solid #fff;">⏸️ Pad pihenő</div>',
                iconSize: [80, 20],
                iconAnchor: [40, 20]
              })
            }).addTo(this.map);
            this.restMarkers.push(restMarker);
          }
          if (restCounter > 8) {
            isResting = false;
            meters = 48.5;
          }
        } else {
          isResting = false;
          meters += 1.8;
          steps += 2;
          const targetIndex = Math.min(this.baseCoords.length - 1, Math.floor((meters / 100) * (this.baseCoords.length - 1)));
          if (targetIndex > stepIndex) {
            stepIndex = targetIndex;
            recordedCoords.push(this.baseCoords[stepIndex]);
            this.routeLine.setLatLngs(recordedCoords);
            this.currentMarker.setLatLng(this.baseCoords[stepIndex]);
            this.map.panTo(this.baseCoords[stepIndex]);
          }
        }

        const cappedMeters = Math.min(100, Math.round(meters));

        if (onTick) {
          onTick({
            durationSec,
            meters: cappedMeters,
            steps,
            rests,
            isResting,
            speedKmh: isResting ? 0 : 2.4,
            percent: Math.min(100, Math.round((cappedMeters / 100) * 100))
          });
        }

        // Cél elérése 100 méternél
        if (cappedMeters >= 100) {
          clearInterval(this.timer);
          this.timer = null;

          const endIcon = L.divIcon({
            className: 'end-pin',
            html: '<div style="background:#06b6d4;color:#fff;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:bold;border:2px solid #fff;">🎯 100m Teljesítve!</div>',
            iconSize: [110, 24],
            iconAnchor: [55, 24]
          });
          L.marker(this.baseCoords[this.baseCoords.length - 1], { icon: endIcon }).addTo(this.map);

          if (onComplete) {
            onComplete({
              durationSec,
              meters: 100,
              steps,
              rests,
              date: new Date().toISOString().split('T')[0]
            });
          }
        }
      }, 500); // Gyorsított másodpercek a kényelmes teszteléshez
    }

    stopSimulation() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    exportGpx(meters, steps, durationSec) {
      const timeStr = new Date().toISOString();
      let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      gpx += `<gpx version="1.1" creator="Csampazo SM Tracker" xmlns="http://www.topografix.com/GPX/1/1">\n`;
      gpx += `  <metadata><name>Csámpázó SM 100m Séta</name><time>${timeStr}</time></metadata>\n`;
      gpx += `  <trk><name>100m Séta Alapteszt</name><trkseg>\n`;

      this.baseCoords.forEach(c => {
        gpx += `    <trkpt lat="${c[0]}" lon="${c[1]}"><ele>104.0</ele><time>${timeStr}</time></trkpt>\n`;
      });

      gpx += `  </trkseg></trk>\n</gpx>`;

      const blob = new Blob([gpx], { type: 'application/gpx+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `csampazo_sm_seta_${Date.now()}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  window.SMWalkMapManager = SMWalkMapManager;
})(window);
