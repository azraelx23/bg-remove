import { useState, useEffect } from 'react';
import imageStorage from '../lib/database';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCacheCleared: () => void;
}

export function SettingsModal({ isOpen, onClose, onCacheCleared }: SettingsModalProps) {
  const [storageInfo, setStorageInfo] = useState<{
    count: number;
    totalSize: number;
    formattedSize: string;
  }>({ count: 0, totalSize: 0, formattedSize: '0 Bytes' });
  
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Load storage info when modal opens
  useEffect(() => {
    if (isOpen) {
      loadStorageInfo();
    }
  }, [isOpen]);

  const loadStorageInfo = async () => {
    try {
      const info = await imageStorage.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await imageStorage.clearAllImages();
      setStorageInfo({ count: 0, totalSize: 0, formattedSize: '0 Bytes' });
      setShowClearConfirm(false);
      onCacheCleared();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleCleanupOld = async () => {
    try {
      const deletedCount = await imageStorage.cleanupOldImages(30);
      await loadStorageInfo();
      alert(`Cleaned up ${deletedCount} old images (older than 30 days)`);
    } catch (error) {
      console.error('Failed to cleanup old images:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Storage Information */}
          <div className="border-b pb-4">
            <h3 className="font-medium text-gray-700 mb-3">Local Storage</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Stored Images:</span>
                <span className="font-medium">{storageInfo.count}</span>
              </div>
              <div className="flex justify-between">
                <span>Storage Used:</span>
                <span className="font-medium">{storageInfo.formattedSize}</span>
              </div>
            </div>
          </div>

          {/* Cache Management */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700">Cache Management</h3>
            
            <button
              type="button"
              onClick={handleCleanupOld}
              className="w-full px-4 py-2 text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Clean Up Old Images (30+ days)
            </button>

            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="w-full px-4 py-2 text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              Clear All Cache
            </button>
          </div>

          {/* Information */}
          <div className="text-xs text-gray-500 border-t pt-4">
            <p>Images are stored locally in your browser using IndexedDB. 
            Clearing cache will permanently delete all stored images.</p>
          </div>
        </div>

        {/* Clear Cache Confirmation Dialog */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Clear All Cache?</h3>
              </div>
              
              <p className="text-gray-600 mb-6">
                This will permanently delete all {storageInfo.count} stored images 
                ({storageInfo.formattedSize} of data). This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  disabled={isClearing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearCache}
                  className="flex-1 px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                  disabled={isClearing}
                >
                  {isClearing ? 'Clearing...' : 'Clear All'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}