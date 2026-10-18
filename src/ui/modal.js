// Tek modal: video oynatıcı, oyun kabini, gizli çekmece. Odak tuzağı, Esc, geri dönüş odağı.
import { $, bus } from '../utils.js';

let current = null;
const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,iframe,[tabindex]:not([tabindex="-1"])';

export function openModal({ title = '', body, actions = [], className = '', kind = 'generic', onClose } = {}) {
  if (current) current.close({ silent: true });
  const root = $('#modal'), frame = $('.modal__frame', root), titleEl = $('#modal-title'), actEl = $('.modal__actions', root), bodyEl = $('.modal__body', root);
  const restoreTo = document.activeElement;
  root.className = `modal ${className}`.trim(); root.dataset.kind = kind;
  titleEl.textContent = title; actEl.innerHTML = ''; bodyEl.innerHTML = '';
  for (const a of actions) actEl.append(a);
  if (typeof body === 'function') body(bodyEl); else if (body) bodyEl.append(body);
  root.hidden = false; document.body.classList.add('is-locked');

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key !== 'Tab') return;
    const f = Array.from(frame.querySelectorAll(FOCUSABLE)).filter(x => x.offsetParent !== null || x.tagName === 'IFRAME');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  };
  const onClick = e => { if (e.target.closest('[data-close]')) close() };
  document.addEventListener('keydown', onKey); root.addEventListener('click', onClick);

  function close({ silent = false } = {}) {
    if (current !== handle) return;
    document.removeEventListener('keydown', onKey); root.removeEventListener('click', onClick);
    bodyEl.querySelectorAll('video').forEach(v => { try { v.pause() } catch { } });
    bodyEl.innerHTML = ''; actEl.innerHTML = ''; root.hidden = true; document.body.classList.remove('is-locked');
    current = null;
    try { onClose?.() } catch { }
    if (!silent) bus.emit('modal:close', { kind });
    if (restoreTo && typeof restoreTo.focus === 'function') restoreTo.focus({ preventScroll: true });
  }
  const handle = { close, el: root, frame, body: bodyEl };
  current = handle;
  requestAnimationFrame(() => { const f = frame.querySelector('.modal__body ' + FOCUSABLE) || frame.querySelector('.modal__close'); f?.focus({ preventScroll: true }) });
  bus.emit('modal:open', { kind, frame });
  return handle;
}
export const closeModal = () => current?.close();
export const modalFrame = () => (current ? current.frame : null);
export const modalKind = () => (current ? current.el.dataset.kind : null);
