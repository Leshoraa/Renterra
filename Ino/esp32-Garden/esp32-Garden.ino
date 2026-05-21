#include <math.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <WiFi.h>
#include <esp_now.h>
#include <driver/rtc_io.h>
#include "esp_wifi.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

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

typedef struct DataPacket {
  uint8_t type;
  int currentInterval;
  float temperature;
  float humidity;
  int rawSoil;
  int rawRain;
  int batteryPercentage;
} DataPacket;

RTC_DATA_ATTR int currentMenu = 1;
RTC_DATA_ATTR int currentSensorInterval = 15;

unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 200;

bool btn1_lastState = HIGH;
unsigned long btn1_pressTime = 0;
bool btn1_counting = false;
const unsigned long minShortPress = 50;
const unsigned long longPressTime = 3000;

unsigned long startAwakeMillis = 0;
const unsigned long AWAKE_DURATION = 10000;

volatile bool intervalReceived = false;

const uint8_t gatewayMac[] = {0xA4, 0xF0, 0x0F, 0x73, 0xCB, 0xD0};

float cachedTemp = 0.0;
float cachedHum = 0.0;
unsigned long lastDhtRead = 0;

void updateDhtCache() {
  if (millis() - lastDhtRead >= 2000 || lastDhtRead == 0) {
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (!isnan(t)) cachedTemp = t;
    if (!isnan(h)) cachedHum = h;
    lastDhtRead = millis();
  }
}

void silentDeepSleep() {
  rtc_gpio_init((gpio_num_t)btn1);
  rtc_gpio_set_direction((gpio_num_t)btn1, RTC_GPIO_MODE_INPUT_ONLY);
  rtc_gpio_pullup_en((gpio_num_t)btn1);
  rtc_gpio_pulldown_dis((gpio_num_t)btn1);
  
  uint64_t sleepTime = (uint64_t)currentSensorInterval * 1000000ULL;
  esp_sleep_enable_timer_wakeup(sleepTime);
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

void OnDataSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {}

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

void sendData() {
  WiFi.mode(WIFI_STA);
  delay(10);
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

  updateDhtCache();
  DataPacket packet;
  packet.type = 0;
  packet.currentInterval = currentSensorInterval;
  packet.temperature = cachedTemp;
  packet.humidity = cachedHum;
  packet.rawSoil = analogRead(pinSoilMoisture);
  packet.rawRain = analogRead(pinRaindrop);
  packet.batteryPercentage = readBattery();
  
  Serial.printf("[ESP-NOW] Mengirim DATA: %.1fC | %.1f%%\n", packet.temperature, packet.humidity);

  intervalReceived = false;
  esp_now_send(gatewayMac, (uint8_t *)&packet, sizeof(packet));

  unsigned long waitStart = millis();
  while (!intervalReceived && millis() - waitStart < 500) {
    delay(10);
  }
  
  esp_now_deinit();
  WiFi.mode(WIFI_OFF);
  btStop();
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // Mematikan paksa Brownout Detector
  
  Serial.begin(115200);
  setCpuFrequencyMhz(80);
  WiFi.mode(WIFI_OFF);
  btStop();
  analogReadResolution(12);

  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
  if (wakeup_reason == ESP_SLEEP_WAKEUP_TIMER) {
    dht.begin();
    sendData();
    silentDeepSleep();
  }
  
  pinMode(btn1, INPUT_PULLUP);
  pinMode(btn2, INPUT_PULLUP);
  pinMode(btn3, INPUT_PULLUP);
  pinMode(btn4, INPUT_PULLUP);

  if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
    while (digitalRead(btn1) == LOW) {
      delay(10);
    }
  }

  dht.begin();
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED Gagal");
    for (;;) { delay(100); }
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
    sendData();
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
  updateDhtCache();
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  float t = cachedTemp;
  float h = cachedHum;
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
      display.print("[4] Analitik");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      
      float svp = 0.61078 * exp((17.27 * t) / (t + 237.3));
      float avp = svp * (h / 100.0);
      float vpd = svp - avp;
      
      display.print("VPD: ");
      display.print(vpd, 2);
      display.println(" kPa");
      
      if (rawSoil > 3000) display.println("Info: Cek Web Cuaca");
      else display.println("Info: Kondisi Aman");
      break;
  }
  display.display();
}

void printToSerial() {
  updateDhtCache();
  float t = cachedTemp;
  float h = cachedHum;
  int rawSoil = analogRead(pinSoilMoisture);
  int rawRain = analogRead(pinRaindrop);
  Serial.print(F("Suhu  : ")); Serial.println(t);
  Serial.print(F("Udara : ")); Serial.println(h);
  Serial.print(F("Soil  : ")); Serial.println(rawSoil);
  Serial.print(F("Rain  : ")); Serial.println(rawRain);
  Serial.print(F("Sleep : "));
  Serial.print(currentSensorInterval);
  Serial.println(F(" detik (Interval Aktual)\n"));
}