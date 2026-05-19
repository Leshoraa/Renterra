#include <WiFi.h>
#include <esp_now.h>
#include <Firebase_ESP_Client.h>

// Provide the token generation process info.
#include "addons/TokenHelper.h"
// Provide the RTDB payload printing info and other helper functions.
#include "addons/RTDBHelper.h"

// Kredensial WiFi Rumah
#define WIFI_SSID "Kasminingsih"
#define WIFI_PASSWORD "hidet4mp4n"

// --- KONFIGURASI FIREBASE ---
#define API_KEY "AIzaSyC84gJ1b0FwP-xV0ckzRuV2HzOeNRYobGE"
#define DATABASE_URL "renterra-401c5-default-rtdb.asia-southeast1.firebasedatabase.app"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Struktur data harus sama persis dengan yang ada di esp32-Garden.ino
typedef struct DataPacket {
  float temperature;
  float humidity;
  int rawSoil;
  int rawRain;
  int batteryPercentage;
} DataPacket;

DataPacket myData;
volatile bool newDataReady = false;

// Callback ketika menerima data dari Node Kebun via ESP-NOW
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  memcpy(&myData, incomingData, sizeof(myData));
  newDataReady = true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // 1. Koneksi ke WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\nConnected to Wi-Fi");

  // 2. Inisialisasi Firebase
  Serial.printf("Firebase Client v%s\n\n", FIREBASE_CLIENT_VERSION);
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  // Sign up anonim/akses langsung
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase Auth success");
  } else {
    Serial.printf("%s\n", config.signer.signupError.message.c_str());
  }

  // Assign the callback function for the long running token generation task
  config.token_status_callback = tokenStatusCallback;
  
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // 3. Inisialisasi ESP-NOW
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return;
  }
  esp_now_register_recv_cb((esp_now_recv_cb_t)OnDataRecv);
  
  Serial.println("Sistem Gateway Siap Menerima & Mengunggah Data!");
}

void loop() {
  // Jika ada data baru dari ESP-NOW
  if (newDataReady) {
    newDataReady = false;

    Serial.println("\n[GATEWAY] DATA DITERIMA DARI KEBUN:");
    Serial.print("Suhu: "); Serial.println(myData.temperature);
    Serial.print("Lembap: "); Serial.println(myData.humidity);
    Serial.print("Tanah (ADC): "); Serial.println(myData.rawSoil);
    Serial.print("Hujan (ADC): "); Serial.println(myData.rawRain);
    Serial.print("Baterai: "); Serial.print(myData.batteryPercentage); Serial.println("%");

    // Proses pengiriman ke Firebase Realtime Database
    if (Firebase.ready()) {
      Serial.println("[FIREBASE] Mengunggah data ke Cloud...");

      // Mengirim data ke path "/SensorKebun" di database
      Firebase.RTDB.setFloat(&fbdo, "/SensorKebun/suhu", myData.temperature);
      Firebase.RTDB.setFloat(&fbdo, "/SensorKebun/kelembapan", myData.humidity);
      Firebase.RTDB.setInt(&fbdo, "/SensorKebun/adc_tanah", myData.rawSoil);
      Firebase.RTDB.setInt(&fbdo, "/SensorKebun/adc_hujan", myData.rawRain);
      Firebase.RTDB.setInt(&fbdo, "/SensorKebun/baterai_persen", myData.batteryPercentage);
      
      // Memberi timestamp (waktu server Firebase) kapan data terakhir masuk
      Firebase.RTDB.setTimestamp(&fbdo, "/SensorKebun/last_update");

      Serial.println("[FIREBASE] Unggah Berhasil!");
    } else {
      Serial.println("[FIREBASE] Koneksi Firebase belum siap/terputus.");
    }
  }
}