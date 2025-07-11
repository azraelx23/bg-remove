import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Images } from "./components/Images";
import { SettingsModal } from "./components/SettingsModal";
import { CameraPreview } from "./components/CameraPreview";
import { processImages, initializeModel, getModelInfo } from "../lib/process";
import imageStorage, { StoredImage } from "./lib/database";

interface AppError {
  message: string;
}

export interface ImageFile {
  id: number;
  file: File;
  processedFile?: File;
  lastPreset?: string;
  lastFormat?: 'png' | 'jpeg';
}

// Sample images from Unsplash
const sampleImages = [
  "https://images.unsplash.com/photo-1601233749202-95d04d5b3c00?q=80&w=2938&auto=format&fit=crop&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1513013156887-d2bf241c8c82?q=80&w=2970&auto=format&fit=crop&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1643490745745-e8ca9a3a1c90?q=80&w=2874&auto=format&fit=crop&ixlib=rb-4.0.3",
  "https://images.unsplash.com/photo-1574158622682-e40e69881006?q=80&w=2333&auto=format&fit=crop&ixlib=rb-4.0.3"
];

// Check if the user is on mobile Safari
const isMobileSafari = () => {
  const ua = window.navigator.userAgent;
  const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
  const webkit = !!ua.match(/WebKit/i);
  const iOSSafari = iOS && webkit && !ua.match(/CriOS/i) && !ua.match(/OPiOS/i) && !ua.match(/FxiOS/i);
  return iOSSafari && 'ontouchend' in document;
};

// Check if the user is on a mobile device
const isMobileDevice = () => {
  const ua = window.navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return isMobile || (isTouchDevice && window.innerWidth <= 768);
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [isWebGPU, setIsWebGPU] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [currentModel, setCurrentModel] = useState<'briaai/RMBG-1.4' | 'Xenova/modnet'>('briaai/RMBG-1.4');
  const [isModelSwitching, setIsModelSwitching] = useState(false);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [isCameraSupported, setIsCameraSupported] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert StoredImage to ImageFile
  const storedImageToImageFile = (storedImage: StoredImage): ImageFile => {
    return {
      id: storedImage.id!,
      file: new File([storedImage.originalFile], storedImage.fileName, {
        type: storedImage.originalFile.type,
        lastModified: storedImage.createdAt.getTime()
      }),
      processedFile: storedImage.processedFile 
        ? new File([storedImage.processedFile], storedImage.fileName, {
            type: storedImage.processedFile.type,
            lastModified: storedImage.updatedAt.getTime()
          })
        : undefined,
      lastPreset: storedImage.lastPreset,
      lastFormat: storedImage.lastFormat
    };
  };

  // Load stored images on mount
  const loadStoredImages = async () => {
    try {
      const storedImages = await imageStorage.getImages();
      const imageFiles = storedImages.map(storedImageToImageFile);
      setImages(imageFiles);
    } catch (error) {
      console.error('Failed to load stored images:', error);
    }
  };

  useEffect(() => {
    if (isMobileSafari()) {
      window.location.href = 'https://bg-mobile.addy.ie';
      return;
    }

    // Check if on mobile device
    setIsMobile(isMobileDevice());

    // Only check iOS on load since that won't change
    const { isIOS: isIOSDevice } = getModelInfo();
    setIsIOS(isIOSDevice);
    setIsLoading(false);

    // Load stored images
    loadStoredImages();

    // Check camera support
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setIsCameraSupported(true);
    }
  }, []);

  const handleModelChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = event.target.value as typeof currentModel;
    setIsModelSwitching(true);
    setError(null);
    try {
      const initialized = await initializeModel(newModel);
      if (!initialized) {
        throw new Error("Failed to initialize new model");
      }
      setCurrentModel(newModel);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Falling back")) {
        setCurrentModel('briaai/RMBG-1.4');
      } else {
        setError({
          message: err instanceof Error ? err.message : "Failed to switch models"
        });
      }
    } finally {
      setIsModelSwitching(false);
    }
  };

  // Camera capture function - mobile vs desktop
  const handleCameraCapture = () => {
    if (isMobile) {
      // On mobile, trigger the hidden camera input to open native camera app
      const cameraInput = document.getElementById('mobile-camera-input') as HTMLInputElement;
      if (cameraInput) {
        cameraInput.click();
      }
    } else {
      // On desktop, show camera preview modal
      setShowCameraPreview(true);
    }
  };

  // Handle photo capture from camera preview (desktop)
  const handlePhotoCapture = (file: File) => {
    setShowCameraPreview(false);
    onDrop([file]);
  };

  // Handle mobile camera input change
  const handleMobileCameraChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onDrop(Array.from(files));
    }
    // Reset the input so the same image can be selected again
    event.target.value = '';
  };

  // Resize image to optimize ML processing performance
  const resizeImageForProcessing = async (file: File, maxHeight: number = 512): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions maintaining aspect ratio
        const aspectRatio = img.width / img.height;
        let newWidth: number, newHeight: number;
        
        if (img.height > maxHeight) {
          newHeight = maxHeight;
          newWidth = Math.round(maxHeight * aspectRatio);
        } else {
          // If image is already smaller, keep original size
          newWidth = img.width;
          newHeight = img.height;
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(file); // Return original if canvas fails
          return;
        }
        
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Draw resized image
        ctx.drawImage(img, 0, 0, newWidth, newHeight);
        
        // Convert back to file
        canvas.toBlob((blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: file.lastModified,
            });
            resolve(resizedFile);
          } else {
            resolve(file); // Return original if blob fails
          }
        }, file.type, 0.9);
      };
      
      img.onerror = () => {
        resolve(file); // Return original if image loading fails
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Resize images for better ML processing performance
    const resizedFiles = await Promise.all(
      acceptedFiles.map(file => resizeImageForProcessing(file))
    );
    
    const newImages = resizedFiles.map((file, index) => ({
      id: Date.now() + index,
      file,
      processedFile: undefined
    }));
    setImages(prev => [...prev, ...newImages]);
    
    // Initialize model if this is the first image
    if (images.length === 0) {
      setIsLoading(true);
      setError(null);
      try {
        const initialized = await initializeModel();
        if (!initialized) {
          throw new Error("Failed to initialize background removal model");
        }
        // Update WebGPU support status after model initialization
        const { isWebGPUSupported } = getModelInfo();
        setIsWebGPU(isWebGPUSupported);
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : "An unknown error occurred"
        });
        setImages([]); // Clear the newly added images if model fails to load
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    }
    
    for (const image of newImages) {
      try {
        // Save resized image to database first
        const dbId = await imageStorage.saveImage(image.file);
        
        const result = await processImages([image.file]);
        if (result && result.length > 0) {
          // Update with processed file
          const updatedImage = { ...image, processedFile: result[0] };
          setImages(prev => prev.map(img =>
            img.id === image.id
              ? updatedImage
              : img
          ));
          
          // Save processed image to database
          await imageStorage.saveImage(image.file, result[0]);
        }
      } catch (error) {
        console.error('Error processing image:', error);
      }
    }
  }, [images.length]);


  const handlePaste = async (event: React.ClipboardEvent) => {
    const clipboardItems = event.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of clipboardItems) {
      if (item.type.startsWith("image")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length > 0) {
      onDrop(imageFiles);
    }
  };  

  const handleSampleImageClick = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], 'sample-image.jpg', { type: 'image/jpeg' });
      onDrop([file]);
    } catch (error) {
      console.error('Error loading sample image:', error);
    }
  };

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
  } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpeg", ".jpg", ".png", ".mp4"],
    },
  });

  // Remove the full screen error and loading states

  return (
    <div className="min-h-screen bg-gray-50" onPaste={handlePaste}>
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">
              BG
            </h1>
            <div className="flex items-center gap-4">
              {!isIOS && (
                <>
                  <span className="text-gray-600">Model:</span>
                  <select
                    value={currentModel}
                    onChange={handleModelChange}
                    className="bg-white border border-gray-300 rounded-md px-3 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={!isWebGPU}
                    aria-label="Select AI model for background removal"
                  >
                    <option value="briaai/RMBG-1.4">RMBG-1.4 (Cross-browser)</option>
                    {isWebGPU && (
                      <option value="Xenova/modnet">MODNet (WebGPU)</option>
                    )}
                  </select>
                </>
              )}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
          {isIOS && (
            <p className="text-sm text-gray-500 mt-2">
              Using optimized iOS background removal
            </p>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className={`grid ${images.length === 0 ? 'grid-cols-2 gap-8' : 'grid-cols-1'}`}>
          {images.length === 0 && (
            <div className="flex flex-col justify-center items-start">
              <img 
                src="hero.png"
                alt="Surprised man"
                className="mb-6 w-full object-cover h-[400px]"
              />
              <h2 className="text-3xl font-bold text-gray-800 mb-4">
                Remove Image Background
              </h2>
              <p className="text-lg text-gray-600 mb-4">
                100% Automatically and Free
              </p>
              <p className="text-gray-500">
                Upload your image and let our AI remove the background instantly. Perfect for professional photos, product images, and more.
              </p>
              <p className="text-sm text-gray-300 mt-4">
                Built with love by Addy Osmani using Transformers.js
              </p>
            </div>
          )}
          
          <div className={images.length === 0 ? '' : 'w-full'}>
            <div
              {...getRootProps()}
              className={`p-8 mb-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-300 ease-in-out bg-white
                ${isDragAccept ? "border-green-500 bg-green-50" : ""}
                ${isDragReject ? "border-red-500 bg-red-50" : ""}
                ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-500 hover:bg-blue-50"}
                ${isLoading || isModelSwitching ? "cursor-not-allowed" : ""}
              `}
            >
              <input {...getInputProps()} ref={fileInputRef} className="hidden" disabled={isLoading || isModelSwitching} />
              <div className="flex flex-col items-center gap-2">
                {isLoading || isModelSwitching ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mb-2"></div>
                    <p className="text-lg text-gray-600">
                      {isModelSwitching ? 'Switching models...' : 'Loading background removal model...'}
                    </p>
                  </>
                ) : error ? (
                  <>
                    <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-lg text-red-600 font-medium mb-2">{error.message}</p>
                    {currentModel === 'Xenova/modnet' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleModelChange({ target: { value: 'briaai/RMBG-1.4' }} as any);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Switch to Cross-browser Version
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-lg text-gray-600">
                      {isDragActive
                        ? "Drop the images here..."
                        : "Drag and drop images here"}
                    </p>
                    <p className="text-sm text-gray-500">or use the options below</p>
                    
                    <div className="mt-4 flex flex-col sm:flex-row gap-3 items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Select Files
                      </button>
                      
                      {isCameraSupported && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCameraCapture();
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Take Photo
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {images.length === 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="text-xl text-gray-700 font-semibold mb-4">No image? Try one of these:</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {sampleImages.map((url, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSampleImageClick(url)}
                      className="relative aspect-square overflow-hidden rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <img
                        src={url}
                        alt={`Sample ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  All images are processed locally on your device and are not uploaded to any server.
                </p>
              </div>
            )}

            <Images 
              images={images} 
              onDelete={async (id) => {
                setImages(prev => prev.filter(img => img.id !== id));
                
                // Remove from database
                try {
                  await imageStorage.deleteImage(id);
                } catch (error) {
                  console.error('Failed to delete image from storage:', error);
                }
              }}
              onImageUpdate={async (id, updates) => {
                setImages(prev => prev.map(img => 
                  img.id === id ? { ...img, ...updates } : img
                ));
                
                // Save updates to database
                try {
                  const updatedImage = images.find(img => img.id === id);
                  if (updatedImage) {
                    await imageStorage.saveImage(
                      updatedImage.file, 
                      updatedImage.processedFile,
                      updates.lastPreset || updatedImage.lastPreset,
                      updates.lastFormat || updatedImage.lastFormat
                    );
                  }
                } catch (error) {
                  console.error('Failed to save image updates:', error);
                }
              }}
            />
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onCacheCleared={() => {
          setImages([]);
          setShowSettings(false);
        }}
      />

      {/* Camera Preview Modal - Desktop only */}
      {!isMobile && (
        <CameraPreview
          isOpen={showCameraPreview}
          onClose={() => setShowCameraPreview(false)}
          onCapture={handlePhotoCapture}
        />
      )}

      {/* Hidden Mobile Camera Input */}
      {isMobile && (
        <input
          id="mobile-camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleMobileCameraChange}
          className="hidden"
        />
      )}
    </div>
  );
}
