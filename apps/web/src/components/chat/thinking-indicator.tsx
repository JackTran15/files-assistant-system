export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-3 max-w-md">
      <div className="flex items-center gap-1">
        <span
          className="h-2 w-2 rounded-full bg-primary animate-bounce-dot"
          style={{ animationDelay: '0s' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-primary animate-bounce-dot"
          style={{ animationDelay: '0.16s' }}
        />
        <span
          className="h-2 w-2 rounded-full bg-primary animate-bounce-dot"
          style={{ animationDelay: '0.32s' }}
        />
      </div>
      <span className="text-sm text-muted-foreground">AI is thinking...</span>
    </div>
  );
}
