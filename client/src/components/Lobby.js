// src/components/Lobby.js
import React, { useState, useEffect, useRef } from 'react';

const Lobby = ({ onJoin, user, onOpenAuth, onOpenProfile, onSelectDeck, selectedDeckId }) => {
  const [step, setStep] = useState('mode');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (step === 'setup') {
        navigator.mediaDevices.enumerateDevices().then(ds => {
            const videos = ds.filter(d => d.kind === 'videoinput');
            setDevices(videos);
            if(videos[0]) setDeviceId(videos[0].deviceId);
        });
    }
  }, [step]);

  useEffect(() => {
      if(step === 'setup' && deviceId) {
          navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 } }, audio: true })
            .then(s => { setStream(s); if(videoRef.current) videoRef.current.srcObject = s; });
      }
  }, [step, deviceId]);

  const handleJoin = () => onJoin(false, stream);

  if (step === 'mode') {
      return (
          <div className="lobby-container">
              <h1 style={{color: '#c4b5fd', fontSize: '3rem', marginBottom: '40px'}}>BattleMat</h1>
              <div style={{display: 'flex', gap: '20px'}}>
                  <button onClick={() => setStep('setup')} className="lobby-btn">🎥 Join Player</button>
                  <button onClick={() => onJoin(true, null)} className="lobby-btn" style={{background: '#333'}}>👁 Spectate</button>
              </div>
              <div style={{marginTop: '30px'}}>
                 {!user ? <button onClick={onOpenAuth} style={{background:'none', border:'none', color:'#888', textDecoration:'underline'}}>Login / Register</button>
                 : <button onClick={onOpenProfile} style={{background:'none', border:'none', color:'#c4b5fd'}}>Logged in as {user.username}</button>}
              </div>
          </div>
      );
  }

  return (
      <div className="lobby-container">
          <div style={{width:'640px', height:'360px', background:'black', marginBottom:'20px', border:'2px solid #333'}}>
              <video ref={videoRef} autoPlay muted style={{width:'100%', height:'100%'}} />
          </div>
          <select onChange={e => setDeviceId(e.target.value)} value={deviceId} style={{padding:'10px', marginBottom:'10px', background:'#222', color:'white', border:'1px solid #444'}}>
              {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
          </select>
          <button onClick={handleJoin} className="lobby-btn">✅ Enter Battle</button>
      </div>
  );
};

export default Lobby;
