#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <WiFi.h>
#include <esp_now.h>
#include <driver/rtc_io.h>
#include "esp_wifi.h"

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1

#define WIFI_CHANNEL 3

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define DHTPIN 15
#define DHTTYPE DHT22

DHT dht(DHTPIN, DHTTYPE);

const int pinSoilMoisture = 35;
const int pinRaindrop = 34;
const int pinBattery = 32;

const int btn1 = 26;
const int btn2 = 27;
const int btn3 = 13;
const int btn4 = 14;

// Struktur baru dengan flag tipe pesan dan report interval
typedef struct DataPacket {
  uint8_t type; // 0 = Data Sensor, 1 = Ping/Heartbeat
  int currentInterval;
  float temperature;
  float humidity;
  int rawSoil;
  int rawRain;
  int batteryPercentage;
} DataPacket;

RTC_DATA_ATTR int currentMenu = 1;
RTC_DATA_ATTR int currentSensorInterval = 15; // Interval baca sensor (dalam detik)
RTC_DATA_ATTR int cycleCounter = 0;           // Penghitung siklus bangun 1 detik

unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 200;

bool btn1_lastState = HIGH;
unsigned long btn1_pressTime = 0;
bool btn1_counting = false;
const unsigned long minShortPress = 50;
const unsigned long longPressTime = 3000;

unsigned long startAwakeMillis = 0;
const unsigned long AWAKE_DURATION = 10000;

bool intervalReceived = false;

uint8_t gatewayMac[] = {0xA4, 0xF0, 0x0F, 0x73, 0xCB, 0xD0};

void silentDeepSleep() {
  rtc_gpio_init((gpio_num_t)btn1);
  rtc_gpio_set_direction((gpio_num_t)btn1, RTC_GPIO_MODE_INPUT_ONLY);
  rtc_gpio_pullup_en((gpio_num_t)btn1);
  rtc_gpio_pulldown_dis((gpio_num_t)btn1);

  // Selalu tidur tepat 1 detik untuk Fast Polling
  esp_sleep_enable_timer_wakeup(1000000ULL);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)btn1, 0);

  esp_deep_sleep_start();
}

void enterDeepSleep() {
  display.clearDisplay();
  display.display();
  display.ssd1306_command(SSD1306_DISPLAYOFF);
  silentDeepSleep();
}

int readBattery() {
  int rawBat = analogRead(pinBattery);
  int percent = map(rawBat, 1860, 2610, 0, 100);
  if (percent > 100) percent = 100;
  if (percent < 0) percent = 0;
  return percent;
}

void OnDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("GAGAL! Node Rumah tidak merespon");
  }
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(int)) {
    int newInterval = 15;
    memcpy(&newInterval, incomingData, sizeof(newInterval));

    if (newInterval >= 1) {
      currentSensorInterval = newInterval;
      intervalReceived = true;
      Serial.printf("[ESP-NOW] Interval baru diterima: %d detik\n", newInterval);
    }
  }
}

void sendData(bool fullSensorRead) {
  WiFi.mode(WIFI_STA);
  delay(10); // Waktu inisialisasi minimal

  if (esp_now_init() != ESP_OK) return;
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

  esp_now_register_send_cb(OnDataSent);
  esp_now_register_recv_cb(OnDataRecv);

  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, gatewayMac, 6);
  peerInfo.channel = WIFI_CHANNEL;
  peerInfo.encrypt = false;

  if (!esp_now_is_peer_exist(gatewayMac)) {
    esp_now_add_peer(&peerInfo);
  }

  DataPacket packet;
  packet.currentInterval = currentSensorInterval;
  
  if (fullSensorRead) {
    packet.type = 0; // Tipe Data
    packet.temperature = dht.readTemperature();
    packet.humidity = dht.readHumidity();
    packet.rawSoil = analogRead(pinSoilMoisture);
    packet.rawRain = analogRead(pinRaindrop);
    packet.batteryPercentage = readBattery();
    cycleCounter = 0; // Reset counter setelah baca sensor utuh
    Serial.printf("[ESP-NOW] Mengirim DATA: %.1fC | %.1f%%\n", packet.temperature, packet.humidity);
  } else {
    packet.type = 1; // Tipe Ping
    packet.temperature = 0;
    packet.humidity = 0;
    packet.rawSoil = 0;
    packet.rawRain = 0;
    packet.batteryPercentage = 0;
  }

  intervalReceived = false;
  esp_now_send(gatewayMac, (uint8_t *)&packet, sizeof(packet));

  unsigned long waitStart = millis();
  // Tunggu balasan dari Gateway max 150ms untuk menghemat baterai
  while (!intervalReceived && millis() - waitStart < 150) {
    delay(10);
  }

  esp_now_deinit();
  WiFi.mode(WIFI_OFF);
  btStop();
}

void setup() {
  Serial.begin(115200);
  setCpuFrequencyMhz(80);
  WiFi.mode(WIFI_OFF);
  btStop();
  analogReadResolution(12);

  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();

  if (wakeup_reason == ESP_SLEEP_WAKEUP_TIMER) {
    cycleCounter++;
    bool timeToReadSensors = (cycleCounter >= currentSensorInterval);
    
    // Inisialisasi DHT hanya jika sudah waktunya baca sensor
    if (timeToReadSensors) {
      dht.begin();
    }
    
    sendData(timeToReadSensors);
    silentDeepSleep(); // Langsung tidur lagi selama 1 detik
  }
  
  // LOGIKA SAAT DIBANGUNKAN MANUAL (TOMBOL EXT0)
  if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
    while (digitalRead(btn1) == LOW) {
      delay(10);
    }
  }

  dht.begin();

  pinMode(btn1, INPUT_PULLUP);
  pinMode(btn2, INPUT_PULLUP);
  pinMode(btn3, INPUT_PULLUP);
  pinMode(btn4, INPUT_PULLUP);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    for (;;) {}
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.setRotation(2);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println("  Sistem Pemantauan");
  display.setCursor(0, 20);
  display.println("    Kualitas Tanah");
  display.display();
  
  delay(2000);
  startAwakeMillis = millis();
  updateDisplay();
}

void loop() {
  checkButtons();

  static unsigned long lastSerialPrint = 0;

  if (millis() - lastSerialPrint > 2000) {
    printToSerial();
    updateDisplay();
    lastSerialPrint = millis();
  }

  if (millis() - startAwakeMillis >= AWAKE_DURATION) {
    sendData(true); // Kirim update data terbaru sebelum mematikan layar
    enterDeepSleep();
  }
}

void checkButtons() {
  unsigned long currentMillis = millis();
  bool btn1_state = digitalRead(btn1);

  if (btn1_state == LOW && btn1_lastState == HIGH) {
    btn1_pressTime = currentMillis;
    btn1_counting = true;
  }

  if (btn1_counting && btn1_state == LOW) {
    if (currentMillis - btn1_pressTime >= longPressTime) {
      ESP.restart();
    }
  }

  if (btn1_state == HIGH && btn1_lastState == LOW) {
    btn1_counting = false;
    unsigned long durasiTekan = currentMillis - btn1_pressTime;

    if (durasiTekan >= minShortPress && durasiTekan < longPressTime) {
      currentMenu = 1;
      startAwakeMillis = currentMillis;
      updateDisplay();
    }
  }

  btn1_lastState = btn1_state;

  if ((currentMillis - lastDebounceTime) > debounceDelay) {
    if (digitalRead(btn2) == LOW) {
      currentMenu = 2;
      startAwakeMillis = currentMillis;
      updateDisplay();
      lastDebounceTime = currentMillis;
    }
    else if (digitalRead(btn3) == LOW) {
      currentMenu = 3;
      startAwakeMillis = currentMillis;
      updateDisplay();
      lastDebounceTime = currentMillis;
    }
    else if (digitalRead(btn4) == LOW) {
      currentMenu = 4;
      startAwakeMillis = currentMillis;
      updateDisplay();
      lastDebounceTime = currentMillis;
    }
  }
}

void updateDisplay() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);

  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int rawSoil = analogRead(pinSoilMoisture);
  int rawRain = analogRead(pinRaindrop);
  int batteryPercentage = readBattery();

  switch (currentMenu) {
    case 1:
      display.print("[1] Udara");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      display.print("Suhu : ");
      display.print(t, 1);
      display.println(" C");
      display.print("Lembap: ");
      display.print(h, 1);
      display.println(" %");
      break;

    case 2:
      display.print("[2] Tanah");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      display.print("ADC: ");
      display.println(rawSoil);
      if (rawSoil > 3000) display.println("KERING");
      else if (rawSoil > 1500) display.println("LEMBAP");
      else display.println("BASAH");
      break;

    case 3:
      display.print("[3] Cuaca");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      display.print("ADC: ");
      display.println(rawRain);
      if (rawRain > 3000) display.println("CERAH");
      else if (rawRain > 2000) display.println("GERIMIS");
      else display.println("HUJAN");
      break;

    case 4:
      display.print("[4] Analytics");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      if (rawRain <= 2000) display.println("Siram: JANGAN");
      else if (rawSoil > 3000) display.println("Siram: PERLU");
      else display.println("Siram: AMAN");
      break;
  }
  display.display();
}

void printToSerial() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int rawSoil = analogRead(pinSoilMoisture);
  int rawRain = analogRead(pinRaindrop);

  Serial.print("Suhu  : "); Serial.println(t);
  Serial.print("Udara : "); Serial.println(h);
  Serial.print("Soil  : "); Serial.println(rawSoil);
  Serial.print("Rain  : "); Serial.println(rawRain);
  Serial.print("Sleep : ");
  Serial.print(currentSensorInterval);
  Serial.println(" detik (Interval Aktual)");
  Serial.println();
}