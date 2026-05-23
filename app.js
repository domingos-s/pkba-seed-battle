const PROTOCOL = "PKBA2";
const STORAGE_KEY = "seedBattleAcademy.games.v2";

let games = loadGames();
let currentGameId = null;
let deferredInstallPrompt = null;
const $ = (id) => document.getElementById(id);

window.addEventListener("load", () => { registerServiceWorker(); wireEvents(); renderHome(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; $("installBtn").classList.remove("hidden"); });

function wireEvents(){
  $("newGameBtn").onclick = () => $("newGameDialog").showModal();
  $("importSeedBtn").onclick = () => { $("seedError").classList.add("hidden"); $("seedInput").value=""; $("seedDialog").showModal(); };
  $("backBtn").onclick = () => showView("homeView");
  $("deleteGameBtn").onclick = deleteCurrentGame;
  $("createGameSubmit").onclick = (e) => { e.preventDefault(); createGame(); $("newGameDialog").close(); };
  $("applySeedSubmit").onclick = async (e) => { e.preventDefault(); await applySeedFromDialog(); };
  $("endTurnBtn").onclick = takeTurn;
  $("copySeedBtn").onclick = async () => { await navigator.clipboard.writeText($("seedOutput").value); toastButton($("copySeedBtn"), "Copied"); };
  $("shareSeedBtn").onclick = async () => shareSeed();
  $("installBtn").onclick = async () => { if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt=null; $("installBtn").classList.add("hidden"); } };
}

function loadGames(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveGames(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(games)); }
function showView(id){ document.querySelectorAll(".view").forEach(v=>v.classList.remove("active")); $(id).classList.add("active"); if(id==="homeView") renderHome(); }

function createGame(){
  const aName = $("creatorName").value.trim() || "Person A";
  const bName = $("opponentInputName").value.trim() || "Person B";
  const gameId = makeGameId();
  const g = { gameId, createdAt: Date.now(), turn: 0, nextPlayer: "A", localPlayer: "A", lastMessage: "", players: { A: {id:"A",name:aName}, B:{id:"B",name:bName} }, transcript: [] };
  g.stateHash = hashState(g);
  games.unshift(g); saveGames(); openGame(gameId);
}
function makeGameId(){ const words=["CHAT","THREAD","SYNC","NOTE","PULSE","NOVA","MINT","WAVE"]; return `${words[Math.floor(Math.random()*words.length)]}-${Math.floor(1000+Math.random()*9000)}`; }
function renderHome(){
  const list=$("gamesList"); list.innerHTML="";
  if(!games.length){ list.innerHTML='<div class="card"><strong>No conversations yet.</strong><p>Create one and exchange encrypted turn seeds.</p></div>'; return; }
  games.forEach(g=>{ const b=document.createElement("button"); b.className="game-tile"; b.onclick=()=>openGame(g.gameId); b.innerHTML=`<div><strong>${escapeHtml(g.gameId)} · ${escapeHtml(g.players.A.name)} ↔ ${escapeHtml(g.players.B.name)}</strong><span>Turn ${g.turn} · ${g.nextPlayer===g.localPlayer?"Your turn":"Waiting"}</span></div><span class="pill">${g.nextPlayer===g.localPlayer?"SEND":"WAIT"}</span>`; list.appendChild(b); });
}
function openGame(gameId){ currentGameId=gameId; showView("gameView"); renderGame(); }
function game(){ return games.find(g=>g.gameId===currentGameId); }

function renderGame(){
  const g=game(); if(!g) return showView("homeView");
  const self=g.players[g.localPlayer], opp=g.players[g.localPlayer === "A" ? "B" : "A"];
  $("gameTitle").textContent = g.gameId;
  $("gameSubtitle").textContent = `Turn ${g.turn} · ${g.nextPlayer === g.localPlayer ? "Your turn" : "Waiting for seed"}`;
  $("selfName").textContent=self.name; $("selfHp").textContent=`Role ${g.localPlayer}`;
  $("opponentName").textContent=opp.name; $("opponentHp").textContent=`Role ${g.localPlayer==="A"?"B":"A"}`;
  $("selfHpBar").style.width="100%"; $("opponentHpBar").style.width="100%";
  $("selfMon").innerHTML=`<div><h3>You</h3><p>Send one message per turn.</p></div>`;
  $("opponentMon").innerHTML=`<div><h3>Peer</h3><p>Conversation syncs by encrypted seeds.</p></div>`;
  $("turnStatus").textContent = g.nextPlayer === g.localPlayer ? "Compose your turn message" : "Waiting for opponent seed";
  $("endTurnBtn").disabled = g.nextPlayer !== g.localPlayer;
  $("battleMessage").disabled = g.nextPlayer !== g.localPlayer;
  renderLog(g);
  if(g.lastMessage){ $("messageBanner").textContent = `Latest incoming: “${g.lastMessage}”`; $("messageBanner").classList.remove("hidden"); } else $("messageBanner").classList.add("hidden");
}

async function takeTurn(){
  const g=game(); if(!g || g.nextPlayer!==g.localPlayer) return;
  const message = $("battleMessage").value.trim().slice(0,240);
  if(!message){ alert("Write a message first."); return; }
  const payload = { gameId:g.gameId, turn:g.turn+1, actor:g.localPlayer, prevHash:g.stateHash, action:{type:"message", text:message}, createdAt:Date.now() };
  if(payload.turn===1){ payload.setup={players:{A:{name:g.players.A.name},B:{name:g.players.B.name}}}; }
  applyPayload(g, payload, true);
  $("seedOutput").value = await encodeSeed(payload);
  $("seedOutputCard").classList.remove("hidden");
  $("battleMessage").value=""; saveGames(); renderGame();
}

function applyPayload(g,payload,locallyGenerated=false){
  if(payload.gameId !== g.gameId) throw new Error(`Seed belongs to ${payload.gameId}, not ${g.gameId}.`);
  if(payload.turn !== g.turn + 1) throw new Error(`Expected turn ${g.turn + 1}, received ${payload.turn}.`);
  if(payload.prevHash !== g.stateHash) throw new Error("Previous state hash mismatch.");
  if(payload.actor !== g.nextPlayer) throw new Error(`It is not ${payload.actor}'s turn.`);
  if(payload.action?.type !== "message" || !payload.action.text) throw new Error("Invalid message action.");
  const actor=payload.actor, defender=actor === "A" ? "B" : "A";
  g.turn = payload.turn; g.nextPlayer = defender; g.lastMessage = locallyGenerated ? "" : payload.action.text;
  g.transcript.unshift(`${g.players[actor].name}: ${payload.action.text}`);
  g.stateHash = hashState(g);
}

function renderLog(g){ $("battleLog").innerHTML = g.transcript.map(x=>`<div class="log-entry">${escapeHtml(x)}</div>`).join("") || '<div class="log-entry">No messages yet.</div>'; }

async function encodeSeed(payload){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(payload.gameId);
  const clear = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode(`${payload.gameId}|${payload.turn}|${payload.actor}`);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, clear));
  const bundle = `${toB64(iv)}.${toB64(cipher)}`;
  const checksum = fnv1a(`${payload.gameId}|${payload.turn}|${payload.actor}|${bundle}`).slice(0,8);
  return `${PROTOCOL}|${payload.gameId}|${payload.turn}|${payload.actor}|${bundle}|${checksum}`;
}

async function decodeSeed(seed){
  const parts=seed.trim().replace(/\s/g,"").split("|");
  if(parts.length!==6 || parts[0]!==PROTOCOL) throw new Error("Invalid seed format.");
  const [,gameId,turn,actor,bundle,checksum]=parts;
  const expected=fnv1a(`${gameId}|${turn}|${actor}|${bundle}`).slice(0,8);
  if(checksum!==expected) throw new Error("Seed checksum failed.");
  const [ivB64,cipherB64] = bundle.split(".");
  if(!ivB64 || !cipherB64) throw new Error("Encrypted seed bundle is malformed.");
  const key = await deriveKey(gameId);
  const aad = new TextEncoder().encode(`${gameId}|${turn}|${actor}`);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(ivB64),additionalData:aad}, key, fromB64(cipherB64));
  const payload=JSON.parse(new TextDecoder().decode(plain));
  if(payload.gameId!==gameId || String(payload.turn)!==turn || payload.actor!==actor) throw new Error("Seed header mismatch.");
  return payload;
}

async function deriveKey(gameId){
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(`pkba-seed-key|${gameId}`), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:enc.encode("pkba-v2-salt"),iterations:120000,hash:"SHA-256"}, material, {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
}

function toB64(bytes){ return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/," ").trim(); }
function fromB64(s){ const b64=s.replace(/-/g,"+").replace(/_/g,"/"); const pad="=".repeat((4-b64.length%4)%4); const bin=atob(b64+pad); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }

async function applySeedFromDialog(){
  try{ const payload=await decodeSeed($("seedInput").value); let g=games.find(x=>x.gameId===payload.gameId); if(!g&&payload.turn===1&&payload.setup) g=createGameFromSeedSetup(payload); if(!g) throw new Error(`No local conversation found for ${payload.gameId}.`); applyPayload(g,payload,false); saveGames(); $("seedDialog").close(); openGame(g.gameId); $("seedOutputCard").classList.add("hidden"); }
  catch(err){ $("seedError").textContent=err.message; $("seedError").classList.remove("hidden"); }
}

function createGameFromSeedSetup(payload){
  const a=payload.setup?.players?.A, b=payload.setup?.players?.B;
  if(!a?.name || !b?.name) throw new Error("Seed setup missing participants.");
  const g = { gameId: payload.gameId, createdAt: payload.createdAt || Date.now(), turn: 0, nextPlayer: "A", localPlayer: payload.actor === "A" ? "B" : "A", lastMessage: "", players: { A:{id:"A",name:a.name}, B:{id:"B",name:b.name} }, transcript: [] };
  g.stateHash = hashState(g); games.unshift(g); return g;
}

function hashState(g){ return fnv1a(JSON.stringify({gameId:g.gameId,turn:g.turn,nextPlayer:g.nextPlayer,players:g.players,head:g.transcript[0]||""})); }
function fnv1a(str){ let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h = Math.imul(h,0x01000193)>>>0; } return h.toString(16).padStart(8,"0"); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
async function shareSeed(){ const text=$("seedOutput").value; if(navigator.share){ await navigator.share({title:"Encrypted messaging turn seed", text}); } else { await navigator.clipboard.writeText(text); toastButton($("shareSeedBtn"), "Copied"); } }
function toastButton(btn,text){ const old=btn.textContent; btn.textContent=text; setTimeout(()=>btn.textContent=old,1200); }
function deleteCurrentGame(){ if(!currentGameId) return; if(confirm("Delete this local conversation?")){ games=games.filter(g=>g.gameId!==currentGameId); saveGames(); currentGameId=null; showView("homeView"); } }
async function registerServiceWorker(){ if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){ console.warn(e); } } }
