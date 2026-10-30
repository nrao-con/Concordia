import type { ReactNode, CSSProperties } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PageTransition({ children, className, style }: PageTransitionProps) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
