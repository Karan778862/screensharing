import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Users } from 'lucide-react';

export default function Home() {
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();

  const handleHost = () => {
    // Generate a random 6 character code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${code}?mode=host`);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (joinCode.trim().length > 0) {
      navigate(`/room/${joinCode.toUpperCase()}?mode=guest`);
    }
  };

  return (
    <div className="home-wrapper">
      <h1 className="title">SyncWatch</h1>
      <p className="subtitle">Share your screen and watch movies with friends in perfect sync. No downloads required.</p>
      
      <div className="action-cards">
        <div className="glass-panel action-card">
          <MonitorPlay size={48} color="var(--accent-color)" />
          <h2>Host a Movie</h2>
          <p>Share your screen or browser tab with system audio.</p>
          <button className="btn btn-primary" onClick={handleHost}>
            Start Hosting
          </button>
        </div>

        <div className="glass-panel action-card">
          <Users size={48} color="var(--accent-color)" />
          <h2>Join a Friend</h2>
          <p>Enter the code from your friend to start watching.</p>
          <form onSubmit={handleJoin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="ENTER CODE" 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={6}
            />
            <button type="submit" className="btn" disabled={!joinCode.trim()}>
              Join Room
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
