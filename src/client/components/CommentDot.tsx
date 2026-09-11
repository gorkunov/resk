export function CommentDot({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="comment-dot"
      aria-label="has comments"
      className={`absolute -top-1 -right-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-950 ${className}`}
    />
  );
}
