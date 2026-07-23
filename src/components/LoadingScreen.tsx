import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { site } from "@/config/site";

export function LoadingScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ backgroundColor: "#0b0a09" }}
          animate={{ backgroundColor: "#0b0a09" }}
          exit={{ backgroundColor: "#f7f3ec" }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
        >
          <motion.span
            initial={{ opacity: 0, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, letterSpacing: "0.28em" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-lg font-semibold uppercase text-ivory"
          >
            {site.name}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
