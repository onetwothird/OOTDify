import React, { useRef } from 'react';
import { View, StyleSheet, Animated, PanResponder, Dimensions, Image } from 'react-native';
import { theme } from '../../constants/theme';
import { ClothingItem } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 0.25 * SCREEN_WIDTH;

interface SwipeableLookProps {
  items: ClothingItem[];
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

export function SwipeableLook({ items, onSwipeLeft, onSwipeRight }: SwipeableLookProps) {
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (event, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (event, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          forceSwipe('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          forceSwipe('left');
        } else {
          resetPosition();
        }
      }
    })
  ).current;

  const forceSwipe = (direction: 'right' | 'left') => {
    const x = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 250,
      useNativeDriver: false, 
    }).start(() => onSwipeComplete(direction));
  };

  const onSwipeComplete = (direction: 'right' | 'left') => {
    direction === 'right' ? onSwipeRight() : onSwipeLeft();
    position.setValue({ x: 0, y: 0 }); 
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 5,
      useNativeDriver: false,
    }).start();
  };

  const getCardStyle = () => {
    const rotate = position.x.interpolate({
      inputRange: [-SCREEN_WIDTH * 1.5, 0, SCREEN_WIDTH * 1.5],
      outputRange: ['-15deg', '0deg', '15deg'],
    });

    return {
      ...position.getLayout(),
      transform: [{ rotate }],
    };
  };

  return (
    <Animated.View
      style={[styles.container, getCardStyle()]}
      {...panResponder.panHandlers}
    >
      <View style={styles.collageContainer}>
        {items[0] && (
          <Image source={{ uri: items[0].imageUrl }} style={[styles.canvasImage, styles.pos1]} />
        )}
        {items[1] && (
          <Image source={{ uri: items[1].imageUrl }} style={[styles.canvasImage, styles.pos2]} />
        )}
        {items[2] && (
          <View style={styles.highlightedItemWrapper}>
            <Image source={{ uri: items[2].imageUrl }} style={[styles.canvasImage, styles.pos3]} />
          </View>
        )}
        {items[3] && (
          <Image source={{ uri: items[3].imageUrl }} style={[styles.canvasImage, styles.pos4]} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'absolute', 
  },
  collageContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  canvasImage: {
    position: 'absolute',
    borderRadius: theme.borderRadius.sm,
    resizeMode: 'cover',
  },
  pos1: { width: 120, height: 160, top: 20, left: 20, zIndex: 2 },
  pos2: { width: 150, height: 220, top: 40, right: 30, zIndex: 1 },
  pos3: { width: 80, height: 80 }, // Sized relative to its wrapper
  pos4: { width: 70, height: 70, bottom: 20, left: 40, zIndex: 2 },
  
  highlightedItemWrapper: {
    position: 'absolute',
    top: 130,
    right: 40,
    zIndex: 3,
    padding: 4,
    borderWidth: 2,
    borderColor: theme.colors.primary, 
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#FFF',
  },
});