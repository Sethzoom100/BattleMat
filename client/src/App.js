import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';

// --- CONFIGURATION ---
const API_URL = 'https://battlemat.onrender.com'; // Change to http://localhost:3001 for local testing
const socket = io(API_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

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
            const res = await fetch(`${API_URL}/create-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, name: newGroupName })
            });
            const updatedGroups = await res.json();
            onUpdateUser({...user, groups: updatedGroups});
            setNewGroupName("");
        } catch (err) { alert("Error creating group"); }
    };

    const handleJoinGroup = async () => {
        if(!joinCode) return;
        try {
            const res = await fetch(`${API_URL}/join-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, code: joinCode.toUpperCase() })
            });
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
    
    const handleLeave = async () => {
        if(!window.confirm("Are you sure you want to leave this group?")) return;
        try {
            const res = await fetch(`${API_URL}/leave-group`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, groupId: groupDetails._id })
            });
            const updatedGroups = await res.json();
            onUpdateUser({...user, groups: updatedGroups});
            setView('list'); 
        } catch (err) { alert("Error leaving group"); }
    };

    const handleKick = async (targetId) => {
        if(!window.confirm("Kick this user?")) return;
        try {
            const res = await fetch(`${API_URL}/kick-member`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: user.id, targetId, groupId: groupDetails._id })
            });
            if (!res.ok) throw new Error("Failed to kick");
            const updatedMembers = groupDetails.members.filter(m => m._id !== targetId);
            const updatedDetails = { ...groupDetails, members: updatedMembers };
            setGroupDetails(updatedDetails);
            calculateLeaderboard(updatedDetails, lbType, lbTimeframe); 
        } catch (err) { alert(err.message); }
    };

    const calculateLeaderboard = (details, type, time) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        let data = [];

        if (type === 'players') {
            data = details.members.map(m => {
                let wins = 0;
                let games = 0;
                if (time === 'all') {
                    wins = m.stats.wins;
                    games = m.stats.gamesPlayed;
                } else {
                    const monthlyMatches = (m.matchHistory || []).filter(match => {
                        const d = new Date(match.date);
                        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                    });
                    games = monthlyMatches.length;
                    wins = monthlyMatches.filter(match => match.result === 'win').length;
                }
                return { name: m.username, wins, games, winRate: games > 0 ? (wins/games) : 0 };
            });
        } else {
            let allDecks = [];
            details.members.forEach(m => {
                m.decks.forEach(d => {
                    let wins = 0;
                    let games = 0;
                    if (time === 'all') {
                        wins = d.wins;
                        games = d.wins + d.losses;
                    } else {
                        const deckMatches = (m.matchHistory || []).filter(match => {
                            const date = new Date(match.date);
                            return match.deckId === d._id && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
                        });
                        games = deckMatches.length;
                        wins = deckMatches.filter(match => match.result === 'win').length;
                    }
                    if (games > 0) {
                        allDecks.push({ 
                            name: d.name, 
                            owner: m.username, 
                            wins, 
                            games, 
                            winRate: (wins/games) 
                        });
                    }
                });
            });
            data = allDecks;
        }

        data.sort((a,b) => b.winRate - a.winRate || b.wins - a.wins);
        setLeaderboardData(data);
    };

    useEffect(() => {
        if(groupDetails) calculateLeaderboard(groupDetails, lbType, lbTimeframe);
    }, [lbType, lbTimeframe, groupDetails]);

    const copyInvite = () => {
        if(groupDetails) {
            navigator.clipboard.writeText(groupDetails.code);
            alert("Group Code Copied: " + groupDetails.code);
        }
    };
    
    const isAdmin = groupDetails && groupDetails.admins && groupDetails.admins.includes(user.id);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#111', zIndex: 100000, overflowY: 'auto', padding: '40px', boxSizing: 'border-box', color: 'white' }}>
            <button onClick={onClose} style={{position: 'absolute', top: '20px', right: '30px', fontSize: '24px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}>✕ Close</button>
            
            {view === 'list' && (
                <>
                    <h1 style={{color: '#c4b5fd', borderBottom: '1px solid #333', paddingBottom: '10px'}}>My Groups</h1>
                    <div style={{display:'flex', gap:'20px', marginBottom:'30px', flexWrap:'wrap'}}>
                        <div style={{background: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444', flex: 1, minWidth: '250px'}}>
                            <h3 style={{marginTop:0}}>Create Group</h3>
                            <div style={{display:'flex', gap:'5px'}}>
                                <input type="text" placeholder="Group Name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} style={{...inputStyle, flex:1}} />
                                <button onClick={handleCreateGroup} style={{background:'#2563eb', border:'none', color:'white', padding:'8px 12px', borderRadius:'4px', cursor:'pointer'}}>Create</button>
                            </div>
                        </div>
                        <div style={{background: '#222', padding: '15px', borderRadius: '8px', border: '1px solid #444', flex: 1, minWidth: '250px'}}>
                            <h3 style={{marginTop:0}}>Join Group</h3>
                            <div style={{display:'flex', gap:'5px'}}>
                                <input type="text" placeholder="Enter Code (6 chars)" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{...inputStyle, flex:1, textTransform:'uppercase'}} maxLength={6} />
                                <button onClick={handleJoinGroup} style={{background:'#16a34a', border:'none', color:'white', padding:'8px 12px', borderRadius:'4px', cursor:'pointer'}}>Join</button>
                            </div>
                        </div>
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px'}}>
                        {user.groups && user.groups.map(g => (
                            <div key={g._id} onClick={() => openGroupDetail(g)} style={{background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '20px', cursor:'pointer', textAlign:'center'}}>
                                <div style={{fontSize:'18px', fontWeight:'bold', marginBottom:'5px'}}>{g.name}</div>
                                <div style={{fontSize:'12px', color:'#666'}}>Click to view</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {view === 'detail' && groupDetails && (
                <div>
                    <button onClick={() => setView('list')} style={{background: 'transparent', border:'none', color:'#aaa', cursor:'pointer', marginBottom:'10px'}}>← Back to List</button>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #333', paddingBottom:'10px', marginBottom:'20px'}}>
                        <div>
                            <h1 style={{color: '#c4b5fd', margin: 0}}>{groupDetails.name}</h1>
                            <div style={{color:'#666', fontSize:'14px', marginTop:'5px'}}>Code: <span style={{color:'#fff', fontWeight:'bold'}}>{groupDetails.code}</span></div>
                        </div>
                        <div style={{display:'flex', gap:'10px'}}>
                            <button onClick={copyInvite} style={{background: '#7c3aed', border:'none', color:'white', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🔗 Invite</button>
                            <button onClick={handleLeave} style={{background: '#ef4444', border:'none', color:'white', padding:'8px 16px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>🚪 Leave Group</button>
                        </div>
                    </div>

                    <h3 style={{borderBottom:'1px solid #333', paddingBottom:'5px'}}>Members ({groupDetails.members.length})</h3>
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'10px', marginBottom:'30px'}}>
                        {groupDetails.members.map(m => (
                            <div key={m._id} style={{background: '#222', padding: '10px', borderRadius: '4px', border:'1px solid #333', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <div>
                                    <div style={{fontWeight:'bold'}}>{m.username} {(groupDetails.admins || []).includes(m._id) && <span style={{color:'#facc15', fontSize:'10px'}}>(Admin)</span>}</div>
                                </div>
                                {isAdmin && m._id !== user.id && (
                                    <button onClick={(e) => { e.stopPropagation(); handleKick(m._id); }} style={{background:'transparent', border:'1px solid #ef4444', color:'#ef4444', cursor:'pointer', padding:'2px 6px', borderRadius:'4px', fontSize:'10px'}}>Kick</button>
                                )}
                            </div>
                        ))}
                    </div>

                    <div style={{display:'flex', gap:'15px', marginBottom:'20px', alignItems:'center'}}>
                        <div style={{display:'flex', background:'#333', borderRadius:'4px', padding:'2px'}}>
                            <button onClick={() => setLbType('players')} style={{padding:'6px 12px', border:'none', borderRadius:'3px', background: lbType === 'players' ? '#4f46e5' : 'transparent', color:'white', cursor:'pointer'}}>Players</button>
                            <button onClick={() => setLbType('decks')} style={{padding:'6px 12px', border:'none', borderRadius:'3px', background: lbType === 'decks' ? '#4f46e5' : 'transparent', color:'white', cursor:'pointer'}}>Decks</button>
                        </div>
                        <select value={lbTimeframe} onChange={e => setLbTimeframe(e.target.value)} style={{padding:'6px', borderRadius:'4px', background:'#333', color:'white', border:'1px solid #555', outline:'none'}}>
                            <option value="all">All Time</option>
                            <option value="month">This Month</option>
                        </select>
                    </div>

                    <div style={{background:'#1a1a1a', border:'1px solid #333', borderRadius:'8px', overflow:'hidden'}}>
                        <div style={{display:'grid', gridTemplateColumns: lbType === 'players' ? '1fr 1fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', background:'#222', padding:'10px', fontWeight:'bold', fontSize:'12px', color:'#aaa'}}>
                            <div>{lbType === 'players' ? 'PLAYER' : 'DECK'}</div>
                            {lbType === 'decks' && <div>OWNER</div>}
                            <div style={{textAlign:'center'}}>WINS</div>
                            <div style={{textAlign:'center'}}>GAMES</div>
                            <div style={{textAlign:'right'}}>WIN RATE</div>
                        </div>
                        {leaderboardData.length === 0 && <div style={{padding:'20px', textAlign:'center', color:'#666'}}>No stats recorded for this period.</div>}
                        {leaderboardData.map((row, i) => (
                            <div key={i} style={{display:'grid', gridTemplateColumns: lbType === 'players' ? '1fr 1fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', padding:'12px 10px', borderBottom:'1px solid #333', alignItems:'center'}}>
                                <div style={{fontWeight:'bold'}}>{i+1}. {row.name}</div>
                                {lbType === 'decks' && <div style={{fontSize:'12px', color:'#888'}}>{row.owner}</div>}
                                <div style={{textAlign:'center', color:'#22c55e'}}>{row.wins}</div>
                                <div style={{textAlign:'center'}}>{row.games}</div>
                                <div style={{textAlign:'right'}}>{Math.round(row.winRate * 100)}%</div>
                            </div>
                        ))}
                    </div>
                </div>
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
    const [useCycle, setUseCycle] = useState(() => localStorage.getItem('battlemat_use_cycle') === 'true');
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
                                <input 
                                    type="checkbox" 
                                    checked={useCycle} 
                                    onChange={e => {
                                        setUseCycle(e.target.checked);
                                        localStorage.setItem('battlemat_use_cycle', e.target.checked);
                                    }} 
                                    id="cycleCheckModal" 
                                    style={{cursor:'pointer'}} 
                                />
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
const ProfileScreen = ({ user, token, onClose, onUpdateUser }) => {
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
  if (secretData) {
      if (isMyStream) return <button onClick={(e) => { e.stopPropagation(); onReveal(); }} style={{background: '#b45309', border: '1px solid #f59e0b', color: 'white', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer', padding: '1px 4px', borderRadius: '2px'}}>👁 Reveal {secretData.name}</button>;
      return <span style={{color: '#777', fontStyle: 'italic', fontSize: '10px'}}>🙈 Hidden</span>;
  }

  if (cardData) {
      return (
        <span 
            onMouseEnter={() => onHover(cardData)} 
            onMouseLeave={onLeave} 
            style={{ cursor: 'help', color: '#ccc', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', display: 'block' }}
        >
            {cardData.name}
        </span>
      );
  }

  return <span style={{color: '#555', fontSize: '10px', fontStyle: 'italic'}}>No Commander</span>;
};

// --- UPDATED: DAMAGE PANEL (DROPDOWN STYLE WITH 2 COLUMNS) ---
const DamagePanel = ({ userId, targetPlayerData, allPlayerIds, allGameState, isMyStream, updateGame, onClaimStatus, onClose }) => {
  const poison = targetPlayerData?.poison || 0;
  const cmdDamageTaken = targetPlayerData?.cmdDamageTaken || {};

  return (
    <div style={{ 
        position: 'absolute', top: '50px', left: '10px', 
        width: '380px', maxHeight: 'calc(100% - 60px)', 
        background: 'rgba(20, 20, 20, 0.98)', border: '1px solid #555', 
        borderRadius: '8px', padding: '12px', zIndex: 2000, 
        display: 'flex', flexDirection: 'column', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)'
    }} onClick={(e) => e.stopPropagation()}> {/* Prevent click propagation to backdrop */}
      
      {/* Header */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #444', paddingBottom: '8px'}}>
        <span style={{fontWeight: 'bold', fontSize: '12px', color: '#ccc'}}>GAME STATUS & DAMAGE</span>
      </div>

      <div style={{display: 'flex', gap: '15px', flex: 1, overflow: 'hidden'}}>
        
        {/* LEFT COLUMN: Damage & Poison */}
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto'}}>
            
            {/* Poison Row */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', background: 'rgba(34, 197, 94, 0.1)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)'}}>
                <span style={{color: '#22c55e', fontSize: '12px', fontWeight: 'bold'}}>POISON</span>
                <div style={{display: 'flex', alignItems: 'center', background: '#111', borderRadius: '4px', padding: '2px'}}>
                    {isMyStream && <button onClick={() => updateGame(userId, { poison: Math.max(0, poison - 1) })} style={tinyBtn}>-</button>}
                    <span style={{width: '24px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px', color: 'white'}}>{poison}</span>
                    {isMyStream && <button onClick={() => updateGame(userId, { poison: poison + 1 })} style={tinyBtn}>+</button>}
                </div>
            </div>

            {/* Commander Damage Header */}
            <div style={{fontSize: '10px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', fontWeight: 'bold'}}>Commander Damage</div>
            
            {/* List */}
            <div style={{flex: 1, overflowY: 'auto'}}>
                {allPlayerIds.length <= 1 && <div style={{fontSize: '11px', color: '#555', fontStyle: 'italic', padding: '5px'}}>No opponents.</div>}
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

        {/* RIGHT COLUMN: Status Actions */}
        {isMyStream && (
            <div style={{width: '110px', borderLeft: '1px solid #444', paddingLeft: '15px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                <div style={{fontSize: '10px', color: '#888', textTransform: 'uppercase', fontWeight: 'bold'}}>Status</div>
                
                {/* --- UPDATE: ADDED onClose() TO BUTTONS --- */}
                <button 
                    onClick={() => { onClaimStatus('monarch'); onClose(); }} 
                    style={{...menuBtnStyle, border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.1)', color: '#facc15', textAlign: 'center', borderRadius: '6px', padding: '8px 4px'}}
                >
                    👑 Monarch
                </button>
                
                <button 
                    onClick={() => { onClaimStatus('initiative'); onClose(); }} 
                    style={{...menuBtnStyle, border: '1px solid #a8a29e', background: 'rgba(168, 162, 158, 0.1)', color: '#e5e5e5', textAlign: 'center', borderRadius: '6px', padding: '8px 4px'}}
                >
                    🏰 Initiative
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

// --- UPDATED: VIDEO CONTAINER (SpellTable Style + Clean Settings) ---
const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, allPlayerIds, allGameState, onDragStart, onDrop, isActiveTurn, onSwitchRatio, currentRatio, onInspectToken, onClaimStatus, onRecordStat, onOpenDeckSelect, onLeaveGame, isHost }) => {
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

  // Combine primary and partner for the label
  const primary = playerData?.commanders?.primary;
  const partner = playerData?.commanders?.partner;

  return (
    <div 
        draggable={isHost} 
        onDragStart={(e) => isHost && onDragStart(e, userId)} 
        onDragOver={(e) => isHost && e.preventDefault()} 
        onDrop={(e) => isHost && onDrop(e, userId)} 
        // --- ADDED position: relative so absolute menus work ---
        style={{ width: width, height: height, padding: '4px', boxSizing: 'border-box', transition: 'width 0.2s, height 0.2s', cursor: isHost ? 'grab' : 'default', position: 'relative' }}
    >
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'black', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', border: isDead ? '2px solid #333' : (isActiveTurn ? '2px solid #facc15' : '1px solid #333'), filter: isDead ? 'grayscale(100%)' : 'none', opacity: isDead ? 0.8 : 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* --- BACKDROP FOR CLICKING OFF --- */}
        { (showSettings || showDamagePanel) && (
            <div 
                style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1500}} 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    setShowSettings(false); 
                    setShowDamagePanel(false); 
                }}
            /> 
        )}

        {/* --- TOP BAR --- */}
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '50px',
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 10px', zIndex: 100, borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
            
            {/* LEFT: Life + Info */}
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                <BigLifeCounter 
                    life={life} 
                    isMyStream={isMyStream} 
                    onLifeChange={(amt) => updateGame(userId, { life: life + amt })} 
                    onLifeSet={(val) => updateGame(userId, { life: val })} 
                />
                
                {/* Player Info (Click to Open Damage) */}
                <div 
                    onClick={() => setShowDamagePanel(!showDamagePanel)}
                    title="Click to view Damage / Infect"
                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden', paddingRight: '10px' }}
                >
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'white', lineHeight: '1.2' }}>
                        {playerData?.username || "Player"}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <CommanderLabel 
                            cardData={primary} 
                            isMyStream={isMyStream} 
                            onHover={setHoveredCard} 
                            onLeave={() => setHoveredCard(null)} 
                            secretData={playerData?.secretCommanders?.primary}
                            onReveal={() => updateGame(userId, { commanders: playerData.secretCommanders, secretCommanders: null })}
                        />
                        {partner && <span style={{color:'#666', fontSize:'10px'}}>+</span>}
                        {partner && (
                            <CommanderLabel 
                                cardData={partner} 
                                isMyStream={isMyStream} 
                                onHover={setHoveredCard} 
                                onLeave={() => setHoveredCard(null)} 
                                secretData={playerData?.secretCommanders?.partner}
                                onReveal={() => updateGame(userId, { commanders: playerData.secretCommanders, secretCommanders: null })}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT: Settings Button */}
            <button 
                onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} 
                style={{ background: 'transparent', color: '#888', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center' }}
            >
                ⚙️
            </button>
        </div>

        <div style={{ width: finalW, height: finalH, position: 'relative', overflow: 'hidden' }}>
            {!stream && !isDead && <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '12px'}}>Waiting for Camera...</div>}
            <video ref={videoRef} autoPlay muted={true} style={{ width: '100%', height: '100%', objectFit: 'fill', transform: `rotate(${rotation}deg)` }} />
            {isDead && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.4)' }}><div style={{ fontSize: '40px' }}>💀</div></div>}
            
            {hoveredCard && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60, pointerEvents: 'none', filter: 'drop-shadow(0 0 10px black)', display: 'flex', gap: '5px' }}>
                    <img src={hoveredCard.image} alt="Card" style={{width: '240px', borderRadius: '10px'}} />
                    {hoveredCard.backImage && <img src={hoveredCard.backImage} alt="Card Back" style={{width: '240px', borderRadius: '10px'}} />}
                </div>
            )}

            <DiceOverlay activeRoll={playerData?.activeRoll} />
            {playerData?.tokens && playerData.tokens.map(token => <DraggableToken key={token.id} token={token} isMyStream={isMyStream} onUpdate={handleUpdateToken} onRemove={handleRemoveToken} onInspect={onInspectToken} onOpenMenu={(t, x, y) => setTokenMenu({ token: t, x, y })} />)}
            {tokenMenu && <TokenContextMenu x={tokenMenu.x} y={tokenMenu.y} onDelete={() => handleRemoveToken(tokenMenu.token.id)} onInspect={() => onInspectToken(tokenMenu.token)} onToggleCounter={() => handleUpdateToken({...tokenMenu.token, counter: tokenMenu.token.counter ? null : 1})} onClose={() => setTokenMenu(null)} />}
            
            {/* Moved Status Icons down */}
            <div style={{position: 'absolute', top: '60px', left: '5px', display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 40}}>
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

            {showDamagePanel && <DamagePanel userId={userId} targetPlayerData={playerData} allPlayerIds={allPlayerIds.filter(id => id !== userId)} allGameState={allGameState} isMyStream={isMyStream} updateGame={(target, updates, cmd) => updateGame(userId, updates, cmd)} onClaimStatus={onClaimStatus} onClose={() => setShowDamagePanel(false)} />}
        </div>
      </div>

      {/* --- SETTINGS MENU (Outside Overflow) --- */}
      {showSettings && (
            <div style={{ position: 'absolute', top: '50px', right: '10px', zIndex: 2000, background: '#222', border: '1px solid #444', borderRadius: '6px', width: '180px', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
                <button onClick={() => { setRotation(prev => prev === 0 ? 180 : 0); setShowSettings(false); }} style={menuBtnStyle}>🔄 Flip 180°</button>
                {isMyStream && (
                    <>
                        <button onClick={() => { onOpenDeckSelect(); setShowSettings(false); }} style={menuBtnStyle}>🔄 Change Deck</button>

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
  const [showGroups, setShowGroups] = useState(false); 
  
  // --- AUTH STATE ---
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [showFinishModal, setShowFinishModal] = useState(false); 
  const [showDeckSelect, setShowDeckSelect] = useState(false); 
  const [hostId, setHostId] = useState(null); 

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

  // --- AUTO LOGIN ---
  useEffect(() => {
    const savedToken = localStorage.getItem('battlemat_token');
    const savedUser = localStorage.getItem('battlemat_user');
    if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
    }
  }, []);
  
  // --- SYNC USER TO LOCAL STORAGE ---
  useEffect(() => {
    if (user) {
        localStorage.setItem('battlemat_user', JSON.stringify(user));
    }
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('battlemat_token');
    localStorage.removeItem('battlemat_user');
    setUser(null);
    setToken(null);
    setShowProfile(false);
  };
  
  // --- UPDATED GAME UPDATE LOGIC (FIXES DESYNC) ---
  const handleUpdateGame = useCallback((targetUserId, updates, cmdDmgUpdate = null) => {
    // 1. Direct Updates (Life, Poison, Tokens, etc.)
    if (targetUserId && updates) {
        // Optimistic local update for self
        if (targetUserId === myId) {
            setGameState(prev => ({
                ...prev,
                [myId]: { ...prev[myId], ...updates }
            }));
        } else {
            // Optimistic update for others (e.g. Poison logic)
            setGameState(prev => ({
                ...prev,
                [targetUserId]: { ...prev[targetUserId], ...updates }
            }));
        }
        // Emit DELTA (only changes) to server
        socket.emit('update-game-state', { userId: targetUserId, data: updates });
    }

    // 2. Commander Damage Logic
    if (cmdDmgUpdate) {
        const { opponentId, type, amount } = cmdDmgUpdate;
        setGameState(prev => {
            const myData = prev[myId] || {};
            const allCmdDmg = myData.cmdDamageTaken || {};
            const specificOppDmg = allCmdDmg[opponentId] || { primary: 0, partner: 0 };
            
            const currentVal = specificOppDmg[type] || 0;
            const newVal = Math.max(0, currentVal + amount);
            
            // Construct Delta for cmd damage
            const diff = {
                cmdDamageTaken: {
                    ...allCmdDmg,
                    [opponentId]: { ...specificOppDmg, [type]: newVal }
                }
            };

            // Calculate implied life change
            // (We calculate delta here so we don't overwrite life if it changed elsewhere)
            let newLife = myData.life ?? 40;
            if (newVal !== currentVal) newLife -= (newVal - currentVal);
            diff.life = newLife;

            // Emit DELTA
            socket.emit('update-game-state', { userId: myId, data: diff });
            
            return { ...prev, [myId]: { ...myData, ...diff } };
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

  const handleDeckConfirm = (deckData, isSecret, deckId) => {
      setSelectedDeckId(deckId); 
      
      const updates = { 
          deckId: deckId, 
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
          
          if (user && user.id) {
            const res = await fetch(`${API_URL}/user/${user.id}`);
            const updatedUser = await res.json();
            setUser(updatedUser); 
            localStorage.setItem('battlemat_user', JSON.stringify(updatedUser)); 
          }
          
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

  // --- RECONNECTION HANDLER (Fixes Desync after time) ---
  useEffect(() => {
    const handleReconnect = () => {
        if (hasJoined && myId) {
            console.log("🔄 Connection restored. Re-syncing...");
            // 1. Re-register with the room
            socket.emit('join-room', ROOM_ID, myId, isSpectator);
            
            // 2. Force-push local data to server (heals server if it restarted)
            if (gameStateRef.current[myId]) {
                socket.emit('update-game-state', { userId: myId, data: gameStateRef.current[myId] });
            }
            
            // 3. If Host, restore turn state
            if (myId === hostId && turnStateRef.current) { // Use ref for current host/turn check
                socket.emit('update-turn-state', turnStateRef.current);
            }
        }
    };

    socket.on('connect', handleReconnect);
    return () => socket.off('connect', handleReconnect);
  }, [hasJoined, myId, isSpectator, hostId]);

  const joinGame = (spectatorMode, existingStream = null, deckData = null, isSecret = false) => {
    setHasJoined(true);
    setIsSpectator(spectatorMode);
    const constraints = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778 };

    const initPeer = (stream = null) => {
        const myPeer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
        peerRef.current = myPeer;
        myPeer.on('open', id => {
          setMyId(id);
          
          const initialData = { 
              life: 40, poison: 0, cmdDamageTaken: {}, tokens: [], cameraRatio: '16:9',
              commanders: {}, 
              secretCommanders: null,
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
              // Initial sync: Send everything for the first time
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

    // --- FIXED: LISTEN FOR FULL STATE (INCLUDING TURN) ---
    // --- THIS UNPACKS THE 'gameState' and 'turnState' correctly ---
    socket.on('full-state-sync', (data) => { 
        if (data) {
            if (data.gameState) {
                setGameState(prev => ({ ...prev, ...data.gameState }));
            }
            if (data.turnState) {
                setTurnState(data.turnState);
            }
        }
    });

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

    socket.on('host-update', (newHostId) => {
        setHostId(newHostId);
    });

    return () => { 
      socket.off('user-connected'); socket.off('user-disconnected'); socket.off('game-state-updated'); 
      socket.off('turn-state-updated'); socket.off('game-reset'); socket.off('seat-order-updated');
      socket.off('full-state-sync'); socket.off('status-claimed');
      socket.off('host-update');
      if(peerRef.current) peerRef.current.destroy(); 
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- FIXED addPeer FUNCTION ---
  // Uses gameStateRef to avoid overwriting data if it already exists
  function addPeer(id, stream, call) {
    if (call) peersRef.current[id] = call;
    setPeers(prev => prev.some(p => p.id === id) ? prev : [...prev, { id, stream }]);
    
    // Only initialize default state if we DON'T have data for this user yet
    if(!gameStateRef.current[id]) {
        setGameState(prev => ({ ...prev, [id]: { life: 40 } }));
    }
    
    setSeatOrder(prev => { if(prev.includes(id)) return prev; return [...prev, id]; });
  }

  const activePlayers = seatOrder.map(id => ({ id, username: gameState[id]?.username }));
  const isHost = myId === hostId; 

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
      {showProfile && user && <ProfileScreen user={user} token={token} onClose={() => setShowProfile(false)} onUpdateUser={setUser} />}
      {showFinishModal && <FinishGameModal players={activePlayers} onFinish={handleFinishGame} onClose={() => setShowFinishModal(false)} />}
      
      {showGroups && user && <GroupsModal user={user} onClose={() => setShowGroups(false)} onUpdateUser={setUser} />}

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
            onLogout={handleLogout}
            onOpenGroups={() => setShowGroups(true)}
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
                  {isHost && <div style={{fontSize: '10px', background: '#f59e0b', color: 'black', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>HOST</div>}
              </div>
              <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}><HeaderSearchBar onCardFound={handleGlobalCardFound} onToggleHistory={() => setShowHistory(!showHistory)} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={handleInvite} style={{background: '#3b82f6', border: '1px solid #2563eb', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🔗 {inviteText}</button>
                {/* --- ADDED LEAVE BUTTON HERE --- */}
                {!isSpectator && (
                    <button onClick={handleLeaveGame} style={{background: '#333', border: '1px solid #555', color: '#fca5a5', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🚪 Leave Game</button>
                )}
                {!isSpectator && isHost && (
                    <>
                    <button onClick={() => setShowFinishModal(true)} style={{background: '#b91c1c', border: '1px solid #7f1d1d', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🏆 FINISH GAME</button>
                    <button onClick={randomizeSeats} style={{background: '#333', border: '1px solid #555', color: '#ccc', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>🔀 Seats</button>
                    </>
                )}
                {isSpectator && (
                    <>
                      <div style={{color: '#aaa', fontSize: '12px', fontStyle: 'italic', border: '1px solid #444', padding: '2px 6px', borderRadius: '4px'}}>Spectator Mode</div>
                      <button onClick={handleLeaveGame} style={{background: '#333', border: '1px solid #555', color: '#fca5a5', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🚪 Leave</button>
                    </>
                )}
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
                  isHost={isHost}
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
