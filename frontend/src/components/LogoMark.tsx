interface LogoMarkProps {
  className?: string;
}

export function LogoMark({ className = '' }: LogoMarkProps) {
  return (
    <span className={`velora-logo-mark ${className}`.trim()} aria-hidden="true">
      <img src="/brand/velora-mark.png" alt="" />
    </span>
  );
}
