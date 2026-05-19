#include <WiFi.h>
#include <esp_now.h>
#include <Firebase_ESP_Client.h>
#include "esp_wifi.h"

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

#define WIFI_SSID "Kasminingsih"
#define WIFI_PASSWORD "hidet4mp4n"

#define API_KEY "AIzaSyC84gJ1b0FwP-xV0ckzRuV2HzOeNRYobGE"
#define DATABASE_URL "renterra-401c5-default-rtdb.asia-southeast1.firebasedatabase.app"

#define WIFI_CHANNEL 3

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Struktur wajib sinkron dengan Kebun (Fast Polling)
typedef struct DataPacket {
  uint8_t type; 
  int currentInterval;
  float temperature;
  float humidity;
  int rawSoil;
  int rawRain;
  int batteryPercentage;
} DataPacket;

DataPacket myData;
FirebaseJson json;
FirebaseJson historyJson; // Tambahan untuk memori history

uint8_t gardenMac[6];

// Buffer untuk 15 detik terakhir agar Real-time Chart web terisi penuh saat reload
#define MAX_LIVE_POINTS 15
float liveSuhu[MAX_LIVE_POINTS];
float liveKel[MAX_LIVE_POINTS];
int liveTanah[MAX_LIVE_POINTS];
int liveIndex = 0;
int liveCount = 0;

volatile bool newDataReady = false;
volatile bool needReply = false;

int currentUpdateInterval = 15;
unsigned long lastFbCheck = 0;
unsigned long lastHistoryPush = 0;
const unsigned long HISTORY_INTERVAL = 300000; // 5 Menit dalam milidetik

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(DataPacket)) {
    DataPacket incomingPacket;
    memcpy(&incomingPacket, incomingData, sizeof(incomingPacket));
    memcpy(gardenMac, info->src_addr, 6);

    portENTER_CRITICAL_ISR(&mux);
    
    // Hanya upload ke Firebase jika ini tipe 0 (Sensor), BUKAN Ping (tipe 1)
    if (incomingPacket.type == 0) {
      memcpy(&myData, &incomingPacket, sizeof(myData));
      newDataReady = true;
    }

    // Jika alat kebun tidak tahu interval terupdate kita, beri tahu!
    if (incomingPacket.currentInterval != currentUpdateInterval) {
      needReply = true;
    }

    portEXIT_CRITICAL_ISR(&mux);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println();
  Serial.print("WiFi Channel: ");
  Serial.println(WiFi.channel());

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase Ready");
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW Error");
    return;
  }

  esp_now_register_recv_cb(OnDataRecv);
  Serial.println("Gateway Ready");
}

void loop() {
  bool localNeedReply = false;
  bool localNewData = false;

  portENTER_CRITICAL(&mux);
  localNeedReply = needReply;
  localNewData = newDataReady;
  needReply = false;
  newDataReady = false;
  portEXIT_CRITICAL(&mux);

  // Bagian Heartbeat Reply (Sync Interval)
  if (localNeedReply) {
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, gardenMac, 6);
    peerInfo.channel = WIFI_CHANNEL;
    peerInfo.encrypt = false;

    if (!esp_now_is_peer_exist(gardenMac)) {
      esp_now_add_peer(&peerInfo);
    }

    esp_now_send(
      gardenMac,
      (uint8_t *)&currentUpdateInterval,
      sizeof(currentUpdateInterval)
    );
    
    Serial.printf("[ESP-NOW] Interval update (%d dtk) dikirim ke Kebun\n", currentUpdateInterval);
  }

  // Bagian Upload Firebase (Hanya dieksekusi dari DataPacket Type 0)
  if (localNewData) {
    Serial.println("\n[GATEWAY] DATA DITERIMA & DITERUSKAN");
    Serial.print("Suhu: "); Serial.println(myData.temperature);
    Serial.print("Lembap: "); Serial.println(myData.humidity);
    Serial.print("Tanah: "); Serial.println(myData.rawSoil);
    Serial.print("Hujan: "); Serial.println(myData.rawRain);
    Serial.print("Baterai: "); Serial.println(myData.batteryPercentage);

    if (Firebase.ready()) {
      // Simpan 15 titik terakhir di memori ESP32
      liveSuhu[liveIndex] = myData.temperature;
      liveKel[liveIndex] = myData.humidity;
      liveTanah[liveIndex] = myData.rawSoil;
      liveIndex = (liveIndex + 1) % MAX_LIVE_POINTS;
      if (liveCount < MAX_LIVE_POINTS) liveCount++;

      String liveStr = "";
      for (int i = 0; i < liveCount; i++) {
        int idx = (liveIndex - liveCount + i + MAX_LIVE_POINTS) % MAX_LIVE_POINTS;
        liveStr += String(liveSuhu[idx], 1) + "," + String(liveKel[idx], 1) + "," + String(liveTanah[idx]);
        if (i < liveCount - 1) liveStr += "|";
      }

      // 1. UPDATE DATA REAL-TIME (Tiban/Overwrite)
      json.clear();
      json.set("suhu", myData.temperature);
      json.set("kelembapan", myData.humidity);
      json.set("adc_tanah", myData.rawSoil);
      json.set("adc_hujan", myData.rawRain);
      json.set("baterai_persen", myData.batteryPercentage);
      json.set("live_buffer", liveStr);

      Firebase.RTDB.updateNode(&fbdo, "/SensorKebun", &json);
      Firebase.RTDB.setTimestamp(&fbdo, "/SensorKebun/last_update");
      
      // 2. PUSH DATA HISTORIS (Dibatasi per 5 menit agar DB tidak penuh)
      if (millis() - lastHistoryPush >= HISTORY_INTERVAL || lastHistoryPush == 0) {
        historyJson.clear();
        historyJson.set("suhu", myData.temperature);
        historyJson.set("kelembapan", myData.humidity);
        historyJson.set("adc_tanah", myData.rawSoil);
        historyJson.set("timestamp/.sv", "timestamp"); // Otomatis catat waktu server Firebase
        
        Firebase.RTDB.pushJSON(&fbdo, "/SensorHistory", &historyJson);
        lastHistoryPush = millis();
        Serial.println("[FIREBASE] Update Real-time & Push History OK");
      } else {
        Serial.println("[FIREBASE] Update Real-time OK (History Skipped)");
      }
    }
  }

  // Cek Interval Baru dari Web/Firebase (tiap 2 detik)
  if (millis() - lastFbCheck > 2000) {
    if (Firebase.ready()) {
      if (Firebase.RTDB.getInt(&fbdo, "/SensorKebun/update_interval")) {
        int fbInterval = fbdo.intData();
        // Cek agar tidak error jika interval diset 0 atau ngaco
        if (fbInterval >= 1 && fbInterval != currentUpdateInterval) {
          currentUpdateInterval = fbInterval;
          Serial.printf("[FIREBASE] Perintah interval baru di Web: %d detik\n", currentUpdateInterval);
        }
      }
    }
    lastFbCheck = millis();
  }
}