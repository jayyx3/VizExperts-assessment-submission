import React, { memo } from 'react';

const ChunkItem = memo(({ status }) => {
    let color = '#e0e0e0'; // Pending - Gray
    if (status === 'UPLOADING') color = '#2196f3'; // Blue
    if (status === 'SUCCESS') color = '#4caf50'; // Green
    if (status.startsWith('ERROR')) color = '#f44336'; // Red
  
    return (
      <div style={{ 
        width: '12px', 
        height: '12px', 
        backgroundColor: color, 
        borderRadius: '2px',
        margin: '1px' 
      }} title={status} />
    );
  });

export const ChunkGrid = ({ chunks }) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap', 
      gap: '2px', 
      maxHeight: '300px', 
      overflowY: 'auto',
      border: '1px solid #ddd',
      padding: '8px',
      marginTop: '16px'
    }}>
      {chunks.map((chunk) => (
        <ChunkItem key={chunk.index} status={chunk.status} />
      ))}
    </div>
  );
};
