const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// MongoDB Connection
mongoose.connect('mongodb+srv://Shailesh:shailesh@cluster0.ve28scv.mongodb.net', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// ==================== SCHEMAS ====================

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    storageUsed: { type: Number, default: 0 },
    storageLimit: { type: Number, default: 5368709120 }, // 5GB
    createdAt: { type: Date, default: Date.now }
});

// File Schema
const FileSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    fileHash: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isEncrypted: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    replicas: [{
        peerId: String,
        peerName: String,
        peerIp: String,
        replicatedAt: { type: Date, default: Date.now }
    }],
    downloads: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    tags: [String],
    isPublic: { type: Boolean, default: false }
});

// File Version Schema
const FileVersionSchema = new mongoose.Schema({
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    version: { type: Number, required: true },
    filename: { type: String, required: true },
    fileHash: { type: String, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Transfer Log Schema
const TransferLogSchema = new mongoose.Schema({
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File' },
    action: { type: String, enum: ['upload', 'download', 'delete', 'replicate'] },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromPeer: String,
    toPeer: String,
    size: Number,
    duration: Number,
    success: { type: Boolean, default: true },
    timestamp: { type: Date, default: Date.now }
});

// Peer Schema
const PeerSchema = new mongoose.Schema({
    peerId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    ip: { type: String, required: true },
    port: { type: Number, default: 5000 },
    storageAvailable: { type: Number, default: 0 },
    filesShared: { type: Number, default: 0 },
    isOnline: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const File = mongoose.model('File', FileSchema);
const FileVersion = mongoose.model('FileVersion', FileVersionSchema);
const TransferLog = mongoose.model('TransferLog', TransferLogSchema);
const Peer = mongoose.model('Peer', PeerSchema);

// ==================== MIDDLEWARE ====================

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Invalid token' });
    }
};

// Multer Configuration for File Upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|mp4|mp3|xlsx|pptx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// ==================== UTILITY FUNCTIONS ====================

// Calculate File Hash
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Get Local IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// ==================== PEER DISCOVERY ====================

const LOCAL_IP = getLocalIP();
const PEER_PORT = 5001;
let discoveredPeers = new Map();

// UDP Broadcast for Peer Discovery
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', async (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        
        if (data.type === 'PEER_ANNOUNCE' && rinfo.address !== LOCAL_IP) {
            const peerKey = `${rinfo.address}:${data.port}`;
            
            discoveredPeers.set(peerKey, {
                name: data.name,
                ip: rinfo.address,
                port: data.port,
                lastSeen: new Date()
            });
            
            // Save/Update in database
            await Peer.findOneAndUpdate(
                { peerId: peerKey },
                {
                    peerId: peerKey,
                    name: data.name,
                    ip: rinfo.address,
                    port: data.port,
                    isOnline: true,
                    lastSeen: new Date()
                },
                { upsert: true, new: true }
            );
            
            console.log(`✅ Discovered peer: ${data.name} at ${rinfo.address}`);
        }
    } catch (error) {
        console.error('Error processing peer message:', error);
    }
});

udpServer.bind(PEER_PORT, () => {
    udpServer.setBroadcast(true);
    console.log(`🔍 Peer discovery listening on port ${PEER_PORT}`);
    
    // Announce ourselves every 5 seconds
    setInterval(() => {
        const message = JSON.stringify({
            type: 'PEER_ANNOUNCE',
            name: os.hostname(),
            port: PORT
        });
        
        udpServer.send(message, PEER_PORT, '255.255.255.255', (err) => {
            if (err) console.error('Broadcast error:', err);
        });
    }, 5000);
});

// Clean up offline peers every 30 seconds
setInterval(async () => {
    const now = new Date();
    const timeout = 15000; // 15 seconds
    
    for (const [key, peer] of discoveredPeers.entries()) {
        if (now - peer.lastSeen > timeout) {
            discoveredPeers.delete(key);
            await Peer.findOneAndUpdate(
                { peerId: key },
                { isOnline: false }
            );
        }
    }
}, 30000);

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user
        const user = new User({
            username,
            email,
            password: hashedPassword
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, {
            expiresIn: '7d'
        });
        
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Create token
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, {
            expiresIn: '7d'
        });
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                storageUsed: user.storageUsed,
                storageLimit: user.storageLimit
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Current User
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== FILE ROUTES ====================

// Upload File
app.post('/api/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const { isEncrypted, tags, isPublic } = req.body;
        const filePath = req.file.path;
        
        // Calculate hash
        const fileHash = await calculateFileHash(filePath);
        
        // Check if user has enough storage
        const user = await User.findById(req.user.userId);
        if (user.storageUsed + req.file.size > user.storageLimit) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'Storage limit exceeded' });
        }
        
        // Create file record
        const file = new File({
            filename: req.file.filename,
            originalName: req.file.originalname,
            fileHash,
            size: req.file.size,
            mimeType: req.file.mimetype,
            owner: req.user.userId,
            isEncrypted: isEncrypted === 'true',
            tags: tags ? JSON.parse(tags) : [],
            isPublic: isPublic === 'true'
        });
        
        await file.save();
        
        // Update user storage
        user.storageUsed += req.file.size;
        await user.save();
        
        // Log transfer
        await new TransferLog({
            fileId: file._id,
            action: 'upload',
            userId: req.user.userId,
            fromPeer: LOCAL_IP,
            size: req.file.size
        }).save();
        
        res.status(201).json({
            message: 'File uploaded successfully',
            file: {
                id: file._id,
                filename: file.originalName,
                size: file.size,
                hash: file.fileHash
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Get User Files
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const files = await File.find({ owner: req.user.userId })
            .sort({ uploadedAt: -1 });
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Network Files (from all peers)
app.get('/api/files/network', authenticateToken, async (req, res) => {
    try {
        // Get local files
        const localFiles = await File.find({ isPublic: true }).populate('owner', 'username');
        
        // Get files from peers
        const peerFiles = [];
        for (const [key, peer] of discoveredPeers.entries()) {
            try {
                const response = await axios.get(`http://${peer.ip}:${peer.port}/api/files/public`, {
                    timeout: 3000
                });
                peerFiles.push(...response.data.map(f => ({ ...f, peer: peer.name })));
            } catch (error) {
                console.log(`Could not fetch from ${peer.name}`);
            }
        }
        
        res.json({
            local: localFiles,
            network: peerFiles,
            peers: Array.from(discoveredPeers.values())
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Public Files (for peer requests)
app.get('/api/files/public', async (req, res) => {
    try {
        const files = await File.find({ isPublic: true })
            .select('originalName size fileHash uploadedAt')
            .populate('owner', 'username');
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Download File
app.get('/api/files/download/:id', authenticateToken, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check permissions
        if (!file.isPublic && file.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const filePath = path.join(__dirname, 'uploads', file.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }
        
        // Update download count
        file.downloads += 1;
        await file.save();
        
        // Log transfer
        await new TransferLog({
            fileId: file._id,
            action: 'download',
            userId: req.user.userId,
            toPeer: LOCAL_IP,
            size: file.size
        }).save();
        
        res.download(filePath, file.originalName);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Delete File
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check ownership
        if (file.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const filePath = path.join(__dirname, 'uploads', file.filename);
        
        // Delete file from disk
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Update user storage
        const user = await User.findById(req.user.userId);
        user.storageUsed -= file.size;
        await user.save();
        
        // Delete from database
        await File.findByIdAndDelete(req.params.id);
        
        // Log transfer
        await new TransferLog({
            fileId: file._id,
            action: 'delete',
            userId: req.user.userId,
            fromPeer: LOCAL_IP
        }).save();
        
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Search Files
app.get('/api/files/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        
        const files = await File.find({
            $and: [
                { owner: req.user.userId },
                {
                    $or: [
                        { originalName: { $regex: q, $options: 'i' } },
                        { tags: { $in: [new RegExp(q, 'i')] } }
                    ]
                }
            ]
        });
        
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// ==================== PEER ROUTES ====================

// Get Discovered Peers
app.get('/api/peers', authenticateToken, async (req, res) => {
    try {
        const peers = Array.from(discoveredPeers.values());
        res.json(peers);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== STATS ROUTES ====================

// Get Dashboard Stats
app.get('/api/stats/dashboard', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const fileCount = await File.countDocuments({ owner: req.user.userId });
        const totalDownloads = await File.aggregate([
            { $match: { owner: mongoose.Types.ObjectId(req.user.userId) } },
            { $group: { _id: null, total: { $sum: '$downloads' } } }
        ]);
        
        const recentTransfers = await TransferLog.find({ userId: req.user.userId })
            .sort({ timestamp: -1 })
            .limit(10)
            .populate('fileId', 'originalName');
        
        res.json({
            storageUsed: user.storageUsed,
            storageLimit: user.storageLimit,
            fileCount,
            totalDownloads: totalDownloads[0]?.total || 0,
            peersOnline: discoveredPeers.size,
            recentTransfers
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== SERVER STATUS ====================

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        deviceName: os.hostname(),
        ip: LOCAL_IP,
        port: PORT,
        peersOnline: discoveredPeers.size,
        uptime: process.uptime()
    });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🌐 Decentralized Cloud Storage - MERN Stack');
    console.log('='.repeat(60));
    console.log(`🚀 Server running on http://${LOCAL_IP}:${PORT}`);
    console.log(`📦 Device: ${os.hostname()}`);
    console.log(`🔍 Peer discovery active on UDP port ${PEER_PORT}`);
    console.log('='.repeat(60));
});

module.exports = app;