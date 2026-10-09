// Banco de dados da Milênio Embalagens (SQLite).
// Usa o SQLite que já vem dentro do Node.js 22.5 ou superior (módulo "node:sqlite"): não precisa instalar nada.
// Tudo que o sistema guarda (máquinas, OPs, produção, paradas, refugos, mensagens, fichas) fica em servidor/dados/milenio.db.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ew = process.emitWarning; process.emitWarning = (w, ...a) => /SQLite/.test(String(w && w.message || w)) ? undefined : ew.call(process, w, ...a);   // esconde o aviso "experimental" do SQLite
const { DatabaseSync } = require('node:sqlite');          // lança erro em Node antigo: o server.js trata e avisa

const H = 3600e3, SIMX = 6;                                // SIMX: velocidade do simulador (igual ao app.js)
const SETORES = [
    ['producao', 'Produção', 'Operação das máquinas, apontamentos de produção, paradas e refugos.', ['setor', 'operador', 'ordens', 'desenhos', 'comunicacao'], ['operar']],
    ['manutencao', 'Manutenção', 'Acompanhamento de paradas, estado das máquinas e liberação após reparo.', ['setor', 'maquinas', 'historico', 'indicadores', 'comunicacao'], ['maquinas', 'manutencao']],
    ['qualidade', 'Qualidade', 'Controle de refugos, revisões e desenhos técnicos.', ['setor', 'desenhos', 'indicadores', 'historico', 'comunicacao'], ['desenhos']],
    ['planejamento', 'Planejamento (PCP)', 'Programação de OPs, prazos e capacidade das máquinas.', ['setor', 'ordens', 'dashboard', 'maquinas', 'indicadores', 'comunicacao'], ['ordens']],
    ['expedicao', 'Expedição', 'Conferência de OPs finalizadas e liberação para entrega.', ['setor', 'ordens', 'historico', 'comunicacao'], ['liberar']],
    ['admin', 'Administrativo', 'Visão geral da fábrica, indicadores e integrações. Acesso a todas as áreas.', ['setor', 'dashboard', 'operador', 'ordens', 'maquinas', 'desenhos', 'historico', 'indicadores', 'integracao', 'comunicacao'], ['operar', 'ordens', 'maquinas', 'desenhos', 'manutencao', 'liberar']]
];
const MOTIVOS_PARADA = ['Manutenção', 'Falta de material', 'Setup', 'Troca de ferramenta', 'Ajuste de qualidade', 'Intervalo'];
const MOTIVOS_REFUGO = ['Impressão', 'Corte', 'Vinco', 'Material', 'Colagem'];
const ids = SETORES.map(s => s[0]);
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const agora = () => Date.now();

function abrir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = path.join(dir, 'milenio.db'), db = new DatabaseSync(arquivo);
    db.exec(fs.readFileSync(path.join(__dirname, 'banco', 'schema.sql'), 'utf8'));
    const q = {};   // cache de comandos preparados
    const P = sql => q[sql] || (q[sql] = db.prepare(sql));
    const get = (sql, ...a) => P(sql).get(...a), all = (sql, ...a) => P(sql).all(...a), run = (sql, ...a) => P(sql).run(...a);
    const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { try { db.exec('ROLLBACK') } catch (x) { } throw e } };
    const cfg = (k, d) => { const r = get('SELECT valor FROM config WHERE chave=?', k); return r ? r.valor : d };
    const setCfg = (k, v) => run('INSERT INTO config(chave,valor) VALUES(?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor', k, String(v));
    const ver = () => +cfg('ver', 0), bump = () => setCfg('ver', ver() + 1);
    const arq = { tokens: path.join(dir, 'esp32_tokens.txt') };

    // ---------- dados fixos ----------
    tx(() => {
        SETORES.forEach(s => run('INSERT INTO setores(id,nome,descricao,telas,permissoes) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao, telas=excluded.telas, permissoes=excluded.permissoes', s[0], s[1], s[2], JSON.stringify(s[3]), JSON.stringify(s[4])));
        MOTIVOS_PARADA.forEach(m => run('INSERT OR IGNORE INTO motivos_parada(motivo) VALUES(?)', m));
        MOTIVOS_REFUGO.forEach(m => run('INSERT OR IGNORE INTO motivos_refugo(motivo) VALUES(?)', m));
        if (cfg('sim') === undefined) setCfg('sim', 0);
        if (cfg('seq') === undefined) setCfg('seq', 1028);
    });

    // ---------- dispositivos (ESP32) ----------
    function novoToken() { return 'mil_' + crypto.randomBytes(20).toString('hex') }
    function guardarToken(id, maq, nome, token) {
        const linha = id + ' | maquina ' + maq + ' | ' + nome + ' | token: ' + token + '\n';
        try { if (!fs.existsSync(arq.tokens)) fs.writeFileSync(arq.tokens, '# Tokens dos ESP32. Guarde com cuidado: quem tem o token consegue gravar dados desta máquina.\n# Cada ESP32 usa o token da sua linha (campo TOKEN_DISPOSITIVO no firmware).\n'); fs.appendFileSync(arq.tokens, linha) } catch (e) { }
    }
    function criarDispositivo(maq, opts = {}) {
        const m = get('SELECT id,nome FROM maquinas WHERE id=?', maq); if (!m) throw new Error('máquina não existe: ' + maq);
        let n = 1, id; do { id = 'esp32-' + m.id + (n > 1 ? '-' + n : ''); n++ } while (get('SELECT 1 FROM dispositivos WHERE id=?', id));
        const token = novoToken();
        run('INSERT INTO dispositivos(id,maquina_id,nome,token_hash,pulsos_por_peca,intervalo_envio_s) VALUES(?,?,?,?,?,?)', id, m.id, opts.nome || ('ESP32 - ' + m.nome), sha(token), opts.pulsos_por_peca || 1, opts.intervalo_envio_s || 5);
        guardarToken(id, m.id, m.nome, token); return { id, maquina: m.id, token };
    }
    function novoTokenDispositivo(id) {
        const d = get('SELECT * FROM dispositivos WHERE id=?', id); if (!d) throw new Error('dispositivo não existe: ' + id);
        const token = novoToken(); run('UPDATE dispositivos SET token_hash=? WHERE id=?', sha(token), id); guardarToken(id, d.maquina_id, (get('SELECT nome FROM maquinas WHERE id=?', d.maquina_id) || {}).nome || '', token); return { id, token };
    }
    // Toda máquina cadastrada ganha um ESP32 (e um token) automaticamente.
    function garantirDispositivos() {
        const novos = []; all('SELECT id FROM maquinas WHERE ativa=1 AND id NOT IN (SELECT maquina_id FROM dispositivos)').forEach(m => novos.push(criarDispositivo(m.id)));
        return novos;
    }
    function autenticar(token) {
        if (!token || typeof token !== 'string' || token.length < 10) return null;
        const d = get('SELECT * FROM dispositivos WHERE token_hash=? AND ativo=1', sha(token.trim()));
        return d || null;
    }
    function contato(d, ip, extra = {}) {
        run('UPDATE dispositivos SET ultimo_contato=?, ultimo_ip=?, firmware=COALESCE(?,firmware), rssi=COALESCE(?,rssi) WHERE id=?', agora(), ip || null, extra.firmware ? String(extra.firmware).slice(0, 40) : null, Number.isFinite(+extra.rssi) && extra.rssi != null && extra.rssi !== '' ? Math.round(+extra.rssi) : null, d.id);
    }
    const online = maq => { const r = get('SELECT 1 AS x FROM dispositivos WHERE maquina_id=? AND ativo=1 AND ultimo_contato > ?', maq, agora() - 120000); return !!r };

    // ---------- regras de produção ----------
    const prioN = { urgente: 1, alta: 2, normal: 3, baixa: 4 };
    function proximaOP(maq) {   // fila: maior prioridade; empate: prazo mais curto
        return all("SELECT id,prioridade,prazo FROM ops WHERE maquina_id=? AND status='planejada'", maq).sort((a, b) => (prioN[a.prioridade] || 3) - (prioN[b.prioridade] || 3) || String(a.prazo).localeCompare(String(b.prazo)) || Number(a.id) - Number(b.id))[0];
    }
    // Soma 'qtd' peças na OP atual da máquina. Finaliza a OP ao bater a meta e passa para a próxima da fila.
    function somarNaOP(maq, qtd) {
        const m = get('SELECT * FROM maquinas WHERE id=?', maq); if (!m || !m.op_atual) return { op: '' };
        const o = get('SELECT * FROM ops WHERE id=?', m.op_atual); if (!o || o.status === 'finalizada') return { op: o ? o.id : '', finalizada: !!o };
        const novo = Math.min(o.qtd_planejada, o.qtd_produzida + qtd);
        run("UPDATE ops SET qtd_produzida=?, status='produzindo' WHERE id=?", novo, o.id);
        if (m.status === 'disponivel') run("UPDATE maquinas SET status='produzindo' WHERE id=?", m.id);   // sinal de produção = máquina rodando
        if (novo >= o.qtd_planejada) {
            run("UPDATE ops SET status='finalizada', finalizada_em=? WHERE id=?", agora(), o.id);
            const nx = proximaOP(m.id); run("UPDATE maquinas SET status='disponivel', op_atual=? WHERE id=?", nx ? nx.id : null, m.id);
        }
        return { op: o.id, qtd_produzida: novo, qtd_planejada: o.qtd_planejada, finalizada: novo >= o.qtd_planejada };
    }
    const tempo = (v, atras) => {   // aceita ms, texto ISO ou "há X ms"; nunca aceita data absurda
        const n = agora(); let t = n;
        if (atras != null && Number.isFinite(+atras)) t = n - Math.max(0, +atras);
        else if (v != null && v !== '') { t = typeof v === 'number' || /^\d+$/.test(String(v)) ? +v : Date.parse(v); if (t < 1e11 && t > 1e9) t *= 1000 }   // segundos -> ms
        if (!Number.isFinite(t) || t < n - 30 * 24 * H) return null;
        return t > n + 5 * 60e3 ? n : Math.round(t);
    };
    const inteiro = (v, max = 1e7) => { const n = Math.round(+v); return Number.isFinite(n) && n > 0 && n <= max ? n : 0 };

    function registrarEventos(d, itens) {
        let gravados = 0, duplicados = 0, rejeitados = 0, total = 0, resp = { op: '' };
        tx(() => {
            for (const it of itens.slice(0, 500)) {
                const qtd = inteiro(it.pecas != null ? it.pecas : it.q), t = tempo(it.ts, it.atras_ms);
                if (!qtd || t == null) { rejeitados++; continue }
                const uid = it.uid != null && String(it.uid) !== '' ? d.id + ':' + String(it.uid).slice(0, 60) : null;
                const m = get('SELECT op_atual FROM maquinas WHERE id=?', d.maquina_id);
                const r = run("INSERT OR IGNORE INTO eventos_producao(maquina_id,op_id,t,qtd,origem,dispositivo_id,uid) VALUES(?,?,?,?, 'esp32', ?, ?)", d.maquina_id, m && m.op_atual || null, t, qtd, d.id, uid);
                if (!r.changes) { duplicados++; continue }
                gravados++; total += qtd; resp = somarNaOP(d.maquina_id, qtd);
            }
            if (gravados) bump();
        });
        const m = get('SELECT status,op_atual FROM maquinas WHERE id=?', d.maquina_id) || {};
        return { ok: true, gravados, duplicados, rejeitados, pecas: total, maquina: d.maquina_id, status: m.status, op: m.op_atual || '', ...resp };
    }
    function registrarParada(d, b) {
        const acao = b.acao === 'encerrar' ? 'encerrar' : 'iniciar', t = tempo(b.ts, b.atras_ms); if (t == null) return { code: 400, obj: { erro: 'horário inválido' } };
        return tx(() => {
            const aberta = get('SELECT * FROM paradas WHERE maquina_id=? AND fim IS NULL', d.maquina_id);
            if (acao === 'iniciar') {
                const motivo = String(b.motivo || '').trim();
                if (!get('SELECT 1 FROM motivos_parada WHERE motivo=?', motivo)) return { code: 400, obj: { erro: 'motivo inválido', validos: MOTIVOS_PARADA } };
                if (aberta) return { code: 200, obj: { ok: true, ja_em_curso: true, motivo: aberta.motivo } };
                run("INSERT INTO paradas(maquina_id,motivo,ini,origem) VALUES(?,?,?, 'esp32')", d.maquina_id, motivo, t);
                run("UPDATE maquinas SET status='parada' WHERE id=?", d.maquina_id); bump(); return { code: 201, obj: { ok: true } };
            }
            if (!aberta) return { code: 200, obj: { ok: true, sem_parada: true } };
            run('UPDATE paradas SET fim=MAX(ini,?) WHERE id=?', t, aberta.id);
            run('UPDATE maquinas SET status=? WHERE id=?', b.retomar ? 'produzindo' : 'disponivel', d.maquina_id); bump();
            return { code: 200, obj: { ok: true, minutos: Math.round((t - aberta.ini) / 6e4 * 10) / 10 } };
        });
    }
    function registrarRefugo(d, b) {
        const qtd = inteiro(b.pecas != null ? b.pecas : b.q), t = tempo(b.ts, b.atras_ms), motivo = String(b.motivo || '').trim();
        if (!qtd || t == null) return { code: 400, obj: { erro: 'quantidade ou horário inválido' } };
        if (!get('SELECT 1 FROM motivos_refugo WHERE motivo=?', motivo)) return { code: 400, obj: { erro: 'motivo inválido', validos: MOTIVOS_REFUGO } };
        return tx(() => {
            const m = get('SELECT op_atual FROM maquinas WHERE id=?', d.maquina_id);
            const r = run("INSERT OR IGNORE INTO refugos(t,maquina_id,op_id,qtd,motivo,origem) VALUES(?,?,?,?,?, 'esp32')", t, d.maquina_id, m && m.op_atual || null, qtd, motivo);
            if (r.changes) bump(); return { code: r.changes ? 201 : 200, obj: { ok: true, duplicado: !r.changes } };
        });
    }
    function configDispositivo(d) {
        const m = get('SELECT nome,status,op_atual FROM maquinas WHERE id=?', d.maquina_id) || {};
        return { dispositivo: d.id, maquina: d.maquina_id, nome_maquina: m.nome, pulsos_por_peca: d.pulsos_por_peca, intervalo_envio_s: d.intervalo_envio_s, hora_servidor_ms: agora(), status: m.status, op: m.op_atual || '' };
    }

    // ---------- estado do sistema (o que o navegador mostra) ----------
    const JANELA = 8 * 24 * H;
    const mapMaq = r => ({ id: r.id, nome: r.nome, rate: r.capacidade_ph, st: r.status, op: r.op_atual || '', acc: r.acumulador || 0, ...(r.fator != null ? { f: r.fator } : {}) });
    function estado(evDepois) {
        const S = {};
        S.machines = all('SELECT * FROM maquinas WHERE ativa=1 ORDER BY id').map(mapMaq);
        const revs = all('SELECT * FROM produto_revisoes ORDER BY id');
        S.prods = all('SELECT * FROM produtos ORDER BY rowid').map(p => ({ cod: p.cod, nome: p.nome, dim: [p.comprimento_mm, p.largura_mm, p.altura_mm], tipo: p.tipo, revs: revs.filter(r => r.produto_cod === p.cod).map(r => ({ rev: r.rev, data: r.data, nota: r.nota })) }));
        S.ops = all('SELECT * FROM ops ORDER BY CAST(id AS INTEGER), id').map(o => ({ id: o.id, prod: o.produto_cod, qtd: o.qtd_planejada, feito: o.qtd_produzida, maq: o.maquina_id || '', st: o.status, prazo: o.prazo, prio: o.prioridade }));
        S.stops = all('SELECT * FROM paradas WHERE ini > ? OR fim IS NULL ORDER BY ini LIMIT 2000', agora() - 14 * 24 * H).map(s => ({ m: s.maquina_id, motivo: s.motivo, ini: s.ini, fim: s.fim }));
        S.scrap = all('SELECT * FROM refugos WHERE t > ? ORDER BY t LIMIT 2000', agora() - 14 * 24 * H).map(r => ({ t: r.t, m: r.maquina_id, op: r.op_id || '', q: r.qtd, motivo: r.motivo }));
        S.sim = cfg('sim') === '1'; S.seq = +cfg('seq', 1028);
        const mx = (get('SELECT MAX(id) AS m FROM eventos_producao') || {}).m || 0; let fim = mx;
        if (evDepois == null) {   // carga inicial: histórico agrupado (por minuto nas últimas 24h, por hora antes disso) para não pesar
            const lim = agora() - 24 * H, ini = agora() - JANELA;
            S.events = all('SELECT maquina_id AS m, (t/60000)*60000+30000 AS t, SUM(qtd) AS q FROM eventos_producao WHERE t >= ? GROUP BY maquina_id, t/60000 ORDER BY t', lim).map(e => ({ t: e.t, m: e.m, q: e.q }));
            const ant = all('SELECT maquina_id AS m, (t/3600000)*3600000+1800000 AS t, SUM(qtd) AS q FROM eventos_producao WHERE t >= ? AND t < ? GROUP BY maquina_id, t/3600000 ORDER BY t', ini, lim).map(e => ({ t: e.t, m: e.m, q: e.q }));
            S.events = ant.concat(S.events);
        } else { const l = all('SELECT id, maquina_id AS m, t, qtd AS q FROM eventos_producao WHERE id > ? ORDER BY id LIMIT 5000', evDepois); S.events = l.map(e => ({ t: e.t, m: e.m, q: e.q })); if (l.length) fim = l[l.length - 1].id; else fim = Math.min(evDepois, mx) }
        return { ver: ver(), ev: fim, limp: +cfg('limpeza_t', 0), demo: cfg('demo') === '1', estado: S };
    }
    // Coerência: máquina "parada" tem de ter parada em curso (e vice-versa). Evita estado velho de um navegador desatualizado.
    function normalizar() {
        run("UPDATE maquinas SET status='disponivel' WHERE status='parada' AND NOT EXISTS (SELECT 1 FROM paradas p WHERE p.maquina_id=maquinas.id AND p.fim IS NULL)");
        run("UPDATE maquinas SET status='parada' WHERE status!='parada' AND EXISTS (SELECT 1 FROM paradas p WHERE p.maquina_id=maquinas.id AND p.fim IS NULL)");
    }
    function limparTudoCadastro() { run('DELETE FROM ops'); run('DELETE FROM maquinas'); run('DELETE FROM produtos'); run('DELETE FROM dispositivos') }
    // O navegador manda o estado completo. Cadastros: vale o que o navegador mandou. Contagens: só o servidor/ESP32 escreve.
    function aplicarEstado(b) {
        const S = b && b.estado; if (!S || !Array.isArray(S.machines) || !Array.isArray(S.ops) || !Array.isArray(S.prods)) throw new Error('estado inválido');
        const imp = !!b.substituir;
        return tx(() => {
            if (imp) { limparTudoCadastro(); run('DELETE FROM eventos_producao'); run('DELETE FROM paradas'); run('DELETE FROM refugos'); setCfg('demo', 0) }
            const t0 = agora(), txt = (v, n = 120) => String(v == null ? '' : v).slice(0, n), num = (v, d = 0) => Number.isFinite(+v) ? Math.round(+v) : d;
            for (const m of S.machines.slice(0, 200)) {
                const id = txt(m.id, 20).trim(); if (!id) continue;
                run(`INSERT INTO maquinas(id,nome,capacidade_ph,status,op_atual,acumulador,fator) VALUES(?,?,?,?,?,?,?)
                     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, capacidade_ph=excluded.capacidade_ph, status=excluded.status, op_atual=excluded.op_atual, ativa=1`,
                    id, txt(m.nome) || ('Máquina ' + id), Math.max(1, num(m.rate, 500)), ['produzindo', 'parada', 'disponivel'].includes(m.st) ? m.st : 'disponivel', m.op ? txt(m.op, 20) : null, +m.acc || 0, m.f != null ? +m.f : null);
            }
            for (const p of S.prods.slice(0, 500)) {
                const d = Array.isArray(p.dim) ? p.dim : [0, 0, 0];
                run(`INSERT INTO produtos(cod,nome,tipo,comprimento_mm,largura_mm,altura_mm) VALUES(?,?,?,?,?,?)
                     ON CONFLICT(cod) DO UPDATE SET nome=excluded.nome, tipo=excluded.tipo, comprimento_mm=excluded.comprimento_mm, largura_mm=excluded.largura_mm, altura_mm=excluded.altura_mm`,
                    txt(p.cod, 20), txt(p.nome), ['padrao', 'correios', 'envelope', 'telescopica', 'maleta'].includes(p.tipo) ? p.tipo : 'padrao', num(d[0]), num(d[1]), num(d[2]));
                (p.revs || []).forEach(r => run('INSERT OR IGNORE INTO produto_revisoes(produto_cod,rev,data,nota) VALUES(?,?,?,?)', txt(p.cod, 20), txt(r.rev, 10), txt(r.data, 20), txt(r.nota, 200)));
            }
            for (const id of (Array.isArray(b.apagarOps) ? b.apagarOps : []).slice(0, 200)) run('DELETE FROM ops WHERE id=?', txt(id, 20));
            for (const o of S.ops.slice(0, 5000)) {
                const id = txt(o.id, 20); if (!id) continue;
                const prio = prioN[o.prio] ? o.prio : 'normal', st = ['planejada', 'produzindo', 'finalizada'].includes(o.st) ? o.st : 'planejada', maq = o.maq && get('SELECT 1 FROM maquinas WHERE id=?', txt(o.maq, 20)) ? txt(o.maq, 20) : null;
                if (!get('SELECT 1 FROM produtos WHERE cod=?', txt(o.prod, 20))) continue;
                run(`INSERT INTO ops(id,produto_cod,qtd_planejada,qtd_produzida,maquina_id,status,prazo,prioridade) VALUES(?,?,?,?,?,?,?,?)
                     ON CONFLICT(id) DO UPDATE SET produto_cod=excluded.produto_cod, qtd_planejada=excluded.qtd_planejada, maquina_id=excluded.maquina_id,
                         status=CASE WHEN ops.status='finalizada' THEN 'finalizada' ELSE excluded.status END, prazo=excluded.prazo, prioridade=excluded.prioridade`,
                    id, txt(o.prod, 20), Math.max(1, num(o.qtd, 1)), imp ? Math.max(0, num(o.feito)) : 0, maq, st, txt(o.prazo, 10) || new Date(t0 + 7 * 24 * H).toISOString().slice(0, 10), prio);
            }
            // paradas e refugos: o navegador registra (botões do operador); reabrir uma parada que o servidor já encerrou é proibido
            const limp = imp ? 0 : +cfg('limpeza_t', 0);   // o navegador ainda pode ter registros simulados que acabaram de ser apagados
            for (const s of (S.stops || []).slice(-2000)) {
                if (!s || +s.ini < limp || !get('SELECT 1 FROM maquinas WHERE id=?', txt(s.m, 20)) || !(+s.ini > 0)) continue;
                try {
                    run(`INSERT INTO paradas(maquina_id,motivo,ini,fim,origem) VALUES(?,?,?,?,?)
                         ON CONFLICT(maquina_id,ini) DO UPDATE SET fim=COALESCE(paradas.fim, excluded.fim)`, txt(s.m, 20), txt(s.motivo, 60) || 'Manutenção', Math.round(+s.ini), s.fim ? Math.round(+s.fim) : null, imp ? 'sim' : 'app');
                } catch (e) { /* já existe outra parada em curso nesta máquina: mantém a do servidor */ }
            }
            for (const r of (S.scrap || []).slice(-2000)) {
                if (!r || +r.t < limp || !get('SELECT 1 FROM maquinas WHERE id=?', txt(r.m, 20)) || !(+r.t > 0) || !(+r.q > 0)) continue;
                run('INSERT OR IGNORE INTO refugos(t,maquina_id,op_id,qtd,motivo,origem) VALUES(?,?,?,?,?,?)', Math.round(+r.t), txt(r.m, 20), r.op && get('SELECT 1 FROM ops WHERE id=?', txt(r.op, 20)) ? txt(r.op, 20) : null, Math.round(+r.q), txt(r.motivo, 60) || 'Material', imp ? 'sim' : 'app');
            }
            if (imp) for (const e of (S.events || []).slice(-8000)) {   // só na importação dos dados antigos do navegador
                if (!e || !get('SELECT 1 FROM maquinas WHERE id=?', txt(e.m, 20)) || !(+e.t > 0) || !(+e.q > 0)) continue;
                run("INSERT OR IGNORE INTO eventos_producao(maquina_id,t,qtd,origem,uid) VALUES(?,?,?, 'sim', ?)", txt(e.m, 20), Math.round(+e.t), Math.round(+e.q), 'imp:' + e.m + ':' + Math.round(+e.t) + ':' + Math.round(+e.q));
            }
            if (S.sim !== undefined) setCfg('sim', S.sim ? 1 : 0);
            setCfg('seq', Math.max(+cfg('seq', 1028), num(S.seq, 1028)));
            if (cfg('demo') === '1') setCfg('demo', 0);
            normalizar(); const novos = garantirDispositivos(); bump(); return { ver: ver(), novosDispositivos: novos.map(n => n.id) };
        });
    }

    // ---------- dados de demonstração (primeira execução) ----------
    function semearDemo() {
        if (get('SELECT COUNT(*) AS n FROM maquinas').n) return false;
        const n = agora(), R = Math.random, hs = Math.floor(n / H) * H;
        tx(() => {
            [['01', 'Flexográfica 01', 600, 'produzindo', '1023'], ['02', 'Corte e Vinco 02', 450, 'parada', '1027'], ['03', 'Colagem 03', 800, 'disponivel', ''], ['04', 'Corte e Vinco 04', 500, 'produzindo', '1025']].forEach(m => run('INSERT INTO maquinas(id,nome,capacidade_ph,status,op_atual) VALUES(?,?,?,?,?)', m[0], m[1], m[2], m[3], m[4] || null));
            const dt = new Date(n - 60 * 24 * H).toLocaleDateString('pt-BR');
            [['PAD', 'Padrão (abas se encontram)', 'padrao', 300, 220, 180], ['COR', 'Correios / Sedex', 'correios', 270, 180, 90], ['ENV', 'Envelope', 'envelope', 300, 220, 60], ['TEL', 'Telescópica (fundo semi-automático)', 'telescopica', 300, 220, 150], ['MAL', 'Maleta (com alça)', 'maleta', 250, 150, 260]]
                .forEach(p => { run('INSERT INTO produtos(cod,nome,tipo,comprimento_mm,largura_mm,altura_mm) VALUES(?,?,?,?,?,?)', ...p); run('INSERT INTO produto_revisoes(produto_cod,rev,data,nota) VALUES(?,?,?,?)', p[0], 'A', dt, 'Emissão inicial') });
            const dia = k => new Date(n + k * 24 * H).toISOString().slice(0, 10);
            [['1023', 'PAD', 5000, 4500, '01', 'produzindo', dia(0), 'normal'], ['1024', 'COR', 3000, 3000, '04', 'finalizada', dia(-3), 'normal'], ['1025', 'ENV', 5000, 2920, '04', 'produzindo', dia(1), 'alta'], ['1026', 'TEL', 10000, 0, '03', 'planejada', dia(4), 'baixa'], ['1027', 'MAL', 4000, 1200, '02', 'produzindo', dia(2), 'urgente']]
                .forEach(o => run('INSERT INTO ops(id,produto_cod,qtd_planejada,qtd_produzida,maquina_id,status,prazo,prioridade) VALUES(?,?,?,?,?,?,?,?)', ...o));
            all('SELECT id,capacidade_ph AS r FROM maquinas').forEach(m => { for (let k = 7 * 24; k >= 0; k--) { const t = hs - k * H, h = new Date(t).getHours(), q = Math.round(m.r * (h >= 6 && h < 22 ? .65 + R() * .3 : .1 * R())); if (q && t + H / 2 < n) run("INSERT INTO eventos_producao(maquina_id,t,qtd,origem) VALUES(?,?,?, 'sim')", m.id, t + H / 2, q) } });
            [['04', 'Setup', n - 5 * H, n - 4.6 * H], ['01', 'Troca de ferramenta', n - 3 * H, n - 2.8 * H], ['03', 'Falta de material', n - 6 * H, n - 5.5 * H], ['02', 'Manutenção', n - 40 * 60e3, null]]
                .forEach(s => run("INSERT INTO paradas(maquina_id,motivo,ini,fim,origem) VALUES(?,?,?,?, 'sim')", s[0], s[1], Math.round(s[2]), s[3] && Math.round(s[3])));
            all('SELECT id,op_atual FROM maquinas').forEach(m => { for (let i = 0; i < 3; i++) run("INSERT OR IGNORE INTO refugos(t,maquina_id,op_id,qtd,motivo,origem) VALUES(?,?,?,?,?, 'sim')", Math.round(n - (i + 1) * 2 * H), m.id, m.op_atual, Math.round(10 + R() * 20), MOTIVOS_REFUGO[Math.floor(R() * 5)]) });
            setCfg('sim', 1); setCfg('demo', 1); garantirDispositivos(); bump();
        });
        return true;
    }
    // Simulador de sensores (roda aqui no servidor, a cada 2 s, só quando ligado). Máquinas com ESP32 online são ignoradas.
    function simTick() {
        if (cfg('sim') !== '1') return;
        const n = agora(); let mudou = false;
        tx(() => {
            all("SELECT * FROM maquinas WHERE status='produzindo' AND op_atual IS NOT NULL AND ativa=1").forEach(m => {
                if (online(m.id)) return;
                const o = get('SELECT * FROM ops WHERE id=?', m.op_atual); if (!o || o.status === 'finalizada') return;
                let f = m.fator; if (Math.random() < .002) f = Math.random() < .3 ? .4 + Math.random() * .2 : .85 + Math.random() * .25;
                const acc = (m.acumulador || 0) + m.capacidade_ph / 3600 * 2 * SIMX * (f || 1), q = Math.floor(acc);
                run('UPDATE maquinas SET acumulador=?, fator=? WHERE id=?', acc - q, f == null ? null : f, m.id); if (!q) return;
                const k = Math.min(q, o.qtd_planejada - o.qtd_produzida); if (k <= 0) return;
                run("INSERT INTO eventos_producao(maquina_id,op_id,t,qtd,origem) VALUES(?,?,?,?, 'sim')", m.id, o.id, n, k); somarNaOP(m.id, k); mudou = true;
            });
            if (mudou) bump();
        });
    }
    function limparSimulado() {
        return tx(() => {
            const a = run("DELETE FROM eventos_producao WHERE origem='sim'").changes, b = run("DELETE FROM paradas WHERE origem='sim'").changes, c = run("DELETE FROM refugos WHERE origem='sim'").changes;
            run("UPDATE ops SET qtd_produzida = MIN(qtd_planejada, COALESCE((SELECT SUM(qtd) FROM eventos_producao e WHERE e.op_id=ops.id), 0))");
            run("UPDATE ops SET status='planejada', finalizada_em=NULL WHERE status='finalizada' AND qtd_produzida < qtd_planejada");   // OP de exemplo que só estava "finalizada" por causa da simulação
            normalizar(); setCfg('sim', 0); setCfg('demo', 0); setCfg('limpeza_t', agora()); bump(); return { eventos: a, paradas: b, refugos: c };
        });
    }

    // ---------- mensagens ----------
    function listarMsgs() {
        const l = all('SELECT * FROM mensagens ORDER BY t DESC, rowid DESC LIMIT 2000').reverse(), lei = all('SELECT mensagem_id,setor_id FROM mensagem_leituras'), mp = {};
        lei.forEach(x => (mp[x.mensagem_id] = mp[x.mensagem_id] || []).push(x.setor_id));
        return l.map(m => ({ id: m.id, t: m.t, de: m.de, para: m.para, prio: m.prio, assunto: m.assunto, txt: m.txt, lido: mp[m.id] || [] }));
    }
    const criarMsg = m => { run('INSERT INTO mensagens(id,t,de,para,prio,assunto,txt) VALUES(?,?,?,?,?,?,?)', m.id, m.t, m.de, m.para, m.prio, m.assunto, m.txt); return { ...m, lido: [] } };
    function lerMsg(id, setor) {
        const m = get('SELECT * FROM mensagens WHERE id=?', id); if (!m || !ids.includes(setor)) return null;
        run('INSERT OR IGNORE INTO mensagem_leituras(mensagem_id,setor_id) VALUES(?,?)', id, setor);
        return { ...m, lido: all('SELECT setor_id FROM mensagem_leituras WHERE mensagem_id=?', id).map(x => x.setor_id) };
    }

    // ---------- fichas de produção ----------
    const FT = ['op', 'produto', 'posto', 'postoNome', 'fase', 'faseNome', 'operador', 'iniAj', 'iniProd', 'terProd', 'prevAj', 'prevProd', 'nf', 'obs'];
    const FN = ['qtdPlan', 'perdaAj', 'perdaProd', 'qtde', 'volumes', 'pcvol', 'excedente', 'total'];
    const COL = { postoNome: 'posto_nome', faseNome: 'fase_nome', iniAj: 'ini_aj', iniProd: 'ini_prod', terProd: 'ter_prod', prevAj: 'prev_aj', prevProd: 'prev_prod', qtdPlan: 'qtd_plan', perdaAj: 'perda_aj', perdaProd: 'perda_prod' };
    const col = k => COL[k] || k;
    const fichaOut = r => { const o = { id: r.id, t: r.t, de: r.de, para: r.para, status: r.status, nota: r.nota, por: r.por }; FT.forEach(k => o[k] = r[col(k)] == null ? '' : r[col(k)]); FN.forEach(k => o[k] = r[col(k)] == null ? '' : r[col(k)]); if (r.t_rev) o.tRev = r.t_rev; return o };
    const listarFichas = () => all('SELECT * FROM fichas ORDER BY t DESC, rowid DESC LIMIT 5000').reverse().map(fichaOut);
    function criarFicha(f, substitui) {
        return tx(() => {
            if (substitui) run("UPDATE fichas SET status='substituida' WHERE id=? AND de=? AND status='devolvida'", substitui, f.de);
            run(`INSERT INTO fichas(id,t,de,para,status,${FT.concat(FN).map(col).join(',')},nota,por) VALUES(?,?,?,?,?,${FT.concat(FN).map(() => '?').join(',')},?,?)`,
                f.id, f.t, f.de, f.para, f.status, ...FT.map(k => f[k] == null ? '' : f[k]), ...FN.map(k => f[k] === '' || f[k] == null ? null : f[k]), '', '');
            return fichaOut(get('SELECT * FROM fichas WHERE id=?', f.id));
        });
    }
    const getFicha = id => { const r = get('SELECT * FROM fichas WHERE id=?', id); return r ? fichaOut(r) : null };
    function statusFicha(id, status, nota, por) { run('UPDATE fichas SET status=?, nota=?, por=?, t_rev=? WHERE id=?', status, nota, por, agora(), id); return getFicha(id) }

    // ---------- consultas para ERP / relatórios ----------
    const iniDia = () => { const z = new Date(); z.setHours(0, 0, 0, 0); return z.getTime() };
    function listarMaquinas() {
        const z = iniDia();
        return all('SELECT * FROM maquinas WHERE ativa=1 ORDER BY id').map(m => ({
            id: m.id, nome: m.nome, capacidade_ph: m.capacidade_ph, status: m.status, op: m.op_atual || '', topico_mqtt: 'milenio/maq' + m.id + '/producao',
            produzido_hoje: (get('SELECT COALESCE(SUM(qtd),0) AS s FROM eventos_producao WHERE maquina_id=? AND t>=?', m.id, z) || {}).s,
            parada_em_curso: (get('SELECT motivo FROM paradas WHERE maquina_id=? AND fim IS NULL', m.id) || {}).motivo || null,
            esp32_online: online(m.id)
        }));
    }
    const listarOps = status => all('SELECT * FROM v_ops_andamento' + (status ? ' WHERE status=?' : '') + ' ORDER BY CAST(op AS INTEGER)', ...(status ? [status] : []));
    function detalheOp(id) {
        const o = get('SELECT o.*, p.nome AS produto, p.tipo, p.comprimento_mm, p.largura_mm, p.altura_mm FROM ops o JOIN produtos p ON p.cod=o.produto_cod WHERE o.id=?', id); if (!o) return null;
        return { ...o, desenho: { tipo: o.tipo, comprimento_mm: o.comprimento_mm, largura_mm: o.largura_mm, altura_mm: o.altura_mm, revisoes: all('SELECT rev,data,nota FROM produto_revisoes WHERE produto_cod=? ORDER BY id', o.produto_cod) } };
    }
    function producao(maq, de, ate, agrupar) {
        const a = Date.parse(de) || agora() - 24 * H, b = Date.parse(ate) || agora() + 1, div = agrupar === 'dia' ? 86400000 : agrupar === 'minuto' ? 60000 : 3600000;
        return all(`SELECT maquina_id, (t/${div})*${div} AS inicio_ms, SUM(qtd) AS pecas FROM eventos_producao WHERE t>=? AND t<? ${maq ? 'AND maquina_id=?' : ''} GROUP BY maquina_id, t/${div} ORDER BY inicio_ms LIMIT 20000`, a, b, ...(maq ? [maq] : []))
            .map(r => ({ maquina: r.maquina_id, inicio: new Date(r.inicio_ms).toISOString(), pecas: r.pecas }));
    }
    const listarDispositivos = () => all('SELECT * FROM v_dispositivos_status ORDER BY id');

    // ---------- migração dos arquivos JSON antigos (mensagens.json / fichas.json) ----------
    function migrarJson() {
        const lerJ = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch (e) { return null } };
        const rel = [];
        if (!get('SELECT COUNT(*) AS n FROM mensagens').n) { const l = lerJ('mensagens.json'); if (Array.isArray(l) && l.length) tx(() => { l.forEach(m => { if (!ids.includes(m.de) || !m.id) return; run('INSERT OR IGNORE INTO mensagens(id,t,de,para,prio,assunto,txt) VALUES(?,?,?,?,?,?,?)', m.id, +m.t || agora(), m.de, m.para, m.prio === 'urgente' ? 'urgente' : 'normal', String(m.assunto || ''), String(m.txt || '')); (m.lido || []).forEach(s => ids.includes(s) && run('INSERT OR IGNORE INTO mensagem_leituras(mensagem_id,setor_id) VALUES(?,?)', m.id, s)) }); rel.push(l.length + ' mensagens') }) }
        if (!get('SELECT COUNT(*) AS n FROM fichas').n) { const l = lerJ('fichas.json'); if (Array.isArray(l) && l.length) tx(() => { let k = 0; l.forEach(f => { if (!ids.includes(f.de) || !ids.includes(f.para) || !f.id) return; try { run(`INSERT OR IGNORE INTO fichas(id,t,de,para,status,${FT.concat(FN).map(col).join(',')},nota,por,t_rev) VALUES(?,?,?,?,?,${FT.concat(FN).map(() => '?').join(',')},?,?,?)`, f.id, +f.t || agora(), f.de, f.para, ['enviada', 'aprovada', 'devolvida', 'substituida'].includes(f.status) ? f.status : 'enviada', ...FT.map(x => String(f[x] == null ? '' : f[x])), ...FN.map(x => f[x] === '' || f[x] == null ? null : Math.round(+f[x]) || 0), String(f.nota || ''), String(f.por || ''), f.tRev || null); k++ } catch (e) { } }); rel.push(k + ' fichas') }) }
        return rel;
    }

    return { db, arquivo, tx, get, all, run, cfg, setCfg, ver, bump, estado, aplicarEstado, semearDemo, simTick, limparSimulado, migrarJson,
        criarDispositivo, novoTokenDispositivo, garantirDispositivos, autenticar, contato, configDispositivo, registrarEventos, registrarParada, registrarRefugo, listarDispositivos,
        listarMsgs, criarMsg, lerMsg, listarFichas, criarFicha, getFicha, statusFicha, listarMaquinas, listarOps, detalheOp, producao, MOTIVOS_PARADA, MOTIVOS_REFUGO };
}
module.exports = { abrir };
