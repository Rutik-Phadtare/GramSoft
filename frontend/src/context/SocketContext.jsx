import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    // Empty string -> same origin as the page, which in dev is the Vite
    // server; socket.io's own client-side proxying handles the upgrade to
    // the backend from there. In prod, set VITE_API_URL.
    const url = import.meta.env.VITE_API_URL || undefined;
    const instance = io(url, { auth: { token }, transports: ["websocket", "polling"] });

    instance.on("connect", () => setConnected(true));
    instance.on("disconnect", () => setConnected(false));

    setSocket(instance);
    return () => {
      instance.disconnect();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}

// Subscribes `handler` to `event` for the lifetime of the calling
// component - used all over the admin/employee views to react to live
// pushes (e.g. refetch a list when "activity:new" comes in). Keeps the
// latest `handler` in a ref so callers can pass an inline arrow function
// each render without missing state in the closure or resubscribing.
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;
    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
