import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, TextInput, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { io, Socket } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const { width, height } = Dimensions.get('window');

// REPLACE WITH YOUR COMPUTER'S LOCAL IP ADDRESS
const SIGNALING_SERVER = "http://10.6.10.95:3001"; 

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
  const [selectedImage, setSelectedImage] = useState<any>(null);
  const [receiving, setReceiving] = useState(false);
  
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<any>(null); // For WebRTC data channel

  useEffect(() => {
    const staticRoomCode = '0000';
    setRoomCode(staticRoomCode);
    
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to signaling server');
      socket.emit('join-room', staticRoomCode);
      setConnected(true); // Auto-connect instantly
    });

    socket.on('peer-joined', () => {
      console.log("Desktop acknowledged connection!");
      setConnected(true);
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
        // Save base64 string to a temporary file
        const fileUri = `${FileSystem.documentDirectory}${data.fileName || 'teleported_file.jpg'}`;
        await FileSystem.writeAsStringAsync(fileUri, data.fileData, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Save to Camera Roll
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(fileUri);
          alert("Teleported file saved to your photos!");
        } else {
          alert("Saved to app directory, but missing permissions for Camera Roll.");
        }
      } catch (e) {
        console.error("Failed to save file:", e);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const connectToDesktop = () => {
    if (roomCode.length === 4 && socketRef.current) {
      socketRef.current.emit('join-room', roomCode);
      // Optimistically set connected for the UI
      setConnected(true);
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage({
        uri: asset.uri,
        fileName: asset.fileName || asset.uri.split('/').pop(),
        size: asset.fileSize || 0
      });
    }
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

  const triggerTeleport = async () => {
    if (!connected || !socketRef.current) {
      alert("Not connected to desktop yet!");
      setStrokes([]);
      return;
    }

    if (!selectedImage) {
      alert("Please tap the photo placeholder to pick an image first!");
      setStrokes([]);
      return;
    }

    setTeleporting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // Read the file as base64
    let base64Data = "";
    try {
      base64Data = await FileSystem.readAsStringAsync(selectedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (e) {
      console.error("Failed to read image:", e);
      alert("Failed to read image data.");
      setTeleporting(false);
      setStrokes([]);
      return;
    }

    // Send directly via Socket.io instead of WebRTC for Expo Go compatibility
    socketRef.current.emit('file-transfer-start', { roomId: roomCode });
    
    // Send actual data
    socketRef.current.emit('file-transfer-data', { 
      roomId: roomCode, 
      fileName: selectedImage.fileName, 
      fileData: base64Data 
    });

    // Simulate file transfer delay for animation
    setTimeout(() => {
      socketRef.current?.emit('file-transfer-end', { roomId: roomCode });
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
        // Clear selected image after teleporting
        setSelectedImage(null);
      }, 2000);
    }, 200);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(() => {})
    .onEnd((e) => {
      if (teleporting || receiving || !connected) return;
      
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
          <Text style={styles.subtitle}>Connecting to desktop...</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subtitle}>
            {receiving 
              ? "Receiving file from Desktop..." 
              : "Tap to pick a photo, then draw an 'X' to teleport it!"}
          </Text>
          <GestureDetector gesture={pan}>
            <View style={styles.gestureArea}>
              <Animated.View style={[styles.fileCard, animatedStyle]}>
                <TouchableOpacity style={{flex: 1}} onPress={pickImage} activeOpacity={0.8} disabled={receiving}>
                  <View style={styles.imagePlaceholder}>
                    {selectedImage ? (
                      <Image source={{ uri: selectedImage.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : receiving ? (
                      <Text style={styles.imageText}>✨</Text>
                    ) : (
                      <Text style={styles.imageText}>📸 Photo.jpg</Text>
                    )}
                  </View>
                  <View style={styles.fileDetails}>
                    <Text style={styles.fileName}>
                      {selectedImage ? selectedImage.fileName : receiving ? "Incoming_File..." : "Tap to pick a photo"}
                    </Text>
                    <Text style={styles.fileSize}>
                      {selectedImage ? `${(selectedImage.size / (1024 * 1024)).toFixed(2)} MB` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
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
