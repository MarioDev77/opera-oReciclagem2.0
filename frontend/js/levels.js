/* ===== Dados das fases e materiais ===== */
const MATERIALS = {
  mat_metal_can:   { bin:'metal',   label:'Lata de metal' },
  mat_pet_bottle:  { bin:'plastic', label:'Garrafa PET' },
  mat_plastic_pack:{ bin:'plastic', label:'Embalagem plástica' },
  mat_glass_bottle:{ bin:'glass',   label:'Garrafa de vidro' },
  mat_broken_glass:{ bin:'glass',   label:'Vidro quebrado' },
  mat_paper:       { bin:'paper',   label:'Folha de papel' },
  mat_newspaper:   { bin:'paper',   label:'Jornal' },
  mat_cardboard:   { bin:'paper',   label:'Caixa de papelão' },
  mat_organic:     { bin:null, label:'Orgânico (não pegue!)' },
  mat_trash:       { bin:null, label:'Lixo comum (não pegue!)' },
};

const SPECIALS = ['item_clock','item_star','item_shield','item_magnet','item_eco'];

const LEVELS = [
  { id:1, name:'FLORESTA VIVA', desc:'Aprenda a separar os resíduos', bg:1,
    mech:['wind'], mechName:'VENTO', mechTip:'Rajadas de vento empurram os resíduos!',
    mission:{ text:'Combo x4 ou mais', reward:30, test:res => res.maxCombo>=4 },
    goal:10, time:75, spawn:[1.7,2.3], speed:[110,150], types:['mat_metal_can','mat_pet_bottle','mat_glass_bottle','mat_paper'],
    special:0.08, hazard:0, organic:0, catchW:78 },
  { id:2, name:'RIO LIMPO', desc:'O rio acelera: resíduos mais rápidos', bg:2,
    mech:['river'], mechName:'CORRENTEZA', mechTip:'As lixeiras deslizam com a correnteza!',
    mission:{ text:'Termine com no máximo 1 erro', reward:40, test:res => res.errors<=1 },
    goal:14, time:80, spawn:[1.3,1.9], speed:[150,200], types:['mat_metal_can','mat_pet_bottle','mat_glass_bottle','mat_paper','mat_newspaper'],
    special:0.10, hazard:0, organic:0.12, catchW:74 },
  { id:3, name:'CIDADE VERDE', desc:'Mais variedade e ritmo intenso', bg:3,
    mech:['rotate'], mechName:'RODÍZIO', mechTip:'A cada 5 acertos as lixeiras trocam de lugar!',
    mission:{ text:'Termine com 20s ou mais sobrando', reward:50, test:res => res.timeLeft>=20 },
    goal:18, time:85, spawn:[1.05,1.6], speed:[170,230], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_paper','mat_cardboard'],
    special:0.12, hazard:0.06, organic:0.15, catchW:72 },
  { id:4, name:'MONTANHA', desc:'Desafio de precisão: zona menor', bg:4,
    mech:['ice'], mechName:'GELO', mechTip:'Chão escorregadio e resíduos congelados: toque 2 vezes!',
    mission:{ text:'Termine sem nenhum erro', reward:60, test:res => res.errors===0 },
    goal:20, time:90, spawn:[0.95,1.5], speed:[190,250], types:['mat_metal_can','mat_pet_bottle','mat_glass_bottle','mat_broken_glass','mat_paper','mat_newspaper'],
    special:0.12, hazard:0.08, organic:0.16, catchW:52 },
  { id:5, name:'PRAIA LIMPA', desc:'Resíduos do ambiente costeiro', bg:5,
    mech:['tide'], mechName:'MARÉ', mechTip:'Ondas alagam uma lixeira: não jogue nela!',
    mission:{ text:'Pontuação média de 170+ por resíduo', reward:70, test:res => res.score>=res.goal*170 },
    goal:24, time:95, spawn:[0.85,1.35], speed:[200,265], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_paper','mat_cardboard'],
    special:0.14, hazard:0.10, organic:0.18, catchW:70 },
  { id:6, name:'DESERTO', desc:'Intervalos menores, sol escaldante', bg:6,
    mech:['mirage'], mechName:'MIRAGEM', mechTip:'Resíduos transparentes são miragens: não toque!',
    mission:{ text:'Combo x6 ou mais', reward:80, test:res => res.maxCombo>=6 },
    goal:28, time:95, spawn:[0.7,1.15], speed:[230,300], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_broken_glass','mat_paper','mat_newspaper','mat_cardboard'],
    special:0.14, hazard:0.12, organic:0.20, catchW:68 },
  { id:7, name:'METRÓPOLE SUSTENTÁVEL', desc:'Grande volume e desafios combinados', bg:7,
    mech:['chain'], mechName:'SEQUÊNCIA', mechTip:'Recicle 3 do mesmo material seguidos para bônus!',
    mission:{ text:'Complete 1 sequência de 3', reward:90, test:res => res.chains>=1 },
    goal:32, time:100, spawn:[0.6,1.0], speed:[250,330], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_broken_glass','mat_paper','mat_newspaper','mat_cardboard'],
    special:0.15, hazard:0.14, organic:0.22, catchW:66 },
  { id:8, name:'PLANETA CRISOVERDE', desc:'A batalha final pelo planeta!', bg:8,
    mech:['wind','rotate','smog'], mechName:'POLUIÇÃO', mechTip:'Vento, rodízio e poluição subindo: acertar limpa o ar!',
    mission:{ text:'Termine com a poluição abaixo de 50%', reward:120, test:res => res.smog<0.5 },
    goal:36, time:105, spawn:[0.5,0.9], speed:[280,370], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_broken_glass','mat_paper','mat_newspaper','mat_cardboard'],
    special:0.16, hazard:0.18, organic:0.25, catchW:64 },
  { id:9, name:'CRISÓPOLIS', desc:'A praça da nossa cidade precisa de você!', bg:9,
    mech:['wind','chain'], mechName:'VENTOS DE CRISÓPOLIS', mechTip:'O vento das eólicas empurra os resíduos! Recicle 3 do mesmo material seguidos para bônus!',
    mission:{ text:'Complete 2 sequências de 3', reward:110, test:res => res.chains>=2 },
    goal:34, time:100, spawn:[0.55,0.95], speed:[265,345], types:['mat_metal_can','mat_pet_bottle','mat_plastic_pack','mat_glass_bottle','mat_broken_glass','mat_paper','mat_newspaper','mat_cardboard'],
    special:0.15, hazard:0.16, organic:0.23, catchW:65 },
];

/* PROGRESSÃO DE VELOCIDADE: a fase começa devagar e acelera a cada resíduo reciclado.
   start = fração da velocidade final no 1º resíduo (0.6 = 60%); a fase 1 começa mais lenta ainda.
   Para deixar tudo mais rápido/lento, ajuste estes números. */
const RAMP = { start: 0.55, startLevel1: 0.7, end: 1.0, spawnStart: 1.5 };

const BIN_LABEL = { metal:'METAL (amarela)', plastic:'PLÁSTICO (vermelha)', glass:'VIDRO (verde)', paper:'PAPEL (azul)' };

/* curiosidades mostradas no fim de cada fase */
const FACTS = {
  1:['Reciclar papel ajuda a poupar árvores e reduz o gasto de água e de energia na fabricação.','Uma árvore adulta limpa o ar e dá abrigo a muitos animais: cuidar da floresta é cuidar de todos nós.'],
  2:['Uma garrafa PET jogada no rio pode levar centenas de anos para se decompor.','O lixo que cai no rio entope bueiros e chega ao mar, machucando peixes e outros animais.'],
  3:['O vidro pode ser reciclado muitas vezes sem perder a qualidade.','Separar o lixo em casa facilita o trabalho da coleta seletiva e dos catadores de materiais recicláveis.'],
  4:['Reciclar uma lata de alumínio economiza cerca de 95% da energia gasta para fazer uma lata nova.','Latas e embalagens metálicas devem ir limpas e sem restos de comida para serem recicladas.'],
  5:['O plástico que chega ao mar pode ferir tartarugas e aves, que confundem pedaços com alimento.','Sacolas e canudos levados pelas ondas podem poluir praias do mundo inteiro.'],
  6:['O plástico não some sozinho: o sol e o tempo o quebram em pedacinhos (microplásticos) que continuam poluindo.','Evitar o desperdício é o primeiro passo: reduzir, reutilizar e só depois reciclar.'],
  7:['Cidades sustentáveis têm coleta seletiva, áreas verdes e energia limpa trabalhando juntas.','Os 3 Rs: Reduzir o que se consome, Reutilizar o que dá e Reciclar o que sobra.'],
  8:['Restos de comida podem virar adubo pela compostagem, em vez de ir parar no lixão.','Pilhas e baterias nunca vão no lixo comum: devem ser levadas a pontos de coleta especiais.'],
  9:['Reciclar começa na nossa rua, na nossa praça e na nossa cidade: cada gesto conta!','Energia limpa, como a dos ventos, e reciclagem juntas ajudam a manter a cidade bonita e saudável.'],
};

const DIFFICULTY = {
  easy:   { label:'FÁCIL',  speed:0.85, spawn:1.25, maxErrors:5 },
  medium: { label:'MÉDIO',  speed:1.0,  spawn:1.0,  maxErrors:3 },
  hard:   { label:'DIFÍCIL',speed:1.2,  spawn:0.8,  maxErrors:2 },
};

const BIN_X = [215, 498, 782, 1065];   /* metal, plástico, vidro, papel */
const BIN_ORDER = ['metal','plastic','glass','paper'];
