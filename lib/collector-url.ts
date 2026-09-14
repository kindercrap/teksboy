export function collectorUrl(slug?: string, set = '') {
  return slug ? '/collectors/' + encodeURIComponent(slug) + (set ? '/' + encodeURIComponent(set) : '') : '/collectors';
}
