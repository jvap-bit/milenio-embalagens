/* ===== Tutorial guiado do Sistema Milênio =====
 * Mostra, para cada conta (setor), o que aparece ao entrar, o que cada dado significa e para que servem os botões.
 * - Abre sozinho depois do login (pergunta se quer seguir ou fechar) e pode ser aberto a qualquer hora no botão "Tutorial".
 * - Controles: Voltar, Próximo, Pular tutorial, Fechar (X ou Esc). Teclado: setas e Enter.
 * - Só lê a tela; não altera nenhum dado do sistema.
 * Para editar os textos, mexa nas listas PASSOS (por conta) logo abaixo. */
(() => {
    const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const KEY = 'milenio_tut_off_';           // guarda "não mostrar ao entrar" por conta, neste navegador
    const B = () => window.chatbotBridge, setor = () => B() && B().setor();
    const li = a => '<ul>' + a.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const STATUS = 'Cores de status: <b>Produzindo</b> (verde), <b>Parada</b> (vermelho), <b>Disponível</b> (máquina livre), <b>Planejada</b> (OP ainda não começou) e <b>Finalizada</b>.';
    const PLAN = 'A barra <b>Planejado x produzido</b> mostra quantas peças já foram feitas, a meta da OP, o percentual e quanto falta.';
    const PRIOT = 'Prioridades: <b>Urgente</b>, <b>Alta</b>, <b>Normal</b> e <b>Baixa</b>. A lista sempre põe a mais urgente primeiro e, em empate, o prazo mais curto.';

    /* ---------- passos comuns ---------- */
    const abertura = s => [
        { t: 'Bem-vindo, ' + s.nome, x: `<p>${esc(s.desc)}</p><p>Este tutorial mostra <b>o que você vê ao entrar na conta ${esc(s.nome)}</b>, o que significam os dados e para que servem os botões. Cada conta enxerga e pode fazer apenas o que é do seu setor.</p><p class="tut-dica">Use <b>Próximo</b> e <b>Voltar</b> para andar pelos passos, <b>Pular</b> para ir direto ao fim ou <b>Fechar</b> (X) para sair quando quiser.</p>`, tela: 'setor' },
        { t: 'Menu lateral', alvo: '#nav', x: () => `<p>É o caminho entre as telas. Para a conta <b>${esc(s.nome)}</b> existem estas telas:</p>${li([...document.querySelectorAll('#nav a')].map(a => esc(a.textContent)))}<p>A tela em destaque (amarela) é a que está aberta. Telas de outros setores não aparecem aqui.</p><p class="tut-dica">No celular, o botão <b>Menu</b> abre e fecha esta lista.</p>`, tela: 'setor' },
        { t: 'Barra superior', alvo: '.top', x: `<ul><li><b>Menu</b> – mostra ou esconde o menu lateral.</li><li><b>Título e subtítulo</b> – dizem em qual tela você está.</li><li><b>Tutorial</b> – abre este guia de novo.</li><li><b>Ler QR Code</b> – lê o QR Code de uma máquina ou OP (por foto, código digitado ou leitor USB) e mostra os dados dela.</li><li><b>Data e hora</b> – relógio do sistema.</li></ul>`, tela: 'setor' }
    ];
    const alertasPasso = { t: 'Faixa de alertas', alvo: '#alerts', x: `<p>Aparece no topo de qualquer tela <b>somente quando há problema</b>; sem problema, não aparece nada.</p>${li(['<b>Parada prolongada</b> (vermelho): máquina parada além do limite (padrão 15 min).', '<b>Baixa produção</b> (amarelo): máquina produzindo abaixo de 70% do ritmo nominal (só avaliada após 3 min de produção).', 'O link <b>Ver</b> leva à tela da máquina.'])}<p>Os limites mudam em <b>Configurações &gt; Alertas</b>. Esta conta recebe alertas.</p>` };
    const comunicacao = { t: 'Comunicação entre setores', tela: 'comunicacao', alvo: '#view > .card', x: `<p>Troque mensagens com os outros setores (ex.: Produção avisa Manutenção).</p>${li(['<b>Recebidas</b> – mensagens para você. Clique numa mensagem para abrir; “Nova” marca as não lidas, e o menu mostra o número de pendentes.', '<b>Enviadas</b> – o que você já enviou.', '<b>Nova mensagem</b> – escolha o setor (ou “Todos os setores”), a prioridade <b>Normal</b> ou <b>Urgente</b>, o assunto, o texto e clique em <b>Enviar mensagem</b>.', '<b>Responder</b> – dentro da mensagem, já preenche o destinatário e o assunto (“Re: …”).'])}<p>Com o servidor ligado aparece “Servidor conectado” e as mensagens chegam a todos em até 2 segundos. Sem servidor, aparece “Modo local” e a mensagem fica só neste computador.</p>` };
    const fecho = s => [
        { t: 'VLibras (Língua Brasileira de Sinais)', alvo: '[vw-access-button]', x: `<p>O ícone azul das <b>mãos</b>, na lateral direita da tela, ativa o <b>VLibras</b>, o tradutor de português para Libras do governo federal.</p>${li(['Clique no ícone para abrir o avatar (o <b>Ícaro</b>, a <b>Hosana</b> ou a <b>Guga</b>).', 'Selecione um texto da tela: o avatar o traduz em Libras. Também dá para clicar em um texto para traduzi-lo.', 'Com o painel aberto você pode pausar, repetir, mudar a velocidade e ativar legendas.', 'Funciona na tela de login e em todas as contas.'])}<p class="tut-dica">O VLibras precisa de <b>internet</b>. Sem conexão, o ícone não aparece; o resto do sistema continua normal.</p>` },
        { t: 'Configurações', tela: 'config', alvo: '#accbox', x: `<p>O botão <b>Configurações</b> (embaixo do menu) ajusta o sistema <b>só para este dispositivo</b>:</p>${li(['<b>Tema</b>: modo claro ou escuro.', '<b>Tamanho da fonte</b>: de Normal (100%) a Extra grande (150%).', '<b>Filtro para daltonismo</b>: Protanopia, Deuteranopia ou Tritanopia.', ...(['producao', 'manutencao', 'planejamento', 'admin'].includes(s.id) ? ['<b>Alertas</b>: minutos para “parada prolongada” e % para “baixa produção”.'] : []), '<b>Restaurar padrão</b> volta tudo ao original.'])}` },
        { t: 'Assistente Milênio (IA)', alvo: '#chatbot-container', x: `<p>A bolinha <b>IA</b> no canto inferior direito abre o assistente.</p>${li(['Pergunte por texto ou voz (microfone) sobre máquinas, paradas, OPs, prazos, OEE, produção, refugo e mensagens não lidas.', 'Diga <b>“ajuda”</b> para ver os comandos.', '<b>Resposta por voz</b> faz o assistente falar; <b>Limpar conversa</b> e <b>Minimizar</b> ficam no topo.', 'Ele só consulta: <b>não altera nada</b> no sistema.'])}` },
        { t: 'Sair da conta', alvo: '.foot', tela: 'setor', x: `<p>No rodapé do menu aparece o seu <b>setor</b> e o botão <b>Sair</b>, que volta para a tela de login para trocar de conta. Sempre saia ao terminar o turno.</p>` },
        { t: 'Tutorial concluído!', x: `<p>Pronto! Você já conhece a conta <b>${esc(s.nome)}</b>.</p><p>Para rever, clique em <b>Tutorial</b> na barra superior. Se não quiser que ele abra ao entrar, marque “Não mostrar ao entrar” na tela inicial do tutorial.</p>`, fim: true, tela: 'setor' }
    ];

    /* ---------- passos de cada conta ---------- */
    const PASSOS = {
        producao: [
            { t: 'Meu Setor: números do dia', tela: 'setor', alvo: '#view .grid.g4', x: `<p>Ao entrar você cai na tela <b>Meu Setor</b>. No alto ficam 4 indicadores:</p>${li(['<b>Produzido hoje</b> – peças contadas desde a meia-noite, somando todas as máquinas.', '<b>Máquinas produzindo</b> – quantas estão rodando em relação ao total.', '<b>OPs em andamento</b> – ordens em produção e quantas estão só planejadas.', '<b>Refugo hoje</b> – peças descartadas (perda).'])}` },
            { t: 'Máquinas e OPs', tela: 'setor', alvo: '#view .grid.g4 .mach', up: 1, x: `<p>Cada cartão é uma máquina com a OP que ela está fazendo.</p>${li([STATUS, PLAN, PRIOT])}<p>Se houver uma parada em curso, uma faixa vermelha aparece acima dos cartões com o motivo e há quanto tempo.</p>` },
            { t: 'Mensagens recebidas', tela: 'setor', alvo: '#view > .card:last-child', x: `<p>Mostra as 3 últimas mensagens de outros setores. As novas ficam destacadas. O botão <b>Abrir Comunicação</b> leva à caixa completa.</p>` },
            alertasPasso,
            { t: 'Apontamento do Operador', tela: 'operador', alvo: '#view > .card:first-child', x: `<p>É a tela de trabalho do operador: escolha a máquina e registre o que acontece.</p>${li(['<b>Identificação da máquina</b> – lista para escolher a máquina; ao lado aparece o status.', '<b>Iniciar / Retomar</b> – começa a produzir (ou volta de uma parada, encerrando-a). Fica desativado se a máquina já produz ou não tem OP.', '<b>Registrar parada</b> – abre uma janela para escolher o motivo (Manutenção, Falta de material, Setup, Troca de ferramenta, Ajuste de qualidade, Intervalo) e confirmar. A máquina fica “Parada” até alguém retomar ou a Manutenção concluir.', '<b>Apontar refugo</b> – informe a quantidade de peças perdidas e o motivo (Impressão, Corte, Vinco, Material, Colagem).'])}` },
            { t: 'Apontamento: OP e desenho', tela: 'operador', alvo: '#view > .grid.g2', x: `<ul><li><b>Ordem de Produção</b> – número da OP, produto, prioridade e status; o <b>contador grande</b> mostra as peças feitas contra o planejado, com a barra de progresso, prazo, quanto falta e a <b>próxima OP da fila</b>.</li><li><b>Desenho técnico</b> – o desenho de corte e vinco do produto (linha contínua = corte, tracejada = vinco), com código e revisão.</li></ul>` },
            { t: 'Ordens de Produção (consulta)', tela: 'ordens', alvo: '#view .wrap', x: `<p>A Produção <b>só consulta</b> as OPs (criar, trocar prioridade e excluir é com o Planejamento).</p>${li(['Colunas: OP, Prioridade, Produto, Máquina, Planejado x produzido, Prazo e Status.', PRIOT, '<b>Abrir</b> – mostra o desenho, a meta e o produzido da OP.', '<b>QR Code</b> – gera a ficha e a etiqueta para imprimir (“Imprimir etiqueta”).', '<b>PDF</b> – abre a folha da OP (dados, QR e desenho) e chama a impressão; escolha “Salvar como PDF”.'])}` },
            { t: 'Filtro de prioridade', tela: 'ordens', alvo: '#fprio', x: `<p>Mostra só as OPs da prioridade escolhida (Urgente, Alta, Normal ou Baixa). “Todas as prioridades” volta à lista completa.</p>` },
            { t: 'Desenhos Técnicos', tela: 'desenhos', alvo: '#cvcard', x: `<p>Consulta dos desenhos de caixas.</p>${li(['<b>Corte e Vinco</b> – abre com a caixa Padrão. Escolha <b>Pequena, Média, Grande</b> ou <b>Personalizado</b> (informe C × L × A em mm).', '<b>Modelos</b> – abre as outras caixas: Correios/Sedex, Envelope, Telescópica e Maleta.', 'Os desenhos servem de referência: confirme com a ferramentaria antes de produzir.'])}` },
            { t: 'Caixa Palete', tela: 'desenhos', alvo: '#palcard', x: `<p>Desenho da caixa palete: só <b>Comprimento</b> e <b>Altura</b> (mm) podem mudar; a largura é fixa em 1000 mm. Mostra a chapa e as peças de tampa e fundo.</p>` }
        ],
        manutencao: [
            { t: 'Meu Setor: paradas e máquinas', tela: 'setor', alvo: '#view .grid.g4', x: `<p>Ao entrar você vê o quadro da manutenção:</p>${li(['<b>Paradas em curso</b> – quantas máquinas estão paradas agora.', '<b>Tempo parado (8h)</b> – soma do tempo parado de todas as máquinas nas últimas 8 horas.', '<b>Máquinas paradas</b> e <b>Máquinas disponíveis</b>.'])}` },
            { t: 'Paradas em curso e concluir parada', tela: 'setor', alvo: '#view > .grid.g2', x: `<ul><li><b>Paradas em curso</b> – cada linha mostra a máquina, o motivo e há quanto tempo. O botão <b>Concluir parada</b> encerra a parada após o reparo e deixa a máquina <b>Disponível</b> (a Produção então retoma).</li><li><b>Tempo parado por motivo (24h)</b> – mostra qual motivo mais tira tempo das máquinas.</li></ul>` },
            { t: 'Estado das máquinas', tela: 'setor', alvo: '#view > .card:nth-last-child(2)', x: `<p>Cartões com status, OP, prioridade e progresso de cada máquina. ${STATUS}</p>` },
            alertasPasso,
            { t: 'Máquinas: pesquisa e cadastro', tela: 'maquinas', alvo: '#view > .card', x: `<ul><li><b>Cadastrar máquina</b> – informe o nome e a capacidade nominal (peças por hora); o sistema cria o ID e a deixa “Disponível”.</li><li><b>Pesquisar máquina</b> – digite ID (ex.: 02), parte do nome (ex.: flexo) ou número da OP. <b>Limpar</b> mostra todas de novo.</li></ul>` },
            { t: 'Tabela de máquinas', tela: 'maquinas', alvo: '#mtab', x: `<p>Colunas: ID, Máquina, Status, OP atual, Capacidade (pç/h), Produzido hoje e <b>Tópico MQTT</b> (o endereço pelo qual o sensor da máquina envia a contagem).</p>${li(['<b>Ver dados</b> – abre os detalhes da máquina logo abaixo.', '<b>QR Code</b> – gera a ficha e a etiqueta para colar na máquina.'])}` },
            { t: 'Detalhes da máquina', tela: 'maquinas', alvo: '#mdet', x: `<p>Ao clicar em <b>Ver dados</b> (ou quando a pesquisa deixa uma só máquina) aparece:</p>${li(['<b>Status, Produzido hoje, OEE (8h)</b> – com disponibilidade, desempenho e qualidade – e <b>Capacidade nominal</b>.', '<b>OP atual</b> e <b>Fila de OPs</b> por prioridade.', '<b>Produção por hora</b> (últimas 12h).', '<b>Últimas paradas</b> (motivo, início, duração; “em curso” se ainda aberta) e <b>Últimos refugos</b>.'])}`, depois: () => { const b = $('[data-vm]'); if (b && !$('#mdet h2')) b.click() } },
            { t: 'Histórico', tela: 'historico', alvo: '#view > .card:first-child', x: `<p>Veja o que já aconteceu. A lista <b>Todas as máquinas</b> filtra por máquina. O gráfico mostra a produção dos últimos 7 dias.</p>` },
            { t: 'Registros, paradas e refugos', tela: 'historico', alvo: '#view > .grid.g2', x: `<ul><li><b>Registros recentes</b> – cada contagem com data/hora, máquina e peças.</li><li><b>Paradas e refugos</b> – motivo, início e duração de cada parada; refugos com quantidade de peças.</li></ul>` },
            { t: 'Indicadores (OEE)', tela: 'indicadores', alvo: '#view > .card:first-child', x: `<p>Tabela das últimas 8 horas por máquina: peças, refugo, tempo parado, <b>Disponibilidade</b>, <b>Desempenho</b>, <b>Qualidade</b> e <b>OEE</b>.</p>${li(['Disponibilidade = 1 − tempo parado ÷ 8h.', 'Desempenho = produzido ÷ (capacidade × tempo disponível).', 'Qualidade = 1 − refugo ÷ produzido.', 'OEE = os três multiplicados.'])}` },
            { t: 'Comparação e planejado x produzido', tela: 'indicadores', alvo: '#view > .grid.g2', x: `<p>À esquerda, o gráfico compara o OEE entre máquinas; à direita, cada OP com sua barra de planejado x produzido.</p>` }
        ],
        qualidade: [
            { t: 'Meu Setor: qualidade', tela: 'setor', alvo: '#view .grid.g4', x: `<p>Indicadores da qualidade:</p>${li(['<b>Refugo total</b> e <b>Refugo hoje</b> – peças descartadas.', '<b>Qualidade média (8h)</b> – 100% menos a proporção de refugo.', '<b>Produtos cadastrados</b>.'])}` },
            { t: 'Refugo por motivo e revisões', tela: 'setor', alvo: '#view > .grid.g2', x: `<ul><li><b>Refugo por motivo</b> – gráfico com Impressão, Corte, Vinco, Material e Colagem, para achar a causa que mais gera perda.</li><li><b>Revisões de desenho</b> – cada produto com a revisão atual (Rev A, B…) e a data.</li></ul>` },
            { t: 'Desenhos Técnicos', tela: 'desenhos', alvo: '#view > .card:first-child', x: `<p>A Qualidade pode <b>Cadastrar produto</b>: informe código, nome e comprimento/largura/altura (mm). O produto passa a estar disponível ao criar OPs.</p>` },
            { t: 'Corte e Vinco', tela: 'desenhos', alvo: '#cvcard', x: `<ul><li>Escolha <b>Pequena, Média, Grande</b> ou <b>Personalizado</b> (C × L × A em mm).</li><li><b>Modelos</b> abre Correios/Sedex, Envelope, Telescópica e Maleta.</li><li>Linha contínua = corte; tracejada = vinco. Confirme com a ferramentaria antes de produzir.</li></ul>` },
            { t: 'Caixa Palete', tela: 'desenhos', alvo: '#palcard', x: `<p>Altere só <b>Comprimento</b> e <b>Altura</b> (largura fixa de 1000 mm) e veja a chapa com corte e vinco.</p>` },
            { t: 'Indicadores', tela: 'indicadores', alvo: '#view > .card:first-child', x: `<p>Veja a coluna <b>Qualidade</b> e a coluna <b>Refugo</b> de cada máquina nas últimas 8 horas, junto com disponibilidade, desempenho e OEE.</p>` },
            { t: 'Histórico', tela: 'historico', alvo: '#view > .grid.g2', x: `<p>Em <b>Paradas e refugos</b> estão os refugos com máquina, motivo, data/hora e quantidade. Use a lista de máquinas no topo para filtrar.</p>` }
        ],
        planejamento: [
            { t: 'Meu Setor: carteira de OPs', tela: 'setor', alvo: '#view .grid.g4', x: `<p>O Planejamento (PCP) vê:</p>${li(['<b>OPs abertas</b> – ainda não finalizadas.', '<b>OPs atrasadas</b> – prazo vencido (também aparecem em faixas vermelhas).', '<b>Urgentes em aberto</b> – prioridade máxima.', '<b>Planejadas</b> e <b>Finalizadas</b>.'])}` },
            { t: 'Carga x capacidade', tela: 'setor', alvo: '#view > .card:nth-of-type(1)', x: `<p>Para cada máquina: quantas OPs abertas tem, quantas <b>peças restantes</b> e as <b>horas necessárias</b> (peças ÷ capacidade). Serve para ver quem está sobrecarregada.</p>`, alvoFn: () => [...document.querySelectorAll('#view .card')].find(c => /Carga x capacidade/.test(c.textContent)) },
            { t: 'Fila de produção por máquina', tela: 'setor', alvoFn: () => [...document.querySelectorAll('#view .card')].find(c => /Fila de produção por máquina/.test(c.textContent)), x: `<p>Mostra a ordem em que cada máquina fará as OPs: a que está produzindo vem primeiro; depois vale a prioridade e, em empate, o prazo mais curto. Quando uma OP termina, a máquina passa sozinha à próxima.</p>` },
            alertasPasso,
            { t: 'Ordens de Produção', tela: 'ordens', alvo: '#view > .card .row', x: `<p>Aqui o PCP programa a produção.</p>${li(['<b>Nova OP</b> – escolha produto, quantidade, máquina, prazo e prioridade. A OP nasce “Planejada”.', 'O filtro de prioridade deixa só um nível na lista.'])}` },
            { t: 'Prioridade e botões da OP', tela: 'ordens', alvo: '#view .wrap', x: `<ul><li>A coluna <b>Prioridade</b> é editável: troque direto na lista. Uma OP já em produção não é interrompida; a nova ordem vale na próxima.</li><li><b>Abrir</b> – mostra o desenho e permite <b>associar a OP a outra máquina</b> e mudar a prioridade.</li><li><b>QR Code</b> e <b>PDF</b> – etiqueta e folha de impressão da OP.</li><li><b>Excluir</b> (vermelho) – pede confirmação; se a OP estava numa máquina, ela fica sem OP.</li></ul>` },
            { t: 'Dashboard', tela: 'dashboard', alvo: '#view > .grid.g4:first-child', x: `<p>Produzido hoje, máquinas produzindo, OPs em andamento e OEE médio (8h). Abaixo, o gráfico por hora/turno/dia, os alertas e os cartões das máquinas.</p>` },
            { t: 'Máquinas (consulta)', tela: 'maquinas', alvo: '#mtab', x: `<p>O PCP consulta a capacidade (pç/h) e o status de cada máquina. Use a pesquisa e <b>Ver dados</b> para abrir a fila de OPs, o OEE e as paradas. (Cadastrar máquina é da Manutenção e do Administrativo.)</p>` },
            { t: 'Indicadores', tela: 'indicadores', alvo: '#view > .grid.g2', x: `<p>Compare o OEE das máquinas e acompanhe o <b>planejado x produzido</b> de cada OP para antecipar atrasos.</p>` }
        ],
        expedicao: [
            { t: 'Meu Setor: expedição', tela: 'setor', alvo: '#view .grid.g4', x: `<p>Indicadores da expedição:</p>${li(['<b>Aguardando liberação</b> – OPs finalizadas que ainda não foram liberadas.', '<b>Liberadas</b> – já liberadas para entrega.', '<b>Quase prontas (90%+)</b> – OPs que logo chegam à expedição.', '<b>Em produção</b>.'])}` },
            { t: 'Liberar para expedição', tela: 'setor', alvoFn: () => [...document.querySelectorAll('#view .card')].find(c => /aguardando liberação/.test(c.textContent) && c.querySelector('h2')), x: `<p>A lista de OPs finalizadas tem o botão <b>Liberar para expedição</b>: depois de conferir a carga, clique para marcar a OP como liberada (ela ganha a etiqueta “Liberada” e vai para “Já liberadas”).</p>` },
            { t: 'Próximas a finalizar e já liberadas', tela: 'setor', alvoFn: () => [...document.querySelectorAll('#view .card')].find(c => /Próximas a finalizar/.test(c.textContent)), x: `<p>“Próximas a finalizar” ajuda a se programar; “Já liberadas” é o histórico do que saiu.</p>` },
            { t: 'Ordens de Produção (consulta)', tela: 'ordens', alvo: '#view .wrap', x: `<p>A Expedição só consulta. Veja produto, máquina, planejado x produzido, prazo e status. <b>QR Code</b> e <b>PDF</b> geram a etiqueta e a folha da OP.</p>` },
            { t: 'Histórico', tela: 'historico', alvo: '#view > .card:first-child', x: `<p>Gráfico dos últimos 7 dias e registros de produção; filtre por máquina na lista do topo.</p>` }
        ],
        admin: [
            { t: 'Meu Setor: visão geral', tela: 'setor', alvo: '#view .grid.g4', x: `<p>O Administrativo tem <b>acesso a todas as áreas</b>. Ao entrar vê:</p>${li(['<b>Produzido hoje</b> – peças de todas as máquinas.', '<b>OEE médio (8h)</b> – eficiência geral; meta sugerida 65%.', '<b>OPs atrasadas</b> – prazo vencido.', '<b>Paradas em curso</b>.'])}` },
            { t: 'Máquinas e ordens em aberto', tela: 'setor', alvo: '#view > .card:nth-of-type(1)', alvoFn: () => [...document.querySelectorAll('#view .card')].find(c => c.querySelector('.mach')), x: `<p>Cartões das máquinas e a tabela das OPs em aberto. ${STATUS}</p>` },
            alertasPasso,
            { t: 'Dashboard', tela: 'dashboard', alvo: '#view > .grid.g4:first-child', x: `<p>Painel em tempo real com produzido, máquinas, OPs e OEE; o gráfico muda por hora, turno ou dia.</p>` },
            { t: 'Apontamento do Operador', tela: 'operador', alvo: '#view > .card:first-child', x: `<p>Pode operar qualquer máquina: <b>Iniciar / Retomar</b>, <b>Registrar parada</b> (escolha o motivo) e <b>Apontar refugo</b> (quantidade e motivo). Embaixo, a OP com contador e o desenho técnico.</p>` },
            { t: 'Ordens de Produção', tela: 'ordens', alvo: '#view .wrap', x: `<p>Controle total das OPs:</p>${li(['<b>Nova OP</b> – produto, quantidade, máquina, prazo e prioridade.', 'Troque a <b>prioridade</b> direto na lista. ' + PRIOT, '<b>Abrir</b> – desenho, meta e produzido; permite mudar a máquina e a prioridade.', '<b>QR Code</b>, <b>PDF</b> e <b>Excluir</b> (com confirmação).'])}` },
            { t: 'Máquinas', tela: 'maquinas', alvo: '#view > .card', x: `<p><b>Cadastrar máquina</b> (nome e capacidade em pç/h), pesquisar por ID/nome/OP, <b>Ver dados</b> (OEE, fila, paradas e refugos) e <b>QR Code</b> da máquina.</p>` },
            { t: 'Desenhos Técnicos', tela: 'desenhos', alvo: '#view > .card:first-child', x: `<p><b>Cadastrar produto</b> (código, nome e medidas), além dos desenhos de <b>Corte e Vinco</b> (com <b>Modelos</b>) e da <b>Caixa Palete</b>.</p>` },
            { t: 'Histórico e Indicadores', tela: 'indicadores', alvo: '#view > .card:first-child', x: `<p><b>Indicadores</b> traz o OEE por máquina nas últimas 8h. <b>Histórico</b> traz a produção dos últimos 7 dias, registros, paradas e refugos, com filtro por máquina.</p>` },
            { t: 'Integração IoT', tela: 'integracao', alvo: '#view > .grid.g2', x: `<p>Tela técnica da coleta de dados:</p>${li(['<b>Simulador de sensores</b> (botão Ligado/Desligado) – gera contagens a cada 2 segundos, como o ESP32 faria. Desligue quando ligar sensores reais.', '<b>Último evento recebido</b> – a última contagem (máquina, tópico MQTT, OP, peças, horário).', '<b>Coleta no chão de fábrica</b> – sensor → ESP32 → MQTT → Node-RED → banco.', '<b>API para o ERP</b> – endereços para registrar contagens, paradas e refugos e consultar máquinas e OPs.'])}` }
        ]
    };

    /* ---------- Ficha de Produção ---------- */
    const aba = k => () => window.fichaAba && window.fichaAba(k);
    const F = {
        abas: pode => ({ t: 'Ficha de Produção: visão geral', tela: 'ficha', antes: aba(pode ? 'fill' : 'in'), alvo: '.fp > .row', x: `<p>Esta tela <b>substitui o preenchimento à mão da Ordem de Fabricação</b> (plano de produção, inspeção final e faturamento).</p>${li([pode ? '<b>Preencher ficha</b> – você lança os dados da sua máquina/etapa.' : '', '<b>Recebidas</b> – fichas que outros setores enviaram para você analisar. O número entre parênteses são as que aguardam decisão.', '<b>Enviadas por mim</b> – acompanhe se foram aprovadas ou devolvidas.', 'À direita: <b>Servidor conectado</b> (verde) = a ficha chega ao responsável. <b>Modo local</b> (laranja) = só fica neste navegador; avise quem cuida do sistema.'].filter(Boolean))}` }),
        posto: { t: 'Ficha: máquina e OP', tela: 'ficha', antes: aba('fill'), alvo: '#fposto', up: 2, x: `<p>Escolha a <b>máquina</b> e a <b>Ordem de Produção</b>. A ficha muda conforme a máquina:</p>${li(['<b>Riscador, Impressora (Flexográfica) e Corte e Vinco</b> – tempos, perdas e quantidade.', '<b>Amarração / Colagem</b> – também pede volumes e peças por volume.', '<b>Inspeção final</b> e <b>Faturamento</b> – volumes, peças por volume, excedente, total de caixas (e NF no faturamento).'])}<p>A OP da máquina já vem escolhida; troque se precisar. O rascunho fica salvo no aparelho: se a tela fechar, nada se perde.</p>` },
        horas: { t: 'Ficha: botões de hora', tela: 'ficha', antes: aba('fill'), alvo: '[data-hora="iniAj"]', up: 1, x: `<p>Toque no botão na hora certa e o sistema grava o horário:</p>${li(['<b>1. Iniciar ajuste</b> – começou a preparar a máquina.', '<b>2. Iniciar produção</b> – terminou o ajuste e começou a produzir.', '<b>3. Finalizar produção</b> – parou de produzir.'])}<p>Esqueceu de tocar? Corrija a hora nos campos logo abaixo dos botões.</p>` },
        calc: { t: 'Ficha: tempos calculados', tela: 'ficha', antes: aba('fill'), alvo: '#fcalc', x: `<p>O sistema calcula sozinho o <b>tempo de ajuste</b>, o <b>tempo de produção</b> e o <b>total</b>, inclusive quando passa da meia-noite.</p><p>O <b>previsto</b> vem da OF impressa (T. ajuste e T. prod.): digite em <b>Tempos previstos</b>, logo abaixo. Se o tempo real passar do previsto, o número fica <b>laranja</b>.</p>` },
        perdas: { t: 'Ficha: perdas e quantidade', tela: 'ficha', antes: aba('fill'), alvo: '[data-k="qtde"]', up: 2, x: `<ul><li><b>Perda no ajuste</b> – peças perdidas até acertar a máquina.</li><li><b>Perda na produção</b> – peças perdidas durante a produção.</li><li><b>Quantidade produzida</b> – o total bom feito nesta etapa.</li></ul><p>Abaixo, o <b>contador da OP</b> mostra o que o sistema já contou, só para você conferir.</p>` },
        volumes: { t: 'Ficha: volumes e caixas', tela: 'ficha', antes: aba('fill'), alvo: '[data-k="volumes"]', up: 2, x: `<p>Preencha <b>volumes</b>, <b>peças por volume</b>, <b>excedente</b> e <b>total de caixas</b>. No Faturamento, informe também o <b>NF Nº</b>. Campos com * são obrigatórios.</p>` },
        enviar: { t: 'Ficha: enviar ao responsável', tela: 'ficha', antes: aba('fill'), alvo: '#fenv', x: `<p>Informe <b>seu nome</b>, escolha o <b>responsável</b> (padrão: Planejamento PCP) e toque em <b>Enviar ao responsável</b>.</p><p>Ele recebe a ficha e também uma <b>mensagem</b> na Comunicação. Se faltar algum dado obrigatório, o sistema avisa antes de enviar. <b>Limpar</b> apaga o rascunho.</p>` },
        recebidas: { t: 'Ficha: analisar as recebidas', tela: 'ficha', antes: aba('in'), alvo: '.fp > .card', x: `<p>Cada cartão mostra OP, máquina, quem preencheu, tempos reais x previstos, perdas e quantidade.</p>${li(['<b>Aprovar</b> – confirma a ficha; quem enviou é avisado.', '<b>Devolver</b> – pede o motivo, que o operador lê para corrigir.', '<b>Baixar planilha (CSV)</b> – exporta as fichas para o Excel.'])}<p>Fichas aguardando decisão aparecem com <b>Aguardando</b> e um número no menu.</p>` },
        enviadas: { t: 'Ficha: acompanhar o que enviei', tela: 'ficha', antes: aba('out'), alvo: '.fp > .card', x: `<p>Veja o status de cada ficha: <b>Aguardando</b>, <b>Aprovada</b> ou <b>Devolvida</b>.</p><p>Se foi devolvida, leia o <b>motivo</b> e use <b>Corrigir e reenviar</b>: os dados voltam para o formulário e a nova ficha substitui a anterior.</p>` }
    };
    const FICHA_PASSOS = {
        producao: [F.abas(true), F.posto, F.horas, F.calc, F.perdas, F.enviar, F.enviadas],
        admin: [F.abas(true), F.posto, F.horas, F.calc, F.perdas, F.enviar, F.recebidas, F.enviadas],
        qualidade: [F.abas(true), F.posto, F.volumes, F.enviar, F.recebidas, F.enviadas],
        expedicao: [F.abas(true), F.posto, F.volumes, F.enviar, F.recebidas, F.enviadas],
        planejamento: [F.abas(false), F.recebidas]
    };
    // Encaixa os passos da ficha logo depois do "Apontamento do Operador" (ou antes do fim, nas contas sem essa tela).
    Object.keys(FICHA_PASSOS).forEach(id => {
        const l = PASSOS[id]; if (!l) return; let k = -1; l.forEach((p, n) => { if (p && p.tela === 'operador') k = n });
        if (k < 0) l.forEach((p, n) => { if (p && p.tela === 'ordens') k = n });
        l.splice(k < 0 ? l.length : k + 1, 0, ...FICHA_PASSOS[id]);
    });
    const ordemComum = s => [...abertura(s), ...(PASSOS[s.id] || []), ...(s.telas.includes('comunicacao') ? [comunicacao] : []), ...fecho(s)]
        .filter(p => !(p === alertasPasso && !['producao', 'manutencao', 'planejamento', 'admin'].includes(s.id)));

    /* ---------- motor ---------- */
    let passos = [], i = 0, ativo = false, raiz = null, hl = null, timer = null, conta = null;
    const alvoDe = p => { try { let e = p.alvoFn ? p.alvoFn() : (p.alvo ? $(p.alvo) : null); for (let k = 0; e && k < (p.up || 0); k++) e = e.parentElement; return e } catch (e) { return null } };
    function fechar(marcar) { ativo = false; clearInterval(timer); document.removeEventListener('keydown', tecla, true); removeEventListener('resize', pos); raiz && raiz.remove(); raiz = null; hl = null; document.body.classList.remove('tut-on') }
    function tecla(e) {
        if (!ativo || !raiz) return;
        if (e.key === 'Escape') { e.preventDefault(); fechar() } else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.target.closest && e.target.closest('button') && e.key === 'Enter') return; e.preventDefault(); passo(1) } else if (e.key === 'ArrowLeft') { e.preventDefault(); passo(-1) }
    }
    function passo(d) { const n = i + d; if (n < 0) return; if (n >= passos.length) { fechar(); return } mostrar(n) }
    function mostrar(n) {
        i = n; const p = passos[i];
        if (p.antes) try { p.antes() } catch (e) { }   // ex.: trocar a aba da Ficha de Produção
        if (p.tela && location.hash.slice(1) !== p.tela) location.hash = p.tela;
        else if (p.tela && !$('#view').firstChild) { }
        const total = passos.length, corpo = typeof p.x === 'function' ? p.x() : p.x;
        const card = raiz.querySelector('.tut-card');
        card.innerHTML = `<div class="tut-top"><span class="tut-cnt">Passo ${i + 1} de ${total}</span><button class="tut-x" data-tc="x" aria-label="Fechar tutorial" title="Fechar tutorial">&times;</button></div>
<div class="tut-bar"><div style="width:${Math.round((i + 1) / total * 100)}%"></div></div>
<h3>${esc(p.t)}</h3><div class="tut-body">${corpo}</div>
<div class="tut-nav"><button data-tc="pular" class="tut-link">${p.fim ? 'Rever do início' : 'Pular tutorial'}</button><div class="sp"></div><button data-tc="volta" ${i === 0 ? 'disabled' : ''}>Voltar</button><button class="p" data-tc="prox">${i === total - 1 ? 'Concluir' : 'Próximo'}</button></div>`;
        card.querySelector('.tut-body').scrollTop = 0;
        card.querySelectorAll('[data-tc]').forEach(b => b.onclick = () => { const a = b.dataset.tc; if (a === 'x') fechar(); else if (a === 'volta') passo(-1); else if (a === 'prox') passo(1); else if (a === 'pular') { p.fim ? mostrar(0) : mostrar(total - 1) } });
        card.querySelector('[data-tc=prox]').focus({ preventScroll: true });
        let tent = 0, rolou = false; const aguarda = () => { pos(); const e = alvoDe(p); if (e && !rolou) { rolou = true; if (p.depois) try { p.depois() } catch (x) { } const r = e.getBoundingClientRect(); if (r.top < 70 || r.top > innerHeight * .6) e.scrollIntoView({ block: 'start', behavior: 'smooth' }) } if (!e && ++tent < 6) setTimeout(aguarda, 120) };
        setTimeout(aguarda, 140)
    }
    function pos() {
        if (!ativo || !raiz) return; const p = passos[i], e = alvoDe(p), card = raiz.querySelector('.tut-card');
        const r = e ? e.getBoundingClientRect() : null, ok = r && r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
        raiz.classList.toggle('sem', !ok);
        if (ok) { const m = 6, t = Math.max(0, r.top - m), l = Math.max(0, r.left - m), b = Math.min(innerHeight, r.bottom + m), rr = Math.min(innerWidth, r.right + m); Object.assign(hl.style, { top: t + 'px', left: l + 'px', width: (rr - l) + 'px', height: (b - t) + 'px' }); const centro = (r.top + Math.min(r.bottom, innerHeight)) / 2; card.classList.toggle('alto', centro > innerHeight * .55) } else card.classList.remove('alto')
    }
    function iniciar(s) {
        if (!s) s = setor(); if (!s) return; fechar(); conta = s; passos = ordemComum(s); ativo = true; i = 0; document.body.classList.add('tut-on');
        raiz = document.createElement('div'); raiz.className = 'tut'; raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-label', 'Tutorial do sistema'); raiz.innerHTML = '<div class="tut-hl"></div><div class="tut-card"></div>'; document.body.appendChild(raiz); hl = raiz.querySelector('.tut-hl');
        document.addEventListener('keydown', tecla, true); addEventListener('resize', pos); timer = setInterval(pos, 400); addEventListener('scroll', pos, true);
        if (innerWidth < 820 && $('#app').classList.contains('closed') === false) $('#app').classList.add('closed');
        mostrar(0)
    }
    /* tela de boas-vindas (aparece depois do login) */
    function boasVindas(s) {
        if (document.querySelector('.tut-wel')) return; const d = document.createElement('div'); d.className = 'tut-wel';
        d.innerHTML = `<div class="tut-wcard" role="dialog" aria-label="Tutorial"><h3>Conta ${esc(s.nome)}</h3><p>${esc(s.desc)}</p><p>Quer fazer um tutorial rápido para conhecer as telas, os dados e os botões desta conta?</p><label class="tut-chk"><input type="checkbox" id="tut-off"> Não mostrar ao entrar</label><div class="tut-nav"><button id="tut-no">Agora não</button><div class="sp"></div><button class="p" id="tut-go">Iniciar tutorial</button></div><small>Você pode abrir o tutorial quando quiser no botão <b>Tutorial</b> da barra superior.</small></div>`;
        document.body.appendChild(d);
        const fim = () => { try { localStorage.setItem(KEY + s.id, d.querySelector('#tut-off').checked ? '1' : '') } catch (e) { } d.remove() };
        d.querySelector('#tut-go').onclick = () => { fim(); iniciar(s) }; d.querySelector('#tut-no').onclick = fim; d.querySelector('#tut-go').focus();
        d.onkeydown = e => { if (e.key === 'Escape') fim() }
    }
    window.tutorialLogin = s => { setTimeout(() => { let off = ''; try { off = localStorage.getItem(KEY + s.id) } catch (e) { } if (!off) boasVindas(s) }, 500) };
    window.tutorialLogout = () => { fechar(); const w = document.querySelector('.tut-wel'); w && w.remove() };
    window.tutorialAbrir = () => iniciar(setor());
    const b = $('#tutb'); if (b) b.onclick = () => window.tutorialAbrir();
})();
