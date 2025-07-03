export function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "Now";
  if (diffMin < 60) return `${diffMin}min`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  
  const isSameYear = now.getFullYear() === date.getFullYear();
  if (isSameYear) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } else {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
}