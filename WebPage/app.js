import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const elSuhu = document.getElementById("suhu");
const elKelembapan = document.getElementById("kelembapan");
const elAdcTanah = document.getElementById("adc_tanah");
const elBaterai = document.getElementById("baterai");
const elStatusTanah = document.getElementById("status_tanah");
const elAiInsight = document.getElementById("ai_insight");
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

// FUNGSI PARSER MARKDOWN SEDERHANA
function parseMarkdown(text) {
    // Teks diapit ** menjadi <strong class="ai-bold">
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Teks diapit ` menjadi <code class="ai-pill">
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    return html;
}

// LOGIKA INSIGHT
function generateAgriInsight(suhu, kelembapan, adcTanah) {
    // 1. Cek Kekeringan (Sensor Tanah)
    if (adcTanah > 3500) {
        return "Tanah dalam kondisi **sangat kering**. Segera lakukan **irigasi** untuk mencegah stres pada tanaman.";
    }

    // 2. Cek Kelembapan Ideal & Suhu Optimal (0-100% Kelembapan, 22-32°C Suhu)
    if (kelembapan >= 70 && kelembapan <= 100 && suhu >= 22 && suhu <= 32) {
        return "Kelembapan dan suhu **optimal**. Tanaman dalam kondisi sehat dan siap menyerap **nutrisi**.";
    }

    // 3. Cek Suhu Panas (Suhu > 33°C)
    if (suhu > 33) {
        return "Suhu terdeteksi **terlalu panas**. Sebaiknya tambahkan **kipas pendingin** atau semprotkan `mist` untuk menurunkan suhu.";
    }

    // 4. Cek Suhu Dingin (Suhu < 20°C)
    if (suhu < 20) {
        return "Suhu sedikit **dingin**. Pastikan tidak terjadi penumpukan `kelembapan tinggi` yang dapat menyebabkan jamur.";
    }

    // 5. Kelembapan Ideal (Tidak Terlalu Basah, Tidak Terlalu Kering)
    if (kelembapan >= 50 && kelembapan < 70) {
        return "Tanah dalam kondisi **lembap yang ideal**. Lanjutkan pemantauan rutin.";
    }

    // 6. Kondisi Netral / Default
    return "Kondisi **stabil**. Lanjutkan pemantauan rutin.";
}

onValue(sensorRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        elSuhu.innerText = data.suhu ? data.suhu.toFixed(1) : "--";
        elKelembapan.innerText = data.kelembapan ? data.kelembapan.toFixed(1) : "--";
        elAdcTanah.innerText = data.adc_tanah || "----";
        elBaterai.innerText = data.baterai_persen || "--";

        // Eksekusi Markdown Parser untuk AI Insight
        const rawInsight = generateAgriInsight(data.suhu, data.kelembapan, data.adc_tanah);
        elAiInsight.innerHTML = parseMarkdown(rawInsight);

        // Status Tanah Badge
        if (data.adc_tanah > 3000) {
            elStatusTanah.innerText = "Kering";
            elStatusTanah.style.color = "var(--danger)";
        } else if (data.adc_tanah > 1500) {
            elStatusTanah.innerText = "Lembap";
            elStatusTanah.style.color = "var(--info)";
        } else {
            elStatusTanah.innerText = "Basah";
            elStatusTanah.style.color = "var(--accent)";
        }
    }
});

// LOGIKA BMKG
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

function mapWeatherIcon(kodeCuaca) {
    const map = {
        "0": "clear_day", "1": "partly_cloudy_day", "2": "partly_cloudy_day",
        "3": "cloud", "4": "cloud", "5": "air", "10": "air",
        "47": "foggy", "60": "rainy", "61": "rainy", "63": "pouring",
        "80": "rainy", "95": "thunderstorm", "97": "thunderstorm"
    };
    return map[kodeCuaca] || "cloud_sync";
}

async function fetchWeather(idWilayah) {
    try {
        elBmkgStatus.innerText = "Memuat...";
        const res = await fetch(`https://ibnux.github.io/BMKG-importer/cuaca/${idWilayah}.json`);
        const data = await res.json();

        if (data && data.length > 0) {
            const cuacaSekarang = data[0];
            elBmkgTemp.innerText = cuacaSekarang.tempC;
            elBmkgStatus.innerText = cuacaSekarang.cuaca;
            elBmkgTime.innerText = `Update: ${cuacaSekarang.jamCuaca.split(' ')[1]}`;
            elBmkgIcon.innerText = mapWeatherIcon(cuacaSekarang.kodeCuaca);
        }
    } catch (err) {
        elBmkgStatus.innerText = "Gagal memuat";
    }
}

async function initBMKG() {
    try {
        // Toggle dropdown
        elDropdown.addEventListener('click', (e) => {
            elDropdown.classList.toggle('active');
        });

        // Tutup jika klik di luar
        document.addEventListener('click', (e) => {
            if (!elDropdown.contains(e.target)) {
                elDropdown.classList.remove('active');
            }
        });

        const res = await fetch(BMKG_API_WILAYAH);
        bmkgStations = await res.json();

        // Helper untuk membuang prefix berlebihan agar tidak terlalu panjang
        const formatCity = (city) => city.replace(/Kab\.\s|Kota\s/g, '');

        bmkgStations.forEach(station => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.innerText = formatCity(station.kota);
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Mencegah bubble up ke elDropdown click
                elDropdownSelectedText.innerText = formatCity(station.kota);
                fetchWeather(station.id);
                elDropdown.classList.remove('active');
                
                // Hilangkan active dari yang lain
                document.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            });
            elDropdownItemsContainer.appendChild(item);
        });

        // Logika pencarian dropdown
        elDropdownSearch.addEventListener('click', (e) => e.stopPropagation()); // Mencegah dropdown tertutup saat search
        elDropdownSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = elDropdownItemsContainer.querySelectorAll('.dropdown-item');
            items.forEach(item => {
                if (item.innerText.toLowerCase().includes(query)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const userLat = pos.coords.latitude;
                    const userLon = pos.coords.longitude;
                    let terdekat = bmkgStations[0];
                    let jarakMin = Infinity;

                    bmkgStations.forEach(st => {
                        const d = getDistanceFromLatLonInKm(userLat, userLon, parseFloat(st.lat), parseFloat(st.lon));
                        if (d < jarakMin) {
                            jarakMin = d;
                            terdekat = st;
                        }
                    });

                    elDropdownSelectedText.innerText = `${formatCity(terdekat.kota)}`;
                    fetchWeather(terdekat.id);
                },
                (err) => {
                    elDropdownSelectedText.innerText = "Jakarta Pusat";
                    fetchWeather("501233");
                }
            );
        }

    } catch (err) {
        console.error("Gagal load wilayah BMKG", err);
    }
}

initBMKG();