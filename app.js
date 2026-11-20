// Инициализация Telegram Web App
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
    tg.expand();
}

// Глобальные переменные плеера
let currentAudio = null;
let currentTrackId = null;
let isPlaying = false;

// Симметричный порог срабатывания: 60 м до и после остановки в обоих направлениях
const SYMMETRIC_TRIGGER_METERS = 60;
// Радиус выхода из зоны: 95 м — чтобы GPS не «дёргал» трек при небольших колебаниях координат
const EXIT_ZONE_METERS = 95;

// Список остановок (все файлы в формате .mp3)
const stops = [
    { id: 1, name: "Rondo Mogilskie", file: "01_rondo_mogilskie.mp3", lat: 50.0664, lng: 19.9593, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 2, name: "Lubicz", file: "02_lubicz.mp3", lat: 50.0648, lng: 19.9512, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 3, name: "Teatr Słowackiego", file: "03_teatr_slowackiego.mp3", lat: 50.0637, lng: 19.9431, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 4, name: "Poczta Główna", file: "04_poczta_glowna.mp3", lat: 50.0605, lng: 19.9422, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 5, name: "Starowiślna", file: "05_starowislna.mp3", lat: 50.0573, lng: 19.9448, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 6, name: "Stradom", file: "06_stradom.mp3", lat: 50.0531, lng: 19.9425, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 7, name: "Orzeszkowej", file: "07_orzeszkowej.mp3", lat: 50.0502, lng: 19.9438, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 8, name: "Rondo Grunwaldzkie", file: "08_rondo_grunwaldzkie.mp3", lat: 50.0512, lng: 19.9365, radius: SYMMETRIC_TRIGGER_METERS },
    { id: 9, name: "Спасибо за прослушивание", file: "09_good_bye.mp3", lat: null, lng: null, radius: 0 }
];

// --- КАРТА (LEAFLET) ---
let map = null;
let userMarker = null;
let followUser = true;
const stopMarkers = {};

function initMap() {
    const mapContainer = document.getElementById('route-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const geoStops = stops.filter(s => s.lat !== null && s.lng !== null);
    const routeLatLngs = geoStops.map(s => [s.lat, s.lng]);

    map = L.map('route-map', {
        zoomControl: true,
        attributionControl: false
    }).setView(routeLatLngs[0] || [50.0614, 19.9383], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);

    // Выделенная линия маршрута
    if (routeLatLngs.length > 1) {
        const routeLine = L.polyline(routeLatLngs, {
            color: '#38bdf8',
            weight: 4,
            opacity: 0.9
        }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
    }

    // Остановки и симметричные геозоны 60 м
    geoStops.forEach(stop => {
        L.circle([stop.lat, stop.lng], {
            radius: stop.radius,
            color: '#60a5fa',
            weight: 1.5,
            fillColor: '#3b82f6',
            fillOpacity: 0.16
        }).addTo(map);

        const icon = L.divIcon({
            className: 'custom-stop-marker',
            html: `<div id="map-pin-${stop.id}" class="stop-pin">${stop.id}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        const marker = L.marker([stop.lat, stop.lng], { icon })
            .addTo(map)
            .bindPopup(`<b>${stop.id}. ${stop.name}</b><br>Зона срабатывания: ${stop.radius} м`);

        marker.on('click', () => {
            playTrack(stop.id, stop.file);
        });

        stopMarkers[stop.id] = marker;
    });
}

function updateUserOnMap(lat, lng) {
    if (!map || typeof L === 'undefined') return;

    if (!userMarker) {
        const userIcon = L.divIcon({
            className: 'custom-user-marker',
            html: '<div class="user-pin"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
            .addTo(map)
            .bindPopup('Вы здесь');
    } else {
        userMarker.setLatLng([lat, lng]);
    }

    if (followUser) {
        map.panTo([lat, lng], { animate: true, duration: 0.6 });
    }
}

function highlightActiveStopOnMap(activeId) {
    Object.keys(stopMarkers).forEach(id => {
        const pinEl = document.getElementById(`map-pin-${id}`);
        if (pinEl) {
            pinEl.classList.toggle('stop-pin-active', parseInt(id, 10) === activeId);
        }
    });
}

function toggleFollowUser() {
    followUser = !followUser;
    const btn = document.getElementById('follow-btn');
    if (btn) {
        btn.innerText = followUser ? 'Автоцентрирование: ВКЛ' : 'Автоцентрирование: ВЫКЛ';
    }
    if (followUser && userMarker && map) {
        map.panTo(userMarker.getLatLng(), { animate: true });
    }
}

// --- ПЛЕЕР ---
function playTrack(id, filename) {
    const stop = stops.find(s => s.id === id);
    if (!stop) return;

    if (currentTrackId === id && currentAudio) {
        if (isPlaying) {
            currentAudio.pause();
            isPlaying = false;
            updatePlayerUI(stop.name, "Пауза", "▶");
        } else {
            currentAudio.play();
            isPlaying = true;
            updatePlayerUI(stop.name, "Воспроизведение...", "⏸");
        }
        return;
    }

    if (currentAudio) {
        currentAudio.pause();
    }

    currentAudio = new Audio(`audio/${filename}`);
    currentTrackId = id;

    currentAudio.play().then(() => {
        isPlaying = true;
        updatePlayerUI(stop.name, "Воспроизведение...", "⏸");
        highlightActiveCard(id);
        highlightActiveStopOnMap(id);
        if (stop.lat && stop.lng && map) {
            followUser = false;
            const btn = document.getElementById('follow-btn');
            if (btn) btn.innerText = 'Автоцентрирование: ВЫКЛ';
            map.setView([stop.lat, stop.lng], 15, { animate: true });
        }
    }).catch(error => {
        console.error("Ошибка воспроизведения:", error);
        updatePlayerUI(stop.name, "Ошибка загрузки файла", "▶");
    });

    currentAudio.onended = () => {
        isPlaying = false;
        updatePlayerUI(stop.name, "Трек завершен", "▶");

        if (id === 8) {
            setTimeout(() => {
                playTrack(9, '09_good_bye.mp3');
            }, 1000);
        }
    };
}

function togglePlay() {
    if (!currentAudio && stops.length > 0) {
        playTrack(stops[0].id, stops[0].file);
        return;
    }
    if (currentAudio) {
        if (isPlaying) {
            currentAudio.pause();
            isPlaying = false;
            document.getElementById('play-pause-btn').innerText = "▶";
            document.getElementById('player-status').innerText = "Пауза";
        } else {
            currentAudio.play();
            isPlaying = true;
            document.getElementById('play-pause-btn').innerText = "⏸";
            document.getElementById('player-status').innerText = "Воспроизведение...";
        }
    }
}

function updatePlayerUI(trackTitle, statusText, buttonIcon) {
    document.getElementById('current-track-title').innerText = trackTitle;
    document.getElementById('player-status').innerText = statusText;
    document.getElementById('play-pause-btn').innerText = buttonIcon;
}

function highlightActiveCard(id) {
    document.querySelectorAll('.stop-card').forEach(card => {
        card.classList.remove('border-blue-500', 'bg-slate-800/90');
        if (parseInt(card.dataset.id, 10) === id) {
            card.classList.add('border-blue-500', 'bg-slate-800/90');
        }
    });
}

// --- GPS, ПОЯСНЕНИЕ ПРО СИСТЕМНЫЙ GPS И СИММЕТРИЧНЫЙ ГЕОФЕНСИНГ ---

let watchId = null;
let lastTriggeredStopId = null;

function setGpsUiState({ label, dotColorClass, showEnableButton, hintLines = [] }) {
    const gpsText = document.getElementById('gps-text');
    const dot = document.getElementById('gps-dot');
    const enableBtn = document.getElementById('enable-gps-btn');
    const hintEl = document.getElementById('gps-help-hint');

    if (gpsText) gpsText.innerText = label;

    if (dot) {
        dot.className = `w-2 h-2 rounded-full ${dotColorClass}`;
    }

    if (enableBtn) {
        enableBtn.classList.toggle('hidden', !showEnableButton);
    }

    if (hintEl) {
        if (hintLines.length > 0) {
            hintEl.innerHTML = hintLines.map(line => `<p>${line}</p>`).join("");
            hintEl.classList.remove('hidden');
        } else {
            hintEl.innerHTML = "";
            hintEl.classList.add('hidden');
        }
    }
}

function handlePositionSuccess(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    setGpsUiState({
        label: "GPS активен",
        dotColorClass: "bg-emerald-500",
        showEnableButton: false,
        hintLines: []
    });

    updateUserOnMap(userLat, userLng);
    checkGeofences(userLat, userLng);
}

function handlePositionError(error) {
    console.warn("Ошибка геопозиции:", error.code, error.message);

    if (error.code === error.PERMISSION_DENIED) {
        setGpsUiState({
            label: "Доступ запрещён",
            dotColorClass: "bg-rose-500",
            showEnableButton: true,
            hintLines: [
                "1. Включите системный тумблер «Геолокация / GPS» в верхней шторке или настройках самого телефона (приложение не может включить его само).",
                "2. Разрешите доступ к геопозиции для Telegram в настройках смартфона и нажмите «Включить GPS»."
            ]
        });
    } else if (error.code === error.POSITION_UNAVAILABLE) {
        setGpsUiState({
            label: "GPS выключен",
            dotColorClass: "bg-rose-500",
            showEnableButton: true,
            hintLines: [
                "На телефоне отключён системный модуль GPS или нет сигнала спутников.",
                "Включите «Геолокацию / GPS» в шторке телефона, затем нажмите «Включить GPS»."
            ]
        });
    } else if (error.code === error.TIMEOUT) {
        setGpsUiState({
            label: "GPS не отвечает",
            dotColorClass: "bg-blue-400 animate-pulse",
            showEnableButton: true,
            hintLines: [
                "Не удалось получить координаты вовремя. Проверьте, что системный GPS на телефоне включён, и нажмите «Включить GPS»."
            ]
        });
    } else {
        setGpsUiState({
            label: "Нет доступа к GPS",
            dotColorClass: "bg-rose-500",
            showEnableButton: true,
            hintLines: [
                "Включите системный GPS в настройках телефона и разрешите доступ Telegram, затем нажмите «Включить GPS»."
            ]
        });
    }
}

function startGeolocationWatcher(isManualRetry = false) {
    if (!navigator.geolocation) {
        setGpsUiState({
            label: "GPS недоступен",
            dotColorClass: "bg-rose-500",
            showEnableButton: false,
            hintLines: [
                "Ваш браузер или устройство не поддерживают определение координат. Запускайте треки вручную нажатием на остановку."
            ]
        });
        return;
    }

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    setGpsUiState({
        label: "Поиск GPS...",
        dotColorClass: "bg-blue-500 animate-pulse",
        showEnableButton: true,
        hintLines: isManualRetry
            ? ["Проверяем доступ к координатам. Если системный GPS на телефоне выключен — включите его в шторке устройства."]
            : []
    });

    const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
    };

    navigator.geolocation.getCurrentPosition(
        handlePositionSuccess,
        handlePositionError,
        geoOptions
    );

    watchId = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        handlePositionError,
        geoOptions
    );
}

function requestGeolocationAgain() {
    startGeolocationWatcher(true);
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function checkGeofences(lat, lng) {
    if (lastTriggeredStopId !== null) {
        const activeStop = stops.find(s => s.id === lastTriggeredStopId);
        if (activeStop && activeStop.lat && activeStop.lng) {
            const distFromActive = getDistanceFromLatLonInMeters(lat, lng, activeStop.lat, activeStop.lng);
            if (distFromActive > EXIT_ZONE_METERS) {
                lastTriggeredStopId = null;
            }
        }
    }

    stops.forEach(stop => {
        if (!stop.lat || !stop.lng || !stop.radius) return;

        const distance = getDistanceFromLatLonInMeters(lat, lng, stop.lat, stop.lng);

        if (distance <= stop.radius && lastTriggeredStopId !== stop.id) {
            lastTriggeredStopId = stop.id;
            playTrack(stop.id, stop.file);
        }
    });
}

window.onload = () => {
    initMap();
    startGeolocationWatcher(false);
};