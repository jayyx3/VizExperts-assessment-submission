import React from 'react';

export const ProgressBar = ({ progress }) => {
  return (
    <div style={{ width: '100%', backgroundColor: '#e0e0e0', borderRadius: '8px', overflow: 'hidden', height: '24px', margin: '16px 0' }}>
      <div 
        style={{ 
          width: `${progress}%`, 
          backgroundColor: '#4caf50', 
          height: '100%', 
          transition: 'width 0.3s ease' 
        }} 
      />
    </div>
  );
};
