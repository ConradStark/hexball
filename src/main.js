// v2.26.1: show any script error on screen (so a phone tester can report it instead of a frozen screen)
function showErr(m) {
  try {
    let el = document.getElementById('errbar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'errbar';
      el.setAttribute('role', 'alert');
      el.style.cssText =
        'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;padding:8px 10px;border-radius:8px;background:#7f1d1d;color:#fff;font:12px/1.35 system-ui,sans-serif;word-break:break-word';
      document.body.appendChild(el);
    }
    el.textContent = 'Error: ' + m;
  } catch (e) {}
}
window.addEventListener('error', (e) => showErr((e.message || e) + (e.lineno ? ' @' + e.lineno + ':' + e.colno : '')));
window.addEventListener('unhandledrejection', (e) => showErr(e.reason && (e.reason.stack || e.reason.message || e.reason)));
initBoard();
S = makeState('cpu');
kickoff('H');
render();
showContinue();
// game log: copy / load a saved state
$('#copyState').addEventListener('click', () => copyState());
const openLoad = () => openStateBox('', true);
$('#loadState').addEventListener('click', openLoad);
$('#loadState2').addEventListener('click', openLoad);
$('#statebox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sb]');
  if (!b) return;
  const box = $('#statebox');
  if (b.dataset.sb === 'close') box.hidden = true;
  if (b.dataset.sb === 'load') {
    const err = loadState(box.querySelector('textarea').value);
    box.querySelector('.sb-err').textContent = err || '';
    if (!err) box.hidden = true;
  }
});
document
  .querySelectorAll('[data-scn]')
  .forEach((b) => b.addEventListener('click', () => loadScenario(b.dataset.scn, b.dataset.scm)));
$('#scnend').addEventListener('click', (e) => {
  const b = e.target.closest('[data-se]');
  if (!b) return;
  if (b.dataset.se === 'menu') {
    $('#scnend').hidden = true;
    showStart();
    return;
  }
  scenarioRetry(b.dataset.se === 'new');
});
