const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');

// Clean up endpoint (optional, good for testing)
router.delete('/files', uploadController.cleanup);

// 1. Handshake - Initiate upload and check for existing chunks
router.post('/upload/init', uploadController.initiateUpload);

// 2. Upload Chunk - Stream binary data to a specific offset
router.put('/upload/:uploadId/chunk/:chunkIndex', uploadController.uploadChunk);

// 3. Finalize - Verify hash and unzip peek
router.post('/upload/:uploadId/finalize', uploadController.finalizeUpload);

module.exports = router;
