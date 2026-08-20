import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import "./App.css";

const SIGNALING_SERVER = "http://10.6.10.95:3001"; // Change to local IP if testing across devices

function App() {
  const [roomCode, setRoomCode] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setRoomCode(code);
    
    // 1. Connect to Signaling Server
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to signaling server");
      socket.emit("create-room", code);
    });

    socket.on("peer-joined", () => {
      console.log("Mobile device joined!");
      setConnected(true);
      socket.emit("peer-joined", code);
    });

    socket.on("file-transfer-start", () => {
      setReceiving(true);
    });

    socket.on("file-transfer-end", () => {
      setReceiving(false);
      setReceivedFiles(prev => [...prev, "Teleported_File"]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="container" data-tauri-drag-region>
      <div className="header" data-tauri-drag-region>
        <h2>Teleport</h2>
        <div className={`status-dot ${connected ? "connected" : ""}`}></div>
      </div>
      
      {receiving ? (
        <div className="receiving-portal">
          <div className="portal-ring"></div>
          <p>Receiving...</p>
        </div>
      ) : (
        <div className="waiting-area">
          <p>{connected ? "Ready to Receive" : "Pairing Code"}</p>
          <h1 className="room-code">{roomCode}</h1>
          <p className="hint">
            {connected 
              ? "Draw an X on your phone to teleport files here." 
              : "Enter this code on your phone to connect."}
          </p>
        </div>
      )}

      {receivedFiles.length > 0 && !receiving && (
        <div className="recent-files">
          <p>Recently Teleported:</p>
          {receivedFiles.map((file, i) => (
            <div key={i} className="file-item">
              <span>{file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
