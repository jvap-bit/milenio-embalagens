/*
  MILÊNIO EMBALAGENS - contador de produção para ESP32
  Conta os pulsos do sensor da máquina, converte em peças (calibração vem do servidor) e envia ao banco de dados.

  - Se o Wi-Fi ou o servidor cair, as contagens ficam numa fila na memória e são enviadas quando voltar.
    Cada envio leva um identificador único: se o mesmo envio chegar duas vezes, o servidor grava só uma.
  - A calibração (pulsos por peça) e o intervalo de envio são lidos do servidor ao ligar (tela/CLI: banco/manutencao.js calibrar).
  - Sem bibliotecas extras: só as que já vêm com o pacote "esp32" da Arduino IDE (WiFi, HTTPClient, Preferences).
  Placa: "ESP32 Dev Module" (ou a sua). Monitor serial: 115200.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include "config.h"

#define FW_VERSAO "1.0.0"

// ---------- contagem de pulsos ----------
volatile uint32_t pulsos = 0;
volatile uint32_t ultimoPulsoUs = 0;
void IRAM_ATTR aoPulso() {
  uint32_t t = micros();
  if (t - ultimoPulsoUs >= DEBOUNCE_US) { pulsos++; ultimoPulsoUs = t; }
}

// ---------- estado ----------
uint32_t pulsosPorPeca = 1;          // vem do servidor
uint32_t intervaloEnvioMs = 5000;    // vem do servidor
uint32_t acumulador = 0;             // pulsos que ainda não completaram uma peça
uint32_t bootId = 0, seqEvento = 0;
uint32_t tEnvio = 0, tPing = 0, tConfig = 0;

struct Evento { uint32_t pecas; uint32_t t; uint32_t seq; };
Evento fila[MAX_FILA];
int nFila = 0;

#if PINO_PARADA >= 0
bool paradaDesejada = false, paradaEnviada = false;
uint32_t tParada = 0;
#endif

// ---------- utilidades ----------
// Lê um número inteiro de um JSON simples: {"campo":123,...}
long jsonNumero(const String &json, const char *campo, long padrao) {
  String chave = String("\"") + campo + "\":";
  int i = json.indexOf(chave);
  if (i < 0) return padrao;
  return json.substring(i + chave.length()).toInt();
}

bool wifiOk() { return WiFi.status() == WL_CONNECTED; }

void conectaWifi(uint32_t limiteMs) {
  if (wifiOk()) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  Serial.print("Conectando ao Wi-Fi");
  uint32_t t0 = millis();
  while (!wifiOk() && millis() - t0 < limiteMs) { delay(300); Serial.print("."); }
  Serial.println(wifiOk() ? " ok  IP " + WiFi.localIP().toString() : " sem conexao (vai tentar de novo)");
}

// Faz uma chamada ao servidor. Devolve o código HTTP (ou -1) e o corpo da resposta em 'resposta'.
int chama(const char *metodo, const String &caminho, const String &corpo, String &resposta) {
  if (!wifiOk()) return -1;
  HTTPClient http;
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  if (!http.begin(String(SERVIDOR_URL) + caminho)) return -1;
  http.addHeader("X-Device-Token", TOKEN_DISPOSITIVO);
  http.addHeader("Content-Type", "application/json");
  int codigo = (metodo[0] == 'G') ? http.GET() : http.POST(corpo);
  resposta = codigo > 0 ? http.getString() : "";
  http.end();
  return codigo;
}

// ---------- configuração vinda do servidor ----------
void buscaConfig() {
  String r;
  int c = chama("GET", String("/api/dispositivo/config?fw=") + FW_VERSAO + "&rssi=" + (int)WiFi.RSSI(), "", r);
  if (c == 200) {
    long p = jsonNumero(r, "pulsos_por_peca", 1), s = jsonNumero(r, "intervalo_envio_s", 5);
    pulsosPorPeca = p < 1 ? 1 : p;
    intervaloEnvioMs = (s < 1 ? 1 : s > 3600 ? 3600 : s) * 1000UL;
    Serial.printf("Config: %lu pulsos = 1 peca, envio a cada %lu s\n", (unsigned long)pulsosPorPeca, (unsigned long)(intervaloEnvioMs / 1000));
  } else if (c == 401) {
    Serial.println("ERRO: token recusado. Confira TOKEN_DISPOSITIVO em config.h");
  } else {
    Serial.printf("Config nao obtida (codigo %d). Usando os valores atuais.\n", c);
  }
}

void ping() {
  String r;
  chama("POST", "/api/dispositivo/ping", String("{\"firmware\":\"") + FW_VERSAO + "\",\"rssi\":" + (int)WiFi.RSSI() + "}", r);
}

// ---------- fila de contagens ----------
void enfileira(uint32_t pecas) {
  if (nFila >= MAX_FILA) { fila[MAX_FILA - 1].pecas += pecas; return; }   // fila cheia: soma na última (nada se perde)
  fila[nFila].pecas = pecas;
  fila[nFila].t = millis();
  fila[nFila].seq = ++seqEvento;
  nFila++;
}

void enviaFila() {
  if (nFila == 0 || !wifiOk()) return;
  int n = nFila < 50 ? nFila : 50;
  String corpo = String("{\"maquina\":\"") + ID_MAQUINA + "\",\"eventos\":[";
  uint32_t agora = millis();
  for (int i = 0; i < n; i++) {
    if (i) corpo += ",";
    corpo += String("{\"pecas\":") + fila[i].pecas + ",\"uid\":\"" + bootId + "-" + fila[i].seq + "\",\"atras_ms\":" + (agora - fila[i].t) + "}";
  }
  corpo += "]}";
  String r;
  int c = chama("POST", "/api/eventos", corpo, r);
  bool descarta = (c == 200 || c == 201 || c == 400);   // 400 = servidor recusou os dados: não adianta reenviar
  if (descarta) {
    for (int i = n; i < nFila; i++) fila[i - n] = fila[i];
    nFila -= n;
    if (c == 400) Serial.println("Servidor recusou o envio (400): " + r);
  } else if (c == 401 || c == 403) {
    Serial.println("Servidor negou (" + String(c) + "): confira ID_MAQUINA e TOKEN_DISPOSITIVO. " + r);
  } else {
    Serial.printf("Sem resposta do servidor (codigo %d). %d envio(s) na fila.\n", c, nFila);
  }
}

#if PINO_PARADA >= 0
void trataParada() {
  bool lido = digitalRead(PINO_PARADA) == LOW;
  static bool anterior = false;
  if (lido != anterior) { anterior = lido; paradaDesejada = lido; tParada = millis(); }   // a hora fica guardada
  if (paradaDesejada == paradaEnviada || !wifiOk() || millis() - tParada < 300) return;   // 300 ms: ignora trepidação da chave
  String corpo = paradaDesejada
    ? String("{\"acao\":\"iniciar\",\"motivo\":\"") + MOTIVO_PARADA + "\",\"atras_ms\":" + (millis() - tParada) + "}"
    : String("{\"acao\":\"encerrar\",\"retomar\":true,\"atras_ms\":") + (millis() - tParada) + "}";
  String r;
  int c = chama("POST", "/api/paradas", corpo, r);
  if (c == 200 || c == 201 || c == 400) paradaEnviada = paradaDesejada;
  Serial.printf("Parada %s -> codigo %d\n", paradaDesejada ? "INICIADA" : "ENCERRADA", c);
}
#endif

// ---------- programa ----------
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nMilenio contador - firmware " FW_VERSAO " - maquina " ID_MAQUINA);
  if (PINO_LED >= 0) pinMode(PINO_LED, OUTPUT);

  Preferences prefs;                       // contador de partidas: faz os identificadores de envio nunca se repetirem
  prefs.begin("milenio", false);
  bootId = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootId);
  prefs.end();

  pinMode(PINO_SENSOR, SENSOR_PULLUP ? INPUT_PULLUP : INPUT);
#if PINO_PARADA >= 0
  pinMode(PINO_PARADA, INPUT_PULLUP);
#endif
  attachInterrupt(digitalPinToInterrupt(PINO_SENSOR), aoPulso, BORDA_PULSO);

  conectaWifi(15000);
  buscaConfig();
  ping();
  tEnvio = tPing = tConfig = millis();
}

void loop() {
  uint32_t agora = millis();
  if (PINO_LED >= 0) digitalWrite(PINO_LED, wifiOk() ? HIGH : LOW);
  if (!wifiOk()) { static uint32_t tTenta = 0; if (agora - tTenta > 10000) { tTenta = agora; conectaWifi(8000); } }

  if (agora - tEnvio >= intervaloEnvioMs) {
    tEnvio = agora;
    noInterrupts(); uint32_t p = pulsos; pulsos = 0; interrupts();
    acumulador += p;
    uint32_t pecas = acumulador / pulsosPorPeca;
    acumulador -= pecas * pulsosPorPeca;
    if (pecas) { enfileira(pecas); Serial.printf("+%lu peca(s)  (%lu pulsos)\n", (unsigned long)pecas, (unsigned long)p); }
    enviaFila();
  }
  if (agora - tPing >= 30000UL) { tPing = agora; ping(); }
  if (agora - tConfig >= 600000UL) { tConfig = agora; buscaConfig(); }
#if PINO_PARADA >= 0
  trataParada();
#endif
  delay(5);
}
