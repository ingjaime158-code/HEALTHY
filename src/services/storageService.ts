import { supabase } from './supabaseClient';

// Allowed file types for product images
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_MB = 5;

export const uploadProductImage = async (file: File): Promise<string | null> => {
    try {
        // Validate file type
        const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
            console.error(`Tipo de archivo no permitido: .${fileExt}. Solo se aceptan: ${ALLOWED_EXTENSIONS.join(', ')}`);
            throw new Error(`Tipo de archivo no permitido. Solo se aceptan imágenes: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            console.error(`MIME type no permitido: ${file.type}`);
            throw new Error('El archivo no es una imagen válida.');
        }

        // Validate file size
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
            throw new Error(`El archivo es demasiado grande (${fileSizeMB.toFixed(1)} MB). Máximo: ${MAX_FILE_SIZE_MB} MB.`);
        }

        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error } = await supabase
            .storage
            .from('product-images')
            .upload(filePath, file);

        if (error) {
            console.error('Error uploading image:', error);
            return null;
        }

        const { data: { publicUrl } } = supabase
            .storage
            .from('product-images')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (e) {
        console.error('Upload exception:', e);
        throw e; // Re-throw so the UI can show the error message
    }
};
