import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Safety net: if the WebView's onLoadEnd/onError never fires for any
// reason (slow network, a stalled request, a native edge case that
// doesn't repro in Expo Go), don't leave the user stuck on the splash
// screen forever.
const SPLASH_FALLBACK_MS = 8000;
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, SPLASH_FALLBACK_MS);

// Points at the deployed SF Bangers site. Swap to your machine's LAN IP
// (e.g. "http://192.168.1.23:3000") to test against a local `npm start`.
const SITE_URL = 'https://sf-bangers.appspot.com';
const SITE_HOST = 'sf-bangers.appspot.com';
const BG_COLOR = '#070a12';
const BAR_COLOR = '#0b1020';
const ACCENT_COLOR = '#7ee787';
const INACTIVE_COLOR = 'rgba(255,255,255,0.45)';

// Matches the anchor ids added to client/src/HomePage.js — each tab now
// targets its own real element (rather than sharing #section-weekly with
// the page header), so scrollIntoView never drags a neighboring section
// off-screen with it.
const TABS = [
  { key: 'home', anchor: 'section-home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'weekly', anchor: 'section-weekly', label: 'Weekly', icon: 'musical-notes-outline', iconActive: 'musical-notes' },
  { key: 'subscribe', anchor: 'section-subscribe', label: 'Subscribe', icon: 'mail-outline', iconActive: 'mail' },
  { key: 'archives', anchor: 'section-archives', label: 'Archives', icon: 'archive-outline', iconActive: 'archive' },
  { key: 'similar', anchor: 'section-similar-artists', label: 'Discover', icon: 'search-outline', iconActive: 'search' },
];

// Injected before the site's own stylesheet finishes loading, so there's
// never a flash of white and the page feels native from the first frame.
const INJECTED_BEFORE_LOAD = `
  (function() {
    var style = document.createElement('style');
    style.textContent = [
      'html, body { background: ${BG_COLOR} !important; }',
      '* { -webkit-tap-highlight-color: transparent !important; }',
      'body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; overscroll-behavior-y: none; }',
      'input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }',
    ].join(' ');
    document.documentElement.appendChild(style);
  })();
  true;
`;

// Tracks which section is currently in view and reports it back to the
// native tab bar, so the active tab reflects real scroll position.
const INJECTED_TAB_TRACKER = `
  (function() {
    var ids = ${JSON.stringify(TABS.map((t) => t.anchor))};
    var els = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!els.length || !window.ReactNativeWebView) return true;

    var lastSent = null;
    function currentSection() {
      var probe = window.innerHeight * 0.3;
      var best = els[0].id;
      for (var i = 0; i < els.length; i++) {
        var top = els[i].getBoundingClientRect().top;
        if (top <= probe) best = els[i].id;
      }
      return best;
    }
    function report() {
      var id = currentSection();
      if (id !== lastSent) {
        lastSent = id;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'section', id: id }));
      }
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        report();
        ticking = false;
      });
    }, { passive: true });
    report();
  })();
  true;
`;

function scrollToTabScript(tab) {
  return `
    (function() {
      var el = document.getElementById(${JSON.stringify(tab.anchor)});
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })();
    true;
  `;
}

function isExternalRequest(url) {
  try {
    const { hostname, protocol, pathname } = new URL(url);
    if (protocol === 'mailto:' || protocol === 'tel:') return true;
    if (hostname === SITE_HOST) return false;
    // The "This week" card embeds a Spotify player inline via an iframe —
    // that's a page resource, not a link tap, so keep it inside the app.
    if (hostname === 'open.spotify.com' && pathname.startsWith('/embed/')) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function OfflineView({ onRetry }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Can't reach SF Bangers</Text>
      <Text style={styles.errorSubtitle}>Check your connection and try again.</Text>
      <Text style={styles.retryButton} onPress={onRetry}>
        Retry
      </Text>
    </View>
  );
}

function TabBar({ activeTab, onSelect }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={styles.tabItem}
            onPress={() => onSelect(tab)}
            hitSlop={8}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={22}
              color={isActive ? ACCENT_COLOR : INACTIVE_COLOR}
            />
            <Text
              style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.tabDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function App() {
  const webviewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

  const injectedJavaScript = useMemo(() => INJECTED_TAB_TRACKER, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync(BAR_COLOR).catch(() => {});
    NavigationBar.setButtonStyleAsync('light').catch(() => {});
  }, []);

  const handleAndroidBackPress = useCallback(() => {
    if (canGoBack && webviewRef.current) {
      webviewRef.current.goBack();
      return true;
    }
    return false;
  }, [canGoBack]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleAndroidBackPress);
    return () => subscription.remove();
  }, [handleAndroidBackPress]);

  const handleShouldStartLoad = useCallback((request) => {
    if (isExternalRequest(request.url)) {
      Haptics.selectionAsync().catch(() => {});
      Linking.openURL(request.url).catch(() => {});
      return false;
    }
    return true;
  }, []);

  const handleRetry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setHasError(false);
    setLoading(true);
    webviewRef.current?.reload();
  }, []);

  const handleSelectTab = useCallback((tab) => {
    Haptics.selectionAsync().catch(() => {});
    setActiveTab(tab.key);
    webviewRef.current?.injectJavaScript(scrollToTabScript(tab));
  }, []);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type !== 'section') return;
      const tab = TABS.find((t) => t.anchor === data.id);
      if (tab) setActiveTab(tab.key);
    } catch (e) {
      // ignore malformed messages
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" />

        <WebView
          ref={webviewRef}
          source={{ uri: SITE_URL }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            SplashScreen.hideAsync().catch(() => {});
          }}
          onError={() => {
            setHasError(true);
            setLoading(false);
            SplashScreen.hideAsync().catch(() => {});
          }}
          onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_LOAD}
          injectedJavaScript={injectedJavaScript}
          pullToRefreshEnabled
          bounces
          decelerationRate="normal"
          overScrollMode="never"
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          contentInsetAdjustmentBehavior="never"
        />

        {loading && !hasError && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={ACCENT_COLOR} />
          </View>
        )}

        {hasError && <OfflineView onRetry={handleRetry} />}

        {!hasError && <TabBar activeTab={activeTab} onSelect={handleSelectTab} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  webview: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG_COLOR,
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: BG_COLOR,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    color: BG_COLOR,
    backgroundColor: ACCENT_COLOR,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    fontWeight: '700',
    overflow: 'hidden',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: BAR_COLOR,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: INACTIVE_COLOR,
  },
  tabLabelActive: {
    color: ACCENT_COLOR,
  },
  tabDot: {
    position: 'absolute',
    top: -10,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT_COLOR,
  },
});
