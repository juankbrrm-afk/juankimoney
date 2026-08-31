import { useEffect, useState } from "react";
import { recorder } from "@/studio/audio/recorder";

/** Nivel de entrada para el vumetro; solo corre mientras hace falta. */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let frame = 0;
    const loop = () => {
      setLevel(recorder.level());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return level;
}
