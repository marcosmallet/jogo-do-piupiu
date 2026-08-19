(() => {
  "use strict";
  // Mantém a camada AAA original isolada e carrega o suporte horizontal de forma
  // síncrona, preservando a ordem necessária antes de DOMContentLoaded.
  document.write('<script src="aaa-core.js"><\/script><script src="horizontal-controls.js"><\/script>');
})();
