import { createStoredZip } from './profiles-zip.mjs';

const list = document.querySelector('#profile-list');
const search = document.querySelector('#profile-search');
const game = document.querySelector('#profile-game');
const status = document.querySelector('#profile-status');
const empty = document.querySelector('#profile-empty');
const count = document.querySelector('#selection-count');
const selectShown = document.querySelector('#select-shown');
const clear = document.querySelector('#clear-selection');
const download = document.querySelector('#download-selected');
const downloadStatus = document.querySelector('#download-status');
const selected = new Set();
let profiles = [];
let visible = [];
let busy = false;
const node = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text != null) item.textContent = text;
  if (className) item.className = className;
  return item;
};

function updateSelection() {
  count.textContent = `${selected.size} selected`;
  clear.disabled = busy || selected.size === 0;
  download.disabled = busy || selected.size === 0;
  selectShown.disabled = busy || visible.length === 0;
  search.disabled = game.disabled = busy;
  list.querySelectorAll('input').forEach(input => {
    input.checked = selected.has(input.value);
    input.disabled = busy;
    input.closest('.profile-card').classList.toggle('is-selected', input.checked);
  });
  status.textContent = `${visible.length} of ${profiles.length} profiles shown · ${selected.size} selected.`;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase();
  visible = profiles.filter(profile => (!game.value || profile.game === game.value)
    && (!query || `${profile.displayName} ${profile.game} ${profile.category} ${profile.kind} ${profile.deviceClass} ${profile.file}`.toLocaleLowerCase().includes(query)));
  list.replaceChildren();
  for (const profile of visible) {
    const card = node('article', null, 'profile-card');
    card.dataset.game = profile.game;
    const label = node('label');
    const input = node('input');
    input.type = 'checkbox'; input.value = profile.file;
    input.setAttribute('aria-label', `Select ${profile.displayName} — ${profile.game}`);
    input.addEventListener('change', () => {
      if (input.checked) selected.add(profile.file); else selected.delete(profile.file);
      updateSelection();
    });
    const copy = node('span', null, 'profile-copy');
    copy.append(node('span', profile.game === 'Class presets' ? 'Other class presets' : profile.game, 'profile-game'));
    const title = node('span', profile.displayName, 'profile-title');
    title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '3');
    copy.append(title);
    copy.append(node('span', `${profile.kind}${profile.category !== profile.kind && profile.category !== profile.displayName ? ` · ${profile.category}` : ''}`, 'profile-context'));
    copy.append(node('span', `${profile.deviceManufacturer} ${profile.deviceClass}`, 'profile-device'));
    label.append(input, copy); card.append(label);
    if (profile.note) card.append(node('p', profile.note, 'profile-note'));
    const details = node('details'); details.append(node('summary', 'Original file'));
    details.append(node('p', profile.file)); card.append(details);
    const footer = node('div', null, 'profile-download');
    const link = node('a', 'Download XML'); link.href = profile.url; link.download = profile.file;
    link.setAttribute('aria-label', `Download ${profile.displayName} XML`);
    footer.append(link, node('span', `${(profile.bytes / 1024).toFixed(1)} KB`)); card.append(footer);
    list.append(card);
  }
  empty.hidden = visible.length !== 0;
  list.hidden = visible.length === 0;
  updateSelection();
}

search.addEventListener('input', render);
game.addEventListener('change', render);
selectShown.addEventListener('click', () => { visible.forEach(profile => selected.add(profile.file)); updateSelection(); });
clear.addEventListener('click', () => { selected.clear(); updateSelection(); downloadStatus.textContent = 'Selection cleared.'; });

download.addEventListener('click', async () => {
  if (busy || selected.size === 0) return;
  const collection = profiles.filter(profile => selected.has(profile.file));
  const returnFocus = document.activeElement === download;
  busy = true; updateSelection(); download.textContent = 'Preparing ZIP…';
  downloadStatus.textContent = `Preparing ${collection.length} selected profiles…`;
  try {
    const files = [];
    for (const profile of collection) {
      const response = await fetch(profile.url);
      if (!response.ok) throw new Error('A profile could not be fetched.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== profile.bytes) throw new Error('Incomplete profile file.');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== profile.sha256) throw new Error('Profile integrity mismatch.');
      files.push({ name: profile.file, bytes });
    }
    const blob = new Blob([createStoredZip(files)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = node('a'); anchor.href = url; anchor.download = 'RookForce-Selected-Profiles.zip';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    downloadStatus.textContent = `ZIP ready with ${collection.length} profiles. Your selection is kept.`;
  } catch {
    downloadStatus.textContent = 'The ZIP could not be prepared. Your selection is kept. Retry or download the XML files individually.';
  } finally {
    busy = false; updateSelection(); download.textContent = 'Download selected ZIP';
    if (returnFocus) download.focus();
  }
});

fetch('profiles/manifest.json').then(response => {
  if (!response.ok) throw new Error('Profile list unavailable.');
  return response.json();
}).then(manifest => {
  if (!Array.isArray(manifest.profiles) || manifest.profiles.length !== manifest.count || manifest.count === 0) throw new Error('Profile list incomplete.');
  const seen = new Set();
  for (const profile of manifest.profiles) {
    if (typeof profile.file !== 'string' || /[\\/\x00-\x1f<>:"|?*]/.test(profile.file) || !profile.file.endsWith('.xml')
      || profile.url !== `profiles/xml/${encodeURIComponent(profile.file)}` || !Number.isInteger(profile.bytes) || profile.bytes <= 0
      || !/^[a-f0-9]{64}$/.test(profile.sha256) || seen.has(profile.file.toLowerCase())) throw new Error('Invalid profile entry.');
    seen.add(profile.file.toLowerCase());
  }
  profiles = manifest.profiles; render();
}).catch(() => {
  status.textContent = 'The profile list could not be loaded. Reload to retry, or use Download all ZIP above.';
  search.disabled = game.disabled = true;
});
