/* FICHA DE PRODUÇÃO
   Substitui o preenchimento à mão do "Plano de produção / Inspeção final / Faturamento" da Ordem de Fabricação (OF).
   O operador escolhe a máquina e a OP, aperta os botões de hora (ajuste, início e fim da produção), informa perdas e quantidade
   e envia ao responsável. O responsável aprova ou devolve com um recado. Usa o servidor (server.js) quando ele está ligado;
   sem servidor, funciona em "modo local" (só naquele navegador).
   Carregado depois do app.js: usa as variáveis dele (S, V, NAV, SETORES, go, modal, enviarMsg...). */
(() => {
    // ---------- o que cada máquina preenche ----------
    // extra: [campo, rótulo, tipo, obrigatório]
    const VOL = [['volumes', 'Volumes', 'number', 1], ['pcvol', 'Peças por volume', 'number', 1], ['excedente', 'Excedente', 'number', 0], ['total', 'Total de caixas', 'number', 1]];
    const FASES = {
        riscador: { nome: 'Riscador', extra: [] },
        impressora: { nome: 'Impressora', extra: [] },
        cortevinco: { nome: 'Corte e Vinco', extra: [] },
        amarracao: { nome: 'Amarração / Colagem', extra: [['volumes', 'Volumes', 'number', 0], ['pcvol', 'Peças por volume', 'number', 0]] },
        geral: { nome: 'Máquina', extra: [] },
        inspecao: { nome: 'Inspeção final', semTempo: true, quem: 'Lançado por', extra: VOL },
        faturamento: { nome: 'Faturamento', semTempo: true, quem: 'Lançado por', extra: VOL.concat([['nf', 'NF Nº', 'text', 1]]) }
    };
    // O tipo é deduzido pelo nome da máquina cadastrada (Flexográfica -> Impressora, Corte e Vinco, Colagem -> Amarração...)
    const faseDe = m => { const n = String(m.nome).toLowerCase(); return /riscad/.test(n) ? 'riscador' : /flexo|impress/.test(n) ? 'impressora' : /corte|vinco/.test(n) ? 'cortevinco' : /cola|amarr/.test(n) ? 'amarracao' : 'geral' };
    const postos = () => {
        const c = contaAberta, maq = S.machines.map(m => ({ id: m.id, nome: m.nome, fase: faseDe(m), m }));
        const insp = { id: 'inspecao', nome: 'Inspeção final', fase: 'inspecao' }, fat = { id: 'faturamento', nome: 'Faturamento', fase: 'faturamento' };
        return c === 'producao' ? maq : c === 'qualidade' ? [insp] : c === 'expedicao' ? [fat] : c === 'admin' ? maq.concat([insp, fat]) : [];
    };
    const STATUS = { enviada: ['Aguardando', 't-planejada'], aprovada: ['Aprovada', 't-produzindo'], devolvida: ['Devolvida', 't-parada'], substituida: ['Substituída', 't-finalizada'] };

    // ---------- horas ----------
    const agora = () => new Date().toTimeString().slice(0, 5);
    const toM = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? +m[1] * 60 + +m[2] : null };
    const mins = (a, b) => { a = toM(a); b = toM(b); return a == null || b == null ? null : (b - a + 1440) % 1440 };   // passa da meia-noite sem problema
    const hhmm = m => m == null ? '--:--' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

    // ---------- rascunho (fica no aparelho do operador até enviar) ----------
    const RK = 'milenio_ficha_rasc', OK = 'milenio_ficha_operador'; let RAS = {};
    try { RAS = JSON.parse(localStorage.getItem(RK)) || {} } catch (e) { }
    const saveR = () => { try { localStorage.setItem(RK, JSON.stringify(RAS)) } catch (e) { } };
    const novoRasc = () => { let op = ''; try { op = localStorage.getItem(OK) || '' } catch (e) { } return { operador: op, para: 'planejamento', iniAj: '', iniProd: '', terProd: '', perdaAj: '', perdaProd: '', qtde: '', prevAj: '', prevProd: '', volumes: '', pcvol: '', excedente: '', total: '', nf: '', obs: '' } };

    // ---------- fichas enviadas (servidor, com cópia local) ----------
    const LK = 'milenio_fichas_local'; let FICHAS = [], fsig = '';
    try { FICHAS = JSON.parse(localStorage.getItem(LK)) || [] } catch (e) { }
    const persist = () => { try { localStorage.setItem(LK, JSON.stringify(FICHAS)) } catch (e) { } };
    const assinatura = () => FICHAS.map(f => f.id + f.status).join(',');
    async function sync() {
        if (!contaAberta) return;
        try { const r = await fetch('/api/fichas', { cache: 'no-store' }); if (!r.ok) throw 0; FICHAS = await r.json() }
        catch (e) { try { FICHAS = JSON.parse(localStorage.getItem(LK)) || FICHAS } catch (x) { } }
        const s = assinatura();
        if (s !== fsig) { fsig = s; const a = document.activeElement; if (window._cur === 'ficha' && ft !== 'fill' && !$('.mod') && !(a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) go(true) }
    }
    async function api(url, corpo) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        if (!r.ok) throw new Error('falha'); return r.json();
    }
    async function enviarFicha(reg) {
        if (online) { await api('/api/fichas', reg) }
        else {
            if (reg.substitui) FICHAS.forEach(f => { if (f.id === reg.substitui) f.status = 'substituida' });
            FICHAS.push({ ...reg, id: 'f' + Date.now().toString(36), t: Date.now(), status: 'enviada', nota: '' }); persist();
        }
        await sync();
    }
    async function revisarFicha(f, status, nota) {
        if (online) await api('/api/fichas/' + f.id + '/status', { status, nota, por: contaAberta });
        else { f.status = status; f.nota = nota; f.por = contaAberta; f.tRev = Date.now(); persist() }
        await sync();
    }

    // ---------- estado da tela ----------
    let ft = null, sel = { posto: '', op: '' }, contaVista = '';
    const chave = () => contaAberta + '|' + sel.posto + '|' + sel.op;
    const rasc = () => RAS[chave()] || (RAS[chave()] = novoRasc());
    const tipoBtn = (k, t) => `<button data-ft="${k}" class="${ft === k ? 'p' : ''}">${t}</button>`;
    const pendentes = () => FICHAS.filter(f => f.status === 'enviada' && (contaAberta === 'admin' || f.para === contaAberta)).length;

    function opsDoPosto(pt) {
        if (pt.m) return ordenarOPs(S.ops.filter(o => o.maq === pt.id));
        return ordenarOPs(S.ops.slice());
    }
    function ajustaSelecao() {
        const ps = postos(); if (!ps.length) return null;
        let pt = ps.find(p => p.id === sel.posto); if (!pt) { pt = ps[0]; sel.posto = pt.id; sel.op = '' }
        const ops = opsDoPosto(pt); let o = ops.find(x => x.id === sel.op);
        if (!o) { o = (pt.m && O(pt.m.op)) || ops[0]; sel.op = o ? o.id : '' }
        return { pt, ops, o };
    }

    // ---------- tempos calculados (parte que muda enquanto digita) ----------
    function calc(d, fase) {
        if (FASES[fase].semTempo) return '';
        const aj = mins(d.iniAj, d.iniProd), pr = mins(d.iniProd, d.terProd), pa = toM(d.prevAj), pp = toM(d.prevProd);
        const tot = aj == null && pr == null ? null : (aj || 0) + (pr || 0), pt = pa == null && pp == null ? null : (pa || 0) + (pp || 0);
        const cel = (t, real, prev) => `<div class="card" style="padding:10px;flex:1 1 90px"><small class="sub">${t}</small><div style="font-size:1.4rem;font-weight:700;${real != null && prev != null && real > prev ? 'color:var(--warn)' : ''}">${hhmm(real)}</div><small class="sub">previsto ${hhmm(prev)}</small></div>`;
        return `<div class="row" style="gap:10px;margin:12px 0">${cel('Tempo de ajuste', aj, pa)}${cel('Tempo de produção', pr, pp)}${cel('Total', tot, pt)}</div>`;
    }

    // ---------- tela ----------
    V.ficha = () => {
        if (contaVista !== contaAberta) { contaVista = contaAberta; ft = null; sel = { posto: '', op: '' } }   // outra conta no mesmo aparelho: começa do zero
        const ps = postos(); if (!ft) ft = ps.length ? 'fill' : 'in'; if (!ps.length && ft === 'fill') ft = 'in';
        const nP = pendentes();
        const tabs = `<div class="row" style="margin-bottom:14px">${ps.length ? tipoBtn('fill', 'Preencher ficha') : ''}${tipoBtn('in', 'Recebidas' + (nP ? ' (' + nP + ')' : ''))}${tipoBtn('out', 'Enviadas por mim')}<div class="sp"></div><span class="sub">${online ? '<b style="color:var(--ok)">&#9679; Servidor conectado</b>' : '<b style="color:var(--warn)">&#9679; Modo local</b> - sem servidor as fichas ficam só neste navegador'}</span></div>`;
        return `<style>.fp label{margin-top:12px}.fp .fpb{padding:16px 10px;font-size:1.05rem;flex:1 1 150px}.fp .t2{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.fp .fc{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px}.fp .fc dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 14px;margin:8px 0}.fp .fc dt{font-size:12px;color:var(--mut)}.fp .fc dd{margin:0;font-weight:700}</style><div class="fp">${tabs}${ft === 'fill' ? htmlPreencher() : htmlLista(ft)}</div>`;
    };

    function htmlPreencher() {
        const s = ajustaSelecao(); if (!s) return '<div class="card sub">Seu setor não preenche fichas.</div>';
        const { pt, ops, o } = s, f = FASES[pt.fase], d = o ? rasc() : null;
        let corpo;
        if (!o) corpo = '<div class="alert">Nenhuma OP encontrada para este posto. Peça ao Planejamento (PCP) para associar uma OP.</div>';
        else {
            const p = P(o.prod), campoHora = (k, t) => `<div><label>${t}</label><input type="time" data-k="${k}" value="${esc(d[k])}"></div>`;
            const horas = f.semTempo ? '' : `<h2 style="margin-top:18px">Tempos</h2>
<div class="row" style="gap:10px"><button class="fpb" data-hora="iniAj">1. Iniciar ajuste</button><button class="fpb" data-hora="iniProd">2. Iniciar produção</button><button class="fpb" data-hora="terProd">3. Finalizar produção</button></div>
<div class="t2" style="margin-top:6px">${campoHora('iniAj', 'Início do ajuste')}${campoHora('iniProd', 'Início da produção')}${campoHora('terProd', 'Fim da produção')}</div>
<div id="fcalc">${calc(d, pt.fase)}</div>
<details style="margin-bottom:6px"><summary class="sub" style="cursor:pointer">Tempos previstos (da Ordem de Fabricação)</summary><div class="t2">${campoHora('prevAj', 'T. ajuste previsto')}${campoHora('prevProd', 'T. produção previsto')}</div></details>
<h2 style="margin-top:14px">Perdas e quantidade</h2><div class="t2"><div><label>Perda no ajuste</label><input type="number" min="0" inputmode="numeric" data-k="perdaAj" value="${esc(d.perdaAj)}"></div><div><label>Perda na produção</label><input type="number" min="0" inputmode="numeric" data-k="perdaProd" value="${esc(d.perdaProd)}"></div><div><label>Quantidade produzida</label><input type="number" min="0" inputmode="numeric" data-k="qtde" value="${esc(d.qtde)}"></div></div><div class="sub" style="margin-top:4px">Contador da OP no sistema: ${nf(o.feito)} de ${nf(o.qtd)}</div>`;
            const extras = f.extra.length ? `<h2 style="margin-top:18px">${f.semTempo ? 'Dados da etapa' : 'Volumes'}</h2><div class="t2">${f.extra.map(x => `<div><label>${x[1]}${x[3] ? ' *' : ''}</label><input type="${x[2]}" ${x[2] === 'number' ? 'min="0" inputmode="numeric"' : ''} data-k="${x[0]}" value="${esc(d[x[0]])}"></div>`).join('')}</div>` : '';
            corpo = `<div class="sub">${esc((p || {}).nome || o.prod)} | Meta ${nf(o.qtd)} peças | Prazo ${new Date(o.prazo + 'T12:00').toLocaleDateString('pt-BR')} ${ptag(o)}</div>
${d.substitui ? '<div class="alert" style="margin-top:10px">Corrigindo uma ficha devolvida. Ao enviar, ela substitui a anterior.</div>' : ''}${horas}${extras}
<label>Observação</label><textarea data-k="obs" rows="2" maxlength="500">${esc(d.obs)}</textarea>
<div class="t2"><div><label>${f.quem || 'Operador'} *</label><input data-k="operador" value="${esc(d.operador)}" maxlength="60" autocomplete="name"></div><div><label>Enviar para (responsável)</label><select data-k="para">${SETORES.filter(x => x.id !== contaAberta).map(x => `<option value="${x.id}" ${x.id === d.para ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div></div>
<div id="ferr"></div><div class="row" style="margin-top:16px"><button id="flimpa">Limpar</button><div class="sp"></div><button class="p fpb" id="fenv" style="flex:0 1 260px">Enviar ao responsável</button></div>`;
        }
        return `<div class="card"><div class="t2"><div><label style="margin-top:0">Máquina / posto</label><select id="fposto">${postos().map(x => `<option value="${x.id}" ${x.id === pt.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div><div><label style="margin-top:0">Ordem de Produção</label><select id="fop">${ops.map(x => `<option value="${x.id}" ${o && x.id === o.id ? 'selected' : ''}>OP ${x.id} - ${esc((P(x.prod) || {}).nome || x.prod)}${x.st === 'finalizada' ? ' (finalizada)' : ''}</option>`).join('')}</select></div></div>
<div class="sub" style="margin-top:8px">Etapa desta ficha: <b>${f.nome}</b></div><div style="margin-top:6px">${corpo}</div></div>`;
    }

    const num = v => v === '' || v == null ? '-' : nf(v);
    function cartao(f, modo) {
        const st = STATUS[f.status] || [f.status, ''], fx = FASES[f.fase] || { extra: [] };
        const aj = mins(f.iniAj, f.iniProd), pr = mins(f.iniProd, f.terProd), pa = toM(f.prevAj), pp = toM(f.prevProd);
        const dd = (t, v) => `<div><dt>${t}</dt><dd>${v}</dd></div>`;
        const itens = (fx.semTempo ? '' : dd('Ajuste', hhmm(aj) + (pa != null ? ' <small>(prev. ' + hhmm(pa) + ')</small>' : '')) + dd('Produção', hhmm(pr) + (pp != null ? ' <small>(prev. ' + hhmm(pp) + ')</small>' : '')) + dd('Perda ajuste', num(f.perdaAj)) + dd('Perda produção', num(f.perdaProd)) + dd('Qtde produzida', num(f.qtde))) + fx.extra.map(x => dd(x[1], f[x[0]] === '' || f[x[0]] == null ? '-' : esc(x[2] === 'number' ? nf(f[x[0]]) : f[x[0]]))).join('');
        const acoes = modo === 'in' && f.status === 'enviada' ? `<div class="row" style="margin-top:8px"><button class="p" data-ok="${f.id}">Aprovar</button><button class="d" data-no="${f.id}">Devolver</button></div>`
            : modo === 'out' && f.status === 'devolvida' && f.de === contaAberta ? `<div class="row" style="margin-top:8px"><button class="p" data-fix="${f.id}">Corrigir e reenviar</button></div>` : '';
        return `<div class="fc"><div class="row"><b>OP ${esc(f.op)} - ${esc(f.postoNome)}</b><span class="tag ${st[1]}">${st[0]}</span><div class="sp"></div><small>${fmt(f.t)}</small></div>
<small class="sub">${esc(f.faseNome)} | ${esc(f.produto || '')} | ${esc((fx.quem || 'Operador'))}: <b>${esc(f.operador)}</b> | ${modo === 'in' ? 'De: ' + esc(sn(f.de)) : 'Para: ' + esc(sn(f.para))}</small>
<dl>${itens}</dl>${f.obs ? `<div class="sub">Obs.: ${esc(f.obs)}</div>` : ''}${f.nota ? `<div class="alert" style="margin-top:8px"><b>${f.status === 'devolvida' ? 'Motivo da devolução' : 'Recado'} (${esc(sn(f.por || ''))}):</b> ${esc(f.nota)}</div>` : ''}${acoes}</div>`;
    }
    function htmlLista(modo) {
        const me = contaAberta, l = FICHAS.filter(f => modo === 'in' ? (me === 'admin' || f.para === me) : f.de === me).sort((a, b) => b.t - a.t);
        const csv = modo === 'in' && l.length ? '<button id="fcsv">Baixar planilha (CSV)</button>' : '';
        return `<div class="card">${csv ? `<div class="row" style="margin-bottom:10px"><div class="sp"></div>${csv}</div>` : ''}${l.length ? l.map(f => cartao(f, modo)).join('') : '<div class="sub">' + (modo === 'in' ? 'Nenhuma ficha recebida.' : 'Você ainda não enviou fichas.') + '</div>'}</div>`;
    }

    function baixarCSV() {
        const cab = ['Data/hora', 'OP', 'Produto', 'Posto', 'Etapa', 'Operador', 'De', 'Para', 'Status', 'Início ajuste', 'Início produção', 'Fim produção', 'Tempo ajuste', 'Tempo produção', 'Prev. ajuste', 'Prev. produção', 'Perda ajuste', 'Perda produção', 'Qtde produzida', 'Volumes', 'Pç/volume', 'Excedente', 'Total caixas', 'NF', 'Observação', 'Recado do responsável'];
        const lin = FICHAS.filter(f => contaAberta === 'admin' || f.para === contaAberta).sort((a, b) => a.t - b.t).map(f => [fmt(f.t), f.op, f.produto, f.postoNome, f.faseNome, f.operador, sn(f.de), sn(f.para), (STATUS[f.status] || [f.status])[0], f.iniAj, f.iniProd, f.terProd, hhmm(mins(f.iniAj, f.iniProd)), hhmm(mins(f.iniProd, f.terProd)), f.prevAj, f.prevProd, f.perdaAj, f.perdaProd, f.qtde, f.volumes, f.pcvol, f.excedente, f.total, f.nf, f.obs, f.nota]);
        const t = [cab].concat(lin).map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv;charset=utf-8' })); a.download = 'fichas-producao.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }

    function validar(d, f) {
        const e = [], F = FASES[f];
        if (!String(d.operador).trim()) e.push('Informe o nome de quem está preenchendo.');
        if (!F.semTempo) {
            if (!d.iniProd || !d.terProd) e.push('Informe o início e o fim da produção.');
            if (d.qtde === '') e.push('Informe a quantidade produzida.');
        }
        F.extra.filter(x => x[3] && String(d[x[0]]).trim() === '').forEach(x => e.push('Preencha: ' + x[1] + '.'));
        return e;
    }
    async function enviar() {
        const s = ajustaSelecao(), d = rasc(), erros = validar(d, s.pt.fase), box = $('#ferr');
        if (erros.length) { box.innerHTML = '<div class="alert r" style="margin-top:12px">' + erros.map(esc).join('<br>') + '</div>'; return }
        const reg = { op: s.o.id, produto: (P(s.o.prod) || {}).nome || s.o.prod, qtdPlan: s.o.qtd, posto: s.pt.id, postoNome: s.pt.nome, fase: s.pt.fase, faseNome: FASES[s.pt.fase].nome, de: contaAberta, para: d.para, substitui: d.substitui || '' };
        ['operador', 'obs', 'iniAj', 'iniProd', 'terProd', 'perdaAj', 'perdaProd', 'qtde', 'prevAj', 'prevProd', 'volumes', 'pcvol', 'excedente', 'total', 'nf'].forEach(k => reg[k] = d[k]);
        const b = $('#fenv'); b.disabled = true; b.textContent = 'Enviando...';
        try {
            await enviarFicha(reg);
            const F = FASES[reg.fase], resumo = `Ficha de produção enviada por ${reg.operador}.\nOP ${reg.op} - ${reg.produto}\nPosto: ${reg.postoNome} (${F.nome})` + (F.semTempo ? '' : `\nAjuste ${hhmm(mins(reg.iniAj, reg.iniProd))} | Produção ${hhmm(mins(reg.iniProd, reg.terProd))}\nPerdas: ajuste ${reg.perdaAj || 0}, produção ${reg.perdaProd || 0}\nQuantidade produzida: ${reg.qtde}`) + F.extra.filter(x => reg[x[0]] !== '').map(x => `\n${x[1]}: ${reg[x[0]]}`).join('') + (reg.obs ? '\nObs.: ' + reg.obs : '') + '\n\nAbra "Ficha de Produção > Recebidas" para aprovar ou devolver.';
            try { localStorage.setItem(OK, reg.operador) } catch (e) { }
            try { await enviarMsg({ de: contaAberta, para: reg.para, prio: 'normal', assunto: `Ficha de produção - OP ${reg.op} - ${reg.postoNome}`, txt: resumo }) } catch (e) { }
            delete RAS[chave()]; saveR(); ft = 'out'; go(); toastOk('Ficha enviada para ' + sn(reg.para) + '.');
        } catch (e) { b.disabled = false; b.textContent = 'Enviar ao responsável'; box.innerHTML = '<div class="alert r" style="margin-top:12px">Não foi possível enviar. Confira a conexão com o servidor e tente de novo (os dados continuam salvos neste aparelho).</div>' }
    }
    function toastOk(t) { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = '<b>' + esc(t) + '</b>'; d.onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), 5000) }

    V.ficha.after = () => {
        document.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => { ft = b.dataset.ft; go() });
        if (ft === 'fill') {
            const ps = $('#fposto'), po = $('#fop');
            if (ps) ps.onchange = e => { sel.posto = e.target.value; sel.op = ''; go() };
            if (po) po.onchange = e => { sel.op = e.target.value; go() };
            const s = ajustaSelecao(); if (!s || !s.o) return;
            const d = rasc();
            document.querySelectorAll('[data-k]').forEach(el => el.oninput = el.onchange = () => { d[el.dataset.k] = el.value; saveR(); const c = $('#fcalc'); if (c) c.innerHTML = calc(d, s.pt.fase) });
            document.querySelectorAll('[data-hora]').forEach(b => b.onclick = () => { d[b.dataset.hora] = agora(); saveR(); go() });
            $('#flimpa').onclick = () => { if (confirm('Apagar tudo o que foi preenchido nesta ficha?')) { delete RAS[chave()]; saveR(); go() } };
            $('#fenv').onclick = enviar;
        } else {
            document.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => { const f = FICHAS.find(x => x.id === b.dataset.ok); if (f) decidir(f, 'aprovada') });
            document.querySelectorAll('[data-no]').forEach(b => b.onclick = () => { const f = FICHAS.find(x => x.id === b.dataset.no); if (f) decidir(f, 'devolvida') });
            document.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => {
                const f = FICHAS.find(x => x.id === b.dataset.fix); if (!f) return;
                sel.posto = f.posto; sel.op = f.op; const d = Object.assign(novoRasc(), { para: f.para, substitui: f.id });
                ['operador', 'obs', 'iniAj', 'iniProd', 'terProd', 'perdaAj', 'perdaProd', 'qtde', 'prevAj', 'prevProd', 'volumes', 'pcvol', 'excedente', 'total', 'nf'].forEach(k => d[k] = f[k] == null ? '' : f[k]);
                RAS[chave()] = d; saveR(); ft = 'fill'; go();
            });
            const c = $('#fcsv'); if (c) c.onclick = baixarCSV;
        }
    };
    function decidir(f, status) {
        const ok = async nota => {
            try {
                await revisarFicha(f, status, nota);
                const msg = status === 'aprovada' ? `Sua ficha da OP ${f.op} (${f.postoNome}) foi aprovada.` + (nota ? '\nRecado: ' + nota : '') : `Sua ficha da OP ${f.op} (${f.postoNome}) foi devolvida.\nMotivo: ${nota}\n\nAbra "Ficha de Produção > Enviadas por mim" e use "Corrigir e reenviar".`;
                if (f.de !== contaAberta) await enviarMsg({ de: contaAberta, para: f.de, prio: status === 'devolvida' ? 'urgente' : 'normal', assunto: `Ficha ${status === 'aprovada' ? 'aprovada' : 'devolvida'} - OP ${f.op} - ${f.postoNome}`, txt: msg });
            } catch (e) { toastOk('Não foi possível registrar. Tente de novo.') }
            go();
        };
        if (status === 'aprovada') { ok(''); return }
        modal('Devolver ficha', '<label>Motivo da devolução (o operador verá este texto)</label><textarea id="fnota" rows="4" maxlength="300"></textarea>', () => { const n = $('#fnota').value.trim(); if (!n) { $('#fnota').focus(); return false } ok(n) });
    }

    // ---------- liga a tela no menu dos setores ----------
    NAV.push(['ficha', 'Ficha de Produção', 'Preenchimento da OF por máquina e envio ao responsável']);
    ['producao', 'qualidade', 'expedicao', 'planejamento', 'admin'].forEach(id => {
        const s = SETORES.find(x => x.id === id); if (!s || s.telas.includes('ficha')) return;
        const i = s.telas.indexOf('operador'), j = i >= 0 ? i + 1 : s.telas.indexOf('comunicacao');
        s.telas.splice(j < 0 ? s.telas.length : j, 0, 'ficha');
    });
    // aviso numérico no menu: fichas aguardando decisão
    setInterval(() => { const a = $('#nav a[href="#ficha"]'); if (!a || !contaAberta) return; const n = pendentes(); n ? a.setAttribute('data-n', n) : a.removeAttribute('data-n') }, 2000);
    window.fichaAba = k => { ft = k; if (window._cur === 'ficha') go() };   // usado pelo tutorial para trocar de aba
    sync(); setInterval(sync, 3000);
})();
