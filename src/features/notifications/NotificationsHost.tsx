// C:\OOTDify\src\features\notifications\NotificationsHost.tsx
// Runs once inside the signed-in tabs and renders nothing:
//   * registers this phone for push and tells the database its language and
//     time zone (push text and quiet hours are worked out there);
//   * keeps the bell's unread count current and shows a banner for anything
//     new while the app is open (the phone's own banner is held back then, so
//     nothing shows twice);
//   * opens the right screen when a phone notification is tapped, including
//     the one that launched the app.
import type * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { supabase } from "../../shared/lib/supabase";
import { toast } from "../../shared/lib/toast";
import { useT } from "../../shared/i18n/useT";
import { useSettingsStore } from "../settings/settingsStore";
import { routeFor, type InboxRoute, type InboxRow } from "./inbox";
import { nativePush } from "./nativePush";
import { openInboxRoute } from "./openNotification";
import { fetchUnreadCount, markRead, registerForPush, subscribeToInbox, syncDeviceContext } from "./service";
import { useNotificationsStore } from "./store";
import { inboxText } from "./text";

// While the app is open the in-app banner covers it; keep the list and badge.
nativePush()?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function routeFromPush(data: Record<string, unknown> | undefined): { route: InboxRoute; id: string | null } | null {
  if (!data || typeof data.type !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: str(data.notificationId),
    route: routeFor({
      type: data.type as InboxRow["type"],
      actor_id: str(data.actorId),
      conversation_id: str(data.conversationId),
      my_day_post_id: str(data.myDayPostId),
    }),
  };
}

export function NotificationsHost() {
  const router = useRouter();
  const { t } = useT();
  const language = useSettingsStore((s) => s.language);
  const setUnread = useNotificationsStore((s) => s.setUnread);
  const bump = useNotificationsStore((s) => s.bump);

  // Push registration and device context. Failures are quiet: the inbox
  // works without push, and Settings explains when push is off.
  useEffect(() => {
    void registerForPush().catch(() => {});
  }, []);
  useEffect(() => {
    void syncDeviceContext(language === "fil" ? "fil" : "en").catch(() => {});
  }, [language]);

  // Unread count and live banners.
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let alive = true;
    void (async () => {
      const me = await currentUserId();
      if (!me || !alive) return;
      void fetchUnreadCount().then(setUnread).catch(() => {});
      unsubscribe = subscribeToInbox(me, (row) => {
        // Already reading that chat: count it as read on arrival.
        if (row.type === "message" && row.conversation_id === useNotificationsStore.getState().activeChat) {
          void markRead([row.id]).catch(() => {});
          return;
        }
        bump();
        void (async () => {
          const { data } = row.actor_id
            ? await supabase.from("community_directory").select("*").eq("user_id", row.actor_id).maybeSingle()
            : { data: null };
          const text = inboxText(t, row, data ?? null, null, 1);
          toast.info(text.title, text.body, {
            label: t("notifications.view"),
            onPress: () => {
              void markRead([row.id]).catch(() => {});
              openInboxRoute(router, routeFor(row), me);
            },
          });
        })();
      });
    })();
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [router, t, setUnread, bump]);

  // A tapped phone notification, including the one that opened the app.
  useEffect(() => {
    const push = nativePush();
    if (!push) return;
    const open = async (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const target = routeFromPush(response.notification.request.content.data as Record<string, unknown>);
      if (!target) return;
      if (target.id) void markRead([target.id]).catch(() => {});
      openInboxRoute(router, target.route, await currentUserId());
    };
    void push.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = push.addNotificationResponseReceivedListener((r) => void open(r));
    return () => sub.remove();
  }, [router]);

  return null;
}
