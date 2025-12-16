// src/components/GameUI.js
import React, { useState } from 'react';

export const BigLifeCounter = ({ life, isMyStream, onLifeChange, onLifeSet }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(life);

  const handleFinish = () => { setIsEditing(false); const num = parseInt(val); if (!isNaN(num)) onLifeSet(num); else setVal(life); };

  return (
    <div className="life-counter">
      {isMyStream && <button onClick={() => onLifeChange(-1)} style={{background:'none',border:'none',color:'white',fontSize:'20px'}}>-</button>}
      {isEditing ? 
        <input autoFocus type="number" value={val} onChange={(e) => setVal(e.target.value)} onBlur={handleFinish} onKeyDown={(e) => e.key === 'Enter' && handleFinish()} style={{width:'50px', background:'transparent', color:'white', border:'none', fontSize:'24px', textAlign:'center'}} />
      : <span onClick={() => isMyStream && setIsEditing(true)} style={{fontSize:'28px', fontWeight:'bold', cursor: isMyStream ? 'pointer' : 'default'}}>{life}</span>}
      {isMyStream && <button onClick={() => onLifeChange(1)} style={{background:'none',border:'none',color:'white',fontSize:'20px'}}>+</button>}
    </div>
  );
};

export const CommanderLabel = ({ cardData, isMyStream, onHover, onLeave, secretData, onReveal }) => {
  if (secretData) {
      if (isMyStream) return <button onClick={onReveal} style={{background: '#b45309', border: '1px solid #f59e0b', color: 'white', fontSize: '11px', borderRadius: '4px'}}>👁 Reveal</button>;
      return <span style={{color: '#777', fontStyle: 'italic'}}>🙈 Hidden</span>;
  }
  if (cardData) {
      return <span onMouseEnter={() => onHover(cardData)} onMouseLeave={onLeave} style={{ cursor: 'help', fontWeight: 'bold', textDecoration: 'underline' }}>{cardData.name}</span>;
  }
  return <span style={{color: '#777', fontSize: '12px', fontStyle: 'italic'}}>No Commander</span>;
};

export const DiceOverlay = ({ activeRoll }) => {
  if (!activeRoll) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, pointerEvents: 'none' }}>
      <div style={{ background: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '15px', display: 'flex', gap: '10px' }}>
        {activeRoll.results.map((val, i) => (
          <div key={i} style={{ width: '50px', height: '50px', borderRadius: activeRoll.type === 'coin' ? '50%' : '8px', background: activeRoll.type === 'coin' ? (val === 1 ? '#eab308' : '#94a3b8') : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px', border: '2px solid white', animation: 'popIn 0.3s ease-out forwards' }}>
            {activeRoll.type === 'coin' ? (val === 1 ? 'H' : 'T') : val}
          </div>
        ))}
      </div>
    </div>
  );
};
