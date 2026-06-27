import { Image } from 'react-native';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=400';

export function getValidImageUrl(url?: string): string {
  if (!url || url.trim() === '') {
    return FALLBACK_IMAGE;
  }
  return url;
}

export async function prefetchOutfitImages(imageUrls: string[]): Promise<void> {
  const prefetchTasks = imageUrls.map(url => Image.prefetch(url));
  
  try {
    await Promise.all(prefetchTasks);
  } catch (error) {
    console.warn('Some images failed to prefetch:', error);
  }
}