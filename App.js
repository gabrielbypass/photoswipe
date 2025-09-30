import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ImageBackground,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
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
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [photosToDelete, setPhotosToDelete] = useState([]);
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [permission, setPermission] = useState(null);
  const [swipeAction, setSwipeAction] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [endCursor, setEndCursor] = useState(null);
  const [totalPhotos, setTotalPhotos] = useState(0);

  const PHOTOS_PER_PAGE = 50;

  const translateX = useSharedValue(0);
  const rotateZ = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);

  const loadPhotos = useCallback(
    async (isFirstLoad = true) => {
      try {
        setIsLoading(true);
        console.log("Iniciando loadPhotos, isFirstLoad:", isFirstLoad);

        const { status } = await MediaLibrary.getPermissionsAsync();
        console.log("Status atual da permissão:", status);

        if (status !== "granted") {
          console.log("Permissão não concedida, solicitando...");
          const { status: newStatus } =
            await MediaLibrary.requestPermissionsAsync();
          console.log("Novo status após solicitação:", newStatus);

          setPermission(newStatus === "granted");
          console.log("Permission atualizado para:", newStatus === "granted");

          if (newStatus !== "granted") {
            console.log("Permissão negada pelo usuário");
            setIsLoading(false);
            Alert.alert(
              "Permissão Negada",
              "Você precisa conceder permissão para acessar suas fotos."
            );
            return;
          }
        }

        console.log("Permissão concedida, carregando fotos...");
        const params = {
          mediaType: ["photo"],
          first: PHOTOS_PER_PAGE,
          sortBy: [MediaLibrary.SortBy.creationTime],
        };

        if (!isFirstLoad && endCursor) {
          params.after = endCursor;
        }

        const photoAssets = await MediaLibrary.getAssetsAsync(params);
        console.log("Fotos carregadas:", photoAssets.assets.length);

        setEndCursor(photoAssets.endCursor);
        setHasMorePhotos(photoAssets.hasNextPage);

        if (photoAssets.assets.length === 0) {
          console.log("Nenhuma foto encontrada");
          setIsLoading(false);
          return;
        }

        if (isFirstLoad) {
          const { totalCount } = await MediaLibrary.getAssetsAsync({
            mediaType: ["photo"],
          });
          setTotalPhotos(totalCount);
          console.log("Total de fotos:", totalCount);
        }

        const processedPhotos = await Promise.all(
          photoAssets.assets.map(async (asset) => {
            try {
              const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
              let finalUri = assetInfo.localUri || asset.uri;

              if (finalUri.startsWith("file://")) {
                const fileInfo = await FileSystem.getInfoAsync(finalUri);
                if (!fileInfo.exists) {
                  finalUri = asset.uri;
                }
              }

              return {
                ...asset,
                localUri: finalUri,
                creationTime: asset.creationTime,
                width: asset.width,
                height: asset.height,
              };
            } catch (error) {
              console.error("Erro ao processar foto:", error);
              return { ...asset, localUri: asset.uri };
            }
          })
        );

        if (isFirstLoad) {
          setPhotos(processedPhotos);
        } else {
          setPhotos((prevPhotos) => [...prevPhotos, ...processedPhotos]);
        }

        console.log("Fotos processadas e adicionadas ao estado");
        setIsLoading(false);
      } catch (error) {
        console.error("Erro ao carregar fotos:", error);
        Alert.alert(
          "Erro",
          "Não foi possível carregar suas fotos. Tente novamente."
        );
        setIsLoading(false);
      }
    },
    [endCursor]
  );

  const loadMorePhotos = useCallback(() => {
    if (hasMorePhotos && !isLoading) {
      loadPhotos(false);
    }
  }, [hasMorePhotos, isLoading, loadPhotos]);

  useEffect(() => {
    loadPhotos(true);
  }, []);

  useEffect(() => {
    if (
      currentIndex > 0 &&
      photos.length > 0 &&
      currentIndex >= photos.length * 0.7 &&
      hasMorePhotos &&
      !isLoading
    ) {
      loadMorePhotos();
    }
  }, [currentIndex, photos.length, hasMorePhotos, isLoading, loadMorePhotos]);

  const updateSwipeAction = (message) => {
    setSwipeAction(message);
    setTimeout(() => setSwipeAction(null), 1000);
  };

  const onGestureEvent = useCallback((event) => {
    translateX.value = event.nativeEvent.translationX;
    rotateZ.value = event.nativeEvent.translationX / 20;
    overlayOpacity.value = Math.min(
      Math.abs(event.nativeEvent.translationX) / 50,
      0.7
    );
  }, []);

  const onSwipe = useCallback(
    (event) => {
      const { translationX } = event.nativeEvent;

      if (translationX > 100) {
        runOnJS(handleKeep)();
      } else if (translationX < -100) {
        runOnJS(handleDelete)();
      } else {
        translateX.value = withSpring(0);
        rotateZ.value = withSpring(0);
        overlayOpacity.value = withSpring(0);
      }
    },
    [currentIndex, photos, history, photosToDelete]
  );

  const handleKeep = useCallback(() => {
    updateSwipeAction("Foto mantida");
    setHistory((prev) => [
      ...prev,
      { action: "keep", index: currentIndex, photo: photos[currentIndex] },
    ]);
    setCurrentIndex(currentIndex + 1);
    translateX.value = withSpring(0);
    rotateZ.value = withSpring(0);
    overlayOpacity.value = withSpring(0);
  }, [currentIndex, photos, history]);

  const handleDelete = useCallback(() => {
    updateSwipeAction("Foto marcada para exclusão");
    if (photos[currentIndex]) {
      setPhotosToDelete((prev) => [...prev, photos[currentIndex]]);
      setHistory((prev) => [
        ...prev,
        { action: "delete", index: currentIndex, photo: photos[currentIndex] },
      ]);
      setCurrentIndex(currentIndex + 1);
    }
    translateX.value = withSpring(0);
    rotateZ.value = withSpring(0);
    overlayOpacity.value = withSpring(0);
  }, [currentIndex, photos, history, photosToDelete]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));

    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }

    if (lastAction.action === "delete") {
      setPhotosToDelete((prev) =>
        prev.filter((photo) => photo.id !== lastAction.photo.id)
      );
    }

    updateSwipeAction("Ação desfeita!");
  }, [history, currentIndex]);

  const handleFinish = useCallback(async () => {
    if (photosToDelete.length === 0) {
      Alert.alert("Nenhuma foto foi marcada para exclusão");
      return;
    }

    Alert.alert(
      "Excluir Fotos",
      `Você marcou ${photosToDelete.length} foto(s) para exclusão. Confirma a exclusão?`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            try {
              setSwipeAction("Excluindo fotos...");
              const photoIds = photosToDelete.map((photo) => photo.id);
              const deleted = await MediaLibrary.deleteAssetsAsync(photoIds);

              if (deleted) {
                setPhotos((prev) =>
                  prev.filter(
                    (photo) => !photosToDelete.some((p) => p.id === photo.id)
                  )
                );
                setPhotosToDelete([]);
                setHistory([]);
                if (currentIndex >= photos.length - photosToDelete.length) {
                  setCurrentIndex(0);
                }
                updateSwipeAction("Fotos excluídas com sucesso!");
                setTimeout(() => {
                  setSwipeAction(null);
                }, 2000);
              } else {
                setSwipeAction("Erro ao excluir fotos");
                setTimeout(() => {
                  setSwipeAction(null);
                  Alert.alert(
                    "Erro",
                    "Não foi possível excluir algumas fotos. Verifique as permissões do aplicativo."
                  );
                }, 1000);
              }
            } catch (error) {
              console.error("Erro ao excluir fotos:", error);
              setSwipeAction(null);
              Alert.alert("Erro", "Ocorreu um erro ao excluir as fotos.");
            }
          },
        },
      ]
    );
  }, [photosToDelete, photos, currentIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotateZ: `${rotateZ.value}deg` },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => {
    const isLeft = translateX.value < 0;
    return {
      opacity: overlayOpacity.value,
      backgroundColor: isLeft
        ? "rgba(231, 76, 60, 0.5)"
        : "rgba(46, 204, 113, 0.5)",
    };
  });

  const PreloadNextImage = useCallback(() => {
    if (currentIndex + 1 < photos.length && photos[currentIndex + 1]) {
      return (
        <Image
          source={{
            uri:
              photos[currentIndex + 1].localUri || photos[currentIndex + 1].uri,
          }}
          style={{ width: 1, height: 1, opacity: 0 }}
        />
      );
    }
    return null;
  }, [currentIndex, photos]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.noPermission}>
          Sem permissão para acessar a galeria
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={async () => {
            try {
              const { status } = await MediaLibrary.requestPermissionsAsync();
              console.log("Status após clique no botão:", status);
              if (status === "granted") {
                setPermission(true);
                loadPhotos(true);
              } else {
                Alert.alert(
                  "Permissão Negada",
                  "Você precisa permitir o acesso às fotos para usar este aplicativo."
                );
              }
            } catch (error) {
              console.error("Erro ao solicitar permissão:", error);
              Alert.alert("Erro", "Falha ao solicitar permissão.");
            }
          }}
        >
          <Text style={styles.buttonText}>Solicitar Permissão</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading && photos.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Carregando suas fotos...</Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.endText}>Nenhuma foto encontrada!</Text>
      </View>
    );
  }

  if (currentIndex >= photos.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.endText}>Sem mais fotos para revisar!</Text>
        {photosToDelete.length > 0 && (
          <TouchableOpacity style={styles.finishButton} onPress={handleFinish}>
            <Text style={styles.buttonText}>
              Excluir {photosToDelete.length} foto(s)
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.circleButton, styles.refreshButton, { marginTop: 20 }]}
          onPress={() => {
            setCurrentIndex(0);
            setHistory([]);
            setPhotosToDelete([]);
          }}
        >
          <Ionicons name="refresh" size={30} color="white" />
        </TouchableOpacity>
      </View>
    );
  }

  const currentPhoto = photos[currentIndex];
  const currentPhotoUri = currentPhoto?.localUri || currentPhoto?.uri;

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Revisar Fotos ({currentIndex + 1}/{totalPhotos})
        </Text>
        <Text style={styles.subHeaderText}>
          {photosToDelete.length} marcada(s) para exclusão
        </Text>
      </View>

      <PanGestureHandler onGestureEvent={onGestureEvent} onEnded={onSwipe}>
        <Animated.View style={[styles.imageContainer, animatedStyle]}>
          <ImageBackground
            source={{ uri: currentPhotoUri }}
            style={styles.image}
            resizeMode="cover"
            onError={(e) =>
              console.error("Erro ao carregar imagem:", e.nativeEvent.error)
            }
          >
            <Animated.View style={[styles.overlay, overlayStyle]} />
            <View style={styles.actionIndicators}>
              <View style={[styles.actionBadge, styles.deleteBadge]}>
                <Ionicons name="trash-outline" size={40} color="#fff" />
                <Text style={styles.actionText}>Excluir</Text>
              </View>
              <View style={[styles.actionBadge, styles.keepBadge]}>
                <Ionicons name="heart-outline" size={40} color="#fff" />
                <Text style={styles.actionText}>Manter</Text>
              </View>
            </View>
          </ImageBackground>
        </Animated.View>
      </PanGestureHandler>

      <PreloadNextImage />

      {swipeAction && <Text style={styles.feedbackText}>{swipeAction}</Text>}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.circleButton,
            styles.undoButton,
            !history.length && styles.disabledButton,
          ]}
          onPress={handleUndo}
          disabled={!history.length}
        >
          <Ionicons name="arrow-undo" size={30} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circleButton, styles.deleteButton]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={30} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.circleButton, styles.keepButton]}
          onPress={handleKeep}
        >
          <Ionicons name="heart-outline" size={30} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.circleButton,
            styles.finishButton,
            photosToDelete.length === 0 && styles.disabledButton,
          ]}
          onPress={handleFinish}
          disabled={photosToDelete.length === 0}
        >
          <Ionicons name="checkmark" size={30} color="white" />
        </TouchableOpacity>
      </View>

      {isLoading && photos.length > 0 && (
        <View style={styles.loadingMoreContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.loadingMoreText}>Carregando mais fotos...</Text>
        </View>
      )}
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
  subHeaderText: {
    color: "#e74c3c",
    fontSize: 14,
    marginTop: 2,
  },
  imageContainer: {
    width: 350,
    height: 480,
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
  actionBadge: {
    padding: 10,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBadge: {
    backgroundColor: "rgba(231, 76, 60, 0.8)",
  },
  keepBadge: {
    backgroundColor: "rgba(46, 204, 113, 0.8)",
  },
  actionText: {
    color: "white",
    fontWeight: "700",
    marginTop: 5,
  },
  feedbackText: {
    position: "absolute",
    bottom: 140,
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
    alignItems: "center",
    width: "85%",
    paddingHorizontal: 10,
  },
  circleButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginHorizontal: 5,
  },
  undoButton: {
    backgroundColor: "#007AFF",
  },
  deleteButton: {
    backgroundColor: "#e74c3c",
  },
  keepButton: {
    backgroundColor: "#2ecc71",
  },
  finishButton: {
    backgroundColor: "#34C759",
  },
  refreshButton: {
    backgroundColor: "#007AFF",
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
    fontSize: 18,
    color: "#333",
    fontWeight: "600",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 30,
  },
  endText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginBottom: 30,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
  },
  loadingMoreContainer: {
    position: "absolute",
    top: 120,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 20,
  },
  loadingMoreText: {
    marginLeft: 10,
    fontSize: 14,
    color: "#666",
  },
});
