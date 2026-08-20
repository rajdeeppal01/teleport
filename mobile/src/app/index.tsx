import React, { useState } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

function isDiagonal(startX: number, startY: number, endX: number, endY: number) {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  // It should be somewhat diagonal (dx and dy are both significant)
  return dx > 40 && dy > 40;
}

function getDiagonalDirection(startX: number, startY: number, endX: number, endY: number) {
  if (endX > startX && endY > startY) return 'TL-BR'; // Top-Left to Bottom-Right
  if (endX < startX && endY < startY) return 'TL-BR'; // Bottom-Right to Top-Left (same axis)
  
  if (endX < startX && endY > startY) return 'TR-BL'; // Top-Right to Bottom-Left
  if (endX > startX && endY < startY) return 'TR-BL'; // Bottom-Left to Top-Right
  return null;
}

export default function HomeScreen() {
  const [strokes, setStrokes] = useState<any[]>([]);
  const [teleporting, setTeleporting] = useState(false);
  
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

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
    setTeleporting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    // The "Ridiculously Satisfying" Animation
    scale.value = withSpring(0.8, { damping: 10, stiffness: 100 });
    setTimeout(() => {
      translateY.value = withTiming(-height, { duration: 400 });
      opacity.value = withTiming(0, { duration: 400 });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      // Simulate sending file
      setTimeout(() => {
        // Reset after a while for testing
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
    .onStart((e) => {
      // Start of a new stroke
    })
    .onEnd((e) => {
      if (teleporting) return;
      
      const newStroke = {
        startX: e.x - e.translationX,
        startY: e.y - e.translationY,
        endX: e.x,
        endY: e.y
      };
      
      if (!isDiagonal(newStroke.startX, newStroke.startY, newStroke.endX, newStroke.endY)) {
        // Not a valid diagonal stroke, ignore or clear
        setStrokes([]);
        return;
      }
      
      const dir = getDiagonalDirection(newStroke.startX, newStroke.startY, newStroke.endX, newStroke.endY);
      
      const updatedStrokes = [...strokes, { ...newStroke, dir }];
      setStrokes(updatedStrokes);
      
      if (updatedStrokes.length === 2) {
        // Check if the two strokes are on opposite diagonals (forming an X)
        const dir1 = updatedStrokes[0].dir;
        const dir2 = updatedStrokes[1].dir;
        
        if (dir1 && dir2 && dir1 !== dir2) {
          triggerTeleport();
        } else {
          // Failed X, reset
          setStrokes([]);
        }
      } else if (updatedStrokes.length > 2) {
        setStrokes([]);
      }
    });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Teleport</Text>
      <Text style={styles.subtitle}>Select a file and draw an "X" over it</Text>
      
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    paddingTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 40,
  },
  gestureArea: {
    width: '100%',
    height: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCard: {
    width: 250,
    height: 300,
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  imagePlaceholder: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageText: {
    fontSize: 40,
  },
  fileDetails: {
    padding: 16,
    backgroundColor: '#1c1c1e',
  },
  fileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  fileSize: {
    color: '#8e8e93',
    fontSize: 14,
  },
});
