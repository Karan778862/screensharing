import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { MonitorUp, Volume2, VolumeX, Maximize, X, MessageSquare, Send, Mic, MicOff } from 'lucide-react';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'https://screensharing-2.onrender.com'; // Fallback to live backend

export default function WatchRoom() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode'); // 'host' or 'guest'
  const navigate = useNavigate();
  
  const [status, setStatus] = useState('Connecting to server...');
  const [streamActive, setStreamActive] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [micActive, setMicActive] = useState(false);
  
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const chatMessagesRef = useRef(null);
  
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const micStreamRef = useRef(null);
  const videoRef = useRef(null);
  const voiceAudioRef = useRef(null);
  const videoContainerRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);
    
    const socket = socketRef.current;

    socket.on('connect', () => {
      setStatus('Connected to server. Joining room...');
      if (mode === 'host') {
        socket.emit('create-room', roomId);
      } else {
        socket.emit('join-room', roomId);
      }
    });

    socket.on('room-created', () => {
      setStatus('Room created. Waiting for guest to join...');
    });

    socket.on('room-joined', () => {
      setStatus('Joined room successfully. Waiting for stream...');
    });

    socket.on('user-joined', () => {
      if (mode === 'host') {
        setStatus('Guest joined! Room is locked. You can now start sharing.');
      }
    });

    socket.on('error', (err) => {
      setStatus(`Error: ${err}`);
      alert(err);
      navigate('/');
    });

    // WebRTC Signaling
    socket.on('offer', async (offer) => {
      try {
        if (!peerConnectionRef.current) createPeerConnection();
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('answer', answer, roomId);
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('answer', async (answer) => {
      try {
        if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (e) {
        console.error(e);
      }
    });

    socket.on('ice-candidate', (candidate) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [roomId, mode, navigate]);

  const createPeerConnection = () => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', event.candidate, roomId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
         setStatus('Peer disconnected.');
         setStreamActive(false);
         if (videoRef.current) videoRef.current.srcObject = null;
      } else if (pc.iceConnectionState === 'connected') {
         setStatus('Secure E2EE Peer connection established.');
      }
    };

    // Setup Data Channel for Host
    if (mode === 'host') {
      const dataChannel = pc.createDataChannel('chat');
      setupDataChannel(dataChannel);
    } else {
      // Receive Data Channel for Guest
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    pc.ontrack = (event) => {
      // Check if it's a video track (screen share) or an audio-only track (voice call)
      const stream = event.streams[0];
      if (stream.getVideoTracks().length > 0 || mode === 'guest') {
         if (videoRef.current && videoRef.current.srcObject !== stream) {
           videoRef.current.srcObject = stream;
           setStreamActive(true);
           setStatus('Receiving stream...');
         }
      } else {
         if (voiceAudioRef.current && voiceAudioRef.current.srcObject !== stream) {
           voiceAudioRef.current.srcObject = stream;
         }
      }
    };
    
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('offer', offer, roomId);
      } catch (err) {
        console.error(err);
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const setupDataChannel = (channel) => {
    dataChannelRef.current = channel;
    channel.onmessage = (event) => {
      setChatMessages(prev => [...prev, { text: event.data, sender: mode === 'host' ? 'guest' : 'host' }]);
    };
    channel.onopen = () => {
      console.log('Data channel is open');
    };
  };

  const toggleMic = async () => {
    if (micActive) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        
        // Remove track from peer connection
        if (peerConnectionRef.current) {
           const senders = peerConnectionRef.current.getSenders();
           const audioSender = senders.find(s => s.track && s.track.kind === 'audio' && (!localStreamRef.current || s.track !== localStreamRef.current.getAudioTracks()[0]));
           if (audioSender) {
             peerConnectionRef.current.removeTrack(audioSender);
           }
        }
      }
      setMicActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        
        if (!peerConnectionRef.current) createPeerConnection();
        const pc = peerConnectionRef.current;
        
        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream);
        });
        
        setMicActive(true);
      } catch (err) {
        alert("Could not access microphone.");
      }
    }
  };

  const startScreenShare = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("Aapka browser screen sharing support nahi karta. Kripya is link ko direct Chrome ya Safari mein open karein (WhatsApp ke andar nahi).");
        return;
      }

      let stream;
      try {
        // First try with audio (works on PC)
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { cursor: 'always' }, 
          audio: true 
        });
      } catch (audioErr) {
        console.log("Failed to get display media with audio, falling back to video only (Mobile behavior)", audioErr);
        // Fallback for mobile devices that don't support system audio capture
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true 
        });
      }
      
      localStreamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Mute local playback to avoid echo
      }
      setStreamActive(true);
      setStatus('Screen sharing active.');

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle stream end
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

    } catch (err) {
      console.error("Error sharing screen: ", err);
      setStatus('Failed to share screen: ' + err.message);
      alert('Screen share error: ' + err.message + '\n\nAgar aap mobile par hain, toh Chrome ya Safari use karein.');
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const sender = senders.find(s => s.track === track);
          if (sender) peerConnectionRef.current.removeTrack(sender);
        }
      });
      localStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setStatus('Screen sharing stopped.');
  };

  const leaveRoom = () => {
    navigate('/');
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        dataChannelRef.current.send(currentMessage);
        setChatMessages(prev => [...prev, { text: currentMessage, sender: 'me' }]);
        setCurrentMessage('');
      } else {
        alert("Wait for the peer to connect securely before sending messages.");
      }
    }
  };

  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMutedState = !isMuted;
      videoRef.current.muted = newMutedState;
      setIsMuted(newMutedState);
      if (newMutedState) {
        setVolume(0);
      } else {
        setVolume(1);
        videoRef.current.volume = 1;
      }
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (videoContainerRef.current?.requestFullscreen) {
        videoContainerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else if (videoContainerRef.current?.webkitRequestFullscreen) {
        // Safari desktop
        videoContainerRef.current.webkitRequestFullscreen();
      } else if (videoRef.current?.webkitEnterFullscreen) {
        // iOS Safari (iPhones only support fullscreen on the video element itself)
        videoRef.current.webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  return (
    <div className="room-wrapper glass-panel" style={{ margin: '1rem 0' }}>
      <div className="room-header">
        <div className="room-info">
          <h2>Room Code</h2>
          <div className="room-code-display">{roomId}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>
            {mode === 'host' ? 'Host Mode' : 'Guest Mode'}
          </p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8, maxWidth: '200px' }}>{status}</p>
        </div>
      </div>

      <div className="main-content-area" style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        <div className="video-container" ref={videoContainerRef} style={{ flex: 1 }}>
          {!streamActive && (
            <div className="waiting-msg">
              <span className="loader"></span>
              <p>{mode === 'host' ? 'Ready to share when guest joins' : 'Waiting for host to start sharing'}</p>
            </div>
          )}
          <video ref={videoRef} autoPlay playsInline></video>
          <audio ref={voiceAudioRef} autoPlay></audio>
          
          {streamActive && (
            <div className="video-overlay-controls">
              <div className="volume-control">
                <button className="icon-btn" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={volume} 
                  onChange={handleVolumeChange} 
                  className="volume-slider"
                />
              </div>
              <button className="icon-btn fullscreen-btn" onClick={toggleFullScreen}>
                <Maximize size={24} />
              </button>
            </div>
          )}
        </div>

        {showChat && (
          <div className="chat-container glass-panel" style={{ width: '300px', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
            <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Chat</h3>
            
            <div className="chat-messages" ref={chatMessagesRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              {chatMessages.length === 0 ? (
                <p style={{ opacity: 0.5, fontSize: '0.9rem', textAlign: 'center', marginTop: '1rem' }}>No messages yet. Say hi!</p>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    alignSelf: msg.sender === 'me' ? 'flex-end' : 'flex-start',
                    backgroundColor: msg.sender === 'me' ? 'var(--accent-dark)' : 'rgba(255,255,255,0.1)',
                    padding: '0.5rem 0.8rem',
                    borderRadius: '8px',
                    maxWidth: '85%',
                    wordBreak: 'break-word',
                    fontSize: '0.95rem'
                  }}>
                    {msg.sender !== 'me' && <div style={{ fontSize: '0.7rem', opacity: 0.7, marginBottom: '0.2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{msg.sender}</div>}
                    {msg.text}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={currentMessage}
                onChange={e => setCurrentMessage(e.target.value)}
                placeholder="Type..."
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem' }} disabled={!currentMessage.trim()}>
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="controls-bar">
        <button className={`btn ${micActive ? 'btn-primary' : ''}`} onClick={toggleMic} style={micActive ? { backgroundColor: 'var(--accent-dark)', borderColor: 'var(--accent-dark)' } : {}}>
          {micActive ? <Mic size={20} /> : <MicOff size={20} />} {micActive ? 'Mic On' : 'Mic Off'}
        </button>
        <button className={`btn ${showChat ? 'btn-primary' : ''}`} onClick={() => setShowChat(!showChat)}>
          <MessageSquare size={20} /> {showChat ? 'Hide Chat' : 'Show Chat'}
        </button>
        {mode === 'host' && (
          <>
            {!streamActive ? (
              <button className="btn btn-primary" onClick={startScreenShare}>
                <MonitorUp size={20} /> Share Screen
              </button>
            ) : (
              <button className="btn" onClick={stopScreenShare} style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
                <X size={20} /> Stop Sharing
              </button>
            )}
          </>
        )}
        <button className="btn" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>
    </div>
  );
}
