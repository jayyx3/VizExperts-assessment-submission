import axios from 'axios';

const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
const MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;

export class FileUploader {
  constructor(file, options = {}) {
    this.file = file;
    this.options = options; // { onProgress, onStatusChange, onComplete, onError }
    
    this.chunkSize = CHUNK_SIZE;
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    this.uploadId = null;
    this.chunks = []; // { index, start, end, status, attempts }
    
    this.activeUploads = 0;
    this.status = 'IDLE'; // IDLE, UPLOADING, PAUSED, COMPLETED, FAILED
    this.startTime = null;
    this.uploadedBytes = 0;
    
    // Resume data
    this.serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  }

  async start() {
    if (this.status === 'UPLOADING') return;
    this.status = 'UPLOADING';
    this.startTime = Date.now();
    this._notify();

    try {
      // 1. Handshake / Init
      const { data } = await axios.post(`${this.serverUrl}/upload/init`, {
        filename: this.file.name,
        totalSize: this.file.size,
        totalChunks: this.totalChunks
      });

      this.uploadId = data.uploadId;
      const uploadedIndices = new Set(data.uploadedChunks);

      // 2. Prepare chunks Map
      this.chunks = [];
      for (let i = 0; i < this.totalChunks; i++) {
        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, this.file.size);
        const alreadyUploaded = uploadedIndices.has(i);
        
        this.chunks.push({
          index: i,
          start,
          end,
          status: alreadyUploaded ? 'SUCCESS' : 'PENDING',
          attempts: 0
        });

        if (alreadyUploaded) {
          this.uploadedBytes += (end - start);
        }
      }

      this._notify();
      this._processQueue();

    } catch (err) {
      console.error("Init failed", err);
      this.status = 'FAILED';
      if (this.options.onError) this.options.onError(err);
      this._notify();
    }
  }

  pause() {
    this.status = 'PAUSED';
    this._notify();
  }

  resume() {
    if (this.status === 'PAUSED' || this.status === 'FAILED') {
      this.status = 'UPLOADING';
      this._processQueue();
      this._notify();
    }
  }

  _processQueue() {
    if (this.status !== 'UPLOADING') return;

    // Check completion
    const pending = this.chunks.filter(c => c.status === 'PENDING' || c.status === 'ERROR_RETRY');
    const uploading = this.chunks.filter(c => c.status === 'UPLOADING');
    
    if (pending.length === 0 && uploading.length === 0) {
      this._finalize();
      return;
    }

    // Fill concurrency slots
    while (this.activeUploads < MAX_CONCURRENCY && pending.length > 0) {
      const chunk = pending.shift(); // Get next chunk
      this._uploadChunk(chunk);
    }
  }

  async _uploadChunk(chunk) {
    this.activeUploads++;
    chunk.status = 'UPLOADING';
    this._notify();

    const blob = this.file.slice(chunk.start, chunk.end);
    
    try {
      // Simulate network flapping if requested (random failure)
      // but simpler to strictly follow logic first.

      await axios.put(
        `${this.serverUrl}/upload/${this.uploadId}/chunk/${chunk.index}`,
        blob,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Chunk-Index': chunk.index,
            'X-Chunk-Offset': chunk.start
          }
        }
      );

      chunk.status = 'SUCCESS';
      this.uploadedBytes += (chunk.end - chunk.start);
      this.activeUploads--;
      this._notify();
      this._processQueue();

    } catch (err) {
      console.warn(`Chunk ${chunk.index} failed`, err);
      chunk.attempts++;
      
      if (chunk.attempts <= MAX_RETRIES) {
        chunk.status = 'ERROR_RETRY';
        // Exponential backoff
        const delay = Math.pow(2, chunk.attempts) * 1000;
        setTimeout(() => {
          if (this.status === 'UPLOADING') {
            // Put back in queue effectively by resetting status to pending?
            // Or just call processQueue which picks up ERROR_RETRY?
            // Actually the processQueue logic 'pending.shift()' needs to see it.
            // Let's modify filter in processQueue to pick up ERROR_RETRY or just call upload directly?
            // Safer to release slot and let processQueue pick it up.
            this.activeUploads--; // Release slot immediately on error
            // But we need to ensure it gets picked up.
            // Let's make processQueue smarter or just re-add to a queue?
            // The chunk is in `this.chunks`. processQueue searches `this.chunks`.
            // So if I set status back to PENDING, it will be picked up.
            
            // Wait for delay then mark pending
            chunk.status = 'PENDING';
            this._processQueue();
          }
        }, delay);
        
        // Don't decr activeUploads here because we want to block the slot until delay?
        // No, we should release slot so others can proceed.
        this.activeUploads--; 
        this._notify();
        this._processQueue(); // Try to start others while this one waits
        
      } else {
        chunk.status = 'ERROR_FATAL';
        this.status = 'FAILED';
        this.activeUploads--;
        if (this.options.onError) this.options.onError(new Error(`Chunk ${chunk.index} failed after retries`));
        this._notify();
      }
    }
  }

  async _finalize() {
    this.status = 'PROCESSING';
    this._notify();

    try {
      // Calculate hash? For 1GB file in browser, this is heavy. 
      // The spec says "Calculate SHA256 ... Once the last chunk is received [by backend]".
      // It says "Atomic Finalization ... Once last chunk is received, calculate SHA256 of assembled file".
      // It implies the BACKEND calculates it. 
      // Does Frontend need to send one? "validate integrity" usually implies client sends one.
      // Calculating SHA256 of 1GB file in JS main thread freezes UI. Web Worker needed.
      // For simplicity in this assignment unless explicitly asked for frontend Hashing, I will skip client-side hashing 
      // or send a dummy one, relying on server integrity check.
      // The spec: "How you handled file integrity (hashing)" in Documentation.
      // I'll skip client-side hash for performance unless I add a Worker.
      
      const { data } = await axios.post(`${this.serverUrl}/upload/${this.uploadId}/finalize`, {});
      
      this.status = 'COMPLETED';
      if (this.options.onComplete) this.options.onComplete(data);
      this._notify();

    } catch (err) {
      console.error("Finalize error", err);
      this.status = 'FAILED';
      if (this.options.onError) this.options.onError(err);
      this._notify();
    }
  }

  _notify() {
    // Calculate stats
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    const speed = elapsedSeconds > 0 ? (this.uploadedBytes / elapsedSeconds) : 0; // Bytes/sec
    const remainingBytes = this.file.size - this.uploadedBytes;
    const eta = speed > 0 ? remainingBytes / speed : 0;

    if (this.options.onProgress) {
        this.options.onProgress({
            chunks: this.chunks,
            progress: (this.uploadedBytes / this.file.size) * 100,
            status: this.status,
            speed: (speed / 1024 / 1024).toFixed(2), // MB/s
            eta: eta.toFixed(1) // seconds
        });
    }
  }
}
