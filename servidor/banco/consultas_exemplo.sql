-- Consultas prontas (abra servidor/dados/milenio.db no "DB Browser for SQLite" ou use: sqlite3 servidor/dados/milenio.db)

-- Produção de hoje por máquina
SELECT maquina_id, SUM(qtd) AS pecas
FROM eventos_producao
WHERE t >= CAST(strftime('%s','now','localtime','start of day','utc') AS INTEGER) * 1000
GROUP BY maquina_id;

-- Andamento das OPs (planejado x produzido)
SELECT * FROM v_ops_andamento ORDER BY percentual DESC;

-- Produção por hora e por dia
SELECT * FROM v_producao_hora WHERE maquina_id = '01' ORDER BY hora DESC LIMIT 24;
SELECT * FROM v_producao_dia  ORDER BY dia DESC, maquina_id;

-- Paradas: tempo total por motivo nos últimos 7 dias
SELECT motivo, COUNT(*) AS vezes, ROUND(SUM(COALESCE(fim, CAST(strftime('%s','now') AS INTEGER) * 1000) - ini) / 60000.0) AS minutos
FROM paradas
WHERE ini > (CAST(strftime('%s','now','-7 days') AS INTEGER) * 1000)
GROUP BY motivo ORDER BY minutos DESC;

-- Refugo por motivo
SELECT * FROM v_refugo_motivo ORDER BY pecas DESC;

-- Taxa de refugo por OP
SELECT o.id AS op, o.qtd_produzida, COALESCE(SUM(r.qtd), 0) AS refugo,
       ROUND(100.0 * COALESCE(SUM(r.qtd), 0) / NULLIF(o.qtd_produzida, 0), 2) AS pct_refugo
FROM ops o LEFT JOIN refugos r ON r.op_id = o.id GROUP BY o.id;

-- ESP32: quem está online
SELECT * FROM v_dispositivos_status;

-- Fichas de produção aguardando análise
SELECT id, op, posto_nome, operador, datetime(t/1000,'unixepoch','localtime') AS enviada_em
FROM fichas WHERE status = 'enviada' ORDER BY t;
