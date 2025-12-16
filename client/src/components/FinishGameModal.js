import React, { useState } from 'react';

const FinishGameModal = ({ players, onFinish, onClose }) => {
    const [winnerId, setWinnerId] = useState(null);

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{width: '350px'}}>
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
                <button onClick={() => onFinish(winnerId)} disabled={!winnerId} className="lobby-btn" style={{fontSize: '1rem', padding: '12px', background: winnerId ? '#2563eb' : '#444', cursor: winnerId ? 'pointer' : 'not-allowed'}}>🏆 Confirm Winner & Reset</button>
                <button onClick={onClose} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px'}}>Cancel</button>
            </div>
        </div>
    );
};

export default FinishGameModal;
