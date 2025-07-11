# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server (uses Vite)
- `npm run build` - Build for production
- `npm run lint` - Run ESLint checks
- `npm run preview` - Preview production build

## Architecture Overview

This is a React + Vite application that removes backgrounds from images using machine learning models directly in the browser.

### Core Components

- **App.tsx** - Main application component that handles file uploads, model initialization, and UI state management
- **lib/process.ts** - Core ML processing logic that manages model loading and image processing using Transformers.js
- **components/Images.tsx** - Gallery component for displaying processed images with edit/download actions
- **components/EditModal.tsx** - Modal for editing processed images (background colors, effects, custom backgrounds)

### ML Model Strategy

The application implements a dual-model approach:

1. **Default (Cross-browser)**: Uses RMBG-1.4 model via WebAssembly for maximum compatibility
2. **WebGPU Acceleration**: Optional MODNet model for browsers with WebGPU support
3. **iOS Optimization**: Automatically uses RMBG-1.4 with specific configurations for iOS devices

### Key Technical Details

- **Model Loading**: Deferred initialization - models are only loaded when first image is uploaded
- **WebGPU Detection**: Dynamic capability detection with graceful fallback to WebAssembly
- **Image Processing**: Uses Canvas API for alpha channel manipulation and background replacement
- **File Handling**: Supports drag-and-drop, paste, and sample image selection
- **Local Processing**: All processing happens client-side, no server uploads

### State Management

- Model state is managed in `lib/process.ts` with singleton pattern
- UI state (images, processing status, errors) managed in React components
- Dynamic model switching supported for WebGPU-capable browsers

### Dependencies of Note

- `@huggingface/transformers` - Core ML inference library
- `dexie` + `dexie-react-hooks` - IndexedDB management for local file caching
- `react-dropzone` - File upload handling
- `file-saver` - Download functionality

### Build Configuration

- Vite config optimized for ML models with custom chunk splitting
- ESLint configured for React + hooks
- TailwindCSS for styling
- ES2020 target for BigInt support required by ML models