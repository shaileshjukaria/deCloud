// Load environment variables
require('dotenv').config();

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

const app = express();

// ====================== ENV ======================
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 524288000;
const ENCRYPTION_ALGORITHM = process.env.ENCRYPTION_ALGORITHM || "aes-256-gcm";
const ENABLE_PEER_DISCOVERY = process.env.ENABLE_PEER_DISCOVERY === "true";
const PEER_PORT = parseInt(process.env.PEER_PORT) || 5001;
const NODE_ENV = process.env.NODE_ENV || "development";

// ====================== MIDDLEWARE ======================
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use(cors({
    origin: FRONTEND_URL.split(',').map(u => u.trim()),
    credentials: true
}));

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Log incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ====================== DB CONNECTION ======================
mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => {
        console.error("❌ MongoDB Error:", err);
        process.exit(1);
    });

// ====================== SCHEMAS ======================
const User = mongoose.model(
    "User",
    new mongoose.Schema({
        username: String,
        email: String,
        password: String,
        theme: { type: String, default: "light" },
        cookiesAccepted: { type: Boolean, default: false },
        storageUsed: { type: Number, default: 0 },
        storageLimit: { type: Number, default: 5000000000 },
        groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
        createdAt: { type: Date, default: Date.now }
    })
);

const Group = mongoose.model(
    "Group",
    new mongoose.Schema({
        name: String,
        description: String,
        creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        members: [{
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            role: { type: String, default: "member" }
        }],
        encryptionKey: String,
        inviteCode: String,
        createdAt: { type: Date, default: Date.now }
    })
);

const File = mongoose.model(
    "File",
    new mongoose.Schema({
        filename: String,
        originalName: String,
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        size: Number,
        mimeType: String,
        encryptionIV: String,
        encryptionAuthTag: String,
        tags: [String],
        downloads: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now }
    })
);

const TransferLog = mongoose.model(
    "TransferLog",
    new mongoose.Schema({
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File" },
        action: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        timestamp: { type: Date, default: Date.now }
    })
);

const Peer = mongoose.model(
    "Peer",
    new mongoose.Schema({
        peerId: { type: String, unique: true },
        name: String,
        ip: String,
        port: Number,
        isOnline: Boolean,
        lastSeen: Date
    })
);

// ====================== UTILS ======================
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();

// ====================== PEER DISCOVERY (FIXED) ======================
let discoveredPeers = new Map();

if (ENABLE_PEER_DISCOVERY) {
    const udpServer = dgram.createSocket("udp4");

    udpServer.on("message", async (msg, rinfo) => {
        try {
            const data = JSON.parse(msg.toString());

            // FIX: skip system messages
            if (data.userId === "system") return;

            if (data.type === "PEER_ANNOUNCE" && rinfo.address !== LOCAL_IP) {
                const peerKey = `${rinfo.address}:${data.port}`;

                discoveredPeers.set(peerKey, {
                    name: data.name,
                    ip: rinfo.address,
                    port: data.port,
                    lastSeen: new Date()
                });

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
                    { upsert: true }
                );
            }
        } catch (err) {
            console.log("Invalid peer message:", msg.toString());
        }
    });

    udpServer.bind(PEER_PORT, () => {
        udpServer.setBroadcast(true);
        console.log(`🔍 Peer discovery active (UDP ${PEER_PORT})`);

        setInterval(() => {
            const msg = JSON.stringify({
                type: "PEER_ANNOUNCE",
                name: os.hostname(),
                port: PORT,
                userId: "system"  // ignored, not saved
            });

            udpServer.send(msg, PEER_PORT, "255.255.255.255", () => {});
        }, 5000);
    });
}

// ====================== AUTH MIDDLEWARE ======================
function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "No token" });

    try {
        req.user = jwt.verify(header.split(" ")[1], JWT_SECRET);
        next();
    } catch {
        return res.status(403).json({ error: "Invalid token" });
    }
}

// ====================== MULTER ======================
const upload = multer({
    storage: multer.diskStorage({
        destination: "uploads/",
        filename: (req, file, cb) =>
            cb(null, Date.now() + "-" + crypto.randomBytes(6).toString("hex") + path.extname(file.originalname))
    }),
    limits: { fileSize: MAX_FILE_SIZE }
});

// ====================== AUTH ROUTES ======================
app.post("/api/auth/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Prevent duplicate registrations
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: "Email already in use" });

        const hashed = await bcrypt.hash(password, 10);

        const user = await User.create({ username, email, password: hashed });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        res.json({ token, user });
    } catch (err) {
        console.error("Register error:", err);
        if (err.code === 11000) return res.status(400).json({ error: "Duplicate key" });
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ userId: user._id }, JWT_SECRET);

        res.json({ token, user });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Login failed" });
    }
});

// Return current user info
app.get("/api/auth/me", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select("username email storageUsed storageLimit theme createdAt");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (err) {
        console.error("/auth/me error:", err);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// Global error handler to avoid crashing on unhandled errors
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
});

// ====================== GROUP ROUTES ======================
app.post("/api/groups/create", auth, async (req, res) => {
    const { name, description } = req.body;

    const encryptionKey = crypto.randomBytes(32).toString("hex");

    const group = await Group.create({
        name,
        description,
        creator: req.user.userId,
        encryptionKey,
        inviteCode: crypto.randomBytes(3).toString("hex").toUpperCase(),
        members: [{ userId: req.user.userId, role: "admin" }]
    });

    res.json(group);
});

app.get("/api/groups", auth, async (req, res) => {
    const groups = await Group.find({ "members.userId": req.user.userId });
    res.json(groups);
});

// ====================== FILE ROUTES ======================
app.post("/api/files/upload", auth, upload.single("file"), async (req, res) => {
    const { groupId } = req.body;

    const file = await File.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        group: groupId,
        owner: req.user.userId
    });

    res.json(file);
});

app.get("/api/files/group/:id", auth, async (req, res) => {
    const files = await File.find({ group: req.params.id });
    res.json(files);
});

// ====================== PEERS ======================
app.get("/api/peers", auth, async (req, res) => {
    res.json([...discoveredPeers.values()]);
});

// ====================== STATS ======================
app.get("/api/stats/dashboard", auth, async (req, res) => {
    const user = await User.findById(req.user.userId);
    const files = await File.countDocuments({ owner: req.user.userId });
    const groups = await Group.countDocuments({ "members.userId": req.user.userId });

    res.json({
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit,
        fileCount: files,
        groupCount: groups,
        peersOnline: discoveredPeers.size
    });
});

// ====================== SERVER ======================
app.listen(PORT, () => {
    console.log("============================================================");
    console.log("🌐 DeCloud Backend Running");
    console.log(`🚀 http://${getLocalIP()}:${PORT}`);
    console.log(`🟣 Environment: ${NODE_ENV}`);
    console.log("============================================================");
});
