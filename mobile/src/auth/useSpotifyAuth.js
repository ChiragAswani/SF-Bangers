import { useCallback, useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { api, getStoredSessionId, setStoredSessionId } from '../api';
import { BACKEND_URL, MOBILE_AUTH_RETURN_URL } from '../config';

function extractSessionId(url) {
  const match = url.match(/[?&]session=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function useSpotifyAuth() {
  const [status, setStatus] = useState('checking'); // checking | connected | disconnected
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = useCallback(async () => {
    setStatus('checking');
    const sessionId = await getStoredSessionId();
    if (!sessionId) {
      setStatus('disconnected');
      return false;
    }
    try {
      const resp = await api.get('/auth/spotify/status');
      if (resp?.connected) {
        setStatus('connected');
        return true;
      }
      await setStoredSessionId(null);
      setStatus('disconnected');
      return false;
    } catch (e) {
      // network hiccup shouldn't wipe out a saved session — treat as disconnected
      // only for this render, next check will retry
      setStatus('disconnected');
      return false;
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      const authUrl = `${BACKEND_URL}/auth/spotify/login?state=mobile`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, MOBILE_AUTH_RETURN_URL);

      if (result.type !== 'success' || !result.url) {
        if (result.type !== 'cancel' && result.type !== 'dismiss') {
          setError('Spotify login was interrupted. Please try again.');
        }
        return false;
      }

      const sessionId = extractSessionId(result.url);
      if (!sessionId) {
        setError('Spotify login failed — please try again.');
        return false;
      }

      await setStoredSessionId(sessionId);
      setStatus('connected');
      return true;
    } catch (e) {
      setError('Unable to start Spotify login.');
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await setStoredSessionId(null);
    setStatus('disconnected');
  }, []);

  return { status, connecting, error, connect, disconnect, refresh: checkStatus };
}
