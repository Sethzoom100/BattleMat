import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';

// --- CONFIGURATION ---
const API_URL = 'https://battlemat.onrender.com';
const socket = io(API_URL);

// --- ASSETS ---
const MONARCH_CARD = { name: "The Monarch", image: "https://cards.scryfall.io/large/front/4/0/40b79918-22a7-4fff-82a6-8ebfe6e87185.jpg" };
const INITIATIVE_CARD = { name: "Undercity // The Initiative", image: "https://cards.scryfall.io/large/back/2/c/2c65185b-6cf0-451d-985e-56aa45d9a57d.jpg", backImage: "https://cards.scryfall.io/large/front/2/c/2c65185b-6cf0-451d-985e-56aa45d9a57d.jpg" };

const getRoomId = () => {
  const path = window.location.pathname.substring(1); 
  if (path) return path;
  const newId = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
  window.history.pushState({}, '', '/' + newId); 
  return newId;
};
const ROOM_ID = getRoomId();

// --- API HELPERS ---
const fetchCardData = async (cardName) => {
  if (!cardName) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const data = await res.json();
    const getImages = (face) => ({ normal: face.image_uris?.normal, artCrop: face.image_uris?.art_crop });
    if (data.card_faces && data.card_faces.length > 1 && data.card_faces[0].image_uris) {
        const front = getImages(data.card_faces[0]);
        const back = getImages(data.card_faces[1]);
        return { name: data.name, image: front.normal, backImage: back.normal, artCrop: front.artCrop };
    }
    if (data.image_uris) return { name: data.name, image: data.image_uris.normal, artCrop: data.image_uris.art_crop };
    return null;
  } catch (err) { return null; }
};

const fetchCommanderAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const query = `name:/^${text}/ (t:legendary (t:creature OR t:vehicle) OR t:background) game:paper`;
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.data) return data.data.map(card => card.name).slice(0, 10);
    return [];
  } catch (err) { return []; }
};
const fetchAnyCardAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data.data || [];
  } catch (err) { return []; }
};

// --- AUTH MODAL ---
const AuthModal = ({ onClose, onLogin }) => {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const handleSubmit = async () => {
        const endpoint = isRegister ? '/register' : '/login';
        try {
            const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg);
            if (isRegister) { setIsRegister(false); alert("Account created!"); } 
            else { localStorage.setItem('battlemat_token', data.token); localStorage.setItem('battlemat_user', JSON.stringify(data.user)); onLogin(data.user, data.token); onClose(); }
        } catch (err) { alert(err.message); }
    };
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#222', padding: '30px', borderRadius: '10px', width: '300px', border: '1px solid #444', color: 'white', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h2 style={{margin: 0, textAlign: 'center', color: '#c4b5fd'}}>{isRegister ? "Create Account" : "Login"}</h2>
                <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{padding: '10px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '5px'}} />
                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{padding: '10px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '5px'}} />
                <button onClick={handleSubmit} style={{padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'}}>{isRegister ? "Register" : "Login"}</button>
                <div style={{fontSize: '12px', textAlign: 'center', cursor: 'pointer', color: '#aaa'}} onClick={() => setIsRegister(!isRegister)}>{isRegister ? "Have account? Login" : "No account? Create one"}</div>
                <button onClick={onClose} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px'}}>Cancel</button>
            </div>
        </div>
    );
};

// --- GROUPS MODAL ---
const GroupsModal = ({ user, onClose, onUpdateUser }) => {
    const [view, setView] = useState('list');
    const [newGroupName, setNewGroupName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [groupDetails, setGroupDetails] = useState(null);
    const [lbTimeframe, setLbTimeframe] = useState('all');
    const [lbType, setLbType] = useState('players');
    const [leaderboardData, setLeaderboardData] = useState([]);
    const handleCreateGroup = async () => {
        if(!newGroupName) return;
        try {
            const res = await fetch(`${API_URL}/create-group`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, name: newGroupName }) });
            const updatedGroups = await res.json();
            onUpdateUser({...user, groups: updatedGroups});
            setNewGroupName("");
        } catch (err) { alert("Error creating group"); }
    };
    const handleJoinGroup = async () => {
        if(!joinCode) return;
        try {
            const res = await fetch(`${API_URL}/join-group`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, code: joinCode.toUpperCase() }) });
            if(!res.ok) throw new Error("Invalid Code or Already Joined");
            const updatedGroups = await res.json();
            onUpdateUser({...user, groups: updatedGroups});
            setJoinCode("");
        } catch (err) { alert(err.message); }
    };
    const openGroupDetail = async (group) => {
        try {
            const res = await fetch(`${API_URL}/group-details/${group._id}`);
            const details = await res.json();
            setGroupDetails(details);
            calculateLeaderboard(details, 'players', 'all');
            setView('detail');
        } catch(err) { console.error(err); }
    };
    const calculateLeaderboard = (details, type, time) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        let data = [];
        if (type === 'players') {
            data = details.members.map(m => {
                let wins = 0, games = 0;
                if (time === 'all') { wins = m.stats.wins; games = m.stats.gamesPlayed; } 
                else {
                    const monthlyMatches = (m.matchHistory || []).filter(match => { const d = new Date(match.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; });
                    games = monthlyMatches.length; wins = monthlyMatches.filter(match => match.result === 'win').length;
                }
                return { name: m.username, wins, games, winRate: games > 0 ? (wins/games) : 0 };
            });
        } else {
            let allDecks = [];
            details.members.forEach(m => {
                m.decks.forEach(d => {
                    let wins = 0, games = 0;
                    if (time === 'all') { wins = d.wins; games = d.wins + d.losses; } 
                    else {
                        const deckMatches = (m.matchHistory || []).filter(match => { const date = new Date(match.date); return match.deckId === d._id && date.getMonth() === currentMonth && date.getFullYear() === currentYear; });
                        games = deckMatches.length; wins = deckMatches.filter(match => match.result === 'win').length;
                    }
                    if (games > 0) allDecks.push({ name: d.name, owner: m.username, wins, games, winRate: (wins/games) });
                });
            });
            data = allDecks;
        }
        data.sort((a,b) => b.winRate - a.winRate || b.wins - a.wins);
        setLeaderboardData(data);
    };
    const copyInvite = () => { if(groupDetails) { navigator.clipboard.writeText(groupDetails.code); alert("Copied: " + groupDetails.code); } };
    const isAdmin = groupDetails && groupDetails.admins && groupDetails.admins.includes(user.id);
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111', zIndex: 100000, overflowY: 'auto', padding: '40px', color: 'white' }}>
            <button onClick={onClose} style={{position: 'absolute', top: '20px', right: '30px', fontSize: '24px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}>✕ Close</button>
            {view === 'list' ? (
                <>
                    <h1 style={{color: '#c4b5fd'}}>My Groups</h1>
                    <div style={{display:'flex', gap:'20px', marginBottom:'30px'}}>
                        <div style={{background: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444', flex: 1}}>
                            <h3>Create Group</h3>
                            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} style={inputStyle} />
                            <button onClick={handleCreateGroup}>Create</button>
                        </div>
                        <div style={{background: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444', flex: 1}}>
                            <h3>Join Group</h3>
                            <input value={joinCode} onChange={e => setJoinCode(e.target.value)} style={inputStyle} />
                            <button onClick={handleJoinGroup}>Join</button>
                        </div>
                    </div>
                    {user.groups?.map(g => ( <div key={g._id} onClick={() => openGroupDetail(g)} style={{background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px', cursor:'pointer', marginBottom: '10px'}}>{g.name}</div> ))}
                </>
            ) : (
                groupDetails && (
                    <div>
                        <button onClick={() => setView('list')}>← Back</button>
                        <h1>{groupDetails.name}</h1>
                        <p>Code: {groupDetails.code} <button onClick={copyInvite}>Copy</button></p>
                        <h3>Members</h3>
                        {groupDetails.members.map(m => ( <div key={m._id}>{m.username}</div> ))}
                    </div>
                )
            )}
        </div>
    );
};

// --- FINISH GAME MODAL ---
const FinishGameModal = ({ players, onFinish, onClose }) => {
    const [winnerId, setWinnerId] = useState(null);
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#222', padding: '30px', borderRadius: '10px', width: '350px', border: '1px solid #444', color: 'white', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h2 style={{margin: 0, textAlign: 'center', color: '#facc15'}}>Finish Game</h2>
                <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #333', borderRadius: '5px'}}>
                    {players.map(p => (
                        <div key={p.id} onClick={() => setWinnerId(p.id)} style={{ padding: '10px', cursor: 'pointer', background: winnerId === p.id ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
                            {p.username || `Player ${p.id.substr(0,4)}`}
                        </div>
                    ))}
                </div>
                <button onClick={() => onFinish(winnerId)} disabled={!winnerId} style={{padding: '12px', background: winnerId ? '#2563eb' : '#444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'}}>🏆 Confirm Winner</button>
                <button onClick={onClose} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer'}}>Cancel</button>
            </div>
        </div>
    );
};

// --- DECK SELECTION MODAL ---
const DeckSelectionModal = ({ user, token, onConfirm, onOpenProfile, onUpdateUser }) => {
    const [selectedDeckId, setSelectedDeckId] = useState("");
    const handleConfirm = async () => {
        let deckData = null;
        if (user && user.decks && selectedDeckId) {
            const selected = user.decks.find(d => d._id === selectedDeckId);
            if (selected) {
                const names = selected.name.split(' + ');
                const primary = await fetchCardData(names[0]);
                const partner = names.length > 1 ? await fetchCardData(names[1]) : null;
                deckData = { primary, partner };
            }
        }
        onConfirm(deckData, false, selectedDeckId);
    };
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#222', padding: '30px', borderRadius: '10px', width: '350px', border: '1px solid #444', color: 'white', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2>Select Deck</h2>
                <select value={selectedDeckId} onChange={e => setSelectedDeckId(e.target.value)} style={inputStyle}>
                    <option value="">-- No Deck --</option>
                    {user?.decks?.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
                <button onClick={handleConfirm}>✅ Confirm</button>
            </div>
        </div>
    );
};

// --- PROFILE SCREEN ---
const ProfileScreen = ({ user, token, onClose, onUpdateUser }) => {
    const [cmdrName, setCmdrName] = useState("");
    const handleAddDeck = async () => {
        const cardData = await fetchCardData(cmdrName);
        const image = cardData?.artCrop || cardData?.image || "";
        try {
            const res = await fetch(`${API_URL}/add-deck`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ userId: user.id, name: cmdrName, commander: cmdrName, image }) });
            const updatedDecks = await res.json();
            onUpdateUser({ ...user, decks: updatedDecks });
            setCmdrName("");
        } catch (err) { console.error(err); }
    };
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111', zIndex: 100000, overflowY: 'auto', padding: '40px', color: 'white' }}>
            <button onClick={onClose} style={{position: 'absolute', top: '20px', right: '30px', fontSize: '24px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}>✕</button>
            <h1>{user.username}'s Profile</h1>
            <input value={cmdrName} onChange={e => setCmdrName(e.target.value)} style={inputStyle} />
            <button onClick={handleAddDeck}>Add Deck</button>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginTop: '20px'}}>
                {user.decks?.map(deck => ( <div key={deck._id} style={{background: '#1a1a1a', padding: '10px', borderRadius: '8px'}}><img src={deck.image} alt={deck.name} style={{width: '100%'}} /><p>{deck.name}</p></div> ))}
            </div>
        </div>
    );
};

// --- LOBBY ---
const Lobby = ({ onJoin, user, token, onOpenAuth, onOpenProfile, onSelectDeck, selectedDeckId, onUpdateUser, onLogout, onOpenGroups }) => {
  const [step, setStep] = useState('mode'); 
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [previewStream, setPreviewStream] = useState(null);
  const videoRef = useRef(null);
  useEffect(() => {
    if (step === 'setup') { navigator.mediaDevices.enumerateDevices().then(devices => { const videos = devices.filter(d => d.kind === 'videoinput'); setVideoDevices(videos); if (videos.length > 0) setSelectedDeviceId(videos[0].deviceId); }); }
  }, [step]);
  useEffect(() => {
    if (step === 'setup' && selectedDeviceId) {
      navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: selectedDeviceId } }, audio: true }).then(stream => { setPreviewStream(stream); if (videoRef.current) videoRef.current.srcObject = stream; });
    }
  }, [step, selectedDeviceId]);
  if (step === 'mode') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', color: 'white' }}>
        <h1>BattleMat</h1>
        {user ? (
            <div style={{textAlign: 'center', marginBottom: '30px'}}>
                <button onClick={onLogout}>Logout</button>
                <h3>Welcome, {user.username}</h3>
                <button onClick={onOpenProfile}>Profile</button>
                <button onClick={onOpenGroups}>Groups</button>
            </div>
        ) : ( <button onClick={onOpenAuth}>Login</button> )}
        <button onClick={() => user && setStep('setup')} disabled={!user}>Play</button>
        <button onClick={() => onJoin(true, null)}>Spectate</button>
      </div>
    );
  }
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', color: 'white' }}>
      <video ref={videoRef} autoPlay muted style={{ width: '640px', height: '360px', background: '#000', borderRadius: '8px' }} />
      <select value={selectedDeckId} onChange={e => onSelectDeck(e.target.value)} style={inputStyle}>
        <option value="">-- No Deck --</option>
        {user?.decks?.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
      </select>
      <button onClick={() => onJoin(false, previewStream, null)}>✅ Join Battle</button>
    </div>
  );
};

// --- DRAGGABLE TOKEN ---
const DraggableToken = ({ token, isMyStream, onUpdate, onRemove, onInspect, onOpenMenu }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: token.x, y: token.y });
  const dragOffset = useRef({ x: 0, y: 0 });
  const parentRect = useRef(null);
  const hasMoved = useRef(false);
  const handleMouseDown = (e) => {
    if (!isMyStream || e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true); hasMoved.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - (rect.left + rect.width/2), y: e.clientY - (rect.top + rect.height/2) };
    parentRect.current = e.currentTarget.offsetParent.getBoundingClientRect();
  };
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !parentRect.current) return;
    hasMoved.current = true;
    const pctX = ((e.clientX - parentRect.current.left - dragOffset.current.x) / parentRect.current.width) * 100;
    const pctY = ((e.clientY - parentRect.current.top - dragOffset.current.y) / parentRect.current.height) * 100;
    setPos({ x: pctX, y: pctY });
  }, [isDragging]);
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (hasMoved.current) onUpdate({ ...token, x: pos.x, y: pos.y });
  }, [isDragging, pos, onUpdate, token]);
  useEffect(() => {
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, handleMouseMove, handleMouseUp]);
  return (
    <div onMouseDown={handleMouseDown} onClick={() => !hasMoved.current && onUpdate({...token, isTapped: !token.isTapped})} style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: '10%', zIndex: 1000, transform: `translate(-50%, -50%) ${token.isTapped ? 'rotate(90deg)' : 'rotate(0deg)'}` }}>
        <img src={token.image} alt="token" style={{ width: '100%', borderRadius: '4px' }} draggable="false" />
    </div>
  );
};

// --- VIDEO CONTAINER ---
const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, isActiveTurn }) => {
  const videoRef = useRef();
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);
  const life = playerData?.life ?? 40;
  return (
    <div style={{ width, height, padding: '4px' }}>
      <div style={{ width: '100%', height: '100%', position: 'relative', background: 'black', borderRadius: '8px', overflow: 'hidden', border: isActiveTurn ? '2px solid #facc15' : '1px solid #333' }}>
        <video ref={videoRef} autoPlay muted={true} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 30, background: 'rgba(0,0,0,0.7)', borderRadius: '30px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isMyStream && <button onClick={() => updateGame(userId, { life: life - 1 })} style={roundBtnLarge}>-</button>}
            <span style={{ fontSize: '28px', fontWeight: 'bold', color: 'white' }}>{life}</span>
            {isMyStream && <button onClick={() => updateGame(userId, { life: life + 1 })} style={roundBtnLarge}>+</button>}
        </div>
        <div style={{ position: 'absolute', bottom: '0', left: '0', width: '100%', background: 'rgba(0,0,0,0.7)', padding: '4px 10px', color: 'white', fontSize: '12px', textAlign: 'center' }}>
            {playerData?.username || "Player"}
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP ---
function App() {
  const [hasJoined, setHasJoined] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [myStream, setMyStream] = useState(null);
  const [myId, setMyId] = useState(null);
  const [peers, setPeers] = useState([]); 
  const [gameState, setGameState] = useState({});
  const [seatOrder, setSeatOrder] = useState([]); 
  const [turnState, setTurnState] = useState({ activeId: null, count: 1 });
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [hostId, setHostId] = useState(null);

  // ANTI-DESYNC: Keep a ref of state to avoid stale closures
  const gameStateRef = useRef({});
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const isHost = myId === hostId;

  // --- ANTI-DESYNC: Atomic Updates ---
  const handleUpdateGame = useCallback((targetUserId, updates) => {
    setGameState(prev => ({
        ...prev,
        [targetUserId]: { ...(prev[targetUserId] || {}), ...updates }
    }));
    // Only send the changed key (delta) to prevent overwriting other players
    socket.emit('update-game-state', { userId: targetUserId, data: updates });
  }, []);

  useEffect(() => {
    socket.on('sync-state', (data) => { if (data.gameState) setGameState(data.gameState); if (data.turnState) setTurnState(data.turnState); });
    socket.on('game-state-updated', ({ userId, data }) => { setGameState(prev => ({ ...prev, [userId]: { ...(prev[userId] || {}), ...data } })); });
    socket.on('host-update', (id) => setHostId(id));
    socket.on('user-connected', (id) => setSeatOrder(prev => prev.includes(id) ? prev : [...prev, id]));
    socket.on('user-disconnected', (id) => { setSeatOrder(prev => prev.filter(sid => sid !== id)); setGameState(prev => { const n = {...prev}; delete n[id]; return n; }); });

    // ANTI-DESYNC: Host broadcast pulse every 15s to correct drifts
    const pulse = setInterval(() => {
        if (isHost && myId && gameStateRef.current[myId]) {
            socket.emit('update-game-state', { userId: myId, data: gameStateRef.current[myId] });
        }
    }, 15000);

    return () => { socket.off('sync-state'); socket.off('game-state-updated'); socket.off('host-update'); clearInterval(pulse); };
  }, [isHost, myId]);

  const joinGame = (spectator, stream, deckData) => {
    setHasJoined(true); setIsSpectator(spectator);
    const peer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    peer.on('open', id => {
        setMyId(id);
        const initial = { life: 40, username: user?.username || "Guest", commanders: deckData || {} };
        setGameState(prev => ({ ...prev, [id]: initial }));
        socket.emit('join-room', ROOM_ID, id, spectator);
        if(!spectator) { setSeatOrder(prev => [...prev, id]); handleUpdateGame(id, initial); }
    });
    setMyStream(stream);
  };

  return (
    <div style={{ background: '#111', minHeight: '100vh', color: 'white' }}>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLogin={(u, t) => {setUser(u); setToken(t);}} />}
        {showProfile && <ProfileScreen user={user} token={token} onClose={() => setShowProfile(false)} onUpdateUser={setUser} />}
        {showGroups && <GroupsModal user={user} onClose={() => setShowGroups(false)} onUpdateUser={setUser} />}
        {showFinishModal && <FinishGameModal players={seatOrder.map(id => ({id, username: gameState[id]?.username}))} onClose={() => setShowFinishModal(false)} />}
        
        {!hasJoined ? (
            <Lobby onJoin={joinGame} user={user} token={token} onOpenAuth={() => setShowAuthModal(true)} onOpenProfile={() => setShowProfile(true)} onSelectDeck={setSelectedDeckId} selectedDeckId={selectedDeckId} onLogout={() => setUser(null)} onOpenGroups={() => setShowGroups(true)} />
        ) : (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '40px', background: '#000', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between' }}>
                    <span>TURN {turnState.count}</span>
                    <button onClick={() => setHasJoined(false)}>Lobby</button>
                </div>
                <div style={{ flexGrow: 1, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center' }}>
                    {seatOrder.map(sid => (
                        <VideoContainer key={sid} userId={sid} playerData={gameState[sid]} isMyStream={sid === myId} updateGame={handleUpdateGame} width={400} height={300} isActiveTurn={turnState.activeId === sid} />
                    ))}
                </div>
            </div>
        )}
    </div>
  );
}

const inputStyle = { padding: '8px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' };
const roundBtnLarge = { background: '#555', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', fontSize: '16px' };

export default App;
