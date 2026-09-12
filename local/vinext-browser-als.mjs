// Vinext beta.5: browser ALS stores are no-ops. Avoid nesting scope-exit
// callbacks across stores retained by repeated module evaluation / hot reload.
// Keep the server implementation untouched: its request isolation is required.
export default function vinextBrowserAls() {
  return {
    name: 'teksboy:vinext-browser-als',
    enforce: 'pre',
    transform(code, id) {
      if (this.environment?.name !== 'client' || !id.replaceAll('\\', '/').split('?')[0].endsWith('/vinext/dist/shims/internal/als-registry.js')) return null;
      const original = 'function runOutsideRequestScopes(fn) {';
      if (!code.includes(original)) this.error('Vinext ALS compatibility fix needs review after the dependency update.');
      return {code:code.replace(/function runOutsideRequestScopes\(fn\) \{[\s\S]*?\n\}/, original + '\n\t// Client async-context stores carry no request state.\n\treturn fn();\n}'), map:null};
    },
  };
}
