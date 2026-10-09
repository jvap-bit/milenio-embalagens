// Manutenção do banco pelo terminal (rode dentro da pasta "servidor"; pode rodar com o servidor ligado).
//   node banco/manutencao.js dispositivos                      lista os ESP32 e se estão online
//   node banco/manutencao.js novo-dispositivo 01               cria outro ESP32 para a máquina 01 e mostra o token
//   node banco/manutencao.js novo-token esp32-01               gera um token novo (o antigo deixa de funcionar)
//   node banco/manutencao.js calibrar esp32-01 4 10            4 pulsos do sensor = 1 peça; envia a cada 10 s
//   node banco/manutencao.js desativar esp32-01                bloqueia o aparelho (ativar para voltar)
//   node banco/manutencao.js maquina 03 "Colagem 03" 800     cria/renomeia máquina (nome e capacidade em peças/hora); cria o ESP32 dela
//   node banco/manutencao.js remover-maquina 03                apaga a máquina e o histórico dela
//   node banco/manutencao.js limpar-simulado                   apaga produção/paradas/refugos simulados
//   node banco/manutencao.js backup [arquivo.db]               copia o banco (padrão: dados/backup-AAAA-MM-DD.db)
'use strict';
const path = require('path'), fs = require('fs');
const DATA = path.join(__dirname, '..', 'dados');
let D; try { D = require('../db.js').abrir(DATA) } catch (e) { console.log('Não foi possível abrir o banco: ' + e.message); process.exit(1) }
const [cmd, a, b, c] = process.argv.slice(2);
const aviso = id => console.log('Dispositivo ' + id + ' - veja também ' + path.join(DATA, 'esp32_tokens.txt'));
try {
    if (cmd === 'dispositivos') console.table(D.listarDispositivos());
    else if (cmd === 'novo-dispositivo' && a) { const r = D.criarDispositivo(a); console.log('Criado ' + r.id + ' (máquina ' + r.maquina + ')\nTOKEN: ' + r.token); aviso(r.id) }
    else if (cmd === 'novo-token' && a) { const r = D.novoTokenDispositivo(a); console.log('Novo token de ' + r.id + ':\n' + r.token); aviso(r.id) }
    else if (cmd === 'calibrar' && a && +b > 0) { const r = D.run('UPDATE dispositivos SET pulsos_por_peca=?, intervalo_envio_s=COALESCE(?,intervalo_envio_s) WHERE id=?', Math.round(+b), c ? Math.min(3600, Math.max(1, Math.round(+c))) : null, a); console.log(r.changes ? 'Calibração salva. O ESP32 aplica na próxima vez que ligar.' : 'Dispositivo não encontrado: ' + a) }
    else if ((cmd === 'desativar' || cmd === 'ativar') && a) { const r = D.run('UPDATE dispositivos SET ativo=? WHERE id=?', cmd === 'ativar' ? 1 : 0, a); console.log(r.changes ? 'Ok.' : 'Dispositivo não encontrado: ' + a) }
    else if (cmd === 'maquina' && a && b) { D.run('INSERT INTO maquinas(id,nome,capacidade_ph) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, capacidade_ph=COALESCE(?,capacidade_ph), ativa=1', a, b, Math.max(1, Math.round(+c) || 500), c ? Math.max(1, Math.round(+c)) : null); const n = D.garantirDispositivos(); D.bump(); console.log('Máquina ' + a + ' salva.' + n.map(x => '\nESP32 ' + x.id + ' criado, token: ' + x.token).join('')) }
    else if (cmd === 'remover-maquina' && a) { const r = D.run('DELETE FROM maquinas WHERE id=?', a); D.bump(); console.log(r.changes ? 'Máquina apagada (e o histórico dela).' : 'Máquina não encontrada: ' + a) }
    else if (cmd === 'limpar-simulado') console.log('Apagado:', D.limparSimulado());
    else if (cmd === 'backup') { const dest = path.resolve(a || path.join(DATA, 'backup-' + new Date().toISOString().slice(0, 10) + '.db')); if (fs.existsSync(dest)) fs.unlinkSync(dest); D.db.exec("VACUUM INTO '" + dest.replace(/'/g, "''") + "'"); console.log('Backup salvo em ' + dest) }
    else console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
} catch (e) { console.log('Erro: ' + e.message); process.exitCode = 1 }
