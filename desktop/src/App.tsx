import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import "./App.css";

const SIGNALING_SERVER = "http://localhost:3001"; // Change to local IP if testing across devices

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

    socket.on("peer-joined", async () => {
      console.log("Mobile device joined! Initiating WebRTC connection...");
      setConnected(true);
      await createPeerConnection();
    });

    socket.on("offer", async (data) => {
      if (!peerRef.current) await createPeerConnection();
      await peerRef.current!.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerRef.current!.createAnswer();
      await peerRef.current!.setLocalDescription(answer);
      socket.emit("answer", { answer, roomId: code });
    });

    socket.on("ice-candidate", async (data) => {
      if (peerRef.current && data.candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createPeerConnection = async () => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit("ice-candidate", {
          candidate: e.candidate,
          roomId: roomCode
        });
      }
    };

    // Listen for data channel (incoming files)
    peer.ondatachannel = (event) => {
      const channel = event.channel;
      
      channel.onopen = () => console.log("Data channel opened");
      
      channel.onmessage = (e) => {
        if (typeof e.data === "string" && e.data === "START_FILE") {
          setReceiving(true);
        } else if (typeof e.data === "string" && e.data === "END_FILE") {
          setReceiving(false);
          setReceivedFiles(prev => [...prev, "Teleported_File"]);
        } else {
          // Here we would append array buffer chunks and save to OS
          // For the prototype we just trigger the animation
        }
      };
    };

    peerRef.current = peer;
  };

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
