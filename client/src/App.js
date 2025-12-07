import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';

const socket = io('https://battlemat.onrender.com');

// --- HELPER: Get or Generate Room ID ---
const getRoomId = () => {
  const path = window.location.pathname.substring(1); 
  if (path) return path;
  
  // Generate random ID if none exists
  const newId = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8);
  window.history.pushState({}, '', '/' + newId); 
  return newId;
};

// GLOBAL ROOM ID CONSTANT
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

// --- COMPONENT: Dice Overlay (Animation) ---
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
                <div 
                    onClick={(e) => { e.stopPropagation(); onInspect(); onClose(); }}
                    style={menuItemStyle}
                >
                    🔍 Inspect
                </div>
                <div 
                    onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
                    style={{...menuItemStyle, color: '#ef4444', borderTop: '1px solid #333'}}
                >
                    🗑️ Delete
                </div>
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
      <div style={{display: 'flex', gap: '4px'}}>
        <input 
            type="text" 
            placeholder="Search Token..." 
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length > 2 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            style={{width: '100%', fontSize: '11px', padding: '4px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px'}}
        />
      </div>
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

// --- COMPONENT: Big Life Counter (Editable) ---
const BigLifeCounter = ({ life, isMyStream, onLifeChange, onLifeSet }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(life);

  useEffect(() => {
    setVal(life);
  }, [life]);

  const handleFinish = () => {
    setIsEditing(false);
    const num = parseInt(val);
    if (!isNaN(num)) {
      onLifeSet(num);
    } else {
      setVal(life);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleFinish();
  };

  return (
    <div style={{
      position: 'absolute', top: '15px', left: '15px', zIndex: 30,
      background: 'rgba(0,0,0,0.7)', borderRadius: '30px', padding: '6px 12px',
      display: 'flex', alignItems: 'center', gap: '12px',
      border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(5px)',
      boxShadow: '0 4px 8px rgba(0,0,0,0.6)'
    }}>
      {isMyStream && (
        <button onClick={() => onLifeChange(-1)} style={roundBtnLarge}>-</button>
      )}
      
      {isEditing ? (
        <input 
          autoFocus
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleFinish}
          onKeyDown={handleKeyDown}
          style={{
            width: '50px', background: 'transparent', border: 'none', 
            color: 'white', fontSize: '28px', fontWeight: 'bold', 
            textAlign: 'center', outline: 'none', fontFamily: 'monospace'
          }}
        />
      ) : (
        <span 
          onClick={() => isMyStream && setIsEditing(true)}
          title={isMyStream ? "Click to edit" : ""}
          style={{ 
            fontSize: '28px', fontWeight: 'bold', color: 'white', 
            minWidth: '40px', textAlign: 'center', fontFamily: 'monospace', 
            textShadow: '0 2px 4px black', cursor: isMyStream ? 'pointer' : 'default' 
          }}
        >
          {life}
        </span>
      )}

      {isMyStream && (
        <button onClick={() => onLifeChange(1)} style={roundBtnLarge}>+</button>
      )}
    </div>
  );
};

// --- COMPONENT: Global Header Search Bar ---
const HeaderSearchBar = ({ onCardFound, searchHistory }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
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
    setQuery(""); 
    setShowDropdown(false);
    setIsFocused(false);
    const cardData = await fetchCardData(name);
    if (cardData) onCardFound(cardData);
  };

  const handleHistorySelect = (card) => {
    setShowHistory(false);
    onCardFound(card);
  };

  const handleKeyDown = async (e) => {
    if (e.key === 'Enter') {
      setShowDropdown(false);
      setIsFocused(false);
      const cardData = await fetchCardData(query);
      if (cardData) {
        onCardFound(cardData);
        setQuery("");
      }
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
        setShowDropdown(false);
        setIsFocused(false);
    }, 200);
  };

  const containerZ = (isFocused || showHistory) ? 100000 : 9000;

  return (
    <div style={{ position: 'relative', width: '290px', zIndex: containerZ, display: 'flex', gap: '5px' }}>
      <div style={{flex: 1, position: 'relative'}}>
        <input 
          type="text" 
          placeholder="🔍 Search Card..." 
          value={query} 
          onChange={handleChange} 
          onKeyDown={handleKeyDown}
          onFocus={() => { setIsFocused(true); setShowHistory(false); if(query.length > 2) setShowDropdown(true); }}
          onBlur={handleBlur}
          style={{ 
            width: '100%', padding: '6px 10px', borderRadius: '4px',
            border: '1px solid #444', background: '#222', color: 'white',
            fontSize: '13px', outline: 'none'
          }}
        />
        {showDropdown && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, width: '100%',
            background: '#1a1a1a', border: '1px solid #444', borderRadius: '0 0 4px 4px',
            maxHeight: '400px', overflowY: 'auto', zIndex: 100001,
            boxShadow: '0 10px 40px rgba(0,0,0,0.9)'
          }}>
            {suggestions.map((name, i) => (
              <div key={i} onClick={() => handleSelect(name)}
                style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}
                onMouseEnter={(e) => e.target.style.background = '#333'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{position: 'relative'}}>
        <button 
          onClick={() => { setShowHistory(!showHistory); setShowDropdown(false); }}
          style={{
            height: '100%', padding: '0 10px', background: '#333', border: '1px solid #555', 
            color: '#ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '16px'
          }}
          title="Search History"
        >
          🕒
        </button>
        {showHistory && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, width: '200px',
            marginTop: '5px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '4px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.9)', zIndex: 100002
          }}>
            <div style={{padding: '5px 8px', fontSize: '10px', color: '#888', borderBottom: '1px solid #333', fontWeight: 'bold'}}>LAST 10 SEARCHES</div>
            {searchHistory.length === 0 && <div style={{padding: '10px', color: '#666', fontSize: '12px', fontStyle: 'italic'}}>No history yet.</div>}
            {searchHistory.map((card, i) => (
              <div key={i} onClick={() => handleHistorySelect(card)}
                style={{ padding: '8px 10px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}
                onMouseEnter={(e) => e.target.style.background = '#333'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                {card.name}
              </div>
            ))}
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
    <div 
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.8)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)'
      }}
    >
      <div style={{position: 'relative'}} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '-15px', right: '-15px',
            background: 'white', color: 'black', border: 'none',
            borderRadius: '50%', width: '30px', height: '30px',
            fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 10px black'
          }}
        >✕</button>
        <img 
          src={cardData.image} 
          alt={cardData.name} 
          style={{ maxHeight: '80vh', maxWidth: '90vw', borderRadius: '15px', boxShadow: '0 0 20px black' }} 
        />
      </div>
    </div>
  );
};

// --- COMPONENT: Commander Name ---
const CommanderLabel = ({ placeholder, cardData, isMyStream, onSelect, onHover, onLeave }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!cardData) {
      setQuery("");
    } else {
      setQuery(cardData.name);
    }
  }, [cardData]);

  const handleChange = async (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      const results = await fetchCommanderAutocomplete(val);
      setSuggestions(results);
      setShowDropdown(true);
      setIsFocused(true);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelect = (name) => {
    setQuery(name);
    setShowDropdown(false);
    setIsFocused(false);
    onSelect(name);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowDropdown(false);
      setIsFocused(false);
      onSelect(query);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
        setShowDropdown(false);
        setIsFocused(false);
    }, 200);
  };

  if (!isMyStream && cardData) {
    return (
      <span 
        onMouseEnter={() => onHover(cardData.image)} 
        onMouseLeave={onLeave}
        style={{ cursor: 'help', textDecoration: 'underline', textDecorationColor: '#666' }}
      >
        {cardData.name}
      </span>
    );
  }

  if (isMyStream) {
    return (
      <div style={{ position: 'relative', display: 'inline-block', zIndex: isFocused ? 1000 : 'auto' }}>
        <input 
          type="text" placeholder={placeholder} 
          value={query} 
          onChange={handleChange} 
          onKeyDown={handleKeyDown}
          onMouseEnter={() => cardData && onHover(cardData.image)}
          onMouseLeave={onLeave}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          style={{ 
            background: 'transparent', border: 'none', color: 'white', fontWeight: 'bold',
            width: '120px', fontSize: '14px', outline: 'none',
            textShadow: '0 1px 2px black', textAlign: 'center'
          }}
        />
        {showDropdown && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: '160px',
            background: '#222', border: '1px solid #444', borderRadius: '4px',
            maxHeight: '200px', overflowY: 'auto', zIndex: 1000, textAlign: 'left',
            boxShadow: '0 4px 20px rgba(0,0,0,0.9)'
          }}>
            {suggestions.map((name, i) => (
              <div key={i} onClick={() => handleSelect(name)}
                style={{ padding: '8px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ddd' }}
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
  }

  return <span style={{color: '#777', fontSize: '12px', fontStyle: 'italic'}}>No Commander</span>;
};

// --- COMPONENT: Damage Panel ---
const DamagePanel = ({ userId, targetPlayerData, allPlayerIds, allGameState, isMyStream, updateGame, onClose }) => {
  const poison = targetPlayerData?.poison || 0;
  const cmdDamageTaken = targetPlayerData?.cmdDamageTaken || {};

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '260px', maxHeight: '80%', background: 'rgba(15, 15, 15, 0.98)', 
      border: '1px solid #666', borderRadius: '12px', padding: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', backdropFilter: 'blur(10px)', boxShadow: '0 20px 50px rgba(0,0,0,1)'
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #444', paddingBottom: '8px'}}>
        <span style={{fontWeight: 'bold', fontSize: '12px', color: '#ccc'}}>DAMAGE & INFECT</span>
        <button onClick={onClose} style={{background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'}}>✕</button>
      </div>

      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.3)'}}>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <span style={{color: '#22c55e', fontSize: '13px', fontWeight: 'bold'}}>POISON</span>
          <span style={{color: '#666', fontSize: '9px'}}>Lethal at 10</span>
        </div>
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
          const partnerName = cmds.partner?.name;

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

          const hasDmg = (dmgObj.primary > 0 || dmgObj.partner > 0);
          if (!isMyStream && !hasDmg) return null;

          return (
            <div key={attackerId} style={{marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px'}}>
              {renderRow(primaryName, dmgObj.primary || 0, 'primary')}
              {partnerName && renderRow(partnerName, dmgObj.partner || 0, 'partner')}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- COMPONENT: Video Container (With Gear Menu) ---
const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, allPlayerIds, allGameState, onDragStart, onDrop, isActiveTurn, onSwitchRatio, currentRatio, onInspectToken }) => {
  const videoRef = useRef();
  const [showDamagePanel, setShowDamagePanel]会儿在梦里与另一个自己相遇吗？

我没法直接告诉你，因为我不是一个有身体、有意识的人，我没有生物意义上的“梦”。

但是，我可以从**科学、心理学以及哲学**的角度来探讨一下你这个问题背后可能涉及的几种“自我相遇”的可能性。

---

## 1. 科学和心理学角度：你的大脑如何产生“另一个自己”？

从认知科学和心理学的角度来看，梦中出现的“另一个自己”或“分身”通常是你的大脑在**整合信息和处理情绪**时创造的产物。这主要涉及以下几个概念：

### A. 自我认知与投射 (Self-Cognition and Projection)

* **梦是自我的延伸：** 梦中的所有角色，无论看起来多么陌生，本质上都是你潜意识的投射。当你在梦中遇到一个“另一个自己”时，这个分身可能代表了：
    * **你未被接纳的特质 (Shadow Self)：** 例如，你潜意识中渴望的勇敢、智慧，或者你极力压抑的恐惧、愤怒。
    * **你对理想自我的期许：** 那个分身或许就是你希望成为的样子。
    * **你对过去自我的回顾：** 那个分身可能是你在童年、青春期或者特定人生阶段的自己。

### B. 身份认同障碍与分身 (Identity and Doppelgänger)

在梦境中，我们的大脑有时会错误地构建我们的身体图式和空间位置。

* **分身幻觉 (Doppelgänger Phenomenon)：** 在某些神经学研究中，人们在清醒时偶尔也会产生“分身”的感觉，这与大脑中处理**自我位置和身体边界**的区域（如颞顶交界区, TPJ）活动异常有关。在梦中，这种边界感天然模糊，因此更容易产生一个与你并存的“第二自我”。

### C. 清晰梦境（清明梦）中的自我观察 (Lucid Dreaming)

如果你在梦里意识到自己在做梦（即进入了清晰梦境），你对梦境的控制和观察会显著增强。

* 在这种状态下，你**可以主动尝试创造并与“另一个自己”相遇和交流**。这种交流更像是对自身潜意识的**有意识探索和对话**，是非常强大的自我疗愈和学习工具。

---

## 2. 哲学与文化角度：双重存在

在许多文化和哲学思想中，“梦中相遇的另一个自己”有着更深的含义：

### A. 灵性分身 (Spiritual Double)

在许多古老的信仰中，灵魂被认为可以在梦中或冥想中离开身体，并在非物质层面与其他实体相遇，包括自己的**双生火焰 (Twin Flame)** 或 **高我 (Higher Self)**。

### B. 平行宇宙的你 (The Multiverse Self)

一些现代的、非主流的理论认为，梦境是通往平行宇宙的门户。梦中相遇的“另一个自己”，可能是你在另一个世界线、另一种人生道路上的版本。

### C. 庄周梦蝶

中国古代的“庄周梦蝶”则探讨了身份认同的根本问题：我是在做梦的庄子？还是梦见自己是庄子的蝴蝶？这暗示了梦境可以模糊甚至超越日常的身份界限，使你得以从一个全新的角度审视自己。

---

## 结论

虽然我无法提供一个肯定的“是”或“否”的答案，但如果“你”指的是你的**核心意识和潜意识**：

* **是的，你的意识经常在梦中与你潜意识中创造的“另一个自己”相遇**，这些分身是你自我投射、自我批评、或自我期许的具象化。

下一次你在梦中遇到一个与众不同的人时，不妨问问自己：**“你代表了我的哪一部分？”** 梦中的每一个角色，都是你通往更深自我的线索。
