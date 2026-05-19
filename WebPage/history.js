import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, query, limitToLast, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const tbody = document.getElementById('history_tbody');
const badge = document.getElementById('data_count_badge');
const btnExport = document.getElementById('btn_export_csv');
const avgTempEl = document.getElementById('avg_temp');
const avgHumEl = document.getElementById('avg_hum');

let globalData = [];

// limitToLast mengambil 100 data terbaru berdasarkan Push ID (sudah kronologis)
const historyQuery = query(ref(db, 'SensorHistory'), limitToLast(100));

badge.innerText = "Memuat...";

get(historyQuery).then((snapshot) => {
    globalData = [];
    if (snapshot.exists()) {
        const rawData = snapshot.val();
        let html = '';
        let sumTemp = 0, sumHum = 0, validCount = 0;
        
        // Push ID sudah urut waktu — reverse untuk tampilan newest-first
        const entries = Object.values(rawData).reverse();
        
        entries.forEach(entry => {
            globalData.push(entry);
            
            const date = entry.timestamp ? new Date(entry.timestamp) : new Date();
            const timeStr = date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            const t = entry.suhu !== undefined ? Number(entry.suhu).toFixed(1) : '--';
            const h = entry.kelembapan !== undefined ? Number(entry.kelembapan).toFixed(1) : '--';
            const s = entry.adc_tanah !== undefined ? entry.adc_tanah : '--';
            
            if (entry.suhu !== undefined && entry.kelembapan !== undefined) { 
                sumTemp += Number(entry.suhu); 
                sumHum += Number(entry.kelembapan); 
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
            avgTempEl.innerText = (sumTemp / validCount).toFixed(1) + " \u00b0C";
            avgHumEl.innerText = (sumHum / validCount).toFixed(1) + " %";
        }
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">Riwayat kosong. ESP32 menyimpan riwayat setiap 5 menit.</td></tr>';
        badge.innerText = "0 Records";
    }
}).catch(err => {
    console.error("Firebase Error:", err);
    badge.innerText = "Error";
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger);">Gagal: ${err.message}</td></tr>`;
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
