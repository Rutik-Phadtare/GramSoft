import { useSocket } from "../context/SocketContext";

export default function LiveIndicator({ className = "" }) {
  const { connected } = useSocket();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${className}`}>
      <span className="relative flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${
            connected ? "bg-accent-400 animate-pulse-dot" : "bg-ink-muted"
          }`}
        />
      </span>
      <span className={connected ? "text-accent-500" : "text-ink-muted"}>
        {connected ? "Live" : "Reconnecting…"}
      </span>
    </span>
  );
}
