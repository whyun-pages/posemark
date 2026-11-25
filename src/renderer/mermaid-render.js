import { ctx } from './paths.js';

export function createMermaidRenderer(config, scriptPath = 'mermaid.js') {
  let loading;
  let configured = false;

  function load() {
    if (!loading) {
      // These windows load from file://. Use a classic script for the separate bundle.
      loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(scriptPath, window.location.href).href;
        script.onload = () => {
          script.remove();
          const mermaid = window.PosemarkMermaid?.default;
          if (mermaid) resolve(mermaid);
          else reject(new Error('Mermaid bundle did not load'));
        };
        script.onerror = () => {
          script.remove();
          reject(new Error('Could not load Mermaid bundle'));
        };
        document.head.appendChild(script);
      }).catch((err) => {
        loading = undefined;
        throw err;
      });
    }
    return loading;
  }

  return {
    invalidateConfig() {
      configured = false;
    },
    async render(id, source) {
      const mermaid = await load();
      if (!configured) {
        mermaid.initialize(config());
        configured = true;
      }
      return mermaid.render(id, source);
    },
  };
}

// Theme CSS takes precedence over preferences, then falls back to light / dark.
export const editorMermaid = createMermaidRenderer(() => {
  const style = getComputedStyle(document.body);
  const value = (name) => style.getPropertyValue(name).trim().replace(/^["']|["']$/g, '');
  const dark = document.body.classList.contains('theme-dark');
  const preference = ctx.config.mermaidTheme || 'auto';
  const theme = value('--mermaid-theme') || (preference !== 'auto' ? preference : dark ? 'dark' : 'default');
  const fontFamily = value('--mermaid-font-family') || 'inherit';
  const sequenceNumbers = value('--mermaid-sequence-numbers');
  const showSequenceNumbers = sequenceNumbers ? /^(on|true|1|yes)$/i.test(sequenceNumbers) : ctx.config.mermaidSequenceNumbers === true;
  const curve = value('--mermaid-flowchart-curve') || ctx.config.mermaidFlowchartCurve || 'basis';
  return { startOnLoad: false, securityLevel: 'loose', theme, fontFamily, sequence: { showSequenceNumbers }, flowchart: { curve } };
});
