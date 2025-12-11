import React, { useState } from 'react';

const CardTooltip = ({ cardName, cardImage }) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!cardName) return <span style={{color: '#555', fontSize: '12px'}}>No Commander</span>;

  return (
    <div 
      style={{ position: 'relative', display: 'inline-block', cursor: 'help' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* The Name Text */}
      <span style={{ 
        color: '#a78bfa', 
        fontWeight: 'bold', 
        textDecoration: 'underline', 
        fontSize: '14px' 
      }}>
        {cardName}
      </span>

      {/* The Floating Image */}
      {isHovered && cardImage && (
        <div style={{
          position: 'absolute',
          bottom: '100%', // Appear above the text
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '10px',
          zIndex: 1000,
          background: 'black',
          padding: '5px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
          pointerEvents: 'none' // Let clicks pass through
        }}>
          <img 
            src={cardImage} 
            alt={cardName} 
            style={{ width: '240px', borderRadius: '4px', display: 'block' }} 
          />
          {/* Little arrow pointing down */}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', marginLeft: '-5px',
            borderWidth: '5px', borderStyle: 'solid',
            borderColor: 'black transparent transparent transparent'
          }}></div>
        </div>
      )}
    </div>
  );
};

export default CardTooltip;