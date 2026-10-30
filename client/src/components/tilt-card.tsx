import type { ReactNode } from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glowOnHover?: boolean;
  "data-testid"?: string;
}

export function TiltCard({ children, className = "", "data-testid": testId }: TiltCardProps) {
  return <div className={className} data-testid={testId}>{children}</div>;
}
