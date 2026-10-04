// Minimal copy of persuasion-ecosystem lib/string-utils.ts safeSlice (UTF-16 safe).
export function safeSlice(str: string, max: number): string {
  if (str.length <= max) return str
  const sliced = str.slice(0, max)
  const last = sliced.charCodeAt(sliced.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) return sliced.slice(0, -1)
  return sliced
}
