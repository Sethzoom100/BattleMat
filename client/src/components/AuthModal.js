import React, { useState } from 'react';
import { API_URL } from '../utils/api';

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
                onLogin(data.user, data.token); 
                onClose(); 
            }
        } catch (err) { alert(err.message); }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2 style={{margin: 0, textAlign: 'center', color: '#c4b5fd'}}>{isRegister ? "Create Account" : "Login"}</h2>
                <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} style={{padding: '10px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '5px'}} />
                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{padding: '10px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '5px'}} />
                <button onClick={handleSubmit} className="lobby-btn" style={{fontSize: '1rem', padding: '10px'}}>{isRegister ? "Register" : "Login"}</button>
                <div style={{fontSize: '12px', textAlign: 'center', cursor: 'pointer', color: '#aaa'}} onClick={() => setIsRegister(!isRegister)}>{isRegister ? "Have account? Login" : "No account? Create one"}</div>
                <button onClick={onClose} style={{background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px'}}>Cancel</button>
            </div>
        </div>
    );
};

export default AuthModal;
