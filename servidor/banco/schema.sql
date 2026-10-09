-- ============================================================================
--  MILÊNIO EMBALAGENS - BANCO DE DADOS (SQLite 3)
--  Arquivo criado em: servidor/dados/milenio.db   (o servidor aplica este schema sozinho)
--  Datas/horas: INTEGER = milissegundos desde 1970 (mesmo formato do sistema, Date.now()).
--  Para abrir e consultar: "DB Browser for SQLite" ou  sqlite3 servidor/dados/milenio.db
-- ============================================================================
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------- Cadastros ----------
CREATE TABLE IF NOT EXISTS setores (
    id          TEXT PRIMARY KEY,                 -- producao, manutencao, qualidade, planejamento, expedicao, admin
    nome        TEXT NOT NULL,
    descricao   TEXT,
    telas       TEXT NOT NULL DEFAULT '[]',       -- JSON: telas do menu
    permissoes  TEXT NOT NULL DEFAULT '[]'        -- JSON: operar, ordens, maquinas, desenhos, manutencao, liberar
);

CREATE TABLE IF NOT EXISTS motivos_parada (
    motivo TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS motivos_refugo (
    motivo TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS maquinas (
    id            TEXT PRIMARY KEY,               -- '01', '02'... (também usado no tópico MQTT milenio/maq01/producao)
    nome          TEXT NOT NULL,
    capacidade_ph INTEGER NOT NULL DEFAULT 500 CHECK (capacidade_ph > 0),   -- peças por hora (nominal)
    status        TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('produzindo','parada','disponivel')),
    op_atual      TEXT,                           -- OP em andamento / próxima (sem FK de propósito: evita ciclo com ops)
    acumulador    REAL NOT NULL DEFAULT 0,        -- uso interno do simulador
    fator         REAL,                           -- uso interno do simulador
    ativa         INTEGER NOT NULL DEFAULT 1,
    criada_em     INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS produtos (
    cod            TEXT PRIMARY KEY,              -- PAD, COR, ENV, TEL, MAL
    nome           TEXT NOT NULL,
    tipo           TEXT NOT NULL DEFAULT 'padrao' CHECK (tipo IN ('padrao','correios','envelope','telescopica','maleta')),
    comprimento_mm INTEGER NOT NULL,
    largura_mm     INTEGER NOT NULL,
    altura_mm      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS produto_revisoes (      -- controle de revisão dos desenhos técnicos
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_cod TEXT NOT NULL REFERENCES produtos(cod) ON DELETE CASCADE ON UPDATE CASCADE,
    rev         TEXT NOT NULL,                    -- A, B, C...
    data        TEXT,                             -- dd/mm/aaaa
    nota        TEXT,
    UNIQUE (produto_cod, rev)
);

CREATE TABLE IF NOT EXISTS ops (                   -- Ordens de Produção
    id               TEXT PRIMARY KEY,            -- '1023'
    produto_cod      TEXT NOT NULL REFERENCES produtos(cod) ON UPDATE CASCADE,
    qtd_planejada    INTEGER NOT NULL CHECK (qtd_planejada > 0),
    qtd_produzida    INTEGER NOT NULL DEFAULT 0 CHECK (qtd_produzida >= 0),   -- atualizada pelos eventos do ESP32
    maquina_id       TEXT REFERENCES maquinas(id) ON DELETE SET NULL ON UPDATE CASCADE,
    status           TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','produzindo','finalizada')),
    prazo            TEXT NOT NULL,               -- aaaa-mm-dd
    prioridade       TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('urgente','alta','normal','baixa')),
    criada_em        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    finalizada_em    INTEGER
);
CREATE INDEX IF NOT EXISTS ix_ops_maquina ON ops(maquina_id, status);

-- ---------- Dados de chão de fábrica (alimentados pelo ESP32) ----------
CREATE TABLE IF NOT EXISTS dispositivos (          -- cada ESP32 cadastrado
    id               TEXT PRIMARY KEY,            -- 'esp32-01'
    maquina_id       TEXT NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    nome             TEXT,
    token_hash       TEXT NOT NULL,               -- SHA-256 do token (o token em si só aparece uma vez)
    pulsos_por_peca  INTEGER NOT NULL DEFAULT 1 CHECK (pulsos_por_peca > 0),  -- calibração do sensor
    intervalo_envio_s INTEGER NOT NULL DEFAULT 5 CHECK (intervalo_envio_s BETWEEN 1 AND 3600),
    ativo            INTEGER NOT NULL DEFAULT 1,
    ultimo_contato   INTEGER,
    ultimo_ip        TEXT,
    firmware         TEXT,
    rssi             INTEGER,                     -- sinal Wi-Fi (dBm) do último contato
    criado_em        INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS ix_disp_maquina ON dispositivos(maquina_id);

CREATE TABLE IF NOT EXISTS eventos_producao (      -- contagens de peças
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id     TEXT NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    op_id          TEXT REFERENCES ops(id) ON DELETE SET NULL ON UPDATE CASCADE,
    t              INTEGER NOT NULL,              -- quando a peça foi contada
    qtd            INTEGER NOT NULL CHECK (qtd > 0),
    origem         TEXT NOT NULL DEFAULT 'esp32' CHECK (origem IN ('esp32','sim','manual','app')),
    dispositivo_id TEXT REFERENCES dispositivos(id) ON DELETE SET NULL,
    uid            TEXT UNIQUE,                   -- identificador do evento: impede gravar duas vezes se o ESP32 reenviar
    recebido_em    INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS ix_ev_maq_t ON eventos_producao(maquina_id, t);
CREATE INDEX IF NOT EXISTS ix_ev_t ON eventos_producao(t);
CREATE INDEX IF NOT EXISTS ix_ev_op ON eventos_producao(op_id);

CREATE TABLE IF NOT EXISTS paradas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    maquina_id TEXT NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    motivo     TEXT NOT NULL,
    ini        INTEGER NOT NULL,
    fim        INTEGER,                           -- NULL = parada em curso
    origem     TEXT NOT NULL DEFAULT 'app' CHECK (origem IN ('esp32','sim','manual','app')),
    UNIQUE (maquina_id, ini),
    CHECK (fim IS NULL OR fim >= ini)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_parada_aberta ON paradas(maquina_id) WHERE fim IS NULL;  -- só 1 parada em curso por máquina

CREATE TABLE IF NOT EXISTS refugos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    t          INTEGER NOT NULL,
    maquina_id TEXT NOT NULL REFERENCES maquinas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    op_id      TEXT REFERENCES ops(id) ON DELETE SET NULL ON UPDATE CASCADE,
    qtd        INTEGER NOT NULL CHECK (qtd > 0),
    motivo     TEXT NOT NULL,
    origem     TEXT NOT NULL DEFAULT 'app' CHECK (origem IN ('esp32','sim','manual','app')),
    UNIQUE (maquina_id, t, qtd, motivo)
);
CREATE INDEX IF NOT EXISTS ix_ref_maq_t ON refugos(maquina_id, t);

-- ---------- Comunicação entre setores ----------
CREATE TABLE IF NOT EXISTS mensagens (
    id      TEXT PRIMARY KEY,
    t       INTEGER NOT NULL,
    de      TEXT NOT NULL REFERENCES setores(id),
    para    TEXT NOT NULL,                        -- id de um setor ou 'todos'
    prio    TEXT NOT NULL DEFAULT 'normal' CHECK (prio IN ('normal','urgente')),
    assunto TEXT NOT NULL,
    txt     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_msg_t ON mensagens(t);
CREATE TABLE IF NOT EXISTS mensagem_leituras (
    mensagem_id TEXT NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
    setor_id    TEXT NOT NULL REFERENCES setores(id),
    PRIMARY KEY (mensagem_id, setor_id)
);

-- ---------- Ficha de Produção ----------
CREATE TABLE IF NOT EXISTS fichas (
    id          TEXT PRIMARY KEY,
    t           INTEGER NOT NULL,
    de          TEXT NOT NULL REFERENCES setores(id),
    para        TEXT NOT NULL REFERENCES setores(id),
    status      TEXT NOT NULL DEFAULT 'enviada' CHECK (status IN ('enviada','aprovada','devolvida','substituida')),
    op          TEXT NOT NULL,                    -- número da OP (texto livre: a ficha guarda o que foi digitado)
    produto     TEXT,
    posto       TEXT,                             -- id da máquina, 'inspecao' ou 'faturamento'
    posto_nome  TEXT,
    fase        TEXT NOT NULL,                    -- riscador, impressora, cortevinco, amarracao, geral, inspecao, faturamento
    fase_nome   TEXT,
    operador    TEXT NOT NULL,
    ini_aj      TEXT, ini_prod TEXT, ter_prod TEXT,      -- horas HH:MM
    prev_aj     TEXT, prev_prod TEXT,
    nf          TEXT,
    qtd_plan    INTEGER, perda_aj INTEGER, perda_prod INTEGER, qtde INTEGER,
    volumes     INTEGER, pcvol INTEGER, excedente INTEGER, total INTEGER,
    obs         TEXT,
    nota        TEXT NOT NULL DEFAULT '',         -- recado de quem aprovou/devolveu
    por         TEXT NOT NULL DEFAULT '',
    t_rev       INTEGER
);
CREATE INDEX IF NOT EXISTS ix_fichas_op ON fichas(op);
CREATE INDEX IF NOT EXISTS ix_fichas_para ON fichas(para, status);

-- ---------- Configuração e controle ----------
CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
);

-- ---------- Visões prontas para relatórios / ERP / Excel ----------
CREATE VIEW IF NOT EXISTS v_producao_hora AS
    SELECT maquina_id, strftime('%Y-%m-%d %H:00', t/1000, 'unixepoch', 'localtime') AS hora, SUM(qtd) AS pecas
    FROM eventos_producao GROUP BY maquina_id, hora;

CREATE VIEW IF NOT EXISTS v_producao_dia AS
    SELECT maquina_id, strftime('%Y-%m-%d', t/1000, 'unixepoch', 'localtime') AS dia, SUM(qtd) AS pecas
    FROM eventos_producao GROUP BY maquina_id, dia;

CREATE VIEW IF NOT EXISTS v_ops_andamento AS
    SELECT o.id AS op, p.nome AS produto, o.maquina_id, o.status, o.prioridade, o.prazo,
           o.qtd_planejada, o.qtd_produzida,
           MAX(0, o.qtd_planejada - o.qtd_produzida) AS faltam,
           ROUND(100.0 * o.qtd_produzida / o.qtd_planejada, 1) AS percentual
    FROM ops o JOIN produtos p ON p.cod = o.produto_cod;

CREATE VIEW IF NOT EXISTS v_paradas_detalhe AS
    SELECT id, maquina_id, motivo,
           datetime(ini/1000, 'unixepoch', 'localtime') AS inicio,
           CASE WHEN fim IS NULL THEN NULL ELSE datetime(fim/1000, 'unixepoch', 'localtime') END AS termino,
           CASE WHEN fim IS NULL THEN NULL ELSE ROUND((fim - ini) / 60000.0, 1) END AS minutos,
           CASE WHEN fim IS NULL THEN 1 ELSE 0 END AS em_curso, origem
    FROM paradas;

CREATE VIEW IF NOT EXISTS v_refugo_motivo AS
    SELECT maquina_id, motivo, SUM(qtd) AS pecas FROM refugos GROUP BY maquina_id, motivo;

CREATE VIEW IF NOT EXISTS v_dispositivos_status AS
    SELECT d.id, d.maquina_id, m.nome AS maquina, d.ativo, d.firmware, d.rssi, d.ultimo_ip,
           datetime(d.ultimo_contato/1000, 'unixepoch', 'localtime') AS ultimo_contato,
           CASE WHEN d.ultimo_contato IS NOT NULL AND (CAST(strftime('%s','now') AS INTEGER) * 1000 - d.ultimo_contato) < 120000
                THEN 'online' ELSE 'offline' END AS conexao
    FROM dispositivos d JOIN maquinas m ON m.id = d.maquina_id;
