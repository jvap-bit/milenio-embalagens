# Banco de dados - tabelas

Arquivo: `servidor/dados/milenio.db` (SQLite). Definição completa: `servidor/banco/schema.sql` (aplicada sozinha ao iniciar). Consultas prontas: `servidor/banco/consultas_exemplo.sql`. Horários são milissegundos desde 1970 (`Date.now()` do JavaScript).

| Tabela | O que guarda | Vem de |
|---|---|---|
| `setores` | os 6 setores, telas e permissões | fixo |
| `maquinas` | cadastro, capacidade (peças/h), status, OP atual | tela Máquinas |
| `produtos`, `produto_revisoes` | produtos, medidas e revisões dos desenhos | tela Desenhos Técnicos |
| `ops` | ordens de produção: meta, produzido, máquina, prazo, prioridade, status | tela Ordens + contagens |
| `dispositivos` | cada ESP32: máquina, token (só o hash), calibração, último contato | automático / `manutencao.js` |
| `eventos_producao` | cada contagem de peças (máquina, OP, hora, origem) | ESP32 / simulador |
| `paradas` | paradas por motivo, início, fim (vazio = em curso) | operador / ESP32 |
| `refugos` | refugo por motivo, OP e máquina | operador / ESP32 |
| `motivos_parada`, `motivos_refugo` | listas de motivos válidos | fixo |
| `mensagens`, `mensagem_leituras` | comunicação entre setores e quem leu | tela Comunicação |
| `fichas` | Ficha de Produção (tempos, perdas, inspeção, faturamento, aprovação) | tela Ficha de Produção |
| `config` | simulador ligado, próximo número de OP, versão dos dados | interno |

Visões prontas: `v_ops_andamento`, `v_producao_hora`, `v_producao_dia`, `v_paradas_detalhe`, `v_refugo_motivo`, `v_dispositivos_status`.

Regras que o banco garante: só uma parada em curso por máquina; prioridade e status só aceitam os valores do sistema; contagem repetida (mesmo `uid`) não grava duas vezes; apagar uma máquina apaga seu histórico; apagar uma OP mantém o histórico de produção (sem vínculo).

Não ficam no banco (continuam por aparelho/navegador): preferências de acessibilidade, limites de alerta, rascunho da Ficha de Produção e as senhas dos setores (estão em `assets/js/app.js`).
