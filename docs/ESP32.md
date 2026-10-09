# Ligando o ESP32 ao sistema Milênio

O servidor guarda tudo num banco de dados SQLite (`servidor/dados/milenio.db`). Cada ESP32 conta as peças de **uma** máquina e envia para o servidor pela rede Wi-Fi. A tela do sistema mostra o resultado em poucos segundos.

```
Sensor -> ESP32 --Wi-Fi/HTTP--> servidor (server.js) -> milenio.db -> telas dos setores
```

## 1. Requisitos
- **Node.js 22.5 ou superior** no computador do servidor (`node -v`). Em Node mais antigo o sistema abre, mas sem banco e sem ESP32 (o servidor avisa na janela).
- Computador do servidor com **IP fixo** na rede (peça ao TI ou reserve o IP no roteador), na mesma rede Wi-Fi dos ESP32 (2,4 GHz).
- Liberar a porta **3000** no Firewall do Windows (rede privada).
- Arduino IDE com o pacote de placas **esp32 (Espressif)** instalado. Não precisa de nenhuma biblioteca extra.

## 2. Primeira vez no servidor
1. Rode `servidor/iniciar.bat` (ou `./iniciar.sh`).
2. O banco é criado sozinho. Se existiam `mensagens.json` e `fichas.json`, são importados (os arquivos ficam como cópia).
3. Abra o sistema no navegador. Se esse navegador já tinha dados do sistema (máquinas e OPs reais), eles são enviados ao banco **uma única vez**, no lugar dos dados de exemplo. Num banco novo sem nada no navegador, entram máquinas e OPs de exemplo com o simulador ligado.
4. Cada máquina cadastrada ganha automaticamente um ESP32 e um **token**, gravados em `servidor/dados/esp32_tokens.txt`. Máquina nova cadastrada depois também ganha o dela.
5. Em **Integração IoT** (conta Administrativo) você vê a lista de ESP32 e se estão online.

## 3. Gravando o firmware
1. Abra `esp32/milenio_contador/milenio_contador.ino` na Arduino IDE.
2. Edite **só o `config.h`**: Wi-Fi, `SERVIDOR_URL` (IP do computador), `ID_MAQUINA` (ex.: `"01"`), `TOKEN_DISPOSITIVO` (linha da máquina em `esp32_tokens.txt`) e o pino do sensor.
3. Placa **ESP32 Dev Module** (ou a sua), envie. Abra o Monitor Serial a 115200: aparece `Config: ...` e, a cada peça, `+N peca(s)`.
4. Um ESP32 por máquina, cada um com o **seu** token. Para outra máquina, repita com outro `config.h`.

## 4. Ligação elétrica do sensor (importante)
- Os pinos do ESP32 aceitam **no máximo 3,3 V**. Sensores industriais (indutivo/óptico de 12-24 V) **não podem** ir direto no pino: use um **optoacoplador** (ex.: PC817 com resistor) ou um módulo de entrada isolada 24 V -> 3,3 V. Ligar 24 V no GPIO queima a placa.
- Contato seco, fim de curso ou módulo que já entrega 3,3 V: ligue entre o pino (`PINO_SENSOR`, padrão GPIO 27) e GND, com `SENSOR_PULLUP true`.
- Se contar pulsos duplicados, aumente `DEBOUNCE_US`. Se não contar, tente `BORDA_PULSO RISING`.
- Alimente o ESP32 por uma fonte 5 V estável (a fonte do quadro da máquina, com GND comum ao sensor).

## 5. Calibração (pulsos por peça)
Se a máquina gera, por exemplo, 4 pulsos por caixa, rode no servidor:
```
cd servidor
node banco/manutencao.js calibrar esp32-01 4 10     # 4 pulsos = 1 peça; envia a cada 10 s
```
O ESP32 aplica ao ligar e a cada 10 minutos. O que sobra de pulsos (menos que uma peça) fica guardado para a próxima contagem.

Outros comandos: `dispositivos`, `novo-dispositivo 01`, `novo-token esp32-01`, `desativar esp32-01`, `limpar-simulado`, `backup` (rode `node banco/manutencao.js` sem nada para ver a lista).

## 6. Testando sem o ESP32
Troque `TOKEN` pelo token da máquina e `IP` pelo do servidor:
```
curl -X POST http://IP:3000/api/eventos -H "X-Device-Token: TOKEN" -H "Content-Type: application/json" -d '{"pecas":25}'
```
A produção da OP atual dessa máquina sobe e a tela atualiza.

## 7. O que acontece quando chegam peças
- A contagem entra em `eventos_producao` e soma na **OP atual da máquina** (`ops.qtd_produzida`).
- Máquina "Disponível" com OP passa a "Produzindo" sozinha. Se a máquina está "Parada", a contagem é gravada, mas o status só muda quando a parada é encerrada.
- Ao bater a meta, a OP vira "Finalizada", a máquina fica "Disponível" e aponta para a próxima OP da fila (prioridade, depois prazo), como já era no sistema. Peças além da meta ficam registradas nos eventos, sem passar da meta da OP.
- Máquinas com ESP32 online **não** entram no simulador; as demais continuam simuladas enquanto ele estiver ligado. Ao ligar tudo de verdade, use **Limpar dados simulados** (Integração IoT) ou `node banco/manutencao.js limpar-simulado`.

## 8. Referência da API
Os endpoints do ESP32 exigem o cabeçalho `X-Device-Token: <token>`. O token vale só para a máquina dele.

| Método e caminho | Para quê | Corpo (JSON) |
|---|---|---|
| `POST /api/eventos` | contagem de peças | `{"pecas":12,"uid":"7-31","atras_ms":1500}` ou `{"eventos":[{...},{...}]}` até 500 por vez |
| `POST /api/paradas` | iniciar/encerrar parada | `{"acao":"iniciar","motivo":"Setup"}` / `{"acao":"encerrar","retomar":true}` |
| `POST /api/refugos` | refugo | `{"pecas":3,"motivo":"Corte","uid":"r-5"}` |
| `GET /api/dispositivo/config` | calibração do aparelho | resposta: `pulsos_por_peca`, `intervalo_envio_s`, `status`, `op` |
| `POST /api/dispositivo/ping` | sinal de vida | `{"firmware":"1.0.0","rssi":-60}` |

- **Horário do evento:** `ts` (milissegundos, segundos ou texto ISO) **ou** `atras_ms` ("aconteceu há X ms", não precisa de relógio no ESP32). Sem nenhum dos dois vale a hora de chegada.
- **`uid`:** identificador único do envio. Reenviar o mesmo `uid` não grava duas vezes (o firmware usa isso ao recuperar a fila após uma queda).
- **Motivos de parada:** Manutenção, Falta de material, Setup, Troca de ferramenta, Ajuste de qualidade, Intervalo. **Motivos de refugo:** Impressão, Corte, Vinco, Material, Colagem.
- Códigos: `201/200` ok, `400` dado inválido, `401` token inválido, `403` token de outra máquina.

Consultas (sem token, rede interna): `GET /api/maquinas`, `GET /api/ops?status=produzindo`, `GET /api/ops/1023`, `GET /api/producao?maq=01&agrupar=hora|dia|minuto&de=2026-10-01&ate=2026-10-08`, `GET /api/dispositivos`.

## 9. Observações e limites
- **MQTT:** a tela mostra o tópico `milenio/maqXX/producao` como referência. O firmware envia direto por HTTP, sem broker. Se preferir MQTT + Node-RED, o Node-RED só precisa fazer `POST /api/eventos` com o token e o mesmo formato acima.
- **HTTPS:** se você criou `servidor/certificado`, o servidor só responde em HTTPS e este firmware (HTTP) não conecta. Use o servidor sem certificado na rede da fábrica, ou adapte o firmware com `WiFiClientSecure`.
- **Segurança:** a rede deve ser interna. O token protege a gravação dos ESP32, mas as telas e consultas do sistema não têm login no servidor (as senhas dos setores continuam sendo conferidas na própria tela, como antes). Não exponha a porta 3000 na internet. `esp32_tokens.txt` guarda os tokens em texto: restrinja o acesso à pasta `servidor/dados`.
- **Edição simultânea:** máquinas, OPs e produtos seguem "a última gravação vale". Duas pessoas criando OP no mesmo segundo podem gerar o mesmo número; na prática, o PCP cria as OPs. As contagens de peças nunca são sobrescritas pela tela.
- **Backup:** copie `servidor/dados/` ou use `node banco/manutencao.js backup`.
