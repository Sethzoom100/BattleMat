// src/components/VideoContainer.js
import React, { useRef, useEffect, useState } from 'react';
import { BigLifeCounter, CommanderLabel, DiceOverlay } from './GameUI';
import DraggableToken from './DraggableToken'; // Assumed separate or inline
import { MONARCH_CARD, INITIATIVE_CARD } from '../App'; // Import constants if needed

const VideoContainer = ({ stream, userId, isMyStream, playerData, updateGame, myId, width, height, isActiveTurn, onSwitchRatio, onRecordStat, onLeaveGame, onInspectToken }) => {
  const videoRef = useRef();
  const [showSettings, setShowSettings] = useState(false);
  const [rotation, setRotation] = useState(0);

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);

  const life = playerData?.life ?? 40;
  const isDead = life <= 0 || (playerData?.poison || 0) >= 10;
  
  // Calculate aspect ratio fit
  const TARGET_RATIO = 1.777; 
  let finalW = width, finalH = width / TARGET_RATIO;
  if (finalH > height) { finalH = height; finalW = height * TARGET_RATIO; }

  return (
    <div className="player-wrapper" style={{ width, height }}>
      <div className={`player-frame ${isActiveTurn ? 'active-turn' : ''} ${isDead ? 'dead' : ''}`}>
        <div style={{ width: finalW, height: finalH, position: 'relative', margin: '0 auto' }}>
          <video ref={videoRef} autoPlay muted style={{ width: '100%', height: '100%', objectFit: 'fill', transform: `rotate(${rotation}deg)` }} />
          {!stream && !isDead && <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>Waiting for Camera...</div>}
          
          <div className="name-bar">{playerData?.username || "Player"}</div>
          <BigLifeCounter life={life} isMyStream={isMyStream} onLifeChange={(amt) => updateGame(userId, { life: life + amt })} onLifeSet={(val) => updateGame(userId, { life: val })} />
          
          <div className="cmd-zone">
             <CommanderLabel cardData={playerData?.commanders?.primary} isMyStream={isMyStream} onHover={onInspectToken} onLeave={() => onInspectToken(null)} secretData={playerData?.secretCommanders?.primary} onReveal={() => updateGame(userId, { commanders: playerData.secretCommanders, secretCommanders: null })} />
          </div>

          <div style={{position: 'absolute', top: 10, right: 10, zIndex: 1000}}>
             <button onClick={() => setShowSettings(!showSettings)} style={{background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: '50%', width: '30px', height: '30px', border:'1px solid #555'}}>⚙️</button>
             {showSettings && (
                 <div style={{position: 'absolute', right: 0, top: '100%', background: '#222', width: '160px', borderRadius: '5px', overflow:'hidden', border: '1px solid #444'}}>
                     <button className="menu-btn" onClick={() => setRotation(r => r === 0 ? 180 : 0)}>🔄 Flip 180°</button>
                     {isMyStream && <button className="menu-btn" onClick={onSwitchRatio}>📷 Switch Ratio</button>}
                     {isMyStream && <button className="menu-btn" style={{color:'#ef4444'}} onClick={onLeaveGame}>🚪 Leave Game</button>}
                 </div>
             )}
          </div>
          
          <DiceOverlay activeRoll={playerData?.activeRoll} />
        </div>
      </div>
    </div>
  );
};

export default VideoContainer;
