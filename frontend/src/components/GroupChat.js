import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './GroupChat.css';

const GroupChat = ({ group, user, API_BASE }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!group || !user) return;

    // Connect to WebSocket
    const socketUrl = API_BASE.replace('/api', '');
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      setIsConnected(true);
      newSocket.emit('join:group', { groupId: group.id, userId: user.id });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setIsConnected(false);
    });

    newSocket.on('message:received', (message) => {
      setMessages(prev => [...prev, message]);
    });

    setSocket(newSocket);

    // Fetch message history
    fetchMessages();

    return () => {
      newSocket.emit('leave:group', { groupId: group.id });
      newSocket.disconnect();
    };
  }, [group?.id, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/groups/${group.id}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !isConnected) return;

    socket.emit('message:send', {
      groupId: group.id,
      userId: user.id,
      message: newMessage.trim()
    });

    setNewMessage('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="group-chat">
      <div className="chat-header">
        <div>
          <h3>💬 Group Chat</h3>
          <small className={isConnected ? 'status-online' : 'status-offline'}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </small>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div 
              key={msg._id || idx} 
              className={`chat-message ${msg.sender._id === user.id ? 'own-message' : ''}`}
            >
              <div className="message-sender">{msg.sender.username}</div>
              <div className="message-content">{msg.message}</div>
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={sendMessage}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          disabled={!isConnected}
        />
        <button type="submit" disabled={!newMessage.trim() || !isConnected}>
          Send
        </button>
      </form>
    </div>
  );
};

export default GroupChat;
