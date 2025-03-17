import React, { useEffect, useState } from "react";
import { StyleSheet, View, Image, Text, Button } from "react-native";
import * as MediaLibrary from "expo-media-library";
import {
  PanGestureHandler,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [photosToDelete, setPhotosToDelete] = useState([]); // Fotos marcadas para exclusão
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permission, setPermission] = useState(null);
  const [swipeAction, setSwipeAction] = useState(null);

  // Valores animados
  const translateX = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setPermission(status === "granted");
      if (status === "granted") {
        const photoAssets = await MediaLibrary.getAssetsAsync({
          first: 100,
          mediaType: ["photo"],
        });
        const photosWithLocalUris = await Promise.all(
          photoAssets.assets.map(async (asset) => {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
            return { ...asset, localUri: assetInfo.localUri || asset.uri };
          })
        );
        setPhotos(photosWithLocalUris);
      }
    })();
  }, []);

  const onGestureEvent = (event) => {
    translateX.value = event.nativeEvent.translationX;
  };

  const onSwipe = (event) => {
    const { translationX } = event.nativeEvent;

    if (translationX > 100) {
      // Swipe direito (manter)
      setSwipeAction("Foto mantida");
      setCurrentIndex(currentIndex + 1);
      translateX.value = withSpring(0);
      setTimeout(() => setSwipeAction(null), 1000);
    } else if (translationX < -100) {
      // Swipe esquerdo (marcar para deletar)
      setSwipeAction("Foto marcada para exclusão");
      setPhotosToDelete([...photosToDelete, photos[currentIndex]]);
      setCurrentIndex(currentIndex + 1);
      translateX.value = withSpring(0);
      setTimeout(() => setSwipeAction(null), 1000);
    } else {
      // Se o swipe for muito curto, volta ao centro
      translateX.value = withSpring(0);
    }
  };

  const handleFinish = async () => {
    if (photosToDelete.length > 0) {
      setSwipeAction("Confirmando exclusão em lote...");
      const deleted = await MediaLibrary.deleteAssetsAsync(photosToDelete);
      if (deleted) {
        setPhotos(photos.filter((photo) => !photosToDelete.includes(photo)));
        setPhotosToDelete([]);
        setSwipeAction("Fotos excluídas com sucesso!");
      } else {
        setSwipeAction("Exclusão cancelada");
      }
      setTimeout(() => setSwipeAction(null), 2000);
    } else {
      setSwipeAction("Nenhuma foto para excluir");
      setTimeout(() => setSwipeAction(null), 1000);
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolate(
      translateX.value,
      [-300, 0, 300],
      [
        "rgba(255, 0, 0, 0.5)",
        "rgba(255, 255, 255, 0)",
        "rgba(0, 255, 0, 0.5)",
      ],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateX: translateX.value }],
      backgroundColor,
    };
  });

  if (!permission) {
    return <Text>Sem permissão para acessar a galeria.</Text>;
  }

  if (photos.length === 0 || currentIndex >= photos.length) {
    return (
      <View style={styles.container}>
        <Text>Sem mais fotos para mostrar!</Text>
        {photosToDelete.length > 0 && (
          <Button title="Encerrar e Excluir" onPress={handleFinish} />
        )}
      </View>
    );
  }

  const currentPhotoUri =
    photos[currentIndex].localUri || photos[currentIndex].uri;

  return (
    <GestureHandlerRootView style={styles.container}>
      <PanGestureHandler onGestureEvent={onGestureEvent} onEnded={onSwipe}>
        <Animated.View style={[styles.imageContainer, animatedStyle]}>
          <Image
            source={{ uri: currentPhotoUri }}
            style={styles.image}
            resizeMode="contain"
          />
        </Animated.View>
      </PanGestureHandler>
      {swipeAction && <Text style={styles.feedbackText}>{swipeAction}</Text>}
      <View style={styles.buttonContainer}>
        <Button title="Encerrar e Excluir" onPress={handleFinish} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  imageContainer: {
    width: 300,
    height: 300,
    borderRadius: 10,
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  feedbackText: {
    position: "absolute",
    bottom: 80,
    fontSize: 18,
    color: "#fff",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 10,
    borderRadius: 5,
  },
  buttonContainer: {
    position: "absolute",
    bottom: 20,
  },
});
