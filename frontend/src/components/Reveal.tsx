import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Fades and lifts its children in the first time they scroll into view.
 *
 * IntersectionObserver rather than a scroll listener so the work is done by the
 * browser off the main thread, and it unobserves after the first trigger — the
 * content shouldn't re-animate every time it passes the fold.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Anyone who has asked for reduced motion gets the content, not the entrance.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(element);

    // Safety net: this wrapper starts its children at zero opacity, so anything
    // that stops the observer from ever firing would leave real content
    // permanently invisible rather than merely un-animated. Reveal regardless
    // after a few seconds — a section that animates in without being scrolled
    // to is a far better failure than a section nobody can read.
    const fallback = window.setTimeout(() => setIsVisible(true), 3000);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
