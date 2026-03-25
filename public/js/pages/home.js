App.Pages = App.Pages || {};

App.Pages.home = {
  _fileInput: null,
  _cameraOverlay: null,
  _cameraStream: null,
  _recordingOverlay: null,
  _recordingTimer: null,
  _recordingSeconds: 0,

  _renderActionHint(icon, text) {
    return `
      <span class="home-action-item">
        ${App.UI.Icons.render(icon, 'home-action-icon', { size: 14, strokeWidth: 2 })}
        <span>${text}</span>
      </span>
    `;
  },

  render(container) {
    container.innerHTML = `
      <div class="home-page">
        <div class="home-hero">
          <div class="home-badge">生活灵感捕手</div>
          <div class="home-title">Hi, 主人</div>
          <div class="home-subtitle" id="home-hint">今天有什么好分享的？</div>
        </div>
        <div class="home-center">
          <div class="home-button-glow" aria-hidden="true"></div>
          <div class="pigeon-btn-wrap">
            <div class="pigeon-btn" id="pigeon-btn" aria-label="记录旅程">
              <span class="pigeon-btn-face pigeon-btn-face-idle"><img src="/img/pigeon.png" alt="鸽子" class="pigeon-btn-img"></span>
              <span class="pigeon-btn-face pigeon-btn-face-recording">
                ${App.UI.Icons.render('mic', 'pigeon-record-icon', { size: 60, strokeWidth: 2.1 })}
                <div class="pigeon-rec-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
              </span>
            </div>
          </div>
          <div class="pigeon-rec-info" id="pigeon-rec-info">
            <div class="pigeon-rec-time" id="pigeon-rec-time">00:00</div>
            <div class="pigeon-rec-hint">松开结束 · 上滑取消</div>
          </div>
          <div class="pigeon-hint" id="pigeon-hint">
            ${this._renderActionHint('camera', '上滑拍照')}
            <span class="home-action-divider">·</span>
            ${this._renderActionHint('mic', '长按录音')}
          </div>
          <div class="home-empty-hint" id="home-empty-hint">${App.UI.Icons.render('pen', 'home-tap-icon', { size: 14, strokeWidth: 2.2 })} 单击输入文字</div>
        </div>
      </div>
    `;

    this._fileInput = document.createElement('input');
    this._fileInput.type = 'file';
    this._fileInput.accept = 'image/*';
    this._fileInput.capture = 'environment';
    this._fileInput.multiple = true;
    Object.assign(this._fileInput.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none'
    });
    document.body.appendChild(this._fileInput);
    this._fileInput.addEventListener('change', (e) => this._handlePhotos(e));

    this._updateHint();

    const pigeonBtn = container.querySelector('#pigeon-btn');
    App.UI.GestureRecognizer.attach(pigeonBtn, {
      onTap: () => this._showTextInput(),
      onLongPressStart: () => this._startRecording(),
      onLongPressEnd: () => this._stopRecording(),
      onLongPressCancel: () => this._cancelRecording(),
      onSwipeUp: () => this._openCamera(),
    });

    if (App.State.get('isFirstVisit')) {
      this._showOnboarding();
    }

    return {
      destroy: () => {
        if (this._fileInput && this._fileInput.parentNode) this._fileInput.remove();
        this._closeCustomCamera();
        this._setRecordingState(false);
      }
    };
  },

  async _updateHint() {
    const hint = document.getElementById('home-hint');
    if (!hint) return;
    try {
      const today = App.Utils.userCalendarDateString();
      const records = await App.API.Records.queryByDate(today);
      if (records.length > 0) {
        hint.innerHTML = `今天已记录 <span class="hint-count">${records.length}</span> 条旅程片段`;
      } else {
        hint.textContent = '今天有什么好分享的？';
      }
    } catch (e) {
      hint.textContent = '今天有什么好分享的？';
    }
  },

  _setRecordingState(isRecording) {
    const btn = document.getElementById('pigeon-btn');
    if (!btn) return;
    btn.classList.toggle('is-recording', !!isRecording);
    // 切换录音信息 / 提示文字显示
    const recInfo = document.getElementById('pigeon-rec-info');
    const hint = document.getElementById('pigeon-hint');
    const emptyHint = document.getElementById('home-empty-hint');
    if (recInfo) recInfo.classList.toggle('active', !!isRecording);
    if (hint) hint.style.display = isRecording ? 'none' : '';
    if (emptyHint) emptyHint.style.display = isRecording ? 'none' : '';
  },

  _refreshTimelineIfVisible() {
    if (App.Pages.timeline && App.Pages.timeline._renderList) {
      App.Pages.timeline._renderList();
    }
  },

  _scheduleAddressBackfill(recordId, pos, existingAddress) {
    if (!recordId || existingAddress || !pos) return;
    App.Utils.ensureRecordAddress({
      record_id: recordId,
      latitude: pos.latitude,
      longitude: pos.longitude
    }).then((address) => {
      if (address) this._refreshTimelineIfVisible();
    }).catch(() => {});
  },

  _scheduleBatchAddressBackfill(recordIds, pos, existingAddress) {
    if (!recordIds?.length || existingAddress || !pos) return;
    this._scheduleAddressBackfill(recordIds[0], pos, existingAddress);
    if (recordIds.length === 1) return;
    App.Utils.reverseGeocode(pos.latitude, pos.longitude).then(async (address) => {
      if (!address) return;
      await Promise.allSettled(recordIds.slice(1).map((recordId) => App.API.Records.update(recordId, { address })));
      this._refreshTimelineIfVisible();
    }).catch(() => {});
  },

  _showTextInput() {
    const overlay = document.createElement('div');
    overlay.className = 'text-input-overlay';
    overlay.innerHTML = `
      <div class="text-input-box">
        <textarea placeholder="记录此刻的想法..." autofocus></textarea>
        <input type="file" class="text-input-photo-picker" accept="image/*" multiple hidden>
        <div class="record-photo-preview" hidden></div>
        <div class="text-input-actions">
          <button type="button" class="record-photo-btn">照片上传</button>
          <div class="text-input-action-group">
            <button class="text-input-cancel">取消</button>
            <button class="text-input-send" disabled>发送</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('textarea');
    const sendBtn = overlay.querySelector('.text-input-send');
    const picker = overlay.querySelector('.text-input-photo-picker');
    const uploadBtn = overlay.querySelector('.record-photo-btn');
    const preview = overlay.querySelector('.record-photo-preview');
    let selectedPhotos = [];

    const revokeSelectedPhotos = () => {
      selectedPhotos.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      selectedPhotos = [];
    };

    const closeOverlay = () => {
      revokeSelectedPhotos();
      overlay.remove();
    };

    const renderSelectedPhotos = () => {
      if (!selectedPhotos.length) {
        preview.hidden = true;
        preview.innerHTML = '';
        return;
      }
      preview.hidden = false;
      preview.innerHTML = selectedPhotos.map((item, index) => `
        <div class="record-photo-item">
          <img src="${item.previewUrl}" alt="待上传照片 ${index + 1}">
          <button type="button" class="record-photo-remove" data-index="${index}" aria-label="删除照片">×</button>
        </div>
      `).join('');
      preview.querySelectorAll('.record-photo-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.index);
          const removed = selectedPhotos[index];
          if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
          selectedPhotos.splice(index, 1);
          renderSelectedPhotos();
        });
      });
    };

    const appendPhotos = (files) => {
      if (!files.length) return;
      const remaining = 3 - selectedPhotos.length;
      if (remaining <= 0) {
        App.UI.Toast.show('最多上传 3 张照片', 'info');
        return;
      }
      if (files.length > remaining) {
        App.UI.Toast.show('最多上传 3 张照片，已为你截取前几张', 'info');
      }
      files.slice(0, remaining).forEach((file) => {
        selectedPhotos.push({
          file,
          previewUrl: URL.createObjectURL(file)
        });
      });
      renderSelectedPhotos();
    };

    // 提前开始获取位置，不要等到用户点发送
    let posPromise = App.Utils.getCurrentPosition();

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    overlay.querySelector('.text-input-cancel').addEventListener('click', closeOverlay);
    uploadBtn.addEventListener('click', () => {
      picker.value = '';
      picker.click();
    });
    picker.addEventListener('change', (e) => {
      appendPhotos(Array.from(e.target.files || []));
      picker.value = '';
    });

    const checkEmpty = () => { sendBtn.disabled = !textarea.value.trim(); };
    textarea.addEventListener('input', checkEmpty);
    textarea.addEventListener('compositionend', checkEmpty);
    textarea.addEventListener('keyup', checkEmpty);

    sendBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) return;
      sendBtn.disabled = true;
      sendBtn.textContent = '保存中...';
      uploadBtn.disabled = true;
      try {
        const mediaFilenames = await Promise.all(selectedPhotos.map(async ({ file }) => {
          const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
          const tmpFilename = App.API.FileStore.generateFilename(ext);
          return App.API.FileStore.saveFile(file, tmpFilename);
        }));
        // 使用提前获取的位置，若仍在等待则继续等待
        const pos = await posPromise;
        console.log('[Home] 文字记录定位结果:', pos);
        // 如果没有实时定位，尝试从照片 EXIF 中获取 GPS
        let lat = pos?.latitude ?? null;
        let lon = pos?.longitude ?? null;
        if (lat == null && lon == null && mediaFilenames.length > 0) {
          const exif = await App.API.FileStore.parseExif(mediaFilenames[0]);
          if (exif.latitude != null) lat = exif.latitude;
          if (exif.longitude != null) lon = exif.longitude;
        }
        const recordId = await App.API.Records.create({
          type: 'text',
          content: text,
          mediaFilenames,
          latitude: lat,
          longitude: lon,
          address: null
        });
        const geoPos = (lat != null && lon != null) ? { latitude: lat, longitude: lon } : null;
        this._scheduleAddressBackfill(recordId, geoPos, null);
        closeOverlay();
        App.UI.Toast.show('记录成功', 'success');
        this._updateHint();
      } catch (e) {
        App.UI.Toast.show('保存失败：' + e.message, 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
        uploadBtn.disabled = false;
      }
    });

    setTimeout(() => textarea.focus(), 100);
  },

  async _startRecording() {
    try {
      await App.UI.Recorder.start();
    } catch (e) {
      const msg = (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
        ? '麦克风权限被拒绝，请在浏览器设置中允许访问麦克风'
        : (e.name === 'NotFoundError' ? '未检测到麦克风设备' : '无法访问麦克风：' + e.message);
      App.UI.Toast.show(msg, 'error');
      return;
    }
    // 录音开始时就开始获取位置，不要等到录音结束
    this._recordingPosPromise = App.Utils.getCurrentPosition();
    this._setRecordingState(true);
    this._recordingSeconds = 0;
    // 不再创建全屏遮罩，鸽子按钮已通过 is-recording 状态变为收声模式
    this._recordingTimer = setInterval(() => {
      this._recordingSeconds++;
      const min = String(Math.floor(this._recordingSeconds / 60)).padStart(2, '0');
      const sec = String(this._recordingSeconds % 60).padStart(2, '0');
      const el = document.getElementById('pigeon-rec-time');
      if (el) el.textContent = `${min}:${sec}`;
    }, 1000);
  },

  async _stopRecording() {
    clearInterval(this._recordingTimer);
    this._setRecordingState(false);
    // 重置计时显示
    const timeEl = document.getElementById('pigeon-rec-time');
    if (timeEl) timeEl.textContent = '00:00';
    if (this._recordingSeconds < 1) {
      App.UI.Recorder.cancel();
      App.UI.Toast.show('录音时间太短', 'info');
      return;
    }
    const blob = await App.UI.Recorder.stop();
    if (!blob) return;
    App.UI.Toast.show('正在保存并转写...', 'info');
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const filename = await App.API.FileStore.saveFile(blob, App.API.FileStore.generateFilename(ext));
    // 使用录音开始时就发起的定位请求
    const pos = this._recordingPosPromise ? await this._recordingPosPromise : await App.Utils.getCurrentPosition();
    this._recordingPosPromise = null;
    console.log('[Home] 语音记录定位结果:', pos);

    // 先保存，content 默认待转写
    const recordId = await App.API.Records.create({ type: 'voice', content: '[语音记录，待转写]', mediaFilename: filename, latitude: pos?.latitude ?? null, longitude: pos?.longitude ?? null, address: null });

    App.UI.Toast.show('语音已保存，正在转写...', 'info');
    this._updateHint();

    this._scheduleAddressBackfill(recordId, pos, null);

    // 后台转写，成功后更新 content 并刷新时间轴
    App.AI.transcribeAudio(blob).then(async text => {
      if (text && text.trim()) {
        await App.API.Records.update(recordId, { content: text.trim() });
        App.UI.Toast.show('语音转写完成', 'success');
        this._updateHint();
        // 如果时间轴页面已打开，触发刷新
        if (App.Pages.timeline && App.Pages.timeline._renderList) {
          App.Pages.timeline._renderList();
        }
      }
    }).catch(e => {
      console.error('transcribe error:', e);
      App.UI.Toast.show('转写失败：' + e.message, 'error');
    });
  },

  _cancelRecording() {
    clearInterval(this._recordingTimer);
    App.UI.Recorder.cancel();
    this._setRecordingState(false);
    const timeEl = document.getElementById('pigeon-rec-time');
    if (timeEl) timeEl.textContent = '00:00';
    App.UI.Toast.show('录音已取消', 'info');
  },

  _openCamera() {
    const canUseCustomCamera = /Android/i.test(navigator.userAgent || '') && !!navigator.mediaDevices?.getUserMedia;
    if (canUseCustomCamera) {
      this._openCustomCamera();
      return;
    }
    this._triggerNativeCameraPicker();
  },

  _triggerNativeCameraPicker() {
    if (!this._fileInput) return;
    this._fileInput.value = '';
    try {
      if (typeof this._fileInput.showPicker === 'function') {
        this._fileInput.showPicker();
        return;
      }
    } catch (_) {}
    try {
      this._fileInput.click();
    } catch (_) {
      App.UI.Toast.show('当前浏览器未能直接唤起相机，请点击文字记录里的“照片上传”作为备用入口', 'warning');
    }
  },

  async _openCustomCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      this._cameraStream = stream;

      const overlay = document.createElement('div');
      overlay.className = 'camera-capture-overlay';
      overlay.innerHTML = `
        <div class="camera-capture-box">
          <video class="camera-capture-video" autoplay playsinline muted></video>
          <div class="camera-capture-actions">
            <button type="button" class="camera-cancel-btn">取消</button>
            <button type="button" class="camera-shot-btn">拍照</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      this._cameraOverlay = overlay;

      const video = overlay.querySelector('.camera-capture-video');
      video.srcObject = stream;

      overlay.querySelector('.camera-cancel-btn').addEventListener('click', () => this._closeCustomCamera());
      overlay.querySelector('.camera-shot-btn').addEventListener('click', async () => {
        const file = await this._captureFromCustomCamera(video);
        if (!file) return;
        this._closeCustomCamera();
        App.Router.pushPage('photoPreview', { file });
      });
    } catch (e) {
      this._closeCustomCamera();
      this._triggerNativeCameraPicker();
    }
  },

  async _captureFromCustomCamera(video) {
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) return null;
      const file = new File([blob], `${Date.now()}.jpg`, { type: 'image/jpeg' });
      return file;
    } catch (e) {
      return null;
    }
  },

  _closeCustomCamera() {
    this._cameraStream?.getTracks().forEach((t) => t.stop());
    this._cameraStream = null;
    if (this._cameraOverlay) {
      this._cameraOverlay.remove();
      this._cameraOverlay = null;
    }
  },

  async _handlePhotos(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (files.length === 1) {
      App.Router.pushPage('photoPreview', { file: files[0] });
    } else {
      App.UI.Toast.show(`正在保存 ${files.length} 张照片...`, 'info');
      const pos = await App.Utils.getCurrentPosition();
      const autofillJobs = [];
      const recordIds = [];
      const addressBackfillList = [];
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
        const tmpFilename = App.API.FileStore.generateFilename(ext);
        const filename = await App.API.FileStore.saveFile(file, tmpFilename);
        // 解析 EXIF 信息
        const exif = await App.API.FileStore.parseExif(filename);
        const lat = exif.latitude ?? pos?.latitude;
        const lon = exif.longitude ?? pos?.longitude;
        const recordId = await App.API.Records.create({
          type: 'photo',
          mediaFilename: filename,
          latitude: lat,
          longitude: lon,
          address: null,
          createdAt: exif.dateTime || undefined
        });
        recordIds.push(recordId);
        const geoPos = (lat != null && lon != null) ? { latitude: lat, longitude: lon } : null;
        if (geoPos) addressBackfillList.push({ recordId, pos: geoPos });
        autofillJobs.push(App.AI.fillPhotoCaptionIfNeeded({ recordId, filename }));
      }
      // 逐条回填地址（每张照片可能有不同 GPS）
      for (const item of addressBackfillList) {
        this._scheduleAddressBackfill(item.recordId, item.pos, null);
      }
      App.UI.Toast.show(`${files.length} 张照片已保存`, 'success');
      this._updateHint();
      Promise.allSettled(autofillJobs).catch(() => {});
    }
  },

  _showOnboarding() {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-step active" data-step="0">
        <div class="onboarding-icon"><img src="/img/icon-keyboard.svg" alt="键盘" class="onboarding-icon-img"></div>
        <div class="onboarding-title">点击 — 文字记录</div>
        <div class="onboarding-desc">点一点鸽子，写下你的所见所感。</div>
      </div>
      <div class="onboarding-step" data-step="1">
        <div class="onboarding-icon"><img src="/img/icon-mic.svg" alt="麦克风" class="onboarding-icon-img"></div>
        <div class="onboarding-title">长按 — 语音记录</div>
        <div class="onboarding-desc">长按小鸽子，说出你的碎碎念。</div>
      </div>
      <div class="onboarding-step" data-step="2">
        <div class="onboarding-icon"><img src="/img/icon-camera.svg" alt="照相机" class="onboarding-icon-img"></div>
        <div class="onboarding-title">上滑 — 拍照记录</div>
        <div class="onboarding-desc">滑动小鸽子，拍下旅途记忆。</div>
      </div>
      <div class="onboarding-dots">
        <span class="active"></span><span></span><span></span>
      </div>
      <button class="onboarding-next">下一步</button>
    `;
    document.body.appendChild(overlay);
    let step = 0;
    const steps = overlay.querySelectorAll('.onboarding-step');
    const dots = overlay.querySelectorAll('.onboarding-dots span');
    const btn = overlay.querySelector('.onboarding-next');
    const dismiss = async () => {
      overlay.remove();
      App.State.set('isFirstVisit', false);
      await App.API.Settings.set('is_first_visit', false);
    };
    btn.addEventListener('click', async () => {
      step++;
      if (step >= 3) { await dismiss(); return; }
      steps.forEach(s => s.classList.remove('active'));
      dots.forEach(d => d.classList.remove('active'));
      steps[step].classList.add('active');
      dots[step].classList.add('active');
      if (step === 2) btn.textContent = '开始使用';
    });
    overlay.addEventListener('click', async (e) => { if (e.target === overlay) await dismiss(); });
  }
};
