import React, { useState, useRef, useEffect, useCallback } from 'react';

const DraggableToken = ({ token, isMyStream, onUpdate, onRemove, onInspect, onOpenMenu }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pos, setPos] = useState({ x: token.x, y: token.y });
  const dragOffset = useRef({ x: 0, y: 0 });
  const parentRect = useRef(null);
  const hasMoved = useRef(false);

  useEffect(() => { setPos({ x: token.x, y: token.y }); }, [token.x, token.y]);
  
  const handleMouseDown = (e) => {
    if (!isMyStream || e.button !== 0) return; 
    e.stopPropagation(); e.preventDefault();
    setIsDragging(true); hasMoved.current = false; 
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
    parentRect.current = e.currentTarget.offsetParent.getBoundingClientRect();
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !parentRect.current) return;
    e.stopPropagation(); hasMoved.current = true;
    const rawCenterX = e.clientX - parentRect.current.left - dragOffset.current.x;
    const rawCenterY = e.clientY - parentRect.current.top - dragOffset.current.y;
    setPos({ x: (rawCenterX / parentRect.current.width) * 100, y: (rawCenterY / parentRect.current.height) * 100 });
  }, [isDragging]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.stopPropagation(); setIsDragging(false);
    if (hasMoved.current) onUpdate({ ...token, x: pos.x, y: pos.y });
  }, [isDragging, pos, onUpdate, token]);

  useEffect(() => {
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); } 
    else { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div onMouseDown={handleMouseDown} onClick={(e) => { e.stopPropagation(); if (!hasMoved.current) isMyStream ? onUpdate({ ...token, isTapped: !token.isTapped }) : onInspect(token); }} 
      style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, width: '10%', minWidth: '45px', zIndex: isDragging ? 1000 : 500, cursor: isMyStream ? 'grab' : 'zoom-in', transform: `translate(-50%, -50%) ${token.isTapped ? 'rotate(90deg)' : 'rotate(0deg)'}`, transition: isDragging ? 'none' : 'transform 0.2s' }}
    >
      <img src={token.image} alt="token" style={{ width: '100%', borderRadius: '6px', boxShadow: '0 4px 10px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.8)' }} draggable="false" />
      {token.counter && <div style={{ position: 'absolute', bottom: '-8px', left: '-8px', background: '#111', border: '1px solid #666', borderRadius: '4px', padding: '0 4px', fontSize: '11px', fontWeight: 'bold' }}>{token.counter}</div>}
    </div>
  );
};

export default DraggableToken;
