import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon
} from 'lucide-react';

interface ImageLightboxModalProps {
  isOpen: boolean;
  photos: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  photos,
  initialIndex = 0,
  title = 'Photo Inspection',
  onClose
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Touch pinch tracking refs
  const initialPinchDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const lastTouchPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    initialPinchDistRef.current = null;
    lastTouchPosRef.current = null;
  }, []);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      resetView();
    }
  }, [isOpen, initialIndex, resetView]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (photos.length <= 1) return;
    resetView();
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length, resetView]);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (photos.length <= 1) return;
    resetView();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length, resetView]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  // Touch Handlers for Mobile (Pinch-to-zoom & Pan)
  const getTouchDistance = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Start pinch
      initialPinchDistRef.current = getTouchDistance(e.touches[0], e.touches[1]);
      initialZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      // Double tap detector
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap trigger
        if (zoom > 1) {
          resetView();
        } else {
          setZoom(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      // Start drag
      lastTouchPosRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      };
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current !== null) {
      // Multi-touch Pinch to Zoom
      const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = currentDist / initialPinchDistRef.current;
      const newZoom = Math.min(Math.max(initialZoomRef.current * scale, 1), 4.5);
      setZoom(newZoom);
      if (newZoom === 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && isDragging && zoom > 1 && lastTouchPosRef.current) {
      // 1-Finger Pan
      setPosition({
        x: e.touches[0].clientX - lastTouchPosRef.current.x,
        y: e.touches[0].clientY - lastTouchPosRef.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null;
    lastTouchPosRef.current = null;
    setIsDragging(false);
  };

  if (!isOpen || photos.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between p-3 sm:p-6 select-none animate-in fade-in duration-200"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
      }}
      onClick={onClose}
    >
      {/* Top Header & Zoom Controls */}
      <div
        className="w-full max-w-5xl mx-auto flex items-center justify-between text-white pb-3 border-b border-slate-800/80 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white leading-tight truncate">{title}</h4>
            <p className="text-xs text-slate-400">
              Photo {currentIndex + 1} of {photos.length}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 backdrop-blur-md px-2 py-1 rounded-xl shadow-lg text-white">
            <button
              type="button"
              onClick={() => {
                setZoom((prev) => {
                  const next = Math.max(prev - 0.5, 1);
                  if (next === 1) setPosition({ x: 0, y: 0 });
                  return next;
                });
              }}
              disabled={zoom <= 1}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-slate-300 hover:text-white"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={resetView}
              className="px-2 py-0.5 rounded text-xs font-mono font-bold text-indigo-400 hover:bg-white/10 transition"
              title="Reset Zoom"
            >
              {Math.round(zoom * 100)}%
            </button>

            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(prev + 0.5, 4.5))}
              disabled={zoom >= 4.5}
              className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-slate-300 hover:text-white"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-slate-700 mx-0.5" />

            <button
              type="button"
              onClick={() => setRotation((prev) => (prev + 90) % 360)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={resetView}
              className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
              title="Reset Fit"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700/60 shadow-md"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Zoom / Pan Viewport */}
      <div
        className="relative flex-1 flex items-center justify-center my-2 sm:my-4 overflow-hidden touch-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          if (e.deltaY < 0) {
            setZoom((prev) => Math.min(prev + 0.25, 4.5));
          } else {
            setZoom((prev) => {
              const next = Math.max(prev - 0.25, 1);
              if (next === 1) setPosition({ x: 0, y: 0 });
              return next;
            });
          }
        }}
        onMouseDown={(e) => {
          if (zoom > 1) {
            setIsDragging(true);
            setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
          }
        }}
        onMouseMove={(e) => {
          if (isDragging && zoom > 1) {
            setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
          }
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onDoubleClick={() => {
          if (zoom > 1) {
            resetView();
          } else {
            setZoom(2.5);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Prev Arrow */}
        {photos.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white transition shadow-xl border border-slate-700/60 hover:scale-110 active:scale-95"
            title="Previous Photo"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Scaled & Rotated Image */}
        <div className="max-h-[68vh] max-w-[90vw] flex items-center justify-center pointer-events-none">
          <img
            src={photos[currentIndex]}
            alt={`Photo ${currentIndex + 1}`}
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              touchAction: 'none'
            }}
            className="max-h-[65vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800/80 cursor-grab active:cursor-grabbing select-none pointer-events-auto"
          />
        </div>

        {/* Next Arrow */}
        {photos.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-6 z-20 p-3 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-white transition shadow-xl border border-slate-700/60 hover:scale-110 active:scale-95"
            title="Next Photo"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Filmstrip Thumbnails & Hint */}
      <div
        className="w-full max-w-xl mx-auto flex flex-col items-center gap-2 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <div className="flex items-center justify-center gap-2 overflow-x-auto max-w-full py-1 px-2">
            {photos.map((imgSrc, idx) => (
              <button
                key={idx}
                onClick={() => {
                  resetView();
                  setCurrentIndex(idx);
                }}
                className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 transition flex-shrink-0 ${
                  currentIndex === idx
                    ? 'border-indigo-500 ring-2 ring-indigo-400/50 scale-105'
                    : 'border-slate-800 opacity-60 hover:opacity-100'
                }`}
              >
                <img src={imgSrc} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 text-center select-none">
          💡 Pinch or scroll to zoom • Drag to pan • Double-tap to zoom in / reset
        </p>
      </div>
    </div>
  );
};
