import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const elActiveInterval = document.getElementById("active_interval_text");
const elBatValue = document.getElementById("bat_value");
const elBatBar = document.getElementById("bat_bar");
const elBatStatusLbl = document.getElementById("bat_status_lbl");
const elTerminalStream = document.getElementById("terminal_stream");
const elNodeKebunStatus = document.getElementById("node_kebun_status");

// Selector Tambahan Pindahan Interval Update
const elUpdateInterval = document.getElementById("update_interval");
const elIntervalDropdown = document.getElementById("interval_dropdown");
const elIntervalSelectedText = document.getElementById("interval_selected_text");
const btnSaveInterval = document.getElementById("btn_save_interval");

const sensorRef = ref(db, 'SensorKebun');
let lastTimestamp = 0;

// Logika UI Dropdown Interval
elIntervalDropdown.addEventListener('click', () => {
    elIntervalDropdown.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!elIntervalDropdown.contains(e.target)) {
        elIntervalDropdown.classList.remove('active');
    }
});

const intervalItems = document.querySelectorAll(".interval-item");
intervalItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-value');
        elIntervalSelectedText.innerText = item.innerText;
        elIntervalSelectedText.setAttribute('data-value', val);
        elIntervalDropdown.classList.remove('active');

        intervalItems.forEach(el => el.classList.remove('active'));
        item.classList.add('active');
    });
});

// Aksi Tulis / Simpan Interval Baru ke Firebase RTDB
btnSaveInterval.addEventListener('click', () => {
    let val = parseInt(elUpdateInterval.value);
    const unit = elIntervalSelectedText.getAttribute('data-value');

    if (val >= 1) {
        if (unit === 'menit') val = val * 60;

        set(ref(db, 'SensorKebun/update_interval'), val)
            .then(() => alert("Interval update berhasil disimpan!"))
            .catch(err => alert("Gagal menyimpan: " + err.message));
    } else {
        alert("Masukkan interval yang valid.");
    }
});

function pushLogMessage(message, type = 'success') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const line = document.createElement('div');
    line.className = 'log-line';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.innerText = `[${timeStr}]`;

    const msgSpan = document.createElement('span');
    msgSpan.className = type === 'success' ? 'log-success' : 'log-info';
    msgSpan.innerText = message;

    line.appendChild(timeSpan);
    line.appendChild(msgSpan);

    elTerminalStream.appendChild(line);
    elTerminalStream.scrollTop = elTerminalStream.scrollHeight;
}

onValue(sensorRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        elActiveInterval.innerText = data.update_interval || "15";

        // Sinkronisasi Form Input (Diabaikan jika user sedang mengetik/fokus di dalamnya)
        if (data.update_interval !== undefined && document.activeElement !== elUpdateInterval) {
            let displayVal = data.update_interval;
            let displayUnit = "detik";

            if (data.update_interval >= 60 && data.update_interval % 60 === 0) {
                displayVal = data.update_interval / 60;
                displayUnit = "menit";
            }

            elUpdateInterval.value = displayVal;
            elIntervalSelectedText.innerText = displayUnit === "menit" ? "Menit" : "Detik";
            elIntervalSelectedText.setAttribute("data-value", displayUnit);

            document.querySelectorAll(".interval-item").forEach(el => {
                if (el.getAttribute("data-value") === displayUnit) {
                    el.classList.add("active");
                } else {
                    el.classList.remove("active");
                }
            });
        }

        const bat = data.baterai_persen || 0;
        elBatValue.innerText = bat;
        elBatBar.style.width = `${bat}%`;

        if (bat < 20) {
            elBatStatusLbl.innerText = "Kritis (Segera Cas)";
            elBatStatusLbl.style.color = "var(--danger)";
            elBatBar.style.backgroundColor = "var(--danger)";
        } else if (bat < 50) {
            elBatStatusLbl.innerText = "Sedang";
            elBatStatusLbl.style.color = "var(--info)";
            elBatBar.style.backgroundColor = "var(--info)";
        } else {
            elBatStatusLbl.innerText = "Optimal";
            elBatStatusLbl.style.color = "var(--accent)";
            elBatBar.style.backgroundColor = "var(--accent)";
        }

        if (data.last_update && data.last_update !== lastTimestamp) {
            lastTimestamp = data.last_update;
            pushLogMessage(`[ESP-NOW] Packet received: Suhu=${data.suhu?.toFixed(1)}°C, Tanah=${data.adc_tanah}`, 'success');
            elNodeKebunStatus.innerHTML = '<div class="dot online"></div>ONLINE';
        }
    }
});

setInterval(() => {
    const nowMs = Date.now();
    if (lastTimestamp && (nowMs - lastTimestamp > 30000)) {
        elNodeKebunStatus.innerHTML = '<div class="dot"></div>OFFLINE / SLEEP';
        pushLogMessage(`[SYSTEM] Node kebun melewati batas respon timeout.`, 'info');
    }
}, 5000);