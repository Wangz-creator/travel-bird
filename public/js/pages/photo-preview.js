App.Pages.photoPreview = {
  render(container, props) {
    const file = props?.file;
    if (!file) { App.Router.popPage(); return { destroy() {} }; }

    const objectURL = URL.createObjectURL(file);
    container.innerHTML = `
      <div class="photo-preview-page">
        <div class="photo-preview-header">
          <button class="back-btn" id="photo-back">←</button>
          <span class="title">照片预览</span>
        </div>
        <div class="photo-preview-img-area">
          <img src="${objectURL}" alt="预览">
        </div>
        <div class="photo-preview-bottom">
          <textarea class="photo-caption-input" placeholder="添加文字说明（可选）..." rows="1"></textarea>
          <div class="photo-preview-actions">
            <button class="photo-retake" id="photo-retake">重拍</button>
            <button class="photo-voice-btn" id="photo-voice">🎤 按住说话</button>
            <button class="photo-confirm" id="photo-save">保存</button>
          </div>
        </div>
      </div>
    `;

    const captionInput = container.querySelector('.photo-caption-input');
    container.querySelector('#photo-back').addEventListener('click', () => { URL.revokeObjectURL(objectURL); App.Router.popPage(); });
    container.querySelector('#photo-retake').addEventListener('click', () => { URL.revokeObjectURL(objectURL); App.Router.popPage(); setTimeout(() => App.Pages.home._openCamera(), 100); });

    let voiceBlob = null;
    let voiceFilename = null;
    let isRecording = false;
    const voiceBtn = container.querySelector('#photo-voice');

    async function startVoiceRecord() {
      if (isRecording) return;
      try {
        await App.UI.Recorder.start();
        isRecording = true;
        voiceBtn.textContent = '🔴 松手停止';
        voiceBtn.style.background = 'rgba(255,107,107,0.4)';
      } catch (e) { App.UI.Toast.show('无法访问麦克风', 'error'); }
    }

    async function stopVoiceRecord() {
      if (!isRecording) return;
      isRecording = false;
      voiceBtn.textContent = '🎤 转写中...';
      voiceBtn.style.background = '';
      voiceBtn.disabled = true;
      const blob = await App.UI.Recorder.stop();
      if (!blob) { voiceBtn.textContent = '🎤 按住说话'; voiceBtn.disabled = false; return; }
      voiceBlob = blob;
      try {
        const text = await App.AI.transcribeAudio(blob);
        if (text && text.trim()) {
          const prev = captionInput.value.trim();
          captionInput.value = prev ? prev + '\n' + text.trim() : text.trim();
          captionInput.style.height = 'auto';
          captionInput.style.height = captionInput.scrollHeight + 'px';
          App.UI.Toast.show('语音已转写', 'success');
        } else {
          App.UI.Toast.show('未识别到语音内容', 'info');
        }
      } catch (e) {
        console.error('photo voice transcribe failed', e);
        App.UI.Toast.show('语音转写失败', 'error');
      }
      voiceBtn.textContent = '🎤 按住说话';
      voiceBtn.disabled = false;
    }

    voiceBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startVoiceRecord(); });
    voiceBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopVoiceRecord(); });
    voiceBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); stopVoiceRecord(); });
    voiceBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startVoiceRecord(); });
    voiceBtn.addEventListener('mouseup', (e) => { e.preventDefault(); stopVoiceRecord(); });

    container.querySelector('#photo-save').addEventListener('click', async () => {
      const saveBtn = container.querySelector('#photo-save');
      const retakeBtn = container.querySelector('#photo-retake');
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      retakeBtn.disabled = true;
      voiceBtn.disabled = true;
      try {
        const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
        const filename = await App.API.FileStore.saveFile(file, App.API.FileStore.generateFilename(ext));
        if (voiceBlob) {
          const voiceExt = voiceBlob.type.includes('mp4') ? 'mp4' : voiceBlob.type.includes('ogg') ? 'ogg' : 'webm';
          voiceFilename = await App.API.FileStore.saveFile(voiceBlob, App.API.FileStore.generateFilename(voiceExt));
        }
        const caption = captionInput.value.trim() || null;

        // 解析 EXIF 信息：拍摄时间和 GPS
        const exif = await App.API.FileStore.parseExif(filename);
        const pos = await App.Utils.getCurrentPosition();

        // EXIF GPS 优先于实时定位
        const lat = exif.latitude ?? pos?.latitude;
        const lon = exif.longitude ?? pos?.longitude;

        const recordId = await App.API.Records.create({
          type: 'photo',
          mediaFilename: filename,
          caption,
          latitude: lat,
          longitude: lon,
          address: null,
          voiceMediaFilename: voiceFilename || undefined,
          createdAt: exif.dateTime || undefined
        });
        const geoPos = (lat != null && lon != null) ? { latitude: lat, longitude: lon } : pos;
        App.Pages.home._scheduleAddressBackfill(recordId, geoPos, null);
        URL.revokeObjectURL(objectURL);
        App.Router.popPage();
        App.UI.Toast.show('照片已保存', 'success');
        App.Pages.home._updateHint();
        App.AI.fillPhotoCaptionIfNeeded({
          recordId,
          filename,
          caption,
          voiceMediaFilename: voiceFilename || undefined
        });
      } catch (e) {
        App.UI.Toast.show('保存失败：' + e.message, 'error');
        saveBtn.disabled = false;
        retakeBtn.disabled = false;
        voiceBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    });

    return { destroy() { URL.revokeObjectURL(objectURL); } };
  }
};
