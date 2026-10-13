/* ===== Conquistas (desbloqueio único, recompensa em eco-pontos) ===== */
const ACHIEVEMENTS = [
  { id:'first',   name:'Primeira Reciclagem', desc:'Recicle seu primeiro resíduo',        reward:10,  test:(r,t)  => t.hits >= 1 },
  { id:'combo5',  name:'Em Sintonia',         desc:'Alcance combo x5',                    reward:20,  test:(r,t)  => r.maxCombo >= 5 },
  { id:'combo10', name:'Imparável',           desc:'Alcance combo x10',                   reward:40,  test:(r,t)  => r.maxCombo >= 10 },
  { id:'perfect', name:'Fase Perfeita',       desc:'Vença uma fase sem errar',            reward:30,  test:(r,t)  => r.win && r.errors === 0 },
  { id:'stars3',  name:'Tripla Estrela',      desc:'Conquiste 3 estrelas em uma fase',    reward:50,  test:(r,t)  => r.win && r.stars === 3 },
  { id:'hundred', name:'Centenário',          desc:'Recicle 100 resíduos no total',       reward:60,  test:(r,t)  => t.hits >= 100 },
  { id:'veteran', name:'Veterano',            desc:'Vença 4 fases diferentes',            reward:40,  test:(r,t,s)=> Object.keys(s.progress.stars).length >= 4 },
  { id:'champion',name:'Campeão Crisoverde',  desc:'Vença o Planeta Crisoverde',          reward:100, test:(r,t)  => r.win && r.levelId === 8 },
  { id:'guardian',name:'Guardião de Crisópolis',desc:'Vença a fase de Crisópolis',        reward:120, test:(r,t)  => r.win && r.levelId === 9 },
];
