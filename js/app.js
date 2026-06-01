(function() {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // State
  let currentPhoto = null;
  let currentResult = null;
  let journal = JSON.parse(localStorage.getItem('vinoscan_journal') || '[]');
  let stream = null;

  // DOM refs
  const video = $('#video');
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d');
  const fileInput = $('#file-input');
  const resultCard = $('#result-card');
  const resultTitle = $('#result-title');
  const resultDesc = $('#result-desc');
  const treatmentBox = $('#treatment-box');
  const treatmentText = $('#treatment-text');
  const refList = $('#ref-list');
  const refDetail = $('#ref-detail');
  const refDetailTitle = $('#ref-detail-title');
  const refDetailSymptoms = $('#ref-detail-symptoms');
  const refDetailTreatment = $('#ref-detail-treatment');
  const journalList = $('#journal-list');
  const modal = $('#modal');
  const modalTitle = $('#modal-title');
  const modalText = $('#modal-text');

  // === TABS ===
  $$('.tab').forEach(t => t.addEventListener('click', function() {
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('.tab-content').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
    $(`#tab-${this.dataset.tab}`).classList.add('active');
    if (this.dataset.tab === 'journal') renderJournal();
    if (this.dataset.tab === 'reference') { renderRefList(); $('#ref-detail').classList.add('hidden'); }
  }));

  // === CAMERA ===
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      video.srcObject = stream;
    } catch(e) {
      showModal('Помилка', 'Не вдалося запустити камеру. Перевірте дозволи або використайте галерею.');
    }
  }
  startCamera();

  $('#btn-camera').addEventListener('click', function() {
    if (!video.videoWidth) return showModal('Зачекайте', 'Камера ще не готова. Спробуйте за секунду.');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    currentPhoto = canvas.toDataURL('image/jpeg', 0.8);
    analyzePhoto();
  });

  $('#btn-gallery').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      const img = new Image();
      img.onload = function() {
        canvas.width = Math.min(img.width, 1200);
        canvas.height = img.height * (canvas.width / img.width);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        currentPhoto = canvas.toDataURL('image/jpeg', 0.8);
        analyzePhoto();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // === ANALYSIS ===
  function analyzePhoto() {
    resultCard.classList.remove('hidden');
    $('#btn-camera').disabled = true;
    $('#btn-gallery').disabled = true;
    resultTitle.textContent = '🔍 Аналізую…';
    resultDesc.textContent = 'Обробка зображення…';
    treatmentBox.classList.add('hidden');

    // Simulate analysis (in production — TensorFlow.js or server API)
    const colors = sampleColors(currentPhoto);
    const result = guessDisease(colors);
    currentResult = result;

    resultTitle.textContent = `🔬 ${result.name}`;
    resultDesc.textContent = result.symptoms;
    if (result.treatment) {
      treatmentText.textContent = result.treatment;
      treatmentBox.classList.remove('hidden');
    }
    $('#btn-camera').disabled = false;
    $('#btn-gallery').disabled = false;
  }

  // Simple color-based heuristic (placeholder for real ML)
  function sampleColors(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    const c = document.createElement('canvas');
    const cx = c.getContext('2d');
    c.width = 50; c.height = 50;
    cx.drawImage(img, 0, 0, 50, 50);
    const d = cx.getImageData(0, 0, 50, 50).data;
    let r=0,g=0,b=0,y=0,br=0;
    for (let i=0;i<d.length;i+=4) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; if(d[i+1]>d[i]+20) y++; if(d[i]<80&&d[i+1]>140) br++; }
    const n = d.length/4;
    return { avgR:r/n, avgG:g/n, avgB:b/n, greenPixels:y, brownPixels:br, total:n };
  }

  function guessDisease(colors) {
    const { avgR, avgG, avgB, greenPixels, brownPixels, total } = colors;
    const r = avgR, g = avgG, b = avgB;
    // Yellowish → chlorosis / nitrogen deficiency
    if (g > r + 15 && b < g - 20 && greenPixels/total < 0.3) {
      return { ...getDiseaseById('hloroz'), confidence:'імовірно' };
    }
    // Brown spots → anthracnose / black spot
    if (brownPixels/total > 0.15 && r > g + 10) {
      return { ...getDiseaseById('antraknoz'), confidence:'можливо' };
    }
    // Very pale → nitrogen deficiency
    if (avgR > 160 && avgG > 160 && avgB > 140 && greenPixels/total < 0.4) {
      return { ...getDiseaseById('azot'), confidence:'імовірно' };
    }
    // Reddish edges → potassium / magnesium
    if (r > g + 20 && g - b < 15) {
      return { ...getDiseaseById('caliy'), confidence:'можливо' };
    }
    // Default: mildew (most common)
    return { ...getDiseaseById('mildew'), confidence:'найпоширеніший варіант' };
  }

  $('#btn-save').addEventListener('click', function() {
    if (!currentResult) return;
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      disease: currentResult.name,
      symptoms: currentResult.symptoms,
      treatment: currentResult.treatment,
      photo: currentPhoto
    };
    journal.unshift(entry);
    localStorage.setItem('vinoscan_journal', JSON.stringify(journal));
    showModal('Збережено', 'Запис додано до журналу.');
  });

  $('#btn-new').addEventListener('click', function() {
    resultCard.classList.add('hidden');
    currentResult = null;
    currentPhoto = null;
  });

  // === REFERENCE ===
  function renderRefList(filter) {
    const items = filter ? searchDiseases(filter) : DISEASES;
    refList.innerHTML = items.map(d => `<div class="ref-item" data-id="${d.id}"><h4>${d.name}</h4><p>${d.symptoms.slice(0,70)}…</p></div>`).join('');
    $$('.ref-item').forEach(el => el.addEventListener('click', function() {
      showRefDetail(this.dataset.id);
    }));
  }
  renderRefList();

  $('#ref-search').addEventListener('input', function() {
    renderRefList(this.value);
  });

  function showRefDetail(id) {
    const d = getDiseaseById(id);
    if (!d) return;
    refList.classList.add('hidden');
    refDetail.classList.remove('hidden');
    refDetailTitle.textContent = d.name;
    refDetailSymptoms.textContent = d.symptoms;
    refDetailTreatment.innerHTML = `<h3>💊 Рекомендації з обробки</h3><p>${d.treatment}</p>`;
  }

  $('#ref-back').addEventListener('click', function() {
    refDetail.classList.add('hidden');
    refList.classList.remove('hidden');
  });

  // === JOURNAL ===
  function renderJournal() {
    if (!journal.length) {
      journalList.innerHTML = '<p style="text-align:center;color:#8a9a7a;padding:40px 0">Журнал порожній. Зробіть діагностику та збережіть результат.</p>';
      return;
    }
    journalList.innerHTML = journal.map(e => {
      const d = new Date(e.date);
      const ds = d.toLocaleDateString('uk-UA', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="journal-item"><div class="date">${ds}</div><h4>${e.disease}</h4><p>${e.symptoms.slice(0,80)}…</p></div>`;
    }).join('');
  }

  $('#btn-export').addEventListener('click', function() {
    if (!journal.length) return showModal('Журнал порожній', 'Немає записів для експорту.');
    const text = journal.map((e,i) => {
      const d = new Date(e.date).toLocaleString('uk-UA');
      return `${i+1}. ${d} — ${e.disease}.\n   Симптоми: ${e.symptoms}\n   Обробка: ${e.treatment}`;
    }).join('\n\n');
    const blob = new Blob([text], { type:'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vinoscan_journal_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-clear').addEventListener('click', function() {
    if (!journal.length) return;
    if (confirm('Очистити весь журнал?')) {
      journal = [];
      localStorage.setItem('vinoscan_journal', JSON.stringify(journal));
      renderJournal();
    }
  });

  // === MODAL ===
  function showModal(title, text) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modal.classList.remove('hidden');
  }
  $('#modal-close').addEventListener('click', () => modal.classList.add('hidden'));
  window.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

})();