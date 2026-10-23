import { useEffect, useRef, useState } from "react";
import { SITE } from "../../config";
import { SCENES, type SceneName } from "./Scenes";

// A film slot: plays /videos/<name>.webm|.mp4 when configured in SITE.videos,
// otherwise (or on any load error) shows the animated stand-in scene.
// Off-screen slots pause, so only the visible film costs CPU.

export function VideoScene({ name, className, eager }: { name: SceneName; className?: string; eager?: boolean }) {
  const base = SITE.videos[name];
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(!!eager);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (visible) v.play().catch(() => undefined);
    else v.pause();
  }, [visible]);

  const Scene = SCENES[name];
  const useVideo = !!base && !failed;
  return (
    <div ref={box} className={`film${visible ? "" : " paused"} ${className ?? ""}`}>
      {useVideo ? (
        <video ref={vid} muted loop playsInline preload={eager ? "auto" : "metadata"} poster={`${base}.jpg`} onError={() => setFailed(true)}>
          <source src={`${base}.webm`} type="video/webm" />
          <source src={`${base}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
        </video>
      ) : (
        (visible || eager) && <Scene />
      )}
    </div>
  );
}
