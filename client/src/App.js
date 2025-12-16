// src/App.js
import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'peerjs';
import './App.css';

// Components
import Lobby from './components/Lobby';
import VideoContainer from './components/VideoContainer';
import AuthModal from './components/AuthModal.js'; // Add the .js extension explicitly
import ProfileScreen from './components/ProfileScreen'; // Create this from original
import FinishGameModal from './components/FinishGameModal'; // Create this from original
import { API_URL } from './utils/api';

const socket = io(API_URL);

// Simple layout hook
const useGridLayout = (containerRef, count) => {
    const [layout, setLayout] = useState({ width: 0, height: 0 });
    const calc = useCallback(() => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
        let bestArea = 0, best = { width: 0, height: 0 };
        for (let cols = 1; cols <= count; cols++) {
            const rows = Math.ceil(count / cols);
            let cardW = w / cols, cardH = cardW / 1.777;
            if (cardH > h / rows) { cardH = h / rows; cardW = cardH * 1.777; }
            if (cardW * cardH > bestArea) { bestArea = cardW * cardH; best = { width: cardW, height: cardH }; }
        }
        setLayout(best);
    }, [count]);
    useLayoutEffect(() => { calc(); window.addEventListener('resize', calc); return () => window.removeEventListener('resize', calc); }, [calc]);
    return layout;
};

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  
  // Game State
  const [gameState, setGameState] = useState({});
  const [seatOrder, setSeatOrder] = useState([]);
  const [turnState, setTurnState] = useState({ activeId: null, count: 1 });
  const [myId, setMyId] = useState(null);
  const [myStream, setMyStream] = useState(null);
  const [peers, setPeers] = useState([]);
  
  // UI State
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [viewCard, setViewCard] = useState(null);

  const containerRef = useRef(null);
  const peerRef = useRef(null);
  const layout = useGridLayout(containerRef, seatOrder.length || 1);

  // --- SOCKETS ---
  useEffect(() => {
      socket.on('user-connected', (id, isSpec) => {
          if (!peerRef.current || isSpec) return;
          const call = peerRef.current.call(id, myStream);
          call.on('stream', s => addPeer(id, s));
      });
      socket.on('game-state-updated', ({ userId, data }) => setGameState(prev => ({ ...prev, [userId]: { ...prev[userId], ...data } })));
      socket.on('user-disconnected', id => {
          setPeers(p => p.filter(x => x.id !== id));
          setSeatOrder(s => s.filter(x => x !== id));
      });
      return () => { socket.off('user-connected'); socket.off('game-state-updated'); socket.off('user-disconnected'); };
  }, [myStream]);

  const addPeer = (id, stream) => {
      setPeers(prev => prev.some(p => p.id === id) ? prev : [...prev, { id, stream }]);
      setSeatOrder(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const joinGame = (spectator, stream) => {
      setHasJoined(true);
      setIsSpectator(spectator);
      setMyStream(stream);
      
      const myPeer = new Peer(undefined, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
      peerRef.current = myPeer;
      
      myPeer.on('open', id => {
          setMyId(id);
          const initData = { life: 40, username: user ? user.username : `Guest ${id.substr(0,3)}` };
          setGameState(prev => ({ ...prev, [id]: initData }));
          if(!spectator) setSeatOrder(prev => [...prev, id]);
          socket.emit('join-room', window.location.pathname.substring(1) || 'default', id, spectator);
          if(!spectator) socket.emit('update-game-state', { userId: id, data: initData });
      });
      
      myPeer.on('call', call => {
          call.answer(stream);
          call.on('stream', s => addPeer(call.peer, s));
      });
  };

  const handleUpdateGame = (targetId, updates) => {
      setGameState(prev => {
          const newData = { ...prev[targetId], ...updates };
          socket.emit('update-game-state', { userId: targetId, data: newData });
          return { ...prev, [targetId]: newData };
      });
  };

  return (
    <>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onLogin={(u, t) => { setUser(u); setToken(t); }} />}
      {showProfile && user && <ProfileScreen user={user} onClose={() => setShowProfile(false)} />}
      
      {!hasJoined ? (
        <Lobby onJoin={joinGame} user={user} onOpenAuth={() => setShowAuth(true)} onOpenProfile={() => setShowProfile(true)} />
      ) : (
        <div style={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
            <div style={{height:'40px', background:'#000', borderBottom:'1px solid #333', display:'flex', alignItems:'center', padding:'0 15px'}}>
                <span style={{color: '#c4b5fd', fontWeight: 'bold'}}>BattleMat</span>
                <span style={{marginLeft: '15px', color: '#facc15'}}>Turn {turnState.count}</span>
            </div>
            <div ref={containerRef} className="video-grid">
                {seatOrder.map(id => (
                    <VideoContainer 
                        key={id} 
                        userId={id} 
                        stream={id === myId ? myStream : peers.find(p => p.id === id)?.stream}
                        isMyStream={id === myId}
                        myId={myId}
                        playerData={gameState[id]}
                        updateGame={handleUpdateGame}
                        width={layout.width}
                        height={layout.height}
                        onLeaveGame={() => window.location.reload()}
                        onInspectToken={setViewCard}
                    />
                ))}
            </div>
        </div>
      )}
    </>
  );
}

export default App;
