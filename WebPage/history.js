import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, query, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import firebaseConfig from './config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const tbody = document.getElementById('history_tbody');
const badge = document.getElementById('data_count_badge');
const btnExport = document.getElementById('btn_export_csv');
const avgTempEl = document.getElementById('avg_temp');
const avgHumEl = document.getElementById('avg_hum');

let globalData = [];

// Fetch History Data (Max 200 records for the table to optimize RAM)
const historyQuery = query(ref(db, 'SensorHistory'), limitToLast(200));

onValue(historyQuery, (snapshot) => {
    globalData = [];
    if (snapshot.exists()) {
        const rawData = snapshot.val();
        let html = '';
        let sumTemp = 0, sumHum = 0, validCount = 0;
        
        // Sort descending (newest first)
        const entries = Object.values(rawData).sort((a, b) => b.timestamp - a.timestamp);
        
        entries.forEach(entry => {
            if (!entry.timestamp) return;
            globalData.push(entry);
            
            const date = new Date(entry.timestamp);
            const timeStr = date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const t = entry.suhu !== undefined ? entry.suhu.toFixed(1) : '--';
            const h = entry.kelembapan !== undefined ? entry.kelembapan.toFixed(1) : '--';
            const s = entry.adc_tanah !== undefined ? entry.adc_tanah : '--';
            
            if (entry.suhu !== undefined) { 
                sumTemp += entry.suhu; 
                sumHum += entry.kelembapan; 
                validCount++; 
            }

            html += `
                <tr>
                    <td style="color: var(--text-muted); font-weight: 500;">${timeStr}</td>
                    <td style="color: var(--c-temp); font-weight: 600;">${t}</td>
                    <td style="color: var(--c-drop); font-weight: 600;">${h}</td>
                    <td style="color: var(--c-leaf); font-weight: 600;">${s}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        badge.innerText = `${entries.length} Records`;
        
        if (validCount > 0) {
            avgTempEl.innerText = (sumTemp / validCount).toFixed(1) + " °C";
            avgHumEl.innerText = (sumHum / validCount).toFixed(1) + " %";
        }
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">Riwayat kosong. Menunggu siklus simpan ESP32 (5 Menit)...</td></tr>';
        badge.innerText = "0 Records";
        avgTempEl.innerText = "-- °C";
        avgHumEl.innerText = "-- %";
    }
}, (err) => {
    console.error("Firebase Error:", err);
    badge.innerText = "Error";
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger);">Gagal memuat data dari database. Pastikan koneksi aman.</td></tr>';
});

// CSV Export Logic
btnExport.addEventListener('click', () => {
    if (globalData.length === 0) {
        alert("Tidak ada data untuk diekspor!");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Timestamp_Unix,Waktu_Lokal,Suhu (C),Kelembapan (%),ADC_Tanah\n";
    
    globalData.forEach(row => {
        const d = new Date(row.timestamp);
        const dateStr = d.toLocaleString('id-ID').replace(/,/g, ''); // avoid comma collision
        csvContent += `${row.timestamp},${dateStr},${row.suhu || ''},${row.kelembapan || ''},${row.adc_tanah || ''}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `renterra_history_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});
