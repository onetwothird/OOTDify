// C:\OOTDify\src\features\notifications\openNotification.ts
// Turns a notification's target (see routeFor) into navigation. Shared by the
// inbox, the in-app banner and a tapped phone notification.
import type { useRouter } from "expo-router";

import type { InboxRoute } from "./inbox";

type Router = ReturnType<typeof useRouter>;

export function openInboxRoute(router: Router, route: InboxRoute, me: string | null) {
  switch (route.kind) {
    case "chat":
      router.push(`/community/chat/${route.id}`);
      return;
    case "myday":
      router.push({ pathname: "/community/myday/[userId]", params: { userId: route.id } });
      return;
    case "my-myday":
      if (!me) return;
      router.push({
        pathname: "/community/myday/[userId]",
        params: route.postId ? { userId: me, post: route.postId, activity: "1" } : { userId: me },
      });
      return;
    case "friends":
      router.push({ pathname: "/community", params: { tab: "friends" } });
      return;
    case "feed":
      router.push({ pathname: "/community", params: { tab: "feed" } });
  }
}
