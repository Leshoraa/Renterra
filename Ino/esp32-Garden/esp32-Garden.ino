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
#define OLED_RESET    -1
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

RTC_DATA_ATTR int currentMenu = 1; 

unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 200; 

bool btn1_lastState = HIGH;
unsigned long btn1_pressTime = 0;
bool btn1_counting = false;
const unsigned long minShortPress = 50;   
const unsigned long longPressTime = 3000; 

unsigned long startAwakeMillis = 0;
const unsigned long AWAKE_DURATION = 10000; 
const uint64_t TIME_TO_SLEEP_MINUTES = 15; 

uint8_t broadcastAddress[] = {0xA4, 0xF0, 0x0F, 0x73, 0xCB, 0xD0};

struct DataPacket {
  float temperature;
  float humidity;
  int rawSoil;
  int rawRain;
  int batteryPercentage;
};

void silentDeepSleep() {
  rtc_gpio_init((gpio_num_t)btn1);
  rtc_gpio_set_direction((gpio_num_t)btn1, RTC_GPIO_MODE_INPUT_ONLY);
  rtc_gpio_pullup_en((gpio_num_t)btn1);
  rtc_gpio_pulldown_dis((gpio_num_t)btn1);

  esp_sleep_enable_timer_wakeup(TIME_TO_SLEEP_MINUTES * 60 * 1000000ULL);
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

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.print("[ESP-NOW] STATUS: ");
  if (status == ESP_NOW_SEND_SUCCESS) {
    Serial.println("Diterima Node Rumah");
  } else {
    Serial.println("GAGAL! Node Rumah tidak merespon");
  }
}

void sendData() {
  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(3, WIFI_SECOND_CHAN_NONE);
  delay(100); 
  
  if (esp_now_init() != ESP_OK) {
    Serial.println("[ESP-NOW] Gagal Inisialisasi!");
    return;
  }

  esp_now_register_send_cb((esp_now_send_cb_t)OnDataSent);
  
  esp_now_peer_info_t peerInfo;
  memset(&peerInfo, 0, sizeof(peerInfo));
  
  memcpy(peerInfo.peer_addr, broadcastAddress, 6);
  peerInfo.channel = 3;  
  peerInfo.encrypt = false;
  
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("[ESP-NOW] Gagal Menambahkan Peer!");
    return;
  }

  DataPacket packet;
  packet.temperature = dht.readTemperature();
  packet.humidity = dht.readHumidity();
  packet.rawSoil = analogRead(pinSoilMoisture);
  packet.rawRain = analogRead(pinRaindrop);
  packet.batteryPercentage = readBattery();

  Serial.println("[ESP-NOW] Mengirim data*...");
  esp_now_send(broadcastAddress, (uint8_t *) &packet, sizeof(packet));
  
  delay(500); 
  
  WiFi.mode(WIFI_OFF);
  btStop();
}

void setup() {
  setCpuFrequencyMhz(80);
  WiFi.mode(WIFI_OFF);
  btStop();

  analogReadResolution(12);
  dht.begin();

  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();

  if (wakeup_reason == ESP_SLEEP_WAKEUP_TIMER) {
    sendData();
    silentDeepSleep(); 
  }

  Serial.begin(115200);

  pinMode(btn1, INPUT_PULLUP);
  pinMode(btn2, INPUT_PULLUP);
  pinMode(btn3, INPUT_PULLUP);
  pinMode(btn4, INPUT_PULLUP);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    for(;;); 
  }
  
  display.ssd1306_command(SSD1306_DISPLAYON);
  display.setRotation(2);
  
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println("  Sistem Pemantauan  ");
  display.setCursor(0, 20);
  display.println("    Kualitas Tanah   ");
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
      display.clearDisplay();
      display.setTextSize(1);
      display.setCursor(0, 5);
      display.println("RESET SYSTEM");
      display.setCursor(0, 20);
      display.println("Rebooting ESP32...");
      display.display();
      
      delay(1500); 
      
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
      if (isnan(t) || isnan(h)) {
        display.println("Gagal baca DHT!");
      } else {
        display.print("Suhu : "); display.print(t, 1); display.println(" C");
        display.print("Lembap: "); display.print(h, 1); display.println(" %");
      }
      break;

    case 2:
      display.print("[2] Tanah");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      display.print("Raw ADC: "); display.println(rawSoil);
      if (rawSoil > 3000) {
        display.println("Status: KERING");
      } else if (rawSoil > 1500) {
        display.println("Status: LEMBAP");
      } else {
        display.println("Status: BASAH");
      }
      break;

    case 3:
      display.print("[3] Cuaca");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      display.print("Raw ADC: "); display.println(rawRain);
      if (rawRain > 3000) {
        display.println("Cuaca: CERAH");
      } else if (rawRain > 2000) {
        display.println("Cuaca: GERIMIS");
      } else {
        display.println("Cuaca: HUJAN DERAS");
      }
      break;

    case 4:
      display.print("[4] Analytics");
      display.setCursor(98, 0);
      display.print(batteryPercentage);
      display.println("%");
      
      if (rawRain <= 2000) {
        display.println("Siram: JANGAN (Hujan)");
      } else if (rawSoil > 3000) {
        if (!isnan(t) && t > 32.0) {
          display.println("Siram: KRITIS (Panas)");
        } else {
          display.println("Siram: PERLU");
        }
      } else {
        display.println("Siram: AMAN (Cukup)");
      }
      
      if (rawRain <= 2000) {
        display.println("Pupuk: JANGAN (Hanyut)");
      } else if (rawSoil > 3000) {
        display.println("Pupuk: TUNDA (Kering)");
      } else if (!isnan(t) && t > 33.0) {
        display.println("Pupuk: TUNDA (Terik)");
      } else if (rawSoil > 1500 && rawSoil <= 3000) {
        display.println("Pupuk: OPTIMAL");
      } else {
        display.println("Pupuk: BOLEH");
      }
      break;
  }
  display.display();
}

void printToSerial() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int rawSoil = analogRead(pinSoilMoisture);
  int rawRain = analogRead(pinRaindrop);

  if (isnan(t) || isnan(h)) {
    Serial.println("DHT22 : Gagal Terbaca");
  } else {
    Serial.print("Suhu  : "); Serial.print(t); Serial.println(" °C");
    Serial.print("Udara : "); Serial.print(h); Serial.println(" %");
  }
  Serial.print("Soil ADC: "); Serial.println(rawSoil);
  Serial.print("Rain ADC: "); Serial.println(rawRain);
  Serial.println("");
}