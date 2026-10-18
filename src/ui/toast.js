let timer = 0;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('is-on');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('is-on'), ms);
}
