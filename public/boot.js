// Loaded synchronously in <head>. Settings arrive asynchronously, so without
// this a dark theme would flash white on every page load.
try {
  const theme = localStorage.getItem('mdt-theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);
} catch {
  // Storage can be blocked; the page simply starts in the default theme.
}
