import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { writeFile, readFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { listen } from "@tauri-apps/api/event";
import { fromByteArray, toByteArray } from "base64-js";
import "./App.css";

const SIGNALING_SERVER = "http://10.6.10.95:3001"; // Change to local IP if testing across devices

function App() {
  const [roomCode, setRoomCode] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [sending, setSending] = useState(false);
  const [receivedFiles, setReceivedFiles] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

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
    });

    socket.on("file-transfer-data", async (data: { fileName: string, fileData: string }) => {
      try {
        console.log("Received file data:", data.fileName);
        // data.fileData is a base64 string
        const uint8Array = toByteArray(data.fileData);
        await writeFile(data.fileName, uint8Array, { baseDir: BaseDirectory.Download });
        setReceivedFiles(prev => [...prev, data.fileName]);
      } catch (e) {
        console.error("Failed to save file:", e);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Handle Drag and Drop from OS
  useEffect(() => {
    const setupDragAndDrop = async () => {
      const unlisten = await listen<{ paths: string[] }>('tauri://drop', async (event) => {
        if (!connected || !socketRef.current) {
          alert("Connect your phone first!");
          return;
        }
        
        setSending(true);
        const paths = event.payload.paths;
        
        for (const filePath of paths) {
          try {
            // Read file from OS
            const fileData = await readFile(filePath);
            // Convert to Base64
            const base64Data = fromByteArray(fileData);
            // Extract filename from path
            const fileName = filePath.split(/[\\/]/).pop() || "unknown_file";
            
            // Emit start animation
            socketRef.current.emit("file-transfer-start", { roomId: roomCode });
            
            // Emit actual data
            socketRef.current.emit("file-transfer-data", { 
              roomId: roomCode, 
              fileName, 
              fileData: base64Data 
            });
            
            // Emit end animation
            setTimeout(() => {
              socketRef.current?.emit("file-transfer-end", { roomId: roomCode });
            }, 1000);
            
          } catch (e) {
            console.error("Error reading dropped file", e);
          }
        }
        
        setTimeout(() => setSending(false), 1500);
      });
      return unlisten;
    };
    
    let unlistenFn: (() => void) | undefined;
    setupDragAndDrop().then((unlisten) => {
      unlistenFn = unlisten;
    });
    
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [connected, roomCode]);

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
      ) : sending ? (
        <div className="sending-portal">
          <div className="portal-ring reverse"></div>
          <p>Teleporting to Phone...</p>
        </div>
      ) : (
        <div className="waiting-area">
          <p>{connected ? "Ready to Receive" : "Pairing Code"}</p>
          <h1 className="room-code">{roomCode}</h1>
          <p className="hint">
            {connected 
              ? "Draw an X on your phone to teleport files here. Or drop files here to send to phone." 
              : "Enter this code on your phone to connect."}
          </p>
        </div>
      )}

      {receivedFiles.length > 0 && !receiving && !sending && (
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
