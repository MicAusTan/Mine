// Theme picker + editor dialog. Edits preview live; Esc / Close reverts unless saved.
import { FIELDS, cleanTheme, loadState, saveState, allThemes, currentTheme, applyTheme } from './themes.js';

export function initThemes(onApply) {
  const $ = id => document.getElementById(id);
  const state = loadState();
  const isCustom = id => id in state.custom;
  const apply = t => { applyTheme(t); onApply(t); };

  for (const [k, label] of FIELDS) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="color" id="tf-${k}"> ${label}`;
    $('themeFields').appendChild(l);
  }

  function fillSelect() {
    const all = allThemes(state), sel = $('theme');
    if (!all[state.selected]) state.selected = 'classic';
    sel.innerHTML = '';
    for (const [id, t] of Object.entries(all)) sel.add(new Option(t.name, id));
    sel.value = state.selected;
  }

  function setInputs(t) {
    $('tName').value = t.name;
    for (const [k] of FIELDS) $('tf-' + k).value = t.vars[k];
    $('tBevel').value = t.bevel; $('tCell').value = t.cell; $('tRadius').value = t.radius;
    $('tFlag').value = t.flag; $('tMine').value = t.mine;
  }
  function readDraft() {
    return cleanTheme({
      name: $('tName').value,
      vars: Object.fromEntries(FIELDS.map(([k]) => [k, $('tf-' + k).value])),
      bevel: $('tBevel').value, cell: $('tCell').value, radius: $('tRadius').value,
      flag: $('tFlag').value, mine: $('tMine').value,
    });
  }
  function save(asNew) {
    const t = readDraft();
    const id = (!asNew && isCustom(state.selected)) ? state.selected : 'custom-' + Date.now();
    state.custom[id] = t; state.selected = id;
    saveState(state); fillSelect();
    $('themeDlg').close();
  }

  $('theme').onchange = () => { state.selected = $('theme').value; saveState(state); apply(currentTheme(state)); };
  $('themeEdit').onclick = () => {
    const t = currentTheme(state);
    setInputs({ ...t, name: isCustom(state.selected) ? t.name : 'My ' + t.name });
    $('tDelete').disabled = !isCustom(state.selected);
    $('themeDlg').showModal();
  };
  $('themeDlg').addEventListener('input', () => apply(readDraft()));
  $('themeDlg').addEventListener('close', () => apply(currentTheme(state))); // reverts unsaved previews
  $('tClose').onclick = () => $('themeDlg').close();
  $('tSave').onclick = () => save(false);
  $('tSaveNew').onclick = () => save(true);
  $('tDelete').onclick = () => {
    if (!isCustom(state.selected) || !confirm('Delete this theme?')) return;
    delete state.custom[state.selected]; state.selected = 'classic';
    saveState(state); fillSelect(); $('themeDlg').close();
  };
  $('tExport').onclick = async () => {
    const text = JSON.stringify(readDraft());
    try { await navigator.clipboard.writeText(text); alert('Theme copied to your clipboard.'); }
    catch { prompt('Copy this theme:', text); }
  };
  $('tImport').onclick = () => {
    const text = prompt('Paste a theme:');
    if (!text) return;
    try { const t = cleanTheme(JSON.parse(text)); setInputs(t); apply(t); }
    catch { alert("That doesn't look like a valid theme."); }
  };

  fillSelect();
  apply(currentTheme(state));
}
