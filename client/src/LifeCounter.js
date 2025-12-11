import React from 'react';

const LifeCounter = ({ life, isMyStream, onLifeChange }) => {
  return (
    <div style={overlayStyle}>
      <div style={{ fontSize: '40px', fontWeight: 'bold' }}>{life}</div>
      
      {/* Only show buttons if this is YOUR stream */}
      {isMyStream && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
          <button onClick={() => onLifeChange(-1)} style={btnStyle}>-</button>
          <button onClick={() => onLifeChange(1)} style={btnStyle}>+</button>
        </div>
      )}
    </div>
  );
};

// Simple CSS-in-JS for transparency
const overlayStyle = {
  position: 'absolute',
  top: '10px',
  left: '10px',
  background: 'rgba(0, 0, 0, 0.6)', // Semi-transparent black
  color: 'white',
  padding: '10px',
  borderRadius: '8px',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'auto', // Ensure clicks register
};

const btnStyle = {
  padding: '5px 10px',
  cursor: 'pointer',
  background: '#6d28d9',
  border: 'none',
  color: 'white',
  borderRadius: '4px',
  fontWeight: 'bold'
};

export default LifeCounter;