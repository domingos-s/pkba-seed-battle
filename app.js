const PROTOCOL = "PKBA1";
const STORAGE_KEY = "seedBattleAcademy.games.v1";
const creatures = {
  voltkit: {
    id: "voltkit", name: "Voltkit", type: "Spark", maxHp: 72, img: "assets/creature-voltkit.svg",
    moves: [
      { id: "zap", name: "Static Zap", damage: 14, text: "Reliable spark damage." },
      { id: "bolt", name: "Lucky Bolt", damage: 24, text: "50% chance for +12 damage.", coin: true }
    ]
  },
  embercub: {
    id: "embercub", name: "Embercub", type: "Flame", maxHp: 78, img: "assets/creature-embercub.svg",
    moves: [
      { id: "swipe", name: "Cinder Swipe", damage: 16, text: "Fast claw attack." },
      { id: "flare", name: "Big Flare", damage: 26, text: "50% chance to miss.", risky: true }
    ]
  },
  sproutle: {
    id: "sproutle", name: "Sproutle", type: "Leaf", maxHp: 84, img: "assets/creature-sproutle.svg",
    moves: [
      { id: "vine", name: "Vine Tap", damage: 13, text: "Light damage and heal 4." , heal: 4},
      { id: "bloom", name: "Bloom Bash", damage: 21, text: "Solid nature strike." }
    ]
  }
};
let games = loadGames();
let currentGameId = null;
let selectedMoveId = null;
let deferredInstallPrompt = null;
const $ = (id) => document.getElementById(id);

window.addEventListener("load", () => {
  registerServiceWorker();
  wireEvents();
  renderHome();
});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; $("installBtn").classList.remove("hidden"); });

function wireEvents(){
  $("newGameBtn").onclick = () => $("newGameDialog").showModal();
  $("importSeedBtn").onclick = () => { $("seedError").classList.add("hidden"); $("seedInput").value=""; $("seedDialog").showModal(); };
  $("backBtn").onclick = () => showView("homeView");
  $("deleteGameBtn").onclick = deleteCurrentGame;
  $("createGameSubmit").onclick = (e) => { e.preventDefault(); createGame(); $("newGameDialog").close(); };
  $("applySeedSubmit").onclick = (e) => { e.preventDefault(); applySeedFromDialog(); };
  $("endTurnBtn").onclick = takeTurn;
  $("copySeedBtn").onclick = async () => { await navigator.clipboard.writeText($("seedOutput").value); toastButton($("copySeedBtn"), "Copied"); };
  $("shareSeedBtn").onclick = async () => shareSeed();
  $("installBtn").onclick = async () => { if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt=null; $("installBtn").classList.add("hidden"); } };
}
function loadGames(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveGames(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(games)); }
function showView(id){ document.querySelectorAll(".view").forEach(v=>v.classList.remove("active")); $(id).classList.add("active"); if(id==="homeView") renderHome(); }
function createGame(){
  const aName = $("creatorName").value.trim() || "Player A";
  const bName = $("opponentInputName").value.trim() || "Player B";
  const aMon = $("starterSelect").value;
  const bMon = $("opponentStarterSelect").value;
  const gameId = makeGameId();
  const game = {
    gameId, createdAt: Date.now(), turn: 0, nextPlayer: "A", localPlayer: "A", lastMessage: "",
    players: { A: makePlayer("A", aName, aMon), B: makePlayer("B", bName, bMon) }, log: [`Game ${gameId} started. ${aName} goes first.`]
  };
  game.stateHash = hashState(game);
  games.unshift(game); saveGames(); openGame(gameId);
}
function makePlayer(id,name,creatureId){ const c=creatures[creatureId]; return {id,name,creatureId,hp:c.maxHp}; }
function makeGameId(){ const words=["VOLT","EMBER","SPROUT","BADGE","QUEST","ARENA","NOVA","MIST"]; return `${words[Math.floor(Math.random()*words.length)]}-${Math.floor(1000+Math.random()*9000)}`; }
function renderHome(){
  const list=$("gamesList"); list.innerHTML="";
  if(!games.length){ list.innerHTML='<div class="card"><strong>No active games yet.</strong><p>Create a new battle to generate your first game state.</p></div>'; return; }
  games.forEach(g=>{
    const b=document.createElement("button"); b.className="game-tile"; b.onclick=()=>openGame(g.gameId);
    b.innerHTML=`<div><strong>${escapeHtml(g.gameId)} · ${escapeHtml(g.players.A.name)} vs ${escapeHtml(g.players.B.name)}</strong><span>Turn ${g.turn} · ${g.nextPlayer === g.localPlayer ? "Your turn" : "Waiting for opponent"}</span></div><span class="pill">${g.nextPlayer === g.localPlayer ? "PLAY" : "WAIT"}</span>`;
    list.appendChild(b);
  });
}
function openGame(gameId){ currentGameId=gameId; selectedMoveId=null; showView("gameView"); renderGame(); }
function game(){ return games.find(g=>g.gameId===currentGameId); }
function renderGame(){
  const g=game(); if(!g) return showView("homeView");
  const self=g.players[g.localPlayer], opp=g.players[g.localPlayer === "A" ? "B" : "A"];
  $("gameTitle").textContent = `${g.gameId}`;
  $("gameSubtitle").textContent = `Turn ${g.turn} · ${g.nextPlayer === g.localPlayer ? "Your turn" : "Waiting for opponent"}`;
  renderPlayer("self", self); renderPlayer("opponent", opp);
  $("turnStatus").textContent = g.nextPlayer === g.localPlayer ? "Choose your move" : "Waiting for opponent seed";
  $("endTurnBtn").disabled = g.nextPlayer !== g.localPlayer || isGameOver(g);
  $("battleMessage").disabled = g.nextPlayer !== g.localPlayer || isGameOver(g);
  renderMoves(self, g.nextPlayer === g.localPlayer && !isGameOver(g));
  renderLog(g);
  if(g.lastMessage){ $("messageBanner").textContent = `Opponent message: “${g.lastMessage}”`; $("messageBanner").classList.remove("hidden"); } else $("messageBanner").classList.add("hidden");
}
function renderPlayer(prefix,p){
  const c=creatures[p.creatureId];
  $(`${prefix}Name`).textContent = p.name;
  $(`${prefix}Hp`).textContent = `${Math.max(0,p.hp)} / ${c.maxHp} HP`;
  $(`${prefix}HpBar`).style.width = `${Math.max(0, Math.round((p.hp/c.maxHp)*100))}%`;
  $(`${prefix}Mon`).innerHTML = `<img src="${c.img}" alt="${c.name}"><div><h3>${c.name}</h3><p>${c.type} type · ${p.hp <= 0 ? "Knocked out" : "Ready"}</p></div>`;
}
function renderMoves(player, enabled){
  const wrap=$("moveButtons"); wrap.innerHTML=""; const c=creatures[player.creatureId];
  c.moves.forEach(m=>{ const btn=document.createElement("button"); btn.className=`move-btn ${selectedMoveId===m.id?'selected':''}`; btn.disabled=!enabled; btn.onclick=()=>{selectedMoveId=m.id; renderGame();}; btn.innerHTML=`<strong>${m.name} · ${m.damage}</strong><span>${m.text}</span>`; wrap.appendChild(btn); });
}
function takeTurn(){
  const g=game(); if(!g || g.nextPlayer!==g.localPlayer || isGameOver(g)) return;
  if(!selectedMoveId){ alert("Choose a move first."); return; }
  const actor=g.localPlayer, defender=actor === "A" ? "B" : "A";
  const move = creatures[g.players[actor].creatureId].moves.find(m=>m.id===selectedMoveId);
  const payload = { gameId:g.gameId, turn:g.turn+1, actor, prevHash:g.stateHash, action:{type:"attack", moveId:selectedMoveId}, rngSeed:cryptoRandom(), message:$("battleMessage").value.trim().slice(0,120), createdAt:Date.now() };
  applyPayload(g, payload, true);
  const seed = encodeSeed(payload);
  $("seedOutput").value = seed;
  $("seedOutputCard").classList.remove("hidden");
  $("battleMessage").value=""; selectedMoveId=null; saveGames(); renderGame();
}
function applyPayload(g,payload, locallyGenerated=false){
  if(payload.gameId !== g.gameId) throw new Error(`Seed belongs to ${payload.gameId}, not ${g.gameId}.`);
  if(payload.turn !== g.turn + 1) throw new Error(`Expected turn ${g.turn + 1}, received ${payload.turn}.`);
  if(payload.prevHash !== g.stateHash) throw new Error("Previous state hash does not match. This seed is out of order or the local state differs.");
  if(payload.actor !== g.nextPlayer) throw new Error(`It is not ${payload.actor}'s turn.`);
  const actor=payload.actor, defender=actor === "A" ? "B" : "A";
  const move = creatures[g.players[actor].creatureId].moves.find(m=>m.id===payload.action.moveId);
  if(!move) throw new Error("Unknown move in seed.");
  const rng = seededRandom(`${payload.rngSeed}|${payload.gameId}|${payload.turn}|${move.id}`);
  let damage = move.damage; let detail="";
  if(move.coin){ const heads=rng()>0.5; if(heads){ damage += 12; detail = " Coin flip: heads, bonus damage.";} else detail = " Coin flip: tails."; }
  if(move.risky){ const hit=rng()>0.5; if(!hit){ damage=0; detail=" The attack missed.";} else detail=" The attack landed."; }
  g.players[defender].hp = Math.max(0, g.players[defender].hp - damage);
  if(move.heal){ g.players[actor].hp = Math.min(creatures[g.players[actor].creatureId].maxHp, g.players[actor].hp + move.heal); detail += ` ${creatures[g.players[actor].creatureId].name} healed ${move.heal}.`; }
  g.turn = payload.turn; g.nextPlayer = defender; g.lastMessage = locallyGenerated ? "" : (payload.message || "");
  g.log.unshift(`${g.players[actor].name}'s ${creatures[g.players[actor].creatureId].name} used ${move.name} for ${damage} damage.${detail}`);
  if(payload.message) g.log.unshift(`${g.players[actor].name} says: “${payload.message}”`);
  if(g.players[defender].hp <= 0) g.log.unshift(`${g.players[defender].name}'s ${creatures[g.players[defender].creatureId].name} was knocked out. ${g.players[actor].name} wins!`);
  g.stateHash = hashState(g);
}
function renderLog(g){ $("battleLog").innerHTML = g.log.map(x=>`<div class="log-entry">${escapeHtml(x)}</div>`).join(""); }
function isGameOver(g){ return g.players.A.hp<=0 || g.players.B.hp<=0; }
function encodeSeed(payload){
  const json = JSON.stringify(payload); const b64 = btoa(unescape(encodeURIComponent(json))).replace(/=/g,"");
  const checksum = fnv1a(`${payload.gameId}|${payload.turn}|${payload.actor}|${b64}`).slice(0,6);
  return `${PROTOCOL}|${payload.gameId}|${payload.turn}|${payload.actor}|${b64}|${checksum}`;
}
function decodeSeed(seed){
  const parts=seed.trim().replace(/\s/g,"").split("|");
  if(parts.length!==6 || parts[0]!==PROTOCOL) throw new Error("Invalid seed format.");
  const [,gameId,turn,actor,b64,checksum]=parts;
  const expected=fnv1a(`${gameId}|${turn}|${actor}|${b64}`).slice(0,6);
  if(checksum!==expected) throw new Error("Seed checksum failed. Check for copy/paste errors.");
  const padded=b64 + "=".repeat((4 - b64.length % 4) % 4);
  const payload=JSON.parse(decodeURIComponent(escape(atob(padded))));
  if(payload.gameId!==gameId || String(payload.turn)!==turn || payload.actor!==actor) throw new Error("Seed header does not match payload.");
  return payload;
}
function applySeedFromDialog(){
  try{
    const payload=decodeSeed($("seedInput").value);
    let g=games.find(x=>x.gameId===payload.gameId);
    if(!g) throw new Error(`No local game found for Game ID ${payload.gameId}. Create/import that game first.`);
    applyPayload(g,payload,false); saveGames(); $("seedDialog").close(); openGame(g.gameId); $("seedOutputCard").classList.add("hidden");
  }catch(err){ $("seedError").textContent=err.message; $("seedError").classList.remove("hidden"); }
}
function hashState(g){
  const canonical = JSON.stringify({gameId:g.gameId,turn:g.turn,nextPlayer:g.nextPlayer,players:g.players,logHead:g.log[0]||""});
  return fnv1a(canonical);
}
function fnv1a(str){ let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h = Math.imul(h,0x01000193)>>>0; } return h.toString(16).padStart(8,"0"); }
function seededRandom(seed){ let h=parseInt(fnv1a(seed),16)||1; return function(){ h += 0x6D2B79F5; let t=h; t=Math.imul(t ^ t>>>15, t|1); t^=t+Math.imul(t ^ t>>>7, t|61); return ((t ^ t>>>14)>>>0)/4294967296; } }
function cryptoRandom(){ const a=new Uint32Array(2); crypto.getRandomValues(a); return [...a].map(n=>n.toString(36)).join(""); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
async function shareSeed(){ const text=$("seedOutput").value; if(navigator.share){ await navigator.share({title:"Seed Battle Academy turn seed", text}); } else { await navigator.clipboard.writeText(text); toastButton($("shareSeedBtn"), "Copied"); } }
function toastButton(btn,text){ const old=btn.textContent; btn.textContent=text; setTimeout(()=>btn.textContent=old,1200); }
function deleteCurrentGame(){ if(!currentGameId) return; if(confirm("Delete this local game?")){ games=games.filter(g=>g.gameId!==currentGameId); saveGames(); currentGameId=null; showView("homeView"); } }
async function registerServiceWorker(){ if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){ console.warn(e); } } }
