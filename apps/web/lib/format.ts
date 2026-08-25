export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
export function words(value: string): string {
  return value.replaceAll("_", " ");
}
