import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

export function useSocket(storeId) {
  const socketRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!storeId || !user) return;
    const socket = io(WS_URL, { transports: ['websocket', 'polling'], reconnectionDelay: 1000, reconnectionAttempts: 10 });
    socketRef.current = socket;
    socket.on('connect', () => { socket.emit('subscribe:store', { storeId }); });
    return () => { socket.disconnect(); };
  }, [storeId, user]);

  const on = useCallback((event, handler) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event, data) => { socketRef.current?.emit(event, data); }, []);

  return { socket: socketRef.current, on, emit };
}
