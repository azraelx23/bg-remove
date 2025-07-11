import Dexie, { Table } from 'dexie';

// Define the stored image interface
export interface StoredImage {
  id?: number;
  originalFile: Blob;
  processedFile?: Blob;
  fileName: string;
  lastPreset?: string;
  lastFormat?: 'png' | 'jpeg';
  createdAt: Date;
  updatedAt: Date;
}

// Create the database class
class ImageDatabase extends Dexie {
  images!: Table<StoredImage>;

  constructor() {
    super('BackgroundRemoverDB');
    
    // Define database schema
    this.version(1).stores({
      images: '++id, fileName, createdAt, updatedAt'
    });
  }
}

// Create database instance
export const db = new ImageDatabase();

// Database operations
export const imageStorage = {
  // Save or update an image
  async saveImage(
    originalFile: File,
    processedFile?: File,
    lastPreset?: string,
    lastFormat?: 'png' | 'jpeg'
  ): Promise<number> {
    const now = new Date();
    
    // Check if image already exists
    const existingImages = await db.images
      .where('fileName')
      .equals(originalFile.name)
      .toArray();
    
    const imageData: StoredImage = {
      originalFile: originalFile,
      processedFile: processedFile,
      fileName: originalFile.name,
      lastPreset,
      lastFormat,
      createdAt: existingImages.length > 0 ? existingImages[0].createdAt : now,
      updatedAt: now
    };
    
    if (existingImages.length > 0) {
      // Update existing image
      await db.images.update(existingImages[0].id!, imageData);
      return existingImages[0].id!;
    } else {
      // Add new image
      return await db.images.add(imageData);
    }
  },

  // Get all stored images
  async getImages(): Promise<StoredImage[]> {
    return await db.images.toArray();
  },

  // Get a specific image
  async getImage(id: number): Promise<StoredImage | undefined> {
    return await db.images.get(id);
  },

  // Delete a specific image
  async deleteImage(id: number): Promise<void> {
    await db.images.delete(id);
  },

  // Clear all images
  async clearAllImages(): Promise<void> {
    await db.images.clear();
  },

  // Get total storage size
  async getStorageSize(): Promise<number> {
    const images = await db.images.toArray();
    let totalSize = 0;
    
    for (const image of images) {
      totalSize += image.originalFile.size;
      if (image.processedFile) {
        totalSize += image.processedFile.size;
      }
    }
    
    return totalSize;
  },

  // Get storage info
  async getStorageInfo(): Promise<{
    count: number;
    totalSize: number;
    formattedSize: string;
  }> {
    const images = await db.images.toArray();
    const totalSize = await this.getStorageSize();
    
    return {
      count: images.length,
      totalSize,
      formattedSize: formatBytes(totalSize)
    };
  },

  // Clean up old images (older than specified days)
  async cleanupOldImages(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const oldImages = await db.images
      .where('updatedAt')
      .below(cutoffDate)
      .toArray();
    
    const idsToDelete = oldImages.map(img => img.id!);
    await db.images.bulkDelete(idsToDelete);
    
    return idsToDelete.length;
  }
};

// Helper function to format bytes
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Export database operations
export default imageStorage;