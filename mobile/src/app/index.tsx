import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { io, Socket } from 'socket.io-client';

const { width, height } = Dimensions.get('window');

// REPLACE WITH YOUR COMPUTER'S LOCAL IP ADDRESS
const SIGNALING_SERVER = "http://192.168.1.100:3001"; 

function isDiagonal(startX: number, startY: number, endX: number, endY: number) {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  return dx > 40 && dy > 40;
}

function getDiagonalDirection(startX: number, startY: number, endX: number, endY: number) {
  if (endX > startX && endY > startY) return 'TL-BR';
  if (endX < startX && endY < startY) return 'TL-BR';
  if (endX < startX && endY > startY) return 'TR-BL';
  if (endX > startX && endY < startY) return 'TR-BL';
  return null;
}

export default function HomeScreen() {
  const [strokes, setStrokes] = useState<any[]>([]);
  const [teleporting, setTeleporting] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [connected, setConnected] = useState(false);
  
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<any>(null); // For WebRTC data channel

  useEffect(() => {
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.on('connect', () => console.log('Connected to signaling server'));

    socket.on('offer', async (data) => {
      console.log('Received offer from desktop');
      if (!peerRef.current) setupWebRTC();
      
      const peer = peerRef.current!;
      await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('answer', { answer, roomId: roomCode });
    });

    socket.on('ice-candidate', async (data) => {
      if (peerRef.current && data.candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [roomCode]);

  const connectToDesktop = () => {
    if (roomCode.length === 4 && socketRef.current) {
      setupWebRTC();
      socketRef.current.emit('join-room', roomCode);
    }
  };

  const setupWebRTC = () => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Create the data channel for sending files
    const dataChannel = peer.createDataChannel("fileTransfer");
    dataChannel.onopen = () => {
      console.log("Data channel opened! Ready to send.");
      setConnected(true);
    };
    dataChannelRef.current = dataChannel;

    peer.onicecandidate = (e) => {
      if (e.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          candidate: e.candidate,
          roomId: roomCode
        });
      }
    };
    
    // We are the initiator (offerer)
    peer.createOffer().then(offer => {
      return peer.setLocalDescription(offer);
    }).then(() => {
      socketRef.current?.emit('offer', {
        offer: peer.localDescription,
        roomId: roomCode
      });
    });

    peerRef.current = peer;
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { translateY: translateY.value }
      ],
      opacity: opacity.value,
    };
  });

  const triggerTeleport = () => {
    if (!connected || !dataChannelRef.current) {
      alert("Not connected to desktop yet!");
      setStrokes([]);
      return;
    }

    setTeleporting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Send via WebRTC
    dataChannelRef.current.send("START_FILE");
    // Simulate file transfer delay
    setTimeout(() => {
      dataChannelRef.current.send("END_FILE");
    }, 1500);
    
    // Animation
    scale.value = withSpring(0.8, { damping: 10, stiffness: 100 });
    setTimeout(() => {
      translateY.value = withTiming(-height, { duration: 400 });
      opacity.value = withTiming(0, { duration: 400 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      setTimeout(() => {
        scale.value = withSpring(1);
        translateY.value = withSpring(0);
        opacity.value = 1;
        setTeleporting(false);
        setStrokes([]);
      }, 2000);
    }, 200);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {})
    .onEnd((e) => {
      if (teleporting || !connected) return;
      
      const newStroke = {
        startX: e.x - e.translationX,
        startY: e.y - e.translationY,
        endX: e.x,
        endY: e.y
      };
      
      if (!isDiagonal(newStroke.startX, newStroke.startY, newStroke.endX, newStroke.endY)) {
        setStrokes([]);
        return;
      }
      
      const dir = getDiagonalDirection(newStroke.startX, newStroke.startY, newStroke.endX, newStroke.endY);
      const updatedStrokes = [...strokes, { ...newStroke, dir }];
      setStrokes(updatedStrokes);
      
      if (updatedStrokes.length === 2) {
        const dir1 = updatedStrokes[0].dir;
        const dir2 = updatedStrokes[1].dir;
        
        if (dir1 && dir2 && dir1 !== dir2) {
          triggerTeleport();
        } else {
          setStrokes([]);
        }
      } else if (updatedStrokes.length > 2) {
        setStrokes([]);
      }
    });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Teleport</Text>
      
      {!connected ? (
        <View style={styles.pairingContainer}>
          <Text style={styles.subtitle}>Enter 4-digit code from desktop</Text>
          <TextInput 
            style={styles.input} 
            maxLength={4} 
            keyboardType="number-pad"
            value={roomCode}
            onChangeText={setRoomCode}
            placeholder="0000"
            placeholderTextColor="#555"
          />
          <TouchableOpacity style={styles.button} onPress={connectToDesktop}>
            <Text style={styles.buttonText}>Connect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>Connected! Draw an "X" over the file.</Text>
          <GestureDetector gesture={pan}>
            <View style={styles.gestureArea}>
              <Animated.View style={[styles.fileCard, animatedStyle]}>
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imageText}>📸 Photo.jpg</Text>
                </View>
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName}>IMG_1234.HEIC</Text>
                  <Text style={styles.fileSize}>4.2 MB</Text>
                </View>
              </Animated.View>
            </View>
          </GestureDetector>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', paddingTop: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#aaa', marginBottom: 40 },
  pairingContainer: { alignItems: 'center', marginTop: 40 },
  input: { fontSize: 40, color: '#fff', letterSpacing: 10, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#00f2fe', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 20 },
  buttonText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  gestureArea: { width: '100%', height: 400, alignItems: 'center', justifyContent: 'center' },
  fileCard: { width: 250, height: 300, backgroundColor: '#1c1c1e', borderRadius: 20, overflow: 'hidden', elevation: 10 },
  imagePlaceholder: { flex: 1, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' },
  imageText: { fontSize: 40 },
  fileDetails: { padding: 16, backgroundColor: '#1c1c1e' },
  fileName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  fileSize: { color: '#8e8e93', fontSize: 14 }
});
