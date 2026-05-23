const PROTOCOL = "PKBA2";
const STORAGE_KEY = "nightwire.operations.v1";

let operations = loadOperations();
let currentOperationId = null;
let deferredInstallPrompt = null;
const $ = (id) => document.getElementById(id);

window.addEventListener("load", () => { registerServiceWorker(); wireEvents(); renderInbox(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; $("installBtn").classList.remove("hidden"); });

function wireEvents(){
  $("newOperationBtn").onclick = () => $("newOperationDialog").showModal();
  $("importSeedBtn").onclick = () => { $("seedError").classList.add("hidden"); $("seedInput").value=""; $("seedDialog").showModal(); };
  $("backBtn").onclick = () => showView("inboxView");
  $("deleteOperationBtn").onclick = deleteCurrentOperation;
  $("createOperationSubmit").onclick = (e) => { e.preventDefault(); createOperation(); $("newOperationDialog").close(); };
  $("applySeedSubmit").onclick = async (e) => { e.preventDefault(); await applySeedFromDialog(); };
  $("sendTurnBtn").onclick = sendTurn;
  $("copySeedBtn").onclick = async () => { await navigator.clipboard.writeText($("seedOutput").value); toastButton($("copySeedBtn"), "Copied"); };
  $("shareSeedBtn").onclick = async () => shareSeed();
  $("installBtn").onclick = async () => { if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); deferredInstallPrompt=null; $("installBtn").classList.add("hidden"); } };
}

function loadOperations(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveOperations(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(operations)); }
function showView(id){ document.querySelectorAll(".view").forEach(v=>v.classList.remove("active")); $(id).classList.add("active"); if(id==="inboxView") renderInbox(); }

function createOperation(){
  const alphaName = $("agentAlphaName").value.trim() || "Agent Alpha";
  const bravoName = $("agentBravoName").value.trim() || "Agent Bravo";
  const sharedSecret = $("sharedSecretInput").value.trim();
  if(sharedSecret.length < 8){ alert("Shared secret must be at least 8 characters."); return; }
  const operationId = makeOperationId();
  const operation = { operationId, createdAt: Date.now(), turn: 0, nextAgent: "A", localAgent: "A", lastIncoming: "", sharedSecret, agents: { A: {id:"A",name:alphaName}, B:{id:"B",name:bravoName} }, transcript: [] };
  operation.stateHash = hashState(operation);
  operations.unshift(operation); saveOperations(); openOperation(operationId); $("sharedSecretInput").value="";
}
function makeOperationId(){ const words=["NIGHT","WIRE","ECHO","GHOST","VECTOR","CIPHER","FALCON","EMBER"]; return `${words[Math.floor(Math.random()*words.length)]}-${Math.floor(1000+Math.random()*9000)}`; }
function renderInbox(){
  const list=$("operationsList"); list.innerHTML="";
  if(!operations.length){ list.innerHTML='<div class="card"><strong>No operations yet.</strong><p>Start one and exchange encrypted seeds securely.</p></div>'; return; }
  operations.forEach(op=>{ const b=document.createElement("button"); b.className="thread-tile"; b.onclick=()=>openOperation(op.operationId); b.innerHTML=`<div><strong>${escapeHtml(op.operationId)} · ${escapeHtml(op.agents.A.name)} ↔ ${escapeHtml(op.agents.B.name)}</strong><span>Turn ${op.turn} · ${op.nextAgent===op.localAgent?"Your turn":"Awaiting"}</span></div><span class="pill">${op.nextAgent===op.localAgent?"SEND":"WAIT"}</span>`; list.appendChild(b); });
}
function openOperation(operationId){ currentOperationId=operationId; showView("operationView"); renderOperation(); }
function currentOperation(){ return operations.find(op=>op.operationId===currentOperationId); }

function renderOperation(){
  const op=currentOperation(); if(!op) return showView("inboxView");
  const self=op.agents[op.localAgent], peer=op.agents[op.localAgent === "A" ? "B" : "A"];
  $("operationTitle").textContent = op.operationId;
  $("operationSubtitle").textContent = `Turn ${op.turn} · ${op.nextAgent === op.localAgent ? "Your turn" : "Awaiting incoming seed"}`;
  $("selfAgentName").textContent=self.name; $("selfAgentRole").textContent=`Role ${op.localAgent}`;
  $("peerAgentName").textContent=peer.name; $("peerAgentRole").textContent=`Role ${op.localAgent==="A"?"B":"A"}`;
  $("turnStatus").textContent = op.nextAgent === op.localAgent ? "Compose encrypted relay" : "Waiting for opponent seed";
  $("sendTurnBtn").disabled = op.nextAgent !== op.localAgent;
  $("messageInput").disabled = op.nextAgent !== op.localAgent;
  renderTranscript(op);
  if(op.lastIncoming){ $("messageBanner").textContent = `Latest incoming: “${op.lastIncoming}”`; $("messageBanner").classList.remove("hidden"); } else $("messageBanner").classList.add("hidden");
}

async function sendTurn(){
  const op=currentOperation(); if(!op || op.nextAgent!==op.localAgent) return;
  const message = $("messageInput").value.trim().slice(0,240);
  if(!message){ alert("Write a message first."); return; }
  const payload = { operationId:op.operationId, turn:op.turn+1, actor:op.localAgent, prevHash:op.stateHash, action:{type:"message", text:message}, createdAt:Date.now() };
  if(payload.turn===1){ payload.setup={agents:{A:{name:op.agents.A.name},B:{name:op.agents.B.name}}}; }
  applyPayload(op, payload, true);
  $("seedOutput").value = await encodeSeed(payload, op.sharedSecret);
  $("seedOutputCard").classList.remove("hidden");
  $("messageInput").value=""; saveOperations(); renderOperation();
}

function applyPayload(op,payload,locallyGenerated=false){
  if(payload.operationId !== op.operationId) throw new Error(`Seed belongs to ${payload.operationId}, not ${op.operationId}.`);
  if(payload.turn !== op.turn + 1) throw new Error(`Expected turn ${op.turn + 1}, received ${payload.turn}.`);
  if(payload.prevHash !== op.stateHash) throw new Error("Previous state hash mismatch.");
  if(payload.actor !== op.nextAgent) throw new Error(`It is not ${payload.actor}'s turn.`);
  if(payload.action?.type !== "message" || !payload.action.text) throw new Error("Invalid message action.");
  const actor=payload.actor, receiver=actor === "A" ? "B" : "A";
  op.turn = payload.turn; op.nextAgent = receiver; op.lastIncoming = locallyGenerated ? "" : payload.action.text;
  op.transcript.unshift(`${op.agents[actor].name}: ${payload.action.text}`);
  op.stateHash = hashState(op);
}

function renderTranscript(op){ $("transcriptLog").innerHTML = op.transcript.map(x=>`<div class="log-entry">${escapeHtml(x)}</div>`).join("") || '<div class="log-entry">No messages yet.</div>'; }

async function encodeSeed(payload, sharedSecret){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(payload.operationId, sharedSecret);
  const clear = new TextEncoder().encode(JSON.stringify(payload));
  const aad = new TextEncoder().encode(`${payload.operationId}|${payload.turn}|${payload.actor}`);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, clear));
  const bundle = `${toB64(iv)}.${toB64(cipher)}`;
  const checksum = fnv1a(`${payload.operationId}|${payload.turn}|${payload.actor}|${bundle}`).slice(0,8);
  return `${PROTOCOL}|${payload.operationId}|${payload.turn}|${payload.actor}|${bundle}|${checksum}`;
}

async function decodeSeed(seed, sharedSecret){
  const parts=seed.trim().replace(/\s/g,"").split("|");
  if(parts.length!==6 || parts[0]!==PROTOCOL) throw new Error("Invalid seed format.");
  const [,operationId,turn,actor,bundle,checksum]=parts;
  const expected=fnv1a(`${operationId}|${turn}|${actor}|${bundle}`).slice(0,8);
  if(checksum!==expected) throw new Error("Seed checksum failed.");
  const [ivB64,cipherB64] = bundle.split(".");
  if(!ivB64 || !cipherB64) throw new Error("Encrypted seed bundle is malformed.");
  const key = await deriveKey(operationId, sharedSecret);
  const aad = new TextEncoder().encode(`${operationId}|${turn}|${actor}`);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(ivB64),additionalData:aad}, key, fromB64(cipherB64));
  const payload=JSON.parse(new TextDecoder().decode(plain));
  if(payload.operationId!==operationId || String(payload.turn)!==turn || payload.actor!==actor) throw new Error("Seed header mismatch.");
  return payload;
}

async function deriveKey(operationId, sharedSecret){
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", enc.encode(sharedSecret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:enc.encode(`nightwire|${operationId}`),iterations:250000,hash:"SHA-256"}, material, {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
}

function toB64(bytes){ return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/," ").trim(); }
function fromB64(s){ const b64=s.replace(/-/g,"+").replace(/_/g,"/"); const pad="=".repeat((4-b64.length%4)%4); const bin=atob(b64+pad); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }

async function applySeedFromDialog(){
  try{
    const operationId = $("importOperationId").value.trim();
    const sharedSecret = $("importSharedSecret").value.trim();
    if(!sharedSecret) throw new Error("Shared secret is required to decrypt.");
    let op=operations.find(x=>x.operationId===operationId);
    if(!op && operationId) throw new Error(`No local operation found for ${operationId}. Leave Operation ID blank to auto-detect from a turn-1 seed.`);
    const payload=await decodeSeed($("seedInput").value, sharedSecret);
    op=operations.find(x=>x.operationId===payload.operationId) || op;
    if(!op&&payload.turn===1&&payload.setup){ op=createOperationFromSeedSetup(payload, sharedSecret); }
    if(!op) throw new Error(`No local operation found for ${payload.operationId}. Import turn 1 first.`);
    if(op.sharedSecret !== sharedSecret) throw new Error("Shared secret does not match this local operation.");
    applyPayload(op,payload,false); saveOperations(); $("seedDialog").close(); openOperation(op.operationId); $("seedOutputCard").classList.add("hidden");
  } catch(err){ $("seedError").textContent=err.message; $("seedError").classList.remove("hidden"); }
}

function createOperationFromSeedSetup(payload, sharedSecret){
  const a=payload.setup?.agents?.A, b=payload.setup?.agents?.B;
  if(!a?.name || !b?.name) throw new Error("Seed setup missing participants.");
  const op = { operationId: payload.operationId, createdAt: payload.createdAt || Date.now(), turn: 0, nextAgent: "A", localAgent: payload.actor === "A" ? "B" : "A", lastIncoming: "", sharedSecret, agents: { A:{id:"A",name:a.name}, B:{id:"B",name:b.name} }, transcript: [] };
  op.stateHash = hashState(op); operations.unshift(op); return op;
}

function hashState(op){ return fnv1a(JSON.stringify({operationId:op.operationId,turn:op.turn,nextAgent:op.nextAgent,agents:op.agents,head:op.transcript[0]||""})); }
function fnv1a(str){ let h=0x811c9dc5; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h = Math.imul(h,0x01000193)>>>0; } return h.toString(16).padStart(8,"0"); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
async function shareSeed(){ const text=$("seedOutput").value; if(navigator.share){ await navigator.share({title:"Nightwire encrypted turn seed", text}); } else { await navigator.clipboard.writeText(text); toastButton($("shareSeedBtn"), "Copied"); } }
function toastButton(btn,text){ const old=btn.textContent; btn.textContent=text; setTimeout(()=>btn.textContent=old,1200); }
function deleteCurrentOperation(){ if(!currentOperationId) return; if(confirm("Delete this local operation?")){ operations=operations.filter(op=>op.operationId!==currentOperationId); saveOperations(); currentOperationId=null; showView("inboxView"); } }
async function registerServiceWorker(){ if("serviceWorker" in navigator){ try{ await navigator.serviceWorker.register("sw.js"); }catch(e){ console.warn(e); } } }
