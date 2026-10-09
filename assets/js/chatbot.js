// ============================================
// ASSISTENTE MILÊNIO — chatbot do Sistema de Produção
// Voz (reconhecimento + síntese) + Gemini (via servidor) + respostas locais
// Lê os dados do sistema pela ponte somente-leitura window.chatbotBridge (app.js).
// ============================================
(() => {
'use strict';

const CFG = { language: 'pt-BR', voiceRate: 1.0, voicePitch: 1.0, timeoutMs: 25000, maxHistory: 20, pausaFalhaMs: 60000 };
const AssistantState = { isListening: false, isProcessing: false, isSpeaking: false, recognition: null, synthesis: window.speechSynthesis, history: [], gemini: false, falhaEm: 0, avisouFalha: false, logado: false };

const $id = id => document.getElementById(id);
const B = () => window.chatbotBridge;

// ---------- ícones (SVG, sem biblioteca externa) ----------
const IC = {
  mic:    '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/>',
  send:   '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>',
  down:   '<path d="m6 9 6 6 6-6"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.2-8.55"/>',
  bot:    '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
  trash:  '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
};
const icon = n => `<svg class="cb-ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

// ---------- abrir / fechar ----------
function toggleChatBot() {
  const c = $id('chatbot-container'); if (!c) return;
  c.classList.toggle('minimized');
  const aberto = !c.classList.contains('minimized');
  c.setAttribute('role', aberto ? 'dialog' : 'button');
  c.setAttribute('aria-label', aberto ? 'Assistente Milênio' : 'Abrir assistente');
  c.tabIndex = aberto ? -1 : 0;
  if (aberto) setTimeout(() => $id('chatbot-input')?.focus(), 260);
}

// ---------- reconhecimento de voz ----------
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $id('voice-btn')?.classList.add('disabled'); addAssistantMessage('Seu navegador não suporta reconhecimento de voz. Use o teclado.', 'warning'); return null; }
  const r = new SR();
  r.lang = CFG.language; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
  r.onstart = () => { AssistantState.isListening = true; updateVoiceUI('listening'); };
  r.onresult = e => {
    const t = Array.from(e.results).map(x => x[0].transcript).join('');
    if (e.results[e.results.length - 1].isFinal) handleUserInput(t); else showTranscriptPreview(t);
  };
  r.onerror = e => {
    AssistantState.isListening = false; clearTranscriptPreview(); updateVoiceUI('idle');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') addAssistantMessage('Permissão de microfone negada. Permita o acesso nas configurações do navegador (o microfone costuma exigir HTTPS ou localhost).', 'warning');
    else if (e.error === 'no-speech') addAssistantMessage('Não ouvi nada. Pode repetir?', 'info');
    else if (e.error === 'network') addAssistantMessage('O reconhecimento de voz do navegador precisa de internet. Use o teclado.', 'warning');
  };
  r.onend = () => { AssistantState.isListening = false; clearTranscriptPreview(); if (!AssistantState.isProcessing) updateVoiceUI('idle'); };
  return r;
}
function toggleVoiceRecognition() {
  if (!AssistantState.recognition) AssistantState.recognition = initSpeechRecognition();
  if (!AssistantState.recognition) return;
  if (AssistantState.isListening) { AssistantState.recognition.stop(); return; }
  if (AssistantState.isSpeaking) AssistantState.synthesis?.cancel();
  try { AssistantState.recognition.start(); } catch (e) { console.error('Erro ao iniciar reconhecimento:', e); }
}
function updateVoiceUI(state) {
  const btn = $id('voice-btn'), mic = $id('mic-icon'), st = $id('voice-status');
  btn?.classList.remove('listening', 'processing', 'speaking');
  const set = (ic, txt, cls) => { if (mic) mic.innerHTML = icon(ic); if (st) { st.textContent = txt; st.className = 'voice-status' + (cls ? ' ' + cls : ''); } };
  if (state === 'listening') { btn?.classList.add('listening'); set('mic', '● Ouvindo...', 'listening'); }
  else if (state === 'processing') { btn?.classList.add('processing'); set('loader', 'Processando...', 'processing'); }
  else if (state === 'speaking') { btn?.classList.add('speaking'); set('volume', 'Falando...', 'speaking'); }
  else set('mic', '', '');
}
function showTranscriptPreview(text) {
  let p = $id('transcript-preview');
  if (!p) { p = document.createElement('div'); p.id = 'transcript-preview'; p.className = 'transcript-preview'; const a = document.querySelector('#chatbot-container .chatbot-input-area'); a?.parentNode.insertBefore(p, a); }
  p.textContent = `"${text}..."`;
}
function clearTranscriptPreview() { $id('transcript-preview')?.remove(); }

// ---------- síntese de voz ----------
function speak(text) {
  const on = $id('voice-response-toggle')?.checked ?? false;
  if (!on || !AssistantState.synthesis) return;
  const clean = text.replace(/\[([^\]]+)\]\(#[a-z]+\)/g, '$1').replace(/[*_#`]/g, '').replace(/\p{Extended_Pictographic}|\uFE0F|[●•]/gu, '').replace(/\s*\n\s*/g, '. ').trim();
  if (!clean) return;
  AssistantState.synthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = CFG.language; u.rate = CFG.voiceRate; u.pitch = CFG.voicePitch;
  const v = AssistantState.synthesis.getVoices().find(x => x.lang && x.lang.startsWith('pt')); if (v) u.voice = v;
  u.onstart = () => { AssistantState.isSpeaking = true; updateVoiceUI('speaking'); };
  u.onend = u.onerror = () => { AssistantState.isSpeaking = false; if (!AssistantState.isProcessing) updateVoiceUI('idle'); };
  AssistantState.synthesis.speak(u);
}

// ============================================
// DADOS DO SISTEMA
// ============================================
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const has = (t, ...res) => res.some(r => new RegExp('\\b(?:' + r + ')', 'i').test(t));
const lk = (id, label) => { const c = B().setor(); return c && (id === 'config' || c.telas.includes(id)) ? `[${label}](#${id})` : label; };
const prodNome = o => { const p = B().prod(o.prod); return p ? p.nome : o.prod; };
const pct = o => (o.qtd ? o.feito / o.qtd : 0);

// Texto compacto com o estado da fábrica, enviado ao Gemini a cada pergunta (nunca inclui senhas nem mensagens entre setores)
function snapshot() {
  const b = B(), S = b.estado(), now = Date.now(), c = b.setor(), L = [];
  L.push('Data/hora: ' + new Date().toLocaleString('pt-BR'));
  L.push(`Usuário logado no setor: ${c.nome}. Telas disponíveis (id): ${c.telas.join(', ')}, config.`);
  L.push(S.sim ? 'Modo: SIMULAÇÃO (a produção é simulada pelo sistema, dados de exemplo).' : 'Modo: apontamentos reais.');
  L.push('\nMÁQUINAS:');
  S.machines.forEach(m => {
    const o = b.op(m.op), oe = b.oee(m), par = b.parada(m.id), hoje = b.sum(e => e.m === m.id && e.t >= b.hoje());
    L.push(`- ${m.id} ${m.nome} | ${b.ST[m.st]}${par ? ` (parada por ${par.motivo} há ${b.dur(now - par.ini)})` : ''} | ritmo nominal ${m.rate} pç/h | ${o ? `OP ${o.id} ${prodNome(o)} ${o.feito}/${o.qtd} (${b.pc(pct(o))})` : 'sem OP'} | produzido hoje ${hoje} | OEE 8h ${b.pc(oe.oee)} (disp ${b.pc(oe.disp)}, desemp ${b.pc(oe.perf)}, qual ${b.pc(oe.q)})`);
  });
  L.push('\nORDENS DE PRODUÇÃO (por prioridade):');
  b.ordenar(S.ops).slice(0, 40).forEach(o => L.push(`- OP ${o.id} | ${prodNome(o)} | máq ${o.maq || '-'} | ${b.ST[o.st]} | prioridade ${b.PRIO[b.prio(o)][0]} | ${o.feito}/${o.qtd} (${b.pc(pct(o))}) | prazo ${b.dt(o.prazo)}${b.atrasada(o) ? ' | ATRASADA' : ''}${o.lib ? ' | liberada' : ''}`));
  const rec = S.stops.filter(s => s.fim).sort((x, y) => y.fim - x.fim).slice(0, 6);
  if (rec.length) { L.push('\nÚLTIMAS PARADAS ENCERRADAS:'); rec.forEach(s => L.push(`- ${b.maq(s.m)?.nome || s.m}: ${s.motivo}, ${b.dur(s.fim - s.ini)}, encerrada ${new Date(s.fim).toLocaleString('pt-BR')}`)); }
  const sc = S.scrap.filter(s => s.t >= now - 24 * 36e5), porMotivo = {};
  sc.forEach(s => { porMotivo[s.motivo] = (porMotivo[s.motivo] || 0) + s.q; });
  L.push('\nREFUGO (últimas 24 h): ' + (sc.length ? sc.reduce((a, s) => a + s.q, 0) + ' pç. Por motivo: ' + Object.entries(porMotivo).map(([k, v]) => `${k} ${v}`).join(', ') : 'nenhum registro'));
  const al = b.alertas().map(x => x.t.replace(/<[^>]+>/g, ''));
  L.push('\nALERTAS ATIVOS: ' + (al.length ? al.join(' | ') : 'nenhum'));
  return L.join('\n');
}

// ============================================
// RESPOSTAS LOCAIS (funcionam sem internet e sem Gemini)
// ============================================
function achaMaquinas(t) {
  const S = B().estado(), ids = new Set();
  [...t.matchAll(/\bmaq(?:uina)?s?\.?\s*(?:n[o°.]?\s*)?0?(\d)\b/g)].forEach(x => ids.add('0' + x[1]));
  [...t.matchAll(/\b0(\d)\b/g)].forEach(x => ids.add('0' + x[1]));
  S.machines.forEach(m => { const n = norm(m.nome).replace(/\s*\d+$/, ''); if (n.split(/\s+/).some(w => w.length > 3 && new RegExp('\\b' + w.slice(0, 5)).test(t))) ids.add(m.id); });
  return S.machines.filter(m => ids.has(m.id));
}
function lnMaq(m) {
  const b = B(), now = Date.now(), o = b.op(m.op), oe = b.oee(m), par = b.parada(m.id), hoje = b.sum(e => e.m === m.id && e.t >= b.hoje());
  let s = `• **${m.nome}** (${m.id}) — ${b.ST[m.st]}`;
  if (par) s += ` por **${par.motivo}** há ${b.dur(now - par.ini)}`;
  s += o ? `\n   OP ${o.id} · ${prodNome(o)} · ${b.nf(o.feito)}/${b.nf(o.qtd)} (${b.pc(pct(o))})` : '\n   Sem OP associada';
  return s + `\n   Hoje: ${b.nf(hoje)} pç · OEE 8h: ${b.pc(oe.oee)}`;
}
function lnOP(o) {
  const b = B();
  return `• **OP ${o.id}** — ${prodNome(o)} · máq ${o.maq || '-'} · ${b.ST[o.st]} · prioridade ${b.PRIO[b.prio(o)][0]}\n   ${b.nf(o.feito)}/${b.nf(o.qtd)} (${b.pc(pct(o))}) · prazo ${b.dt(o.prazo)}${b.atrasada(o) ? ' · **ATRASADA**' : ''}`;
}
const R = (message, type = 'query') => ({ message, type });

function getHelp() {
  const c = B()?.setor();
  return R(`**Posso te ajudar com:**\n\n• **"Resumo"** — situação geral da fábrica\n• **"Máquinas paradas"** — paradas em andamento e recentes\n• **"Máquina 02"** ou **"Flexográfica"** — dados de uma máquina\n• **"OP 1023"** — andamento de uma ordem\n• **"OPs urgentes"**, **"atrasadas"** ou **"fila"**\n• **"OEE"** — indicadores das máquinas\n• **"Produção de hoje"** e **"Refugo"**\n• **"Alertas"** e **"Mensagens"**\n• **"Como gerar QR Code / PDF da OP / mudar prioridade"**\n\nVocê também pode usar o **microfone**.${c ? `\nSetor atual: **${c.nome}**.` : ''}`, 'info');
}

function interpretCommand(input) {
  const b = B(), S = b.estado(), t = norm(input), now = Date.now();
  if (has(t, 'ajuda', 'help', 'comandos?', 'o que (?:voce )?pode', 'como usar')) return getHelp();

  // OP específica
  const mop = t.match(/\b(\d{4})\b/); const opx = mop && b.op(mop[1]);
  if (opx) return R(lnOP(opx) + `\n\nVeja mais em ${lk('ordens', 'Ordens de Produção')}.`);

  // Máquina específica
  const ms = achaMaquinas(t);
  if (ms.length && !has(t, 'oee', 'indicador', 'refugo', 'perda', 'desperdicio', 'sucata')) return R(ms.map(lnMaq).join('\n\n') + `\n\nDetalhes em ${lk('maquinas', 'Máquinas')}.`);

  // Como usar
  if (has(t, 'qr')) return R(`**QR Code:** em ${lk('maquinas', 'Máquinas')} e ${lk('ordens', 'Ordens de Produção')} use o botão **QR Code** (ficha + etiqueta para imprimir). Para ler, use **Ler QR Code** na barra superior (foto do QR ou código digitado/leitor USB).`, 'info');
  if (has(t, 'pdf', 'imprimir', 'impressao')) return R(`**PDF da OP:** em ${lk('ordens', 'Ordens de Produção')}, clique em **PDF** na linha da OP e escolha "Salvar como PDF" na janela de impressão.`, 'info');
  if (has(t, 'tema', 'escuro', 'fonte', 'daltonis', 'acessibilidade')) return R(`Tema escuro, tamanho da fonte e filtro de daltonismo ficam em ${lk('config', 'Configurações')}.`, 'info');
  if (has(t, 'desenho', 'caixa', 'palete', 'vinco', 'modelo')) return R(`Modelos de caixa (Corte e Vinco) e Caixa Palete estão em ${lk('desenhos', 'Desenhos Técnicos')}.`, 'info');
  if (has(t, 'sair', 'logout', 'trocar de setor')) return R('Para trocar de setor, use o botão **Sair** no rodapé do menu lateral.', 'info');

  if (has(t, 'parad', 'parou', 'parar', 'manutencao', 'falha', 'quebr')) {
    const abertas = S.stops.filter(s => !s.fim && b.maq(s.m)), rec = S.stops.filter(s => s.fim).sort((x, y) => y.fim - x.fim).slice(0, 3);
    let s = abertas.length ? '**Paradas em andamento:**\n' + abertas.map(p => `• **${b.maq(p.m).nome}** — ${p.motivo}, há ${b.dur(now - p.ini)}`).join('\n') : '**Nenhuma máquina parada no momento.**';
    if (rec.length) s += '\n\n**Últimas paradas encerradas:**\n' + rec.map(p => `• ${b.maq(p.m)?.nome || p.m} — ${p.motivo} (${b.dur(p.fim - p.ini)})`).join('\n');
    return R(s + `\n\nHistórico completo em ${lk('historico', 'Histórico')}.`);
  }
  if (has(t, 'alerta', 'atencao', 'problema', 'aviso')) {
    const al = b.alertas().map(x => '• ' + x.t.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<[^>]+>/g, ''));
    return R(al.length ? '**Alertas ativos:**\n' + al.join('\n') : 'Nenhum alerta ativo agora. Tudo dentro dos limites configurados.');
  }
  if (has(t, 'atrasad', 'urgent', 'prioridade', 'fila', 'prazo', 'ops?\\b', 'ordens?', 'ordem')) {
    let l = b.ordenar(S.ops).filter(o => o.st !== 'finalizada'), titulo = 'Ordens em aberto (por prioridade)';
    if (has(t, 'atrasad')) { l = l.filter(b.atrasada); titulo = 'OPs atrasadas'; }
    else if (has(t, 'urgent')) { l = l.filter(o => b.prio(o) === 'urgente'); titulo = 'OPs urgentes em aberto'; }
    return R(l.length ? `**${titulo}:**\n\n` + l.slice(0, 8).map(lnOP).join('\n\n') + (l.length > 8 ? `\n\n+ ${l.length - 8} outras em ${lk('ordens', 'Ordens de Produção')}.` : '') : (has(t, 'atrasad') ? 'Nenhuma OP atrasada no momento.' : has(t, 'urgent') ? 'Nenhuma OP urgente em aberto.' : 'Nenhuma OP em aberto.'));
  }
  if (has(t, 'oee', 'indicador', 'eficiencia', 'disponibilidade', 'desempenho'))
    return R('**OEE por máquina (janela de 8 h):**\n' + S.machines.map(m => { const e = b.oee(m); return `• **${m.nome}** — ${b.pc(e.oee)} (disp. ${b.pc(e.disp)} · desemp. ${b.pc(e.perf)} · qual. ${b.pc(e.q)})`; }).join('\n') + `\n\nMais em ${lk('indicadores', 'Indicadores')}.`);
  if (has(t, 'refugo', 'perda', 'desperdicio', 'sucata')) {
    const sc = S.scrap.filter(s => s.t >= now - 24 * 36e5), tot = sc.reduce((a, s) => a + s.q, 0), g = {};
    sc.forEach(s => { g[s.motivo] = (g[s.motivo] || 0) + s.q; });
    return R(sc.length ? `**Refugo nas últimas 24 h: ${b.nf(tot)} pç**\n` + Object.entries(g).sort((x, y) => y[1] - x[1]).map(([k, v]) => `• ${k}: ${b.nf(v)}`).join('\n') : 'Nenhum refugo registrado nas últimas 24 h.');
  }
  if (has(t, 'producao', 'produzid', 'hoje', 'turno', 'quanto')) {
    const l = S.machines.map(m => [m, b.sum(e => e.m === m.id && e.t >= b.hoje())]), tot = l.reduce((a, x) => a + x[1], 0);
    return R(`**Produzido hoje: ${b.nf(tot)} pç**\n` + l.map(([m, q]) => `• ${m.nome}: ${b.nf(q)}`).join('\n') + (S.sim ? '\n\n(O sistema está em modo simulação: números de exemplo.)' : ''));
  }
  if (has(t, 'resumo', 'situacao', 'panorama', 'geral', 'como esta', 'visao', 'status', 'fabrica', 'dashboard')) {
    const cont = k => S.machines.filter(m => m.st === k).length, abertas = S.ops.filter(o => o.st !== 'finalizada');
    const hoje = S.machines.reduce((a, m) => a + b.sum(e => e.m === m.id && e.t >= b.hoje()), 0), al = b.alertas().length;
    return R(`**Resumo da fábrica**\n• Máquinas: ${cont('produzindo')} produzindo · ${cont('parada')} parada(s) · ${cont('disponivel')} disponível(is)\n• Produzido hoje: ${b.nf(hoje)} pç\n• OPs em aberto: ${abertas.length} (${abertas.filter(o => b.prio(o) === 'urgente').length} urgente(s), ${abertas.filter(b.atrasada).length} atrasada(s))\n• Alertas ativos: ${al}\n\nPergunte por **máquinas paradas**, **OPs urgentes** ou **OEE** para detalhar. Painel completo: ${lk('dashboard', 'Dashboard')}.`);
  }
  if (has(t, 'mensage', 'comunicacao', 'recado', 'caixa de entrada')) {
    const n = b.naoLidas();
    return R(n ? `Você tem **${n}** mensagem(ns) não lida(s). Abra ${lk('comunicacao', 'Comunicação')} para ler e responder.` : `Nenhuma mensagem não lida. Para falar com outro setor, use ${lk('comunicacao', 'Comunicação')}.`);
  }
  if (has(t, 'ola\\b', 'oi\\b', 'hey', 'bom dia', 'boa tarde', 'boa noite', 'hello')) return R('Olá! Sou o assistente da **Milênio Embalagens**. Pergunte sobre máquinas, OPs, paradas ou indicadores. Diga "ajuda" para ver os comandos.', 'info');
  return R(`Não entendi bem "**${input}**". Tente: **resumo**, **máquinas paradas**, **OPs urgentes**, **OEE**, **refugo** ou **OP 1023**. Diga "ajuda" para ver tudo.`, 'info');
}

// ============================================
// GEMINI (via servidor — a chave nunca chega ao navegador)
// ============================================
async function checarGemini() {
  try {
    const r = await fetch('/api/chatbot/status', { cache: 'no-store' });
    AssistantState.gemini = r.ok && !!(await r.json()).gemini;
  } catch (e) { AssistantState.gemini = false; }
  const m = $id('cb-mode'); if (m) m.textContent = AssistantState.gemini ? 'Milênio IA · Gemini' : 'Milênio IA · modo local';
}
const geminiPronto = () => AssistantState.gemini && Date.now() - AssistantState.falhaEm > CFG.pausaFalhaMs;

async function askGemini(texto) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CFG.timeoutMs);
  try {
    const r = await fetch('/api/chatbot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ mensagens: [...AssistantState.history.slice(-CFG.maxHistory), { role: 'user', text: texto }], contexto: snapshot() }),
    });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    const d = await r.json(); if (!d.texto) throw new Error('vazio');
    AssistantState.history.push({ role: 'user', text: texto }, { role: 'model', text: d.texto });
    AssistantState.history = AssistantState.history.slice(-CFG.maxHistory);
    return d.texto;
  } finally { clearTimeout(timer); }
}

// ============================================
// FLUXO DE MENSAGENS
// ============================================
async function handleUserInput(text) {
  text = String(text || '').trim().slice(0, 400);
  if (!text || AssistantState.isProcessing || !B()) return;
  clearTranscriptPreview();
  AssistantState.isProcessing = true; setBusy(true); updateVoiceUI('processing');
  addUserMessage(text);
  let resp, nota = '';
  try {
    if (geminiPronto() && !has(norm(text), 'ajuda', 'help', 'comandos?')) {
      const id = showTyping();
      try { resp = { message: await askGemini(text), type: 'info' }; AssistantState.avisouFalha = false; }
      catch (e) {
        console.warn('Gemini indisponível, usando respostas locais:', e);
        if (e.status !== 429) AssistantState.falhaEm = Date.now();
        resp = interpretCommand(text);
        if (!AssistantState.avisouFalha) { nota = e.status === 429 ? 'Muitas perguntas seguidas à IA — resposta local.' : 'IA indisponível agora — resposta local.'; AssistantState.avisouFalha = true; }
      } finally { removeTyping(id); }
    } else { await new Promise(r => setTimeout(r, 250)); resp = interpretCommand(text); }
  } catch (e) { console.error(e); resp = R('Ocorreu um erro ao responder. Tente de novo.', 'error'); }
  AssistantState.isProcessing = false; setBusy(false); updateVoiceUI('idle');
  addAssistantMessage(resp.message, resp.type, nota);
  speak(resp.message);
}
function setBusy(b) { const s = $id('chatbot-send'); if (s) s.disabled = b; }

// ============================================
// UI
// ============================================
const timeNow = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const escapeHtmlChat = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

// Escapa o HTML ANTES do markdown (texto da IA nunca vira HTML). Só links internos [texto](#tela) são permitidos.
function renderMarkdown(text) {
  return escapeHtmlChat(text)
    .replace(/\[([^\]]+)\]\(#([a-z]+)\)/g, '<a href="#$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/(^|<br>)(\s*)[•*-] /g, '$1$2&bull; ');
}
function scrollEnd() { const c = $id('chatbot-messages'); if (c) c.scrollTop = c.scrollHeight; }
function addUserMessage(text) {
  $id('chatbot-messages')?.insertAdjacentHTML('beforeend', `<div class="message-group user-msg"><div class="message-bubble">${escapeHtmlChat(text)}</div><span class="message-time">${timeNow()}</span></div>`);
  scrollEnd();
}
function addAssistantMessage(text, type = 'info', nota = '') {
  const cls = type === 'error' ? 'error-message' : type === 'warning' ? 'warning-message' : type === 'query' ? 'action-message' : '';
  $id('chatbot-messages')?.insertAdjacentHTML('beforeend', `<div class="message-group assistant-msg"><div class="message-bubble ${cls}"><div>${renderMarkdown(text)}</div>${nota ? `<span class="cb-note">${escapeHtmlChat(nota)}</span>` : ''}</div><span class="message-time">${timeNow()}</span></div>`);
  scrollEnd();
}
function showTyping() {
  const id = 'typing-' + Date.now();
  $id('chatbot-messages')?.insertAdjacentHTML('beforeend', `<div class="message-group assistant-msg" id="${id}"><div class="message-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`);
  scrollEnd(); return id;
}
const removeTyping = id => document.getElementById(id)?.remove();

function resetChat() {
  const box = $id('chatbot-messages'); if (box) box.innerHTML = '';
  AssistantState.history = []; AssistantState.avisouFalha = false; AssistantState.falhaEm = 0;
  const c = B()?.setor();
  addAssistantMessage(`Olá! Sou o assistente da **Milênio Embalagens**${c ? ` — setor **${c.nome}**` : ''}. Posso ajudar com:\n• Máquinas, paradas e alertas\n• OPs, prioridades e prazos\n• OEE, produção e refugo\n• Como usar o sistema\n\nDiga "ajuda" para ver todos os comandos. Pode falar ou digitar.`, 'info');
}

// ============================================
// INICIALIZAÇÃO E GANCHOS COM O SISTEMA
// ============================================
window.chatbotLogin = () => {
  const c = $id('chatbot-container'); if (!c) return;
  AssistantState.logado = true; c.hidden = false; resetChat(); checarGemini();
};
window.chatbotLogout = () => {
  AssistantState.logado = false; AssistantState.synthesis?.cancel();
  try { AssistantState.recognition?.abort(); } catch (e) { }
  AssistantState.isProcessing = false; setBusy(false); updateVoiceUI('idle'); clearTranscriptPreview();
  const c = $id('chatbot-container'); if (c) { c.hidden = true; c.classList.add('minimized'); }
  const box = $id('chatbot-messages'); if (box) box.innerHTML = '';
  AssistantState.history = [];
};

function enviarDoCampo() { const i = $id('chatbot-input'); if (!i) return; const t = i.value.trim(); if (!t || AssistantState.isProcessing) return; i.value = ''; handleUserInput(t); }

function init() {
  const c = $id('chatbot-container'); if (!c) return;
  $id('cb-ic-bot').innerHTML = icon('bot'); $id('cb-min').innerHTML = icon('down'); $id('cb-clear').innerHTML = icon('trash'); $id('chatbot-send').innerHTML = icon('send'); updateVoiceUI('idle');
  c.setAttribute('role', 'button'); c.setAttribute('aria-label', 'Abrir assistente'); c.tabIndex = 0;
  $id('cb-chips').innerHTML = [['Resumo da fábrica', 'Resumo'], ['Máquinas paradas', 'Máquinas paradas'], ['OPs urgentes', 'OPs urgentes'], ['OEE', 'OEE das máquinas']].map(x => `<button type="button" class="suggestion-chip" data-q="${x[1]}">${x[0]}</button>`).join('');
  c.addEventListener('click', e => { if (c.classList.contains('minimized')) toggleChatBot(); });
  c.addEventListener('keydown', e => { if (c.classList.contains('minimized') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleChatBot(); } else if (e.key === 'Escape' && !c.classList.contains('minimized')) toggleChatBot(); });
  $id('cb-min').addEventListener('click', e => { e.stopPropagation(); toggleChatBot(); });
  $id('cb-clear').addEventListener('click', e => { e.stopPropagation(); AssistantState.synthesis?.cancel(); resetChat(); });
  $id('voice-btn').addEventListener('click', toggleVoiceRecognition);
  $id('chatbot-send').addEventListener('click', enviarDoCampo);
  $id('chatbot-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); enviarDoCampo(); } });
  $id('cb-chips').addEventListener('click', e => { const q = e.target.closest('[data-q]')?.dataset.q; if (q) handleUserInput(q); });
  $id('voice-response-toggle').addEventListener('change', e => { if (!e.target.checked) AssistantState.synthesis?.cancel(); });
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $id('voice-btn').classList.add('disabled');
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { };
}
window.toggleChatBot = toggleChatBot; window.AssistantState = AssistantState;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
