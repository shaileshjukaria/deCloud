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
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/decloud', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
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
res.json({ 
  token, 
  user: {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    storageUsed: user.storageUsed,
    storageLimit: user.storageLimit
  }
});
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
    
    // Return user with id field (frontend expects it)
    const userData = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      theme: user.theme,
      createdAt: user.createdAt
    };
    
    res.json(userData);
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
  try {
    const groups = await Group.find({ "members.userId": req.user.userId })
      .populate("creator", "username")
      .sort({ createdAt: -1 });
    
    // Add member count to each group
    const groupsWithCount = groups.map(g => ({
      id: g._id.toString(),
      _id: g._id,
      name: g.name,
      description: g.description,
      inviteCode: g.inviteCode,
      memberCount: g.members.length,
      createdAt: g.createdAt
    }));
    
    res.json(groupsWithCount);
  } catch (err) {
    console.error("Get groups error:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// ====================== FILE ROUTES ======================
app.post("/api/files/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const { groupId, tags } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

app.get("/api/files/download/:id", auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id).populate("group");
    if (!file) return res.status(404).json({ error: "File not found" });

    // Check if user is member of group
    const group = await Group.findById(file.group._id);
    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const filePath = path.join(__dirname, "uploads", file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    // Read encrypted file
    const encryptedData = fs.readFileSync(filePath);

    // Decrypt
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(file.group.encryptionKey, "hex"),
      Buffer.from(file.encryptionIV, "hex")
    );
    decipher.setAuthTag(Buffer.from(file.encryptionAuthTag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    // Update download count
    await File.findByIdAndUpdate(file._id, { $inc: { downloads: 1 } });

    // Log transfer
    await TransferLog.create({
      fileId: file._id,
      action: "download",
      userId: req.user.userId,
      groupId: file.group._id
    });

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.send(decrypted);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download failed: " + err.message });
  }
});

app.delete("/api/files/:id", auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ error: "File not found" });

    // Check if user is owner
    if (file.owner.toString() !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, "uploads", file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Update user storage
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { storageUsed: -file.size }
    });

    // Delete record
    await File.findByIdAndDelete(req.params.id);

    // Log transfer
    await TransferLog.create({
      fileId: file._id,
      action: "delete",
      userId: req.user.userId,
      groupId: file.group
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

    // Get group to access encryption key
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is member
    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not a group member" });
    }

    // Read file
    const filePath = path.join(__dirname, "uploads", req.file.filename);
    const fileBuffer = fs.readFileSync(filePath);

    // Encrypt file
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(group.encryptionKey, "hex"),
      iv
    );

    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Save encrypted file
    fs.writeFileSync(filePath, encrypted);

    // Update user storage
    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { storageUsed: req.file.size }
    });

    // Create file record
    const file = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      group: groupId,
      owner: req.user.userId,
      encryptionIV: iv.toString("hex"),
      encryptionAuthTag: authTag.toString("hex"),
      tags: tags ? JSON.parse(tags) : []
    });

    // Log transfer
    await TransferLog.create({
      fileId: file._id,
      action: "upload",
      userId: req.user.userId,
      groupId: groupId
    });

    res.json(file);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

app.get("/api/files/group/:id", auth, async (req, res) => {
  try {
    const files = await File.find({ group: req.params.id })
      .populate("owner", "username email")
      .sort({ uploadedAt: -1 });
    res.json(files);
  } catch (err) {
    console.error("Get files error:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

app.post("/api/groups/join", auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!group) return res.status(404).json({ error: "Invalid invite code" });

    // Check if already member
    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (isMember) return res.status(400).json({ error: "Already a member" });

    // Add user to group
    group.members.push({ userId: req.user.userId, role: "member" });
    await group.save();

    // Add group to user
    await User.findByIdAndUpdate(req.user.userId, {
      $push: { groups: group._id }
    });

    res.json(group);
  } catch (err) {
    console.error("Join group error:", err);
    res.status(500).json({ error: "Failed to join group" });
  }
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
