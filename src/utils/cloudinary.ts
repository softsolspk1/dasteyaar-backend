import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
}

/**
 * Upload image to Cloudinary
 * @param fileBuffer - Buffer of the file to upload
 * @param folder - Folder name in Cloudinary (default: 'DastEYaar/banners')
 * @returns Upload result with URL and public_id
 */
export async function uploadToCloudinary(
  fileBuffer: Buffer,
  folder: string = 'DastEYaar/banners'
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 675, crop: 'limit' }, // Max 1200x675 (16:9 aspect ratio)
          { quality: 'auto' },
          { fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
          });
        } else {
          reject(new Error('Upload failed'));
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete image from Cloudinary
 * @param publicId - The public_id of the image to delete
 * @returns Deletion result
 */
export async function deleteFromCloudinary(publicId: string): Promise<any> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
}

export default cloudinary;
