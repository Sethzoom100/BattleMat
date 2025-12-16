import React, { useState } from 'react';
import { API_URL, fetchCardData, fetchCommanderAutocomplete } from '../utils/api';

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
            <h1 style={{color: '#c4b5fd', borderBottom: '1px solid #333', paddingBottom: '10px'}}>Player Profile: {user.username}</h1>
            
            <div style={{display: 'flex', gap: '20px', marginBottom: '20px'}}>
                <div className="stat-box" style={{background: '#222', padding: '15px', borderRadius: '8px', minWidth: '100px', textAlign: 'center', border: '1px solid #444'}}><h3>🏆 Wins</h3><span>{user.stats.wins}</span></div>
                <div className="stat-box" style={{background: '#222', padding: '15px', borderRadius: '8px', minWidth: '100px', textAlign: 'center', border: '1px solid #444'}}><h3>💀 Losses</h3><span>{user.stats.losses}</span></div>
                <div className="stat-box" style={{background: '#222', padding: '15px', borderRadius: '8px', minWidth: '100px', textAlign: 'center', border: '1px solid #444'}}><h3>🎲 Games</h3><span>{user.stats.gamesPlayed}</span></div>
            </div>

            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h2 style={{color: '#ccc', margin: 0}}>My Decks</h2>
                <select value={sortMethod} onChange={(e) => setSortMethod(e.target.value)} style={{padding: '5px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', outline: 'none'}}>
                    <option value="name">Sort by Name (A-Z)</option>
                    <option value="winrate">Sort by Win Rate (%)</option>
                </select>
            </div>

            <div style={{background: '#222', padding: '15px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', border: '1px solid #444', flexWrap: 'wrap'}}>
                <input type="text" placeholder="Commander" value={cmdrName} onChange={e => handleSearch(e.target.value, 'commander')} style={{padding: '8px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', flex: 1}} />
                <input type="text" placeholder="Partner (Optional)" value={partnerName} onChange={e => handleSearch(e.target.value, 'partner')} style={{padding: '8px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px', flex: 1}} />
                {suggestions.length > 0 && <div style={{position: 'absolute', background: '#333', border: '1px solid #555', zIndex: 10, padding: '5px'}}>{suggestions.map((s,i) => <div key={i} onClick={() => handleSelectSuggestion(s)} style={{cursor: 'pointer', padding: '2px'}}>{s}</div>)}</div>}
                <button onClick={handleAddDeck} style={{padding: '8px 15px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>+ Create Deck</button>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px'}}>
                {sortedDecks.map(deck => (
                    <div key={deck._id} style={{background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', overflow: 'hidden'}}>
                        <div style={{ height: '180px', background: `url(${deck.image}) center 20% / 120% no-repeat`, borderBottom: '1px solid #333' }}></div>
                        <div style={{padding: '15px'}}>
                            <div style={{fontWeight: 'bold'}}>{deck.name}</div>
                            <button onClick={() => handleDeleteDeck(deck._id)} style={{marginTop: '10px', width: '100%', padding: '5px', background: '#7f1d1d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Delete Deck</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProfileScreen;
