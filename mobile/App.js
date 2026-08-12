import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { setAudioModeAsync } from 'expo-audio';
import { useFonts as useFredoka, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import {
  useFonts as useQuicksand,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';

import { useSpotifyAuth } from './src/auth/useSpotifyAuth';
import { api } from './src/api';
import { colors } from './src/theme';

import IntroScreen from './src/screens/IntroScreen';
import SeedArtistsScreen from './src/screens/SeedArtistsScreen';
import SimilarSelectionScreen from './src/screens/SimilarSelectionScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import ResultScreen from './src/screens/ResultScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Safety net: if the auth-status check never resolves for any reason (slow
// network, a stalled request), don't leave the user stuck on the splash
// screen forever.
const SPLASH_FALLBACK_MS = 8000;
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, SPLASH_FALLBACK_MS);

// 'review' is reachable from either the seed-artists path or the popular-in-SF
// path, so its back target depends on which one was taken — hence fromPopular.
function getBackStep(step, fromPopular) {
  switch (step) {
    case 'seedArtists':
      return 'intro';
    case 'popularInSF':
      return 'intro';
    case 'similarSelection':
      return 'seedArtists';
    case 'review':
      return fromPopular ? 'popularInSF' : 'similarSelection';
    default:
      return null;
  }
}

export default function App() {
  const { status: authStatus, connecting, error: authError, connect, refresh } = useSpotifyAuth();
  const [step, setStep] = useState('checking');

  const [seedArtists, setSeedArtists] = useState([]);
  const [cameFromPopular, setCameFromPopular] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [playlistId, setPlaylistId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const [fredokaLoaded] = useFredoka({ Fredoka_600SemiBold, Fredoka_700Bold });
  const [quicksandLoaded] = useQuicksand({ Quicksand_500Medium, Quicksand_600SemiBold, Quicksand_700Bold });
  const fontsLoaded = fredokaLoaded && quicksandLoaded;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync(colors.bg).catch(() => {});
    NavigationBar.setButtonStyleAsync('dark').catch(() => {});
  }, []);

  // let song previews play even if the phone's silent switch is on — this is
  // a deliberate "listen before you decide" feature, not background music
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Always land on the intro screen for a fresh app launch, even if a saved
  // Spotify session is still valid — a returning connected user just taps
  // "Get Started" and skips straight past the (already-connected) auth step.
  useEffect(() => {
    if (authStatus === 'checking' || !fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
    setStep((prev) => (prev !== 'checking' ? prev : 'intro'));
  }, [authStatus, fontsLoaded]);

  const handleGetStarted = useCallback(() => {
    setCameFromPopular(false);
    setStep('seedArtists');
  }, []);

  const handleBrowsePopular = useCallback(() => {
    setCameFromPopular(true);
    setStep('popularInSF');
  }, []);

  const handleSpotifySessionExpired = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleSeedNext = useCallback((artists) => {
    setSeedArtists(artists);
    setStep('similarSelection');
  }, []);

  const handleSimilarNext = useCallback((items) => {
    setSelectedItems(items);
    setStep('review');
  }, []);

  // Review lets the user trim their lineup before committing, so it hands
  // back its own (possibly edited) list rather than relying on the list we
  // handed it.
  const handleGenerate = useCallback(async (items) => {
    setGenerating(true);
    setGenerateError('');
    try {
      const resp = await api.post('/generate/playlist', { artists: items.map((it) => it.name) });
      setPlaylistId(resp?.playlistId || '');
      setStep('result');
    } catch (e) {
      setGenerateError(
        e.status === 401
          ? 'Your Spotify session expired. Please reconnect.'
          : "Couldn't generate your playlist. Please try again."
      );
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleConnectAndGenerate = useCallback(
    async (items) => {
      setGenerateError('');
      const ok = await connect();
      if (ok) await handleGenerate(items);
    },
    [connect, handleGenerate]
  );

  const handleSkip = useCallback(() => {
    setPlaylistId('');
    setStep('result');
  }, []);

  const handleDone = useCallback(() => {
    setPlaylistId('');
    setSelectedItems([]);
    setSeedArtists([]);
    setCameFromPopular(false);
    setStep('intro');
  }, []);

  const goBack = useCallback(() => {
    const prevStep = getBackStep(step, cameFromPopular);
    if (prevStep) setStep(prevStep);
  }, [step, cameFromPopular]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const prevStep = getBackStep(step, cameFromPopular);
      if (prevStep) {
        setStep(prevStep);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step, cameFromPopular]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />

        {step === 'checking' || !fontsLoaded ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : step === 'intro' ? (
          <IntroScreen onGetStarted={handleGetStarted} onBrowsePopular={handleBrowsePopular} />
        ) : step === 'seedArtists' ? (
          <SeedArtistsScreen
            onBack={goBack}
            onNext={handleSeedNext}
            spotifyConnected={authStatus === 'connected'}
            connecting={connecting}
            authError={authError}
            onConnectSpotify={connect}
            onSpotifySessionExpired={handleSpotifySessionExpired}
          />
        ) : step === 'similarSelection' ? (
          <SimilarSelectionScreen topArtists={seedArtists} onBack={goBack} onNext={handleSimilarNext} />
        ) : step === 'popularInSF' ? (
          <SimilarSelectionScreen onBack={goBack} onNext={handleSimilarNext} />
        ) : step === 'review' ? (
          <ReviewScreen
            items={selectedItems}
            onBack={goBack}
            onGenerate={handleGenerate}
            onConnectAndGenerate={handleConnectAndGenerate}
            onSkip={handleSkip}
            onStartOver={handleDone}
            spotifyConnected={authStatus === 'connected'}
            generating={generating || connecting}
            error={generateError || authError}
          />
        ) : step === 'result' ? (
          <ResultScreen playlistId={playlistId} onDone={handleDone} />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
