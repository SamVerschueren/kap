import {remote, ipcRenderer} from 'electron';
import aspectRatio from 'aspectratio';
import moment from 'moment';

// Note: `./` == `/app/dist/renderer/views`, not `js`
import {handleKeyDown, validateNumericInput} from '../js/input-utils';
import {handleTrafficLightsClicks, $, handleActiveButtonGroup} from '../js/utils';
import {init as initErrorReporter} from '../../common/reporter';

const {app} = remote;
const {getShareServices} = remote.require('./plugins').default;

initErrorReporter();

document.addEventListener('DOMContentLoaded', () => {
  const playBtn = $('.js-play-video');
  const pauseBtn = $('.js-pause-video');
  const maximizeBtn = $('.js-maximize-video');
  const unmaximizeBtn = $('.js-unmaximize-video');
  const previewTime = $('.js-video-time');
  const inputHeight = $('.input-height');
  const inputWidth = $('.input-width');
  const fps15Btn = $('#fps-15');
  const fpsMaxBtn = $('#fps-max');
  const loopOffBtn = $('#loop-off');
  const loopOnBtn = $('#loop-on');
  const preview = $('#preview');
  const previewContainer = $('.video-preview');
  const progressBar = $('progress');
  const windowHeader = $('.window-header');

  let maxFps = app.kap.settings.get('fps');
  maxFps = maxFps > 30 ? 30 : maxFps;
  let fps = 15;
  let loop = true;

  let lastValidInputWidth;
  let lastValidInputHeight;
  let aspectRatioBaseValues;

  handleTrafficLightsClicks({hide: true});
  handleActiveButtonGroup({buttonGroup: fps15Btn.parentNode});
  handleActiveButtonGroup({buttonGroup: loopOffBtn.parentNode});

  fpsMaxBtn.children[0].innerText = maxFps;

  preview.oncanplay = function () {
    aspectRatioBaseValues = [this.videoWidth, this.videoHeight];
    [inputWidth.value, inputHeight.value] = aspectRatioBaseValues;
    [lastValidInputWidth, lastValidInputHeight] = aspectRatioBaseValues;

    progressBar.max = preview.duration;
    setInterval(() => {
      progressBar.value = preview.currentTime;
      previewTime.innerText = `${moment().startOf('day').seconds(preview.currentTime).format('m:ss')}`;
    }, 1);

    // Remove the listener since it's called
    // every time the video loops
    preview.oncanplay = undefined;
  };

  pauseBtn.onclick = function () {
    this.classList.add('hidden');
    playBtn.classList.remove('hidden');
    preview.pause();
  };

  playBtn.onclick = function () {
    this.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    preview.play();
  };

  maximizeBtn.onclick = function () {
    this.classList.add('hidden');
    unmaximizeBtn.classList.remove('hidden');
    ipcRenderer.send('toggle-fullscreen-editor-window');
    $('body').classList.add('fullscreen');
  };

  unmaximizeBtn.onclick = function () {
    this.classList.add('hidden');
    maximizeBtn.classList.remove('hidden');
    ipcRenderer.send('toggle-fullscreen-editor-window');
    $('body').classList.remove('fullscreen');
  };

  function shake(el) {
    el.classList.add('shake');

    el.addEventListener('webkitAnimationEnd', () => {
      el.classList.remove('shake');
    });

    return true;
  }

  inputWidth.oninput = function () {
    this.value = validateNumericInput(this, {
      lastValidValue: lastValidInputWidth,
      empty: true,
      max: preview.videoWidth,
      min: 1,
      onInvalid: shake
    });

    const tmp = aspectRatio.resize(...aspectRatioBaseValues, this.value);
    if (tmp[1]) {
      lastValidInputHeight = tmp[1];
      inputHeight.value = tmp[1];
    }

    lastValidInputWidth = this.value || lastValidInputWidth;
  };

  inputWidth.onkeydown = handleKeyDown;

  inputWidth.onblur = function () {
    this.value = this.value || (shake(this) && lastValidInputWidth); // Prevent the input from staying empty
  };

  inputHeight.oninput = function () {
    this.value = validateNumericInput(this, {
      lastValidValue: lastValidInputHeight,
      empty: true,
      max: preview.videoHeight,
      min: 1,
      onInvalid: shake
    });

    const tmp = aspectRatio.resize(...aspectRatioBaseValues, undefined, this.value);
    if (tmp[0]) {
      lastValidInputWidth = tmp[0];
      inputWidth.value = tmp[0];
    }

    lastValidInputHeight = this.value || lastValidInputHeight;
  };

  inputHeight.onkeydown = handleKeyDown;

  inputHeight.onblur = function () {
    this.value = this.value || (shake(this) && lastValidInputHeight); // Prevent the input from staying empty
  };

  fps15Btn.onclick = function () {
    this.classList.add('active');
    fpsMaxBtn.classList.remove('active');
    fps = 15;
  };

  fpsMaxBtn.onclick = function () {
    this.classList.add('active');
    fps15Btn.classList.remove('active');
    fps = maxFps;
  };

  loopOffBtn.onclick = function () {
    this.classList.add('active');
    loopOnBtn.classList.remove('active');
    loop = false;
  };

  loopOnBtn.onclick = function () {
    this.classList.add('active');
    loopOffBtn.classList.remove('active');
    loop = true;
  };

  window.onkeyup = event => {
    if (event.keyCode === 27) { // Esc
      if (maximizeBtn.classList.contains('hidden')) {
        // Exit fullscreen
        unmaximizeBtn.onclick();
      } else {
        ipcRenderer.send('close-editor-window');
      }
    }
  };

  function registerExportButtons() {
    const exportButtons = document.querySelectorAll('.output-format button');
    const shareServices = getShareServices();
    console.log('Share services', shareServices);

    ipcRenderer.on('toggle-format-buttons', (event, data) => {
      for (const btn of exportButtons) {
        btn.disabled = !data.enabled;
      }
    });

    for (const btn of exportButtons) {
      const format = btn.dataset.exportType;
      const dropdown = document.createElement('select');

      let i = 0;
      for (const service of shareServices) {
        if (service.formats.includes(format)) {
          const option = document.createElement('option');
          option.text = service.title;
          option.value = i++;
          dropdown.appendChild(option);
        }
      }

      btn.appendChild(dropdown);

      // Prevent the dropdown from triggering the button
      dropdown.onclick = event => {
        event.stopPropagation();
      };

      btn.onclick = () => { // eslint-disable-line no-loop-func
        const service = shareServices[dropdown.value];
        service.run({
          format,
          filePath: preview.src,
          width: inputWidth.value,
          height: inputHeight.value,
          fps,
          loop
        });
      };
    }
  }

  registerExportButtons();

  ipcRenderer.on('video-src', (event, src) => {
    preview.src = src;
  });

  previewContainer.onmouseover = function () {
    windowHeader.classList.remove('is-hidden');
  };

  previewContainer.onmouseout = function (event) {
    if (!Array.from(windowHeader.querySelectorAll('*')).includes(event.relatedTarget)) {
      windowHeader.classList.add('is-hidden');
    }
  };
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());
