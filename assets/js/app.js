const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'milenio_v1', H = 3600e3, STOPS = ['Manutenção', 'Falta de material', 'Setup', 'Troca de ferramenta', 'Ajuste de qualidade', 'Intervalo'], SCRAP = ['Impressão', 'Corte', 'Vinco', 'Material', 'Colagem'];
let S, mem = null;
var DBS = { ativo: false, sujo: false, enviando: false, n: 0, ver: -1, ev: null, conhecidas: new Set(), t: null, falhas: 0 };   // ligação com o banco de dados do servidor (ver bloco "BANCO DE DADOS" abaixo)
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) { mem = S } dbMarcar() };
const load = () => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null } catch (e) { return mem } };
function seed() {
    const n = Date.now(), R = Math.random;
    const machines = [{ id: '01', nome: 'Flexográfica 01', rate: 600, st: 'produzindo', op: '1023', acc: 0 }, { id: '02', nome: 'Corte e Vinco 02', rate: 450, st: 'parada', op: '1027', acc: 0 }, { id: '03', nome: 'Colagem 03', rate: 800, st: 'disponivel', op: '', acc: 0 }, { id: '04', nome: 'Corte e Vinco 04', rate: 500, st: 'produzindo', op: '1025', acc: 0 }];
    const prods = [['PAD', 'Padrão (abas se encontram)', [300, 220, 180], 'padrao'], ['COR', 'Correios / Sedex', [270, 180, 90], 'correios'], ['ENV', 'Envelope', [300, 220, 60], 'envelope'], ['TEL', 'Telescópica (fundo semi-automático)', [300, 220, 150], 'telescopica'], ['MAL', 'Maleta (com alça)', [250, 150, 260], 'maleta']].map(p => ({ cod: p[0], nome: p[1], dim: p[2], tipo: p[3], revs: [{ rev: 'A', data: new Date(n - 60 * 24 * H).toLocaleDateString('pt-BR'), nota: 'Emissão inicial' }] }));
    const d = new Date(n + 0); const ops = [
        { id: '1023', prod: 'PAD', qtd: 5000, feito: 4500, maq: '01', st: 'produzindo', prazo: '2026-10-08', prio: 'normal' },
        { id: '1024', prod: 'COR', qtd: 3000, feito: 3000, maq: '04', st: 'finalizada', prazo: '2026-10-05', prio: 'normal' },
        { id: '1025', prod: 'ENV', qtd: 5000, feito: 2920, maq: '04', st: 'produzindo', prazo: '2026-10-09', prio: 'alta' },
        { id: '1026', prod: 'TEL', qtd: 10000, feito: 0, maq: '03', st: 'planejada', prazo: '2026-10-12', prio: 'baixa' },
        { id: '1027', prod: 'MAL', qtd: 4000, feito: 1200, maq: '02', st: 'produzindo', prazo: '2026-10-10', prio: 'urgente' }];
    const events = []; const hs = Math.floor(n / H) * H;
    machines.forEach(m => { for (let k = 7 * 24; k >= 0; k--) { const t = hs - k * H, h = new Date(t).getHours(); const q = Math.round(m.rate * (h >= 6 && h < 22 ? .65 + R() * .3 : .1 * R())); if (q && t + H / 2 < n) events.push({ t: t + H / 2, m: m.id, q }) } });
    const stops = [{ m: '04', motivo: 'Setup', ini: n - 5 * H, fim: n - 4.6 * H }, { m: '01', motivo: 'Troca de ferramenta', ini: n - 3 * H, fim: n - 2.8 * H }, { m: '03', motivo: 'Falta de material', ini: n - 6 * H, fim: n - 5.5 * H }, { m: '02', motivo: 'Manutenção', ini: n - 40 * 60e3, fim: null }];
    const scrap = []; machines.forEach(m => { for (let i = 0; i < 3; i++)scrap.push({ t: n - (i + 1) * 2 * H, m: m.id, op: m.op, q: Math.round(10 + R() * 20), motivo: SCRAP[Math.floor(R() * 5)] }) });
    return { machines, prods, ops, events, stops, scrap, sim: true, seq: 1028 }
}
const LOCAL0 = load(); S = LOCAL0 || seed();
// Migração: dados de exemplo antigos (Caixa Grande/Média/Pequena/Embalagem A) passam a usar os nomes dos modelos do desenho.
(() => {
    const mp = { 'CX-G': ['PAD', 'Padrão (abas se encontram)', [300, 220, 180], 'padrao', 'Caixa Grande'], 'CX-M': ['COR', 'Correios / Sedex', [270, 180, 90], 'correios', 'Caixa Média'], 'CX-P': ['ENV', 'Envelope', [300, 220, 60], 'envelope', 'Caixa Pequena'], 'EMB-A': ['TEL', 'Telescópica (fundo semi-automático)', [300, 220, 150], 'telescopica', 'Embalagem A'] };
    const velhos = S.prods.filter(p => mp[p.cod] && p.nome === mp[p.cod][4]); if (!velhos.length) return;
    const novo = {}; velhos.forEach(p => { const m = mp[p.cod]; novo[p.cod] = m[0]; p.cod = m[0]; p.nome = m[1]; p.dim = m[2]; p.tipo = m[3] });
    S.ops.forEach(o => { if (novo[o.prod]) o.prod = novo[o.prod] });
    if (!S.prods.some(p => p.cod === 'MAL')) S.prods.push({ cod: 'MAL', nome: 'Maleta (com alça)', dim: [250, 150, 260], tipo: 'maleta', revs: [{ rev: 'A', data: new Date().toLocaleDateString('pt-BR'), nota: 'Emissão inicial' }] });
    save();
})();
const fmt = t => new Date(t).toLocaleString('pt-BR'), dur = ms => { const m = Math.round(ms / 6e4); return m >= 60 ? Math.floor(m / 60) + 'h ' + m % 60 + 'min' : m + ' min' };
const M = id => S.machines.find(m => m.id === id), O = id => S.ops.find(o => o.id === id), P = c => S.prods.find(p => p.cod === c);
const ST = { produzindo: 'Produzindo', parada: 'Parada', disponivel: 'Disponível', planejada: 'Planejada', finalizada: 'Finalizada' };
const tag = s => `<span class="tag t-${s}">${ST[s]}</span>`;
// PRIORIDADE DAS OPs: urgente (1) > alta (2) > normal (3) > baixa (4). Dentro da mesma prioridade, vence o prazo mais curto.
const PRIO = { urgente: ['Urgente', 1], alta: ['Alta', 2], normal: ['Normal', 3], baixa: ['Baixa', 4] };
let fPrio = '';
const prioDe = o => PRIO[o && o.prio] ? o.prio : 'normal';
const ptag = o => `<span class="tag p-${prioDe(o)}">${PRIO[prioDe(o)][0]}</span>`;
const prioOpts = sel => Object.keys(PRIO).map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${PRIO[k][0]}</option>`).join('');
const porPrio = (a, b) => PRIO[prioDe(a)][1] - PRIO[prioDe(b)][1] || String(a.prazo).localeCompare(String(b.prazo)) || Number(a.id) - Number(b.id);
const ordenarOPs = l => l.slice().sort((a, b) => (a.st === 'finalizada') - (b.st === 'finalizada') || porPrio(a, b));
const proxOP = mid => S.ops.filter(x => x.maq === mid && x.st === 'planejada').sort(porPrio)[0];
const filaMaq = mid => S.ops.filter(o => o.maq === mid && o.st !== 'finalizada').sort((a, b) => (b.st === 'produzindo') - (a.st === 'produzindo') || porPrio(a, b));
// Máquina disponível (ou com OP ainda não iniciada) passa a apontar para a OP de maior prioridade da fila dela.
const refilar = mid => { const m = M(mid); if (!m || m.st !== 'disponivel') return; const c = O(m.op); if (c && c.st !== 'finalizada' && !(c.st === 'planejada' && !c.feito)) return; const nx = proxOP(mid); if (nx) m.op = nx.id };
// Migração: OPs já salvas sem prioridade passam a ser "Normal".
if (S.ops.some(o => !PRIO[o.prio])) { S.ops.forEach(o => { if (!PRIO[o.prio]) o.prio = 'normal' }); save() }
const openStop = id => S.stops.find(s => s.m === id && !s.fim);
function sum(f) { return S.events.filter(f).reduce((a, e) => a + e.q, 0) }
function agg(mode, mid) {
    const ev = S.events.filter(e => !mid || e.m === mid), n = new Date(), out = [];
    if (mode === 'hora') { const hs = Math.floor(Date.now() / H) * H; for (let k = 11; k >= 0; k--) { const a = hs - k * H; out.push({ l: new Date(a).getHours() + 'h', v: ev.filter(e => e.t >= a && e.t < a + H).reduce((s, e) => s + e.q, 0) }) } }
    else if (mode === 'turno') { const z = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(), t = [0, 0, 0]; ev.filter(e => e.t >= z).forEach(e => { const h = new Date(e.t).getHours(); t[h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2] += e.q });['Turno 1 (06-14)', 'Turno 2 (14-22)', 'Turno 3 (22-06)'].forEach((l, i) => out.push({ l, v: t[i] })) }
    else for (let k = 6; k >= 0; k--) { const z = new Date(n.getFullYear(), n.getMonth(), n.getDate() - k), a = z.getTime(); out.push({ l: z.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), v: ev.filter(e => e.t >= a && e.t < a + 24 * H).reduce((s, e) => s + e.q, 0) }) }
    return out
}
function chart(d) { const mx = Math.max(1, ...d.map(x => x.v)); return `<div class="chart">${d.map(x => `<div class="c">${x.v}<div class="b" style="height:${x.v / mx * 80}%"></div>${x.l}</div>`).join('')}</div>` }
function oee(m) {
    const now = Date.now(), W = 8 * H, a = now - W; let st = 0; S.stops.filter(s => s.m === m.id).forEach(s => { const e = s.fim || now; st += Math.max(0, Math.min(e, now) - Math.max(s.ini, a)) });
    const disp = Math.max(0, 1 - st / W), prod = sum(e => e.m === m.id && e.t >= a), sc = S.scrap.filter(s => s.m === m.id && s.t >= a).reduce((x, s) => x + s.q, 0);
    const perf = Math.min(1, prod / Math.max(1, m.rate * 8 * disp)), q = prod ? Math.max(0, 1 - sc / prod) : 1; return { disp, perf, q, oee: disp * perf * q, prod, sc, st }
}
const pc = x => (x * 100).toFixed(0) + '%';
const nf = n => Number(n).toLocaleString('pt-BR');
// Planejado x produzido: barra + produzido, meta (quantidade planejada), percentual e quanto falta
function planProd(o) { const p = o.qtd ? o.feito / o.qtd : 0, f = o.qtd - o.feito; return `<div class="pp"><div class="bar"><div style="width:${Math.min(100, p * 100)}%"></div></div><div class="ppt"><span>Produzido <b>${nf(o.feito)}</b></span><span>Meta <b>${nf(o.qtd)}</b></span><span><b>${pc(p)}</b></span></div><small class="${f > 0 ? '' : 'ok'}">${f > 0 ? 'Faltam ' + nf(f) : 'Meta atingida'}</small></div>` }
/* views */
const V = {};
V.dashboard = () => {
    const run = S.machines.filter(m => m.st === 'produzindo').length, z = new Date(); z.setHours(0, 0, 0, 0);
    const hoje = sum(e => e.t >= z.getTime()), all = S.machines.map(oee), avg = all.reduce((a, x) => a + x.oee, 0) / all.length;
    const al = [];
    S.ops.filter(o => o.st === 'produzindo' && o.feito >= o.qtd * .9).forEach(o => al.push(`<div class="alert">OP ${o.id} com mais de 90% concluída.</div>`));
    S.machines.forEach((m, i) => { if (m.st === 'produzindo' && all[i].oee < .6) al.push(`<div class="alert">Baixa produtividade na ${esc(m.nome)} (OEE ${pc(all[i].oee)}).</div>`) });
    return `<div class="grid g4"><div class="card kpi"><small>Produzido hoje</small><b>${hoje.toLocaleString('pt-BR')}</b><i>peças</i></div>
<div class="card kpi"><small>Máquinas produzindo</small><b>${run} / ${S.machines.length}</b><i>${S.machines.length - run} paradas ou disponíveis</i></div>
<div class="card kpi"><small>OPs em andamento</small><b>${S.ops.filter(o => o.st === 'produzindo').length}</b><i>${S.ops.filter(o => o.st === 'planejada').length} planejadas</i></div>
<div class="card kpi"><small>OEE médio (8h)</small><b>${pc(avg)}</b><i>meta sugerida 65%</i></div></div>
<div class="grid g2" style="margin-top:16px"><div class="card"><div class="row"><h2 style="margin:0">Quantidade produzida</h2><div class="sp"></div><select id="per" style="width:auto"><option value="hora">Por hora</option><option value="turno">Por turno</option><option value="dia">Por dia</option></select></div><div id="chartbox">${chart(agg('hora'))}</div></div>
<div class="card"><h2>Alertas</h2>${al.join('') || '<div class="sub">Nenhum alerta ativo.</div>'}</div></div>
<div class="card" style="margin-top:16px"><h2>Máquinas</h2><div class="grid g4">${S.machines.map(m => { const o = O(m.op); return `<div class="mach ${m.st}"><b>${esc(m.nome)}</b>${tag(m.st)}<br><small>${o ? 'OP ' + o.id + ' - ' + esc(P(o.prod)?.nome || '') + ' ' + ptag(o) : 'Sem OP'}</small>${o ? `<div style="margin-top:8px">${planProd(o)}</div>` : ''}</div>` }).join('')}</div></div>`
};
V.dashboard.after = () => { $('#per').onchange = e => { window._per = e.target.value; $('#chartbox').innerHTML = chart(agg(e.target.value)) } };
V.dashboard.live = () => { const e = $('#per'); if (!e || document.hidden || document.activeElement === e) return false; const v = e.value; go(true); $('#per').value = v; $('#chartbox').innerHTML = chart(agg(v)); $('#per').onchange = x => { $('#chartbox').innerHTML = chart(agg(x.target.value)) }; return true };
let selM = '01';
V.operador = () => {
    const m = M(selM) || S.machines[0]; selM = m.id; const o = O(m.op), p = o && P(o.prod), s = openStop(m.id);
    return `<div class="card"><div class="row"><div style="min-width:240px"><label>Identificação da máquina</label><select id="selm">${S.machines.map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>${tag(m.st)}<div class="sp"></div>
<button class="p" data-a="start" ${m.st === 'produzindo' || !o ? 'disabled' : ''}>Iniciar / Retomar</button><button class="d" data-a="stop" ${m.st !== 'produzindo' ? 'disabled' : ''}>Registrar parada</button><button data-a="scrap" ${!o ? 'disabled' : ''}>Apontar refugo</button></div></div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Ordem de Produção</h2>${o ? `<div class="row" style="justify-content:space-between"><div><div class="sub">OP ${o.id}</div><b style="font-size:1.25rem">${esc(p?.nome || o.prod)}</b></div><div>${ptag(o)} ${tag(o.st)}</div></div>
<div class="big" id="cnt" style="margin:18px 0 6px">${o.feito.toLocaleString('pt-BR')}</div><div class="sub">de ${o.qtd.toLocaleString('pt-BR')} peças planejadas (${pc(o.feito / o.qtd)})</div><div class="bar" style="margin:10px 0"><div style="width:${Math.min(100, o.feito / o.qtd * 100)}%"></div></div>
<div class="sub">Prazo: ${new Date(o.prazo + 'T12:00').toLocaleDateString('pt-BR')} | Faltam ${Math.max(0, o.qtd - o.feito).toLocaleString('pt-BR')} peças</div>
${(() => { const nx = proxOP(m.id); return nx && nx.id !== o.id ? `<div class="sub" style="margin-top:6px">Próxima na fila: OP ${nx.id} ${ptag(nx)}</div>` : '' })()}
${s ? `<div class="alert r" style="margin-top:12px">Parada em curso: ${esc(s.motivo)} desde ${new Date(s.ini).toLocaleTimeString('pt-BR')}</div>` : ''}` : '<div class="sub">Nenhuma OP associada. Associe uma em Ordens de Produção.</div>'}</div>
<div class="card"><h2>Desenho técnico</h2>${p ? `<div class="draw">${dieline(p)}</div><div class="sub" style="margin-top:8px">${esc(p.cod)} | Revisão ${p.revs[p.revs.length - 1].rev}</div>` : '<div class="sub">Sem desenho associado.</div>'}</div></div>`
};
V.operador.after = () => { $('#selm').onchange = e => { selM = e.target.value; go() }; document.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => act(b.dataset.a); if (!can('operar')) b.disabled = true }) };
V.operador.live = () => { if (['SELECT', 'INPUT'].includes(document.activeElement.tagName) || $('.mod')) return false; const m = M(selM), o = O(m.op), c = $('#cnt'); if (c && o) c.textContent = o.feito.toLocaleString('pt-BR'); return true };
function act(a) {
    const m = M(selM); if (a === 'start') { const s = openStop(m.id); if (s) s.fim = Date.now(); m.st = 'produzindo'; const o = O(m.op); if (o) o.st = 'produzindo'; save(); go() }
    if (a === 'stop') modal('Registrar parada', `<label>Motivo</label><select id="f1">${STOPS.map(x => `<option>${x}</option>`).join('')}</select>`, () => { m.st = 'parada'; S.stops.push({ m: m.id, motivo: $('#f1').value, ini: Date.now(), fim: null }) });
    if (a === 'scrap') modal('Apontar refugo', `<label>Quantidade</label><input id="f1" type="number" min="1" value="1"><label>Motivo</label><select id="f2">${SCRAP.map(x => `<option>${x}</option>`).join('')}</select>`, () => { S.scrap.push({ t: Date.now(), m: m.id, op: m.op, q: +$('#f1').value || 1, motivo: $('#f2').value }) })
}
function modal(t, body, ok) { const d = document.createElement('div'); d.className = 'mod'; d.innerHTML = `<div class="card"><h2>${t}</h2>${body}<div class="row" style="margin-top:16px;justify-content:flex-end"><button id="mc">Cancelar</button><button class="p" id="mo">Confirmar</button></div></div>`; document.body.appendChild(d); $('#mc').onclick = () => d.remove(); $('#mo').onclick = () => { if (ok() === false) return; d.remove(); save(); go() } }
function dieline(p, w = 420) {
    if (p.tipo && p.tipo !== 'padrao') return boxSvg(p.tipo, p.dim, w);   // modelos Correios, Envelope, Telescópica, Maleta
    // Modelo "Abas internas se encontram": aba de cola + 4 painéis (C, L, C, L).
    // Só os painéis de comprimento (C) têm abas, com altura L/2 para as abas se encontrarem no meio.
    // Linha contínua = corte | linha tracejada = vinco. Tudo calculado a partir de comprimento (c), largura (l) e altura (a).
    const [c, l, a] = p.dim, g = 30, ch = Math.min(10, g / 2), tot = g + 2 * c + 2 * l, k = (w - 40) / tot, f = l / 2 * k, G = g * k, C = c * k, L = l * k, A = a * k, CH = ch * k;
    const x0 = 20, x1 = x0 + G, x2 = x1 + C, x3 = x2 + L, x4 = x3 + C, x5 = x4 + L, y0 = 10, yA = y0 + f, yB = yA + A, yC = yB + f, n = v => v.toFixed(1);
    const cut = `M${n(x0)},${n(yA + CH)} L${n(x1)},${n(yA)} L${n(x1)},${n(y0)} L${n(x2)},${n(y0)} L${n(x2)},${n(yA)} L${n(x3)},${n(yA)} L${n(x3)},${n(y0)} L${n(x4)},${n(y0)} L${n(x4)},${n(yA)} L${n(x5)},${n(yA)} L${n(x5)},${n(yB)} L${n(x4)},${n(yB)} L${n(x4)},${n(yC)} L${n(x3)},${n(yC)} L${n(x3)},${n(yB)} L${n(x2)},${n(yB)} L${n(x2)},${n(yC)} L${n(x1)},${n(yC)} L${n(x1)},${n(yB)} L${n(x0)},${n(yB - CH)} Z`;
    const ln = (xa, ya, xb, yb) => `M${n(xa)},${n(ya)} L${n(xb)},${n(yb)} `;
    let crease = ''; [x1, x2, x3, x4].forEach(x => crease += ln(x, yA, x, yB));
    [[x1, x2], [x3, x4]].forEach(([xa, xb]) => { crease += ln(xa, yA, xb, yA) + ln(xa, yB, xb, yB) });
    const txt = (x, y, t) => `<text x="${n(x)}" y="${n(y)}" font-size="9" fill="#555" text-anchor="middle">${t}</text>`;
    return `<svg viewBox="0 0 ${w} ${n(yC + 44)}" width="100%" style="max-height:300px" role="img" aria-label="Caixa corte e vinco - abas internas se encontram"><path d="${cut}" fill="#fff" stroke="#142033" stroke-width="1.5" stroke-linejoin="round"/><path d="${crease}" fill="none" stroke="#174d86" stroke-width="1" stroke-dasharray="4 3"/>${txt((x1 + x2) / 2, (yA + yB) / 2 + 3, 'C ' + c)}${txt((x2 + x3) / 2, (yA + yB) / 2 + 3, 'L ' + l)}${txt((x3 + x4) / 2, (yA + yB) / 2 + 3, 'C ' + c)}${txt((x4 + x5) / 2, (yA + yB) / 2 + 3, 'L ' + l)}<text x="${x0}" y="${n(yC + 18)}" font-size="11" fill="#555">Abas internas se encontram | Comprimento ${c} mm | Largura ${l} mm | Altura ${a} mm</text><text x="${x0}" y="${n(yC + 32)}" font-size="10" fill="#555">Corte contínuo, vinco tracejado | aba de cola ${g} mm | abas de ${l / 2} mm</text></svg>`
}
V.ordens = () => `<div class="card"><div class="row"><h2 style="margin:0">Ordens de Produção</h2><div class="sp"></div><select id="fprio" aria-label="Filtrar por prioridade"><option value="">Todas as prioridades</option>${Object.keys(PRIO).map(k => `<option value="${k}" ${k === fPrio ? 'selected' : ''}>${PRIO[k][0]}</option>`).join('')}</select><button class="p" id="newop" ${can('ordens')?'':'style="display:none"'}>Nova OP</button></div><div class="wrap"><table><tr><th>OP</th><th>Prioridade</th><th>Produto</th><th>Máquina</th><th>Planejado x produzido</th><th>Prazo</th><th>Status</th><th></th></tr>${ordenarOPs(S.ops).filter(o => !fPrio || prioDe(o) === fPrio).map(o => `<tr class="pr-${o.st === 'finalizada' ? 'fim' : prioDe(o)}"><td><b>${o.id}</b></td><td>${can('ordens') && o.st !== 'finalizada' ? `<select class="psel p-${prioDe(o)}" data-pr="${o.id}" aria-label="Prioridade da OP ${o.id}">${prioOpts(prioDe(o))}</select>` : ptag(o)}</td><td>${esc(P(o.prod)?.nome || o.prod)}</td><td>${o.maq || '-'}</td><td>${planProd(o)}</td><td>${new Date(o.prazo + 'T12:00').toLocaleDateString('pt-BR')}</td><td>${tag(o.st)}</td><td style="white-space:nowrap"><button data-o="${o.id}">Abrir</button> <button data-qo="${o.id}">QR Code</button> <button data-pdf="${o.id}">PDF</button>${can('ordens') ? ` <button class="d" data-del="${o.id}">Excluir</button>` : ''}</td></tr>`).join('')}</table></div></div>`;
V.ordens.after = () => {
    if ($('#fprio')) $('#fprio').onchange = e => { fPrio = e.target.value; go() };
    document.querySelectorAll('[data-pr]').forEach(x => x.onchange = () => { const o = O(x.dataset.pr); if (!o || !can('ordens')) return; o.prio = x.value; refilar(o.maq); save(); go() });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
        const o = O(b.dataset.del); if (!o || !can('ordens')) return;
        modal('Excluir OP ' + o.id, `<p>Excluir a OP <b>${o.id}</b> (${esc(P(o.prod)?.nome || o.prod)}, ${nf(o.qtd)} pç)?<br>Esta ação não pode ser desfeita.</p>`, () => {
            S.ops = S.ops.filter(x => x.id !== o.id);
            S.machines.forEach(m => { if (m.op === o.id) { m.op = ''; if (m.st === 'produzindo') m.st = 'disponivel' } })
        })
    });
    $('#newop').onclick = () => modal('Nova Ordem de Produção', `<label>Produto</label><select id="f1">${S.prods.map(p => `<option value="${p.cod}">${esc(p.nome)}</option>`).join('')}</select><label>Quantidade</label><input id="f2" type="number" value="1000"><label>Máquina</label><select id="f3">${S.machines.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select><label>Prazo</label><input id="f4" type="date" value="${new Date(Date.now() + 7 * 24 * H).toISOString().slice(0, 10)}"><label>Prioridade</label><select id="f5">${prioOpts('normal')}</select>`, () => { const m = M($('#f3').value), id = String(S.seq++); S.ops.push({ id, prod: $('#f1').value, qtd: +$('#f2').value || 1, feito: 0, maq: m.id, st: 'planejada', prazo: $('#f4').value, prio: $('#f5').value }); if (m.st === 'disponivel') refilar(m.id) });
    document.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { const o = O(b.dataset.o), p = P(o.prod); modal('OP ' + o.id, `<div class="draw">${p ? dieline(p) : ''}</div><p><b>${esc(p?.nome || '')}</b> | Revisão ${p ? p.revs[p.revs.length - 1].rev : '-'}<br>Planejado (meta): ${nf(o.qtd)} | Produzido: ${nf(o.feito)} (${pc(o.feito / o.qtd)})<br>Máquina: ${o.maq || '-'} | Prazo: ${new Date(o.prazo + 'T12:00').toLocaleDateString('pt-BR')}<br>Prioridade: ${ptag(o)}</p><label ${can('ordens')?'':'hidden'}>Associar à máquina</label><select id="f1" ${can('ordens')?'':'hidden'}>${S.machines.map(m => `<option value="${m.id}" ${m.id === o.maq ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select><label ${can('ordens')?'':'hidden'}>Prioridade</label><select id="f2" ${can('ordens')?'':'hidden'}>${prioOpts(prioDe(o))}</select>`, () => { if (!can('ordens')) return; o.maq = $('#f1').value; o.prio = $('#f2').value; const m = M(o.maq); if (!m.op || O(m.op)?.st === 'finalizada') m.op = o.id; refilar(o.maq) }) })
};
// Filtro da tela Máquinas: pesquisa por ID, nome ou OP (sem diferenciar acentos/maiúsculas). Com uma só máquina, mostra os dados dela.
let fMaq = '';
const semAc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const maqFiltro = () => {
    const q = semAc(fMaq).trim(); if (!q) return S.machines;
    const ex = S.machines.filter(m => semAc(m.id) === q); if (ex.length) return ex;
    return S.machines.filter(m => semAc(m.id + ' ' + m.nome + ' ' + (m.op ? 'op ' + m.op : '')).includes(q))
};
const maqTab = () => {
    const l = maqFiltro(), z = z0(), f = fMaq.trim();
    return `<div class="sub" style="margin:8px 0">${f ? l.length + ' de ' + S.machines.length + ' máquinas' : S.machines.length + ' máquinas'}</div>` + (l.length ? `<div class="wrap"><table><tr><th>ID</th><th>Máquina</th><th>Status</th><th>OP atual</th><th>Capacidade</th><th>Produzido hoje</th><th>Tópico MQTT</th><th>Ações</th></tr>${l.map(m => `<tr><td><b>${m.id}</b></td><td>${esc(m.nome)}</td><td>${tag(m.st)}</td><td>${m.op || '-'}</td><td>${m.rate} pç/h</td><td>${sum(e => e.m === m.id && e.t >= z)}</td><td><code>milenio/maq${m.id}/producao</code></td><td style="white-space:nowrap"><button data-vm="${m.id}">Ver dados</button> <button data-qm="${m.id}">QR Code</button></td></tr>`).join('')}</table></div>` : '<div class="sub">Nenhuma máquina encontrada.</div>')
};
const maqDet = m => {
    const o = O(m.op), p = o && P(o.prod), x = oee(m), z = z0(), fila = filaMaq(m.id), par = S.stops.filter(s => s.m === m.id).slice(-5).reverse(), ref = S.scrap.filter(r => r.m === m.id).slice(-5).reverse();
    return `<h2 style="margin:20px 0 4px">${esc(m.nome)} <span class="sub">(ID ${m.id})</span></h2>
<div class="grid g4">${kpi('Status', tag(m.st))}${kpi('Produzido hoje', nf(sum(e => e.m === m.id && e.t >= z)), 'peças')}${kpi('OEE (8h)', pc(x.oee), 'disp. ' + pc(x.disp) + ' | desemp. ' + pc(x.perf) + ' | qual. ' + pc(x.q))}${kpi('Capacidade nominal', m.rate, 'pç/h')}</div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>OP atual</h2>${o ? `<div class="row" style="justify-content:space-between"><div><div class="sub">OP ${o.id}</div><b>${esc(p?.nome || o.prod)}</b></div><div>${ptag(o)} ${tag(o.st)}</div></div><div style="margin-top:10px">${planProd(o)}</div><div class="sub" style="margin-top:6px">Prazo: ${dt(o.prazo)}</div>` : '<div class="sub">Sem OP.</div>'}</div>
<div class="card"><h2>Fila de OPs desta máquina</h2>${fila.length ? fila.map((q, i) => `<div style="margin-bottom:6px">${i + 1}. <b>OP ${q.id}</b> ${ptag(q)} <span class="sub">${esc(P(q.prod)?.nome || q.prod)} | prazo ${dt(q.prazo)}</span></div>`).join('') : '<div class="sub">Nenhuma OP aberta.</div>'}</div></div>
<div class="card" style="margin-top:16px"><h2>Produção por hora (últimas 12h)</h2>${chart(agg('hora', m.id))}</div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Últimas paradas</h2>${par.length ? `<div class="wrap"><table><tr><th>Motivo</th><th>Início</th><th>Duração</th></tr>${par.map(s => `<tr><td>${esc(s.motivo)}</td><td>${fmt(s.ini)}</td><td>${s.fim ? dur(s.fim - s.ini) : '<b>em curso (' + dur(Date.now() - s.ini) + ')</b>'}</td></tr>`).join('')}</table></div>` : '<div class="sub">Nenhuma parada registrada.</div>'}</div>
<div class="card"><h2>Últimos refugos</h2>${ref.length ? `<div class="wrap"><table><tr><th>Data e hora</th><th>OP</th><th>Motivo</th><th>Peças</th></tr>${ref.map(r => `<tr><td>${fmt(r.t)}</td><td>${r.op || '-'}</td><td>${esc(r.motivo)}</td><td>${r.q}</td></tr>`).join('')}</table></div>` : '<div class="sub">Nenhum refugo apontado.</div>'}</div></div>`
};
const maqDetBox = () => { const l = maqFiltro(); return fMaq.trim() && l.length === 1 ? maqDet(l[0]) : '' };
const maqBind = () => {
    document.querySelectorAll('[data-qm]').forEach(b => b.onclick = () => qrModal({ tipo: 'M', id: b.dataset.qm }));
    document.querySelectorAll('[data-vm]').forEach(b => b.onclick = () => { fMaq = b.dataset.vm; $('#qmaq').value = fMaq; maqAtualiza(); $('#mdet').scrollIntoView({ behavior: 'smooth', block: 'start' }) })
};
const maqAtualiza = () => { $('#mtab').innerHTML = maqTab(); $('#mdet').innerHTML = maqDetBox(); maqBind() };
const maqSetup = () => {
    $('#qmaq').oninput = e => { fMaq = e.target.value; maqAtualiza() };
    $('#qlimpa').onclick = () => { fMaq = ''; $('#qmaq').value = ''; maqAtualiza(); $('#qmaq').focus() };
    maqBind()
};
V.maquinas = () => `<div class="card"><div class="row"><h2 style="margin:0">Máquinas monitoradas</h2><div class="sp"></div><button class="p" id="newm" ${can('maquinas') ? '' : 'style="display:none"'}>Cadastrar máquina</button></div>
<div class="row" style="margin-top:12px"><input id="qmaq" type="search" style="width:auto;flex:1 1 240px" placeholder="Pesquisar máquina (ID, nome ou OP)" aria-label="Pesquisar máquina" autocomplete="off" value="${esc(fMaq)}"><button id="qlimpa">Limpar</button></div>
<div id="mtab">${maqTab()}</div></div><div id="mdet">${maqDetBox()}</div>`;
V.maquinas.after = () => $('#newm').onclick = () => modal('Cadastrar máquina', `<label>Nome</label><input id="f1"><label>Capacidade nominal (peças/hora)</label><input id="f2" type="number" value="500">`, () => { if (!$('#f1').value.trim()) return false; S.machines.push({ id: String(S.machines.length + 1).padStart(2, '0'), nome: $('#f1').value.trim(), rate: +$('#f2').value || 500, st: 'disponivel', op: '', acc: 0 }) });
// ===== Modelos de caixa (corte e vinco) por tipo e tamanho =====
// Cada modelo é desenhado a partir de comprimento (c), largura (l) e altura (a) em mm.
// Linha contínua = corte | linha tracejada = vinco (arestas compartilhadas entre painéis).
const BOX_TIPOS = [
    { id: 'padrao', nome: 'Padrão (abas se encontram)', desc: 'Caixa de uma peça com aba de cola e abas internas que se encontram.', tam: { P: [200, 150, 120], M: [300, 220, 180], G: [400, 300, 250] } },
    { id: 'correios', nome: 'Correios / Sedex', desc: 'Caixa de envio com tampa, aba de fechamento e laterais com orelhas de cola.', tam: { P: [180, 135, 90], M: [270, 180, 90], G: [360, 270, 140] } },
    { id: 'envelope', nome: 'Envelope', desc: 'Caixa tipo envelope: fundo, quatro paredes, tampa na lateral e aba de encaixe.', tam: { P: [220, 160, 50], M: [300, 220, 60], G: [400, 300, 80] } },
    { id: 'telescopica', nome: 'Telescópica (fundo semi-automático)', desc: 'Duas peças: tampa com orelhas e fundo semi-automático com aba de cola.', tam: { P: [200, 150, 100], M: [300, 220, 150], G: [400, 300, 200] } },
    { id: 'maleta', nome: 'Maleta (com alça)', desc: 'Caixa com alça vazada nos painéis maiores, laterais com abas de fecho e fundo semi-automático.', tam: { P: [180, 100, 200], M: [250, 150, 260], G: [320, 200, 320] } }
];
const BOX_TAM = { P: 'Pequena', M: 'Média', G: 'Grande' };
const boxTipo = id => BOX_TIPOS.find(t => t.id === id) || BOX_TIPOS[0];
// Geometria: polígonos [[x,y],...]. Aresta usada por 2 polígonos = vinco; por 1 = corte.
const _fH = (x, y, w, h, i) => [[x, y], [x + w, y], [x + w - i, y + h], [x + i, y + h]];            // aba presa a uma aresta horizontal (h<0 = para cima)
const _fV = (x, y, h, w, i) => [[x, y], [x, y + h], [x + w, y + h - i], [x + w, y + i]];            // aba presa a uma aresta vertical (w<0 = para a esquerda)
const _rc = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const _ear = (x, yb, w, h, bev) => { const e = 1.5, yt = yb + h, k = w * .25; return bev > 0 ? [[x + e, yb], [x + w - e, yb], [x + w - e - k, yt], [x + e, yt]] : [[x + e, yb], [x + w - e, yb], [x + w - e, yt], [x + e + k, yt]] };
function _boxGeom(tipo, c, l, a) {
    const P = [], H = [], T = []; // polígonos, furos, textos
    const tx = (x, y, s) => T.push([x, y, s]);
    if (tipo === 'correios') {
        const t = Math.max(20, Math.min(a, 35)), yb = t + l + a, W = 2 * a + c;
        P.push(_fH(a + 4, t, c - 8, -t, 6), _rc(a, t, c, l), _rc(a, t + l, c, a), _rc(a, yb, c, l), _rc(a, yb + l, c, a), _rc(0, yb, a, l), _rc(a + c, yb, a, l));
        [[a, 1], [a + c, -1]].forEach(([xe, s]) => { const x = s > 0 ? xe : xe, d = s > 0 ? -1 : 1;
            const mk = (y1, y2, up) => { const pts = []; const xo = xe + d * a * .85; return up ? [[xe, y1], [xo, y1 + a * .2], [xo, y2], [xe, y2]] : [[xe, y1], [xo, y1], [xo, y2 - a * .2], [xe, y2]] };
            P.push(mk(t + l + 1.5, yb - 1.5, true), mk(yb + l + 1.5, yb + l + a - 1.5, false)) });
        tx(a + c / 2, t + l / 2, 'TAMPA'); tx(a + c / 2, yb + l / 2, 'BASE'); tx(a + c / 2, t + l + a / 2, 'A ' + a); tx(a + c / 2, yb + l + a / 2, 'A ' + a); tx(a + c / 2, t / 2 + 3, 'ABA');
        return { P, H, T, W, Ht: t + 2 * l + 2 * a, info: 'Tampa com aba de encaixe ' + t + ' mm | orelhas de cola ' + Math.round(a * .85) + ' mm' };
    }
    if (tipo === 'envelope') {
        const t = Math.max(20, Math.min(l / 2, 40)), W = 2 * a + 2 * c + t, y = a;
        P.push(_rc(a, y, c, l), _rc(a, 0, c, a), _rc(a, y + l, c, a), _rc(0, y, a, l), _rc(a + c, y, a, l), _rc(2 * a + c, y, c, l), _fV(2 * a + 2 * c, y + 3, l - 6, t, 8));
        [[0, 1], [a + c, -1]].forEach(([x, bv]) => { P.push(_ear(x, y, a, -(a - 3), bv), _ear(x, y + l, a, a - 3, bv)) });
        tx(a + c / 2, y + l / 2, 'FUNDO'); tx(2 * a + c + c / 2, y + l / 2, 'TAMPA'); tx(a + c / 2, a / 2 + 3, 'A ' + a); tx(a + c / 2, y + l + a / 2 + 3, 'A ' + a);
        return { P, H, T, W, Ht: 2 * a + l, info: 'Tampa na lateral | aba de encaixe ' + t + ' mm | orelhas de cola nas paredes' };
    }
    if (tipo === 'telescopica') {
        const ta = Math.max(25, Math.round(a * .3)), cc = c + 3, ll = l + 3, g = 20, f1 = Math.round(l / 2), f2 = f1 + 10, gap = 18;
        // Tampa
        P.push(_rc(ta, ta, cc, ll), _rc(0, ta, ta, ll), _rc(ta + cc, ta, ta, ll), _rc(ta, 0, cc, ta), _rc(ta, ta + ll, cc, ta));
        [[0, 1], [ta + cc, -1]].forEach(([x, bv]) => { P.push(_ear(x, ta, ta, -(ta - 3), bv), _ear(x, ta + ll, ta, ta - 3, bv)) });
        tx(ta + cc / 2, ta + ll / 2, 'TAMPA'); tx(ta + cc / 2, ta / 2 + 3, 'A ' + ta);
        // Fundo semi-automático
        const oy = 2 * ta + ll + gap, X = [g, g + c, g + c + l, g + 2 * c + l, g + 2 * c + 2 * l];
        P.push(_fV(g, oy + 2, a - 4, -g, 5), _rc(X[0], oy, c, a), _rc(X[1], oy, l, a), _rc(X[2], oy, c, a), _rc(X[3], oy, l, a));
        P.push(_fH(X[0] + 4, oy + a, c - 8, f2, 8), _fH(X[1] + 4, oy + a, l - 8, f1, 8), _fH(X[2] + 4, oy + a, c - 8, f2, 8), _fH(X[3] + 4, oy + a, l - 8, f1, 8));
        tx(X[0] + c / 2, oy + a / 2, 'C ' + c); tx(X[1] + l / 2, oy + a / 2, 'L ' + l); tx(X[2] + c / 2, oy + a / 2, 'C ' + c); tx(X[3] + l / 2, oy + a / 2, 'L ' + l);
        tx(X[0] + c / 2, oy + a + f2 / 2 + 3, 'ABA ' + f2); tx(X[1] + l / 2, oy + a + f1 / 2 + 3, 'ABA ' + f1);
        return { P, H, T, W: Math.max(g + 2 * c + 2 * l, 2 * ta + cc), Ht: oy + a + f2, info: 'Tampa ' + cc + 'x' + ll + ' mm, altura ' + ta + ' mm | fundo semi-automático, abas ' + f1 + '/' + f2 + ' mm | cola ' + g + ' mm' };
    }
    if (tipo === 'maleta') {
        const hh = Math.max(30, Math.round(l * .6)), g = 20, f1 = Math.round(l / 2), f2 = f1 + 10, y = hh, X = [g, g + c, g + c + l, g + 2 * c + l, g + 2 * c + 2 * l];
        P.push(_fV(g, y + 2, a - 4, -g, 5), _rc(X[0], y, c, a), _rc(X[1], y, l, a), _rc(X[2], y, c, a), _rc(X[3], y, l, a));
        // alças nos painéis de comprimento (C) e abas de fecho nas laterais (L)
        P.push(_rc(X[0], 0, c, hh), _rc(X[2], 0, c, hh), _fH(X[1] + 4, y, l - 8, -f1, 8), _fH(X[3] + 4, y, l - 8, -f1, 8));
        P.push(_fH(X[0] + 4, y + a, c - 8, f2, 8), _fH(X[1] + 4, y + a, l - 8, f1, 8), _fH(X[2] + 4, y + a, c - 8, f2, 8), _fH(X[3] + 4, y + a, l - 8, f1, 8));
        const sw = Math.min(c * .4, 110), sh = Math.min(hh * .4, 25);
        [X[0], X[2]].forEach(x => { const sx = x + (c - sw) / 2, sy = (hh - sh) / 2; H.push([[sx + sh / 2, sy], [sx + sw - sh / 2, sy], [sx + sw, sy + sh / 2], [sx + sw - sh / 2, sy + sh], [sx + sh / 2, sy + sh], [sx, sy + sh / 2]]) });
        tx(X[0] + c / 2, y + a / 2, 'C ' + c); tx(X[1] + l / 2, y + a / 2, 'L ' + l); tx(X[2] + c / 2, y + a / 2, 'C ' + c); tx(X[3] + l / 2, y + a / 2, 'L ' + l); tx(X[0] + c / 2, hh + 14, 'ALÇA');
        return { P, H, T, W: g + 2 * c + 2 * l, Ht: y + a + f2, info: 'Alça ' + hh + ' mm com furo vazado | abas de fecho ' + f1 + ' mm | fundo semi-automático ' + f1 + '/' + f2 + ' mm' };
    }
    return null;
}
function boxSvg(tipo, dim, w = 460) {
    const [c, l, a] = dim;
    if (tipo === 'padrao') return dieline({ dim }, w);
    const g = _boxGeom(tipo, c, l, a), m = 14, n = v => +v.toFixed(2), key = (p, q) => { const A = p.map(n).join(','), B = q.map(n).join(','); return A < B ? A + '|' + B : B + '|' + A };
    const onSeg = (p, q, r) => { const cr = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); if (Math.abs(cr) > 1e-6) return false; const d = (r[0] - p[0]) * (q[0] - p[0]) + (r[1] - p[1]) * (q[1] - p[1]); return d > 1e-6 && d < (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 - 1e-6 };
    const verts = g.P.flat(1), cnt = {}, segs = [];
    g.P.forEach(poly => poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; const cut = verts.filter(v => onSeg(p, q, v)).sort((u, v) => ((u[0] - p[0]) ** 2 + (u[1] - p[1]) ** 2) - ((v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2)); const pts = [p, ...cut, q]; for (let k = 0; k < pts.length - 1; k++) { const s = [pts[k], pts[k + 1]], kk = key(s[0], s[1]); cnt[kk] = (cnt[kk] || 0) + 1; segs.push([kk, s]) } }));
    const done = new Set(); let cut = '', crease = '';
    segs.forEach(([kk, s]) => { if (done.has(kk)) return; done.add(kk); const d = `M${n(s[0][0] + m)},${n(s[0][1] + m)}L${n(s[1][0] + m)},${n(s[1][1] + m)}`; if (cnt[kk] > 1) crease += d; else cut += d });
    const holes = g.H.map(h => 'M' + h.map(p => n(p[0] + m) + ',' + n(p[1] + m)).join('L') + 'Z').join('');
    const fs = Math.max(5, g.W / 55), vw = g.W + 2 * m, vh = g.Ht + 2 * m + fs * 5.2, ly = g.Ht + 2 * m + fs * 1.6;
    const txt = g.T.map(([x, y, s]) => `<text x="${n(x + m)}" y="${n(y + m)}" font-size="${n(fs)}" fill="#555" text-anchor="middle">${esc(s)}</text>`).join('');
    return `<svg viewBox="0 0 ${n(vw)} ${n(vh)}" width="100%" style="max-height:340px" role="img" aria-label="Corte e vinco ${esc(boxTipo(tipo).nome)}"><path d="${cut}${holes}" fill="none" stroke="#142033" stroke-width="1.6" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="${crease}" fill="none" stroke="#174d86" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>${txt}<text x="${m}" y="${n(ly)}" font-size="${n(fs * 1.15)}" fill="#555">${esc(boxTipo(tipo).nome)} | C ${c} x L ${l} x A ${a} mm</text><text x="${m}" y="${n(ly + fs * 1.5)}" font-size="${n(fs)}" fill="#555">${esc(g.info)}</text><text x="${m}" y="${n(ly + fs * 2.9)}" font-size="${n(fs)}" fill="#555">Corte contínuo, vinco tracejado</text></svg>`
}
// Tela "Modelos": escolhe o tipo e o tamanho e mostra o corte e vinco correspondente.
function abrirModelos(tipoId) {
    let tp = boxTipo(tipoId).id === 'padrao' ? 'correios' : boxTipo(tipoId).id, tm = 'M', cu = [300, 200, 150]; const d = document.createElement('div'); d.className = 'mod'; document.body.appendChild(d);
    const draw = () => { const t = boxTipo(tp), dim = tm === 'X' ? cu : t.tam[tm];
        d.innerHTML = `<div class="card" style="max-width:760px"><div class="row"><h2 style="margin:0">Modelos de caixa - corte e vinco</h2><div class="sp"></div><button id="bxc">Fechar</button></div>
<label>Tipo de caixa</label><div class="bxtabs">${BOX_TIPOS.slice(1).map(x => `<button data-bt="${x.id}" class="${x.id === tp ? 'p' : ''}">${esc(x.nome)}</button>`).join('')}</div>
<div class="sub" style="margin:6px 0">${esc(t.desc)}</div>
<label>Tamanho</label><div class="bxtabs">${Object.keys(BOX_TAM).map(k => `<button data-bs="${k}" class="${k === tm ? 'p' : ''}">${BOX_TAM[k]} <span class="sub">${t.tam[k].join(' x ')}</span></button>`).join('')}<button data-bs="X" class="${tm === 'X' ? 'p' : ''}">Personalizado</button></div>
${tm === 'X' ? `<div class="row" style="margin-top:8px"><span class="sub">C / L / A (mm)</span><input id="bx1" type="number" min="30" value="${cu[0]}" style="width:90px"><input id="bx2" type="number" min="30" value="${cu[1]}" style="width:90px"><input id="bx3" type="number" min="30" value="${cu[2]}" style="width:90px"></div>` : ''}
<div class="draw" style="margin-top:12px">${boxSvg(tp, dim, 460)}</div></div>`;
        $('#bxc').onclick = () => d.remove(); d.onclick = e => { if (e.target === d) d.remove() };
        d.querySelectorAll('[data-bt]').forEach(b => b.onclick = () => { tp = b.dataset.bt; draw() }); d.querySelectorAll('[data-bs]').forEach(b => b.onclick = () => { tm = b.dataset.bs; draw() });
        ['bx1', 'bx2', 'bx3'].forEach((id, i) => { const e = $('#' + id); if (e) e.onchange = () => { cu[i] = Math.max(30, +e.value || 30); draw() } }) };
    draw()
}
// Módulo "Corte e Vinco": abre com a caixa padrão; o botão "Modelos" mostra as outras caixas da classificação.
const CV = { tam: 'M', cu: [300, 200, 150], open: false };
const boxTiposCard = () => `<div class="card" style="margin-bottom:16px" id="cvcard">${cvHtml()}</div>`;
function cvHtml() {
    const t = BOX_TIPOS[0], dim = CV.tam === 'X' ? CV.cu : t.tam[CV.tam];
    return `<div class="row"><h2 style="margin:0">Corte e Vinco</h2><span class="sub">${esc(t.nome)}</span><div class="sp"></div><button class="p" id="cvmod">Modelos</button></div>
<div class="sub" style="margin:6px 0">${esc(t.desc)}</div>
<div class="bxtabs">${Object.keys(BOX_TAM).map(k => `<button data-cvt="${k}" class="${k === CV.tam ? 'p' : ''}">${BOX_TAM[k]} <span class="sub">${t.tam[k].join(' x ')}</span></button>`).join('')}<button data-cvt="X" class="${CV.tam === 'X' ? 'p' : ''}">Personalizado</button></div>
${CV.tam === 'X' ? `<div class="row" style="margin-top:8px"><span class="sub">C / L / A (mm)</span>${[0, 1, 2].map(i => `<input data-cvd="${i}" type="number" min="30" value="${CV.cu[i]}" style="width:90px">`).join('')}</div>` : ''}
<div class="draw" style="margin-top:12px">${boxSvg('padrao', dim, 460)}</div>`
}
function cvBind() {
    const c = $('#cvcard'); if (!c) return; const re = () => { c.innerHTML = cvHtml(); cvBind() };
    $('#cvmod').onclick = () => abrirModelos('correios');
    c.querySelectorAll('[data-cvt]').forEach(b => b.onclick = () => { CV.tam = b.dataset.cvt; re() });
    c.querySelectorAll('[data-cvd]').forEach(e => e.onchange = () => { CV.cu[+e.dataset.cvd] = Math.max(30, +e.value || 30); re() })
}
// ===== Caixa Palete: sem modelos, só comprimento e altura ajustáveis (largura fixa) =====
const PAL = { tam: 'M', cu: [1200, 800], L: 1000 };   // L = largura fixa (mm); cu = [comprimento, altura] do Personalizado
const PAL_TAM = { P: [1000, 600], M: [1200, 800], G: [1200, 1200] };   // [comprimento, altura] dos tamanhos prontos
function paleteSvg(c, a, L = PAL.L, w = 560) {
    // Chapa: aba de cola + 4 painéis (C, L, C, L) com altura A; acima, duas peças (tampa e fundo) de L x C com orelhas laterais.
    // Linha contínua = corte | linha tracejada = vinco. Tudo calculado a partir de c, L e a.
    const g = Math.max(30, Math.round(L * .04)), ear = Math.round(L * .06), gap = Math.round(Math.max(c, L) * .06), n = v => +v.toFixed(2), m = 14;
    const tot = g + 2 * c + 2 * L, capW = L + 2 * ear, capH = c, W = Math.max(tot, 2 * capW + gap), Hh = capH + gap + a;
    const xs = [0, g, g + c, g + c + L, g + 2 * c + L, tot], y0 = capH + gap, y1 = y0 + a, ch = Math.min(g / 2, 12);
    const P = v => n(v + m), X = (x, y) => P(x) + ',' + P(y);
    let cut = `M${X(0, y0 + ch)}L${X(g, y0)}L${X(tot, y0)}L${X(tot, y1)}L${X(g, y1)}L${X(0, y1 - ch)}Z`, crease = '';
    [1, 2, 3, 4].forEach(i => crease += `M${X(xs[i], y0)}L${X(xs[i], y1)}`);
    const tx = [[xs[1] + c / 2, y0 + a / 2 + 4, 'COMPRIMENTO ' + c], [xs[2] + L / 2, y0 + a / 2 + 4, 'LARGURA ' + L], [xs[3] + c / 2, y0 + a / 2 + 4, 'COMPRIMENTO ' + c], [xs[4] + L / 2, y0 + a / 2 + 4, 'LARGURA ' + L]];
    [0, 1].forEach(k => {
        const ox = k * (capW + gap) + (W - (2 * capW + gap)) / 2;
        cut += `M${X(ox + ear, 0)}L${X(ox + ear + L, 0)}L${X(ox + ear + L, capH * .12)}L${X(ox + capW, capH * .12)}L${X(ox + capW, capH * .88)}L${X(ox + ear + L, capH * .88)}L${X(ox + ear + L, capH)}L${X(ox + ear, capH)}L${X(ox + ear, capH * .88)}L${X(ox, capH * .88)}L${X(ox, capH * .12)}L${X(ox + ear, capH * .12)}Z`;
        crease += `M${X(ox + ear, capH * .12)}L${X(ox + ear, capH * .88)}M${X(ox + ear + L, capH * .12)}L${X(ox + ear + L, capH * .88)}`;
        tx.push([ox + capW / 2, capH / 2 + 4, k ? 'FUNDO' : 'TAMPA']);
    });
    const fs = Math.max(8, W / 55), vh = Hh + 2 * m + fs * 4.5, ly = Hh + 2 * m + fs * 1.5;
    const t = tx.map(([x, y, s]) => `<text x="${P(x)}" y="${P(y)}" font-size="${n(fs)}" fill="#174d86" text-anchor="middle">${s}</text>`).join('');
    return `<svg viewBox="0 0 ${n(W + 2 * m)} ${n(vh)}" width="100%" style="max-height:380px" role="img" aria-label="Caixa palete corte e vinco"><path d="${cut}" fill="#fff" stroke="#142033" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="${crease}" fill="none" stroke="#c0392b" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>${t}<text x="${m}" y="${n(ly)}" font-size="${n(fs)}" fill="#555">Caixa Palete | Comprimento ${c} x Largura ${L} (fixa) x Altura ${a} mm</text><text x="${m}" y="${n(ly + fs * 1.5)}" font-size="${n(fs * .9)}" fill="#555">Corte contínuo, vinco tracejado | aba de cola ${g} mm | orelhas ${ear} mm</text></svg>`
}
const paleteDim = () => PAL.tam === 'X' ? PAL.cu : PAL_TAM[PAL.tam];
const paleteCard = () => `<div class="card" style="margin-bottom:16px" id="palcard">${paleteHtml()}</div>`;
function paleteHtml() {
    const [c, a] = paleteDim();
    return `<div class="row"><h2 style="margin:0">Caixa Palete</h2><span class="sub">Largura fixa ${PAL.L} mm</span></div>
<div class="sub" style="margin:6px 0">Caixa de uma peça com aba de cola, tampa e fundo. Só o comprimento e a altura podem ser alterados.</div>
<div class="bxtabs">${Object.keys(PAL_TAM).map(k => `<button data-pt="${k}" class="${k === PAL.tam ? 'p' : ''}">${BOX_TAM[k]} <span class="sub">${PAL_TAM[k].join(' x ')}</span></button>`).join('')}<button data-pt="X" class="${PAL.tam === 'X' ? 'p' : ''}">Personalizado</button></div>
${PAL.tam === 'X' ? `<div class="row" style="margin-top:8px"><span class="sub">C / A (mm)</span>${[0, 1].map(i => `<input data-pd="${i}" type="number" min="${i ? 100 : 300}" value="${PAL.cu[i]}" style="width:90px">`).join('')}</div>` : ''}
<div class="draw" style="margin-top:12px">${paleteSvg(c, a)}</div>`
}
function paleteBind() {
    const c = $('#palcard'); if (!c) return; const re = () => { c.innerHTML = paleteHtml(); paleteBind() };
    c.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { PAL.tam = b.dataset.pt; re() });
    c.querySelectorAll('[data-pd]').forEach(e => e.onchange = () => { const i = +e.dataset.pd; PAL.cu[i] = Math.max(i ? 100 : 300, Math.round(+e.value) || (i ? 100 : 300)); re() })
}
V.desenhos = () => `<div class="card" style="margin-bottom:16px"><div class="row"><h2 style="margin:0">Produtos e desenhos técnicos</h2><div class="sp"></div><button class="p" id="newp" ${can('desenhos')?'':'style="display:none"'}>Cadastrar produto</button></div></div>${boxTiposCard()}${paleteCard()}`;
V.desenhos.after = () => {
    cvBind(); paleteBind();
    $('#newp').onclick = () => modal('Cadastrar produto', `<label>Código</label><input id="f1"><label>Nome</label><input id="f2"><label>Comprimento / Largura / Altura (mm)</label><div class="row"><input id="f3" type="number" value="300" style="width:30%"><input id="f4" type="number" value="200" style="width:30%"><input id="f5" type="number" value="150" style="width:30%"></div>`, () => { if (!$('#f1').value.trim() || !$('#f2').value.trim()) return false; S.prods.push({ cod: $('#f1').value.trim(), nome: $('#f2').value.trim(), dim: [+$('#f3').value, +$('#f4').value, +$('#f5').value], revs: [{ rev: 'A', data: new Date().toLocaleDateString('pt-BR'), nota: 'Emissão inicial' }] }) });
    document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const p = P(b.dataset.p); modal('Nova revisão de ' + esc(p.nome), `<label>Descrição da alteração</label><input id="f1">`, () => { p.revs.push({ rev: String.fromCharCode(65 + p.revs.length), data: new Date().toLocaleDateString('pt-BR'), nota: $('#f1').value || 'Alteração' }) }) })
};
let hf = '';
V.historico = () => {
    const ev = S.events.filter(e => !hf || e.m === hf).slice(-40).reverse(); return `<div class="card"><div class="row"><h2 style="margin:0">Histórico de produção por máquina</h2><div class="sp"></div><select id="hf" style="width:auto"><option value="">Todas as máquinas</option>${S.machines.map(m => `<option value="${m.id}" ${m.id === hf ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
<div style="margin:14px 0">${chart(agg('dia', hf))}</div></div><div class="grid g2" style="margin-top:16px"><div class="card"><h2>Registros recentes</h2><div class="wrap"><table><tr><th>Data e hora</th><th>Máquina</th><th>Peças</th></tr>${ev.map(e => `<tr><td>${fmt(e.t)}</td><td>${e.m}</td><td>${e.q}</td></tr>`).join('')}</table></div></div>
<div class="card"><h2>Paradas e refugos</h2><div class="wrap"><table><tr><th>Máquina</th><th>Evento</th><th>Início</th><th>Duração</th></tr>${S.stops.filter(s => !hf || s.m === hf).slice().reverse().map(s => `<tr><td>${s.m}</td><td>${esc(s.motivo)}</td><td>${fmt(s.ini)}</td><td>${s.fim ? dur(s.fim - s.ini) : 'em curso'}</td></tr>`).join('')}${S.scrap.filter(s => !hf || s.m === hf).slice().reverse().map(s => `<tr><td>${s.m}</td><td>Refugo: ${esc(s.motivo)}</td><td>${fmt(s.t)}</td><td>${s.q} pç</td></tr>`).join('')}</table></div></div></div>`
};
V.historico.after = () => $('#hf').onchange = e => { hf = e.target.value; go() };
V.indicadores = () => {
    const r = S.machines.map(m => ({ m, ...oee(m) })); return `<div class="card"><h2>Indicadores das últimas 8 horas</h2><div class="wrap"><table><tr><th>Máquina</th><th>Peças</th><th>Refugo</th><th>Tempo parado</th><th>Disponibilidade</th><th>Desempenho</th><th>Qualidade</th><th>OEE</th></tr>${r.map(x => `<tr><td><b>${esc(x.m.nome)}</b></td><td>${x.prod}</td><td>${x.sc}</td><td>${dur(x.st)}</td><td>${pc(x.disp)}</td><td>${pc(x.perf)}</td><td>${pc(x.q)}</td><td><b>${pc(x.oee)}</b></td></tr>`).join('')}</table></div></div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Comparação entre máquinas (OEE)</h2>${chart(r.map(x => ({ l: x.m.id, v: Math.round(x.oee * 100) })))}</div><div class="card"><h2>Planejado x produzido por OP</h2>${S.ops.map(o => `<div style="margin-bottom:10px"><div class="row"><b>OP ${o.id}</b><span class="sub">${esc(P(o.prod)?.nome || o.prod)}</span></div>${planProd(o)}</div>`).join('')}<div class="sub">Disponibilidade = 1 - tempo parado / 8h. Desempenho = produzido / (capacidade x tempo disponível). Qualidade = 1 - refugo / produzido. OEE = produto dos três.</div></div></div>`
};
V.integracao = () => {
    const l = S.events[S.events.length - 1] || { m: S.machines[0] ? S.machines[0].id : '01', q: 0, t: Date.now() }; return `<div class="grid g2"><div class="card"><h2>Fluxo da solução</h2><p>Ordem de Produção, Desenho, Máquina, Coleta de Dados, Banco de Dados, Dashboard, Informação para Gestão.</p><div class="row"><label style="margin:0">Simulador de sensores</label><button id="sim" class="${S.sim ? 'p' : ''}">${S.sim ? 'Ligado' : 'Desligado'}</button></div><p class="sub">Com o simulador ligado, cada máquina produzindo gera eventos de contagem a cada 2 segundos, como faria um sensor no ESP32. Máquinas com ESP32 online não são simuladas.</p>${DBS.ativo ? `<div class="row" style="margin-top:8px"><button id="limpsim" class="d">Limpar dados simulados</button></div><p class="sub">Banco de dados no servidor: <b style="color:var(--ok)">conectado</b></p>` : '<p class="sub">Banco de dados no servidor: <b style="color:var(--warn)">não conectado</b> (modo local).</p>'}</div>
<div class="card"><h2>Último evento recebido</h2><div class="mono" id="pl">${esc(JSON.stringify({ maquina: l.m, topico: `milenio/maq${l.m}/producao`, op: M(l.m)?.op, pecas: l.q, timestamp: new Date(l.t).toISOString() }, null, 2))}</div></div>
<div class="card"><h2>Coleta no chão de fábrica</h2><div class="mono">Sensor indutivo / óptico  ->  ESP32 (contagem de pulsos)
ESP32  --Wi-Fi / HTTP-->  Servidor Milênio  ->  Banco de dados (SQLite)
Servidor  --API REST-->  Este sistema e ERP</div></div>
<div class="card"><h2>ESP32 conectados</h2><div id="esp"><div class="sub">Carregando...</div></div></div>
<div class="card"><h2>API (ESP32 e ERP)</h2><div class="mono">ESP32 (cabeçalho X-Device-Token):
POST /api/eventos            registrar contagem de peças
POST /api/paradas            iniciar/encerrar parada
POST /api/refugos            registrar refugo
GET  /api/dispositivo/config calibração do aparelho
Consulta (ERP / relatórios):
GET  /api/maquinas           status das máquinas
GET  /api/ops                ordens de produção
GET  /api/ops/{id}           detalhe da OP e desenho
GET  /api/producao?maq=01&agrupar=hora|dia|minuto
GET  /api/dispositivos       ESP32 cadastrados</div></div></div>`};
V.integracao.after = () => { $('#sim').onclick = () => { S.sim = !S.sim; save(); go() }; const lb = $('#limpsim'); if (lb) lb.onclick = () => modal('Limpar dados simulados', '<p>Apaga do banco só a produção, paradas e refugos <b>simulados</b> (os do ESP32 e os lançados pelos operadores ficam) e desliga o simulador.<br>Use ao ligar os ESP32 de verdade.</p>', () => { fetch('/api/admin/limpar-simulado', { method: 'POST' }).then(() => { S.sim = false; clearTimeout(DBS.t); DBS.sujo = false; DBS.ver = -1; DBS.ev = null }) }); espLista(true) };
V.integracao.live = () => { const l = S.events[S.events.length - 1], e = $('#pl'); espLista(); if (e && l) e.textContent = JSON.stringify({ maquina: l.m, topico: `milenio/maq${l.m}/producao`, op: M(l.m)?.op, pecas: l.q, timestamp: new Date(l.t).toISOString() }, null, 2); return true };
/* configurações de acessibilidade (guardadas neste dispositivo) */
const AK = 'milenio_acc', FONTES = [[100, 'Normal'], [115, 'Grande'], [130, 'Muito grande'], [150, 'Extra grande']],
    CVDS = [['nenhum', 'Nenhum', 'Cores originais'], ['protanopia', 'Protanopia', 'Dificuldade com vermelho'], ['deuteranopia', 'Deuteranopia', 'Dificuldade com verde'], ['tritanopia', 'Tritanopia', 'Dificuldade com azul e amarelo']];
let ACC = { fonte: 100, cvd: 'nenhum', tema: 'claro' };
try { const v = JSON.parse(localStorage.getItem(AK)) || {}; if (FONTES.some(f => f[0] === v.fonte)) ACC.fonte = v.fonte; if (CVDS.some(f => f[0] === v.cvd)) ACC.cvd = v.cvd; if (v.tema === 'escuro') ACC.tema = 'escuro' } catch (e) { }
function cvdFiltros() {
    // Correção de cor (daltonização): M = I + E(I - S), S = simulação do tipo de daltonismo, E = desloca a informação perdida para os canais visíveis.
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], E1 = [[0, 0, 0], [.7, 1, 0], [.7, 0, 1]], E3 = [[1, 0, 0.7], [0, 1, 0.7], [0, 0, 0]],
        T = { protanopia: [[[.567, .433, 0], [.558, .442, 0], [0, .242, .758]], E1], deuteranopia: [[[.625, .375, 0], [.7, .3, 0], [0, .3, .7]], E1], tritanopia: [[[.95, .05, 0], [0, .433, .567], [0, .475, .525]], E3] };
    const f = Object.keys(T).map(k => { const [S, E] = T[k], M = I.map((r, i) => r.map((v, j) => v + E[i].reduce((s, e, q) => s + e * ((q === j ? 1 : 0) - S[q][j]), 0)));
        return `<filter id="cvd-${k}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${M.map(r => r.map(x => x.toFixed(4)).join(' ') + ' 0 0').join(' ')} 0 0 0 1 0"/></filter>` }).join('');
    const d = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = `<svg width="0" height="0" style="position:absolute">${f}</svg>`; document.body.appendChild(d)
}
function applyAcc() {
    const r = document.documentElement; r.style.fontSize = ACC.fonte + '%'; r.dataset.tema = ACC.tema;
    if (ACC.cvd === 'nenhum') { r.removeAttribute('data-cvd'); r.style.removeProperty('--cvdf') } else { r.dataset.cvd = ACC.cvd; r.style.setProperty('--cvdf', `url(#cvd-${ACC.cvd})`) }
}
function setAcc(k, v) { ACC[k] = v; applyAcc(); try { localStorage.setItem(AK, JSON.stringify(ACC)) } catch (e) { } }
function accUI(root) {
    const grp = (k, l) => `<div class="opt" role="group">${l.map(o => `<button data-k="${k}" data-v="${o[0]}" aria-pressed="${ACC[k] === o[0]}" class="${ACC[k] === o[0] ? 'p' : ''}">${o[1]}${o[2] ? `<small>${o[2]}</small>` : ''}</button>`).join('')}</div>`;
    root.innerHTML = `<h2>Tema</h2>${grp('tema', [['claro', 'Modo claro'], ['escuro', 'Modo escuro']])}<h2>Tamanho da fonte</h2>${grp('fonte', FONTES.map(f => [f[0], f[1], f[0] + '%']))}<h2>Filtro para daltonismo</h2>${grp('cvd', CVDS)}
<h2>Pré-visualização</h2><div class="row" style="margin-bottom:14px">${tag('produzindo')}${tag('parada')}${tag('disponivel')}${tag('planejada')}${tag('finalizada')}</div><div class="alert r">Parada prolongada na máquina 02: Manutenção.</div><div class="alert">OP 1023 com mais de 90% concluída.</div>
<div class="row" style="margin-top:16px"><button id="accr">Restaurar padrão</button></div><div class="sub" style="margin-top:10px">As opções valem para este dispositivo e ficam salvas neste navegador. O filtro de daltonismo ajusta as cores para facilitar a diferenciação entre elas.</div>`;
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k; setAcc(k, k === 'fonte' ? +b.dataset.v : b.dataset.v); accUI(root) });
    root.querySelector('#accr').onclick = () => { ACC = { fonte: 100, cvd: 'nenhum', tema: 'claro' }; setAcc('tema', 'claro'); accUI(root) }
}
V.config = () => '<div class="card" id="accbox"></div>' + (AL_SETORES.includes(contaAberta) ? `<div class="card" style="margin-top:16px"><h2>Alertas</h2><label>Parada prolongada a partir de (minutos)</label><input id="al1" type="number" min="1" max="600" value="${AL.parada}"><label>Baixa produção abaixo de (% do ritmo nominal da máquina)</label><input id="al2" type="number" min="10" max="100" value="${AL.baixa}"><div class="sub" style="margin-top:10px">Os alertas só aparecem quando algum limite é ultrapassado. Valem para este dispositivo.</div></div>` : '');
V.config.after = () => { accUI($('#accbox')); [['al1', 'parada', 1, 600], ['al2', 'baixa', 10, 100]].forEach(x => { const e = $('#' + x[0]); if (e) e.onchange = () => { AL[x[1]] = Math.min(x[3], Math.max(x[2], Math.round(+e.value) || AL0[x[1]])); e.value = AL[x[1]]; try { localStorage.setItem(ALK, JSON.stringify(AL)) } catch (er) { } renderAlerts() } }) };
cvdFiltros(); applyAcc();
/* contas por setor */
// telas = menu de cada setor (a 1ª é a tela inicial). can = ações que o setor pode executar.
// Senhas definidas aqui no código. Para trocar, edite o campo "senha" de cada setor.
const SETORES = [
    { id: 'producao', nome: 'Produção', senha: 'prod123', desc: 'Operação das máquinas, apontamentos de produção, paradas e refugos.', telas: ['setor', 'operador', 'ordens', 'desenhos', 'comunicacao'], can: ['operar'] },
    { id: 'manutencao', nome: 'Manutenção', senha: 'manut123', desc: 'Acompanhamento de paradas, estado das máquinas e liberação após reparo.', telas: ['setor', 'maquinas', 'historico', 'indicadores', 'comunicacao'], can: ['maquinas', 'manutencao'] },
    { id: 'qualidade', nome: 'Qualidade', senha: 'qual123', desc: 'Controle de refugos, revisões e desenhos técnicos.', telas: ['setor', 'desenhos', 'indicadores', 'historico', 'comunicacao'], can: ['desenhos'] },
    { id: 'planejamento', nome: 'Planejamento (PCP)', senha: 'pcp123', desc: 'Programação de OPs, prazos e capacidade das máquinas.', telas: ['setor', 'ordens', 'dashboard', 'maquinas', 'indicadores', 'comunicacao'], can: ['ordens'] },
    { id: 'expedicao', nome: 'Expedição', senha: 'exp123', desc: 'Conferência de OPs finalizadas e liberação para entrega.', telas: ['setor', 'ordens', 'historico', 'comunicacao'], can: ['liberar'] },
    { id: 'admin', nome: 'Administrativo', senha: 'adm123', desc: 'Visão geral da fábrica, indicadores e integrações. Acesso a todas as áreas.', telas: ['setor', 'dashboard', 'operador', 'ordens', 'maquinas', 'desenhos', 'historico', 'indicadores', 'integracao', 'comunicacao'], can: ['operar', 'ordens', 'maquinas', 'desenhos', 'manutencao', 'liberar'] }
];
let contaAberta = null;
const conta = () => SETORES.find(x => x.id === contaAberta);
const can = a => { const c = conta(); return !!c && c.can.includes(a) };
/* comunicação entre setores: via servidor (server.js); sem servidor, modo local neste navegador */
const MK = 'milenio_msgs'; let MSGS = [], online = false, sig = '', seen = null;
const getMsgs = () => MSGS;
const persistLocal = () => { try { localStorage.setItem(MK, JSON.stringify(MSGS)) } catch (e) { } };
const msgSig = () => online + '|' + MSGS.map(m => m.id + ':' + m.lido.length).join(',');
async function syncMsgs() {
    try { const r = await fetch('/api/msgs', { cache: 'no-store' }); if (!r.ok) throw 0; MSGS = await r.json(); online = true }
    catch (e) { online = false; try { const v = JSON.parse(localStorage.getItem(MK)); if (v) MSGS = v } catch (x) { } }
    const s = msgSig(); if (s !== sig) { sig = s; onMsgs() }
}
async function enviarMsg(m) {
    if (online) { const r = await fetch('/api/msgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }); if (!r.ok) throw new Error('falha'); await syncMsgs() }
    else { MSGS.push({ ...m, id: 'm' + Date.now() + Math.floor(Math.random() * 1e3), t: Date.now(), lido: [] }); persistLocal() }
}
function lerMsg(id) {
    const m = MSGS.find(x => x.id === id); if (!m || m.lido.includes(contaAberta)) return; m.lido.push(contaAberta); sig = msgSig();
    if (online) fetch('/api/msgs/' + id + '/lido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setor: contaAberta }) }).catch(() => { }); else persistLocal()
}
function toast(m) {
    const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<b>${m.prio === 'urgente' ? 'URGENTE - ' : ''}Nova mensagem de ${esc(sn(m.de))}</b><br>${esc(m.assunto)}`;
    d.onclick = () => { d.remove(); location.hash = 'comunicacao'; ct = 'in'; go() }; document.body.appendChild(d); setTimeout(() => d.remove(), 8000)
}
function onMsgs() {
    if (!contaAberta) return; const l = inbox(contaAberta);
    if (seen) l.filter(m => !seen.has(m.id)).forEach(toast); seen = new Set(l.map(m => m.id)); updBadge();
    const a = document.activeElement;
    if (window._cur === 'comunicacao' && ct !== 'new' && !$('.mod') && !(a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) {
        const op = [...document.querySelectorAll('.msg.open')].map(d => d.dataset.m); go(); document.querySelectorAll('.msg').forEach(d => { if (op.includes(d.dataset.m)) d.classList.add('open') })
    } else if (window._cur === 'comunicacao' && ct === 'new') { const s = $('#cst'); if (s) s.outerHTML = stCom() }
}
const stCom = () => `<span id="cst" class="sub">${online ? '<b style="color:var(--ok)">&#9679; Servidor conectado</b> - mensagens compartilhadas entre os setores' : '<b style="color:var(--warn)">&#9679; Modo local</b> - sem servidor, as mensagens ficam só neste navegador (veja o LEIA-ME)'}</span>`;
const sn = id => id === 'todos' ? 'Todos os setores' : (SETORES.find(x => x.id === id) || { nome: id }).nome;
const inbox = id => getMsgs().filter(m => m.de !== id && (m.para === id || m.para === 'todos')).sort((a, b) => b.t - a.t);
const unread = id => inbox(id).filter(m => !m.lido.includes(id)).length;
function updBadge() { const a = $('#nav a[href="#comunicacao"]'); if (!a) return; const n = unread(contaAberta); n ? a.setAttribute('data-n', n) : a.removeAttribute('data-n') }
let ct = 'in', rp = null, mcount = 0;
V.comunicacao = () => {
    const me = contaAberta, all = getMsgs(); mcount = all.length; let body;
    if (ct === 'new') {
        body = `<label>Para</label><select id="cp">${SETORES.filter(x => x.id !== me).map(x => `<option value="${x.id}" ${rp && rp.para === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}<option value="todos">Todos os setores</option></select><label>Prioridade</label><select id="cr"><option value="normal">Normal</option><option value="urgente">Urgente</option></select><label>Assunto</label><input id="ca" value="${rp ? esc(rp.assunto) : ''}"><label>Mensagem</label><textarea id="cm" rows="6"></textarea><div class="row" style="margin-top:14px;justify-content:flex-end"><button class="p" id="cs">Enviar mensagem</button></div>`
    } else {
        const l = ct === 'in' ? inbox(me) : all.filter(m => m.de === me).sort((a, b) => b.t - a.t);
        body = l.length ? l.map(m => { const nl = ct === 'in' && !m.lido.includes(me); return `<div class="msg ${nl ? 'new' : ''}" data-m="${m.id}"><div class="row"><b>${esc(m.assunto)}</b>${nl ? '<span class="tag t-produzindo nw">Nova</span>' : ''}${m.prio === 'urgente' ? '<span class="tag t-parada">Urgente</span>' : ''}<div class="sp"></div><small>${fmt(m.t)}</small></div><small>${ct === 'in' ? 'De: ' + esc(sn(m.de)) : 'Para: ' + esc(sn(m.para))}</small><div class="mb">${esc(m.txt).replace(/\n/g, '<br>')}${ct === 'in' ? `<div><button data-r="${m.id}" style="margin-top:10px">Responder</button></div>` : ''}</div></div>` }).join('') : '<div class="sub">Nenhuma mensagem.</div>'
    }
    return `<div class="card"><div style="margin-bottom:10px">${stCom()}</div><div class="row" style="margin-bottom:14px">${[['in', 'Recebidas'], ['out', 'Enviadas'], ['new', 'Nova mensagem']].map(t => `<button data-t="${t[0]}" class="${ct === t[0] ? 'p' : ''}">${t[1]}${t[0] === 'in' && unread(me) ? ' (' + unread(me) + ')' : ''}</button>`).join('')}</div>${body}</div>`
};
V.comunicacao.after = () => {
    document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { ct = b.dataset.t; if (ct !== 'new') rp = null; go() });
    document.querySelectorAll('.msg').forEach(d => d.onclick = e => {
        if (e.target.closest('[data-r]')) return; d.classList.toggle('open');
        if (d.classList.contains('new')) { lerMsg(d.dataset.m); d.classList.remove('new'); const nw = d.querySelector('.nw'); nw && nw.remove(); updBadge() }
    });
    document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const m = getMsgs().find(x => x.id === b.dataset.r); rp = { para: m.de, assunto: /^Re: /.test(m.assunto) ? m.assunto : 'Re: ' + m.assunto }; ct = 'new'; go() });
    const s = $('#cs'); if (s) s.onclick = () => {
        const a = $('#ca').value.trim(), t = $('#cm').value.trim(); if (!a || !t) { alert('Preencha o assunto e a mensagem.'); return }
        s.disabled = true; enviarMsg({ de: contaAberta, para: $('#cp').value, prio: $('#cr').value, assunto: a, txt: t }).then(() => { rp = null; ct = 'out'; go() }).catch(() => { s.disabled = false; alert('Não foi possível enviar: servidor indisponível. Tente novamente.') })
    }
};
/* telas iniciais por setor */
const kpi = (a, b, c) => `<div class="card kpi"><small>${a}</small><b>${b}</b><i>${c || ''}</i></div>`;
const z0 = () => { const z = new Date(); z.setHours(0, 0, 0, 0); return z.getTime() };
const atrasada = o => o.st !== 'finalizada' && new Date(o.prazo + 'T23:59').getTime() < Date.now();
const dt = p => new Date(p + 'T12:00').toLocaleDateString('pt-BR');
const opTbl = (l, ex) => l.length ? `<div class="wrap"><table><tr><th>OP</th><th>Prioridade</th><th>Produto</th><th>Máq.</th><th>Planejado x produzido</th><th>Prazo</th><th>Status</th>${ex ? '<th></th>' : ''}</tr>${ordenarOPs(l).map(o => `<tr class="pr-${o.st === 'finalizada' ? 'fim' : prioDe(o)}"><td><b>${o.id}</b></td><td>${ptag(o)}</td><td>${esc(P(o.prod)?.nome || o.prod)}</td><td>${o.maq || '-'}</td><td>${planProd(o)}</td><td>${dt(o.prazo)}</td><td>${tag(o.st)}${o.lib ? ' <span class="tag t-finalizada">Liberada</span>' : ''}</td>${ex ? `<td>${ex(o)}</td>` : ''}</tr>`).join('')}</table></div>` : '<div class="sub">Nada a exibir.</div>';
const mcards = () => `<div class="grid g4">${S.machines.map(m => { const o = O(m.op); return `<div class="mach ${m.st}"><b>${esc(m.nome)}</b>${tag(m.st)}<br><small>${o ? 'OP ' + o.id + ' - ' + esc(P(o.prod)?.nome || '') + ' ' + ptag(o) : 'Sem OP'}</small>${o ? `<div style="margin-top:8px">${planProd(o)}</div>` : ''}</div>` }).join('')}</div>`;
const refugoMotivo = () => SCRAP.map(m => ({ l: m, v: S.scrap.filter(s => s.motivo === m).reduce((a, s) => a + s.q, 0) }));
const SH = {
    producao: () => { const run = S.machines.filter(m => m.st === 'produzindo').length, ab = S.stops.filter(s => !s.fim); return `<div class="grid g4">${kpi('Produzido hoje', sum(e => e.t >= z0()).toLocaleString('pt-BR'), 'peças')}${kpi('Máquinas produzindo', run + ' / ' + S.machines.length)}${kpi('OPs em andamento', S.ops.filter(o => o.st === 'produzindo').length, S.ops.filter(o => o.st === 'planejada').length + ' planejadas')}${kpi('Refugo hoje', S.scrap.filter(s => s.t >= z0()).reduce((a, s) => a + s.q, 0), 'peças')}</div>${ab.map(s => `<div class="alert r" style="margin-top:12px">Parada em curso: ${esc(M(s.m).nome)} - ${esc(s.motivo)} há ${dur(Date.now() - s.ini)}.</div>`).join('')}<div class="card" style="margin-top:16px"><h2>Máquinas e OPs</h2>${mcards()}</div>` },
    manutencao: () => { const ab = S.stops.filter(s => !s.fim), tot = S.machines.reduce((a, m) => a + oee(m).st, 0), mot = {}; S.stops.filter(s => s.ini > Date.now() - 24 * H).forEach(s => mot[s.motivo] = (mot[s.motivo] || 0) + ((s.fim || Date.now()) - s.ini));
        return `<div class="grid g4">${kpi('Paradas em curso', ab.length)}${kpi('Tempo parado (8h)', dur(tot), 'todas as máquinas')}${kpi('Máquinas paradas', S.machines.filter(m => m.st === 'parada').length, 'de ' + S.machines.length)}${kpi('Máquinas disponíveis', S.machines.filter(m => m.st === 'disponivel').length)}</div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Paradas em curso</h2>${ab.map(s => `<div class="alert r"><div class="row"><span>${esc(M(s.m).nome)}: ${esc(s.motivo)} há ${dur(Date.now() - s.ini)}</span><div class="sp"></div>${can('manutencao') ? `<button data-lib="${s.m}">Concluir parada</button>` : ''}</div></div>`).join('') || '<div class="sub">Nenhuma parada em curso.</div>'}</div>
<div class="card"><h2>Tempo parado por motivo (24h)</h2>${Object.keys(mot).map(k => `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span>${esc(k)}</span><b>${dur(mot[k])}</b></div>`).join('') || '<div class="sub">Sem paradas.</div>'}</div></div><div class="card" style="margin-top:16px"><h2>Estado das máquinas</h2>${mcards()}</div>` },
    qualidade: () => { const r = S.machines.map(oee), q = r.reduce((a, x) => a + x.q, 0) / r.length, rf = S.scrap.reduce((a, s) => a + s.q, 0);
        return `<div class="grid g4">${kpi('Refugo total', rf, 'peças registradas')}${kpi('Refugo hoje', S.scrap.filter(s => s.t >= z0()).reduce((a, s) => a + s.q, 0), 'peças')}${kpi('Qualidade média (8h)', pc(q))}${kpi('Produtos cadastrados', S.prods.length)}</div>
<div class="grid g2" style="margin-top:16px"><div class="card"><h2>Refugo por motivo</h2>${chart(refugoMotivo())}</div><div class="card"><h2>Revisões de desenho</h2>${S.prods.map(p => { const r = p.revs[p.revs.length - 1]; return `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span><b>${esc(p.cod)}</b> ${esc(p.nome)}</span><span class="sub">Rev ${r.rev} - ${r.data}</span></div>` }).join('')}</div></div>` },
    planejamento: () => { const at = S.ops.filter(atrasada), ab = S.ops.filter(o => o.st !== 'finalizada');
        return `<div class="grid g4">${kpi('OPs abertas', ab.length)}${kpi('OPs atrasadas', at.length, 'prazo vencido')}${kpi('Urgentes em aberto', ab.filter(o => prioDe(o) === 'urgente').length, 'prioridade máxima')}${kpi('Planejadas', S.ops.filter(o => o.st === 'planejada').length)}${kpi('Finalizadas', S.ops.filter(o => o.st === 'finalizada').length)}</div>
${at.map(o => `<div class="alert r" style="margin-top:12px">OP ${o.id} atrasada (prazo ${dt(o.prazo)}).</div>`).join('')}
<div class="card" style="margin-top:16px"><h2>Carga x capacidade por máquina</h2><div class="wrap"><table><tr><th>Máquina</th><th>OPs abertas</th><th>Peças restantes</th><th>Horas necessárias</th></tr>${S.machines.map(m => { const l = ab.filter(o => o.maq === m.id), r = l.reduce((a, o) => a + o.qtd - o.feito, 0); return `<tr><td><b>${esc(m.nome)}</b></td><td>${l.length}</td><td>${r.toLocaleString('pt-BR')}</td><td>${(r / m.rate).toFixed(1)} h</td></tr>` }).join('')}</table></div></div>
<div class="card" style="margin-top:16px"><h2>Fila de produção por máquina</h2><div class="sub" style="margin-bottom:8px">A OP em produção segue primeiro; depois vale a prioridade e, em empate, o prazo mais curto.</div><div class="wrap"><table><tr><th>Máquina</th><th>Fila (1ª = próxima a produzir)</th></tr>${S.machines.map(m => { const q = filaMaq(m.id); return `<tr><td><b>${esc(m.nome)}</b></td><td>${q.length ? q.map((o, i) => `${i + 1}. OP ${o.id} ${ptag(o)} <small>prazo ${dt(o.prazo)}</small>`).join('<br>') : '-'}</td></tr>` }).join('')}</table></div></div>
<div class="card" style="margin-top:16px"><h2>Ordens em aberto</h2>${opTbl(ab)}</div>` },
    expedicao: () => { const ag = S.ops.filter(o => o.st === 'finalizada' && !o.lib), lb = S.ops.filter(o => o.lib), pr = S.ops.filter(o => o.st === 'produzindo' && o.feito >= o.qtd * .9);
        return `<div class="grid g4">${kpi('Aguardando liberação', ag.length)}${kpi('Liberadas', lb.length)}${kpi('Quase prontas (90%+)', pr.length)}${kpi('Em produção', S.ops.filter(o => o.st === 'produzindo').length)}</div>
<div class="card" style="margin-top:16px"><h2>OPs finalizadas aguardando liberação</h2>${opTbl(ag, o => can('liberar') ? `<button class="p" data-exp="${o.id}">Liberar para expedição</button>` : '')}</div>
<div class="card" style="margin-top:16px"><h2>Próximas a finalizar</h2>${opTbl(pr)}</div><div class="card" style="margin-top:16px"><h2>Já liberadas</h2>${opTbl(lb)}</div>` },
    admin: () => { const all = S.machines.map(oee), avg = all.reduce((a, x) => a + x.oee, 0) / all.length;
        return `<div class="grid g4">${kpi('Produzido hoje', sum(e => e.t >= z0()).toLocaleString('pt-BR'), 'peças')}${kpi('OEE médio (8h)', pc(avg), 'meta sugerida 65%')}${kpi('OPs atrasadas', S.ops.filter(atrasada).length)}${kpi('Paradas em curso', S.stops.filter(s => !s.fim).length)}</div><div class="card" style="margin-top:16px"><h2>Máquinas</h2>${mcards()}</div><div class="card" style="margin-top:16px"><h2>Ordens em aberto</h2>${opTbl(S.ops.filter(o => o.st !== 'finalizada'))}</div>` }
};
V.setor = () => { const c = conta(), l = inbox(contaAberta).slice(0, 3);
    return `<div class="card" style="margin-bottom:16px"><h2 style="margin:0 0 4px">${esc(c.nome)}</h2><div class="sub">${esc(c.desc)}</div></div>${SH[c.id]()}<div class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0">Mensagens recebidas</h2><div class="sp"></div><a href="#comunicacao"><button>Abrir Comunicação</button></a></div><div style="margin-top:10px">${l.map(m => `<div class="msg ${m.lido.includes(contaAberta) ? '' : 'new'} open"><div class="row"><b>${esc(m.assunto)}</b>${m.prio === 'urgente' ? '<span class="tag t-parada">Urgente</span>' : ''}<div class="sp"></div><small>${fmt(m.t)}</small></div><small>De: ${esc(sn(m.de))}</small></div>`).join('') || '<div class="sub">Nenhuma mensagem.</div>'}</div></div>`
};
V.setor.after = () => {
    document.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => { const m = M(b.dataset.lib), s = openStop(m.id); if (s) s.fim = Date.now(); m.st = 'disponivel'; save(); go() });
    document.querySelectorAll('[data-exp]').forEach(b => b.onclick = () => { O(b.dataset.exp).lib = Date.now(); save(); go() })
};
let tk = 0; V.setor.live = () => { if ($('.mod') || ++tk % 3) return false; go(true); return true };
function pedirSenha(st) {
    const d = document.createElement('div'); d.className = 'mod';
    d.innerHTML = `<div class="card"><h2>Conta: ${esc(st.nome)}</h2><label>Senha do setor</label><input id="pw" type="password" autocomplete="off"><div class="alert r" id="pwe" style="display:none;margin:10px 0 0">Senha incorreta.</div><div class="row" style="margin-top:16px;justify-content:flex-end"><button id="pc">Cancelar</button><button class="p" id="pk">Entrar</button></div></div>`;
    document.body.appendChild(d); const inp = d.querySelector('#pw'); inp.focus();
    const ok = () => { if (inp.value === st.senha) { contaAberta = st.id; d.remove(); entrar(st) } else { d.querySelector('#pwe').style.display = 'block'; inp.value = ''; inp.focus() } };
    d.querySelector('#pk').onclick = ok; d.querySelector('#pc').onclick = () => d.remove();
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') d.remove() }
}
function telaLogin() {
    _navHtml = _viewHtml = _viewTela = '';
    window.chatbotLogout && window.chatbotLogout();
    window.tutorialLogout && window.tutorialLogout();
    contaAberta = null; seen = null; ct = 'in'; rp = null; $('#app').style.display = 'none'; const l = $('#login'); l.style.display = 'flex';
    l.innerHTML = `<div class="card" style="max-width:560px;width:100%"><div class="brand" style="border:0;padding:0 0 16px;color:var(--ink)">MILÊNIO EMBALAGENS<span style="color:var(--blue)">SISTEMA DE PRODUÇÃO</span></div><h2>Login por setor</h2><div class="sub" style="margin-bottom:14px">Selecione o seu setor e informe a senha.</div><div class="grid g4">${SETORES.map(x => `<button class="p" style="padding:18px 14px;font-size:0.9375rem" data-s="${x.id}">${esc(x.nome)}</button>`).join('')}</div><div style="margin-top:16px"><button id="accb">Acessibilidade</button></div></div>`;
    $('#accb').onclick = () => { const d = document.createElement('div'); d.className = 'mod'; d.innerHTML = '<div class="card"><div id="accbx"></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button class="p" id="accx">Fechar</button></div></div>'; document.body.appendChild(d); accUI(d.querySelector('#accbx')); d.querySelector('#accx').onclick = () => d.remove() };
    l.querySelectorAll('[data-s]').forEach(b => b.onclick = () => pedirSenha(SETORES.find(x => x.id === b.dataset.s)))
}
function entrar(st) {
    $('#login').style.display = 'none'; $('#app').style.display = ''; $('#setor').textContent = st.nome;
    seen = new Set(inbox(st.id).map(m => m.id)); location.hash = 'setor'; alSeen = new Set(alertas().map(x => x.k)); go(); renderAlerts(); if (pendingQR) { qrModal(pendingQR); pendingQR = null }
    window.chatbotLogin && window.chatbotLogin(st);
    window.tutorialLogin && window.tutorialLogin(st);
}
/* QR Code de máquinas e OPs */
// Conteúdo do QR: a própria ficha em texto (qualquer leitor de QR do celular mostra os dados, sem precisar do sistema).
const qrBase = () => /^https?:$/.test(location.protocol) ? location.origin + location.pathname : 'MILENIO';
const semAcento = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n]/g, '?'); // QR só com ASCII: leitura garantida em qualquer leitor
// Endereço do servidor que os celulares conseguem abrir (IP da rede). Sem servidor (modo local), o QR leva a ficha em texto.
let qrHost = null;
fetch('/api/info', { cache: 'no-store' }).then(r => r.json()).then(i => { qrHost = /^(localhost|127\.|\[?::1)/.test(location.hostname) ? (i.ips[0] ? i.proto + ':' + '//' + i.ips[0] + ':' + i.port : null) : location.origin }).catch(() => { });
const qrEnc = v => encodeURIComponent(v).replace(/%20/g, '+');
function qrCampos(tipo, id) {
    const m = tipo === 'M' ? M(id) : O(id); if (!m) return null; const agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    if (tipo === 'M') { const o = O(m.op), p = o && P(o.prod), z = new Date(); z.setHours(0, 0, 0, 0);
        return [m.id, m.nome, m.rate, ST[m.st], o ? o.id + ' - ' + (p?.nome || o.prod) + ' (' + o.feito + '/' + o.qtd + ')' : 'Sem OP', sum(e => e.m === m.id && e.t >= z.getTime()), agora] }
    const p = P(m.prod), mq = M(m.maq);
    return [m.id, m.prod + ' - ' + (p?.nome || ''), p ? p.revs[p.revs.length - 1].rev : '-', m.qtd, m.feito + ' (' + Math.round(m.feito / m.qtd * 100) + '%)', mq ? mq.nome + ' (' + mq.id + ')' : '-', m.prazo, ST[m.st], PRIO[prioDe(m)][0], agora]
}
function qrPayload(tipo, id) {
    const c = qrCampos(tipo, id);
    return qrHost && c ? qrHost + '/paginas/ficha.html#' + tipo + '|' + c.map(qrEnc).join('|') : semAcento(qrTexto(tipo, id))
}
function qrTexto(tipo, id) {
    const m = tipo === 'M' ? M(id) : O(id), agora = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    if (!m) return 'MILENIO - ' + (tipo === 'M' ? 'MAQUINA ' : 'OP ') + id;
    if (tipo === 'M') {
        const o = O(m.op), p = o && P(o.prod), z = new Date(); z.setHours(0, 0, 0, 0);
        return ['MILENIO - MAQUINA ' + m.id, 'Nome: ' + m.nome, 'Capacidade: ' + m.rate + ' pc/h', 'Status: ' + ST[m.st],
            'OP atual: ' + (o ? o.id + ' - ' + (p?.nome || o.prod) + ' (' + o.feito + '/' + o.qtd + ')' : 'Sem OP'),
            'Produzido hoje: ' + sum(e => e.m === m.id && e.t >= z.getTime()) + ' pc', 'Topico MQTT: milenio/maq' + m.id + '/producao', 'Dados de ' + agora].join('\n')
    }
    const p = P(m.prod), mq = M(m.maq);
    return ['MILENIO - OP ' + m.id, 'Produto: ' + m.prod + ' - ' + (p?.nome || ''), 'Revisao do desenho: ' + (p ? p.revs[p.revs.length - 1].rev : '-'),
        'Quantidade planejada: ' + m.qtd, 'Produzido: ' + m.feito + ' (' + Math.round(m.feito / m.qtd * 100) + '%)', 'Maquina: ' + (mq ? mq.nome + ' (' + mq.id + ')' : '-'),
        'Prazo: ' + dt(m.prazo), 'Status: ' + ST[m.st], 'Prioridade: ' + PRIO[prioDe(m)][0], 'Dados de ' + agora].join('\n')
}
function qrParse(s) {
    s = String(s || '').trim();
    const u = s.match(/ficha\.html#(M|OP)\|(\S+)$/); // link da ficha (formato atual com servidor)
    if (u) {
        const v = u[2].split('|').map(x => { try { return decodeURIComponent(x.replace(/\+/g, ' ')) } catch (e) { return x } }), tipo = u[1];
        return { tipo, id: v[0], c: tipo === 'M' ? [v[1], v[2]] : [String(v[1]).split(' - ')[0], v[3], (String(v[5]).match(/\(([^)]+)\)\s*$/) || [])[1] || '', v[6]] }
    }
    const t = s.match(/^MILENIO - (MAQUINA|OP) (\S+)/i); // ficha em texto (formato atual)
    if (t) {
        const f = k => { const r = s.match(new RegExp('^' + k + ': (.*)$', 'mi')); return r ? r[1].trim() : '' };
        const tipo = /^M/i.test(t[1]) ? 'M' : 'OP', pz = f('Prazo').match(/(\d+)\/(\d+)\/(\d+)/);
        const c = tipo === 'M' ? (f('Nome') ? [f('Nome'), f('Capacidade').replace(/\D.*$/, '')] : [])
            : (f('Produto') ? [f('Produto').split(' - ')[0], f('Quantidade planejada'), (f('Maquina').match(/\(([^)]+)\)\s*$/) || [])[1] || '', pz ? pz[3] + '-' + pz[2].padStart(2, '0') + '-' + pz[1].padStart(2, '0') : ''] : []);
        return { tipo, id: t[2], c };
    }
    let m = s.match(/qr=(M|OP)-([^&\s#]+)(?:&c=([^&\s#]*))?/i) || s.match(/^(M|OP)[-: ]?([\w.]+)$/i); if (!m) return null; // formato antigo (link) e código digitado
    let c = []; try { c = m[3] ? decodeURIComponent(m[3]).split('|') : [] } catch (e) { }
    let id = m[2]; try { id = decodeURIComponent(id) } catch (e) { } return { tipo: m[1].toUpperCase(), id, c }
}
// Estilo dos QR Codes igual ao do gerador url.gratis (biblioteca qr-code-styling): pontos arredondados e cantos arredondados.
const QR_ESTILO = { cor: '#0b1437', fundo: '#ffffff', pontos: 'rounded', cantoBorda: 'extra-rounded', cantoCentro: 'dot' };
function qrDesenhar(el, tipo, id) {
    new QRCodeStyling({
        width: 400, height: 400, type: 'svg', margin: 16, data: qrPayload(tipo, id),
        qrOptions: { errorCorrectionLevel: 'M' },
        dotsOptions: { color: QR_ESTILO.cor, type: QR_ESTILO.pontos },
        cornersSquareOptions: { color: QR_ESTILO.cor, type: QR_ESTILO.cantoBorda },
        cornersDotOptions: { color: QR_ESTILO.cor, type: QR_ESTILO.cantoCentro },
        backgroundOptions: { color: QR_ESTILO.fundo }
    }).append(el)
}
let pendingQR = null;
const qrFromHash = () => { const q = /^#qr=/.test(location.hash) ? qrParse(location.hash) : null; if (q) { try { history.replaceState(null, '', location.pathname + location.search) } catch (e) { location.hash = '' } } return q };
pendingQR = qrFromHash();
addEventListener('hashchange', () => { const q = qrFromHash(); if (q) contaAberta ? qrModal(q) : pendingQR = q });
const fichaTab = l => `<div class="wrap"><table>${l.map(r => `<tr><td class="sub">${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</table></div>`;
function qrModal(q) {
    const tipo = q.tipo, id = q.id, m = tipo === 'M' ? M(id) : O(id), c = q.c || []; let tit, sub, corpo;
    if (tipo === 'M') {
        tit = 'Máquina ' + id; sub = m ? m.nome : (c[0] || '');
        if (m) { const o = O(m.op), p = o && P(o.prod), s = S.stops.find(x => x.m === m.id && !x.fim), z = new Date(); z.setHours(0, 0, 0, 0);
            corpo = fichaTab([['Código', esc(m.id)], ['Nome', esc(m.nome)], ['Status', tag(m.st)], ['Capacidade nominal', m.rate + ' pç/h'], ['OP atual', o ? `OP ${o.id} - ${esc(p?.nome || o.prod)} (${o.feito}/${o.qtd})` : 'Sem OP'], ['Produzido hoje', sum(e => e.m === m.id && e.t >= z.getTime()) + ' peças'], ...(s ? [['Parada em curso', esc(s.motivo) + ' há ' + dur(Date.now() - s.ini)]] : []), ['Tópico MQTT', `<code>milenio/maq${esc(m.id)}/producao</code>`]]) }
        else corpo = c.length ? fichaTab([['Código', esc(id)], ['Nome', esc(c[0])], ['Capacidade nominal', esc(c[1]) + ' pç/h']]) + '<div class="alert">Esta máquina não está cadastrada neste aparelho. Dados lidos do QR Code (cadastro na hora da impressão).</div>' : '<div class="alert r">Máquina não encontrada no sistema.</div>'
    } else {
        tit = 'OP ' + id; const p = m && P(m.prod); sub = p ? p.nome : (c[0] || '');
        if (m) { const mq = M(m.maq);
            corpo = fichaTab([['Número da OP', esc(m.id)], ['Produto', esc(m.prod) + ' - ' + esc(p?.nome || '')], ['Revisão do desenho', p ? p.revs[p.revs.length - 1].rev : '-'], ['Quantidade planejada', m.qtd], ['Produzido', `${m.feito} (${Math.round(m.feito / m.qtd * 100)}%)`], ['Máquina', mq ? esc(mq.nome) + ' (' + mq.id + ')' : '-'], ['Prazo', dt(m.prazo)], ['Status', tag(m.st) + (m.lib ? ' <span class="tag t-finalizada">Liberada</span>' : '')]]) + (p ? `<div class="draw" style="margin-top:12px">${dieline(p, 300)}</div>` : '') }
        else corpo = c.length ? fichaTab([['Número da OP', esc(id)], ['Produto', esc(c[0])], ['Quantidade planejada', esc(c[1])], ['Máquina', esc(c[2] || '-')], ['Prazo', c[3] ? dt(c[3]) : '-']]) + '<div class="alert">Esta OP não está cadastrada neste aparelho. Dados lidos do QR Code (cadastro na hora da impressão).</div>' : '<div class="alert r">OP não encontrada no sistema.</div>'
    }
    const d = document.createElement('div'); d.className = 'mod';
    d.innerHTML = `<div class="card"><h2 style="margin-bottom:2px">${tit}</h2><div class="sub">${esc(sub)}</div>${m || c.length ? '<div class="qrimg"></div>' : ''}${corpo}<div class="row" style="margin-top:16px;justify-content:flex-end"><button id="qpr">Imprimir etiqueta</button><button class="p" id="qcl">Fechar</button></div></div>`;
    document.body.appendChild(d); const qi = d.querySelector('.qrimg'); if (qi) qrDesenhar(qi, tipo, id); d.querySelector('#qcl').onclick = () => d.remove(); d.querySelector('#qpr').onclick = () => print()
}
// Imprimir a OP em PDF: abre a folha da OP (dados, QR Code e desenho) e chama a impressão; escolha "Salvar como PDF" no destino.
function opPDF(id) {
    const o = O(id); if (!o) return; const p = P(o.prod), mq = M(o.maq), rev = p ? p.revs[p.revs.length - 1].rev : '-', pct = o.qtd ? Math.round(o.feito / o.qtd * 100) : 0;
    const d = document.createElement('div'); d.className = 'mod opfolha';
    d.innerHTML = `<div class="card" style="max-width:820px"><div class="row nopr"><h2 style="margin:0">OP ${esc(o.id)} - PDF</h2><div class="sp"></div><button id="pdfp" class="p">Imprimir / Salvar PDF</button><button id="pdfc">Fechar</button></div>
<div class="nopr sub" style="margin:6px 0 12px">Na janela de impressão, escolha <b>Salvar como PDF</b> como destino.</div>
<div class="folha"><div class="fhead"><div><div class="fbrand">MILÊNIO EMBALAGENS</div><h1>Ordem de Produção ${esc(o.id)}</h1><div class="sub">${esc(p?.nome || o.prod)}</div></div><div class="qrimg"></div></div>
${fichaTab([['Número da OP', esc(o.id)], ['Produto', esc(o.prod) + ' - ' + esc(p?.nome || '')], ['Revisão do desenho', esc(rev)], ['Quantidade planejada', nf(o.qtd)], ['Produzido', nf(o.feito) + ' (' + pct + '%)'], ['Falta produzir', nf(Math.max(0, o.qtd - o.feito))], ['Máquina', mq ? esc(mq.nome) + ' (' + esc(mq.id) + ')' : '-'], ['Prazo', dt(o.prazo)], ['Status', esc(ST[o.st]) + (o.lib ? ' - Liberada' : '')], ['Prioridade', esc(PRIO[prioDe(o)][0])]])}
${p ? `<h3 style="margin:16px 0 6px">Desenho técnico</h3><div class="draw">${dieline(p, 520)}</div>` : ''}
<div class="sub" style="margin-top:14px">Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div></div></div>`;
    document.body.appendChild(d); const qi = d.querySelector('.qrimg'); qrDesenhar(qi, 'OP', o.id);
    d.querySelector('#pdfc').onclick = () => d.remove();
    d.querySelector('#pdfp').onclick = () => print();
    setTimeout(() => print(), 400)
}
function lerQR() {
    const d = document.createElement('div'); d.className = 'mod';
    d.innerHTML = `<div class="card"><h2>Ler QR Code</h2><div class="sub" id="qmsg" style="margin:8px 0">Envie a foto do QR Code da máquina ou da OP, ou digite o código.</div><div class="row"><button id="qfb">Tirar foto do QR Code</button><input type="file" accept="image/*" capture="environment" id="qf" hidden></div><label>Ou digite / use o leitor de código (ex.: OP-1023 ou M-01)</label><div class="row"><input id="qt" style="flex:1" placeholder="OP-1023"><button id="qok">Abrir</button></div><div class="row" style="margin-top:16px;justify-content:flex-end"><button class="p" id="qcl">Fechar</button></div></div>`;
    document.body.appendChild(d); const msg = t => d.querySelector('#qmsg').textContent = t;
    const fim = () => d.remove();
    const abrir = txt => { const q = qrParse(txt); if (!q) { msg('QR Code não reconhecido. Use o QR Code de uma máquina ou de uma OP do sistema.'); return false } fim(); qrModal(q); return true };
    d.querySelector('#qcl').onclick = fim; d.querySelector('#qok').onclick = () => abrir(d.querySelector('#qt').value);
    d.querySelector('#qt').onkeydown = e => { if (e.key === 'Enter') abrir(e.target.value) };
    if (!matchMedia('(pointer:coarse)').matches) d.querySelector('#qt').focus();
    d.querySelector('#qfb').onclick = () => d.querySelector('#qf').click();
    d.querySelector('#qf').onchange = e => { const f = e.target.files[0]; if (!f) return; const im = new Image(); im.onload = () => { const k = Math.min(1, 1400 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = im.width * k; cv.height = im.height * k; const x = cv.getContext('2d'); x.drawImage(im, 0, 0, cv.width, cv.height); const r = jsQR(x.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' }); r ? abrir(r.data) : msg('Não encontrei um QR Code na foto. Tente de novo, mais perto e com boa luz.') }; im.src = URL.createObjectURL(f) };
}
$('#qrb').onclick = lerQR;
{ const mA = V.maquinas.after, oA = V.ordens.after;
    V.maquinas.after = () => { mA(); maqSetup() };
    V.ordens.after = () => { oA(); document.querySelectorAll('[data-qo]').forEach(b => b.onclick = () => qrModal({ tipo: 'OP', id: b.dataset.qo })); document.querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => opPDF(b.dataset.pdf)) } }
/* alertas de parada prolongada e baixa produção (só aparecem quando há problema) */
const SIMX = 6, ALK = 'milenio_alertas', AL0 = { parada: 15, baixa: 70 }, AL_SETORES = ['producao', 'manutencao', 'planejamento', 'admin'];
let AL = { ...AL0 }, alSeen = new Set(), alHtml = '', alDesde = {};
try { const v = JSON.parse(localStorage.getItem(ALK)) || {}; if (v.parada >= 1 && v.parada <= 600) AL.parada = v.parada; if (v.baixa >= 10 && v.baixa <= 100) AL.baixa = v.baixa } catch (e) { }
function alertas() {
    const out = [], now = Date.now();
    S.stops.filter(s => !s.fim && M(s.m) && now - s.ini > AL.parada * 6e4).forEach(s => out.push({ k: 'p' + s.m + '-' + s.ini, n: 'r', t: `Parada prolongada: <b>${esc(M(s.m).nome)}</b> - ${esc(s.motivo)} há ${dur(now - s.ini)}` }));
    S.machines.forEach(m => {
        if (m.st !== 'produzindo' || !m.op) { delete alDesde[m.id]; return } alDesde[m.id] = alDesde[m.id] || now;
        const el = now - alDesde[m.id]; if (el < 3 * 6e4) return; const W = Math.min(15 * 6e4, el), r = sum(e => e.m === m.id && e.t >= now - W) / (m.rate * (W / 36e5) * (S.sim ? SIMX : 1));
        if (r < AL.baixa / 100) out.push({ k: 'b' + m.id, n: 'w', t: `Baixa produção: <b>${esc(m.nome)}</b> em ${pc(r)} do ritmo nominal (${Math.round(r * m.rate)} de ${m.rate} pç/h)` })
    }); return out
}
function renderAlerts() {
    const el = $('#alerts'); if (!el) return; const al = contaAberta && AL_SETORES.includes(contaAberta) ? alertas() : [];
    al.filter(x => !alSeen.has(x.k)).forEach(x => toastTxt(x)); alSeen = new Set(al.map(x => x.k));
    const tl = (conta() || { telas: [] }).telas, alvo = ['maquinas', 'dashboard', 'operador'].find(t => tl.includes(t));
    const h = al.length ? `<div class="alstrip">${al.slice(0, 3).map(x => `<div class="alert ${x.n}"><b>${x.n === 'r' ? 'Alerta' : 'Atenção'}:</b> ${x.t}${alvo ? ` <a href="#${alvo}">Ver</a>` : ''}</div>`).join('')}${al.length > 3 ? `<div class="sub">+ ${al.length - 3} outros alertas</div>` : ''}</div>` : '';
    if (h !== alHtml) { alHtml = h; el.innerHTML = h }
}
function toastTxt(x) { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<b>${x.n === 'r' ? 'Alerta' : 'Atenção'}</b><br>${x.t}`; d.onclick = () => d.remove(); document.body.appendChild(d); setTimeout(() => d.remove(), 8000) }
/* router */
const NAV = [['setor', 'Meu Setor', 'Resumo e atividades do seu setor'], ['dashboard', 'Dashboard', 'Visão geral da produção em tempo real'], ['operador', 'Apontamento do Operador', 'Máquina, OP e desenho em uma única tela'], ['ordens', 'Ordens de Produção', 'Cadastro, associação e acompanhamento'], ['maquinas', 'Máquinas', 'Cadastro e status'], ['desenhos', 'Desenhos Técnicos', 'Produtos e controle de revisão'], ['historico', 'Histórico', 'Registros por máquina e período'], ['indicadores', 'Indicadores', 'Disponibilidade, desempenho, qualidade e OEE'], ['integracao', 'Integração IoT', 'Simulador, MQTT e API'], ['comunicacao', 'Comunicação', 'Mensagens entre setores']];
/* Redesenho "vivo" sem perder o estado da tela: com go(true) a rolagem, os campos editados, o foco, os <details> abertos
   e as listas roladas continuam como estavam, e se o HTML não mudou nada é redesenhado (evita a tela "piscar/resetar"). */
function guardarUI() {
    const v = $('#view'), m = $('main'), a = document.activeElement, campos = [...v.querySelectorAll('input,select,textarea')], todos = [...v.querySelectorAll('*')];
    return {
        win: [scrollX, scrollY], n: campos.length, nd: v.querySelectorAll('details').length,
        rol: [[-1, v], [-2, m], ...todos.map((e, i) => [i, e])].filter(x => x[1] && (x[1].scrollTop || x[1].scrollLeft)).map(x => ({ i: x[0], t: x[1].scrollTop, l: x[1].scrollLeft })),
        campos: campos.map(e => e.type === 'checkbox' || e.type === 'radio' ? (e.checked !== e.defaultChecked ? { c: e.checked } : null) : e.tagName === 'SELECT' ? ([...e.options].some(o => o.selected !== o.defaultSelected) ? { v: e.value } : null) : (e.value !== e.defaultValue ? { v: e.value } : null)),
        abertos: [...v.querySelectorAll('details')].map(d => d.open),
        foco: a && campos.indexOf(a) >= 0 ? { i: campos.indexOf(a), a: a.selectionStart, b: a.selectionEnd } : null, todosN: todos.length
    };
}
function restaurarUI(s) {
    const v = $('#view'), m = $('main'), campos = [...v.querySelectorAll('input,select,textarea')], todos = [...v.querySelectorAll('*')];
    if (campos.length === s.n) campos.forEach((e, i) => { const c = s.campos[i]; if (!c) return; if ('c' in c) e.checked = c.c; else e.value = c.v });
    const ds = [...v.querySelectorAll('details')]; if (ds.length === s.nd) ds.forEach((d, i) => { d.open = s.abertos[i] });
    s.rol.forEach(r => { const e = r.i === -1 ? v : r.i === -2 ? m : (todos.length === s.todosN ? todos[r.i] : null); if (e) { e.scrollTop = r.t; e.scrollLeft = r.l } });
    scrollTo(s.win[0], s.win[1]);
    if (s.foco && campos.length === s.n) { const e = campos[s.foco.i]; if (e && document.activeElement !== e) { try { e.focus({ preventScroll: true }); if (s.foco.a != null && e.setSelectionRange) e.setSelectionRange(s.foco.a, s.foco.b) } catch (x) { } } }
}
let _navHtml = '', _viewHtml = '', _viewTela = '';
function go(keep) {
    if (!contaAberta) return;
    const tl = conta().telas; let h = location.hash.slice(1) || tl[0]; if (h !== 'config' && !tl.includes(h)) h = tl[0]; const n = h === 'config' ? ['config', 'Configurações', 'Acessibilidade e aparência'] : NAV.find(x => x[0] === h); $('#cfg').classList.toggle('on', h === 'config');
    const nav = tl.map(t => NAV.find(x => x[0] === t)).map(x => `<a href="#${x[0]}" class="${x[0] === h ? 'on' : ''}">${x[1]}</a>`).join('');
    if (nav !== _navHtml) { _navHtml = nav; $('#nav').innerHTML = nav } updBadge();
    $('#ttl').textContent = n[1]; $('#sub').textContent = n[2];
    const html = V[h](), mesma = keep === true && _viewTela === h;   // mesma tela sendo atualizada em segundo plano
    if (mesma && html === _viewHtml) { window._cur = h; return }      // nada mudou: não mexe na tela
    const ui = mesma ? guardarUI() : null;
    $('#view').innerHTML = html; _viewHtml = html; _viewTela = h; V[h].after && V[h].after(); window._cur = h;
    if (ui) restaurarUI(ui);
}
setInterval(() => { $('#clk').textContent = new Date().toLocaleString('pt-BR') }, 1000);
setInterval(() => {
    if (S.sim && !DBS.ativo) { const n = Date.now(); S.machines.forEach(m => { if (m.st !== 'produzindo' || !m.op) return; const o = O(m.op); if (Math.random() < .002) m.f = Math.random() < .3 ? .4 + Math.random() * .2 : .85 + Math.random() * .25; m.acc = (m.acc || 0) + m.rate / 3600 * 2 * SIMX * (m.f || 1); const q = Math.floor(m.acc); if (!q) return; m.acc -= q; const k = Math.min(q, o.qtd - o.feito); if (k > 0) { o.feito += k; S.events.push({ t: n, m: m.id, q: k }) } if (o.feito >= o.qtd) { o.st = 'finalizada'; m.st = 'disponivel'; const nx = proxOP(m.id); m.op = nx ? nx.id : '' } }); if (S.events.length > 6000) S.events.splice(0, 500); save() }
    if (contaAberta) { updBadge(); renderAlerts() } const c = V[window._cur]; if (contaAberta && c && c.live) c.live()
}, 2000);

/* ===== BANCO DE DADOS (servidor/dados/milenio.db) =====
   Com o servidor ligado, máquinas, OPs, produção, paradas e refugos ficam no banco e são compartilhados por todos os setores e pelos ESP32.
   - O navegador envia o cadastro (máquinas, produtos, OPs, paradas e refugos lançados) sempre que algo é salvo.
   - As contagens de peças e o andamento das OPs vêm do banco (ESP32 ou simulador do servidor); o navegador só lê.
   - Sem servidor (index.html aberto direto) tudo continua funcionando como antes, só neste navegador. */
function dbMarcar() { if (!DBS.ativo) return; DBS.sujo = true; DBS.n++; clearTimeout(DBS.t); DBS.t = setTimeout(() => dbEnviar(), 400) }
async function dbEnviar(substituir) {
    if (DBS.enviando) { DBS.t = setTimeout(() => dbEnviar(substituir), 400); return }
    const marca = DBS.n, apagar = [...DBS.conhecidas].filter(id => !O(id)); DBS.enviando = true;
    try {
        const est = substituir ? S : { ...S, events: [] };
        const r = await fetch('/api/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: est, apagarOps: apagar, substituir: !!substituir }) });
        if (!r.ok) throw new Error('http ' + r.status);
        DBS.conhecidas = new Set(S.ops.map(o => o.id)); if (DBS.n === marca) DBS.sujo = false; DBS.ver = -1; DBS.ev = substituir ? null : DBS.ev; DBS.falhas = 0;
    } catch (e) { DBS.falhas++ } finally { DBS.enviando = false }
}
function dbMesclar(j) {
    const N = j.estado, cheio = DBS.ev == null;
    // atualiza os objetos que já existem (sem trocar a referência) para não perder telas/diálogos abertos
    const alinhar = (loc, rem, chave) => { const mp = new Map(loc.map(x => [chave(x), x])); loc.splice(0, loc.length, ...rem.map(r => { const x = mp.get(chave(r)); if (x) { Object.assign(x, r); return x } return r })) };
    alinhar(S.machines, N.machines, m => m.id); alinhar(S.prods, N.prods, p => p.cod); alinhar(S.ops, N.ops, o => o.id);
    alinhar(S.stops, N.stops, s => s.m + '|' + s.ini); alinhar(S.scrap, N.scrap, r => r.t + '|' + r.m + '|' + r.q + '|' + r.motivo);
    if (cheio) S.events.splice(0, S.events.length, ...N.events); else { N.events.forEach(e => S.events.push(e)); const lim = Date.now() - 8 * 24 * H; if (S.events.length && S.events[0].t < lim) S.events.splice(0, S.events.findIndex(e => e.t >= lim) < 0 ? S.events.length : S.events.findIndex(e => e.t >= lim)) }
    S.sim = !!N.sim; S.seq = Math.max(+S.seq || 0, +N.seq || 0);
    DBS.ver = j.ver; DBS.ev = j.ev; DBS.limp = j.limp; DBS.conhecidas = new Set(S.ops.map(o => o.id));
    try { localStorage.setItem(KEY, JSON.stringify(S)) } catch (e) { mem = S }
    // telas sem atualização própria: redesenha se ninguém estiver digitando
    const c = V[window._cur], a = document.activeElement;
    if (contaAberta && c && !c.live && ['ordens', 'maquinas', 'historico', 'indicadores'].includes(window._cur) && !$('.mod') && !(a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName))) go(true)
}
async function dbPoll() {
    if (!DBS.ativo || DBS.enviando) return;
    if (DBS.sujo) { if (DBS.falhas) dbEnviar(); return }
    try {
        const r = await fetch('/api/estado?ver=' + DBS.ver + (DBS.ev == null ? '' : '&ev=' + DBS.ev), { cache: 'no-store' }); if (!r.ok) throw 0;
        const j = await r.json(); if (DBS.limp != null && j.limp !== DBS.limp) { DBS.limp = j.limp; DBS.ev = null; DBS.ver = -1; return }   // dados simulados foram apagados: recarrega tudo
        if (j.mudou === false || DBS.sujo || DBS.enviando) return; dbMesclar(j)
    } catch (e) { }
}
(async () => {
    try {
        const r = await fetch('/api/estado', { cache: 'no-store' }); if (!r.ok) throw 0; const j = await r.json(); DBS.ativo = true;
        if (j.demo && LOCAL0) { await dbEnviar(true) }   // 1ª vez: os dados que já estavam neste navegador viram os dados do banco
        else { dbMesclar(j); if (contaAberta) go(true) }
        setInterval(dbPoll, 2000)
    } catch (e) { DBS.ativo = false }
})();
// lista de ESP32 na tela Integração IoT
let espT = 0;
async function espLista(forca) {
    const el = $('#esp'); if (!el || (!forca && Date.now() - espT < 8000)) return; espT = Date.now();
    try {
        const l = await (await fetch('/api/dispositivos', { cache: 'no-store' })).json();
        el.innerHTML = l.length ? `<div class="wrap"><table><tr><th>ESP32</th><th>Máquina</th><th>Conexão</th><th>Wi-Fi</th><th>Último contato</th></tr>${l.map(d => `<tr><td>${esc(d.id)}</td><td>${esc(d.maquina)}</td><td><span class="tag ${d.conexao === 'online' ? 't-produzindo' : 't-finalizada'}">${d.conexao === 'online' ? 'Online' : 'Offline'}</span></td><td>${d.rssi == null ? '-' : d.rssi + ' dBm'}</td><td>${esc(d.ultimo_contato || 'nunca')}</td></tr>`).join('')}</table></div><div class="sub" style="margin-top:6px">Tokens dos aparelhos: arquivo servidor/dados/esp32_tokens.txt (veja docs/ESP32.md).</div>` : '<div class="sub">Nenhum ESP32 cadastrado.</div>'
    } catch (e) { el.innerHTML = '<div class="sub">Sem servidor: a lista de ESP32 só aparece com o servidor ligado.</div>' }
}
syncMsgs(); setInterval(syncMsgs, 2000);
$('#tg').onclick = () => { $('#app').classList.toggle('closed'); try { localStorage.setItem('mil_menu', $('#app').classList.contains('closed') ? '1' : '0') } catch (e) { } };
$('#sair').onclick = () => { location.hash = ''; telaLogin() };
try { if (localStorage.getItem('mil_menu') === '1' || innerWidth < 820) $('#app').classList.add('closed') } catch (e) { if (innerWidth < 820) $('#app').classList.add('closed') }
addEventListener('hashchange', () => { if (innerWidth < 820) $('#app').classList.add('closed'); go() }); telaLogin();

/* ponte somente-leitura para o assistente (chatbot.js) */
window.chatbotBridge = {
    estado: () => S, setor: () => conta(), maq: M, op: O, prod: P, oee, alertas, parada: openStop, ordenar: ordenarOPs,
    atrasada, hoje: z0, sum, dur, nf, pc, dt, prio: prioDe, PRIO, ST, naoLidas: () => contaAberta ? unread(contaAberta) : 0
};
