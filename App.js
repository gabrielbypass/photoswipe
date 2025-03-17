import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  ImageBackground,
  Text,
  TouchableOpacity,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import {
  GestureHandlerRootView,
  PanGestureHandler,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [photosToDelete, setPhotosToDelete] = useState([]);
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permission, setPermission] = useState(null);
  const [swipeAction, setSwipeAction] = useState(null);
  const [filter, setFilter] = useState("recent");

  const translateX = useSharedValue(0);
  const rotateZ = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setPermission(status === "granted");
      if (status === "granted") {
        const photoAssets = await MediaLibrary.getAssetsAsync({
          first: 1000, // Aumentado para 1000
          mediaType: ["photo", "video"], // Inclui fotos e vídeos
        });
        const assetsWithDetails = await Promise.all(
          photoAssets.assets.map(async (asset) => {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
            return {
              ...asset,
              localUri: assetInfo.localUri || asset.uri,
              fileSize: assetInfo.fileSize || 0,
              modificationTime: asset.modificationTime || 0,
            };
          })
        );

        const sortedAssets = [...assetsWithDetails].sort((a, b) => {
          if (filter === "recent") {
            return b.modificationTime - a.modificationTime;
          } else if (filter === "oldest") {
            return a.modificationTime - b.modificationTime;
          } else if (filter === "size") {
            return b.fileSize - a.fileSize;
          }
          return 0;
        });

        setPhotos(sortedAssets);
      }
    })();
  }, [filter]);

  const onGestureEvent = (event) => {
    translateX.value = event.nativeEvent.translationX;
    rotateZ.value = event.nativeEvent.translationX / 20;
    overlayOpacity.value = Math.min(
      Math.abs(event.nativeEvent.translationX) / 50,
      0.7
    );
  };

  const onSwipe = (event) => {
    const { translationX } = event.nativeEvent;

    if (translationX > 50) {
      setSwipeAction("Item mantido");
      setHistory([...history, { action: "keep", index: currentIndex }]);
      setCurrentIndex(currentIndex + 1);
      translateX.value = withSpring(0);
      rotateZ.value = withSpring(0);
      overlayOpacity.value = withSpring(0);
      setTimeout(() => setSwipeAction(null), 1000);
    } else if (translationX < -50) {
      setSwipeAction("Item marcado para exclusão");
      setPhotosToDelete([...photosToDelete, photos[currentIndex]]);
      setHistory([...history, { action: "delete", index: currentIndex }]);
      setCurrentIndex(currentIndex + 1);
      translateX.value = withSpring(0);
      rotateZ.value = withSpring(0);
      overlayOpacity.value = withSpring(0);
      setTimeout(() => setSwipeAction(null), 1000);
    } else {
      translateX.value = withSpring(0);
      rotateZ.value = withSpring(0);
      overlayOpacity.value = withSpring(0);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const lastAction = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setCurrentIndex(lastAction.index);
    if (lastAction.action === "delete") {
      setPhotosToDelete(
        photosToDelete.filter((photo) => photo !== photos[lastAction.index])
      );
    }
    setSwipeAction("Ação desfeita!");
    setTimeout(() => setSwipeAction(null), 1000);
  };

  const handleFinish = async () => {
    if (photosToDelete.length > 0) {
      setSwipeAction("Excluindo itens...");
      const deleted = await MediaLibrary.deleteAssetsAsync(photosToDelete);
      if (deleted) {
        setPhotos(photos.filter((photo) => !photosToDelete.includes(photo)));
        setPhotosToDelete([]);
        setSwipeAction("Itens excluídos com sucesso!");
        setHistory([]);
      } else {
        setSwipeAction("Erro ao excluir itens");
      }
      setTimeout(() => setSwipeAction(null), 2000);
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotateZ: `${rotateZ.value}deg` },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    backgroundColor:
      translateX.value < 0
        ? "rgba(231, 76, 60, 0.5)"
        : "rgba(46, 204, 113, 0.5)",
  }));

  if (!permission) {
    return (
      <Text style={styles.noPermission}>
        Sem permissão para acessar a galeria
      </Text>
    );
  }

  if (photos.length === 0 || currentIndex >= photos.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.endText}>Sem mais itens para revisar!</Text>
        {photosToDelete.length > 0 && (
          <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
            <Text style={styles.buttonText}>
              Excluir {photosToDelete.length} item(s)
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const currentAssetUri =
    photos[currentIndex].localUri || photos[currentIndex].uri;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Revisar Itens ({currentIndex + 1}/{photos.length})
        </Text>
        <Picker
          selectedValue={filter}
          style={styles.picker}
          onValueChange={(itemValue) => setFilter(itemValue)}
        >
          <Picker.Item label="Mais recentes" value="recent" />
          <Picker.Item label="Mais antigos" value="oldest" />
          <Picker.Item label="Mais pesados" value="size" />
        </Picker>
      </View>

      <PanGestureHandler onGestureEvent={onGestureEvent} onEnded={onSwipe}>
        <Animated.View style={[styles.imageContainer, animatedStyle]}>
          <ImageBackground
            source={{ uri: currentAssetUri }}
            style={styles.image}
            resizeMode="cover"
          >
            <Animated.View style={[styles.overlay, overlayStyle]} />
            <View style={styles.actionIndicators}>
              <Ionicons
                name="trash-outline"
                size={40}
                color="#e74c3c"
                style={styles.iconLeft}
              />
              <Ionicons
                name="heart-outline"
                size={40}
                color="#2ecc71"
                style={styles.iconRight}
              />
            </View>
          </ImageBackground>
        </Animated.View>
      </PanGestureHandler>

      {swipeAction && <Text style={styles.feedbackText}>{swipeAction}</Text>}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            !history.length && styles.disabledButton,
          ]}
          onPress={handleUndo}
          disabled={!history.length}
        >
          <Ionicons name="arrow-undo" size={20} color="white" />
          <Text style={styles.buttonText}>Desfazer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.finishButton]}
          onPress={handleFinish}
        >
          <Ionicons name="checkmark" size={20} color="white" />
          <Text style={styles.buttonText}>Finalizar</Text>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    position: "absolute",
    top: 50,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    alignItems: "center",
  },
  headerText: {
    color: "#333",
    fontSize: 18,
    fontWeight: "700",
  },
  picker: {
    height: 50,
    width: 150,
    color: "#333",
  },
  imageContainer: {
    width: 350,
    height: 350,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  actionIndicators: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  iconLeft: {
    opacity: 0.8,
  },
  iconRight: {
    opacity: 0.8,
  },
  feedbackText: {
    position: "absolute",
    bottom: 120,
    fontSize: 18,
    color: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 15,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    width: "85%",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  finishButton: {
    backgroundColor: "#34C759",
  },
  disabledButton: {
    backgroundColor: "#A0A0A0",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 10,
  },
  noPermission: {
    flex: 1,
    textAlign: "center",
    paddingTop: 100,
    fontSize: 18,
    color: "#333",
    fontWeight: "600",
  },
  endText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginBottom: 30,
  },
});
