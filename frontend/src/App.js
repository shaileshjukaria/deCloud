import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || '/api';

// Configure axios defaults
axios.defaults.baseURL = API_URL;

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('login');
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [networkFiles, setNetworkFiles] = useState([]);
  const [peers, setPeers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Auth Form States
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });

  // File Upload States
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadOptions, setUploadOptions] = useState({ isEncrypted: false, isPublic: false, tags: '' });

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Set auth token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
      loadUserData();
    }
  }, []);

  // Auto-refresh data
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        loadFiles();
        loadNetworkFiles();
        loadPeers();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Show notification
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ==================== AUTH FUNCTIONS ====================

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('/auth/login', loginData);
      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      setIsAuthenticated(true);
      setUser(response.data.user);
      setCurrentView('dashboard');
      showNotification('Login successful!');
      loadUserData();
    } catch (error) {
      showNotification(error.response?.data?.error || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post('/auth/register', registerData);
      localStorage.setItem('token', response.data.token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
      setIsAuthenticated(true);
      setUser(response.data.user);
      setCurrentView('dashboard');
      showNotification('Registration successful!');
      loadUserData();
    } catch (error) {
      showNotification(error.response?.data?.error || 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setUser(null);
    setCurrentView('login');
    showNotification('Logged out successfully');
  };

  const loadUserData = async () => {
    try {
      const [filesRes, statsRes, peersRes] = await Promise.all([
        axios.get('/files'),
        axios.get('/stats/dashboard'),
        axios.get('/peers')
      ]);
      setFiles(filesRes.data);
      setStats(statsRes.data);
      setPeers(peersRes.data);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // ==================== FILE FUNCTIONS ====================

  const loadFiles = async () => {
    try {
      const response = await axios.get('/files');
      setFiles(response.data);
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const loadNetworkFiles = async () => {
    try {
      const response = await axios.get('/files/network');
      setNetworkFiles(response.data);
    } catch (error) {
      console.error('Error loading network files:', error);
    }
  };

  const loadPeers = async () => {
    try {
      const response = await axios.get('/peers');
      setPeers(response.data);
    } catch (error) {
      console.error('Error loading peers:', error);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showNotification('Please select a file', 'error');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('isEncrypted', uploadOptions.isEncrypted);
    formData.append('isPublic', uploadOptions.isPublic);
    formData.append('tags', JSON.stringify(uploadOptions.tags.split(',').map(t => t.trim()).filter(t => t)));

    try {
      await axios.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showNotification('File uploaded successfully!');
      setUploadFile(null);
      setUploadOptions({ isEncrypted: false, isPublic: false, tags: '' });
      loadFiles();
      loadUserData();
    } catch (error) {
      showNotification(error.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFileDownload = async (fileId, filename) => {
    try {
      const response = await axios.get(`/files/download/${fileId}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showNotification('File downloaded successfully!');
    } catch (error) {
      showNotification('Download failed', 'error');
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(`/files/${fileId}`);
      showNotification('File deleted successfully!');
      loadFiles();
      loadUserData();
    } catch (error) {
      showNotification('Delete failed', 'error');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) {
      loadFiles();
      return;
    }

    try {
      const response = await axios.get(`/files/search?q=${searchQuery}`);
      setFiles(response.data);
    } catch (error) {
      showNotification('Search failed', 'error');
    }
  };

  // ==================== UTILITY FUNCTIONS ====================

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // ==================== RENDER FUNCTIONS ====================

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>🌐 Decentralized Cloud Storage</h1>
          <div className="auth-tabs">
            <button
              className={currentView === 'login' ? 'active' : ''}
              onClick={() => setCurrentView('login')}
            >
              Login
            </button>
            <button
              className={currentView === 'register' ? 'active' : ''}
              onClick={() => setCurrentView('register')}
            >
              Register
            </button>
          </div>

          {currentView === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <input
                type="email"
                placeholder="Email"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Loading...' : 'Login'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <input
                type="text"
                placeholder="Username"
                value={registerData.username}
                onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={registerData.email}
                onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={registerData.password}
                onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                required
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Loading...' : 'Register'}
              </button>
            </form>
          )}
        </div>

        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.message}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h2>🌐 DeCloud</h2>
        <nav>
          <button
            className={currentView === 'dashboard' ? 'active' : ''}
            onClick={() => setCurrentView('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={currentView === 'myfiles' ? 'active' : ''}
            onClick={() => setCurrentView('myfiles')}
          >
            📁 My Files
          </button>
          <button
            className={currentView === 'network' ? 'active' : ''}
            onClick={() => setCurrentView('network')}
          >
            🌍 Network Files
          </button>
          <button
            className={currentView === 'peers' ? 'active' : ''}
            onClick={() => setCurrentView('peers')}
          >
            👥 Peers ({peers.length})
          </button>
          <button
            className={currentView === 'upload' ? 'active' : ''}
            onClick={() => setCurrentView('upload')}
          >
            📤 Upload
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <p>👤 {user?.username}</p>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Dashboard View */}
        {currentView === 'dashboard' && stats && (
          <div className="dashboard">
            <h1>Dashboard</h1>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Storage Used</h3>
                <p className="stat-value">{formatFileSize(stats.storageUsed)}</p>
                <p className="stat-label">of {formatFileSize(stats.storageLimit)}</p>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(stats.storageUsed / stats.storageLimit) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="stat-card">
                <h3>Total Files</h3>
                <p className="stat-value">{stats.fileCount}</p>
              </div>
              <div className="stat-card">
                <h3>Total Downloads</h3>
                <p className="stat-value">{stats.totalDownloads}</p>
              </div>
              <div className="stat-card">
                <h3>Peers Online</h3>
                <p className="stat-value">{stats.peersOnline}</p>
              </div>
            </div>

            <div className="recent-activity">
              <h2>Recent Activity</h2>
              <div className="activity-list">
                {stats.recentTransfers && stats.recentTransfers.length > 0 ? (
                  stats.recentTransfers.map((transfer, index) => (
                    <div key={index} className="activity-item">
                      <span className="activity-icon">
                        {transfer.action === 'upload' ? '📤' : 
                         transfer.action === 'download' ? '📥' : '🗑️'}
                      </span>
                      <div className="activity-details">
                        <p>{transfer.action} - {transfer.fileId?.originalName || 'Unknown'}</p>
                        <p className="activity-time">{formatDate(transfer.timestamp)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No recent activity</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* My Files View */}
        {currentView === 'myfiles' && (
          <div className="files-view">
            <div className="view-header">
              <h1>My Files</h1>
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch}>🔍</button>
              </div>
            </div>

            <div className="files-grid">
              {files.length > 0 ? (
                files.map((file) => (
                  <div key={file._id} className="file-card">
                    <div className="file-icon">📄</div>
                    <h3>{file.originalName}</h3>
                    <p>{formatFileSize(file.size)}</p>
                    <p className="file-date">{formatDate(file.uploadedAt)}</p>
                    {file.isEncrypted && <span className="badge">🔒 Encrypted</span>}
                    {file.isPublic && <span className="badge public">🌍 Public</span>}
                    <div className="file-actions">
                      <button onClick={() => handleFileDownload(file._id, file.originalName)}>
                        📥 Download
                      </button>
                      <button onClick={() => handleFileDelete(file._id)} className="delete-btn">
                        🗑️ Delete
                      </button>
                    </div>
                    <p className="file-stats">
                      Downloads: {file.downloads}
                    </p>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>📭 No files yet. Upload your first file!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Network Files View */}
        {currentView === 'network' && (
          <div className="files-view">
            <h1>Network Files</h1>
            <p className="view-description">Files shared by peers on the network</p>

            <div className="files-grid">
              {networkFiles.local && networkFiles.local.length > 0 ? (
                networkFiles.local.map((file) => (
                  <div key={file._id} className="file-card">
                    <div className="file-icon">📄</div>
                    <h3>{file.originalName}</h3>
                    <p>{formatFileSize(file.size)}</p>
                    <p className="file-owner">Owner: {file.owner?.username}</p>
                    <button onClick={() => handleFileDownload(file._id, file.originalName)}>
                      📥 Download
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>🌐 No public files available on the network</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Peers View */}
        {currentView === 'peers' && (
          <div className="peers-view">
            <h1>Connected Peers</h1>
            <div className="peers-grid">
              {peers.length > 0 ? (
                peers.map((peer, index) => (
                  <div key={index} className="peer-card">
                    <div className="peer-icon">💻</div>
                    <h3>{peer.name}</h3>
                    <p>IP: {peer.ip}:{peer.port}</p>
                    <p className="peer-status">
                      <span className="status-dot online"></span> Online
                    </p>
                    <p className="peer-last-seen">Last seen: {formatDate(peer.lastSeen)}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p>🔍 No peers discovered yet. Make sure other devices are running on the same network.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload View */}
        {currentView === 'upload' && (
          <div className="upload-view">
            <h1>Upload File</h1>
            <form onSubmit={handleFileUpload} className="upload-form">
              <div className="upload-area">
                <input
                  type="file"
                  id="fileInput"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  required
                />
                <label htmlFor="fileInput" className="file-label">
                  <div className="upload-icon">📁</div>
                  {uploadFile ? (
                    <p>{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>
                  ) : (
                    <p>Click to select file or drag and drop</p>
                  )}
                </label>
              </div>

              <div className="upload-options">
                <label>
                  <input
                    type="checkbox"
                    checked={uploadOptions.isEncrypted}
                    onChange={(e) => setUploadOptions({ ...uploadOptions, isEncrypted: e.target.checked })}
                  />
                  🔒 Encrypt file
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={uploadOptions.isPublic}
                    onChange={(e) => setUploadOptions({ ...uploadOptions, isPublic: e.target.checked })}
                  />
                  🌍 Make public (visible to network)
                </label>
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={uploadOptions.tags}
                  onChange={(e) => setUploadOptions({ ...uploadOptions, tags: e.target.value })}
                />
              </div>

              <button type="submit" disabled={loading || !uploadFile} className="upload-btn">
                {loading ? 'Uploading...' : '📤 Upload File'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
}

export default App;