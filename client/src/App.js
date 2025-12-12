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
    
    const getImages = (face) => ({
        normal: face.image_uris?.normal,
        artCrop: face.image_uris?.art_crop
    });

    if (data.card_faces && data.card_faces.length > 1 && data.card_faces[0].image_uris) {
        const front = getImages(data.card_faces[0]);
        const back = getImages(data.card_faces[1]);
        return { 
            name: data.name, 
            image: front.normal, 
            backImage: back.normal,
            artCrop: front.artCrop 
        };
    }
    
    if (data.image_uris) {
        return { 
            name: data.name, 
            image: data.image_uris.normal,
            artCrop: data.image_uris.art_crop 
        };
    }
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

// --- AUTH COMPONENT ---
const AuthModal = ({ onClose, onLogin }) => {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    
    const handleSubmit = async () => {
        const endpoint = isRegister ? '/register' : '/login';
        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg);
            
            if (isRegister) { 
                setIsRegister(false); 
                alert("Account created! Log in."); 
            } else { 
                // --- SAVE TO LOCAL STORAGE ON LOGIN ---
                localStorage.setItem('battlemat_token', data.token);
                localStorage.setItem('battlemat_user', JSON.stringify(data.user));
                
                onLogin(data.user, data.token); 
                onClose(); 
            }
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

// --- FINISH GAME MODAL ---
const FinishGameModal = ({ players, onFinish, onClose }) => {
    const [winnerId, setWinnerId] = useState(null);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#222', padding: '30px', borderRadius: '10px', width: '350px', border: '1px solid #444', color: 'white', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h2 style={{margin: 0, textAlign: 'center', color: '#facc15'}}>Finish Game</h2>
                <p style={{fontSize: '13px', color: '#aaa', textAlign: 'center'}}>Select the winner. This will record stats for everyone and reset the game.</p>
                <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #333', borderRadius: '5px'}}>
                    {players.map(p => (
                        <div key={p.id} onClick={() => setWinnerId(p.id)} style={{ padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: winnerId === p.id ? 'rgba(34, 197, 94, 0.2)' : 'transparent', borderBottom: '1px solid #333' }}>
                            <div style={{width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #555', background: winnerId === p.id ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                {winnerId === p.id && <div style={{width: '10px', height: '10px', borderRadius: '50%', background: '#fff'}} />}
                            </div>
                            <span style={{fontWeight: 'bold'}}>{p.username || `Player ${p.id.substr(0,4)}`}</span>
                        </div>
                    ))}
                </div>
                <button onClick={() => onFinish(winnerId)} disabled={!winnerId} style={{padding: '12px', background: winnerId ? '#2563eb' : '#444', color: 'white', border: 'none', borderRadius: '5px', cursor: winnerId ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px'}}>🏆 Confirm Winner & Reset</button>
                <button onClick={onClose} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px'}}>Cancel</button>
            </div>
        </div>
    );
};

// --- DECK SELECTION MODAL ---
const DeckSelectionModal = ({ user, token, onConfirm, onOpenProfile, onUpdateUser }) => {
    const [selectedDeckId, setSelectedDeckId] = useState("");
    const [hideCommander, setHideCommander] = useState(false);
    
    // Random State
    const [useCycle, setUseCycle] = useState(false);
    const [wasRandomlyPicked, setWasRandomlyPicked] = useState(false);
    const [resetCycle, setResetCycle] = useState(false);

    const handleRandom = () => {
        if (!user || !user.decks || user.decks.length === 0) return;
        
        let pool = [...user.decks];
        let willReset = false;

        if (useCycle && user.deckCycleHistory) {
            const playedIds = user.deckCycleHistory;
            const remaining = pool.filter(d => !playedIds.includes(d._id));
            if (remaining.length === 0) {
                willReset = true;
                alert("🎉 Cycle Complete! All decks played. Restarting cycle.");
                pool = [...user.decks];
            } else {
                pool = remaining;
            }
        }

        const randomIndex = Math.floor(Math.random() * pool.length);
        const randomDeck = pool[randomIndex];
        
        setSelectedDeckId(randomDeck._id);
        setWasRandomlyPicked(true);
        setResetCycle(willReset);
    };

    const handleConfirm = async () => {
        if (selectedDeckId === "ADD_NEW") {
            onOpenProfile();
            return;
        }

        if (wasRandomlyPicked && useCycle) {
            try {
                const res = await fetch(`${API_URL}/record-deck-usage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ userId: user.id, deckId: selectedDeckId, resetCycle })
                });
                const newHistory = await res.json();
                onUpdateUser(prev => ({ ...prev, deckCycleHistory: newHistory }));
            } catch (err) { console.error("Failed to update deck cycle", err); }
        }

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
        onConfirm(deckData, hideCommander, selectedDeckId);
    };

    const sortedDecks = user && user.decks ? [...user.decks].sort((a, b) => a.name.localeCompare(b.name)) : [];

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.95)', zIndex: 200000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#222', padding: '30px', borderRadius: '10px', width: '350px', border: '1px solid #444', color: 'white', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{margin: 0, textAlign: 'center', color: '#c4b5fd'}}>Next Game Setup</h2>
                
                {user ? (
                    <div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '5px'}}>
                             <label style={{fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold'}}>Select Deck</label>
                             <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                                <input type="checkbox" checked={useCycle} onChange={e => setUseCycle(e.target.checked)} id="cycleCheckModal" style={{cursor:'pointer'}} />
                                <label htmlFor="cycleCheckModal" style={{fontSize: '11px', color: '#aaa', cursor:'pointer'}}>Cycle</label>
                             </div>
                        </div>

                        <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                            <select 
                                value={selectedDeckId} 
                                onChange={e => {
                                    if(e.target.value === "ADD_NEW") {
                                        onOpenProfile(); 
                                    } else {
                                        setSelectedDeckId(e.target.value);
                                        setWasRandomlyPicked(false);
                                    }
                                }} 
                                style={{flex: 1, padding: '10px', borderRadius: '6px', background: '#333', color: 'white', border: '1px solid #555', outline: 'none'}}
                            >
                                <option value="">-- No Deck --</option>
                                {sortedDecks.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                <option value="ADD_NEW" style={{fontWeight: 'bold', color: '#4f46e5'}}>✨ + Create New Deck...</option>
                            </select>
                            
                            <button onClick={handleRandom} title="Pick Random Deck" style={{ background: '#7c3aed', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '0 12px', fontSize: '18px' }}>🎲</button>
                            
                            <button onClick={() => setHideCommander(!hideCommander)} title="Hide Commander" style={{ background: hideCommander ? '#ef4444' : '#333', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', padding: '0 10px', fontSize: '16px' }}>{hideCommander ? '🙈' : '👁️'}</button>
                        </div>
                    </div>
                ) : (
                    <div style={{color: '#aaa', textAlign: 'center', fontSize: '14px'}}>Login to use decks.</div>
                )}
                
                <button onClick={handleConfirm} style={{padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px'}}>✅ Ready to Battle</button>
            </div>
        </div>
    );
};

// --- PROFILE SCREEN ---
const ProfileScreen = ({ user, token, onClose, onUpdateUser, onLogout }) => {
    const [cmdrName, setCmdrName] = useState("");
    const [partnerName, setPartnerName] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [activeInput, setActiveInput] = useState(null); 
    const [sortMethod, setSortMethod] = useState("name");

    const handleSearch = async (val, field) => {
        if (field === 'commander') setCmdrName(val); else setPartnerName(val);
        setActiveInput(field);
        if (val.length > 2) setSuggestions(await fetchCommanderAutocomplete(val));
        else setSuggestions([]);
    };
    const handleSelectSuggestion = (name) => {
        if (activeInput === 'commander') setCmdrName(name); else setPartnerName(name);
        setSuggestions([]); setActiveInput(null);
    };
    const handleAddDeck = async () => {
        if (!cmdrName) return; 
        const cardData = await fetchCardData(cmdrName);
        const image = cardData ? (cardData.artCrop || cardData.image) : "";
        const deckName = partnerName ? `${cmdrName} + ${partnerName}` : cmdrName;
        try {
            const res = await fetch(`${API_URL}/add-deck`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, name: deckName, commander: cmdrName, image })
            });
            const updatedDecks = await res.json();
            onUpdateUser({ ...user, decks: updatedDecks });
            setCmdrName(""); setPartnerName(""); setSuggestions([]);
        } catch (err) { console.error(err); }
    };
    const handleDeleteDeck = async (deckId) => {
        if(!window.confirm("Delete this deck?")) return;
        try {
            const res = await fetch(`${API_URL}/delete-deck`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, deckId })
            });
            const updatedDecks = await res.json();
            onUpdateUser({ ...user, decks: updatedDecks });
        } catch (err) { console.error(err); }
    };
    const handleResetStats = async () => {
        if(!window.confirm("Reset stats?")) return;
        try {
            const res = await fetch(`${API_URL}/reset-stats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id })
            });
            const newStats = await res.json();
            onUpdateUser({ ...user, stats: newStats });
            alert("Stats reset.");
        } catch (err) { console.error(err); }
    };

    const sortedDecks = [...(user.decks || [])].sort((a, b) => {
        if (sortMethod === 'name') return a.name.localeCompare(b.name);
        if (sortMethod === 'winrate') {
            const rateA = (a.wins + a.losses) > 0 ? (a.wins / (a.wins + a.losses)) : 0;
            const rateB = (b.wins + b.losses) > 0 ? (b.wins / (b.wins + b.losses)) : 0;
            return rateB - rateA; 
        }
        return 0;
    });

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111', zIndex: 100000, overflowY: 'auto', padding: '40px', boxSizing: 'border-box', color: 'white' }}>
            <button onClick={onClose} style={{position: 'absolute', top: '20px', right: '30px', fontSize: '24px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}>✕ Close</button>
            <h1 style={{color: '#c4b5fd', borderBottom: '1px solid #333', paddingBottom: '10px'}}>{user.username}</h1>
            
            {/* LOGOUT BUTTON */}
            <button onClick={onLogout} style={{position:'absolute', top: '20px', right: '130px', fontSize: '14px', background: '#7f1d1d', border: '1px solid #991b1b', color: '#fff', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px'}}>🚪 Logout</button>

            <div style={{display: 'flex', gap: '20px', marginBottom: '20px'}}>
                <div style={statBoxStyle}><h3>🏆 Wins</h3><span>{user.stats.wins}</span></div>
                <div style={statBoxStyle}><h3>💀 Losses</h3><span>{user.stats.losses}</span></div>
                <div style={statBoxStyle}><h3>🎲 Games</h3><span>{user.stats.gamesPlayed}</span></div>
                <div style={statBoxStyle}><h3>📊 Win Rate</h3><span>{user.stats.gamesPlayed > 0 ? Math.round((user.stats.wins / user.stats.gamesPlayed)*100) : 0}%</span></div>
            </div>
            <div style={{marginBottom: '40px'}}><button onClick={handleResetStats} style={{background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'}}>⚠️ Reset Global Stats</button></div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h2 style={{color: '#ccc', margin: 0}}>My Decks</h2>
                <select value={sortMethod} onChange={(e) => setSortMethod(e.target.value)} style={{padding: '5px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none'}}>
                    <option value="name">Sort by Name (A-Z)</option>
                    <option value="winrate">Sort by Win Rate (%)</option>
                </select>
            </div>
            <div style={{background: '#222', padding: '15px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', border: '1px solid #444', flexWrap: 'wrap'}}>
                <div style={{position: 'relative', flex: 1, minWidth: '200px'}}>
                    <input type="text" placeholder="Commander (Required)" value={cmdrName} onChange={e => handleSearch(e.target.value, 'commander')} style={{...inputStyle, width: '100%'}} />
                    {suggestions.length > 0 && activeInput === 'commander' && <div style={{position: 'absolute', top: '100%', left: 0, width: '100%', background: '#333', border: '1px solid #555', zIndex: 10}}>{suggestions.map((s,i) => <div key={i} onClick={() => handleSelectSuggestion(s)} style={{padding: '5px', cursor: 'pointer'}}>{s}</div>)}</div>}
                </div>
                <div style={{position: 'relative', flex: 1, minWidth: '200px'}}>
                    <input type="text" placeholder="Partner (Optional)" value={partnerName} onChange={e => handleSearch(e.target.value, 'partner')} style={{...inputStyle, width: '100%'}} />
                    {suggestions.length > 0 && activeInput === 'partner' && <div style={{position: 'absolute', top: '100%', left: 0, width: '100%', background: '#333', border: '1px solid #555', zIndex: 10}}>{suggestions.map((s,i) => <div key={i} onClick={() => handleSelectSuggestion(s)} style={{padding: '5px', cursor: 'pointer'}}>{s}</div>)}</div>}
                </div>
                <button onClick={handleAddDeck} style={{padding: '8px 15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>+ Create Deck</button>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px'}}>
                {sortedDecks.map(deck => (
                    <div key={deck._id} style={{background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden', position: 'relative'}}>
                        <div style={{ height: '180px', background: `url(${deck.image}) center 20% / 120% no-repeat`, borderBottom: '1px solid #333' }}></div>
                        <div style={{padding: '15px'}}>
                            <div style={{fontWeight: 'bold', fontSize: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={deck.name}>{deck.name}</div>
                            <div style={{fontSize: '13px', marginTop: '5px'}}>Win Rate: {deck.wins + deck.losses > 0 ? Math.round((deck.wins / (deck.wins+deck.losses))*100) : 0}%</div>
                            <div style={{fontSize: '12px', color: '#666'}}>{deck.wins}W - {deck.losses}L</div>
                            <button onClick={() => handleDeleteDeck(deck._id)} style={{marginTop: '10px', width: '100%', padding: '5px', background: '#7f1d1d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px'}}>Delete Deck</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- LOBBY (UPDATED: JOIN BUTTON DISABLED IF NO USER) ---
const Lobby = ({ onJoin, user, token, onOpenAuth, onOpenProfile, onSelectDeck, selectedDeckId, onUpdateUser }) => {
  const [step, setStep] = useState('mode'); 
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [previewStream, setPreviewStream] = useState(null);
  const [hideCommander, setHideCommander] = useState(false); 
  
  // Random State
  const [useCycle, setUseCycle] = useState(false);
  const [wasRandomlyPicked, setWasRandomlyPicked] = useState(false);
  const [resetCycle, setResetCycle] = useState(false);

  const videoRef = useRef(null);

  useEffect(() => {
    if (step === 'setup') {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videos = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(videos);
        if (videos.length > 0) setSelectedDeviceId(videos[0].deviceId);
      });
    }
  }, [step]);

  useEffect(() => {
    if (step === 'setup' && selectedDeviceId) {
      const constraints = { video: { deviceId: { exact: selectedDeviceId }, aspectRatio: 1.777777778, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true };
      if (previewStream) previewStream.getTracks().forEach(t => t.stop());
      navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        setPreviewStream(stream);
        if (videoRef.current) videoRef.current.srcObject = stream;
      }).catch(err => console.error("Preview Error:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedDeviceId]);

  // --- RANDOM DECK LOGIC ---
  const handleRandom = () => {
    if (!user || !user.decks || user.decks.length === 0) return;
    
    let pool = [...user.decks];
    let willReset = false;

    if (useCycle && user.deckCycleHistory) {
        const playedIds = user.deckCycleHistory;
        const remaining = pool.filter(d => !playedIds.includes(d._id));
        if (remaining.length === 0) {
            willReset = true;
            alert("🎉 Cycle Complete! All decks played. Restarting cycle.");
            pool = [...user.decks];
        } else {
            pool = remaining;
        }
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    const randomDeck = pool[randomIndex];
    
    onSelectDeck(randomDeck._id); // Update parent state
    setWasRandomlyPicked(true);
    setResetCycle(willReset);
  };

  const handleEnterGame = async () => { 
      // RECORD CYCLE USAGE IF RANDOM WAS USED
      if (wasRandomlyPicked && useCycle && user && token) {
        try {
            const res = await fetch(`${API_URL}/record-deck-usage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: user.id, deckId: selectedDeckId, resetCycle })
            });
            const newHistory = await res.json();
            onUpdateUser(prev => ({ ...prev, deckCycleHistory: newHistory }));
        } catch (err) { console.error("Failed to update deck cycle", err); }
      }

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
      onJoin(false, previewStream, deckData, hideCommander); 
  };
  
  const handleSpectate = () => { if (previewStream) previewStream.getTracks().forEach(t => t.stop()); onJoin(true, null); };

  // Sort Decks for Dropdown
  const sortedDecks = user && user.decks ? [...user.decks].sort((a, b) => a.name.localeCompare(b.name)) : [];

  if (step === 'mode') {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 99999 }}>
        <h1 style={{ marginBottom: '40px', fontSize: '3rem', color: '#c4b5fd', letterSpacing: '4px' }}>BattleMat</h1>
        {user ? (
            <div style={{marginBottom: '30px', textAlign: 'center'}}>
                <div style={{fontSize: '20px', fontWeight: 'bold', color: '#fff', marginBottom: '10px'}}>Welcome, {user.username}</div>
                <button onClick={onOpenProfile} style={{padding: '8px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>👤 View Profile</button>
            </div>
        ) : (
            <button onClick={onOpenAuth} style={{marginBottom: '30px', padding: '10px 20px', background: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '20px', cursor: 'pointer'}}>👤 Login / Register</button>
        )}
        <div style={{ display: 'flex', gap: '30px' }}>
            {/* --- UPDATED: BUTTON DISABLED IF NO USER --- */}
            <button 
                onClick={() => user && setStep('setup')} 
                disabled={!user}
                style={{
                    ...lobbyBtnStyle, 
                    background: user ? '#2563eb' : '#444', 
                    cursor: user ? 'pointer' : 'not-allowed',
                    opacity: user ? 1 : 0.6
                }}
            >
                {user ? '🎥 Join as Player' : '🔒 Login to Play'}
            </button>
          <button onClick={handleSpectate} style={{...lobbyBtnStyle, background: '#333', color: '#ccc', border: '1px solid #555'}}>👁️ Spectate Only</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0f0f0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 99999 }}>
      <h2 style={{color: '#ccc', marginBottom: '20px'}}>Setup Camera</h2>
      <div style={{ width: '640px', height: '360px', background: 'black', borderRadius: '8px', overflow: 'hidden', border: '2px solid #333', boxShadow: '0 10px 30px black', position: 'relative', marginBottom: '20px' }}>
        <video ref={videoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <div style={{position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px'}}>Preview</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '300px' }}>
        
        {user && user.decks && (
            <div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '5px'}}>
                        <label style={{fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold'}}>Select Deck</label>
                        <div style={{display:'flex', alignItems:'center', gap:'5px'}}>
                        <input type="checkbox" checked={useCycle} onChange={e => setUseCycle(e.target.checked)} id="cycleCheckLobby" style={{cursor:'pointer'}} />
                        <label htmlFor="cycleCheckLobby" style={{fontSize: '11px', color: '#aaa', cursor:'pointer'}}>Cycle</label>
                        </div>
                </div>

                <div style={{display: 'flex', gap: '10px', marginTop: '5px'}}>
                    {/* --- UPDATED DROPDOWN WITH SORT & ADD OPTION --- */}
                    <select 
                        value={selectedDeckId} 
                        onChange={e => {
                            if(e.target.value === "ADD_NEW") {
                                onOpenProfile(); 
                            } else {
                                onSelectDeck(e.target.value);
                                setWasRandomlyPicked(false);
                            }
                        }} 
                        style={{flex: 1, padding: '10px', borderRadius: '6px', background: '#222', color: 'white', border: '1px solid #444', outline: 'none'}}
                    >
                        <option value="">-- No Deck --</option>
                        {sortedDecks.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                        <option value="ADD_NEW" style={{fontWeight: 'bold', color: '#4f46e5'}}>✨ + Create New Deck...</option>
                    </select>

                    <button onClick={handleRandom} title="Pick Random Deck" style={{ background: '#7c3aed', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '0 12px', fontSize: '18px' }}>🎲</button>
                    <button onClick={() => setHideCommander(!hideCommander)} title="Hide Commander" style={{ background: hideCommander ? '#ef4444' : '#333', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', padding: '0 10px', fontSize: '16px' }}>{hideCommander ? '🙈' : '👁️'}</button>
                </div>
            </div>
        )}

        <label style={{fontSize: '12px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold'}}>Select Camera Source</label>
        <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} style={{ padding: '10px', borderRadius: '6px', background: '#222', color: 'white', border: '1px solid #444', outline: 'none' }}>
            {videoDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${device.deviceId.slice(0,5)}...`}</option>)}
        </select>
        <button onClick={handleEnterGame} style={{...lobbyBtnStyle, marginTop: '10px', width: '100%', fontSize: '1.2rem', padding: '15px'}}>✅ Enter Battle</button>
        <button onClick={() => setStep('mode')} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', textDecoration: 'underline'}}>Back</button>
      </div>
    </div>
  );
};
const lobbyBtnStyle = { padding: '20px 40px', fontSize: '1.5rem', cursor: 'pointer', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', boxShadow: '0 4px 15px rgba(37, 99, 235, 0.5)', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' };
const statBoxStyle = { background: '#222', padding: '15px', borderRadius: '8px', minWidth: '100px', textAlign: 'center', border: '1px solid #444' };
const inputStyle = { padding: '8px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' };

const DiceOverlay = ({ activeRoll }) => {
  if (!activeRoll) return null;
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, pointerEvents: 'none', flexDirection: 'column' }}>
      <div style={{ background: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', border: '1px solid #666', boxShadow: '0 0 20px rgba(0,0,0,0.8)', maxWidth: '80%' }}>
        {activeRoll.results.map((val, i) => (
          <div key={i} className="dice-animation" style={{ width: '50px', height: '50px', borderRadius: activeRoll.type === 'coin' ? '50%' : '8px', background: activeRoll.type === 'coin' ? (val === 1 ? '#eab308' : '#94a3b8') : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '18px', border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.5)', textShadow: '0 2px 2px black', animation: 'popIn 0.3s ease-out forwards' }}>{activeRoll.type === 'coin' ? (val === 1 ? 'H' : 'T') : val}</div>
        ))}
      </div>
    </div>
  );
};

const DraggableToken = ({ token, isMyStream, onUpdate, onRemove, onInspect, onOpenMenu }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: token.x, y: token.y });
  const dragOffset = useRef({ x: 0, y: 0 });
  const parentRect = useRef(null);
  const hasMoved = useRef(false); 
  useEffect(() => { setPos({ x: token.x, y: token.y }); }, [token.x, token.y]);
  
  const handleMouseDown = (e) => {
    if (!isMyStream || e.button !== 0) return; 
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true); hasMoved.current = false; 
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    dragOffset.current = { x: e.clientX - centerX, y: e.clientY - centerY };
    parentRect.current = e.currentTarget.offsetParent.getBoundingClientRect();
  };
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !parentRect.current) return;
    e.stopPropagation(); hasMoved.current = true;
    const rawCenterX = e.clientX - parentRect.current.left - dragOffset.current.x;
    const rawCenterY = e.clientY - parentRect.current.top - dragOffset.current.y;
    const pctX = (rawCenterX / parentRect.current.width) * 100;
    const pctY = (rawCenterY / parentRect.current.height) * 100;
    setPos({ x: pctX, y: pctY });
  }, [isDragging]);
  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.stopPropagation(); setIsDragging(false);
    if (hasMoved.current) onUpdate({ ...token, x: pos.x, y: pos.y });
  }, [isDragging, pos, onUpdate, token]);
  useEffect(() => {
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); } 
    else { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, handleMouseMove, handleMouseUp]);
  const handleCounterChange = (e, amount) => { e.stopPropagation(); e.preventDefault(); if (isMyStream) onUpdate({ ...token, counter: (token.counter || 0) + amount }); };
  return (
    <div onMouseDown={handleMouseDown} onClick={(e) => { e.stopPropagation(); if (!hasMoved.current) isMyStream ? onUpdate({ ...token, isTapped: !token.isTapped }) : onInspect(token); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (isMyStream) onOpenMenu(token, e.clientX - e.currentTarget.parentElement.getBoundingClientRect().left, e.clientY - e.currentTarget.parentElement.getBoundingClientRect().top); }}
      style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: '10%', minWidth: '45px', zIndex: isDragging ? 1000 : 500, cursor: isMyStream ? 'grab' : 'zoom-in', transform: `translate(-50%, -50%) ${token.isTapped ? 'rotate(90deg)' : 'rotate(0deg)'}`, transition: isDragging ? 'none' : 'transform 0.2s' }}
    >
      <div style={{position: 'relative', width: '100%'}}>
        <img src={token.image} alt="token" style={{ width: '100%', borderRadius: '6px', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.8)' }} draggable="false" />
        {token.counter !== undefined && token.counter !== null && (
            <div onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', bottom: '-8px', left: '-8px', background: '#111', border: '1px solid #666', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px black', overflow: 'hidden', transform: token.isTapped ? 'rotate(-90deg)' : 'none' }}>
                {isMyStream && <button onClick={(e) => handleCounterChange(e, -1)} style={{background: '#333', border: 'none', color: 'white', fontSize: '10px', width: '16px', height: '16px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>-</button>}
                <span style={{fontSize: '11px', fontWeight: 'bold', color: '#fff', padding: '0 4px', minWidth: '14px', textAlign: 'center'}}>{token.counter}</span>
                {isMyStream && <button onClick={(e) => handleCounterChange(e, 1)} style={{background: '#333', border: 'none', color: 'white', fontSize: '10px', width: '16px', height: '16px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>+</button>}
            </div>
        )}
      </div>
    </div>
  );
};

const TokenContextMenu = ({ x, y, onDelete, onInspect, onToggleCounter, onClose }) => (
    <>
        <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1999}} />
        <div style={{ position: 'absolute', top: y, left: x, background: '#222', border: '1px solid #555', borderRadius: '4px', zIndex: 2000, minWidth: '120px', boxShadow: '0 4px 15px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
            <div onClick={(e) => { e.stopPropagation(); onInspect(); onClose(); }} style={menuItemStyle}>🔍 Inspect</div>
            <div onClick={(e) => { e.stopPropagation(); onToggleCounter(); onClose(); }} style={menuItemStyle}>🔢 Counter</div>
            <div onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }} style={{...menuItemStyle, color: '#ef4444', borderTop: '1px solid #333'}}>🗑️ Delete</div>
        </div>
    </>
);

const TokenSearchBar = ({ onSelect }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const handleChange = async (e) => { const val = e.target.value; setQuery(val); if (val.length > 2) { setSuggestions(await fetchAnyCardAutocomplete(val)); setShowDropdown(true); } else setShowDropdown(false); };
  const handleSelect = (name) => { setQuery(""); setShowDropdown(false); onSelect(name); };
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input type="text" placeholder="Search Token..." value={query} onChange={handleChange} onKeyDown={(e) => e.key === 'Enter' && handleSelect(query)} onFocus={() => query.length > 2 && setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} style={{width: '100%', fontSize: '11px', padding: '4px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px'}} />
      {showDropdown && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '180px', background: '#222', border: '1px solid #444', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto', zIndex: 9999, textAlign: 'left', boxShadow: '0 4px 10px rgba(0,0,0,0.9)' }}>
          {suggestions.map((name, i) => <div key={i} onClick={() => handleSelect(name)} style={{ padding: '6px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }} onMouseEnter={(e) => e.target.style.background = '#444'} onMouseLeave={(e) => e.target.style.background = 'transparent'}>{name}</div>)}
        </div>
      )}
    </div>
  );
};

const BigLifeCounter = ({ life, isMyStream, onLifeChange, onLifeSet }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(life);
  useEffect(() => { setVal(life); }, [life]);
  const handleFinish = () => { setIsEditing(false); const num = parseInt(val); if (!isNaN(num)) onLifeSet(num); else setVal(life); };
  return (
    <div style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 30, background: 'rgba(0,0,0,0.7)', borderRadius: '30px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(5px)', boxShadow: '0 4px 8px rgba(0,0,0,0.6)' }}>
      {isMyStream && <button onClick={() => onLifeChange(-1)} style={roundBtnLarge}>-</button>}
      {isEditing ? <input autoFocus type="number" value={val} onChange={(e) => setVal(e.target.value)} onBlur={handleFinish} onKeyDown={(e) => e.key === 'Enter' && handleFinish()} style={{ width: '50px', background: 'transparent', border: 'none', color: 'white', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', outline: 'none', fontFamily: 'monospace' }} />
      : <span onClick={() => isMyStream && setIsEditing(true)} style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', minWidth: '40px', textAlign: 'center', fontFamily: 'monospace', textShadow: '0 2px 4px black', cursor: isMyStream ? 'pointer' : 'default' }}>{life}</span>}
      {isMyStream && <button onClick={() => onLifeChange(1)} style={roundBtnLarge}>+</button>}
    </div>
  );
};

const HeaderSearchBar = ({ onCardFound, onToggleHistory }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const handleChange = async (e) => { const val = e.target.value; setQuery(val); if (val.length > 2) { setSuggestions(await fetchAnyCardAutocomplete(val)); setShowDropdown(true); } else setShowDropdown(false); };
  const handleSelect = async (name) => { setQuery(""); setShowDropdown(false); const d = await fetchCardData(name); if(d) onCardFound(d); };
  return (
    <div style={{ position: 'relative', width: '290px', zIndex: 9000, display: 'flex', gap: '5px' }}>
      <div style={{flex: 1, position: 'relative'}}>
        <input type="text" placeholder="🔍 Search Card..." value={query} onChange={handleChange} onKeyDown={async (e) => { if (e.key === 'Enter') { setShowDropdown(false); const d = await fetchCardData(query); if(d) {onCardFound(d); setQuery("");} } }} onFocus={() => { if(query.length > 2) setShowDropdown(true); }} onBlur={() => setTimeout(() => setShowDropdown(false), 200)} style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: 'white', fontSize: '13px', outline: 'none' }} />
        {showDropdown && suggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#1a1a1a', border: '1px solid #444', maxHeight: '400px', overflowY: 'auto', zIndex: 100001, boxShadow: '0 10px 40px rgba(0,0,0,0.9)' }}>{suggestions.map((name, i) => <div key={i} onClick={() => handleSelect(name)} style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}>{name}</div>)}</div>}
      </div>
      <button onClick={onToggleHistory} style={{ height: '100%', padding: '0 10px', background: '#333', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>🕒</button>
    </div>
  );
};

const HistoryModal = ({ history, onSelect, onClose }) => {
    return (
        <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 200000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
            <div style={{color: '#999', marginBottom: '20px', fontSize: '20px', letterSpacing: '2px', fontWeight: 'bold'}}>SEARCH HISTORY</div>
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '15px', maxWidth: '1200px', width: '90%', padding: '20px' }}>
                {history.length === 0 && <div style={{color: '#666', gridColumn: 'span 6', textAlign: 'center'}}>No history yet.</div>}
                {history.map((card, i) => (
                    <div key={i} onClick={() => { onSelect(card); onClose(); }} style={{ cursor: 'pointer', position: 'relative' }}>
                        <img src={card.image} alt={card.name} style={{ width: '100%', borderRadius: '8px', transition: 'transform 0.15s ease', border: '1px solid #444', boxShadow: '0 5px 15px black' }} onMouseEnter={(e) => { e.target.style.transform = 'scale(1.2)'; e.target.style.zIndex = '100'; }} onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; e.target.style.zIndex = '1'; }} />
                    </div>
                ))}
            </div>
        </div>
    );
};

const CardModal = ({ cardData, onClose }) => {
  if (!cardData) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
      <div style={{position: 'relative', display: 'flex', gap: '15px', alignItems: 'center'}} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '-25px', right: '-25px', background: 'white', color: 'black', border: 'none', borderRadius: '50%', width: '40px', height: '40px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 10px black', zIndex: 100001 }}>✕</button>
        <img src={cardData.image} alt={cardData.name} style={{ maxHeight: '80vh', maxWidth: '40vw', borderRadius: '15px', boxShadow: '0 0 20px black' }} />
        {cardData.backImage && (
            <img src={cardData.backImage} alt={`${cardData.name} Back`} style={{ maxHeight: '80vh', maxWidth: '40vw', borderRadius: '15px', boxShadow: '0 0 20px black' }} />
        )}
      </div>
    </div>
  );
};

// --- UPDATED: COMMANDER LABEL (READ-ONLY) ---
const CommanderLabel = ({ placeholder, cardData, isMyStream, onSelect, onHover, onLeave, secretData, onReveal }) => {
  // Logic simplified: No inputs, just display.
  
  if (secretData) {
      if (isMyStream) return <button onClick={onReveal} style={{background: '#b45309', border: '1px solid #f59e0b', color: 'white', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px'}}>👁 Reveal {secretData.name}</button>;
      return <span style={{color: '#777', fontStyle: 'italic'}}>🙈 Hidden</span>;
  }

  if (cardData) {
      return (
        <span 
            onMouseEnter={() => onHover(cardData)} 
            onMouseLeave={onLeave} 
            style={{ cursor: 'help', textDecoration: 'underline', textDecorationColor: '#666', fontWeight: 'bold' }}
        >
            {cardData.name}
        </span>
      );
  }

  return <span style={{color: '#777', fontSize: '12px', fontStyle: 'italic'}}>No Commander</span>;
};

const DamagePanel = ({ userId, targetPlayerData, allPlayerIds, allGameState, isMyStream, updateGame, onClose }) => {
  const poison = targetPlayerData?.poison || 0;
  const cmdDamageTaken = targetPlayerData?.cmdDamageTaken || {};
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '260px', maxHeight: '80%', background: 'rgba(15, 15, 15, 0.98)', border: '1px solid #666', borderRadius: '12px', padding: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(10px)', boxShadow: '0 20px 50px rgba(0,0,0,1)' }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #444', paddingBottom: '8px'}}><span style={{fontWeight: 'bold', fontSize: '12px', color: '#ccc'}}>DAMAGE & INFECT</span><button onClick={onClose} style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'}}>✕</button></div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)'}}><div style={{display: 'flex', flexDirection: 'column'}}><span style={{color: '#22c55e', fontSize: '13px', fontWeight: 'bold'}}>POISON</span></div><div style={{display: 'flex', alignItems: 'center', background: '#222', borderRadius: '4px', padding: '2px'}}>{isMyStream && <button onClick={() => updateGame(userId, { poison: Math.max(0, poison - 1) })} style={tinyBtn}>-</button>}<span style={{width: '30px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: 'white'}}>{poison}</span>{isMyStream && <button onClick={() => updateGame(userId, { poison: poison + 1 })} style={tinyBtn}>+</button>}</div></div>
      <div style={{fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold'}}>Commander Damage Taken</div>
      <div style={{overflowY: 'auto', flex: 1, paddingRight: '4px'}}>
        {allPlayerIds.length <= 1 && <div style={{fontSize: '11px', color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '10px'}}>No opponents recorded.</div>}
        {allPlayerIds.map(attackerId => {
          const attackerData = allGameState[attackerId] || {};
          const cmds = attackerData.commanders || {};
          const dmgObj = cmdDamageTaken[attackerId] || { primary: 0, partner: 0 };
          const primaryName = cmds.primary?.name || `Player ${attackerId.substr(0,3)}`;
          const renderRow = (name, val, type) => (
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '6px', color: val >= 21 ? '#ef4444' : '#ddd'}}><div style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px'}} title={name}>{name}</div><div style={{display: 'flex', alignItems: 'center', background: isMyStream ? '#333' : 'transparent', borderRadius: '3px'}}>{isMyStream && <button style={tinyBtn} onClick={() => updateGame(null, null, { opponentId: attackerId, type, amount: -1 })}>-</button>}<span style={{width: '24px', textAlign: 'center', fontWeight: 'bold'}}>{val}</span>{isMyStream && <button style={tinyBtn} onClick={() => updateGame(null, null, { opponentId: attackerId, type, amount: 1 })}>+</button>}</div></div>
          );
          if (!isMyStream && !(dmgObj.primary > 0 || dmgObj.partner > 0)) return null;
          return <div key={attackerId} style={{marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px'}}>{renderRow(primaryName, dmgObj.primary || 0, 'primary')}</div>;
        })}
      </div>
    </div>
  );
};

const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, allPlayerIds, allGameState, onDragStart, onDrop, isActiveTurn, onSwitchRatio, currentRatio, onInspectToken, onClaimStatus, onRecordStat, onOpenDeckSelect, onLeaveGame }) => {
  const videoRef = useRef();
  const [showDamagePanel, setShowDamagePanel] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null); 
  const [showSettings, setShowSettings] = useState(false);
  const [rotation, setRotation] = useState(0); 
  const [tokenMenu, setTokenMenu] = useState(null); 
  const [rollCount, setRollCount] = useState(1);
  const [selectedDice, setSelectedDice] = useState('d20');

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  const handleAddToken = async (tokenName) => { if(!tokenName) return; const cardData = await fetchCardData(tokenName); if (cardData) { updateGame(myId, { tokens: [...(playerData?.tokens || []), { id: Date.now(), name: cardData.name, image: cardData.image, x: 50, y: 50, isTapped: false }] }); setShowSettings(false); } };
  const handleUpdateToken = (updatedToken) => { updateGame(myId, { tokens: (playerData?.tokens || []).map(t => t.id === updatedToken.id ? updatedToken : t) }); };
  const handleRemoveToken = (tokenId) => { updateGame(myId, { tokens: (playerData?.tokens || []).filter(t => t.id !== tokenId) }); };
  
  const handleStatusClick = (type) => {
      const data = type === 'monarch' ? MONARCH_CARD : INITIATIVE_CARD;
      onInspectToken(data);
  };

  const handleRollAction = () => {
      let sides = 20;
      if (selectedDice === 'coin') sides = 2;
      else sides = parseInt(selectedDice.substring(1)); 
      const count = Math.max(1, Math.min(10, rollCount));
      const results = Array.from({length: count}, () => Math.floor(Math.random() * sides) + 1);
      updateGame(myId, { activeRoll: { type: selectedDice, results, id: Date.now() } });
      setShowSettings(false);
  };
  
  useEffect(() => {
    if (playerData?.activeRoll) {
        const timer = setTimeout(() => { if (isMyStream) updateGame(myId, { activeRoll: null }); }, 5000);
        return () => clearTimeout(timer);
    }
  }, [playerData?.activeRoll, isMyStream, myId, updateGame]);

  const life = playerData?.life ?? 40;
  const isDead = life <= 0 || (playerData?.poison || 0) >= 10;

  const TARGET_RATIO = 1.777777778; 
  let finalW = width;
  let finalH = width / TARGET_RATIO;
  if (finalH > height) { finalH = height; finalW = height * TARGET_RATIO; }

  return (
    <div draggable onDragStart={(e) => onDragStart(e, userId)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, userId)} style={{ width: width, height: height, padding: '4px', boxSizing: 'border-box', transition: 'width 0.2s, height 0.2s', cursor: 'grab' }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'black', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', border: isDead ? '2px solid #333' : (isActiveTurn ? '2px solid #facc15' : '1px solid #333'), filter: isDead ? 'grayscale(100%)' : 'none', opacity: isDead ? 0.8 : 1, overflow: 'hidden' }}>
        <div style={{ width: finalW, height: finalH, position: 'relative', overflow: 'hidden' }}>
            {!stream && !isDead && <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '12px'}}>Waiting for Camera...</div>}
            <video ref={videoRef} autoPlay muted={true} style={{ width: '100%', height: '100%', objectFit: 'fill', transform: `rotate(${rotation}deg)` }} />
            {isDead && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.4)' }}><div style={{ fontSize: '40px' }}>💀</div></div>}
            
            {/* --- NAME BAR OVERLAY --- */}
            {playerData?.username && (
                <div style={{ position: 'absolute', bottom: '0', left: '0', width: '100%', background: 'rgba(0,0,0,0.7)', padding: '4px 10px', color: 'white', fontSize: '12px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', zIndex: 45 }}>
                    {playerData.username}
                </div>
            )}

            {hoveredCard && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60, pointerEvents: 'none', filter: 'drop-shadow(0 0 10px black)', display: 'flex', gap: '5px' }}>
                    <img src={hoveredCard.image} alt="Card" style={{width: '240px', borderRadius: '10px'}} />
                    {hoveredCard.backImage && <img src={hoveredCard.backImage} alt="Card Back" style={{width: '240px', borderRadius: '10px'}} />}
                </div>
            )}

            <DiceOverlay activeRoll={playerData?.activeRoll} />
            {playerData?.tokens && playerData.tokens.map(token => <DraggableToken key={token.id} token={token} isMyStream={isMyStream} onUpdate={handleUpdateToken} onRemove={handleRemoveToken} onInspect={onInspectToken} onOpenMenu={(t, x, y) => setTokenMenu({ token: t, x, y })} />)}
            {tokenMenu && <TokenContextMenu x={tokenMenu.x} y={tokenMenu.y} onDelete={() => handleRemoveToken(tokenMenu.token.id)} onInspect={() => onInspectToken(tokenMenu.token)} onToggleCounter={() => handleUpdateToken({...tokenMenu.token, counter: tokenMenu.token.counter ? null : 1})} onClose={() => setTokenMenu(null)} />}
            
            <div style={{position: 'absolute', top: '80px', left: '5px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 40}}>
                {playerData?.isMonarch && (
                    <div 
                        onClick={() => handleStatusClick('monarch')}
                        onMouseEnter={() => setHoveredCard(MONARCH_CARD)} 
                        onMouseLeave={() => setHoveredCard(null)}
                        style={{fontSize: '24px', cursor: 'pointer', filter: 'drop-shadow(0 2px 4px black)'}}
                    >👑</div>
                )}
                {playerData?.isInitiative && (
                    <div 
                        onClick={() => handleStatusClick('initiative')}
                        onMouseEnter={() => setHoveredCard(INITIATIVE_CARD)} 
                        onMouseLeave={() => setHoveredCard(null)}
                        style={{fontSize: '24px', cursor: 'pointer', filter: 'drop-shadow(0 2px 4px black)'}}
                    >🏰</div>
                )}
            </div>

            <div style={{position: 'absolute', top: '10px', right: '10px', zIndex: 1000}}>
                <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid #555', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙️</button>
                {showSettings && (
                    <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '5px', background: '#222', border: '1px solid #444', borderRadius: '6px', width: '180px', display: 'flex', flexDirection: 'column' }}>
                        <button onClick={() => { setRotation(prev => prev === 0 ? 180 : 0); setShowSettings(false); }} style={menuBtnStyle}>🔄 Flip 180°</button>
                        {isMyStream && (
                            <>
                                <button onClick={() => { onSwitchRatio(); setShowSettings(false); }} style={menuBtnStyle}>📷 Ratio: {currentRatio}</button>
                                <button onClick={() => { onClaimStatus('monarch'); setShowSettings(false); }} style={{...menuBtnStyle, color: '#facc15'}}>👑 Claim Monarch</button>
                                <button onClick={() => { onClaimStatus('initiative'); setShowSettings(false); }} style={{...menuBtnStyle, color: '#a8a29e'}}>🏰 Take Initiative</button>
                                
                                {/* REMOVED WIN/LOSS BUTTONS AS REQUESTED */}
                                
                                <button onClick={() => { onOpenDeckSelect(); setShowSettings(false); }} style={menuBtnStyle}>🔄 Change Deck</button>
                                <button onClick={() => { onLeaveGame(); setShowSettings(false); }} style={{...menuBtnStyle, color: '#fca5a5'}}>🚪 Back to Lobby</button>

                                <button onClick={() => { updateGame(myId, { life: 0 }); setShowSettings(false); }} style={{...menuBtnStyle, color: '#ef4444'}}>💀 Eliminate Yourself</button>
                                <div style={{padding: '8px', borderTop: '1px solid #444'}}>
                                    <div style={{fontSize: '10px', color: '#888', marginBottom: '4px'}}>DICE & COIN</div>
                                    <div style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
                                        <input type="number" min="1" max="10" value={rollCount} onChange={(e) => setRollCount(parseInt(e.target.value))} style={{width: '35px', background: '#333', border:'1px solid #555', color:'white', fontSize:'11px', textAlign:'center', borderRadius: '3px', padding: '4px'}} />
                                        <select value={selectedDice} onChange={(e) => setSelectedDice(e.target.value)} style={{flex: 1, background: '#333', border: '1px solid #555', color: 'white', fontSize: '11px', borderRadius: '3px', padding: '4px', cursor: 'pointer'}}>
                                            <option value="d20">D20</option>
                                            <option value="d12">D12</option>
                                            <option value="d10">D10</option>
                                            <option value="d8">D8</option>
                                            <option value="d6">D6</option>
                                            <option value="d4">D4</option>
                                            <option value="coin">🪙 Coin</option>
                                        </select>
                                    </div>
                                    <button onClick={handleRollAction} style={{width: '100%', marginTop: '5px', background: '#2563eb', border: 'none', color: 'white', padding: '6px', borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold'}}>🎲 ROLL</button>
                                </div>
                                <div style={{padding: '8px', borderTop: '1px solid #444'}}>
                                    <div style={{fontSize: '10px', color: '#888', marginBottom: '4px'}}>ADD TOKEN</div>
                                    <TokenSearchBar onSelect={handleAddToken} />
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            <div style={{ position: 'absolute', top: '0', left: '0', right: '0', height: '60px', pointerEvents: 'none' }}>
            <div style={{pointerEvents: 'auto'}}><BigLifeCounter life={life} isMyStream={isMyStream} onLifeChange={(amt) => updateGame(userId, { life: life + amt })} onLifeSet={(val) => updateGame(userId, { life: val })} /></div>
            <div style={{ position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', pointerEvents: 'auto', zIndex: 40 }}>
                <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 12px', borderRadius: '15px', backdropFilter: 'blur(4px)', display: 'flex', gap: '8px', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', color: 'white', position: 'relative', zIndex: 100 }}>
                <CommanderLabel placeholder="Commander" cardData={playerData?.commanders?.primary} isMyStream={isMyStream} onSelect={(n) => {}} onHover={setHoveredCard} onLeave={() => setHoveredCard(null)} secretData={playerData?.secretCommanders?.primary} onReveal={() => updateGame(userId, { commanders: playerData.secretCommanders, secretCommanders: null })} />
                {(playerData?.commanders?.partner || playerData?.secretCommanders?.partner) && (
                    <>
                        <span style={{color: '#666'}}>|</span>
                        <CommanderLabel 
                            placeholder="Partner" 
                            cardData={playerData?.commanders?.partner} 
                            isMyStream={isMyStream} 
                            onSelect={(n) => {}} 
                            onHover={setHoveredCard} 
                            onLeave={() => setHoveredCard(null)}
                            secretData={playerData?.secretCommanders?.partner}
                            onReveal={() => updateGame(userId, { commanders: playerData.secretCommanders, secretCommanders: null })}
                        />
                    </>
                )}
                </div>
                <div style={{position: 'relative', zIndex: 10}}><button onClick={() => setShowDamagePanel(!showDamagePanel)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid #555', borderRadius: '12px', padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}><span style={{color: '#ef4444'}}>🛡</span> Damage</button></div>
            </div>
            </div>
            {showDamagePanel && <DamagePanel userId={userId} targetPlayerData={playerData} allPlayerIds={allPlayerIds.filter(id => id !== userId)} allGameState={allGameState} isMyStream={isMyStream} updateGame={(target, updates, cmd) => updateGame(userId, updates, cmd)} onClose={() => setShowDamagePanel(false)} />}
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
  const peersRef = useRef({}); 
  const [gameState, setGameState] = useState({});
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const [seatOrder, setSeatOrder] = useState([]); 
  const [turnState, setTurnState] = useState({ activeId: null, count: 1 });
  const [viewCard, setViewCard] = useState(null); 
  const [cameraRatio, setCameraRatio] = useState('16:9'); 
  const [searchHistory, setSearchHistory] = useState([]); 
  const [inviteText, setInviteText] = useState("Invite");
  const [showHistory, setShowHistory] = useState(false); 
  
  // --- AUTH STATE ---
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [showFinishModal, setShowFinishModal] = useState(false); 
  const [showDeckSelect, setShowDeckSelect] = useState(false); // NEW STATE for between-games

  const gameStateRef = useRef({});
  const seatOrderRef = useRef([]);
  const turnStateRef = useRef({ activeId: null, count: 1 });
  const myIdRef = useRef(null); 
  const cameraRatioRef = useRef('16:9');

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { seatOrderRef.current = seatOrder; }, [seatOrder]);
  useEffect(() => { turnStateRef.current = turnState; }, [turnState]);
  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { cameraRatioRef.current = cameraRatio; }, [cameraRatio]);

  const handleUpdateGame = useCallback((targetUserId, updates, cmdDmgUpdate = null) => {
    if (targetUserId && updates && targetUserId === myId) {
      setGameState(prev => {
        const newData = { ...prev[myId], ...updates };
        socket.emit('update-game-state', { userId: myId, data: newData });
        return { ...prev, [myId]: newData };
      });
    }
    if (cmdDmgUpdate) {
      const { opponentId, type, amount } = cmdDmgUpdate; 
      setGameState(prev => {
        const myData = prev[myId] || {};
        const allCmdDmg = myData.cmdDamageTaken || {};
        const specificOppDmg = allCmdDmg[opponentId] || { primary: 0, partner: 0 };
        const currentCmdDmg = specificOppDmg[type] || 0;
        const newCmdDmg = Math.max(0, currentCmdDmg + amount);
        let newLife = myData.life ?? 40;
        if (newCmdDmg !== currentCmdDmg) newLife -= (newCmdDmg - currentCmdDmg);
        const newOppDmg = { ...specificOppDmg, [type]: newCmdDmg };
        const newAllCmdDmg = { ...allCmdDmg, [opponentId]: newOppDmg };
        const newMyData = { ...myData, cmdDamageTaken: newAllCmdDmg, life: newLife };
        socket.emit('update-game-state', { userId: myId, data: newMyData });
        return { ...prev, [myId]: newMyData };
      });
    }
  }, [myId]);

  const handleGlobalCardFound = (cardData) => {
    setViewCard(cardData);
    setSearchHistory(prev => [cardData, ...prev.filter(c => c.name !== cardData.name)].slice(0, 12));
  };

  const handleMyLifeChange = useCallback((amount) => {
     const currentLife = gameState[myId]?.life ?? 40;
     handleUpdateGame(myId, { life: currentLife + amount });
  }, [myId, gameState, handleUpdateGame]);

  const safeLifeChange = (amount) => {
      const currentLife = gameState[myId]?.life ?? 40;
      handleUpdateGame(myId, { life: currentLife + amount });
  };
  
  const handleClaimStatus = (type) => {
      socket.emit('claim-status', { type, userId: myId });
  };

  // --- NEW: HANDLE LEAVE GAME (CLEANUP) ---
  const handleLeaveGame = () => {
      if(!window.confirm("Leave current game?")) return;
      
      if(streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
      }
      
      if(peerRef.current) {
          peerRef.current.destroy();
      }
      
      socket.disconnect();
      socket.connect();
      
      setHasJoined(false);
      setGameState({});
      setSeatOrder([]);
  };

  const handleRecordStat = async (isWin) => {
      if (!user || !token) { alert("Please login to record stats!"); return; }
      try {
          const res = await fetch(`${API_URL}/update-stats`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ userId: user.id, win: isWin, loss: !isWin, deckId: selectedDeckId })
          });
          const data = await res.json();
          setUser(prev => ({ ...prev, stats: data.stats, decks: data.decks }));
          alert(`Stat Recorded! Total Wins: ${data.stats.wins}`);
      } catch (err) { console.error(err); }
  };

  // --- HANDLE DECK CONFIRM (BETWEEN GAMES) ---
  const handleDeckConfirm = (deckData, isSecret, deckId) => {
      setSelectedDeckId(deckId); // Update local deck selection
      
      const updates = { 
          deckId: deckId, // Store deck ID for next game tracking
          commanders: {}, 
          secretCommanders: null 
      };
      
      if (deckData) {
          if (isSecret) updates.secretCommanders = deckData;
          else updates.commanders = deckData;
      }
      
      handleUpdateGame(myId, updates);
      setShowDeckSelect(false);
  };

  const handleFinishGame = async (winnerId) => {
      const results = seatOrder.map(pid => {
          const pData = gameState[pid];
          return {
              userId: pData?.dbId, 
              result: pid === winnerId ? 'win' : 'loss',
              deckId: pData?.deckId
          };
      });

      try {
          await fetch(`${API_URL}/finish-game`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ results })
          });
          
          const newGameState = {};
          seatOrder.forEach(pid => {
              newGameState[pid] = {
                  life: 40, poison: 0, commanders: {}, cmdDamageTaken: {}, tokens: [], isMonarch: false, isInitiative: false,
                  username: gameState[pid]?.username,
                  dbId: gameState[pid]?.dbId,
                  deckId: gameState[pid]?.deckId 
              };
          });
          const newTurnState = { activeId: null, count: 1 };
          socket.emit('reset-game-request', { gameState: newGameState, turnState: newTurnState });
          setShowFinishModal(false);
      } catch (err) { console.error(err); }
  };

  const randomizeSeats = () => {
    const shuffled = [...seatOrder];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setSeatOrder(shuffled);
    socket.emit('update-seat-order', shuffled);
  };

  const resetGame = () => {
    if(!window.confirm("Are you sure you want to reset the game?")) return;
    const newGameState = {};
    const allIds = [myId, ...peers.map(p => p.id)];
    allIds.forEach(pid => {
        newGameState[pid] = {
            life: 40,
            poison: 0,
            commanders: { primary: null, partner: null },
            cmdDamageTaken: {},
            tokens: [],
            isMonarch: false,
            isInitiative: false
        };
    });
    const newTurnState = { activeId: null, count: 1 };
    setGameState(newGameState);
    setTurnState(newTurnState);
    socket.emit('reset-game-request', { gameState: newGameState, turnState: newTurnState });
  };

  const handleInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setInviteText("Copied!");
    setTimeout(() => setInviteText("Invite"), 2000);
  };

  const calculateLayout = useCallback(() => {
    if (!containerRef.current) return;
    const count = seatOrder.length || 1;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    let bestArea = 0;
    let bestConfig = { width: 0, height: 0 };
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const maxW = containerW / cols;
      const maxH = containerH / rows;
      let w = maxW;
      let h = w / (16/9);
      if (h > maxH) { h = maxH; w = h * (16/9); }
      if ((w * h) > bestArea) { bestArea = w * h; bestConfig = { width: w, height: h }; }
    }
    setLayout(bestConfig);
  }, [seatOrder.length]);

  useLayoutEffect(() => {
    calculateLayout();
    window.addEventListener('resize', calculateLayout);
    return () => window.removeEventListener('resize', calculateLayout);
  }, [calculateLayout]);

  const isPlayerEliminated = (data) => {
    if (!data) return false;
    const life = data.life ?? 40;
    if (life <= 0) return true;
    if ((data.poison || 0) >= 10) return true;
    return false;
  };

  const passTurn = useCallback(() => {
    if (seatOrder.length === 0) return;
    if (turnState.activeId === null) {
        const newState = { activeId: seatOrder[0], count: 1 };
        setTurnState(newState);
        socket.emit('update-turn-state', newState);
        return; 
    }
    const currentIndex = seatOrder.indexOf(turnState.activeId);
    if (currentIndex === -1) return; 

    let flowOrder = [];
    if (seatOrder.length === 4) {
        flowOrder = [0, 1, 3, 2];
    } else {
        flowOrder = seatOrder.map((_, i) => i);
    }
    let flowIndex = flowOrder.indexOf(currentIndex);
    if (flowIndex === -1) flowIndex = 0;
    let attempts = 0;
    let nextSeatId = null;
    let nextTurnCount = turnState.count;
    do {
        flowIndex = (flowIndex + 1) % flowOrder.length;
        if (flowIndex === 0) nextTurnCount++;
        const seatIdx = flowOrder[flowIndex];
        nextSeatId = seatOrder[seatIdx];
        attempts++;
        if (attempts > seatOrder.length) break; 
    } while (isPlayerEliminated(gameState[nextSeatId]));
    const newState = { activeId: nextSeatId, count: nextTurnCount };
    setTurnState(newState);
    socket.emit('update-turn-state', newState);
  }, [seatOrder, turnState, gameState]);

  const switchCameraStream = () => {
    if (!myStream) return;
    const targetLabel = cameraRatio === '16:9' ? '4:3' : '16:9';
    setCameraRatio(targetLabel); 
    handleUpdateGame(myId, { cameraRatio: targetLabel });
    const constraints = targetLabel === '16:9' 
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778 }
        : { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: 1.333333333 };
    myStream.getTracks().forEach(track => track.stop());
    navigator.mediaDevices.getUserMedia({ video: constraints, audio: true }).then(newStream => {
        setMyStream(newStream);
        streamRef.current = newStream;
        if (peerRef.current) {
            Object.values(peerRef.current.connections).forEach(conns => {
                conns.forEach(conn => {
                    const videoSender = conn.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (videoSender) videoSender.replaceTrack(newStream.getVideoTracks()[0]);
                });
            });
        }
    }).catch(err => {
        console.error("Camera switch error:", err);
        alert("Camera hardware switch failed.");
    });
  };

  const handleDragStart = (e, userId) => { e.dataTransfer.setData("userId", userId); };
  const handleDrop = (e, targetUserId) => {
    const draggedUserId = e.dataTransfer.getData("userId");
    if (draggedUserId === targetUserId) return;
    const newOrder = [...seatOrder];
    const idxA = newOrder.indexOf(draggedUserId);
    const idxB = newOrder.indexOf(targetUserId);
    if (idxA > -1 && idxB > -1) { [newOrder[idxA], newOrder[idxB]] = [newOrder[idxB], newOrder[idxA]]; }
    setSeatOrder(newOrder);
    socket.emit('update-seat-order', newOrder);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); safeLifeChange(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); safeLifeChange(-1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); safeLifeChange(-5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); safeLifeChange(5); }
      if (e.code === 'Space') { e.preventDefault(); passTurn(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMyLifeChange, passTurn]);

  useEffect(() => {
    const interval = setInterval(() => {
        if (myIdRef.current && gameStateRef.current[myIdRef.current] && !isSpectator) {
            socket.emit('update-game-state', {
                userId: myIdRef.current,
                data: gameStateRef.current[myIdRef.current]
            });
        }
    }, 2000); 
    return () => clearInterval(interval);
  }, [isSpectator]);

  // --- JOIN GAME: HANDLES DECK FETCH, SECRET COMMANDER & USERNAME ---
  const joinGame = (spectatorMode, existingStream = null, deckData = null, isSecret = false) => {
    setHasJoined(true);
    setIsSpectator(spectatorMode);
    const constraints = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778 };

    const initPeer = (stream = null) => {
        const myPeer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        peerRef.current = myPeer;
        myPeer.on('open', id => {
          setMyId(id);
          
          // CONSTRUCT INITIAL STATE
          const initialData = { 
              life: 40, poison: 0, cmdDamageTaken: {}, tokens: [], cameraRatio: '16:9',
              commanders: {}, 
              secretCommanders: null,
              // Store user info in gameState for namebars and stats
              username: user ? user.username : `Guest ${id.substr(0,4)}`,
              dbId: user ? user.id : null,
              deckId: selectedDeckId || null
          };

          if (deckData) {
              if (isSecret) {
                  initialData.secretCommanders = deckData; 
              } else {
                  initialData.commanders = deckData; 
              }
          }

          setGameState(prev => ({ ...prev, [id]: initialData }));
          
          if (!spectatorMode) {
              setSeatOrder(prev => { if(prev.includes(id)) return prev; return [...prev, id]; });
          }
          
          socket.emit('join-room', ROOM_ID, id, spectatorMode);
          
          if (!spectatorMode) {
              socket.emit('update-game-state', { userId: id, data: initialData });
          }
        });
        myPeer.on('call', call => { 
            call.answer(stream); 
            call.on('stream', s => addPeer(call.peer, s, call)); 
        });
    };

    if (spectatorMode) {
        initPeer(null); 
    } else if (existingStream) {
        setMyStream(existingStream);
        streamRef.current = existingStream;
        initPeer(existingStream);
    } else {
        navigator.mediaDevices.getUserMedia({ video: constraints, audio: true })
          .then(stream => { 
              setMyStream(stream); 
              streamRef.current = stream; 
              initPeer(stream);
          })
          .catch(err => {
              console.error("Camera Error or denied", err);
              alert("Camera access denied or unavailable. Joining as Spectator.");
              joinGame(true); 
          });
    }
  };

  useEffect(() => {
    socket.on('user-connected', (userId, userIsSpectator) => { 
        if (!peerRef.current) return;
        const call = peerRef.current.call(userId, streamRef.current); 
        if (!userIsSpectator) {
            call.on('stream', s => addPeer(userId, s, call));
            const currentOrder = seatOrderRef.current;
            const newOrder = currentOrder.includes(userId) ? currentOrder : [...currentOrder, userId];
            socket.emit('update-seat-order', newOrder);
            setSeatOrder(newOrder); 
        }
        if (myIdRef.current && gameStateRef.current[myIdRef.current]) {
            socket.emit('update-game-state', { userId: myIdRef.current, data: gameStateRef.current[myIdRef.current] });
        }
    });

    socket.on('full-state-sync', (allData) => { if(allData) setGameState(prev => ({ ...prev, ...allData })); });

    socket.on('user-disconnected', disconnectedId => {
      if (peersRef.current[disconnectedId]) { peersRef.current[disconnectedId].close(); delete peersRef.current[disconnectedId]; }
      setPeers(prev => prev.filter(p => p.id !== disconnectedId));
      setSeatOrder(prev => prev.filter(id => id !== disconnectedId));
      setGameState(prev => { const n = { ...prev }; delete n[disconnectedId]; return n; });
    });

    socket.on('game-state-updated', ({ userId, data }) => { setGameState(prev => ({ ...prev, [userId]: { ...prev[userId], ...data } })); });
    socket.on('turn-state-updated', (newState) => { setTurnState(newState); });
    socket.on('game-reset', ({ gameState: newGS, turnState: newTS }) => { 
        setGameState(newGS); 
        setTurnState(newTS); 
        // --- NEW: FORCE DECK SELECTION ON RESET ---
        setShowDeckSelect(true);
    });
    socket.on('seat-order-updated', (newOrder) => { 
        setSeatOrder(prev => {
            if(myIdRef.current && !newOrder.includes(myIdRef.current) && !isSpectator){
                return [...newOrder, myIdRef.current];
            }
            return newOrder;
        }); 
    });

    socket.on('status-claimed', ({ type, userId: newOwnerId }) => {
        setGameState(prev => {
            const newState = { ...prev };
            Object.keys(newState).forEach(pid => {
                if (type === 'monarch') newState[pid] = { ...newState[pid], isMonarch: false };
                if (type === 'initiative') newState[pid] = { ...newState[pid], isInitiative: false };
            });
            if (newState[newOwnerId]) {
                if (type === 'monarch') newState[newOwnerId] = { ...newState[newOwnerId], isMonarch: true };
                if (type === 'initiative') newState[newOwnerId] = { ...newState[newOwnerId], isInitiative: true };
            }
            return newState;
        });
    });

    return () => { 
      socket.off('user-connected'); socket.off('user-disconnected'); socket.off('game-state-updated'); 
      socket.off('turn-state-updated'); socket.off('game-reset'); socket.off('seat-order-updated');
      socket.off('full-state-sync'); socket.off('status-claimed');
      if(peerRef.current) peerRef.current.destroy(); 
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  function addPeer(id, stream, call) {
    if (call) peersRef.current[id] = call;
    setPeers(prev => prev.some(p => p.id === id) ? prev : [...prev, { id, stream }]);
    if(!gameState[id]) setGameState(prev => ({ ...prev, [id]: { life: 40 } }));
    setSeatOrder(prev => { if(prev.includes(id)) return prev; return [...prev, id]; });
  }

  // --- DERIVE PLAYERS FOR FINISH MODAL ---
  const activePlayers = seatOrder.map(id => ({ id, username: gameState[id]?.username }));

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #111; }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} onLogin={(u, t) => { setUser(u); setToken(t); }} />}
      {showProfile && user && <ProfileScreen user={user} token={token} onClose={() => setShowProfile(false)} onUpdateUser={setUser} onLogout={handleLogout} />}
      {showFinishModal && <FinishGameModal players={activePlayers} onFinish={handleFinishGame} onClose={() => setShowFinishModal(false)} />}
      
      {/* UPDATED: Pass setShowDeckSelect(false) to close modal */}
      {showDeckSelect && hasJoined && !isSpectator && <DeckSelectionModal user={user} token={token} onConfirm={handleDeckConfirm} onOpenProfile={() => { setShowProfile(true); setShowDeckSelect(false); }} onUpdateUser={setUser} />}

      {!hasJoined && (
        <Lobby 
            onJoin={joinGame} 
            user={user} 
            token={token}
            onOpenAuth={() => setShowAuthModal(true)} 
            onOpenProfile={() => setShowProfile(true)}
            onSelectDeck={setSelectedDeckId}
            selectedDeckId={selectedDeckId}
            onUpdateUser={setUser}
        />
      )}

      {hasJoined && (
        <>
          <CardModal cardData={viewCard} onClose={() => setViewCard(null)} />
          {showHistory && <HistoryModal history={searchHistory} onSelect={handleGlobalCardFound} onClose={() => setShowHistory(false)} />}
          <div style={{ height: '100vh', width: '100vw', color: 'white', fontFamily: 'Segoe UI, sans-serif', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '30px', background: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #333', zIndex: 200000, flexShrink: 0 }}>
              <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                  <div style={{fontWeight: 'bold', fontSize: '14px', color: '#c4b5fd'}}>BattleMat</div>
                  <div style={{fontWeight: 'bold', fontSize: '16px', color: '#facc15', marginLeft: '10px'}}>TURN {turnState.count}</div>
                  {user && <div style={{fontSize: '11px', color: '#888', marginLeft: '10px'}}>Logged in as {user.username}</div>}
              </div>
              <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}><HeaderSearchBar onCardFound={handleGlobalCardFound} onToggleHistory={() => setShowHistory(!showHistory)} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={handleInvite} style={{background: '#3b82f6', border: '1px solid #2563eb', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🔗 {inviteText}</button>
                {!isSpectator && (
                    <>
                    <button onClick={() => setShowFinishModal(true)} style={{background: '#b91c1c', border: '1px solid #7f1d1d', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🏆 FINISH GAME</button>
                    <button onClick={randomizeSeats} style={{background: '#333', border: '1px solid #555', color: '#ccc', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>🔀 Seats</button>
                    </>
                )}
                {isSpectator && <div style={{color: '#aaa', fontSize: '12px', fontStyle: 'italic', border: '1px solid #444', padding: '2px 6px', borderRadius: '4px'}}>Spectator Mode</div>}
              </div>
            </div>
            <div ref={containerRef} style={{ flexGrow: 1, width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {seatOrder.length === 0 ? <div style={{color: '#666'}}>Waiting for players...</div> : seatOrder.map(seatId => (
                <VideoContainer 
                  key={seatId} 
                  stream={seatId === myId ? myStream : peers.find(p => p.id === seatId)?.stream} 
                  userId={seatId} 
                  isMyStream={seatId === myId} 
                  myId={myId} 
                  playerData={gameState[seatId]} 
                  updateGame={handleUpdateGame} 
                  width={layout.width} 
                  height={layout.height} 
                  allPlayerIds={seatOrder} 
                  allGameState={gameState} 
                  onDragStart={handleDragStart} 
                  onDrop={handleDrop} 
                  isActiveTurn={turnState.activeId === seatId} 
                  onSwitchRatio={switchCameraStream} 
                  currentRatio={cameraRatio} 
                  onInspectToken={setViewCard} 
                  onClaimStatus={handleClaimStatus} 
                  onRecordStat={handleRecordStat} 
                  onOpenDeckSelect={() => setShowDeckSelect(true)}
                  onLeaveGame={handleLeaveGame}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

const roundBtnLarge = { background: '#555', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold' };
const tinyBtn = { background: '#555', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' };
const menuBtnStyle = { width: '100%', padding: '8px', border: 'none', background: 'transparent', color: '#ccc', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #333' };
const menuItemStyle = { padding: '8px', fontSize: '12px', cursor: 'pointer', color: '#ddd' };
const diceBtnStyle = { background: '#333', border: '1px solid #555', color: '#eee', borderRadius: '3px', padding: '4px', cursor: 'pointer', fontSize: '10px' };

export default App;
