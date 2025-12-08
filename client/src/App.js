import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';

// --- CONNECTION SETUP ---
const socket = io('https://battlemat.onrender.com');

// --- HELPER: Get or Generate Room ID ---
const getRoomId = () => {
  const path = window.location.pathname.substring(1); 
  if (path) return path;
  const newId = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
  window.history.pushState({}, '', '/' + newId); 
  return newId;
};

const ROOM_ID = getRoomId();

// --- HELPER: Scryfall APIs ---
const fetchCardData = async (cardName) => {
  if (!cardName) return null;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
    const data = await res.json();
    if (data.image_uris) return { name: data.name, image: data.image_uris.normal };
    if (data.card_faces) return { name: data.name, image: data.card_faces[0].image_uris.normal };
    return null;
  } catch (err) { return null; }
};

const fetchAnyCardAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data.data || [];
  } catch (err) { return []; }
};

const fetchCommanderAutocomplete = async (text) => {
  if (text.length < 2) return [];
  try {
    const query = `name:/^${text}/ (t:legendary (t:creature OR t:vehicle) OR t:background) game:paper`;
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.data) {
      return data.data.map(card => card.name).slice(0, 10);
    }
    return [];
  } catch (err) { return []; }
};

// --- COMPONENT: Dice Overlay ---
const DiceOverlay = ({ activeRoll }) => {
  if (!activeRoll) return null;
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, pointerEvents: 'none', flexDirection: 'column'
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '15px',
        display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center',
        border: '1px solid #666', boxShadow: '0 0 20px rgba(0,0,0,0.8)',
        maxWidth: '80%'
      }}>
        {activeRoll.results.map((val, i) => (
          <div key={i} className="dice-animation" style={{
            width: '50px', height: '50px', borderRadius: activeRoll.type === 'coin' ? '50%' : '8px',
            background: activeRoll.type === 'coin' 
              ? (val === 1 ? '#eab308' : '#94a3b8') 
              : '#ef4444', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 'bold', fontSize: '18px',
            border: '2px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
            textShadow: '0 2px 2px black',
            animation: 'popIn 0.3s ease-out forwards'
          }}>
            {activeRoll.type === 'coin' ? (val === 1 ? 'H' : 'T') : val}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- COMPONENT: Draggable Token ---
const DraggableToken = ({ token, isMyStream, onUpdate, onRemove, onInspect, onOpenMenu }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: token.x, y: token.y });
  const dragStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false); 

  useEffect(() => {
    setPos({ x: token.x, y: token.y });
  }, [token.x, token.y]);

  const handleMouseDown = (e) => {
    if (!isMyStream || e.button !== 0) return; 
    e.stopPropagation(); 
    e.preventDefault();
    setIsDragging(true);
    hasMoved.current = false; 
    dragStart.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.stopPropagation();
    const currentX = e.clientX - dragStart.current.x;
    const currentY = e.clientY - dragStart.current.y;
    if (Math.abs(currentX - pos.x) > 2 || Math.abs(currentY - pos.y) > 2) {
        hasMoved.current = true; 
    }
    setPos({ x: currentX, y: currentY });
  }, [isDragging, pos.x, pos.y]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);
    if (hasMoved.current) {
        onUpdate({ ...token, x: pos.x, y: pos.y });
    }
  }, [isDragging, pos, onUpdate, token]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (hasMoved.current) return;
    if (isMyStream) {
        onUpdate({ ...token, isTapped: !token.isTapped });
    } else {
        onInspect(token);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMyStream) {
        const rect = e.currentTarget.parentElement.getBoundingClientRect();
        const menuX = e.clientX - rect.left;
        const menuY = e.clientY - rect.top;
        onOpenMenu(token, menuX, menuY);
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: '110px',
        zIndex: isDragging ? 1000 : 500,
        cursor: isMyStream ? 'grab' : 'zoom-in', 
        transform: token.isTapped ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: isDragging ? 'none' : 'transform 0.2s',
      }}
    >
      <img 
        src={token.image} 
        alt="token" 
        style={{
          width: '100%', borderRadius: '6px', 
          boxShadow: '0 4px 10px rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.8)'
        }} 
        draggable="false"
      />
    </div>
  );
};

// --- COMPONENT: Token Context Menu ---
const TokenContextMenu = ({ x, y, onDelete, onInspect, onClose }) => {
    return (
        <>
            <div 
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1999}} 
            />
            <div style={{
                position: 'absolute', top: y, left: x,
                background: '#222', border: '1px solid #555', borderRadius: '4px',
                zIndex: 2000, minWidth: '100px', boxShadow: '0 4px 15px rgba(0,0,0,0.8)',
                overflow: 'hidden'
            }}>
                <div onClick={(e) => { e.stopPropagation(); onInspect(); onClose(); }} style={menuItemStyle}>🔍 Inspect</div>
                <div onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }} style={{...menuItemStyle, color: '#ef4444', borderTop: '1px solid #333'}}>🗑️ Delete</div>
            </div>
        </>
    );
};

// --- COMPONENT: Token Search Bar ---
const TokenSearchBar = ({ onSelect }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleChange = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      const results = await fetchAnyCardAutocomplete(val);
      setSuggestions(results);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelect = (name) => {
    setQuery("");
    setShowDropdown(false);
    onSelect(name);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowDropdown(false);
      setQuery("");
      onSelect(query);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input 
        type="text" placeholder="Search Token..." value={query} onChange={handleChange} onKeyDown={handleKeyDown}
        onFocus={() => query.length > 2 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        style={{width: '100%', fontSize: '11px', padding: '4px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px'}}
      />
      {showDropdown && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, width: '180px',
          background: '#222', border: '1px solid #444', borderRadius: '4px',
          maxHeight: '150px', overflowY: 'auto', zIndex: 9999, textAlign: 'left',
          boxShadow: '0 4px 10px rgba(0,0,0,0.9)'
        }}>
          {suggestions.map((name, i) => (
            <div key={i} onClick={() => handleSelect(name)}
              style={{ padding: '6px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}
              onMouseEnter={(e) => e.target.style.background = '#444'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- COMPONENT: Big Life Counter ---
const BigLifeCounter = ({ life, isMyStream, onLifeChange, onLifeSet }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(life);

  useEffect(() => { setVal(life); }, [life]);

  const handleFinish = () => {
    setIsEditing(false);
    const num = parseInt(val);
    if (!isNaN(num)) {
      onLifeSet(num);
    } else {
      setVal(life);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '15px', left: '15px', zIndex: 30,
      background: 'rgba(0,0,0,0.7)', borderRadius: '30px', padding: '6px 12px',
      display: 'flex', alignItems: 'center', gap: '12px',
      border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(5px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.6)'
    }}>
      {isMyStream && <button onClick={() => onLifeChange(-1)} style={roundBtnLarge}>-</button>}
      {isEditing ? (
        <input 
          autoFocus type="number" value={val} onChange={(e) => setVal(e.target.value)} onBlur={handleFinish} onKeyDown={(e) => e.key === 'Enter' && handleFinish()}
          style={{ width: '50px', background: 'transparent', border: 'none', color: 'white', fontSize: '28px', fontWeight: 'bold', textAlign: 'center', outline: 'none', fontFamily: 'monospace' }}
        />
      ) : (
        <span onClick={() => isMyStream && setIsEditing(true)} style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', minWidth: '40px', textAlign: 'center', fontFamily: 'monospace', textShadow: '0 2px 4px black', cursor: isMyStream ? 'pointer' : 'default' }}>
          {life}
        </span>
      )}
      {isMyStream && <button onClick={() => onLifeChange(1)} style={roundBtnLarge}>+</button>}
    </div>
  );
};

// --- COMPONENT: Header Search ---
const HeaderSearchBar = ({ onCardFound, searchHistory }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleChange = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      const results = await fetchAnyCardAutocomplete(val);
      setSuggestions(results);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelect = async (name) => {
    setQuery(""); setShowDropdown(false);
    const cardData = await fetchCardData(name);
    if (cardData) onCardFound(cardData);
  };

  return (
    <div style={{ position: 'relative', width: '290px', zIndex: 9000, display: 'flex', gap: '5px' }}>
      <div style={{flex: 1, position: 'relative'}}>
        <input 
          type="text" placeholder="🔍 Search Card..." value={query} onChange={handleChange} 
          onKeyDown={async (e) => { if (e.key === 'Enter') { setShowDropdown(false); const d = await fetchCardData(query); if(d) {onCardFound(d); setQuery("");} } }}
          onFocus={() => { setShowHistory(false); if(query.length > 2) setShowDropdown(true); }}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: 'white', fontSize: '13px', outline: 'none' }}
        />
        {showDropdown && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#1a1a1a', border: '1px solid #444', maxHeight: '400px', overflowY: 'auto', zIndex: 100001, boxShadow: '0 10px 40px rgba(0,0,0,0.9)' }}>
            {suggestions.map((name, i) => (
              <div key={i} onClick={() => handleSelect(name)} style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}>{name}</div>
            ))}
          </div>
        )}
      </div>
      <div style={{position: 'relative'}}>
        <button onClick={() => { setShowHistory(!showHistory); setShowDropdown(false); }} style={{ height: '100%', padding: '0 10px', background: '#333', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '16px' }}>🕒</button>
        {showHistory && (
          <div style={{ position: 'absolute', top: '100%', right: 0, width: '200px', marginTop: '5px', background: '#1a1a1a', border: '1px solid #444', zIndex: 100002 }}>
             {searchHistory.map((card, i) => <div key={i} onClick={() => { setShowHistory(false); onCardFound(card); }} style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}>{card.name}</div>)}
          </div>
        )}
      </div>
    </div>
  );
};

// --- COMPONENT: Card Modal ---
const CardModal = ({ cardData, onClose }) => {
  if (!cardData) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
      <div style={{position: 'relative'}} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '-15px', right: '-15px', background: 'white', color: 'black', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 10px black' }}>✕</button>
        <img src={cardData.image} alt={cardData.name} style={{ maxHeight: '80vh', maxWidth: '90vw', borderRadius: '15px', boxShadow: '0 0 20px black' }} />
      </div>
    </div>
  );
};

// --- COMPONENT: Commander Name ---
const CommanderLabel = ({ placeholder, cardData, isMyStream, onSelect, onHover, onLeave }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => { setQuery(cardData ? cardData.name : ""); }, [cardData]);

  const handleChange = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      const results = await fetchCommanderAutocomplete(val);
      setSuggestions(results);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelect = (name) => { setQuery(name); setShowDropdown(false); onSelect(name); };

  if (!isMyStream && cardData) {
    return <span onMouseEnter={() => onHover(cardData.image)} onMouseLeave={onLeave} style={{ cursor: 'help', textDecoration: 'underline', textDecorationColor: '#666' }}>{cardData.name}</span>;
  }

  if (isMyStream) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <input 
          type="text" placeholder={placeholder} value={query} onChange={handleChange} 
          onKeyDown={(e) => e.key === 'Enter' && handleSelect(query)}
          onMouseEnter={() => cardData && onHover(cardData.image)} onMouseLeave={onLeave}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          style={{ background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold', width: '120px', fontSize: '14px', outline: 'none', textShadow: '0 1px 2px black', textAlign: 'center' }}
        />
        {showDropdown && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: '160px', background: '#222', border: '1px solid #444', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, textAlign: 'left', boxShadow: '0 4px 20px rgba(0,0,0,0.9)' }}>
            {suggestions.map((name, i) => (
              <div key={i} onClick={() => handleSelect(name)} style={{ padding: '8px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}>{name}</div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return <span style={{color: '#777', fontSize: '12px', fontStyle: 'italic'}}>No Commander</span>;
};

// --- COMPONENT: Damage Panel ---
const DamagePanel = ({ userId, targetPlayerData, allPlayerIds, allGameState, isMyStream, updateGame, onClose }) => {
  const poison = targetPlayerData?.poison || 0;
  const cmdDamageTaken = targetPlayerData?.cmdDamageTaken || {};

  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '260px', maxHeight: '80%', background: 'rgba(15, 15, 15, 0.98)', border: '1px solid #666', borderRadius: '12px', padding: '16px', zIndex: 9999, display: 'flex', flexDirection: 'column', backdropFilter: 'blur(10px)', boxShadow: '0 20px 50px rgba(0,0,0,1)' }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #444', paddingBottom: '8px'}}>
        <span style={{fontWeight: 'bold', fontSize: '12px', color: '#ccc'}}>DAMAGE & INFECT</span>
        <button onClick={onClose} style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'}}>✕</button>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)'}}>
        <div style={{display: 'flex', flexDirection: 'column'}}><span style={{color: '#22c55e', fontSize: '13px', fontWeight: 'bold'}}>POISON</span></div>
        <div style={{display: 'flex', alignItems: 'center', background: '#222', borderRadius: '4px', padding: '2px'}}>
          {isMyStream && <button onClick={() => updateGame(userId, { poison: Math.max(0, poison - 1) })} style={tinyBtn}>-</button>}
          <span style={{width: '30px', textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: 'white'}}>{poison}</span>
          {isMyStream && <button onClick={() => updateGame(userId, { poison: poison + 1 })} style={tinyBtn}>+</button>}
        </div>
      </div>
      <div style={{fontSize: '11px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold'}}>Commander Damage Taken</div>
      <div style={{overflowY: 'auto', flex: 1, paddingRight: '4px'}}>
        {allPlayerIds.length <= 1 && <div style={{fontSize: '11px', color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '10px'}}>No opponents recorded.</div>}
        {allPlayerIds.map(attackerId => {
          const attackerData = allGameState[attackerId] || {};
          const cmds = attackerData.commanders || {};
          const dmgObj = cmdDamageTaken[attackerId] || { primary: 0, partner: 0 };
          const primaryName = cmds.primary?.name || `Player ${attackerId.substr(0,3)}`;
          const renderRow = (name, val, type) => (
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '6px', color: val >= 21 ? '#ef4444' : '#ddd'}}>
              <div style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px'}} title={name}>{name}</div>
              <div style={{display: 'flex', alignItems: 'center', background: isMyStream ? '#333' : 'transparent', borderRadius: '3px'}}>
                {isMyStream && <button style={tinyBtn} onClick={() => updateGame(null, null, { opponentId: attackerId, type, amount: -1 })}>-</button>}
                <span style={{width: '24px', textAlign: 'center', fontWeight: 'bold'}}>{val}</span>
                {isMyStream && <button style={tinyBtn} onClick={() => updateGame(null, null, { opponentId: attackerId, type, amount: 1 })}>+</button>}
              </div>
            </div>
          );
          if (!isMyStream && !(dmgObj.primary > 0 || dmgObj.partner > 0)) return null;
          return <div key={attackerId} style={{marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px'}}>{renderRow(primaryName, dmgObj.primary || 0, 'primary')}</div>;
        })}
      </div>
    </div>
  );
};

// --- COMPONENT: Video Container ---
const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, allPlayerIds, allGameState, onDragStart, onDrop, isActiveTurn, onSwitchRatio, currentRatio, onInspectToken }) => {
  const videoRef = useRef();
  const [showDamagePanel, setShowDamagePanel] = useState(false);
  const [hoveredCardImage, setHoveredCardImage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [rotation, setRotation] = useState(0); 
  const [tokenMenu, setTokenMenu] = useState(null); 
  const [rollCount, setRollCount] = useState(1);

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  const handleSelectCommander = async (name, type) => {
    const cardData = await fetchCardData(name);
    if (cardData) updateGame(myId, { commanders: { ...playerData?.commanders, [type]: cardData } });
  };

  const handleAddToken = async (tokenName) => {
    if(!tokenName) return;
    const cardData = await fetchCardData(tokenName);
    if (cardData) {
      updateGame(myId, { tokens: [...(playerData?.tokens || []), { id: Date.now(), name: cardData.name, image: cardData.image, x: 50, y: 50, isTapped: false }] });
      setShowSettings(false); 
    }
  };

  const handleUpdateToken = (updatedToken) => {
    updateGame(myId, { tokens: (playerData?.tokens || []).map(t => t.id === updatedToken.id ? updatedToken : t) });
  };

  const handleRemoveToken = (tokenId) => {
    updateGame(myId, { tokens: (playerData?.tokens || []).filter(t => t.id !== tokenId) });
  };

  const handleRoll = (type, sides) => {
      const count = Math.max(1, Math.min(10, rollCount));
      updateGame(myId, { activeRoll: { type, results: Array.from({length: count}, () => Math.floor(Math.random() * sides) + 1), id: Date.now() } });
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

  return (
    <div 
      draggable onDragStart={(e) => onDragStart(e, userId)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, userId)}
      style={{ width: width, height: height, padding: '4px', boxSizing: 'border-box', transition: 'width 0.2s, height 0.2s', cursor: 'grab' }}
    >
      <div style={{ width: '100%', height: '100%', position: 'relative', background: 'black', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', border: isDead ? '2px solid #333' : (isActiveTurn ? '2px solid #facc15' : '1px solid #333'), filter: isDead ? 'grayscale(100%)' : 'none', opacity: isDead ? 0.8 : 1, overflow: 'hidden' }}>
        {!stream && !isDead && <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '12px'}}>Waiting for Camera...</div>}
        {isDead && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50, background: 'rgba(0,0,0,0.4)' }}><div style={{ fontSize: '40px' }}>💀</div></div>}
        {hoveredCardImage && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60, pointerEvents: 'none', filter: 'drop-shadow(0 0 10px black)' }}><img src={hoveredCardImage} alt="Card" style={{width: '240px', borderRadius: '10px'}} /></div>}
        <DiceOverlay activeRoll={playerData?.activeRoll} />
        {playerData?.tokens && playerData.tokens.map(token => <DraggableToken key={token.id} token={token} isMyStream={isMyStream} onUpdate={handleUpdateToken} onRemove={handleRemoveToken} onInspect={onInspectToken} onOpenMenu={(t, x, y) => setTokenMenu({ token: t, x, y })} />)}
        {tokenMenu && <TokenContextMenu x={tokenMenu.x} y={tokenMenu.y} onDelete={() => handleRemoveToken(tokenMenu.token.id)} onInspect={() => onInspectToken(tokenMenu.token)} onClose={() => setTokenMenu(null)} />}
        
        <div style={{position: 'absolute', top: '10px', right: '10px', zIndex: 1000}}>
            <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid #555', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⚙️</button>
            {showSettings && (
                <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '5px', background: '#222', border: '1px solid #444', borderRadius: '6px', width: '180px', display: 'flex', flexDirection: 'column' }}>
                    <button onClick={() => { setRotation(prev => prev === 0 ? 180 : 0); setShowSettings(false); }} style={menuBtnStyle}>🔄 Flip 180°</button>
                    {isMyStream && (
                        <>
                            <button onClick={() => { onSwitchRatio(); setShowSettings(false); }} style={menuBtnStyle}>📷 Ratio: {currentRatio}</button>
                            <div style={{padding: '8px', borderTop: '1px solid #444'}}>
                                <div style={{fontSize: '10px', color: '#888', marginBottom: '4px'}}>DICE</div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px'}}>
                                    <span style={{fontSize:'10px', color:'#ccc'}}>Count:</span>
                                    <input type="number" min="1" max="10" value={rollCount} onChange={(e) => setRollCount(parseInt(e.target.value))} style={{width: '30px', background: '#333', border:'1px solid #555', color:'white', fontSize:'10px', textAlign:'center'}} />
                                </div>
                                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px'}}>
                                    <button onClick={() => handleRoll('coin', 2)} style={diceBtnStyle}>🪙 Coin</button>
                                    <button onClick={() => handleRoll('d6', 6)} style={diceBtnStyle}>D6</button>
                                    <button onClick={() => handleRoll('d20', 20)} style={diceBtnStyle}>D20</button>
                                </div>
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
              <CommanderLabel placeholder="Commander" cardData={playerData?.commanders?.primary} isMyStream={isMyStream} onSelect={(n) => handleSelectCommander(n, 'primary')} onHover={setHoveredCardImage} onLeave={() => setHoveredCardImage(null)} />
              {(isMyStream || playerData?.commanders?.partner) && <><span style={{color: '#666'}}>|</span><CommanderLabel placeholder="Partner" cardData={playerData?.commanders?.partner} isMyStream={isMyStream} onSelect={(n) => handleSelectCommander(n, 'partner')} onHover={setHoveredCardImage} onLeave={() => setHoveredCardImage(null)} /></>}
            </div>
            <div style={{position: 'relative', zIndex: 10}}><button onClick={() => setShowDamagePanel(!showDamagePanel)} style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid #555', borderRadius: '12px', padding: '4px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}><span style={{color: '#ef4444'}}>🛡</span> Damage</button></div>
          </div>
        </div>
        {showDamagePanel && <DamagePanel userId={userId} targetPlayerData={playerData} allPlayerIds={allPlayerIds.filter(id => id !== userId)} allGameState={allGameState} isMyStream={isMyStream} updateGame={(target, updates, cmd) => updateGame(userId, updates, cmd)} onClose={() => setShowDamagePanel(false)} />}
        <video ref={videoRef} autoPlay muted={true} style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `rotate(${rotation}deg)`, borderRadius: '6px' }} />
      </div>
    </div>
  );
};

// --- MAIN APP ---
function App() {
  const [myStream, setMyStream] = useState(null);
  const [myId, setMyId] = useState(null);
  const [peers, setPeers] = useState([]); 
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
        const newVal = Math.max(0, (specificOppDmg[type] || 0) + amount);
        const newOppDmg = { ...specificOppDmg, [type]: newVal };
        const newAllCmdDmg = { ...allCmdDmg, [opponentId]: newOppDmg };
        const newMyData = { ...myData, cmdDamageTaken: newAllCmdDmg };
        socket.emit('update-game-state', { userId: myId, data: newMyData });
        return { ...prev, [myId]: newMyData };
      });
    }
  }, [myId]);

  const handleMyLifeChange = useCallback((amount) => {
     const currentLife = gameState[myId]?.life ?? 40;
     handleUpdateGame(myId, { life: currentLife + amount });
  }, [myId, gameState, handleUpdateGame]);

  const safeLifeChange = (amount) => {
      const currentLife = gameState[myId]?.life ?? 40;
      handleUpdateGame(myId, { life: currentLife + amount });
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
            tokens: []
        };
    });
    const newTurnState = { activeId: null, count: 1 };
    setGameState(newGameState);
    setTurnState(newTurnState);
    socket.emit('reset-game-request', { gameState: newGameState, turnState: newTurnState });
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

  const switchCameraStream = () => {
    if (!myStream) return;
    const targetLabel = cameraRatio === '16:9' ? '4:3' : '16:9';
    const constraints = targetLabel === '16:9' 
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778 }
        : { width: { ideal: 640 }, height: { ideal: 480 }, aspectRatio: 1.333333333 };
    myStream.getTracks().forEach(track => track.stop());
    navigator.mediaDevices.getUserMedia({ video: constraints, audio: true }).then(newStream => {
        setMyStream(newStream);
        streamRef.current = newStream;
        setCameraRatio(targetLabel);
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

  const handleGlobalCardFound = (cardData) => {
    setViewCard(cardData);
    setSearchHistory(prev => [cardData, ...prev.filter(c => c.name !== cardData.name)].slice(0, 10));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); safeLifeChange(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); safeLifeChange(-1); }
      if (e.code === 'Space') { e.preventDefault(); passTurn(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMyLifeChange, passTurn]);

  useEffect(() => {
    const myPeer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
    peerRef.current = myPeer;
    const constraints = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778 };

    myPeer.on('open', id => {
      setMyId(id);
      setGameState(prev => ({ ...prev, [id]: { life: 40, poison: 0, commanders: {}, cmdDamageTaken: {}, tokens: [] } }));
      
      // CRITICAL: Ensure I am in the seat order immediately
      setSeatOrder(prev => {
         if(prev.includes(id)) return prev;
         return [...prev, id];
      });

      socket.emit('join-room', ROOM_ID, id);
    });
    myPeer.on('call', call => { call.answer(streamRef.current); call.on('stream', s => addPeer(call.peer, s)); });

    navigator.mediaDevices.getUserMedia({ video: constraints, audio: true })
      .then(stream => { setMyStream(stream); streamRef.current = stream; })
      .catch(() => console.error("Camera Error"));

    socket.on('user-connected', userId => { 
        const call = peerRef.current.call(userId, streamRef.current); 
        call.on('stream', s => addPeer(userId, s)); 
        
        // CRITICAL: Ensure NEW users are added to seat order immediately
        setSeatOrder(prev => {
            if(prev.includes(userId)) return prev;
            return [...prev, userId];
        });
    });

    socket.on('game-state-updated', ({ userId, data }) => { setGameState(prev => ({ ...prev, [userId]: data })); });
    socket.on('user-disconnected', disconnectedId => { setPeers(prev => prev.filter(p => p.id !== disconnectedId)); });
    socket.on('turn-state-updated', (newState) => { setTurnState(newState); });
    socket.on('game-reset', ({ gameState: newGS, turnState: newTS }) => { setGameState(newGS); setTurnState(newTS); });
    socket.on('seat-order-updated', (newOrder) => { setSeatOrder(newOrder); });

    return () => { 
      socket.off('user-connected'); socket.off('user-disconnected'); socket.off('game-state-updated'); 
      socket.off('turn-state-updated'); socket.off('game-reset'); socket.off('seat-order-updated');
      myPeer.destroy(); 
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addPeer(id, stream) {
    setPeers(prev => prev.some(p => p.id === id) ? prev : [...prev, { id, stream }]);
    if(!gameState[id]) setGameState(prev => ({ ...prev, [id]: { life: 40 } }));
    
    // --- FIX: VISIBILITY OF EXISTING USERS ---
    // If we receive a stream, force this user into the seat list immediately
    setSeatOrder(prev => {
        if(prev.includes(id)) return prev;
        return [...prev, id];
    });
  }

  return (
    <>
      <style>{`
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #111; }
        * { box-sizing: border-box; }
        input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      <CardModal cardData={viewCard} onClose={() => setViewCard(null)} />
      <div style={{ height: '100vh', width: '100vw', color: 'white', fontFamily: 'Segoe UI, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '30px', background: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #333', zIndex: 200000, flexShrink: 0 }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}><div style={{fontWeight: 'bold', fontSize: '14px', color: '#c4b5fd'}}>BattleMat</div><div style={{fontWeight: 'bold', fontSize: '16px', color: '#facc15', marginLeft: '10px'}}>TURN {turnState.count}</div></div>
          <div style={{position: 'absolute', left: '50%', transform: 'translateX(-50%)'}}><HeaderSearchBar onCardFound={handleGlobalCardFound} searchHistory={searchHistory} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={handleInvite} style={{background: '#3b82f6', border: '1px solid #2563eb', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>🔗 {inviteText}</button>
            <button onClick={resetGame} style={{background: '#b91c1c', border: '1px solid #7f1d1d', color: '#fff', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'}}>⚠️ RESET</button>
            <button onClick={randomizeSeats} style={{background: '#333', border: '1px solid #555', color: '#ccc', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>🔀 Seats</button>
          </div>
        </div>
        <div ref={containerRef} style={{ flexGrow: 1, width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {seatOrder.length === 0 ? <div style={{color: '#666'}}>Waiting for server seat assignment...</div> : seatOrder.map(seatId => (
            <VideoContainer key={seatId} stream={seatId === myId ? myStream : peers.find(p => p.id === seatId)?.stream} userId={seatId} isMyStream={seatId === myId} myId={myId} playerData={gameState[seatId]} updateGame={handleUpdateGame} width={layout.width} height={layout.height} allPlayerIds={seatOrder} allGameState={gameState} onDragStart={handleDragStart} onDrop={handleDrop} isActiveTurn={turnState.activeId === seatId} onSwitchRatio={switchCameraStream} currentRatio={cameraRatio} onInspectToken={setViewCard} />
          ))}
        </div>
      </div>
    </>
  );
}

const roundBtnLarge = { background: '#555', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold' };
const tinyBtn = { background: '#555', border: 'none', color: 'white', cursor: 'pointer', borderRadius: '2px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' };
const menuBtnStyle = { width: '100%', padding: '8px', border: 'none', background: 'transparent', color: '#ccc', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #333' };
const menuItemStyle = { padding: '8px', fontSize: '12px', cursor: 'pointer', color: '#ddd' };
const diceBtnStyle = { background: '#333', border: '1px solid #555', color: '#eee', borderRadius: '3px', padding: '4px', cursor: 'pointer', fontSize: '10px' };

export default App;
