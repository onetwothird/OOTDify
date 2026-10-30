// Several screens listening on one realtime topic share one connection. A
// topic that must match between sender and receivers (broadcast) can't take
// realtimeTopic()'s unique suffix, and Supabase throws if listeners are added
// to a topic that is already joined, so the connection is opened once, fanned
// out to every listener, and closed when the last one leaves.
type Listener = (payload: unknown) => void;
type Open = (topic: string, emit: Listener) => () => void;

export function sharedSubscriptions(open: Open) {
  const topics = new Map<string, { listeners: Set<Listener>; close: () => void }>();

  return {
    listen(topic: string, listener: Listener): () => void {
      let entry = topics.get(topic);
      if (!entry) {
        const listeners = new Set<Listener>();
        const close = open(topic, (payload) => {
          for (const l of [...listeners]) l(payload);
        });
        entry = { listeners, close };
        topics.set(topic, entry);
      }
      const own = entry;
      const wrapped: Listener = (payload) => listener(payload);
      own.listeners.add(wrapped);
      return () => {
        if (!own.listeners.delete(wrapped)) return;
        if (own.listeners.size === 0 && topics.get(topic) === own) {
          topics.delete(topic);
          own.close();
        }
      };
    },
  };
}
