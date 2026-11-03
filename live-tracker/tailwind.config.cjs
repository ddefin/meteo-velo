/** Palette pilotée par variables CSS => thème sombre (défaut) / clair sans recompiler. */
const c = n => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: { bg: c('bg'), panel: c('panel'), panel2: c('panel2'), line: c('line'), fg: c('fg'), mute: c('mute'), neon: c('neon'), cyan: c('cyan'), warn: c('warn'), bad: c('bad') },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'], mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
};
