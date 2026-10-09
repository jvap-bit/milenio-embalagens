// ===== CONFIGURAÇÃO DO ESP32 - edite só este arquivo =====
// Um ESP32 por máquina. Cada um usa o SEU token (servidor/dados/esp32_tokens.txt).

// --- Wi-Fi (rede 2,4 GHz; o ESP32 não conecta em 5 GHz) ---
#define WIFI_SSID   " "
#define WIFI_SENHA  "uva passa"

// --- Servidor Milênio (o computador onde roda o server.js) ---
// Use o IP FIXO do computador, sem barra no final. Exemplo: "http://192.168.0.10:3000"
// Só http:// (se você ativou HTTPS no servidor, veja docs/ESP32.md).
#define SERVIDOR_URL "http://192.168.0.10:3000"

// --- Identificação ---
#define ID_MAQUINA        "01"                       // mesmo ID da tela Máquinas
#define TOKEN_DISPOSITIVO "COLE_AQUI_O_TOKEN"        // linha desta máquina em servidor/dados/esp32_tokens.txt

// --- Sensor de contagem (indutivo, óptico, fim de curso...) ---
#define PINO_SENSOR    27       // GPIO ligado ao sinal do sensor (já em 3,3 V!)
#define SENSOR_PULLUP  true     // true: usa o resistor interno e conta quando o pino vai a GND (contato/coletor aberto)
#define BORDA_PULSO    FALLING  // FALLING (desce) ou RISING (sobe)
#define DEBOUNCE_US    2000UL   // ignora pulsos mais próximos que isso (2000 = 2 ms; sobe se houver contagem dupla)

// --- Chave de parada (opcional) ---
// Uma chave/botão que, enquanto acionado (pino em GND), registra "parada" na máquina. -1 = desligado.
#define PINO_PARADA    -1
#define MOTIVO_PARADA  "Manutenção"   // Manutenção, Falta de material, Setup, Troca de ferramenta, Ajuste de qualidade, Intervalo

// --- Outros ---
#define PINO_LED       2        // LED da placa: aceso = Wi-Fi conectado. -1 = desligado
#define MAX_FILA       200      // quantos envios guardar se o Wi-Fi ou o servidor cair
