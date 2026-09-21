// C:\OOTDify\src\shared\lib\uuid.ts
// Minimal dependency-free uuid v4 used for optimistic/local keys.
// Kept in its own module so pure logic (outfit generator, etc.) never pulls
// in the Supabase client chain (which Jest cannot transform in tests).

export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}