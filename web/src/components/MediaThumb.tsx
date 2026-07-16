import React, { useRef, useState } from "react";
import { Play, Image as ImageIcon, Music2, FileQuestion } from "lucide-react";

// Reusable media tile content. Renders correctly for image / video / audio /
// unknown, surfaces a play-button overlay on videos, and previews-on-hover by
// muted-playing the video element.
//
// Drop in anywhere a media URL + mime are available.

export interface MediaThumbProps {
  url: string;
  mime: string;
  alt?: string;
  className?: string;
  // If true, draws a small "VIDEO" / "GIF" / "AUDIO" pill in the top-left.
  showKindPill?: boolean;
  // If true, plays on hover. Default true for video.
  hoverPreview?: boolean;
  // Loading hint for images.
  loading?: "eager" | "lazy";
  // Optional click handler — used by gallery overlays.
  onClick?: (e: React.MouseEvent) => void;
}

export default function MediaThumb({
  url, mime, alt = "", className = "",
  showKindPill = true,
  hoverPreview = true,
  loading = "lazy",
  onClick,
}: MediaThumbProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const isImg = mime.startsWith("image/");
  const isVid = mime.startsWith("video/");
  const isGif = mime === "image/gif";
  const isAud = mime.startsWith("audio/");

  const onEnter = () => {
    if (!hoverPreview || !isVid) return;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = true;
    v.playsInline = true;
    v.play().then(() => setIsPreviewing(true)).catch(() => {});
  };

  const onLeave = () => {
    if (!hoverPreview || !isVid) return;
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setIsPreviewing(false);
  };

  return (
    <div
      className={`relative w-full h-full overflow-hidden group ${className}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {isImg && !isGif && (
        <img src={url} alt={alt} loading={loading} className="w-full h-full object-cover" />
      )}
      {isGif && (
        <img src={url} alt={alt} loading={loading} className="w-full h-full object-cover" />
      )}
      {isVid && (
        <video
          ref={videoRef}
          src={url}
          muted
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      )}
      {isAud && (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-studio-bronze/30 to-studio-warm-black">
          <Music2 className="w-1/3 h-1/3 text-studio-bronze" />
        </div>
      )}
      {!isImg && !isVid && !isAud && (
        <div className="w-full h-full flex items-center justify-center bg-studio-warm-black/60">
          <FileQuestion className="w-1/3 h-1/3 text-studio-soft-white/30" />
        </div>
      )}

      {/* Play overlay for video. Fades out while previewing so the user can
          actually see the moving frames. */}
      {isVid && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-150
                         ${isPreviewing ? "opacity-0" : "opacity-100"} group-hover:opacity-0`}>
          <div className="rounded-full bg-black/55 backdrop-blur-sm w-12 h-12 flex items-center justify-center shadow-lg border border-white/15">
            <Play className="w-5 h-5 text-white fill-white translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Top-left kind pill */}
      {showKindPill && (isVid || isGif || isAud) && (
        <div className="absolute top-1.5 left-1.5 bg-black/65 text-white text-[9px] font-mono font-bold tracking-wide px-1.5 py-0.5 rounded uppercase pointer-events-none">
          {isVid ? "VIDEO" : isGif ? "GIF" : "AUDIO"}
        </div>
      )}

      {/* Bottom hairline pulse when hover-previewing */}
      {isPreviewing && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-studio-bronze/80 animate-pulse pointer-events-none" />
      )}
    </div>
  );
}
