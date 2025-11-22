# 🌐 DeCloud - Decentralized Cloud Storage

> A secure, peer-to-peer file sharing platform with end-to-end encryption for local networks.

DeCloud is a **decentralized cloud storage platform** that enables secure file sharing across devices on the same local network. With automatic peer discovery, end-to-end encryption, and instant network-wide file sharing, DeCloud transforms your local network into a private cloud.

### ✨ Key Features

- 🔒 **End-to-End Encryption** - All files encrypted with AES-256-GCM
- 🌐 **Automatic Peer Discovery** - Devices on the same WiFi network are discovered automatically
- 📤 **Network Share** - Instant file sharing with all connected devices
- 👥 **Private Groups** - Create secure groups for selective file sharing
- 💾 **Storage Management** - Track storage usage with visual indicators
- 🎨 **Modern UI** - Clean, responsive interface with dark mode support
- 🔄 **Real-time Updates** - Live peer status and file synchronization
- 📱 **Cross-Platform** - Works on desktop, mobile, and tablets

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** (v6.0 or higher)
- **npm** or **yarn**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/shaileshjukaria/decloud.git
   cd decloud
   ```

2. **Install dependencies**
   ```bash
   # Install backend dependencies
   npm install

   # Install frontend dependencies (if separate)
   cd frontend
   npm install
   cd ..
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/decloud
   JWT_SECRET=your-super-secret-key-change-in-production
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=http://localhost:3000,http://YOUR_LOCAL_IP:3000
   MAX_FILE_SIZE=524288000
   ENCRYPTION_ALGORITHM=aes-256-gcm
   ENABLE_PEER_DISCOVERY=true
   PEER_PORT=5001
   NODE_ENV=development
   ```

4. **Start MongoDB**
   ```bash
   # Windows
   mongod

   # Mac (with Homebrew)
   brew services start mongodb-community

   # Linux
   sudo systemctl start mongod
   ```

5. **Start the backend server**
   ```bash
   node server.js
   ```
   
   You should see:
   ```
   ✅ MongoDB Connected
   🔍 Peer discovery active (UDP 5001)
   ============================================================
   🌐 DeCloud Backend Running
   🚀 Local:    http://localhost:5000
   🚀 Network:  http://192.168.1.X:5000
   ============================================================
   ```

6. **Start the frontend** (in a new terminal)
   ```bash
   npm start
   ```

7. **Access DeCloud**
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_IP:3000`

---

## 🌐 Network Setup Guide

### Connecting Multiple Devices

#### Step 1: Find Your IP Address

**Windows:**
```bash
ipconfig
# Look for "IPv4 Address" under your WiFi adapter (e.g., 192.168.1.105)
```

**Mac/Linux:**
```bash
ifconfig
# or
ip addr show
# Look for inet address (e.g., 192.168.1.105)
```

#### Step 2: Update Configuration

Update your `.env` file with your IP:
```env
FRONTEND_URL=http://localhost:3000,http://192.168.1.105:3000
```

#### Step 3: Configure Firewall

**Windows:**
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "DeCloud-3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "DeCloud-5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "DeCloud-5001" -Direction Inbound -LocalPort 5001 -Protocol UDP -Action Allow
```

**Mac:**
- System Preferences → Security & Privacy → Firewall → Firewall Options
- Allow Node.js to accept incoming connections

**Linux:**
```bash
sudo ufw allow 3000
sudo ufw allow 5000
sudo ufw allow 5001
```

#### Step 4: Access from Other Devices

On devices connected to the **same WiFi network**, open a browser and navigate to:
```
http://192.168.1.105:3000
```
*(Replace with your actual IP address)*

---

## 📚 Usage Guide

### 1. Account Creation

- Navigate to DeCloud in your browser
- Click "Register"
- Enter username, email, and password
- You're automatically logged in!

### 2. Network Share (Instant File Sharing)

**All devices on the same network automatically join "Network Share"**

1. Go to **Groups** tab
2. Click **"Open Network Share"** (purple banner at top)
3. Upload files - they're instantly visible to all network devices!

**Perfect for:**
- Quick file transfers between devices
- Sharing photos/videos with everyone on network
- Collaborative work sessions

### 3. Private Groups (Selective Sharing)

**Create secure groups for specific people**

1. Go to **Groups** tab
2. Click **"Create New Group"**
3. Enter group name and description
4. Share the **invite code** with others
5. They join using the code
6. Upload files - only group members can access them

**Perfect for:**
- Family photo albums
- Work project files
- Private document sharing

### 4. Peer Discovery

**See all devices on your network**

1. Go to **Peers** tab
2. Wait 5-10 seconds for automatic discovery
3. Connected devices appear automatically
4. View device names, IPs, and online status

### 5. File Management

**Upload:**
- Select group or Network Share
- Click "Upload & Encrypt"
- Choose file(s)
- Files are encrypted and uploaded

**Download:**
- Click "Download" on any file
- File is automatically decrypted
- Saved to your downloads folder

**Delete:**
- Click trash icon (only file owner)
- Confirm deletion
- File removed from all devices

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │Dashboard │  │  Groups  │  │  Files   │  │  Peers  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST API
┌────────────────────┴────────────────────────────────────┐
│              Backend (Node.js/Express)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │   Auth   │  │  Groups  │  │  Files   │  │  Peers  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │        AES-256-GCM Encryption/Decryption         │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│                   MongoDB Database                       │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────────┐ │
│  │ Users  │  │ Groups │  │ Files  │  │Transfer Logs │ │
│  └────────┘  └────────┘  └────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│           UDP Peer Discovery (Port 5001)                  │
│   Broadcasts presence every 5 seconds on local network   │
└──────────────────────────────────────────────────────────┘
```

### Security Features

- **JWT Authentication** - Secure token-based auth
- **AES-256-GCM Encryption** - Military-grade file encryption
- **Bcrypt Password Hashing** - Secure password storage
- **Per-Group Encryption Keys** - Each group has unique encryption key
- **CORS Protection** - Configured for local network security

---

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Multer** - File upload handling
- **Crypto** - Native encryption module

### Frontend
- **React** - UI framework
- **Axios** - HTTP client
- **CSS3** - Styling with glassmorphism effects
- **Context API** - State management

### Network
- **UDP Broadcast** - Peer discovery
- **REST API** - Client-server communication

---

## 📁 Project Structure

```
decloud/
├── server.js                 # Backend entry point
├── .env                      # Environment variables
├── package.json              # Backend dependencies
├── uploads/                  # Encrypted file storage
│
├── src/                      # Frontend source
│   ├── App.js               # Main app component
│   ├── App.css              # Main styles
│   ├── index.js             # React entry point
│   │
│   ├── components/          # React components
│   │   ├── Navbar.js
│   │   ├── Footer.js
│   │   ├── CookieBanner.js
│   │   ├── FilesPage.js
│   │   ├── GroupsPage.js
│   │   ├── PeersPage.js
│   │   └── Sidebar.js
│   │
│   └── contexts/            # React contexts
│       └── ThemeContext.js
│
├── public/                  # Static files
│   └── index.html
│
└── README.md               # This file
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/decloud` |
| `JWT_SECRET` | Secret key for JWT signing | **Change in production!** |
| `JWT_EXPIRES_IN` | JWT token expiration | `7d` |
| `FRONTEND_URL` | Allowed frontend origins (comma-separated) | `http://localhost:3000` |
| `MAX_FILE_SIZE` | Maximum file upload size in bytes | `524288000` (500MB) |
| `ENCRYPTION_ALGORITHM` | Encryption algorithm | `aes-256-gcm` |
| `ENABLE_PEER_DISCOVERY` | Enable/disable peer discovery | `true` |
| `PEER_PORT` | UDP port for peer discovery | `5001` |
| `NODE_ENV` | Environment mode | `development` |

---

## 🐛 Troubleshooting

### Peers Not Showing Up

**Problem:** Other devices don't appear in Peers tab

**Solutions:**
1. Ensure all devices are on the **same WiFi network**
2. Check firewall settings allow ports 5000, 5001
3. Verify `ENABLE_PEER_DISCOVERY=true` in `.env`
4. Wait 10-15 seconds for discovery
5. Try refreshing the Peers page

### Login/Register Not Working from Network

**Problem:** Can login on localhost but not from other devices

**Solutions:**
1. Check backend is running on `0.0.0.0`:
   ```javascript
   app.listen(PORT, '0.0.0.0', () => {})
   ```
2. Verify API base URL uses dynamic hostname:
   ```javascript
   const hostname = window.location.hostname;
   const API = axios.create({ 
     baseURL: `http://${hostname}:5000/api` 
   });
   ```
3. Check CORS configuration allows local IPs
4. Ensure backend shows "Network:" URL on startup

### Files Not Uploading

**Problem:** Upload button doesn't work or shows error

**Solutions:**
1. Check file size under 500MB (or your `MAX_FILE_SIZE`)
2. Ensure `uploads/` folder exists and is writable
3. Verify user is member of the group
4. Check MongoDB is running
5. Look for errors in backend console

### MongoDB Connection Failed

**Problem:** "MongoDB Error" on startup

**Solutions:**
1. Start MongoDB service:
   ```bash
   # Windows
   net start MongoDB
   
   # Mac
   brew services start mongodb-community
   
   # Linux
   sudo systemctl start mongod
   ```
2. Verify connection string in `.env`
3. Check MongoDB is listening on port 27017

---

## 🔐 Security Considerations

### For Development
- Change `JWT_SECRET` to a strong random string
- Use unique encryption keys per deployment
- Enable HTTPS for production use

### For Production
- Use environment variables for all secrets
- Enable MongoDB authentication
- Implement rate limiting
- Add request validation
- Use HTTPS/TLS for all connections
- Implement file type validation
- Add virus scanning for uploads
- Set up regular database backups

---

## 🚦 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Login to account |
| GET | `/api/auth/me` | Get current user info |
| PATCH | `/api/auth/preferences` | Update user profile |

### Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | Get user's groups |
| POST | `/api/groups/create` | Create new group |
| POST | `/api/groups/join` | Join group with invite code |
| POST | `/api/groups/join-network` | Auto-join network group |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload encrypted file |
| GET | `/api/files/group/:id` | Get files in group |
| GET | `/api/files/download/:id` | Download and decrypt file |
| DELETE | `/api/files/:id` | Delete file |

### Network
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/peers` | Get discovered peers |
| GET | `/api/stats/dashboard` | Get user statistics |

---

## 📊 Performance

- **File Upload Speed:** Limited by network bandwidth
- **Peer Discovery:** ~5-10 seconds
- **Encryption/Decryption:** Real-time (< 1s for most files)
- **Concurrent Users:** Tested with up to 10 devices
- **Max File Size:** Configurable (default 500MB)

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Write meaningful commit messages
- Test on multiple devices before submitting
- Update documentation for new features

---

## 📝 Roadmap

### Planned Features
- [ ] Mobile app (React Native)
- [ ] File versioning
- [ ] Folder support
- [ ] Batch file operations
- [ ] File preview (images, PDFs)
- [ ] Search functionality
- [ ] Activity notifications
- [ ] WebRTC for direct peer transfer
- [ ] Offline file access
- [ ] Advanced encryption options

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)
- Email: your.email@example.com

---

## 🙏 Acknowledgments

- Built with ❤️ using Node.js and React
- Inspired by decentralized storage systems
- Thanks to all contributors

---

## 📞 Support

For support, please:
1. Check the [Troubleshooting](#-troubleshooting) section
2. Open an issue on GitHub
3. Email: support@yourdecloud.com

---

## 📸 Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.png)
*Track storage usage and recent activity*

### Network Share
![Network Share](screenshots/network-share.png)
*Instant file sharing with all network devices*

### Groups
![Groups](screenshots/groups.png)
*Create and manage private groups*

### Peers
![Peers](screenshots/peers.png)
*View all connected devices on your network*

---

## ⚡ Quick Commands

```bash
# Start everything
npm run dev

# Start backend only
node server.js

# Start frontend only
npm start

# Run tests
npm test

# Build for production
npm run build

# Check for updates
npm outdated

# Update dependencies
npm update
```

---

<div align="center">

**[⬆ back to top](#-decloud---decentralized-cloud-storage)**

Made with ☕ and 💻

**Star ⭐ this repo if you find it useful!**

</div>