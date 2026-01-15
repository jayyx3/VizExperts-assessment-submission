# Resilient File Uploader

A robust, resume-able file upload system designed to handle large files (e.g., 1GB+) specifically for unstable networks. Built with React, Node.js, and MySQL.

## Features

- **Smart Chunking**: Splits large files into 5MB chunks using `Blob.slice()` in the browser.
- **Concurrency Control**: Limits uploads to 3 concurrent requests to prevent network saturation.
- **Resumability**: Automatically resumes uploads where they left off after a page refresh or network failure.
- **Network Resilience**: Implements exponential backoff retry logic for failed chunks.
- **Streaming Backend**: Writes chunks directly to disk at the correct offset without loading the file into memory.
- **Data Integrity**: Verifies SHA-256 hash of the final file on the server.
- **ZIP Peek**: Lists files inside the uploaded ZIP archive without extracting it.
- **Visualization**: Real-time progress bar, speed (MB/s), ETA, and a visual grid of chunk statuses.

## Tech Stack

- **Frontend**: React, Vite, Axios
- **Backend**: Node.js, Express, fs-extra
- **Database**: MySQL
- **Infrastructure**: Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose installed on your machine.

## How to Run

### Option 1: Docker (Recommended)
The easiest way to run the application is using Docker Compose. This ensures all dependencies (Node.js, MySQL) are set up automatically.

1. Ensure **Docker Desktop** is running.
2. Open a terminal in the project root (`/submission`).
3. Run the following command:

   ```bash
   docker-compose up --build
   ```

4. Access the application:
   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Backend API**: [http://localhost:4000](http://localhost:4000)

### Option 2: Local Setup (Manual)
If you prefer to run it without Docker:
1. Ensure **MySQL** is running and create a database named `uploader_db`.
2. Configure database credentials in `backend/src/db.js` or via environment variables.
3. **Backend**: `cd backend && npm install && node server.js`
4. **Frontend**: `cd frontend && npm install && npm run dev`

## Author
**Jay Joshi**
- B.Tech CSE, IIIT Kota (2022–2026)
- File Uploader Assignment for **VizExperts**

## Evaluation Criteria & Implementation Details

### 1. Memory Management
The backend uses **Streaming I/O**. It does not load the entire 1GB file into RAM.
- **Upload**: Chunks are written directly to the file descriptor at the specific byte offset using `fs.write`.
- **Hashing**: `fs.createReadStream` is piped into a crypto hash object.
- **Unzipping**: `yauzl` library reads the ZIP structure lazily from the disk.

### 2. Concurrency
The frontend explicitly implements a queue system (`src/utils/Uploader.js`) that maintains a maximum of **3 active HTTP requests** at any time.

### 3. Resiliency (Pause/Resume & Retries)
- **Pause/Resume**: The system checks the database (`/upload/init`) before starting. The server returns a list of already uploaded chunks. The frontend simply filters these out of its queue.
- **Retries**: Each chunk has an exponential backoff mechanism. If a chunk fails (500 or network error), it waits `2^attempts * 1000` ms before retrying, up to 3 times.

### 4. Code Quality
- **Modularization**: Logic is separated into `Uploader` class (business logic) and React components (UI).
- **Controller/Service Pattern**: Backend logic is kept in controllers, separate from routes.

## Handling Edge Cases (Bonus)

1. **The "Double-Finalize"**: The backend uses an atomic status check. It sets the status to `PROCESSING` immediately when finalization starts. Subsequent requests will fail with 409 Conflict.
2. **Network Flapping**: The frontend's `_uploadChunk` method includes a `try/catch` block that triggers the retry mechanism on failure.
3. **Out-of-Order Delivery**: The backend uses `fs.write(fd, buffer, 0, length, offset)`. This allows writing "Chunk 10" to the end of the file even if "Chunk 1" hasn't arrived yet. The file is created lazily or sparsely.
4. **Server Crash**: Since chunks are written to disk immediately and committed to the DB, a server restart does not respect memory state. The next "Resume" handshake will read valid chunks from the DB and the file system to ensure consistency.

## Trade-offs
- **Hashing Strategy**: We calculate the hash only on the server after upload. Client-side hashing for 1GB files in the main thread would freeze the UI. A Web Worker could be added to hash chunks in parallel for strictly end-to-end integrity verification.
- **File Locking**: We rely on simple DB status flags. For a distributed system with multiple backend instances, we would need a distributed lock (e.g., Redis).

