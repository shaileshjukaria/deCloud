const express = require('express');
const serverless = require('serverless-http');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Shailesh:shailesh@cluster0.ve28scv.mongodb.net', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).catch(err => console.error('MongoDB Error:', err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  storageUsed: { type: Number, default: 0 },
  storageLimit: { type: Number, default: 5368709120 },
  createdAt: { type: Date, default: Date.now }
});

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

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const File = mongoose.models.File || mongoose.model('File', FileSchema);
const TransferLog = mongoose.models.TransferLog || mongoose.model('TransferLog', TransferLogSchema);

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

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
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

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
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

app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/files', authenticateToken, async (req, res) => {
  try {
    const files = await File.find({ owner: req.user.userId })
      .sort({ uploadedAt: -1 });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/files/public', async (req, res) => {
  try {
    const files = await File.find({ isPublic: true })
      .select('originalName size fileHash uploadedAt')
      .populate('owner', 'username');
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'Decentralized Cloud Storage API',
    environment: process.env.NODE_ENV || 'production'
  });
});

app.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const fileCount = await File.countDocuments({ owner: req.user.userId });
    
    res.json({
      storageUsed: user.storageUsed,
      storageLimit: user.storageLimit,
      fileCount,
      totalDownloads: 0,
      peersOnline: 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports.handler = serverless(app);
