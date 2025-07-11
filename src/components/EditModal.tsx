import { useState, useEffect } from 'react';
import type { ImageFile } from "../App";

interface EditModalProps {
  image: ImageFile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (url: string, preset?: string, format?: 'png' | 'jpeg') => void;
}

const backgroundOptions = [
  { id: 'color', label: 'Solid Color' },
  { id: 'image', label: 'Image' }
];

const effectOptions = [
  { id: 'none', label: 'None' },
  { id: 'blur', label: 'Blur' },
  { id: 'brightness', label: 'Bright' },
  { id: 'contrast', label: 'Contrast' }
];

const predefinedColors = [
  '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#00ffff', '#ff00ff', '#808080', '#c0c0c0'
];

const predefinedPatterns = [
  { id: 'dots', label: 'Dots' },
  { id: 'lines', label: 'Lines' },
  { id: 'grid', label: 'Grid' },
  { id: 'waves', label: 'Waves' }
];

// Photo format presets
interface PhotoPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  minHeadWidth: number;
  maxHeadWidth: number;
  format: 'png' | 'jpeg';
  maxFileSize?: number; // in KB
  description: string;
}

const photoPresets: PhotoPreset[] = [
  {
    id: 'none',
    label: 'No Preset',
    width: 0,
    height: 0,
    minHeadWidth: 0,
    maxHeadWidth: 0,
    format: 'png',
    description: 'Keep original dimensions'
  },
  {
    id: 'china-visa',
    label: 'China Visa',
    width: 420,
    height: 560,
    minHeadWidth: 191,
    maxHeadWidth: 251,
    format: 'jpeg',
    maxFileSize: 120,
    description: '420×560px, JPEG, 40-120KB, head 191-251px wide'
  },
  {
    id: 'us-passport',
    label: 'US Passport',
    width: 600,
    height: 600,
    minHeadWidth: 330,
    maxHeadWidth: 420,
    format: 'jpeg',
    maxFileSize: 240,
    description: '600×600px, JPEG, head 330-420px wide'
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Profile',
    width: 400,
    height: 400,
    minHeadWidth: 200,
    maxHeadWidth: 320,
    format: 'jpeg',
    description: '400×400px, square format for social media'
  }
];

export function EditModal({ image, isOpen, onClose, onSave }: EditModalProps) {
  const [bgType, setBgType] = useState('color');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [customBgImage, setCustomBgImage] = useState<File | null>(null);
  const [selectedEffect, setSelectedEffect] = useState('none');
  const [blurValue, setBlurValue] = useState(50);
  const [brightnessValue, setBrightnessValue] = useState(50);
  const [contrastValue, setContrastValue] = useState(50);
  const [exportUrl, setExportUrl] = useState('');
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('none');
  const [cropArea, setCropArea] = useState<{x: number, y: number, width: number, height: number} | null>(null);

  const processedURL = image.processedFile ? URL.createObjectURL(image.processedFile) : '';

  useEffect(() => {
    if (image.processedFile) {
      applyChanges();
    }
  }, [bgType, bgColor, customBgImage, selectedEffect, blurValue, brightnessValue, contrastValue, selectedPreset, cropArea]);

  // Face detection helper
  const detectFace = async (img: HTMLImageElement): Promise<{x: number, y: number, width: number, height: number} | null> => {
    try {
      // Check if FaceDetector is available
      if ('FaceDetector' in window) {
        const faceDetector = new (window as any).FaceDetector();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const faces = await faceDetector.detect(canvas);
        if (faces && faces.length > 0) {
          const face = faces[0]; // Use the first detected face
          return {
            x: face.boundingBox.x,
            y: face.boundingBox.y,
            width: face.boundingBox.width,
            height: face.boundingBox.height
          };
        }
      }
    } catch (error) {
      console.warn('Face detection not available or failed:', error);
    }
    return null;
  };

  // Calculate optimal crop area for selected preset
  const calculateCropArea = async (img: HTMLImageElement, preset: PhotoPreset) => {
    if (preset.id === 'none') return null;
    
    const aspectRatio = preset.width / preset.height;
    const imgAspectRatio = img.width / img.height;
    
    // Try face detection first
    const face = await detectFace(img);
    
    let cropWidth: number, cropHeight: number, cropX: number, cropY: number;
    
    if (imgAspectRatio > aspectRatio) {
      // Image is wider than target aspect ratio
      cropHeight = img.height;
      cropWidth = cropHeight * aspectRatio;
      
      if (face) {
        // Position crop to center the face horizontally
        const faceCenterX = face.x + face.width / 2;
        cropX = Math.max(0, Math.min(img.width - cropWidth, faceCenterX - cropWidth / 2));
      } else {
        cropX = (img.width - cropWidth) / 2;
      }
      cropY = 0;
    } else {
      // Image is taller than target aspect ratio
      cropWidth = img.width;
      cropHeight = cropWidth / aspectRatio;
      cropX = 0;
      
      if (face) {
        // Position crop to place face in upper third (ideal for passport photos)
        const faceCenterY = face.y + face.height / 2;
        const idealFacePosition = cropHeight * 0.4; // Face at 40% from top
        cropY = Math.max(0, Math.min(img.height - cropHeight, faceCenterY - idealFacePosition));
      } else {
        cropY = (img.height - cropHeight) / 2;
      }
    }
    
    return {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight
    };
  };

  const handlePresetChange = async (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = photoPresets.find(p => p.id === presetId);
    
    if (preset && preset.id !== 'none' && image.processedFile) {
      const img = new Image();
      img.src = processedURL;
      await new Promise(resolve => img.onload = resolve);
      
      const cropArea = await calculateCropArea(img, preset);
      setCropArea(cropArea);
    } else {
      setCropArea(null);
    }
  };

  const getCurrentEffectValue = () => {
    switch (selectedEffect) {
      case 'blur':
        return blurValue;
      case 'brightness':
        return brightnessValue;
      case 'contrast':
        return contrastValue;
      default:
        return 50;
    }
  };

  const handleEffectValueChange = (value: number) => {
    switch (selectedEffect) {
      case 'blur':
        setBlurValue(value);
        break;
      case 'brightness':
        setBrightnessValue(value);
        break;
      case 'contrast':
        setContrastValue(value);
        break;
    }
  };

  const applyChanges = async () => {
    if (!image.processedFile) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.src = processedURL;
    await new Promise(resolve => img.onload = resolve);
    
    const preset = photoPresets.find(p => p.id === selectedPreset);
    
    // Set canvas dimensions based on preset or original image
    if (preset && preset.id !== 'none' && cropArea) {
      canvas.width = preset.width;
      canvas.height = preset.height;
    } else {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    
    // Apply background
    if (bgType === 'color') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgType === 'image' && customBgImage) {
      const bgImg = new Image();
      bgImg.src = URL.createObjectURL(customBgImage);
      await new Promise(resolve => bgImg.onload = resolve);
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    }
    
    // Draw the processed image (cropped if preset is selected)
    if (preset && preset.id !== 'none' && cropArea) {
      // Draw cropped and scaled image
      ctx.drawImage(
        img,
        cropArea.x, cropArea.y, cropArea.width, cropArea.height,
        0, 0, canvas.width, canvas.height
      );
    } else {
      // Draw original image
      ctx.drawImage(img, 0, 0);
    }
    
    // Apply effects
    if (selectedEffect !== 'none') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      switch (selectedEffect) {
        case 'blur':
          // Create a temporary canvas for blur effect
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) break;
          
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          
          // Draw current state to temp canvas
          tempCtx.drawImage(canvas, 0, 0);
          
          // Clear main canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Apply blur using CSS filter
          ctx.filter = `blur(${blurValue / 10}px)`;
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.filter = 'none';
          break;
          
        case 'brightness':
          for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, data[i] * (brightnessValue / 50));
            data[i + 1] = Math.min(255, data[i + 1] * (brightnessValue / 50));
            data[i + 2] = Math.min(255, data[i + 2] * (brightnessValue / 50));
          }
          ctx.putImageData(imageData, 0, 0);
          break;
          
        case 'contrast':
          const factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
          for (let i = 0; i < data.length; i += 4) {
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;
          }
          ctx.putImageData(imageData, 0, 0);
          break;
      }
    }
    
    // Export with appropriate format and quality
    let dataUrl: string;
    if (preset && preset.format === 'jpeg') {
      // For JPEG, use quality to meet file size requirements
      let quality = 0.9;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
      
      // If there's a max file size requirement, adjust quality
      if (preset.maxFileSize) {
        const targetSize = preset.maxFileSize * 1024; // Convert KB to bytes
        let attempts = 0;
        
        while (dataUrl.length * 0.75 > targetSize && quality > 0.1 && attempts < 10) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          attempts++;
        }
      }
    } else {
      dataUrl = canvas.toDataURL('image/png');
    }
    
    setExportUrl(dataUrl);
  };

  const handleDownload = () => {
    // Create download with proper format and filename
    const preset = photoPresets.find(p => p.id === selectedPreset);
    const fileExtension = preset && preset.format === 'jpeg' ? 'jpg' : 'png';
    const filename = preset && preset.id !== 'none' 
      ? `${preset.label.toLowerCase().replace(/\s+/g, '-')}-${image.id}.${fileExtension}`
      : `processed-${image.id}.${fileExtension}`;
    
    // Create download link
    const link = document.createElement('a');
    link.href = exportUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = () => {
    // Get current preset info
    const preset = photoPresets.find(p => p.id === selectedPreset);
    const format = preset?.format || 'png';
    
    // Update the parent with the new image URL and preset info
    onSave(exportUrl, selectedPreset, format);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Edit Image</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Photo Format</h3>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Select photo format preset"
              >
                {photoPresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              {selectedPreset !== 'none' && (
                <p className="text-xs text-gray-500 mt-1">
                  {photoPresets.find(p => p.id === selectedPreset)?.description}
                </p>
              )}
            </div>

            <div>
              <h3 className="font-medium text-gray-700 mb-2">Background</h3>
              <div className="flex gap-2 mb-4">
                {backgroundOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setBgType(option.id)}
                    className={`px-3 py-1 rounded ${
                      bgType === option.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    aria-label={`Select ${option.label} background type`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {bgType === 'color' && (
                <div>
                  <div className="flex gap-2 mb-2">
                    {predefinedColors.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setBgColor(color)}
                        className="w-8 h-8 rounded-full border border-gray-300"
                        style={{ backgroundColor: color }}
                        aria-label={`Select ${color} background color`}
                        title={`Background color: ${color}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setShowCustomColorPicker(!showCustomColorPicker)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-sm text-gray-700"
                    >
                      Custom Color
                    </button>
                    {showCustomColorPicker && (
                      <input
                        type="color"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="w-8 h-8 border border-gray-400 rounded-md hover:bg-blue-200"
                        aria-label="Custom background color picker"
                      />
                    )}
                  </div>
                </div>
              )}

              {bgType === 'image' && (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCustomBgImage(e.target.files?.[0] || null)}
                  className="w-full"
                  aria-label="Select background image file"
                />
              )}
            </div>

            <div>
              <h3 className="font-medium text-gray-700 mb-2">Effects</h3>
              <div className="flex gap-2 mb-4">
                {effectOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedEffect(option.id)}
                    className={`px-3 py-1 rounded ${
                      selectedEffect === option.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    aria-label={`Apply ${option.label} effect`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {selectedEffect !== 'none' && (
                <div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={getCurrentEffectValue()}
                    onChange={(e) => handleEffectValueChange(Number(e.target.value))}
                    className="w-full"
                    aria-label={`${selectedEffect} effect intensity`}
                  />
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>0</span>
                    <span>{getCurrentEffectValue()}</span>
                    <span>100</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-700 mb-2">Preview</h3>
            <div className="border rounded-lg overflow-hidden relative">
              <img
                src={exportUrl || processedURL}
                alt="Preview"
                className="w-full object-contain"
              />
            </div>
            {selectedPreset !== 'none' && (
              <div className="mt-2 text-xs text-gray-600">
                {photoPresets.find(p => p.id === selectedPreset)?.width} × {photoPresets.find(p => p.id === selectedPreset)?.height} pixels
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-between items-center">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-white bg-green-500 rounded hover:bg-green-600"
            disabled={!exportUrl}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-white bg-blue-500 rounded hover:bg-blue-600"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
