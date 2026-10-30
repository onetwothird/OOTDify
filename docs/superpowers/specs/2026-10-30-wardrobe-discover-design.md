# Wardrobe + Discover — Design

**Date:** 2026-10-30

## Intent

**Asked:**
- "can you joined the wardrobe and outfits? and make it an wardrobe?"
- "replace the outfits menu into discover? like you can explore more outfits
  based on other users"
- "make it informative/exploring/visually appealing"
- Then "do all of it" / "all i said earlier, do it all": the user handed Claude
  the remaining decisions and asked it to build without more questions.

**Decided by Claude (delegated):**
- **Sharing is opt-in per outfit.** Discover shows only `community_posts`: outfits
  people chose to share with the existing "Share outfit" flow. Nothing private
  (closets, saved outfits) becomes visible. No schema or RLS change is needed:
  `community_posts` is already readable by signed-in users, and shared images are
  already copied to public refs by `shareOutfit`.
- **Discover is its own tab.** The Community tab keeps its feed, friends and chat
  as they are.

## Tabs

Home · **Wardrobe** · (+) · **Discover** · Community · Me.

- **Wardrobe** (`src/app/(tabs)/wardrobe.tsx`) shows a Closet | Outfits switch
  under the screen header. Closet is the former `discover.tsx` screen, moved to
  `src/features/wardrobe/ClosetScreen.tsx`. Outfits is the former `outfits.tsx`
  screen, moved to `src/features/outfit/OutfitsScreen.tsx`. Both behave exactly
  as before.
- The `section` route param picks the view: `outfits` opens Outfits, anything
  else opens Closet. The Outfits `view` param (for example `calendar`) still
  passes through.
- Every old link is updated: `/(tabs)/discover` (closet) → `/(tabs)/wardrobe`,
  and `/(tabs)/outfits` → `/(tabs)/wardrobe?section=outfits`.

## Discover (`src/app/(tabs)/discover.tsx`, `src/features/discover/`)

**Job:** browse looks other people shared, find people worth following, and
open a look to like or comment on it.

**Layout, top to bottom:**
1. **Header:** "Discover", with "Looks people shared" under it.
2. **Look of the week:** the bold moment. The most-liked look (likes plus
   comments) from the last 7 days that has images, shown as a tall flat-lay
   collage: one large image with up to two stacked beside it. The author's
   avatar and name, and the copper ❤ count, sit on it. Hidden when no look
   qualifies.
3. **Top creators:** a row of avatars ranked by likes received in the last 30
   days (up to 8), each with their name. Tapping one opens their profile
   (`/community/profile/[id]`).
4. **Sort:** a Trending / New / Friends switch.
   - Trending is a hot score: `(likes + 2 × comments + 1) / (ageHours + 2)^1.5`.
   - New is newest first.
   - Friends shows accepted friends' looks, newest first.
5. **Lookbook wall:** two staggered columns. Cards are the image, edge to edge,
   with the author and a copper ❤ count on a soft scrim. A single image sits in
   a 4:5 frame; a multi-image look shows a 2×2 piece grid in a 1:1 frame.
   Columns are filled greedily by height. Only posts with at least one image
   appear.
6. Tapping a card opens a sheet with the existing `PostCard` (images, caption,
   like, comments), so liking and commenting work exactly as in Community.

**States:**
- **Loading:** a skeleton grid.
- **Error:** `ErrorState` with retry.
- **Empty:** "No shared looks yet", with a "Share an outfit" action that opens
  Wardrobe → Outfits.
- **Friends empty:** "Your friends haven't shared looks yet".

**Pull to refresh** reloads the feed.

**Visual rules:**
- Theme tokens only. Copper (`accent`) is for likes, following the theme's
  "copper for favourites" rule; denim `brand` marks the selected sort.
- No numbered markers, all-caps labels or per-card entrance animations.
  The spotlight is the only emphasised element.

## Pure modules (Jest)

`src/features/discover/rank.ts`:
- `hotScore(post, now)`;
- `sortLooks(posts, sort, now, friendIds)`;
- `lookOfTheWeek(posts, now)`;
- `topCreators(posts, now, limit)`;
- `splitColumns(posts)`.

## Verification

`tsc`, Jest, lint, and an Android bundle export. The typed routes regenerate
with `CI=1 npx expo start` before `tsc`, because `wardrobe` is a new route.
