import React, { useState, useEffect } from 'react';
import './FileManager.css';
import GroupChat from './GroupChat';

const FileManager = ({ group, user, API, BASE_API, onBack, notify }) => {
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  
  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // File preview
  const [previewFile, setPreviewFile] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Share link
  const [shareFile, setShareFile] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [shareExpiry, setShareExpiry] = useState('24');
  const [shareMaxDownloads, setShareMaxDownloads] = useState('');
  const [generatedLink, setGeneratedLink] = useState(null);
  
  // Group members & roles
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState([]);
  
  // Show chat
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (group) {
      fetchFolders();
      fetchFiles();
    }
  }, [group, currentFolder]);

  const fetchFolders = async () => {
    try {
      const res = await API.get(`/folders/group/${group.id}`, {
        params: { parentId: currentFolder?.id || '' }
      });
      setFolders(res.data);
    } catch (err) {
      console.error('Fetch folders error:', err);
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await API.get(`/files/group/${group.id}`, {
        params: { folderId: currentFolder?._id || '' }
      });
      setFiles(res.data);
    } catch (err) {
      console.error('Fetch files error:', err);
    }
  };

  const fetchMembers = async () => {
    try {
      const res = await API.get(`/groups/${group.id}/members`);
      setMembers(res.data);
    } catch (err) {
      console.error('Fetch members error:', err);
    }
  };

  const createFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    setLoading(true);
    try {
      await API.post('/folders/create', {
        name: newFolderName,
        parentId: currentFolder?._id || null,
        groupId: group.id
      });
      setNewFolderName('');
      setShowNewFolder(false);
      notify('Folder created!');
      fetchFolders();
    } catch (err) {
      notify('Failed to create folder', 'error');
    }
    setLoading(false);
  };

  const deleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Delete folder "${folderName}" and all its contents?`)) return;
    
    setLoading(true);
    try {
      await API.delete(`/folders/${folderId}`);
      notify('Folder deleted');
      fetchFolders();
    } catch (err) {
      notify('Failed to delete folder', 'error');
    }
    setLoading(false);
  };

  const uploadFileToFolder = async (e) => {
    e.preventDefault();
    if (!uploadFile) return notify('Select a file', 'error');

    setLoading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('groupId', group.id);
    formData.append('folderId', currentFolder?._id || '');
    formData.append('tags', JSON.stringify(tags.split(',').map(t => t.trim()).filter(Boolean)));

    try {
      await API.post('/files/upload', formData);
      notify('File uploaded!');
      setUploadFile(null);
      setTags('');
      fetchFiles();
    } catch (err) {
      notify(err.response?.data?.error || 'Upload failed', 'error');
    }
    setLoading(false);
  };

  const downloadFile = async (id, name) => {
    try {
      const res = await API.get(`/files/download/${id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      notify('Downloaded!');
    } catch (err) {
      notify('Download failed', 'error');
    }
  };

  const deleteFile = async (id) => {
    if (!window.confirm('Delete this file?')) return;

    try {
      await API.delete(`/files/${id}`);
      notify('File deleted');
      fetchFiles();
    } catch (err) {
      notify('Delete failed', 'error');
    }
  };

  const searchFiles = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await API.get('/files/search', {
        params: { query, groupId: group.id }
      });
      setSearchResults(res.data);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchFiles(query);
  };

  const openPreview = async (file) => {
    setPreviewFile(file);
    setShowPreview(true);
  };

  const createShareLink = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await API.post(`/files/${shareFile._id}/share`, {
        password: sharePassword || undefined,
        expiresIn: parseInt(shareExpiry),
        maxDownloads: shareMaxDownloads ? parseInt(shareMaxDownloads) : undefined
      });
      
      setGeneratedLink(res.data);
      notify('Share link created!');
    } catch (err) {
      notify('Failed to create share link', 'error');
    }
    setLoading(false);
  };

  const updateMemberRole = async (userId, newRole) => {
    setLoading(true);
    try {
      await API.patch(`/groups/${group.id}/members/${userId}/role`, { role: newRole });
      notify('Role updated!');
      fetchMembers();
    } catch (err) {
      notify('Failed to update role', 'error');
    }
    setLoading(false);
  };

  const removeMember = async (userId, username) => {
    if (!window.confirm(`Remove ${username} from group?`)) return;
    
    setLoading(true);
    try {
      await API.delete(`/groups/${group.id}/members/${userId}`);
      notify('Member removed');
      fetchMembers();
    } catch (err) {
      notify('Failed to remove member', 'error');
    }
    setLoading(false);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    const gb = bytes / (1024 * 1024 * 1024);
    
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${bytes} B`;
  };

  const formatDate = (d) => new Date(d).toLocaleString();

  const isNetworkShare = group.name === '__NETWORK_SHARE__' || group.inviteCode === 'NETWORK';
  const canModerate = ['admin', 'moderator'].includes(group.role);
  const isAdmin = group.role === 'admin' || group.isCreator;

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <button onClick={onBack} className="back-btn">← Back</button>
        <div className="file-manager-title">
          <h2>{isNetworkShare ? '🌐 Network Share' : `📁 ${group.name}`}</h2>
          <p className="muted">
            🔒 End-to-end encrypted • {group.memberCount} members • Role: {group.role}
          </p>
        </div>
        <div className="file-manager-actions">
          <button onClick={() => setShowMembers(true)} className="btn-secondary">
            👥 Members
          </button>
          <button onClick={() => setShowChat(!showChat)} className="btn-primary">
            💬 {showChat ? 'Hide Chat' : 'Show Chat'}
          </button>
        </div>
      </div>

      <div className="file-manager-body">
        <div className={`file-manager-main ${showChat ? 'with-chat' : ''}`}>
          {/* Breadcrumb */}
          <div className="folder-breadcrumb">
            <button onClick={() => setCurrentFolder(null)} className="breadcrumb-btn">
              🏠 Root
            </button>
            {currentFolder && (
              <>
                <span> / </span>
                <span className="breadcrumb-current">{currentFolder.name}</span>
              </>
            )}
          </div>

          {/* Search */}
          <div className="search-bar">
            <input
              type="text"
              placeholder="🔍 Search files by name, content, or tags..."
              value={searchQuery}
              onChange={handleSearch}
              className="search-input"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="clear-search">
                ✕
              </button>
            )}
          </div>

          {/* Search Results */}
          {searchQuery && searchResults.length > 0 && (
            <div className="search-results">
              <h3>Search Results ({searchResults.length})</h3>
              <div className="files-grid">
                {searchResults.map(file => (
                  <div key={file._id} className="file-card">
                    <div className="file-icon">📄</div>
                    <div className="file-name">{file.originalName}</div>
                    <div className="file-meta">
                      {formatSize(file.size)} • {file.owner?.username}
                    </div>
                    <div className="file-actions">
                      {file.hasPreview && (
                        <button onClick={() => openPreview(file)} className="btn-icon">👁️</button>
                      )}
                      <button onClick={() => downloadFile(file._id, file.originalName)} className="btn-icon">
                        ⬇️
                      </button>
                      <button onClick={() => { setShareFile(file); setShowShareModal(true); }} className="btn-icon">
                        🔗
                      </button>
                      {(file.owner?._id === user.id || canModerate) && (
                        <button onClick={() => deleteFile(file._id)} className="btn-icon danger">🗑️</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Section */}
          {!searchQuery && (
            <div className="upload-section">
              <form onSubmit={uploadFileToFolder} className="upload-form">
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  className="file-input"
                />
                <input
                  type="text"
                  placeholder="Tags (comma-separated)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="tags-input"
                />
                <button type="submit" disabled={loading || !uploadFile} className="btn-primary">
                  Upload
                </button>
              </form>
              <button onClick={() => setShowNewFolder(true)} className="btn-secondary">
                📁 New Folder
              </button>
            </div>
          )}

          {/* Folders */}
          {!searchQuery && folders.length > 0 && (
            <div className="folders-section">
              <h3>📁 Folders</h3>
              <div className="folders-grid">
                {folders.map(folder => (
                  <div key={folder._id} className="folder-card" onClick={() => setCurrentFolder(folder)}>
                    <div className="folder-icon">📁</div>
                    <div className="folder-name">{folder.name}</div>
                    <div className="folder-meta">{formatDate(folder.createdAt)}</div>
                    {(folder.owner === user.id || canModerate) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFolder(folder._id, folder.name);
                        }}
                        className="folder-delete"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {!searchQuery && (
            <div className="files-section">
              <h3>📄 Files</h3>
              {files.length === 0 ? (
                <p className="empty">No files in this folder.</p>
              ) : (
                <div className="files-grid">
                  {files.map(file => (
                    <div key={file._id} className="file-card">
                      <div className="file-icon">
                        {file.mimeType?.startsWith('image/') ? '🖼️' :
                         file.mimeType?.startsWith('video/') ? '🎥' :
                         file.mimeType?.startsWith('audio/') ? '🎵' :
                         file.mimeType?.includes('pdf') ? '📕' :
                         file.mimeType?.includes('word') ? '📘' : '📄'}
                      </div>
                      <div className="file-name">{file.originalName}</div>
                      <div className="file-meta">
                        {formatSize(file.size)} • {file.owner?.username}<br />
                        {formatDate(file.uploadedAt)}
                      </div>
                      {file.tags && file.tags.length > 0 && (
                        <div className="file-tags">
                          {file.tags.map((tag, idx) => (
                            <span key={idx} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="file-actions">
                        {file.hasPreview && (
                          <button onClick={() => openPreview(file)} className="btn-icon" title="Preview">
                            👁️
                          </button>
                        )}
                        <button onClick={() => downloadFile(file._id, file.originalName)} className="btn-icon" title="Download">
                          ⬇️
                        </button>
                        <button onClick={() => { setShareFile(file); setShowShareModal(true); }} className="btn-icon" title="Share">
                          🔗
                        </button>
                        {(file.owner?._id === user.id || canModerate) && (
                          <button onClick={() => deleteFile(file._id)} className="btn-icon danger" title="Delete">
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="chat-sidebar">
            <GroupChat group={group} user={user} API_BASE={BASE_API} />
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="modal-overlay" onClick={() => setShowNewFolder(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>📁 New Folder</h3>
            <form onSubmit={createFolder}>
              <input
                type="text"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                required
              />
              <div className="modal-actions">
                <button type="submit" disabled={loading} className="btn-primary">Create</button>
                <button type="button" onClick={() => setShowNewFolder(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreview && previewFile && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <h3>👁️ File Preview</h3>
            <p className="muted">{previewFile.originalName}</p>
            {previewFile.hasPreview ? (
              <img
                src={`${BASE_API}/files/${previewFile._id}/preview`}
                alt={previewFile.originalName}
                className="preview-image"
              />
            ) : (
              <p className="muted">No preview available for this file type.</p>
            )}
            <div className="modal-actions">
              <button onClick={() => downloadFile(previewFile._id, previewFile.originalName)} className="btn-primary">
                Download
              </button>
              <button onClick={() => setShowPreview(false)} className="btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Link Modal */}
      {showShareModal && shareFile && (
        <div className="modal-overlay" onClick={() => { setShowShareModal(false); setGeneratedLink(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>🔗 Share File</h3>
            <p className="muted">{shareFile.originalName}</p>
            
            {!generatedLink ? (
              <form onSubmit={createShareLink}>
                <div className="form-group">
                  <label>🔒 Password (optional)</label>
                  <input
                    type="password"
                    placeholder="Leave empty for no password"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                  />
                </div>
                
                <div className="form-group">
                  <label>⏰ Expires in (hours)</label>
                  <select value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)}>
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>📊 Max downloads (optional)</label>
                  <input
                    type="number"
                    placeholder="Leave empty for unlimited"
                    value={shareMaxDownloads}
                    onChange={(e) => setShareMaxDownloads(e.target.value)}
                    min="1"
                  />
                </div>
                
                <div className="modal-actions">
                  <button type="submit" disabled={loading} className="btn-primary">
                    Generate Link
                  </button>
                  <button type="button" onClick={() => { setShowShareModal(false); setGeneratedLink(null); }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="share-link-result">
                <div className="share-link-box">
                  <code>{generatedLink.url}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink.url);
                      notify('Link copied!');
                    }}
                    className="copy-btn"
                  >
                    📋 Copy
                  </button>
                </div>
                <p className="muted">
                  {generatedLink.expiresAt && `Expires: ${formatDate(generatedLink.expiresAt)}`}
                  {generatedLink.maxDownloads && ` • Max downloads: ${generatedLink.maxDownloads}`}
                </p>
                <button onClick={() => { setShowShareModal(false); setGeneratedLink(null); }} className="btn-primary">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembers && (
        <div className="modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="modal-content members-modal" onClick={(e) => e.stopPropagation()}>
            <h3>👥 Group Members</h3>
            <button onClick={fetchMembers} className="refresh-btn">🔄 Refresh</button>
            
            <div className="members-list">
              {members.map(member => (
                <div key={member.userId._id} className="member-item">
                  <div className="member-info">
                    <strong>{member.userId.username}</strong>
                    <small className="muted">{member.userId.email}</small>
                  </div>
                  
                  <div className="member-role">
                    {isAdmin && member.userId._id !== group.creator?._id ? (
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.userId._id, e.target.value)}
                        className="role-select"
                      >
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className={`role-badge role-${member.role}`}>
                        {member.role}
                        {member.userId._id === group.creator?._id && ' 👑'}
                      </span>
                    )}
                  </div>
                  
                  {isAdmin && member.userId._id !== user.id && member.userId._id !== group.creator?._id && (
                    <button
                      onClick={() => removeMember(member.userId._id, member.userId.username)}
                      className="btn-danger-small"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <button onClick={() => setShowMembers(false)} className="btn-secondary">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
