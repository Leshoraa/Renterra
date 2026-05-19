import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, remove, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Actuator Elements
const togglePump = document.getElementById('toggle_pump');
const toggleFan = document.getElementById('toggle_fan');
const toggleLed = document.getElementById('toggle_led');

// Listen to existing states
const actRef = ref(db, 'SensorConfig/Actuators');
onValue(actRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.val();
        togglePump.checked = data.pump === true;
        toggleFan.checked = data.fan === true;
        toggleLed.checked = data.led === true;
    }
});

// Write state changes to DB
const updateActuator = () => {
    set(actRef, {
        pump: togglePump.checked,
        fan: toggleFan.checked,
        led: toggleLed.checked,
        last_updated: new Date().getTime()
    });
};

togglePump.addEventListener('change', updateActuator);
toggleFan.addEventListener('change', updateActuator);
toggleLed.addEventListener('change', updateActuator);

// Database Purge Tool
document.getElementById('btn_clear_db').addEventListener('click', () => {
    const confirmMessage = "PERINGATAN KRITIS: Anda yakin ingin menghapus seluruh data riwayat? Tindakan ini permanen dan tidak dapat dibatalkan!";
    if (confirm(confirmMessage)) {
        remove(ref(db, 'SensorHistory')).then(() => {
            alert("Berhasil! Seluruh data riwayat di Firebase telah dihapus. Kuota database kembali kosong.");
        }).catch((error) => {
            alert("Gagal menghapus data: " + error.message);
        });
    }
});

// Threshold Config Save
document.getElementById('btn_save_threshold').addEventListener('click', () => {
    const soil = document.getElementById('input_soil_alert').value;
    const temp = document.getElementById('input_temp_alert').value;
    
    set(ref(db, 'SensorConfig/Thresholds'), {
        soil_alert: parseInt(soil) || 3000,
        temp_alert: parseInt(temp) || 33
    }).then(() => {
        alert("Ambang batas peringatan AI berhasil disimpan ke sistem Cloud.");
    }).catch(err => alert(err));
});

// Node Identity Save
document.getElementById('btn_save_node').addEventListener('click', () => {
    const name = document.getElementById('input_node_name').value;
    set(ref(db, 'SensorConfig/Identity'), {
        alias: name
    }).then(() => {
        alert("Identitas jaringan node berhasil diperbarui menjadi: " + name);
    }).catch(err => alert(err));
});
