import { supabase } from '../lib/supabase';
import {
  AVATAR_MAX_FILE_BYTES, AVATAR_MIN_DIMENSION, AVATAR_MAX_DIMENSION, AVATAR_ALLOWED_MIME_TYPES,
} from '../types';

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// Validates an avatar upload client-side (fast feedback). The storage bucket
// also enforces size/mime type server-side as a second line of defense.
export async function validateAvatarFile(file: File): Promise<string | null> {
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Please choose a PNG, JPG, WEBP, or GIF image.';
  }
  if (file.size > AVATAR_MAX_FILE_BYTES) {
    return `Image must be under ${AVATAR_MAX_FILE_BYTES / (1024 * 1024)}MB.`;
  }
  const dims = await readImageDimensions(file);
  if (!dims) return 'Could not read that image — try a different file.';
  if (dims.width < AVATAR_MIN_DIMENSION || dims.height < AVATAR_MIN_DIMENSION) {
    return `Image must be at least ${AVATAR_MIN_DIMENSION}×${AVATAR_MIN_DIMENSION}px.`;
  }
  if (dims.width > AVATAR_MAX_DIMENSION || dims.height > AVATAR_MAX_DIMENSION) {
    return `Image must be no larger than ${AVATAR_MAX_DIMENSION}×${AVATAR_MAX_DIMENSION}px.`;
  }
  return null;
}

// Uploads to the 'avatars' bucket at {userId}/{leagueId}.{ext}, overwriting
// any previous upload for this user in this league.
export async function uploadAvatarImage(
  userId: string, leagueId: string, file: File,
): Promise<{ url?: string; error?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/${leagueId}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (uploadErr) return { error: uploadErr.message };

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-bust so a re-upload to the same path shows immediately for everyone
  return { url: `${data.publicUrl}?t=${Date.now()}` };
}
