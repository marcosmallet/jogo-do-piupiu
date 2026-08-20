(() => {
  "use strict";
  // Mantém as camadas adicionais isoladas e carrega tudo de forma síncrona,
  // preservando a ordem necessária antes de DOMContentLoaded.
  document.write('<script src="aaa-core.js"><\/script><script src="horizontal-controls.js"><\/script><script src="multiplayer.js"><\/script>');
})();
