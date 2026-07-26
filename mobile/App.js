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

function getBackStep(step) {
  switch (step) {
    case 'seedArtists':
      return 'intro';
    case 'similarSelection':
      return 'seedArtists';
    case 'review':
      return 'similarSelection';
    default:
      return null;
  }
}

export default function App() {
  const { status: authStatus, connecting, error: authError, connect, refresh } = useSpotifyAuth();
  const [step, setStep] = useState('checking');

  const [seedArtists, setSeedArtists] = useState([]);
  const [selectedArtists, setSelectedArtists] = useState([]);
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

  // Land on the right first screen once we know whether a saved Spotify
  // session is still valid and the custom fonts are ready; only acts on the
  // very first resolution so it doesn't yank the user back to "intro" if a
  // later status check fails.
  useEffect(() => {
    if (authStatus === 'checking' || !fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
    setStep((prev) => {
      if (prev !== 'checking') return prev;
      return authStatus === 'connected' ? 'seedArtists' : 'intro';
    });
  }, [authStatus, fontsLoaded]);

  const handleGetStarted = useCallback(() => setStep('seedArtists'), []);

  const handleSpotifySessionExpired = useCallback(() => {
    refresh();
  }, [refresh]);

  const handleSeedNext = useCallback((artists) => {
    setSeedArtists(artists);
    setStep('similarSelection');
  }, []);

  const handleSimilarNext = useCallback((artists) => {
    setSelectedArtists(artists);
    setStep('review');
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const resp = await api.post('/generate/playlist', { artists: selectedArtists });
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
  }, [selectedArtists]);

  const handleConnectAndGenerate = useCallback(async () => {
    setGenerateError('');
    const ok = await connect();
    if (ok) await handleGenerate();
  }, [connect, handleGenerate]);

  const handleSkip = useCallback(() => {
    setPlaylistId('');
    setStep('result');
  }, []);

  const handleDone = useCallback(() => {
    setPlaylistId('');
    setSelectedArtists([]);
    setSeedArtists([]);
    setStep('seedArtists');
  }, []);

  const goBack = useCallback(() => {
    const prevStep = getBackStep(step);
    if (prevStep) setStep(prevStep);
  }, [step]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const prevStep = getBackStep(step);
      if (prevStep) {
        setStep(prevStep);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [step]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {step === 'checking' || !fontsLoaded ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : step === 'intro' ? (
          <IntroScreen onGetStarted={handleGetStarted} />
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
        ) : step === 'review' ? (
          <ReviewScreen
            artists={selectedArtists}
            onBack={goBack}
            onGenerate={handleGenerate}
            onConnectAndGenerate={handleConnectAndGenerate}
            onSkip={handleSkip}
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
