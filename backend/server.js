const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const uploadRoutes = require('./src/routes/uploadRoutes');
const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 4000;

// Test DB Connection
db.getConnection()
    .then(connection => {
        console.log('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        console.error('Database connection failed:', err);
    });

// Middleware
app.use(cors());
app.use(express.json()); // For JSON bodies
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' })); // For binary chunk uploads

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);

// Routes
app.use('/api', uploadRoutes);

app.get('/', (req, res) => {
    res.send('Resilient Uploader API is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
