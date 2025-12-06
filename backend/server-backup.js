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

// CORS configuration
// In development, reflect the incoming origin and allow credentials so
// LAN devices and dev tools can access the API. In production keep the
// more restrictive check against FRONTEND_URL.
if (NODE_ENV === 'development') {
  app.use(cors({
    origin: true, // reflect request origin
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
            role: { type: String, default: "member" }
        }],
        encryptionKey: String,
        inviteCode: String,
        isPrivate: { type: Boolean, default: true },
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

// Create network group on startup
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

const LOCAL_IP = getLocalIP();

// ====================== PEER DISCOVERY (FIXED) ======================
let discoveredPeers = new Map();

// Always enable peer discovery for local network sharing
const udpServer = dgram.createSocket("udp4");

udpServer.on("message", async (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());

        // Skip our own announcements
        if (rinfo.address === LOCAL_IP) return;

        if (data.type === "PEER_ANNOUNCE") {
            const peerKey = `${rinfo.address}:${data.port}`;

            discoveredPeers.set(peerKey, {
                id: peerKey, // Add id field for frontend
                name: data.name || rinfo.address,
                ip: rinfo.address,
                port: data.port,
                lastSeen: new Date()
            });

            console.log(`📡 Discovered peer: ${data.name || rinfo.address} at ${rinfo.address}:${data.port}`);

            await Peer.findOneAndUpdate(
                { peerId: peerKey },
                {
                    peerId: peerKey,
                    name: data.name || rinfo.address,
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

udpServer.on("error", (err) => {
    console.error("UDP server error:", err);
});

udpServer.bind(PEER_PORT, "0.0.0.0", () => {
    udpServer.setBroadcast(true);
    console.log(`🔍 Peer discovery active on UDP port ${PEER_PORT}`);
    console.log(`📡 Broadcasting as: ${os.hostname()}`);

    // Broadcast our presence every 5 seconds
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

    // Clean up stale peers every 30 seconds
    setInterval(() => {
        const now = Date.now();
        for (const [key, peer] of discoveredPeers.entries()) {
            if (now - peer.lastSeen.getTime() > 30000) {
                console.log(`🔌 Peer offline: ${peer.name}`);
                discoveredPeers.delete(key);
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

// Auto-join network group
app.post("/api/groups/join-network", auth, async (req, res) => {
  try {
    let networkGroup = await Group.findOne({ name: "__NETWORK_SHARE__" });
    
    if (!networkGroup) {
      // Create network group if it doesn't exist
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
      console.log("✅ Network sharing group created");
    }

    // Check if already member
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

// Global error handler to avoid crashing on unhandled errors
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Server error' });
});

// ====================== GROUP ROUTES ======================
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

        // Add group to user's groups array
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
    
    // Add member count and role to each group
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

// Update group settings
app.patch("/api/groups/:id", auth, async (req, res) => {
  try {
    const { name, description, isPrivate } = req.body;
    const group = await Group.findById(req.params.id);
    
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    // Check if user is creator or admin
    const member = group.members.find(m => m.userId.toString() === req.user.userId);
    if (!member || (member.role !== "admin" && group.creator.toString() !== req.user.userId)) {
      return res.status(403).json({ error: "Not authorized to edit this group" });
    }
    
    // Don't allow editing network share group
    if (group.name === "__NETWORK_SHARE__" || group.inviteCode === "NETWORK") {
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

// Delete group
app.delete("/api/groups/:id", auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    // Check if user is creator
    if (group.creator.toString() !== req.user.userId) {
      return res.status(403).json({ error: "Only the creator can delete this group" });
    }
    
    // Don't allow deleting network share group
    if (group.name === "__NETWORK_SHARE__" || group.inviteCode === "NETWORK") {
      return res.status(403).json({ error: "Cannot delete network share group" });
    }
    
    // Delete all files in this group
    const files = await File.find({ group: req.params.id });
    for (const file of files) {
      const filePath = path.join(__dirname, "uploads", file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Update user storage
      await User.findByIdAndUpdate(file.owner, {
        $inc: { storageUsed: -file.size }
      });
    }
    
    await File.deleteMany({ group: req.params.id });
    
    // Remove group from all users
    await User.updateMany(
      { groups: req.params.id },
      { $pull: { groups: req.params.id } }
    );
    
    // Delete the group
    await Group.findByIdAndDelete(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error("Delete group error:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

// Leave group
app.post("/api/groups/:id/leave", auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) return res.status(404).json({ error: "Group not found" });
    
    // Don't allow leaving network share group
    if (group.name === "__NETWORK_SHARE__" || group.inviteCode === "NETWORK") {
      return res.status(403).json({ error: "Cannot leave network share group" });
    }
    
    // Check if user is a member
    const memberIndex = group.members.findIndex(m => m.userId.toString() === req.user.userId);
    if (memberIndex === -1) {
      return res.status(400).json({ error: "You are not a member of this group" });
    }
    
    // Don't allow creator to leave if there are other members
    if (group.creator.toString() === req.user.userId && group.members.length > 1) {
      return res.status(403).json({ error: "Creator cannot leave group with other members. Delete the group or transfer ownership first." });
    }
    
    // Remove user from group members
    group.members.splice(memberIndex, 1);
    
    // Remove group from user's groups
    await User.findByIdAndUpdate(req.user.userId, {
      $pull: { groups: req.params.id }
    });
    
    // Save group changes
    await group.save();
    
    // If group is now empty, delete it
    if (group.members.length === 0) {
      // Delete all files in this group
      const files = await File.find({ group: req.params.id });
      for (const file of files) {
        const filePath = path.join(__dirname, "uploads", file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        // Update user storage
        await User.findByIdAndUpdate(file.owner, {
          $inc: { storageUsed: -file.size }
        });
      }
      await File.deleteMany({ group: req.params.id });
      await Group.findByIdAndDelete(req.params.id);
    }
    
    res.json({ success: true, message: "Left group successfully" });
  } catch (err) {
    console.error("Leave group error:", err);
    res.status(500).json({ error: "Failed to leave group", details: err.message });
  }
});

// ====================== FILE ROUTES ======================
app.post("/api/files/upload", auth, upload.single("file"), async (req, res) => {
  try {
    const { groupId, tags } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

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

// ====================== USER SETTINGS ======================
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

// ====================== PEERS ======================
app.get("/api/peers", auth, async (req, res) => {
    res.json([...discoveredPeers.values()]);
});

// Connect to peer
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

// ====================== SERVER ======================
app.listen(PORT, '0.0.0.0', () => {
  console.log("============================================================");
  console.log("🌐 DeCloud Backend Running");
  console.log(`🚀 Local:    http://localhost:${PORT}`);
  console.log(`🚀 Network:  http://${getLocalIP()}:${PORT}`);
  console.log(`🌐 API:      http://${getLocalIP()}:${PORT}/api`);
  console.log(`🟣 Environment: ${NODE_ENV}`);
  console.log("============================================================");
});
// ====================== ROOT ROUTE (for testing) ======================
app.get("/", (req, res) => {
  res.json({
    message: "🌐 DeCloud Backend is running!",
    status: "online",
    endpoints: {
      auth: "/api/auth/login, /api/auth/register, /api/auth/me",
      groups: "/api/groups, /api/groups/create, /api/groups/join",
      files: "/api/files/upload, /api/files/group/:id, /api/files/download/:id",
      peers: "/api/peers",
      stats: "/api/stats/dashboard"
    },
    network: {
      host: getLocalIP(),
      port: PORT
    }
  });
});

app.get("/api", (req, res) => {
  res.json({ message: "DeCloud API is running", version: "1.0.0" });
});