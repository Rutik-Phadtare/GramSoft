import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { notificationApi } from "../api/notifications";
import { useAuth } from "./AuthContext";
import { useSocketEvent } from "./SocketContext";

const NotificationContext = createContext(null);

const EMPTY_COUNTS = {
  dashboard: 0,
  grampanchayats: 0,
  contacts: 0,
  feedback: 0,
  registrations: 0,
  approvals: 0,
  tasks: 0,
  employees: 0,
  settings: 0,
};

let inFlightLoad = null;
let inFlightUserId = null;
const sessionCache = new Map();

function notificationSection(item) {
  return item?.section || item?.type || "dashboard";
}

function snapshotItems(items) {
  return items.map((item) => ({ ...item }));
}

export function NotificationProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const userId = user?.id || user?._id || null;
  const [items, setItems] = useState([]);
  const [sectionCounts, setSectionCounts] = useState(EMPTY_COUNTS);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const knownIdsRef = useRef(new Set());
  const unreadIdsRef = useRef(new Set());
  const markAllInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setItems([]);
    knownIdsRef.current.clear();
    unreadIdsRef.current.clear();
    setSectionCounts({ ...EMPTY_COUNTS });
    setUnreadCount(0);
    setLoaded(false);

    if (!isAdmin || !userId) return;

    let cancelled = false;

    const load = async () => {
      const cached = sessionCache.get(userId);
      if (cached) {
        setItems(cached.notifications || []);
        knownIdsRef.current = new Set((cached.notifications || []).map((item) => item._id));
        unreadIdsRef.current = new Set((cached.notifications || []).filter((item) => !item.readAt).map((item) => item._id));
        setUnreadCount(cached.unreadCount || 0);
        setSectionCounts({ ...EMPTY_COUNTS, ...(cached.sectionCounts || {}) });
        setLoaded(true);
        return;
      }

      if (!inFlightLoad || inFlightUserId !== userId) {
        inFlightUserId = userId;
        inFlightLoad = notificationApi.list({ page: 1, limit: 8 }).finally(() => {
          inFlightLoad = null;
          inFlightUserId = null;
        });
      }

      try {
        const data = await inFlightLoad;
        if (cancelled || !mountedRef.current) return;
        const normalized = {
          ...data,
          notifications: data.notifications || [],
          unreadCount: data.unreadCount || 0,
          sectionCounts: { ...EMPTY_COUNTS, ...(data.sectionCounts || {}) },
        };
        setItems(normalized.notifications);
        knownIdsRef.current = new Set(normalized.notifications.map((item) => item._id));
        unreadIdsRef.current = new Set(normalized.notifications.filter((item) => !item.readAt).map((item) => item._id));
        setUnreadCount(normalized.unreadCount);
        setSectionCounts(normalized.sectionCounts);
        sessionCache.set(userId, normalized);
        setLoaded(true);
      } catch {
        if (!cancelled && mountedRef.current) setLoaded(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userId]);

  useSocketEvent("notification:new", (notification) => {
    if (!isAdmin || !notification || !userId) return;
    const section = notificationSection(notification);
    if (knownIdsRef.current.has(notification._id)) return;
    knownIdsRef.current.add(notification._id);

    const cached = sessionCache.get(userId);
    const wasUnread = !notification.readAt;
    const nextItems = [notification, ...(cached?.notifications || items || [])].filter(
      (item, index, list) => list.findIndex((entry) => entry._id === item._id) === index
    ).slice(0, 8);
    const nextCached = {
      ...(cached || {}),
      notifications: nextItems,
      unreadCount: (cached?.unreadCount || unreadCount) + (wasUnread ? 1 : 0),
      sectionCounts: {
        ...EMPTY_COUNTS,
        ...(cached?.sectionCounts || sectionCounts),
        [section]: (cached?.sectionCounts?.[section] || sectionCounts[section] || 0) + (wasUnread ? 1 : 0),
      },
    };
    sessionCache.set(userId, nextCached);

    setItems(nextItems);
    if (wasUnread) {
      unreadIdsRef.current.add(notification._id);
      setUnreadCount((count) => count + 1);
      setSectionCounts((current) => ({
        ...current,
        [section]: (current[section] || 0) + 1,
      }));
    }
  });

  useSocketEvent("notification:updated", (payload) => {
    if (!isAdmin || !payload || !userId) return;

    if (payload.allRead) {
      unreadIdsRef.current.clear();
      const cached = sessionCache.get(userId);
      if (cached) {
        sessionCache.set(userId, {
          ...cached,
          unreadCount: 0,
          sectionCounts: { ...EMPTY_COUNTS },
          notifications: (cached.notifications || []).map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
        });
      }
      setUnreadCount(0);
      setSectionCounts({ ...EMPTY_COUNTS });
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      return;
    }

    if (payload.sectionRead) {
      const section = payload.sectionRead;
      const idsInSection = new Set(items.filter((i) => notificationSection(i) === section && !i.readAt).map((i) => i._id));
      const now = new Date().toISOString();
      idsInSection.forEach((id) => unreadIdsRef.current.delete(id));
      setItems((current) => current.map((item) => (idsInSection.has(item._id) ? { ...item, readAt: item.readAt || now } : item)));
      setUnreadCount((count) => Math.max(0, count - idsInSection.size));
      setSectionCounts((current) => ({ ...current, [section]: 0 }));

      const cached = sessionCache.get(userId);
      if (cached) {
        sessionCache.set(userId, {
          ...cached,
          unreadCount: Math.max(0, (cached.unreadCount || 0) - idsInSection.size),
          sectionCounts: { ...cached.sectionCounts, [section]: 0 },
          notifications: (cached.notifications || []).map((item) =>
            idsInSection.has(item._id) ? { ...item, readAt: item.readAt || now } : item
          ),
        });
      }
      return;
    }

    if (payload._id) {
      const section = notificationSection(payload);
      setItems((current) => current.map((item) => item._id === payload._id ? payload : item));
      if (payload.readAt && unreadIdsRef.current.has(payload._id)) {
        unreadIdsRef.current.delete(payload._id);
        setUnreadCount((count) => Math.max(0, count - 1));
        setSectionCounts((current) => ({
          ...current,
          [section]: Math.max(0, (current[section] || 0) - 1),
        }));

        const cached = sessionCache.get(userId);
        if (cached) {
          sessionCache.set(userId, {
            ...cached,
            unreadCount: Math.max(0, (cached.unreadCount || 0) - 1),
            sectionCounts: {
              ...cached.sectionCounts,
              [section]: Math.max(0, (cached.sectionCounts?.[section] || 0) - 1),
            },
            notifications: (cached.notifications || []).map((entry) => entry._id === payload._id ? payload : entry),
          });
        }
      }
    }
  });

  async function markRead(item) {
    if (!item || item.readAt || !userId) return;

    const section = notificationSection(item);
    const previousItems = snapshotItems(items);
    const previousUnreadCount = unreadCount;
    const previousSectionCounts = { ...sectionCounts };
    const previousUnreadIds = new Set(unreadIdsRef.current);
    const now = new Date().toISOString();

    unreadIdsRef.current.delete(item._id);
    setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, readAt: now } : entry));
    setUnreadCount((count) => Math.max(0, count - 1));
    setSectionCounts((current) => ({
      ...current,
      [section]: Math.max(0, (current[section] || 0) - 1),
    }));

    try {
      const result = await notificationApi.read(item._id);
      const updated = result?.notification || { ...item, readAt: now };
      const cached = sessionCache.get(userId);
      if (cached) {
        sessionCache.set(userId, {
          ...cached,
          notifications: (cached.notifications || []).map((entry) => entry._id === item._id ? updated : entry),
          unreadCount: Math.max(0, (cached.unreadCount || 0) - 1),
          sectionCounts: {
            ...cached.sectionCounts,
            [section]: Math.max(0, (cached.sectionCounts?.[section] || 0) - 1),
          },
        });
      }
    } catch {
      // Roll back the single optimistic update without issuing a second GET.
      // This keeps the normal path to exactly one PATCH call.
      if (!mountedRef.current) return;
      unreadIdsRef.current = previousUnreadIds;
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      setSectionCounts(previousSectionCounts);
    }
  }

  async function markAllRead() {
    if (!unreadCount || !userId || markAllInFlightRef.current) return;
    markAllInFlightRef.current = true;

    const previousItems = snapshotItems(items);
    const previousUnreadCount = unreadCount;
    const previousSectionCounts = { ...sectionCounts };
    const previousUnreadIds = new Set(unreadIdsRef.current);
    const now = new Date().toISOString();

    unreadIdsRef.current.clear();
    setUnreadCount(0);
    setSectionCounts({ ...EMPTY_COUNTS });
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));

    try {
      await notificationApi.readAll();
      const cached = sessionCache.get(userId);
      if (cached) {
        sessionCache.set(userId, {
          ...cached,
          unreadCount: 0,
          sectionCounts: { ...EMPTY_COUNTS },
          notifications: (cached.notifications || []).map((item) => ({ ...item, readAt: item.readAt || now })),
        });
      }
    } catch {
      if (mountedRef.current) {
        unreadIdsRef.current = previousUnreadIds;
        setItems(previousItems);
        setUnreadCount(previousUnreadCount);
        setSectionCounts(previousSectionCounts);
      }
    } finally {
      markAllInFlightRef.current = false;
    }
  }

  async function markSectionRead(section) {
    const currentCount = sectionCounts[section] || 0;
    if (!currentCount || !userId) return;

    const previousItems = snapshotItems(items);
    const previousUnreadCount = unreadCount;
    const previousSectionCounts = { ...sectionCounts };
    const previousUnreadIds = new Set(unreadIdsRef.current);
    const now = new Date().toISOString();

    // Optimistic: clear this section's badge and its items' unread dot
    // immediately (this runs the moment the admin opens that page), then
    // confirm with one batched PATCH instead of one call per notification.
    const idsInSection = new Set(items.filter((i) => notificationSection(i) === section && !i.readAt).map((i) => i._id));
    idsInSection.forEach((id) => unreadIdsRef.current.delete(id));
    setUnreadCount((count) => Math.max(0, count - currentCount));
    setSectionCounts((current) => ({ ...current, [section]: 0 }));
    setItems((current) => current.map((item) => (idsInSection.has(item._id) ? { ...item, readAt: item.readAt || now } : item)));

    try {
      await notificationApi.readSection(section);
      const cached = sessionCache.get(userId);
      if (cached) {
        sessionCache.set(userId, {
          ...cached,
          unreadCount: Math.max(0, (cached.unreadCount || 0) - currentCount),
          sectionCounts: { ...cached.sectionCounts, [section]: 0 },
          notifications: (cached.notifications || []).map((item) =>
            idsInSection.has(item._id) ? { ...item, readAt: item.readAt || now } : item
          ),
        });
      }
    } catch {
      if (!mountedRef.current) return;
      unreadIdsRef.current = previousUnreadIds;
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      setSectionCounts(previousSectionCounts);
    }
  }

  const value = useMemo(() => ({
    items,
    unreadCount,
    sectionCounts,
    loaded,
    markRead,
    markAllRead,
    markSectionRead,
  }), [items, unreadCount, sectionCounts, loaded]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within NotificationProvider");
  return context;
}
