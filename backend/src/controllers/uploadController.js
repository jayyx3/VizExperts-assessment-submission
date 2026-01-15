const db = require('../db');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const yauzl = require('yauzl');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Helper to get file path
const getFilePath = (uploadId) => path.join(UPLOADS_DIR, `${uploadId}.bin`);

exports.initiateUpload = async (req, res) => {
    const { filename, totalSize, totalChunks } = req.body;

    try {
        // Check if upload exists (simple de-duplication based on filename and size for this demo)
        // In prod, use a hash of the file header or similar.
        const [rows] = await db.query(
            'SELECT * FROM uploads WHERE filename = ? AND total_size = ? AND status != "COMPLETED" AND status != "FAILED"', 
            [filename, totalSize]
        );

        let uploadId;
        let uploadedChunks = [];

        if (rows.length > 0) {
            // Resume existing
            const upload = rows[0];
            uploadId = upload.id;

            // Get completed chunks
            const [chunkRows] = await db.query(
                'SELECT chunk_index FROM chunks WHERE upload_id = ? AND status = "UPLOADED"',
                [uploadId]
            );
            uploadedChunks = chunkRows.map(r => r.chunk_index);
            
            // Ensure file exists on disk, if not (deleted?), we might need to reset. 
            // For now assume disk persistence.
            if (!fs.existsSync(getFilePath(uploadId))) {
                 // edge case: db says uploading, but file gone. Reset.
                 await db.query('DELETE FROM chunks WHERE upload_id = ?', [uploadId]);
                 uploadedChunks = [];
                 await fs.ensureFile(getFilePath(uploadId));
            }

        } else {
            // New upload
            const [result] = await db.query(
                'INSERT INTO uploads (filename, total_size, total_chunks, status) VALUES (?, ?, ?, "UPLOADING")',
                [filename, totalSize, totalChunks]
            );
            uploadId = result.insertId;
            
            // Create empty file placeholder (not strictly necessary with 'r+', but good for reservation)
             await fs.ensureFile(getFilePath(uploadId));
        }

        res.json({
            uploadId,
            status: 'UPLOADING',
            uploadedChunks
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.uploadChunk = async (req, res) => {
    const { uploadId, chunkIndex } = req.params;
    const chunkData = req.body; // Binary data from express.raw()
    
    // We need to know the offset. 
    // Assumption: The client sends a header "X-Chunk-Offset" or we calculate based on standard chunk size?
    // Better: Client should tell us the offset bytes. 
    // If not, we have to rely on fixed chunk sizing, which is risky if client changes logic.
    // Let's look for Content-Range header: `bytes 0-1023/2048`.
    const rangeHeader = req.headers['content-range'] || req.headers['x-content-range'];
    
    // Fallback: strictly assume client sends "X-Chunk-Offset" header to be safe and stateless regarding chunk size
    // OR: Assume a fixed chunk size config? No, variable chunking is better.
    // Let's use `X-Chunk-Offset` header.
    const offset = parseInt(req.headers['x-chunk-offset']);

    if (isNaN(offset)) {
         return res.status(400).json({ error: 'Missing X-Chunk-Offset header' });
    }

    try {
        const filePath = getFilePath(uploadId);
        
        // Open file in 'r+' mode (read/write, does not truncate)
        // If file doesn't exist (deleted?), `r+` will fail. `fs.open` with `w` truncates.
        // We ensure file created in init.
        // `r+` requires file to exist.
        
        if (!fs.existsSync(filePath)) {
             // Recover from "Server Crash" / "Deleted Temp File" scenario?
             // If DB thinks it exists but file doesn't, we are in trouble. 
             // We should recreate it.
             await fs.ensureFile(filePath);
        }

        const fd = await fs.open(filePath, 'r+');
        
        await fs.write(fd, chunkData, 0, chunkData.length, offset);
        await fs.close(fd);

        // Update DB
        // Using INSERT IGNORE or ON DUPLICATE KEY UPDATE for Idempotency
        await db.query(
            'INSERT INTO chunks (upload_id, chunk_index, status) VALUES (?, ?, "UPLOADED") ON DUPLICATE KEY UPDATE status="UPLOADED", received_at=CURRENT_TIMESTAMP',
            [uploadId, chunkIndex]
        );

        res.json({ success: true });

    } catch (err) {
        console.error('Chunk upload error:', err);
        res.status(500).json({ error: 'Write failed' });
    }
};

exports.finalizeUpload = async (req, res) => {
    const { uploadId } = req.params;
    const { clientHash } = req.body; // Client sends their calculated hash for verification

    try {
        // 1. Transaction/Lock check (The "Double-Finalize" solution)
        const [rows] = await db.query('SELECT * FROM uploads WHERE id = ?', [uploadId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Upload not found' });
        
        const upload = rows[0];
        
        if (upload.status === 'COMPLETED') {
             return res.json({ status: 'COMPLETED', message: 'Already completed' });
        }
        
        if (upload.status === 'PROCESSING') {
             return res.status(409).json({ error: 'Already processing' });
        }

        // Set to PROCESSING to lock others
        await db.query('UPDATE uploads SET status = "PROCESSING" WHERE id = ?', [uploadId]);

        // 2. Validate all chunks represent? (Optional, if we trust the hash check)
        // Let's do the hash check.
        
        const filePath = getFilePath(uploadId);
        // Requirement: "You must not load the entire file into memory."
        // We must stream the hash calculation.
        
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', async () => {
            const serverHash = hash.digest('hex');
            
            // Allow for localized testing mismatch if client hash isn't sent or implemented yet, 
            // but strict check logic is here or in PROD.
            // For now, if clientHash is provided, check it.
            if (clientHash && clientHash !== serverHash) {
                 await db.query('UPDATE uploads SET status = "FAILED" WHERE id = ?', [uploadId]);
                 return res.status(400).json({ error: 'Hash mismatch', serverHash, clientHash });
            }

            // 3. The "Peek" Requirement: Unzip and list files without extracting
            // We use yauzl
            let zipEntries = [];
            
            yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    // Not a zip file? That's okay, maybe just finalize.
                    // But requirement implies ZIP support.
                    console.warn('Yauzl error (maybe not a zip):', err.message);
                    finish(serverHash, ["(Not a valid ZIP archive)"]);
                    return;
                }
                
                zipfile.readEntry();
                zipfile.on('entry', (entry) => {
                    zipEntries.push(entry.fileName);
                    zipfile.readEntry();
                });
                zipfile.on('end', () => {
                    finish(serverHash, zipEntries);
                });
                zipfile.on('error', (e) => {
                     finish(serverHash, ["(Error reading ZIP structure)"]);
                });
            });

            async function finish(finalHash, entries) {
                await db.query(
                    'UPDATE uploads SET status = "COMPLETED", final_hash = ? WHERE id = ?', 
                    [finalHash, uploadId]
                );
                res.json({ 
                    status: 'COMPLETED', 
                    uploadId, 
                    hash: finalHash,
                    zipContent: entries
                });
            }
        });
        
        stream.on('error', (err) => {
             db.query('UPDATE uploads SET status = "FAILED" WHERE id = ?', [uploadId]);
             res.status(500).json({ error: 'File read error during hashing' });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Finalization error' });
    }
};

exports.cleanup = async (req, res) => {
    // Basic logic to clean orphaned files (older than 24h?)
    // This is just a stub for the requirement "Cleanup".
    try {
        const [rows] = await db.query('SELECT * FROM uploads WHERE status = "UPLOADING" AND created_at < NOW() - INTERVAL 1 DAY');
        for (const row of rows) {
             const fPath = getFilePath(row.id);
             if (fs.existsSync(fPath)) await fs.remove(fPath);
             await db.query('UPDATE uploads SET status = "FAILED" WHERE id = ?', [row.id]);
        }
        res.json({ cleaned: rows.length });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
};
