# Renterra: Smart Gateway & Agriculture Monitoring System

Renterra is an advanced, high-performance IoT agriculture monitoring system. Designed with power efficiency, architectural scalability, and real-time responsiveness in mind, Renterra consists of two ESP32 microcontrollers communicating via ESP-NOW, and a modern web dashboard integrated with Firebase Realtime Database.

## System Architecture

The ecosystem is divided into three core components:

### 1. Garden Node (`esp32-Garden`)
An ultra-low-power ESP32 placed in the field or garden. 
* **Sensors**: Reads Temperature & Humidity (DHT22), Soil Moisture (Analog), Raindrop intensity (Analog), and Battery Percentage.
* **Deep Sleep & Fast Polling**: Wakes up based on an adaptive interval, reads the sensors, transmits the payload via ESP-NOW (MAC Address targeted), and instantly returns to deep sleep to maximize battery lifespan.
* **Local UI**: Equipped with an I2C OLED display and physical buttons to manually traverse sensor data and local analytics without requiring an internet connection.

### 2. House Gateway (`esp32-House`)
The bridge between the local sensor network and the cloud.
* **ESP-NOW Receiver**: Asynchronously listens for data payloads from the Garden Node on a specific WiFi channel.
* **Storage Decoupling Algorithm**: Solves the common IoT database bloat issue. It updates the real-time node (`/SensorKebun`) every second using an O(1) overwrite operation, while appending data to the historical node (`/SensorHistory`) only once every 5 minutes.
* **In-Memory Rolling Buffer**: Maintains an internal RAM buffer of the last 15 seconds of sensor readings. This array is serialized into a string and sent to Firebase, allowing the web dashboard to instantly populate the real-time chart upon reload without making heavy historical queries.

### 3. Web Dashboard
A sleek, responsive, and premium web interface built with HTML, CSS, and Vanilla JavaScript.
* **Real-time Analytics**: Utilizes `Chart.js` to render live data streams and historical trends (Hourly, Daily, Weekly, Monthly). The charts feature isolated Y-axes to accurately visualize micro-fluctuations across vastly different data scales.
* **AI Agri-Insight**: Parses live environmental variables to dynamically generate instant, actionable agronomic advice.
* **BMKG Weather Integration**: Automatically fetches Indonesian Meteorological (BMKG) weather forecasts based on client geolocation to assist in watering and maintenance decisions.

## Setup & Installation

### Hardware Requirements
* 2x ESP32 Development Boards
* 1x DHT22 Sensor
* 1x Analog Soil Moisture Sensor
* 1x Analog Raindrop Sensor
* 1x 0.91" I2C OLED Display
* 4x Push buttons (for Garden Node menu navigation)

### Software & Cloud
* **Firebase Realtime Database**: Create a project, provision an RTDB instance, and copy your API Key and Database URL into the Gateway configuration.
* **Arduino IDE**: Install `esp_now`, `Firebase_ESP_Client`, `DHT sensor library`, `Adafruit_GFX`, and `Adafruit_SSD1306` libraries.

### Deployment Steps
1. **Flash Garden Node**: Upload `esp32-Garden.ino`. Ensure the `gatewayMac` address variable precisely matches the hardware MAC address of your House Gateway.
2. **Flash House Gateway**: Upload `esp32-House.ino`. Enter your WiFi SSID, Password, and Firebase credentials in the defined macros.
3. **Web Dashboard**: Host the `WebPage` directory on any static hosting service (e.g., Firebase Hosting, Vercel, GitHub Pages) or serve it locally.

## Engineering Highlights
- **Zero Database Bloat**: By separating 1-second real-time updates from 5-minute historical pushes, the system conservatively saves over 86,000 database writes per day.
- **Semantic UI/UX Design**: The dashboard features a highly curated, premium color palette with strict utility classes assigned to exact agricultural roles for rapid cognitive scanning (*glanceability*).
- **Asynchronous Data Queueing**: Data is pushed via a dynamic array parsing algorithm on the front end, flawlessly aligning time-series charts from right to left without scale collapse.
