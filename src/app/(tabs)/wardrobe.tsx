// C:\OOTDify\src\app\(tabs)\wardrobe.tsx
// Wardrobe: your closet and your saved outfits in one tab, switched under the
// header. `?section=outfits` opens Outfits (its own `view` param, e.g.
// calendar, still applies); anything else opens Closet.
import { useLocalSearchParams, useRouter } from "expo-router";

import { OutfitsScreen } from "../../features/outfit/OutfitsScreen";
import { ClosetScreen } from "../../features/wardrobe/ClosetScreen";
import { wardrobeSection, type WardrobeSection } from "../../features/wardrobe/section";
import { WardrobeSwitcher } from "../../features/wardrobe/WardrobeSwitcher";

export default function WardrobeTab() {
  const router = useRouter();
  const { section: param } = useLocalSearchParams<{ section?: string }>();
  const section = wardrobeSection(param);
  const change = (next: WardrobeSection) => router.setParams({ section: next, view: undefined });
  const switcher = <WardrobeSwitcher section={section} onChange={change} />;
  return section === "outfits" ? <OutfitsScreen switcher={switcher} /> : <ClosetScreen switcher={switcher} />;
}
