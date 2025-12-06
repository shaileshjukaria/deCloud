// Load environment variables
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
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
const sharp = require('sharp');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

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
app.use('/previews', express.static('previews'));

// CORS configuration
if (NODE_ENV === 'development') {
  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
} else {
  app.use(cors({
    origin: function(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
      const localIPPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
      if (localIPPattern.test(origin)) return callback(null, true);
      const allowedOrigins = FRONTEND_URL.split(',').map(u => u.trim());
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      console.warn('Blocked CORS origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('previews')) fs.mkdirSync('previews');

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

// ====================== ENHANCED SCHEMAS ======================
const User = mongoose.model(
    "User",
    new mongoose.Schema({
        username: String,
        email: String,
        password: String,
        theme: { type: String, default: "light" },
        cookiesAccepted: { type: Boolean, default: false },
        emailNotifications: { type: Boolean, default: true },
        storageAlerts: { type: Boolean, default: true },
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
            role: { type: String, enum: ['admin', 'moderator', 'member'], default: "member" },
            joinedAt: { type: Date, default: Date.now }
        }],
        encryptionKey: String,
        inviteCode: String,
        isPrivate: { type: Boolean, default: true },
        isAutoGroup: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now }
    })
);

// NEW: Folder schema
const Folder = mongoose.model(
    "Folder",
    new mongoose.Schema({
        name: String,
        parent: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        path: { type: String, default: '/' },
        createdAt: { type: Date, default: Date.now }
    })
);

// ENHANCED: File schema with folder support and full-text search
const File = mongoose.model(
    "File",
    new mongoose.Schema({
        filename: String,
        originalName: String,
        folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null },
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        size: Number,
        mimeType: String,
        encryptionIV: String,
        encryptionAuthTag: String,
        tags: [String],
        downloads: { type: Number, default: 0 },
        hasPreview: { type: Boolean, default: false },
        previewPath: String,
        textContent: String, // For full-text search
        uploadedAt: { type: Date, default: Date.now }
    })
);

// NEW: Share link schema for encrypted sharing
const ShareLink = mongoose.model(
    "ShareLink",
    new mongoose.Schema({
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File" },
        linkId: { type: String, unique: true },
        password: String, // Hashed if protected
        expiresAt: Date,
        downloads: { type: Number, default: 0 },
        maxDownloads: Number,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
    })
);

// NEW: Group message schema for chat
const GroupMessage = mongoose.model(
    "GroupMessage",
    new mongoose.Schema({
        group: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        message: String,
        isEncrypted: { type: Boolean, default: true },
        iv: String,
        timestamp: { type: Date, default: Date.now }
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

// ENHANCED: Peer schema with network support
const Peer = mongoose.model(
    "Peer",
    new mongoose.Schema({
        peerId: { type: String, unique: true },
        name: String,
        ip: String,
        port: Number,
        network: String, // Network identifier for multi-network support
        isOnline: Boolean,
        lastSeen: Date
    })
);

// ====================== AUTO NETWORK GROUP ======================
async function ensureNetworkGroup() {
  try {
    const networkGroup = await Group.findOne({ name: "__NETWORK_SHARE__" });
    
    if (!networkGroup) {
      const encryptionKey = crypto.randomBytes(32).toString("hex");
      await Group.create({
        name: "__NETWORK_SHARE__",
        description: "Automatic group for local network sharing",
        encryptionKey,
        inviteCode: "NETWORK",
        members: [],
        isPrivate: false,
        isAutoGroup: true
      });
      console.log("✅ Network sharing group created");
    }
  } catch (err) {
    console.error("Network group error:", err);
  }
}

mongoose.connection.once('open', () => {
  ensureNetworkGroup();
});

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

// Get network identifier for multi-network support
function getNetworkId(ip) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

const LOCAL_IP = getLocalIP();
const LOCAL_NETWORK = getNetworkId(LOCAL_IP);

// ====================== ENHANCED PEER DISCOVERY ======================
let discoveredPeers = new Map();
const udpServer = dgram.createSocket("udp4");

udpServer.on("message", async (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());

        if (rinfo.address === LOCAL_IP) return;

        if (data.type === "PEER_ANNOUNCE") {
            const peerKey = `${rinfo.address}:${data.port}`;
            const peerNetwork = getNetworkId(rinfo.address);

            discoveredPeers.set(peerKey, {
                id: peerKey,
                name: data.name || rinfo.address,
                ip: rinfo.address,
                port: data.port,
                network: peerNetwork,
                isSameNetwork: peerNetwork === LOCAL_NETWORK,
                lastSeen: new Date()
            });

            console.log(`📡 Discovered peer: ${data.name} at ${rinfo.address} (Network: ${peerNetwork})`);

            await Peer.findOneAndUpdate(
                { peerId: peerKey },
                {
                    peerId: peerKey,
                    name: data.name || rinfo.address,
                    ip: rinfo.address,
                    port: data.port,
                    network: peerNetwork,
                    isOnline: true,
                    lastSeen: new Date()
                },
                { upsert: true }
            );

            // Broadcast to connected WebSocket clients
            io.emit('peer:discovered', discoveredPeers.get(peerKey));
        }
    } catch (err) {
        console.log("Invalid peer message:", msg.toString());
    }
});

udpServer.on("error", (err) => {
    console.error("UDP server error:", err);
});

udpServer.bind(PEER_PORT, "0.0.0.0", () => {
    udpServer.setBroadcast(true);
    console.log(`🔍 Peer discovery active on UDP port ${PEER_PORT}`);
    console.log(`📡 Broadcasting as: ${os.hostname()}`);
    console.log(`🌐 Network ID: ${LOCAL_NETWORK}`);

    setInterval(() => {
        const msg = JSON.stringify({
            type: "PEER_ANNOUNCE",
            name: os.hostname(),
            port: PORT
        });

        udpServer.send(msg, PEER_PORT, "255.255.255.255", (err) => {
            if (err) console.error("Broadcast error:", err);
        });
    }, 5000);

    setInterval(() => {
        const now = Date.now();
        for (const [key, peer] of discoveredPeers.entries()) {
            if (now - peer.lastSeen.getTime() > 30000) {
                console.log(`🔌 Peer offline: ${peer.name}`);
                discoveredPeers.delete(key);
                io.emit('peer:offline', key);
                Peer.findOneAndUpdate(
                    { peerId: key },
                    { isOnline: false },
                    { upsert: false }
                ).catch(err => console.error("Peer update error:", err));
            }
        }
    }, 30000);
});

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

// ====================== PERMISSION CHECK ======================
async function checkGroupPermission(userId, groupId, requiredRole = 'member') {
    const group = await Group.findById(groupId);
    if (!group) return { allowed: false, error: 'Group not found' };
    
    const member = group.members.find(m => m.userId.toString() === userId);
    if (!member) return { allowed: false, error: 'Not a group member' };
    
    const roleHierarchy = { member: 0, moderator: 1, admin: 2 };
    const userLevel = roleHierarchy[member.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel < requiredLevel) {
        return { allowed: false, error: 'Insufficient permissions' };
    }
    
    return { allowed: true, role: member.role, group };
}

// ====================== TEXT EXTRACTION ======================
async function extractTextContent(filePath, mimeType) {
    try {
        if (mimeType === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else if (mimeType.startsWith('text/')) {
            return fs.readFileSync(filePath, 'utf8');
        }
    } catch (err) {
        console.error('Text extraction error:', err);
    }
    return '';
}

// ====================== PREVIEW GENERATION ======================
async function generatePreview(filePath, mimeType) {
    try {
        if (mimeType.startsWith('image/')) {
            const previewFilename = `preview-${Date.now()}.jpg`;
            const previewPath = path.join(__dirname, 'previews', previewFilename);
            
            await sharp(filePath)
                .resize(300, 300, { fit: 'inside' })
                .jpeg({ quality: 80 })
                .toFile(previewPath);
            
            return previewFilename;
        }
        // Add more preview types as needed (PDF first page, video thumbnail, etc.)
    } catch (err) {
        console.error('Preview generation error:', err);
    }
    return null;
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

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("username email storageUsed storageLimit theme createdAt");
    if (!user) return res.status(404).json({ error: "User not found" });
    
    res.json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      theme: user.theme,
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error("/auth/me error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.patch("/api/auth/settings", auth, async (req, res) => {
    try {
        const { theme, emailNotifications, storageAlerts } = req.body;
        const user = await User.findById(req.user.userId);
        
        if (theme !== undefined) user.theme = theme;
        if (emailNotifications !== undefined) user.emailNotifications = emailNotifications;
        if (storageAlerts !== undefined) user.storageAlerts = storageAlerts;
        
        await user.save();
        res.json({ success: true, user });
    } catch (err) {
        console.error('Settings update error:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ====================== GROUP ROUTES (ENHANCED) ======================
app.post("/api/groups/create", auth, async (req, res) => {
    try {
        const { name, description, isPrivate = true } = req.body;
        const encryptionKey = crypto.randomBytes(32).toString("hex");

        const group = await Group.create({
            name,
            description,
            creator: req.user.userId,
            encryptionKey,
            inviteCode: crypto.randomBytes(3).toString("hex").toUpperCase(),
            isPrivate,
            members: [{ userId: req.user.userId, role: "admin" }]
        });

        await User.findByIdAndUpdate(req.user.userId, {
            $addToSet: { groups: group._id }
        });

        res.json(group);
    } catch (err) {
        console.error("Create group error:", err);
        res.status(500).json({ error: "Failed to create group" });
    }
});

app.get("/api/groups", auth, async (req, res) => {
  try {
    const groups = await Group.find({ "members.userId": req.user.userId })
      .populate("creator", "username")
      .sort({ createdAt: -1 });
    
    const groupsWithCount = groups.map(g => {
      const member = g.members.find(m => m.userId.toString() === req.user.userId);
      const userRole = member ? member.role : 'member';
      
      return {
        id: g._id.toString(),
        _id: g._id,
        name: g.name,
        description: g.description,
        inviteCode: g.inviteCode,
        isPrivate: g.isPrivate,
        creator: g.creator,
        isCreator: g.creator ? g.creator._id.toString() === req.user.userId : false,
        memberCount: g.members.length,
        role: userRole,
        createdAt: g.createdAt
      };
    });
    
    res.json(groupsWithCount);
  } catch (err) {
    console.error("Get groups error:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// NEW: Get group members with roles
app.get("/api/groups/:id/members", auth, async (req, res) => {
    try {
        const permission = await checkGroupPermission(req.user.userId, req.params.id);
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const group = await Group.findById(req.params.id)
            .populate('members.userId', 'username email createdAt');
        
        res.json(group.members);
    } catch (err) {
        console.error("Get members error:", err);
        res.status(500).json({ error: "Failed to fetch members" });
    }
});

// NEW: Update member role
app.patch("/api/groups/:groupId/members/:userId/role", auth, async (req, res) => {
    try {
        const { role } = req.body;
        const permission = await checkGroupPermission(req.user.userId, req.params.groupId, 'admin');
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const group = permission.group;
        const member = group.members.find(m => m.userId.toString() === req.params.userId);
        if (!member) return res.status(404).json({ error: "Member not found" });

        member.role = role;
        await group.save();

        res.json({ success: true, member });
    } catch (err) {
        console.error("Update role error:", err);
        res.status(500).json({ error: "Failed to update role" });
    }
});

// NEW: Remove member from group
app.delete("/api/groups/:groupId/members/:userId", auth, async (req, res) => {
    try {
        const permission = await checkGroupPermission(req.user.userId, req.params.groupId, 'moderator');
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const group = permission.group;
        group.members = group.members.filter(m => m.userId.toString() !== req.params.userId);
        await group.save();

        await User.findByIdAndUpdate(req.params.userId, {
            $pull: { groups: req.params.groupId }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("Remove member error:", err);
        res.status(500).json({ error: "Failed to remove member" });
    }
});

app.post("/api/groups/join", auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!group) return res.status(404).json({ error: "Invalid invite code" });

    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (isMember) return res.status(400).json({ error: "Already a member" });

    group.members.push({ userId: req.user.userId, role: "member" });
    await group.save();

    await User.findByIdAndUpdate(req.user.userId, {
      $push: { groups: group._id }
    });

    res.json(group);
  } catch (err) {
    console.error("Join group error:", err);
    res.status(500).json({ error: "Failed to join group" });
  }
});

app.post("/api/groups/join-network", auth, async (req, res) => {
  try {
    let networkGroup = await Group.findOne({ name: "__NETWORK_SHARE__" });
    
    if (!networkGroup) {
      const encryptionKey = crypto.randomBytes(32).toString("hex");
      networkGroup = await Group.create({
        name: "__NETWORK_SHARE__",
        description: "Automatic group for local network sharing",
        encryptionKey,
        inviteCode: "NETWORK",
        members: [],
        isPrivate: false,
        isAutoGroup: true
      });
    }

    const isMember = networkGroup.members.some(m => m.userId.toString() === req.user.userId);
    
    if (!isMember) {
      networkGroup.members.push({ userId: req.user.userId, role: "member" });
      await networkGroup.save();
      
      await User.findByIdAndUpdate(req.user.userId, {
        $addToSet: { groups: networkGroup._id }
      });
    }

    res.json({
      success: true,
      group: {
        id: networkGroup._id.toString(),
        _id: networkGroup._id,
        name: networkGroup.name,
        description: networkGroup.description,
        inviteCode: networkGroup.inviteCode,
        isPrivate: false,
        memberCount: networkGroup.members.length,
        role: "member",
        isCreator: false
      }
    });
  } catch (err) {
    console.error("Join network error:", err);
    res.status(500).json({ error: "Failed to join network group" });
  }
});

app.patch("/api/groups/:id", auth, async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    const permission = await checkGroupPermission(req.user.userId, req.params.id, 'admin');
    if (!permission.allowed) return res.status(403).json({ error: permission.error });
    
    const group = permission.group;
    if (group.isAutoGroup) {
      return res.status(403).json({ error: "Cannot edit network share group" });
    }
    
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (isPrivate !== undefined) group.isPrivate = isPrivate;
    
    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    console.error("Update group error:", err);
    res.status(500).json({ error: "Failed to update group" });
  }
});

app.delete("/api/groups/:id", auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    if (group.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: "Only the creator can delete this group" });
    }
    
    if (group.isAutoGroup) {
      return res.status(403).json({ error: "Cannot delete network share group" });
    }
    
    const files = await File.find({ group: req.params.id });
    for (const file of files) {
      const filePath = path.join(__dirname, "uploads", file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      
      if (file.hasPreview && file.previewPath) {
        const previewPath = path.join(__dirname, "previews", file.previewPath);
        if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      }
      
      await User.findByIdAndUpdate(file.owner, {
        $inc: { storageUsed: -file.size }
      });
    }
    
    await File.deleteMany({ group: req.params.id });
    await Folder.deleteMany({ group: req.params.id });
    await GroupMessage.deleteMany({ group: req.params.id });
    
    await User.updateMany(
      { groups: req.params.id },
      { $pull: { groups: req.params.id } }
    );
    
    await Group.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

app.post("/api/groups/:id/leave", auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    if (group.isAutoGroup) {
      return res.status(403).json({ error: "Cannot leave network share group" });
    }
    
    const memberIndex = group.members.findIndex(m => m.userId.toString() === req.user.userId);
    if (memberIndex === -1) {
      return res.status(400).json({ error: "You are not a member of this group" });
    }
    
    if (group.creator.toString() === req.user.userId && group.members.length > 1) {
      return res.status(403).json({ error: "Creator cannot leave group with other members" });
    }
    
    group.members.splice(memberIndex, 1);
    
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { groups: req.params.id }
    });
    
    await group.save();
    
    if (group.members.length === 0) {
      const files = await File.find({ group: req.params.id });
      for (const file of files) {
        const filePath = path.join(__dirname, "uploads", file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        await User.findByIdAndUpdate(file.owner, {
          $inc: { storageUsed: -file.size }
        });
      }
      await File.deleteMany({ group: req.params.id });
      await Folder.deleteMany({ group: req.params.id });
      await Group.findByIdAndDelete(req.params.id);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Leave group error:", err);
    res.status(500).json({ error: "Failed to leave group" });
  }
});

// ====================== FOLDER ROUTES (NEW) ======================
app.post("/api/folders/create", auth, async (req, res) => {
    try {
        const { name, parentId, groupId } = req.body;
        
        const permission = await checkGroupPermission(req.user.userId, groupId);
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        let folderPath = '/';
        if (parentId) {
            const parentFolder = await Folder.findById(parentId);
            if (parentFolder) {
                folderPath = `${parentFolder.path}${parentFolder.name}/`;
            }
        }

        const folder = await Folder.create({
            name,
            parent: parentId || null,
            group: groupId,
            owner: req.user.userId,
            path: folderPath
        });

        res.json(folder);
    } catch (err) {
        console.error("Create folder error:", err);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

app.get("/api/folders/group/:groupId", auth, async (req, res) => {
    try {
        const { parentId } = req.query;
        const permission = await checkGroupPermission(req.user.userId, req.params.groupId);
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const folders = await Folder.find({
            group: req.params.groupId,
            parent: parentId || null
        }).populate('owner', 'username').sort({ name: 1 });

        res.json(folders);
    } catch (err) {
        console.error("Get folders error:", err);
        res.status(500).json({ error: "Failed to fetch folders" });
    }
});

app.delete("/api/folders/:id", auth, async (req, res) => {
    try {
        const folder = await Folder.findById(req.params.id);
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        const permission = await checkGroupPermission(req.user.userId, folder.group.toString(), 'moderator');
        if (!permission.allowed && folder.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        // Delete all subfolders recursively
        async function deleteSubfolders(folderId) {
            const subfolders = await Folder.find({ parent: folderId });
            for (const subfolder of subfolders) {
                await deleteSubfolders(subfolder._id);
            }
            
            // Delete files in this folder
            const files = await File.find({ folder: folderId });
            for (const file of files) {
                const filePath = path.join(__dirname, "uploads", file.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                
                if (file.hasPreview && file.previewPath) {
                    const previewPath = path.join(__dirname, "previews", file.previewPath);
                    if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
                }
                
                await User.findByIdAndUpdate(file.owner, {
                    $inc: { storageUsed: -file.size }
                });
            }
            await File.deleteMany({ folder: folderId });
            await Folder.findByIdAndDelete(folderId);
        }

        await deleteSubfolders(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error("Delete folder error:", err);
        res.status(500).json({ error: "Failed to delete folder" });
    }
});

// ====================== FILE ROUTES (ENHANCED) ======================
app.post("/api/files/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const { groupId, tags, folderId } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not a group member" });
    }

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
    fs.writeFileSync(filePath, encrypted);

    // Extract text for search
    const textContent = await extractTextContent(filePath, req.file.mimetype);
    
    // Generate preview
    const previewFilename = await generatePreview(filePath, req.file.mimetype);

    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { storageUsed: req.file.size }
    });

    const file = await File.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      group: groupId,
      folder: folderId || null,
      owner: req.user.userId,
      encryptionIV: iv.toString("hex"),
      encryptionAuthTag: authTag.toString("hex"),
      tags: tags ? JSON.parse(tags) : [],
      textContent: textContent,
      hasPreview: !!previewFilename,
      previewPath: previewFilename
    });

    await TransferLog.create({
      fileId: file._id,
      action: "upload",
      userId: req.user.userId,
      groupId: groupId
    });

    // Notify group members via WebSocket
    io.to(`group-${groupId}`).emit('file:uploaded', {
      file: file,
      uploader: req.user.userId
    });

    res.json(file);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

app.get("/api/files/group/:id", auth, async (req, res) => {
  try {
    const { folderId } = req.query;
    const permission = await checkGroupPermission(req.user.userId, req.params.id);
    if (!permission.allowed) return res.status(403).json({ error: permission.error });

    const files = await File.find({
      group: req.params.id,
      folder: folderId || null
    })
      .populate("owner", "username email")
      .sort({ uploadedAt: -1 });
    
    res.json(files);
  } catch (err) {
    console.error("Get files error:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// NEW: Full-text search
app.get("/api/files/search", auth, async (req, res) => {
    try {
        const { query, groupId } = req.query;
        if (!query) return res.json([]);

        const permission = await checkGroupPermission(req.user.userId, groupId);
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const searchRegex = new RegExp(query, 'i');
        const files = await File.find({
            group: groupId,
            $or: [
                { originalName: searchRegex },
                { textContent: searchRegex },
                { tags: searchRegex }
            ]
        }).populate('owner', 'username').limit(50);

        res.json(files);
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Search failed" });
    }
});

// NEW: Get file preview
app.get("/api/files/:id/preview", auth, async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const permission = await checkGroupPermission(req.user.userId, file.group.toString());
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        if (!file.hasPreview || !file.previewPath) {
            return res.status(404).json({ error: "No preview available" });
        }

        const previewPath = path.join(__dirname, "previews", file.previewPath);
        if (!fs.existsSync(previewPath)) {
            return res.status(404).json({ error: "Preview file not found" });
        }

        res.sendFile(previewPath);
    } catch (err) {
        console.error("Preview error:", err);
        res.status(500).json({ error: "Failed to get preview" });
    }
});

app.get("/api/files/download/:id", auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id).populate("group");
    if (!file) return res.status(404).json({ error: "File not found" });

    const group = await Group.findById(file.group._id);
    const isMember = group.members.some(m => m.userId.toString() === req.user.userId);
    if (!isMember) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const filePath = path.join(__dirname, "uploads", file.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk" });
    }

    const encryptedData = fs.readFileSync(filePath);

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

    await File.findByIdAndUpdate(file._id, { $inc: { downloads: 1 } });

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

    const permission = await checkGroupPermission(req.user.userId, file.group.toString(), 'moderator');
    if (!permission.allowed && file.owner.toString() !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const filePath = path.join(__dirname, "uploads", file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    
    if (file.hasPreview && file.previewPath) {
      const previewPath = path.join(__dirname, "previews", file.previewPath);
      if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $inc: { storageUsed: -file.size }
    });

    await File.findByIdAndDelete(req.params.id);

    await TransferLog.create({
      fileId: file._id,
      action: "delete",
      userId: req.user.userId,
      groupId: file.group
    });

    // Notify via WebSocket
    io.to(`group-${file.group}`).emit('file:deleted', {
      fileId: file._id,
      deletedBy: req.user.userId
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ====================== SHARE LINK ROUTES (NEW) ======================
app.post("/api/files/:id/share", auth, async (req, res) => {
    try {
        const { password, expiresIn, maxDownloads } = req.body;
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });

        const permission = await checkGroupPermission(req.user.userId, file.group.toString());
        if (!permission.allowed && file.owner.toString() !== req.user.userId) {
            return res.status(403).json({ error: "Not authorized" });
        }

        const linkId = crypto.randomBytes(16).toString('hex');
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 60 * 60 * 1000) : null;
        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

        const shareLink = await ShareLink.create({
            fileId: file._id,
            linkId,
            password: hashedPassword,
            expiresAt,
            maxDownloads,
            createdBy: req.user.userId
        });

        res.json({
            linkId,
            url: `${req.protocol}://${req.get('host')}/api/share/${linkId}`,
            expiresAt,
            maxDownloads
        });
    } catch (err) {
        console.error("Create share link error:", err);
        res.status(500).json({ error: "Failed to create share link" });
    }
});

app.get("/api/share/:linkId", async (req, res) => {
    try {
        const shareLink = await ShareLink.findOne({ linkId: req.params.linkId })
            .populate({
                path: 'fileId',
                populate: { path: 'group' }
            });

        if (!shareLink) return res.status(404).json({ error: "Share link not found" });

        if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
            return res.status(410).json({ error: "Share link has expired" });
        }

        if (shareLink.maxDownloads && shareLink.downloads >= shareLink.maxDownloads) {
            return res.status(410).json({ error: "Download limit reached" });
        }

        res.json({
            requiresPassword: !!shareLink.password,
            fileName: shareLink.fileId.originalName,
            fileSize: shareLink.fileId.size,
            mimeType: shareLink.fileId.mimeType
        });
    } catch (err) {
        console.error("Get share link error:", err);
        res.status(500).json({ error: "Failed to get share link" });
    }
});

app.post("/api/share/:linkId/download", async (req, res) => {
    try {
        const { password } = req.body;
        const shareLink = await ShareLink.findOne({ linkId: req.params.linkId })
            .populate({
                path: 'fileId',
                populate: { path: 'group' }
            });

        if (!shareLink) return res.status(404).json({ error: "Share link not found" });

        if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
            return res.status(410).json({ error: "Share link has expired" });
        }

        if (shareLink.maxDownloads && shareLink.downloads >= shareLink.maxDownloads) {
            return res.status(410).json({ error: "Download limit reached" });
        }

        if (shareLink.password) {
            if (!password) return res.status(401).json({ error: "Password required" });
            const validPassword = await bcrypt.compare(password, shareLink.password);
            if (!validPassword) return res.status(401).json({ error: "Invalid password" });
        }

        const file = shareLink.fileId;
        const filePath = path.join(__dirname, "uploads", file.filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found on disk" });
        }

        const encryptedData = fs.readFileSync(filePath);
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

        await ShareLink.findByIdAndUpdate(shareLink._id, {
            $inc: { downloads: 1 }
        });

        res.setHeader("Content-Type", file.mimeType);
        res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
        res.send(decrypted);
    } catch (err) {
        console.error("Share download error:", err);
        res.status(500).json({ error: "Download failed" });
    }
});

// ====================== GROUP CHAT ROUTES (NEW) ======================
app.get("/api/groups/:id/messages", auth, async (req, res) => {
    try {
        const { limit = 50, before } = req.query;
        const permission = await checkGroupPermission(req.user.userId, req.params.id);
        if (!permission.allowed) return res.status(403).json({ error: permission.error });

        const query = { group: req.params.id };
        if (before) query.timestamp = { $lt: new Date(before) };

        const messages = await GroupMessage.find(query)
            .populate('sender', 'username')
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));

        // Decrypt messages
        const group = permission.group;
        const decryptedMessages = messages.map(msg => {
            if (msg.isEncrypted) {
                try {
                    const decipher = crypto.createDecipheriv(
                        'aes-256-cbc',
                        Buffer.from(group.encryptionKey, 'hex').slice(0, 32),
                        Buffer.from(msg.iv, 'hex')
                    );
                    const decrypted = Buffer.concat([
                        decipher.update(Buffer.from(msg.message, 'hex')),
                        decipher.final()
                    ]);
                    return {
                        ...msg.toObject(),
                        message: decrypted.toString('utf8')
                    };
                } catch (err) {
                    console.error('Message decryption error:', err);
                    return msg;
                }
            }
            return msg;
        });

        res.json(decryptedMessages.reverse());
    } catch (err) {
        console.error("Get messages error:", err);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
});

// ====================== WEBSOCKET FOR CHAT ======================
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join:group', async ({ groupId, userId }) => {
        try {
            const permission = await checkGroupPermission(userId, groupId);
            if (permission.allowed) {
                socket.join(`group-${groupId}`);
                console.log(`User ${userId} joined group ${groupId}`);
            }
        } catch (err) {
            console.error('Join group error:', err);
        }
    });

    socket.on('leave:group', ({ groupId }) => {
        socket.leave(`group-${groupId}`);
    });

    socket.on('message:send', async ({ groupId, userId, message }) => {
        try {
            const permission = await checkGroupPermission(userId, groupId);
            if (!permission.allowed) return;

            const group = permission.group;

            // Encrypt message
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(
                'aes-256-cbc',
                Buffer.from(group.encryptionKey, 'hex').slice(0, 32),
                iv
            );
            const encrypted = Buffer.concat([
                cipher.update(message, 'utf8'),
                cipher.final()
            ]);

            const groupMessage = await GroupMessage.create({
                group: groupId,
                sender: userId,
                message: encrypted.toString('hex'),
                isEncrypted: true,
                iv: iv.toString('hex')
            });

            const populatedMessage = await GroupMessage.findById(groupMessage._id)
                .populate('sender', 'username');

            // Broadcast decrypted message to group members
            io.to(`group-${groupId}`).emit('message:received', {
                ...populatedMessage.toObject(),
                message: message // Send decrypted to connected clients
            });
        } catch (err) {
            console.error('Send message error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ====================== PEERS ======================
app.get("/api/peers", auth, async (req, res) => {
    const peers = [...discoveredPeers.values()];
    res.json(peers);
});

app.post("/api/peers/connect", auth, async (req, res) => {
    try {
        const { peerId } = req.body;
        const peer = discoveredPeers.get(peerId);
        
        if (!peer) {
            return res.status(404).json({ error: 'Peer not found or offline' });
        }
        
        res.json({
            success: true,
            peer: peer,
            message: `Connected to ${peer.name || peer.ip}`
        });
    } catch (err) {
        console.error('Peer connect error:', err);
        res.status(500).json({ error: 'Failed to connect to peer' });
    }
});

// ====================== STATS ======================
app.get("/api/stats/dashboard", auth, async (req, res) => {
    try {
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
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ====================== ERROR HANDLER ======================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
});

// ====================== ROOT ROUTES ======================
app.get("/", (req, res) => {
  res.json({
    message: "🌐 DeCloud Backend (Enhanced) is running!",
    status: "online",
    features: [
      "✅ Folder support",
      "✅ Encrypted file sharing",
      "✅ Multi-network support",
      "✅ Full-text search",
      "✅ File previews",
      "✅ Group roles (admin/moderator/member)",
      "✅ Group chat (WebSocket)"
    ],
    endpoints: {
      auth: "/api/auth/login, /api/auth/register, /api/auth/me",
      groups: "/api/groups, /api/groups/create, /api/groups/join",
      folders: "/api/folders/create, /api/folders/group/:id",
      files: "/api/files/upload, /api/files/group/:id, /api/files/search",
      sharing: "/api/files/:id/share, /api/share/:linkId",
      chat: "/api/groups/:id/messages (WebSocket: message:send)",
      peers: "/api/peers"
    },
    network: {
      host: getLocalIP(),
      port: PORT,
      networkId: LOCAL_NETWORK
    }
  });
});

app.get("/api", (req, res) => {
  res.json({ message: "DeCloud API Enhanced", version: "2.0.0" });
});

// ====================== SERVER ======================
server.listen(PORT, '0.0.0.0', () => {
  console.log("============================================================");
  console.log("🌐 DeCloud Backend (Enhanced) Running");
  console.log(`🚀 Local:    http://localhost:${PORT}`);
  console.log(`🚀 Network:  http://${getLocalIP()}:${PORT}`);
  console.log(`🌐 API:      http://${getLocalIP()}:${PORT}/api`);
  console.log(`💬 WebSocket: Enabled for group chat`);
  console.log(`🟣 Environment: ${NODE_ENV}`);
  console.log(`🌍 Network ID: ${LOCAL_NETWORK}`);
  console.log("============================================================");
});
