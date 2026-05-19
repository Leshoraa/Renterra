import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, query, limitToLast, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const elSuhu = document.getElementById("suhu");
const elKelembapan = document.getElementById("kelembapan");
const elAdcTanah = document.getElementById("adc_tanah");
const elBaterai = document.getElementById("baterai");
const elStatusTanah = document.getElementById("status_tanah");
const elAiInsight = document.getElementById("ai_insight");
const elBarSuhu = document.getElementById("bar_suhu");
const elBarKelembapan = document.getElementById("bar_kelembapan");
const elBarTanah = document.getElementById("bar_tanah");

elAiInsight.addEventListener('click', () => {
    elAiInsight.classList.toggle('expanded');
});

const elDropdown = document.getElementById("custom_dropdown");
const elDropdownSelectedText = document.getElementById("location_selected_text");
const elDropdownList = document.getElementById("location_list");
const elDropdownItemsContainer = document.getElementById("location_items");
const elDropdownSearch = document.getElementById("location_search");
const elBmkgIcon = document.getElementById("bmkg_icon");
const elBmkgTemp = document.getElementById("bmkg_temp");
const elBmkgStatus = document.getElementById("bmkg_status");
const elBmkgTime = document.getElementById("bmkg_time");

const sensorRef = ref(db, 'SensorKebun');

const ctx = document.getElementById('historyChart').getContext('2d');
const historyChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Suhu (°C)',
                borderColor: '#f39c12',
                backgroundColor: 'rgba(243, 156, 18, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#f39c12',
                pointRadius: 3,
                data: [],
                tension: 0.4,
                fill: true,
                yAxisID: 'y'
            },
            {
                label: 'Kelembapan (%)',
                borderColor: '#0984e3',
                backgroundColor: 'rgba(9, 132, 227, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#0984e3',
                pointRadius: 3,
                data: [],
                tension: 0.4,
                fill: true,
                yAxisID: 'y2'
            },
            {
                label: 'ADC Tanah',
                borderColor: '#00b894',
                backgroundColor: 'rgba(0, 184, 148, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#00b894',
                pointRadius: 3,
                data: [],
                tension: 0.4,
                fill: true,
                yAxisID: 'y1'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: false,
        scales: {
            x: {
                grid: { color: 'rgba(100, 116, 139, 0.1)' },
                ticks: {
                    color: '#64748b',
                    maxRotation: 0, // Mencegah label miring/menumpuk
                    autoSkip: true, // Otomatis skip label kalau terlalu padat
                    maxTicksLimit: 10 // Batasi jumlah label di bawah agar tidak berdesakan
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { color: 'rgba(100, 116, 139, 0.1)' },
                ticks: { color: '#f39c12' }
            },
            y2: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { drawOnChartArea: false },
                ticks: { color: '#0984e3' }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: '#00b894' }
            }
        },
        plugins: {
            legend: {
                labels: { color: '#334155', font: { family: "'Plus Jakarta Sans', sans-serif", weight: 600 } }
            }
        },
        animation: {
            duration: 400,
            easing: 'easeOutQuart'
        }
    }
});

const elChartFilterDropdown = document.getElementById("chart_filter_dropdown");
const elChartFilterText = document.getElementById("chart_filter_text");
const chartFilterItems = document.querySelectorAll(".chart-filter-item");

let currentChartMode = elChartFilterText.getAttribute('data-value') || "live";
let realTimeBuffer = [];

function updateChartWithQueue(dataArray, maxSlots) {
    const slicedData = dataArray.length > maxSlots ? dataArray.slice(dataArray.length - maxSlots) : dataArray;
    const labels = new Array(maxSlots).fill('--:--');
    const suhu = new Array(maxSlots).fill(null);
    const kel = new Array(maxSlots).fill(null);
    const tanah = new Array(maxSlots).fill(null);

    const offset = maxSlots - slicedData.length;
    for (let i = 0; i < slicedData.length; i++) {
        labels[i + offset] = slicedData[i].label;
        suhu[i + offset] = slicedData[i].suhu;
        kel[i + offset] = slicedData[i].kel;
        tanah[i + offset] = slicedData[i].tanah;
    }

    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = suhu;
    historyChart.data.datasets[1].data = kel;
    historyChart.data.datasets[2].data = tanah;
    historyChart.update();
}

function groupHistoricalData(rawData, mode) {
    const grouped = {};
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

    Object.values(rawData).forEach(entry => {
        if (!entry.timestamp) return;
        const date = new Date(entry.timestamp);
        let key = '';
        let labelStr = '';

        if (mode === 'jam') {
            key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
            labelStr = `${date.getHours().toString().padStart(2, '0')}:00`;
        } else if (mode === 'hari') {
            key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            labelStr = days[date.getDay()];
        } else if (mode === 'minggu') {
            const weekOfMonth = Math.ceil(date.getDate() / 7);
            key = `${date.getFullYear()}-${date.getMonth()}-W${weekOfMonth}`;
            labelStr = `Mgg ${weekOfMonth}`;
        } else if (mode === 'bulan') {
            key = `${date.getFullYear()}-${date.getMonth()}`;
            labelStr = months[date.getMonth()];
        }

        grouped[key] = {
            label: labelStr,
            suhu: entry.suhu !== undefined ? entry.suhu : null,
            kel: entry.kelembapan !== undefined ? entry.kelembapan : null,
            tanah: entry.adc_tanah !== undefined ? entry.adc_tanah : null,
            ts: entry.timestamp
        };
    });

    return Object.values(grouped).sort((a, b) => a.ts - b.ts);
}

function loadHistoryFromDatabase(limitCount, mode) {
    const historyQuery = query(ref(db, 'SensorHistory'), limitToLast(limitCount));
    get(historyQuery).then((snapshot) => {
        if (snapshot.exists()) {
            const rawData = snapshot.val();
            const groupedArray = groupHistoricalData(rawData, mode);

            let maxSlots = 15;
            if (mode === 'jam') maxSlots = 24;
            if (mode === 'hari') maxSlots = 7;
            if (mode === 'minggu') maxSlots = 4;
            if (mode === 'bulan') maxSlots = 12;

            updateChartWithQueue(groupedArray, maxSlots);
        } else {
            let maxSlots = 15;
            if (mode === 'jam') maxSlots = 24;
            if (mode === 'hari') maxSlots = 7;
            if (mode === 'minggu') maxSlots = 4;
            if (mode === 'bulan') maxSlots = 12;
            updateChartWithQueue([], maxSlots);
        }
    }).catch(err => console.error(err));
}

elChartFilterDropdown.addEventListener('click', (e) => {
    elChartFilterDropdown.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!elChartFilterDropdown.contains(e.target)) {
        elChartFilterDropdown.classList.remove('active');
    }
});

chartFilterItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = item.getAttribute('data-value');
        elChartFilterText.innerText = item.innerText;
        elChartFilterText.setAttribute('data-value', val);
        currentChartMode = val;

        elChartFilterDropdown.classList.remove('active');
        chartFilterItems.forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        if (val === 'realtime' || val === 'live') {
            updateChartWithQueue(realTimeBuffer, 15);
        } else if (val === 'jam') {
            loadHistoryFromDatabase(6000, 'jam');
        } else if (val === 'hari') {
            loadHistoryFromDatabase(10000, 'hari');
        } else if (val === 'minggu') {
            loadHistoryFromDatabase(15000, 'minggu');
        } else if (val === 'bulan') {
            loadHistoryFromDatabase(20000, 'bulan');
        }
    });
});

function parseMarkdown(text) {
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    return html;
}

function generateAgriInsight(suhu, kelembapan, adcTanah) {
    if (adcTanah > 3500) {
        return "Tanah dalam kondisi **sangat kering**. Segera lakukan **irigasi** untuk mencegah stres pada tanaman.";
    }
    if (kelembapan >= 70 && kelembapan <= 100 && suhu >= 22 && suhu <= 32) {
        return "Kelembapan dan suhu **optimal**. Tanaman dalam kondisi sehat dan siap menyerap **nutrisi**.";
    }
    if (suhu > 33) {
        return "Suhu terdeteksi **terlalu panas**. Sebaiknya tambahkan **kipas pendingin** atau semprotkan `mist` untuk menurunkan suhu.";
    }
    if (suhu < 20) {
        return "Suhu sedikit **dingin**. Pastikan tidak terjadi penumpukan `kelembapan tinggi` yang dapat menyebabkan jamur.";
    }
    if (kelembapan >= 50 && kelembapan < 70) {
        return "Tanah dalam kondisi **lembap yang ideal**. Lanjutkan pemantauan rutin.";
    }
    return "Kondisi **stabil**. Lanjutkan pemantauan rutin.";
}

let isFirstLoad = true;

onValue(sensorRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        if (data.suhu !== undefined) {
            elSuhu.innerText = data.suhu.toFixed(1);
            let pctSuhu = (data.suhu / 50) * 100;
            if (pctSuhu > 100) pctSuhu = 100; else if (pctSuhu < 0) pctSuhu = 0;
            elBarSuhu.style.width = `${pctSuhu}%`;
            elBarSuhu.style.backgroundColor = "var(--warning)";
        }

        if (data.kelembapan !== undefined) {
            elKelembapan.innerText = data.kelembapan.toFixed(1);
            let pctKel = data.kelembapan;
            if (pctKel > 100) pctKel = 100; else if (pctKel < 0) pctKel = 0;
            elBarKelembapan.style.width = `${pctKel}%`;
            elBarKelembapan.style.backgroundColor = "var(--info)";
        }

        if (data.adc_tanah !== undefined) {
            elAdcTanah.innerText = data.adc_tanah;
            let pctTanah = (data.adc_tanah / 4095) * 100;
            if (pctTanah > 100) pctTanah = 100; else if (pctTanah < 0) pctTanah = 0;
            elBarTanah.style.width = `${pctTanah}%`;
            elBarTanah.style.backgroundColor = "var(--accent)";
            elStatusTanah.style.color = "var(--accent)";

            if (data.adc_tanah > 3000) {
                elStatusTanah.innerText = "Kering";
            } else if (data.adc_tanah > 1500) {
                elStatusTanah.innerText = "Lembap";
            } else {
                elStatusTanah.innerText = "Basah";
            }
        }

        elBaterai.innerText = data.baterai_persen || "--";

        const rawInsight = generateAgriInsight(data.suhu, data.kelembapan, data.adc_tanah);
        elAiInsight.innerHTML = parseMarkdown(rawInsight);

        if (data.suhu !== undefined && data.kelembapan !== undefined && data.adc_tanah !== undefined) {
            const now = new Date();

            if (isFirstLoad && data.live_buffer) {
                isFirstLoad = false;
                const points = data.live_buffer.split('|').filter(p => p.length > 0);
                realTimeBuffer = [];
                for (let i = 0; i < points.length; i++) {
                    const parts = points[i].split(',');
                    const pointTime = new Date(now.getTime() - (points.length - 1 - i) * 1000);
                    const timeLabel = pointTime.getHours().toString().padStart(2, '0') + ':' +
                        pointTime.getMinutes().toString().padStart(2, '0') + ':' +
                        pointTime.getSeconds().toString().padStart(2, '0');

                    realTimeBuffer.push({
                        label: timeLabel,
                        suhu: parseFloat(parts[0]),
                        kel: parseFloat(parts[1]),
                        tanah: parseInt(parts[2])
                    });
                }
            } else {
                const timeLabel = now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0') + ':' +
                    now.getSeconds().toString().padStart(2, '0');

                realTimeBuffer.push({
                    label: timeLabel,
                    suhu: data.suhu,
                    kel: data.kelembapan,
                    tanah: data.adc_tanah
                });
            }

            if (realTimeBuffer.length > 50) {
                realTimeBuffer.shift();
            }

            if (currentChartMode === 'realtime' || currentChartMode === 'live') {
                updateChartWithQueue(realTimeBuffer, 15);
            }
        }
    }
});

const BMKG_API_WILAYAH = "https://ibnux.github.io/BMKG-importer/cuaca/wilayah.json";
let bmkgStations = [];

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// WMO Weather Code mapping for Open-Meteo
function mapWeatherIcon(wmoCode) {
    if (wmoCode === 0) return 'clear_day';
    if (wmoCode <= 2) return 'partly_cloudy_day';
    if (wmoCode === 3) return 'cloud';
    if (wmoCode <= 49) return 'foggy';
    if (wmoCode <= 59) return 'rainy_light';
    if (wmoCode <= 69) return 'rainy';
    if (wmoCode <= 79) return 'weather_snowy';
    if (wmoCode <= 82) return 'rainy';
    if (wmoCode <= 86) return 'weather_snowy';
    if (wmoCode <= 99) return 'thunderstorm';
    return 'cloud_sync';
}
function wmoToDesc(wmoCode) {
    if (wmoCode === 0) return 'Cerah';
    if (wmoCode <= 2) return 'Sebagian Berawan';
    if (wmoCode === 3) return 'Mendung';
    if (wmoCode <= 49) return 'Berkabut';
    if (wmoCode <= 59) return 'Gerimis';
    if (wmoCode <= 69) return 'Hujan';
    if (wmoCode <= 82) return 'Hujan Deras';
    if (wmoCode <= 99) return 'Badai Petir';
    return 'Tidak Diketahui';
}

async function fetchWeather(lat, lon) {
    try {
        elBmkgStatus.innerText = 'Memuat...';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m&timezone=Asia%2FJakarta&forecast_days=1`;
        const res = await fetch(url);
        const data = await res.json();
        const cur = data.current;
        elBmkgTemp.innerText = cur.temperature_2m.toFixed(1);
        elBmkgStatus.innerText = wmoToDesc(cur.weathercode);
        elBmkgTime.innerText = `Angin: ${cur.windspeed_10m} km/h`;
        elBmkgIcon.innerText = mapWeatherIcon(cur.weathercode);
    } catch (err) {
        elBmkgStatus.innerText = 'Gagal memuat';
        console.error('Open-Meteo error:', err);
    }
}

async function initBMKG() {
    try {
        elDropdown.addEventListener('click', (e) => {
            elDropdown.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!elDropdown.contains(e.target)) {
                elDropdown.classList.remove('active');
            }
        });

        const formatCity = (city) => city ? city.replace(/Kab\.\s|Kota\s/g, '') : '';
        const formatProv = (prov) => prov ? prov.replace(/Propinsi\s|Provinsi\s/g, '') : '';
        const getProv = (st) => st.propinsi || st.provinsi || st.prov || '';

        // LANGKAH 1: Cek cache koordinat — tampil instan tanpa tunggu fetch
        const savedLat = localStorage.getItem('bmkg_lat');
        const savedLon = localStorage.getItem('bmkg_lon');
        const savedLabel = localStorage.getItem('bmkg_station_label');
        if (savedLat && savedLon && savedLabel) {
            elDropdownSelectedText.innerText = savedLabel;
            fetchWeather(savedLat, savedLon); // Instan dari cache
        }

        // LANGKAH 2: Fetch daftar wilayah (bisa pakai cache stale jika ada)
        const res = await fetch(BMKG_API_WILAYAH);
        bmkgStations = await res.json();

        bmkgStations.forEach(station => {
            const item = document.createElement('div');
            item.className = 'dropdown-item location-item';
            item.innerHTML = `
                <span class="loc-kota">${formatCity(station.kota)}</span>
                <span class="loc-prov">${formatProv(getProv(station))}</span>
            `;
            item.dataset.search = (station.kota + ' ' + getProv(station)).toLowerCase();
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const label = `${formatCity(station.kota)}, ${formatProv(getProv(station))}`;
                elDropdownSelectedText.innerText = label;
                fetchWeather(station.lat, station.lon);
                localStorage.setItem('bmkg_lat', station.lat);
                localStorage.setItem('bmkg_lon', station.lon);
                localStorage.setItem('bmkg_station_label', label);
                elDropdown.classList.remove('active');
                document.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            });
            elDropdownItemsContainer.appendChild(item);
        });

        elDropdownSearch.addEventListener('click', (e) => e.stopPropagation());
        elDropdownSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = elDropdownItemsContainer.querySelectorAll('.dropdown-item');
            items.forEach(item => {
                const match = (item.dataset.search || item.innerText.toLowerCase()).includes(query);
                item.style.display = match ? 'flex' : 'none';
            });
        });

        // LANGKAH 3: Hanya jalankan geolokasi jika belum ada cache
        if (!savedLat && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const userLat = pos.coords.latitude;
                    const userLon = pos.coords.longitude;
                    let terdekat = bmkgStations[0];
                    let jarakMin = Infinity;
                    bmkgStations.forEach(st => {
                        const d = getDistanceFromLatLonInKm(userLat, userLon, parseFloat(st.lat), parseFloat(st.lon));
                        if (d < jarakMin) { jarakMin = d; terdekat = st; }
                    });
                    const label = `${formatCity(terdekat.kota)}, ${formatProv(getProv(terdekat))}`;
                    elDropdownSelectedText.innerText = label;
                    fetchWeather(terdekat.lat, terdekat.lon);
                    localStorage.setItem('bmkg_lat', terdekat.lat);
                    localStorage.setItem('bmkg_lon', terdekat.lon);
                    localStorage.setItem('bmkg_station_label', label);
                },
                () => {
                    // Fallback: Yogyakarta koordinat
                    elDropdownSelectedText.innerText = 'Yogyakarta';
                    fetchWeather(-7.7956, 110.3695);
                }
            );
        } else if (!savedLat) {
            elDropdownSelectedText.innerText = 'Yogyakarta';
            fetchWeather(-7.7956, 110.3695);
        }
    } catch (err) {
        console.error(err);
    }
}

initBMKG();