import React, { useState, useEffect, useRef } from 'react';
import { FileUp, Pause, Play, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { FileUploader } from '../utils/Uploader';
import { ProgressBar } from './ProgressBar';
import { ChunkGrid } from './ChunkGrid';

export const Uploader = () => {
    const [file, setFile] = useState(null);
    const [uploader, setUploader] = useState(null);
    const [stats, setStats] = useState({
        progress: 0,
        chunks: [],
        status: 'IDLE',
        speed: 0,
        eta: 0
    });
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStats({ progress: 0, chunks: [], status: 'IDLE', speed: 0, eta: 0 });
            setResult(null);
            setUploader(null);
        }
    };

    const startUpload = () => {
        if (!file) return;

        const instance = new FileUploader(file, {
            onProgress: (currentStats) => {
                setStats({ ...currentStats });
            },
            onComplete: (data) => {
                setResult(data);
                alert('Upload Complete!');
            },
            onError: (err) => {
                alert(`Error: ${err.message}`);
            }
        });

        setUploader(instance);
        instance.start();
    };

    const togglePause = () => {
        if (!uploader) return;
        if (stats.status === 'UPLOADING') {
            uploader.pause();
        } else {
            uploader.resume();
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>File Uploader</h1>
            
            <div style={{ padding: '20px', border: '2px dashed #ccc', borderRadius: '8px', textAlign: 'center', marginBottom: '20px' }}>
                <input type="file" onChange={handleFileChange} style={{ display: 'none' }} id="file-input" />
                <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <FileUp size={48} color="#666" />
                    <span>{file ? file.name : "Click to Select File"}</span>
                </label>
            </div>

            {file && (
                <div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        {!uploader && (
                            <button onClick={startUpload} style={btnStyle}>Start Upload</button>
                        )}
                        
                        {uploader && stats.status !== 'COMPLETED' && (
                            <button onClick={togglePause} style={btnStyle}>
                                {stats.status === 'UPLOADING' ? <><Pause size={16}/> Pause</> : <><Play size={16}/> Resume</>}
                            </button>
                        )}

                        <div style={{ marginLeft: 'auto', fontSize: '14px', color: '#555' }}>
                            {stats.status} | {stats.speed} MB/s | ETA: {stats.eta}s
                        </div>
                    </div>

                    <ProgressBar progress={stats.progress} />
                    
                    <h3>Chunk Status ({stats.chunks.length})</h3>
                    <ChunkGrid chunks={stats.chunks} />

                    {result && (
                        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f9eb', border: '1px solid #c3e6cb', borderRadius: '5px' }}>
                            <h3 style={{ margin: '0 0 10px 0', color: '#155724' }}><CheckCircle size={20} style={{verticalAlign: 'middle'}}/> Success</h3>
                            <p><strong>Hash:</strong> {result.final_hash}</p>
                            <p><strong>Zip Contents (Peek):</strong></p>
                            <ul style={{ maxHeight: '100px', overflowY: 'auto' }}>
                                {result.zipContent && result.zipContent.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <div style={{ marginTop: '40px', borderTop: '1px solid #eee', paddingTop: '20px', fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>VizExperts || Technical Assessment</p>
                <p style={{ margin: 0 }}><strong>Jay Joshi</strong></p>
                <p style={{ margin: 0 }}>B.Tech CSE, IIIT Kota (2022–2026)</p>
                <p style={{ margin: '5px 0' }}>
                    📞 +91 8875549960 <span style={{ margin: '0 8px' }}>|</span> 📧 joshijayy421@gmail.com
                </p>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <a href="https://www.linkedin.com/in/jay-joshi-75b75124b/" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>🔗 LinkedIn</a>
                    <a href="https://github.com/jayyx3" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>🔗 GitHub</a>
                    <a href="https://drive.google.com/file/d/1Qwj5XIpkdecJ4xJETcE44GcPEl6dwjSY/view?usp=sharing" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'none' }}>📄 Resume</a>
                </div>
            </div>
        </div>
    );
};

const btnStyle = {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '5px'
};
