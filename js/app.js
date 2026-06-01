const MODEL = 'gpt-4o';
let journal = JSON.parse(localStorage.getItem('vinoscan_journal') || '[]');
let currentResult = null;
let capturedBlob = null;

// --- API Key management ---
function getApiKey() {
  let key = localStorage.getItem('vinoscan_api_key');
  if (!key) {
    showModal('Потрібен ключ', 'Перейдіть у вкладку ⚙️ Налаштування та вставте ваш OpenAI API-ключ.');
    return null;
  }
  return key;
}

// --- Tab switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'reference') renderReference();
    if (tab.dataset.tab === 'journal') renderJournal();
  });
});

// --- Camera ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const fileInput = document.getElementById('file-input');

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } } });
    video.srcObject = stream;
  } catch(e) {
    // Inline notification — не блокує UI
    const area = document.querySelector('.camera-area');
    const notice = document.createElement('p');
    notice.style.cssText = 'color:var(--muted);font-size:.85rem;margin-top:8px';
    notice.textContent = 'ℹ️ Камера недоступна, використовуйте галерею.';
    area.appendChild(notice);
  }
}
startCamera();

document.getElementById('btn-camera').addEventListener('click', () => {
  if (!video.srcObject) { showModal('Увага', 'Камера не активна'); return; }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(b => { capturedBlob = b; analyzePhoto(b); }, 'image/jpeg', 0.85);
});

document.getElementById('btn-gallery').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  capturedBlob = file;
  analyzePhoto(file);
});

// --- GPT-4o Vision ---
async function analyzePhoto(blob) {
  const apiKey = getApiKey();
  if (!apiKey) { showModal('Потрібен ключ', 'Налаштуйте API-ключ у вкладці ⚙️ Налаштування'); return; }
  
  showLoading(true);
  document.getElementById('result-card').classList.add('hidden');
  
  const base64 = await blobToBase64(blob);
  const dataUrl = base64.split(',')[1];
  
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Ти — агроном-виноградар. Проаналізуй фото виноградного листя. Визнач: 1) хворобу, шкідника або дефіцит елементів; 2) симптоми; 3) конкретні препарати та дози для обробки. Відповідай українською у форматі:\nДіагноз: <назва>\nСимптоми: <перелік>\nРекомендації з обробки: <препарати, дози, періодичність>` },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
          ]
        }]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'API error');
    const text = data.choices[0].message.content;
    parseResult(text);
  } catch(e) {
    showModal('Помилка аналізу', e.message);
    showLoading(false);
  }
}

function parseResult(text) {
  const titleMatch = text.match(/Діагноз:\s*(.+)/i);
  const sympMatch = text.match(/Симптоми:\s*(.+)/i);
  const treatMatch = text.match(/Рекомендації з обробки:\s*(.+)/s);
  
  currentResult = {
    title: titleMatch ? titleMatch[1].trim() : 'Визначено порушення',
    symptoms: sympMatch ? sympMatch[1].trim() : '—',
    treatment: treatMatch ? treatMatch[1].trim() : '—',
    raw: text,
    date: new Date().toISOString()
  };
  
  document.getElementById('result-title').textContent = `🔍 ${currentResult.title}`;
  document.getElementById('result-desc').textContent = currentResult.symptoms;
  const tb = document.getElementById('treatment-box');
  document.getElementById('treatment-text').textContent = currentResult.treatment;
  tb.classList.remove('hidden');
  document.getElementById('result-card').classList.remove('hidden');
  showLoading(false);
  document.getElementById('result-card').scrollIntoView({ behavior: 'smooth' });
}

// --- Save ---
document.getElementById('btn-save').addEventListener('click', () => {
  if (!currentResult) return;
  journal.unshift(currentResult);
  localStorage.setItem('vinoscan_journal', JSON.stringify(journal));
  showModal('Збережено', 'Запис додано до журналу.');
});

document.getElementById('btn-new').addEventListener('click', () => {
  currentResult = null;
  capturedBlob = null;
  document.getElementById('result-card').classList.add('hidden');
});

// --- Reference ---
function renderReference() {
  const list = document.getElementById('ref-list');
  list.innerHTML = REFERENCE.map(r => `
    <div class="ref-item" data-id="${r.id}">
      <h3>${r.name}</h3>
      <p>${r.type === 'хвороба' ? '🦠' : r.type === 'шкідник' ? '🐛' : '🧪'} ${r.type}</p>
    </div>
  `).join('');
  list.querySelectorAll('.ref-item').forEach(el => {
    el.addEventListener('click', () => showRefDetail(el.dataset.id));
  });
}

document.getElementById('ref-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.ref-item').forEach(el => {
    const name = el.querySelector('h3').textContent.toLowerCase();
    el.style.display = name.includes(q) ? 'flex' : 'none';
  });
});

document.getElementById('ref-back').addEventListener('click', () => {
  document.getElementById('ref-list').classList.remove('hidden');
  document.getElementById('ref-detail').classList.add('hidden');
});

function showRefDetail(id) {
  const item = REFERENCE.find(r => r.id === id);
  if (!item) return;
  document.getElementById('ref-list').classList.add('hidden');
  document.getElementById('ref-detail').classList.remove('hidden');
  document.getElementById('ref-detail-title').textContent = item.name;
  document.getElementById('ref-detail-symptoms').textContent = '📋 ' + item.symptoms;
  document.getElementById('ref-detail-treatment').innerHTML = '<h3>💊 Рекомендації</h3><p>' + item.treatment + '</p>';
}

// --- Journal ---
function renderJournal() {
  const list = document.getElementById('journal-list');
  if (journal.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px">Ще немає записів</p>';
    return;
  }
  list.innerHTML = journal.map((e,i) => `
    <div class="journal-item">
      <div class="date">${new Date(e.date).toLocaleDateString('uk-UA', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      <h4>${e.title}</h4>
      <p>${e.symptoms.slice(0,80)}${e.symptoms.length > 80 ? '…' : ''}</p>
    </div>
  `).join('');
}

document.getElementById('btn-export').addEventListener('click', () => {
  if (journal.length === 0) { showModal('Журнал порожній', 'Спочатку збережіть результати діагностики.'); return; }
  let text = '📒 Журнал VinoScan\n\n';
  journal.forEach((e,i) => {
    text += `${i+1}. ${new Date(e.date).toLocaleDateString('uk-UA')} — ${e.title}\nСимптоми: ${e.symptoms}\nОбробка: ${e.treatment}\n\n`;
  });
  const blob = new Blob([text], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vinoscan_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (journal.length === 0) return;
  if (confirm('Очистити весь журнал?')) {
    journal = [];
    localStorage.removeItem('vinoscan_journal');
    renderJournal();
  }
});

// --- Helpers ---
function showLoading(on) {
  const card = document.getElementById('result-card');
  if (on) {
    card.classList.remove('hidden');
    card.querySelector('h2').textContent = '⏳ Аналізую фото...';
    document.getElementById('result-desc').textContent = 'Зачекайте, GPT аналізує зображення';
    document.getElementById('treatment-box').classList.add('hidden');
    document.querySelector('.result-actions').style.display = 'none';
  } else {
    document.querySelector('.result-actions').style.display = 'flex';
  }
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function showModal(title, text) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent = text;
  document.getElementById('modal').classList.remove('hidden');
}

// --- Settings ---
const settingsKey = document.getElementById('settings-key');
const settingsStatus = document.getElementById('settings-status');
function updateSettingsUI() {
  const key = localStorage.getItem('vinoscan_api_key');
  if (key) {
    settingsKey.placeholder = 'Введіть новий ключ для заміни';
    settingsStatus.textContent = '✅ Ключ збережено';
  } else {
    settingsKey.placeholder = 'sk-... вставити ключ';
    settingsStatus.textContent = '';
  }
}
updateSettingsUI();
document.getElementById('btn-save-key').addEventListener('click', () => {
  const val = settingsKey.value.trim();
  if (!val) { showModal('Увага', 'Вставте API-ключ у поле'); return; }
  localStorage.setItem('vinoscan_api_key', val);
  settingsKey.value = '';
  updateSettingsUI();
  showModal('Готово', 'API-ключ збережено.');
});
document.getElementById('btn-clear-key').addEventListener('click', () => {
  if (confirm('Видалити API-ключ?')) {
    localStorage.removeItem('vinoscan_api_key');
    settingsKey.value = '';
    updateSettingsUI();
  }
});

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
});
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal').classList.add('hidden');
});